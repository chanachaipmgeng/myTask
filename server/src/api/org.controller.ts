import { Body, Controller, Get, Param, Post, Put, Query, Req } from '@nestjs/common';
import { AccessRole, Level, Track } from '../../../shared/domain/models';
import { TeamVisibilityRule } from '../../../shared/domain/team-visibility';
import { AuthedRequest, Roles } from '../auth/auth.guard';
import { parseListQuery } from '../common/list-query';
import { getPerson, listDepartments, listPeople, listTeams, upsertPerson } from '../data/people.repo';
import { getSettings, saveSettings } from '../data/settings.repo';
import { OpenProjectCatalogEntry } from '../data/types';
import { getVisibilityConfig, setTeamVisibilityMatrix, setUserAllowedTeams } from '../data/visibility.repo';
import { Db } from '../db/db.service';
import { OpenProjectSyncService } from '../integrations/openproject/openproject.sync';

export interface AuditLogDto {
  id: number;
  actorId: string | null;
  actorName: string;
  action: string;
  target: string | null;
  detail: string;
  createdAt: string;
}

@Controller('api/org')
export class OrgController {
  constructor(
    private readonly db: Db,
    private readonly opSync: OpenProjectSyncService,
  ) {}

  @Get()
  async org() {
    const [departments, teams, people] = await Promise.all([
      listDepartments(this.db),
      listTeams(this.db),
      listPeople(this.db),
    ]);
    return { departments, teams, people };
  }

  @Roles('admin')
  @Put('people/:id')
  async updatePerson(
    @Param('id') id: string,
    @Body()
    body: {
      access?: AccessRole;
      level?: Level;
      track?: Track;
      gitlabUsername?: string | null;
      openprojectUserId?: number | null;
      allowedTeams?: string[];
    },
    @Req() req: AuthedRequest,
  ) {
    const existing = await getPerson(this.db, id);
    if (!existing) {
      return { ok: false, message: 'ไม่พบพนักงาน' };
    }
    const nextAccess: AccessRole =
      body.access === 'admin' || body.access === 'lead' || body.access === 'member'
        ? body.access
        : (existing.access ?? 'member');
    const nextLevel: Level =
      body.level === 'Senior' || body.level === 'Mid' || body.level === 'Junior' || body.level === 'FirstMonth'
        ? body.level
        : existing.level;
    const nextTrack: Track =
      body.track === 'Implement' || body.track === 'RD' ? body.track : existing.track;

    const saved = await upsertPerson(this.db, {
      ...existing,
      access: nextAccess,
      level: nextLevel,
      track: nextTrack,
      gitlabUsername:
        body.gitlabUsername !== undefined ? body.gitlabUsername?.trim() || null : existing.gitlabUsername,
      openprojectUserId:
        body.openprojectUserId !== undefined ? body.openprojectUserId : existing.openprojectUserId,
    });
    if (Array.isArray(body.allowedTeams)) {
      await setUserAllowedTeams(this.db, id, body.allowedTeams);
    }
    await this.db.audit(req.authUser?.person.id ?? null, 'person.update_access', id, {
      access: nextAccess,
      level: nextLevel,
      track: nextTrack,
      gitlabUsername: saved.gitlabUsername,
      allowedTeams: body.allowedTeams,
    });
    return { ok: true, person: saved };
  }

  @Roles('admin', 'lead')
  @Get('visibility')
  async getVisibility() {
    return getVisibilityConfig(this.db);
  }

  @Roles('admin')
  @Put('visibility/matrix')
  async updateVisibilityMatrix(
    @Body() body: { matrix: TeamVisibilityRule[] },
    @Req() req: AuthedRequest,
  ) {
    const matrix = Array.isArray(body.matrix) ? body.matrix : [];
    const saved = await setTeamVisibilityMatrix(this.db, matrix);
    await this.db.audit(req.authUser?.person.id ?? null, 'visibility.update_matrix', null, {
      rulesCount: saved.length,
    });
    return { ok: true, matrix: saved };
  }

