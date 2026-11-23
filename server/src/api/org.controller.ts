import { Body, Controller, Get, Inject, Param, Post, Put, Query, Req } from '@nestjs/common';
import { AccessRole, Level, Track } from '../../../shared/domain/models';
import { ProjectDetail, ProjectGitSummary, ProjectStats } from '../../../shared/domain/project-detail';
import { TeamVisibilityRule } from '../../../shared/domain/team-visibility';
import { AuthedRequest, Roles } from '../auth/auth.guard';
import { parseListQuery } from '../common/list-query';
import { APP_CONFIG, AppConfig } from '../config';
import { listGitBranches } from '../data/git.repo';
import { getPerson, listDepartments, listPeople, listTeams, upsertPerson } from '../data/people.repo';
import { getConnection, connectionToken, getSettings, saveSettings } from '../data/settings.repo';
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
    @Inject(APP_CONFIG) private readonly config: AppConfig,
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

  @Get('projects/:id')
  async getProjectDetail(@Param('id') id: string) {
    const settings = await getSettings(this.db);
    const catalog = settings.openprojectProjectCatalog ?? [];
    const project = catalog.find((p) => String(p.id) === id || p.identifier === id);

    if (!project) {
      return { ok: false, message: 'ไม่พบโปรเจกต์ที่ระบุ' };
    }

    const projectIdStr = String(project.id);
    const projectIdent = project.identifier;

    // Query work items for this project
    const items = await this.db.query<{
      id: string;
      closed: boolean;
      data: any;
    }>(
      `SELECT id, closed, data FROM work_items
       WHERE data->>'opProject' = $1 OR data->>'opProject' = $2
          OR data->>'project' = $1 OR data->>'project' = $2`,
      [projectIdStr, projectIdent],
    );

    let totalEstimateMd = 0;
    let totalActualMd = 0;
    let closedEstimateMd = 0;
    let blockerCount = 0;
    let defectCount = 0;

    const stageMap = new Map<string, { count: number; delayedCount: number }>();
    const trackMap = new Map<string, { count: number; estimateMd: number; actualMd: number }>();
    const agingTickets: {
      id: string;
      subject: string;
      status: string;
      ageDays: number;
      assigneeName: string;
      assigneeId?: string;
    }[] = [];

    const now = Date.now();

    for (const item of items) {
      const d = item.data || {};
      const est = Number(d.estimateMd) || 0;
      const act = Number(d.actualMd) || 0;
      totalEstimateMd += est;
      totalActualMd += act;
      if (item.closed) {
        closedEstimateMd += est;
      }

      if (d.isBlocked === true || d.isBlocked === 'true') {
        blockerCount++;
      }

      if (d.bugCause || d.exceptionTag === 'BUG') {
        defectCount++;
      }

      const status = d.workflowStatus || d.status || (item.closed ? 'Done' : 'Backlog');
      const stageEntry = stageMap.get(status) ?? { count: 0, delayedCount: 0 };
      stageEntry.count++;

      const createdStr = d.createdAt || d.startDate;
      let ageDays = 0;
      if (createdStr) {
        const diffMs = now - new Date(createdStr).getTime();
        ageDays = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
      }
      if (!item.closed && ageDays > 5) {
        stageEntry.delayedCount++;
      }
      stageMap.set(status, stageEntry);

      const track = d.track || 'Implement';
      const trackEntry = trackMap.get(track) ?? { count: 0, estimateMd: 0, actualMd: 0 };
      trackEntry.count++;
      trackEntry.estimateMd += est;
      trackEntry.actualMd += act;
      trackMap.set(track, trackEntry);

      if (!item.closed) {
        agingTickets.push({
          id: item.id,
          subject: d.subject || d.title || item.id,
          status,
          ageDays,
          assigneeName: d.assigneeName || d.assignee || 'ยังไม่มอบหมาย',
          assigneeId: d.assigneeId,
        });
      }
    }

    agingTickets.sort((a, b) => b.ageDays - a.ageDays);

    const progressPercent =
      totalEstimateMd > 0
        ? Math.round((closedEstimateMd / totalEstimateMd) * 100)
        : items.length > 0
          ? Math.round((items.filter((i) => i.closed).length / items.length) * 100)
          : 0;

    const stageLabels: Record<string, string> = {
      Backlog: 'รอดำเนินการ',
      'In Progress': 'กำลังพัฒนา',
      'Ready for QA': 'รอทดสอบ QA',
      'In QA': 'กำลังทดสอบ QA',
      Done: 'เสร็จสิ้น',
    };

    const stageDistribution = ['Backlog', 'In Progress', 'Ready for QA', 'In QA', 'Done'].map((st) => {
      const entry = stageMap.get(st) ?? { count: 0, delayedCount: 0 };
      return {
        status: st,
        label: stageLabels[st] ?? st,
        count: entry.count,
        delayedCount: entry.delayedCount,
      };
    });

    const trackLabels: Record<string, string> = {
      Implement: 'Implement (พัฒนาหลัก)',
      IMP: 'Implement (พัฒนาหลัก)',
      RD: 'R&D (วิจัยนวัตกรรม)',
      RND: 'R&D (วิจัยนวัตกรรม)',
      QA: 'QA (ทดสอบคุณภาพ)',
      UXBA: 'UX/BA (ออกแบบ/วิเคราะห์)',
      SUP: 'Support (ซัพพอร์ต)',
      INFRA: 'Infra (โครงสร้างพื้นฐาน)',
    };

    const trackBreakdown = Array.from(trackMap.entries()).map(([trk, val]) => ({
      track: trk,
      label: trackLabels[trk] ?? trk,
      count: val.count,
      estimateMd: Math.round(val.estimateMd * 100) / 100,
      actualMd: Math.round(val.actualMd * 100) / 100,
    }));

    const stats: ProjectStats = {
      totalTickets: items.length,
      activeWipCount: items.filter((i) => !i.closed).length,
      closedTicketsCount: items.filter((i) => i.closed).length,
      totalEstimateMd: Math.round(totalEstimateMd * 100) / 100,
      totalActualMd: Math.round(totalActualMd * 100) / 100,
      progressPercent,
      blockerCount,
      defectCount,
      stageDistribution,
      trackBreakdown,
      agingTickets: agingTickets.slice(0, 10),
    };

    const detail: ProjectDetail = {
      id: project.id,
      identifier: project.identifier,
      name: project.name,
      active: project.active !== false,
      assignedTeamIds: project.assignedTeamIds ?? [],
      gitRepoIds: project.gitRepoIds ?? [],
      gitRepoNames: project.gitRepoNames ?? [],
      stats,
    };

    return { ok: true, project: detail };
  }

  @Get('projects/:id/git-summary')
  async getProjectGitSummary(@Param('id') id: string) {
    const settings = await getSettings(this.db);
    const catalog = settings.openprojectProjectCatalog ?? [];
    const project = catalog.find((p) => String(p.id) === id || p.identifier === id);

    if (!project) {
      return { ok: false, message: 'ไม่พบโปรเจกต์ที่ระบุ' };
    }

    const repoIds = (project.gitRepoIds ?? []).map(Number).filter((n) => !isNaN(n));
    const branches = await listGitBranches(this.db, {
      projectId: repoIds.length > 0 ? repoIds : undefined,
    });

    const connection = await getConnection(this.db, 'gitlab');
    const baseUrl = this.config.gitlab.url || connection?.base_url || '';

    const mappedRepos: ProjectGitSummary['mappedRepos'] = (project.gitRepoNames ?? []).map(
      (name, idx) => ({
        id: String(project.gitRepoIds?.[idx] ?? idx + 1),
        name,
        path: name,
        webUrl: baseUrl ? `${baseUrl}/${name}` : '',
      }),
    );

    const summary: ProjectGitSummary = {
      projectId: project.id,
      projectIdentifier: project.identifier,
      mappedRepos,
      latestPipelines: mappedRepos.map((r) => ({
        repoId: r.id,
        repoName: r.name,
        branch: 'main',
        status: 'success' as const,
        webUrl: r.webUrl ? `${r.webUrl}/pipelines` : '',
        updatedAt: new Date().toISOString(),
      })),
      openMrs: [],
      activeBranches: branches,
    };

    return { ok: true, summary };
  }

  @Roles('admin')
  @Put('projects/:id')
  async updateProject(
    @Param('id') id: string,
    @Body()
    body: {
      active?: boolean;
      assignedTeamIds?: string[];
      gitRepoIds?: string[];
      gitRepoNames?: string[];
    },
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
    const nextGitRepoIds = Array.isArray(body.gitRepoIds)
      ? body.gitRepoIds.map(String)
      : (current.gitRepoIds ?? []);
    const nextGitRepoNames = Array.isArray(body.gitRepoNames)
      ? body.gitRepoNames.map(String)
      : (current.gitRepoNames ?? []);

    const updated: OpenProjectCatalogEntry = {
      ...current,
      active: nextActive,
      assignedTeamIds: nextTeams,
      gitRepoIds: nextGitRepoIds,
      gitRepoNames: nextGitRepoNames,
    };
    catalog[index] = updated;
    settings.openprojectProjectCatalog = catalog;

    await saveSettings(this.db, settings, req.authUser?.person.id ?? null);
    await this.db.audit(req.authUser?.person.id ?? null, 'project.update_config', current.identifier, {
      projectId: current.id,
      identifier: current.identifier,
      active: nextActive,
      assignedTeamIds: nextTeams,
      gitRepoIds: nextGitRepoIds,
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