  @Roles('admin')
  @Put('visibility/user/:id')
  async updateUserAllowedTeams(
    @Param('id') id: string,
    @Body() body: { allowedTeams: string[] },
    @Req() req: AuthedRequest,
  ) {
    const teams = Array.isArray(body.allowedTeams) ? body.allowedTeams : [];
    const saved = await setUserAllowedTeams(this.db, id, teams);
    await this.db.audit(req.authUser?.person.id ?? null, 'visibility.update_user', id, {
      allowedTeams: saved,
    });
    return { ok: true, allowedTeams: saved };
  }

  @Roles('admin')
  @Get('audit-logs')
  async auditLogs(
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('sort') sort?: string,
    @Query('dir') dir?: string,
  ): Promise<{
    logs: AuditLogDto[];
    items: AuditLogDto[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const listQuery = parseListQuery(
      { q, page, pageSize, sort, dir },
      { defaultSort: 'id', defaultDir: 'desc', defaultPageSize: 25 },
    );
    const sortField =
      listQuery.sort === 'createdAt' || listQuery.sort === 'at'
        ? 'a.at'
        : listQuery.sort === 'actorName'
          ? 'p.nickname'
          : listQuery.sort === 'action'
            ? 'a.action'
            : listQuery.sort === 'target'
              ? 'a.target'
              : 'a.id';
    const orderDir = listQuery.dir === 'asc' ? 'ASC' : 'DESC';
    const needle = listQuery.q.toLowerCase();
    const params: unknown[] = [];
    let whereSql = '';
    if (needle) {
      params.push(`%${needle}%`);
      whereSql = `WHERE (
        COALESCE(a.action, '') ILIKE $1
        OR COALESCE(a.target, '') ILIKE $1
        OR COALESCE(p.nickname, '') ILIKE $1
        OR COALESCE(a.detail::text, '') ILIKE $1
      )`;
    }
    const countRows = await this.db.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total
       FROM audit_log a
       LEFT JOIN people p ON p.id = a.actor_id
       ${whereSql}`,
      params,
    );
    const total = Number(countRows[0]?.total ?? 0);
    const pageCount = Math.max(1, Math.ceil(total / listQuery.pageSize));
    const safePage = Math.min(listQuery.page, pageCount);
    const offset = (safePage - 1) * listQuery.pageSize;
    const limitParam = params.length + 1;
    const offsetParam = params.length + 2;
    const rows = await this.db.query<{
      id: number;
      actor_id: string | null;
      actor_name: string | null;
      action: string;
      target: string | null;
      detail: unknown;
      created_at: Date | string;
    }>(
      `SELECT a.id, a.actor_id, p.nickname AS actor_name, a.action, a.target, a.detail, a.at AS created_at
       FROM audit_log a
       LEFT JOIN people p ON p.id = a.actor_id
       ${whereSql}
       ORDER BY ${sortField} ${orderDir}
       LIMIT $${limitParam} OFFSET $${offsetParam}`,
      [...params, listQuery.pageSize, offset],
    );
    const items = rows.map((row) => ({
      id: Number(row.id),
      actorId: row.actor_id,
      actorName: row.actor_name ?? row.actor_id ?? 'ระบบ',
      action: row.action,
      target: row.target,
      detail: typeof row.detail === 'string' ? row.detail : JSON.stringify(row.detail ?? {}),
      createdAt:
        row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at ?? ''),
    }));
    return {
      logs: items,
      items,
      total,
      page: safePage,
      pageSize: listQuery.pageSize,
    };
  }

  @Roles('admin')
  @Get('projects')
  async listProjects(): Promise<{ projects: OpenProjectCatalogEntry[] }> {
    const settings = await getSettings(this.db);
    const catalog = settings.openprojectProjectCatalog ?? [];

    const counts = await this.db.query<{ project_key: string; count: string | number }>(
      `SELECT 
         COALESCE(NULLIF(data->>'opProject', ''), NULLIF(data->>'project', ''), '') AS project_key,
         COUNT(id) AS count
       FROM work_items
       WHERE closed = false
       GROUP BY 1`
    );

    const countMap = new Map<string, number>();
    for (const row of counts) {
      if (row.project_key) {
        countMap.set(row.project_key, Number(row.count) || 0);
      }
    }

    const projectsWithStats: OpenProjectCatalogEntry[] = catalog.map((p) => {
      const activeTicketsCount =
        countMap.get(p.identifier) ?? countMap.get(String(p.id)) ?? 0;
      return {
        ...p,
        activeTicketsCount,
        assignedTeamIds: Array.isArray(p.assignedTeamIds) ? p.assignedTeamIds : [],
      };
    });

    return { projects: projectsWithStats };
  }

  @Roles('admin')
  @Put('projects/:id')
  async updateProject(
    @Param('id') id: string,
    @Body() body: { active?: boolean; assignedTeamIds?: string[] },
    @Req() req: AuthedRequest,
  ) {
    const settings = await getSettings(this.db);
    const catalog = settings.openprojectProjectCatalog ?? [];
    const index = catalog.findIndex((p) => String(p.id) === id || p.identifier === id);

    if (index === -1) {
      return { ok: false, message: 'ไม่พบโปรเจกต์ที่ระบุ' };
    }

    const current = catalog[index]!;
    const nextActive = typeof body.active === 'boolean' ? body.active : current.active;
    const nextTeams = Array.isArray(body.assignedTeamIds)
      ? body.assignedTeamIds.map(String)
      : (current.assignedTeamIds ?? []);

    const updated: OpenProjectCatalogEntry = {
      ...current,
      active: nextActive,
      assignedTeamIds: nextTeams,
    };
    catalog[index] = updated;
    settings.openprojectProjectCatalog = catalog;

    await saveSettings(this.db, settings, req.authUser?.person.id ?? null);
    await this.db.audit(req.authUser?.person.id ?? null, 'project.update_config', current.identifier, {
      projectId: current.id,
      identifier: current.identifier,
      active: nextActive,
      assignedTeamIds: nextTeams,
    });

    return { ok: true, project: updated };
  }

  @Roles('admin')
  @Post('projects/sync')
  async syncProjects(@Req() req: AuthedRequest) {
    const client = await this.opSync.getClient();
    if (!client) {
      return { ok: false, message: 'ไม่ได้ตั้งค่าการเชื่อมต่อ myProject (OpenProject)' };
    }

    const liveProjects = await client.listProjects();
    const settings = await getSettings(this.db);
    const existingByIdentifier = new Map(
      (settings.openprojectProjectCatalog ?? []).map((p) => [p.identifier, p])
    );
    const existingById = new Map(
      (settings.openprojectProjectCatalog ?? []).map((p) => [p.id, p])
    );

    const merged: OpenProjectCatalogEntry[] = liveProjects
      .filter((p) => p.identifier)
      .map((p) => {
        const existing = existingByIdentifier.get(p.identifier ?? '') ?? existingById.get(p.id);
        return {
          id: p.id,
          identifier: p.identifier ?? '',
          name: p.name ?? p.identifier ?? '',
          active: existing !== undefined ? existing.active : (p.active ?? true),
          assignedTeamIds: existing?.assignedTeamIds ?? [],
        };
      });

    const liveIds = new Set(liveProjects.map((p) => p.id));
    for (const p of settings.openprojectProjectCatalog ?? []) {
      if (!liveIds.has(p.id) && p.identifier) {
        merged.push(p);
      }
    }

    settings.openprojectProjectCatalog = merged;
    await saveSettings(this.db, settings, req.authUser?.person.id ?? null);
    await this.db.audit(req.authUser?.person.id ?? null, 'project.sync_catalog', null, {
      totalSynced: merged.length,
    });

    return { ok: true, total: merged.length, projects: merged };
  }
}
