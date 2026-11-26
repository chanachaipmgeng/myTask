import { Body, Controller, ForbiddenException, Get, Inject, Param, Post, Put, Query, Req } from '@nestjs/common';
import { AccessRole, Level, Track } from '../../../shared/domain/models';
import {
  ProjectDetail,
  ProjectGitReleaseItem,
  ProjectGitSummary,
  ProjectStats,
} from '../../../shared/domain/project-detail';
import { computeEffectiveAllowedTeams, TeamVisibilityRule } from '../../../shared/domain/team-visibility';
import { filterPeopleByWorkspace } from '../../../shared/domain/workspace-scope';
import { AuthedRequest, Roles } from '../auth/auth.guard';
import { VisibilityScopeService } from '../auth/visibility-scope.service';
import { compareByField, paginateItems, parseListQuery } from '../common/list-query';
import { APP_CONFIG, AppConfig } from '../config';
import { listGitBranches } from '../data/git.repo';
import { getPerson, listDepartments, listPeople, listTeams, upsertPerson } from '../data/people.repo';
import { deleteSessionsByPerson } from '../data/sessions.repo';
import {
  connectionToken,
  getConnection,
  getSettings,
  saveSettings,
  updateSettingsTransactional,
} from '../data/settings.repo';
import { OpenProjectCatalogEntry } from '../data/types';
import { getVisibilityConfig, setTeamVisibilityMatrix, setUserAllowedTeams } from '../data/visibility.repo';
import { Db } from '../db/db.service';
import { mapPool } from '../common/ttl-cache';
import { GitLabClient } from '../integrations/gitlab/gitlab.client';
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
    private readonly scope: VisibilityScopeService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Get()
  async org(@Req() req: AuthedRequest) {
    const [departments, teams, people, visibility] = await Promise.all([
      listDepartments(this.db),
      listTeams(this.db),
      listPeople(this.db),
      getVisibilityConfig(this.db),
    ]);
    const allowedTeams = req.authUser?.person
      ? computeEffectiveAllowedTeams(req.authUser.person, visibility)
      : null;
    const scopedPeople =
      allowedTeams === null
        ? people
        : filterPeopleByWorkspace(people, { allowedTeams });
    return { departments, teams, people: scopedPeople };
  }

  /** รายชื่อคนแบบแบ่งหน้า (directory ระยะยาว) */
  @Get('people')
  async listPeoplePaged(
    @Req() req: AuthedRequest,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('sort') sort?: string,
    @Query('dir') dir?: string,
    @Query('teamId') teamId?: string,
    @Query('track') track?: string,
    @Query('active') active?: string,
  ) {
    const listQuery = parseListQuery(
      { q, page, pageSize, sort, dir, teamId, track, active },
      { defaultSort: 'nickname', defaultDir: 'asc', defaultPageSize: 25 },
    );
    const includeInactive = listQuery.active === 'inactive' || listQuery.active === 'all';
    const [people, visibility] = await Promise.all([
      listPeople(this.db, !includeInactive),
      getVisibilityConfig(this.db),
    ]);
    const allowedTeams = req.authUser?.person
      ? computeEffectiveAllowedTeams(req.authUser.person, visibility)
      : null;
    let scoped =
      allowedTeams === null
        ? [...people]
        : filterPeopleByWorkspace(people, { allowedTeams });

    if (listQuery.teamId) {
      if (allowedTeams !== null && !allowedTeams.includes(listQuery.teamId)) {
        throw new ForbiddenException('ไม่มีสิทธิ์เข้าถึงข้อมูลทีมนี้');
      }
      scoped = scoped.filter((p) => p.teamId === listQuery.teamId);
    }
    if (listQuery.track && listQuery.track !== 'All') {
      scoped = scoped.filter((p) => String(p.track) === listQuery.track);
    }
    if (listQuery.active === 'inactive') {
      scoped = scoped.filter((p) => p.active === false);
    } else if (listQuery.active === 'active') {
      scoped = scoped.filter((p) => p.active !== false);
    }
    if (listQuery.q) {
      const needle = listQuery.q.toLowerCase();
      scoped = scoped.filter(
        (p) =>
          p.id.toLowerCase().includes(needle) ||
          p.nickname.toLowerCase().includes(needle) ||
          (p.role ?? '').toLowerCase().includes(needle) ||
          (p.jobTitle ?? '').toLowerCase().includes(needle),
      );
    }

    const sortField = listQuery.sort || 'nickname';
    scoped = scoped
      .slice()
      .sort((a, b) => compareByField(a, b, sortField, listQuery.dir));

    const forcedPaging = { ...listQuery, pagingRequested: true };
    const pageResult = paginateItems(scoped, forcedPaging);
    return {
      ...pageResult,
      people: pageResult.items,
      result: pageResult.items,
      count: pageResult.total,
    };
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
      body.track === 'Implement' ||
      body.track === 'RD' ||
      body.track === 'IMP' ||
      body.track === 'RND' ||
      body.track === 'QA' ||
      body.track === 'UXBA' ||
      body.track === 'SUP' ||
      body.track === 'INFRA'
        ? body.track
        : existing.track;

    const saved = await this.db.tx(async (tx) => {
      const person = await upsertPerson(tx, {
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
        await setUserAllowedTeams(tx, id, body.allowedTeams);
      }
      if (nextAccess !== (existing.access ?? 'member')) {
        await deleteSessionsByPerson(tx, id);
      }
      return person;
    });
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
    const saved = await this.db.tx((tx) => setTeamVisibilityMatrix(tx, matrix));
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
    const saved = await this.db.tx((tx) => setUserAllowedTeams(tx, id, teams));
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
    result: AuditLogDto[];
    count: number;
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
      result: items,
      count: total,
      total,
      page: safePage,
      pageSize: listQuery.pageSize,
    };
  }

  @Roles('admin')
  @Get('projects')
  async listProjects(
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('sort') sort?: string,
    @Query('dir') dir?: string,
    @Query('teamId') teamId?: string,
    @Query('active') active?: string,
  ) {
    const listQuery = parseListQuery(
      { q, page, pageSize, sort, dir, teamId, active },
      { defaultSort: 'name', defaultDir: 'asc', defaultPageSize: 12 },
    );
    const settings = await getSettings(this.db);
    const catalog = settings.openprojectProjectCatalog ?? [];

    const stats = await this.db.query<{
      project_key: string;
      total: string | number;
      closed: string | number;
      open_count: string | number;
      closed_est: string | number;
      total_est: string | number;
      next_due: string | null;
    }>(
      `SELECT
         COALESCE(NULLIF(data->>'opProject', ''), NULLIF(data->>'project', ''), '') AS project_key,
         COUNT(id) AS total,
         COUNT(id) FILTER (WHERE closed = true) AS closed,
         COUNT(id) FILTER (WHERE closed = false) AS open_count,
         COALESCE(SUM(CASE WHEN closed THEN COALESCE((data->>'estimateMd')::numeric, 0) ELSE 0 END), 0) AS closed_est,
         COALESCE(SUM(COALESCE((data->>'estimateMd')::numeric, 0)), 0) AS total_est,
         MIN(
           CASE
             WHEN closed = false THEN NULLIF(COALESCE(data->>'firstDueOn', data->>'dueOn'), '')
             ELSE NULL
           END
         ) AS next_due
       FROM work_items
       GROUP BY 1`,
    );

    type ProjectAgg = {
      total: number;
      closed: number;
      open: number;
      closedEst: number;
      totalEst: number;
      nextDue: string | null;
    };
    const statsMap = new Map<string, ProjectAgg>();
    for (const row of stats) {
      if (!row.project_key) continue;
      statsMap.set(row.project_key, {
        total: Number(row.total) || 0,
        closed: Number(row.closed) || 0,
        open: Number(row.open_count) || 0,
        closedEst: Number(row.closed_est) || 0,
        totalEst: Number(row.total_est) || 0,
        nextDue: row.next_due || null,
      });
    }

    const assignees = await this.db.query<{
      project_key: string;
      assignee_id: string;
    }>(
      `SELECT project_key, assignee_id FROM (
         SELECT
           COALESCE(NULLIF(data->>'opProject', ''), NULLIF(data->>'project', ''), '') AS project_key,
           NULLIF(data->>'assigneeId', '') AS assignee_id,
           ROW_NUMBER() OVER (
             PARTITION BY COALESCE(NULLIF(data->>'opProject', ''), NULLIF(data->>'project', ''), '')
             ORDER BY id
           ) AS rn
         FROM work_items
         WHERE closed = false
           AND NULLIF(data->>'assigneeId', '') IS NOT NULL
       ) ranked
       WHERE rn <= 5`,
    );

    const assigneeMap = new Map<string, string[]>();
    for (const row of assignees) {
      if (!row.project_key || !row.assignee_id) continue;
      const list = assigneeMap.get(row.project_key) ?? [];
      if (!list.includes(row.assignee_id)) {
        list.push(row.assignee_id);
      }
      assigneeMap.set(row.project_key, list);
    }

    const resolveAgg = (p: OpenProjectCatalogEntry): ProjectAgg =>
      statsMap.get(p.identifier) ??
      statsMap.get(String(p.id)) ?? {
        total: 0,
        closed: 0,
        open: 0,
        closedEst: 0,
        totalEst: 0,
        nextDue: null,
      };

    let projectsWithStats: OpenProjectCatalogEntry[] = catalog.map((p) => {
      const agg = resolveAgg(p);
      const progressPercent =
        agg.totalEst > 0
          ? Math.round((agg.closedEst / agg.totalEst) * 100)
          : agg.total > 0
            ? Math.round((agg.closed / agg.total) * 100)
            : 0;
      const sampleAssigneeIds =
        assigneeMap.get(p.identifier) ?? assigneeMap.get(String(p.id)) ?? [];
      return {
        ...p,
        activeTicketsCount: agg.open,
        totalTickets: agg.total,
        closedTicketsCount: agg.closed,
        progressPercent,
        sampleAssigneeIds,
        nextDueOn: agg.nextDue,
        assignedTeamIds: Array.isArray(p.assignedTeamIds) ? p.assignedTeamIds : [],
      };
    });

    if (listQuery.active === 'active') {
      projectsWithStats = projectsWithStats.filter((p) => p.active !== false);
    } else if (listQuery.active === 'inactive') {
      projectsWithStats = projectsWithStats.filter((p) => p.active === false);
    }

    if (listQuery.teamId) {
      projectsWithStats = projectsWithStats.filter((p) =>
        (p.assignedTeamIds ?? []).includes(listQuery.teamId!),
      );
    }

    if (listQuery.q) {
      const needle = listQuery.q.toLowerCase();
      projectsWithStats = projectsWithStats.filter(
        (p) =>
          (p.identifier || '').toLowerCase().includes(needle) ||
          (p.name || '').toLowerCase().includes(needle),
      );
    }

    const sortField = listQuery.sort || 'name';
    const allowedSort = new Set([
      'name',
      'identifier',
      'active',
      'activeTicketsCount',
      'totalTickets',
      'closedTicketsCount',
      'progressPercent',
      'nextDueOn',
      'id',
    ]);
    const safeSort = allowedSort.has(sortField) ? sortField : 'name';
    projectsWithStats = projectsWithStats
      .slice()
      .sort((a, b) => compareByField(a, b, safeSort, listQuery.dir));

    // บังคับแบ่งหน้าเสมอ (ไม่คืนทั้งแคตตาล็อกแม้ client ไม่ส่ง page)
    const pageResult = paginateItems(projectsWithStats, listQuery);
    const activeCount = projectsWithStats.filter((p) => p.active !== false).length;
    const openTickets = projectsWithStats.reduce((sum, p) => sum + (p.activeTicketsCount ?? 0), 0);
    const unassignedTeams = projectsWithStats.filter(
      (p) => !p.assignedTeamIds || p.assignedTeamIds.length === 0,
    ).length;

    return {
      ...pageResult,
      projects: pageResult.items,
      result: pageResult.items,
      count: pageResult.total,
      summary: {
        totalProjects: projectsWithStats.length,
        activeProjects: activeCount,
        totalActiveTickets: openTickets,
        unassignedTeamsCount: unassignedTeams,
      },
    };
  }

  @Get('projects/:id')
  async getProjectDetail(@Param('id') id: string, @Req() req: AuthedRequest) {
    const ctx = await this.scope.resolve(req.authUser);
    const settings = await getSettings(this.db);
    const catalog = settings.openprojectProjectCatalog ?? [];
    const project = catalog.find((p) => String(p.id) === id || p.identifier === id);

    if (!project) {
      return { ok: false, message: 'ไม่พบโปรเจกต์ที่ระบุ' };
    }
    if (
      !ctx.isAdmin &&
      ctx.allowedTeams !== null &&
      (project.assignedTeamIds ?? []).length > 0 &&
      !(project.assignedTeamIds ?? []).some((t) => ctx.allowedTeams!.includes(t))
    ) {
      throw new ForbiddenException('ไม่มีสิทธิ์เข้าถึงโปรเจกต์นอกขอบเขตทีม');
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
  async getProjectGitSummary(@Param('id') id: string, @Req() req: AuthedRequest) {
    const ctx = await this.scope.resolve(req.authUser);
    const settings = await getSettings(this.db);
    const catalog = settings.openprojectProjectCatalog ?? [];
    const project = catalog.find((p) => String(p.id) === id || p.identifier === id);

    if (!project) {
      return { ok: false, message: 'ไม่พบโปรเจกต์ที่ระบุ' };
    }
    if (
      !ctx.isAdmin &&
      ctx.allowedTeams !== null &&
      (project.assignedTeamIds ?? []).length > 0 &&
      !(project.assignedTeamIds ?? []).some((t) => ctx.allowedTeams!.includes(t))
    ) {
      throw new ForbiddenException('ไม่มีสิทธิ์เข้าถึงโปรเจกต์นอกขอบเขตทีม');
    }

    const repoIdStrs = (project.gitRepoIds ?? []).map(String).filter(Boolean);
    const repoNames = project.gitRepoNames ?? [];
    const repoIds = repoIdStrs.map(Number).filter((n) => !Number.isNaN(n));
    const allBranches = await listGitBranches(this.db, {
      projectId: repoIds.length > 0 ? repoIds : undefined,
    });
    const branches = allBranches.slice(0, 200);

    const gitlab = await this.resolveGitLabClient();
    const baseUrl = (gitlab?.baseUrl || this.config.gitlab.url || '').replace(/\/+$/, '');

    const mappedRepos: ProjectGitSummary['mappedRepos'] = repoIdStrs.map((repoId, idx) => {
      const fallbackName = repoNames[idx]?.trim() || repoId;
      return {
        id: repoId,
        name: fallbackName,
        path: fallbackName,
        webUrl: baseUrl && fallbackName.includes('/') ? `${baseUrl}/${fallbackName}` : '',
      };
    });

    const releases: ProjectGitReleaseItem[] = [];

    if (gitlab && repoIdStrs.length > 0) {
      await mapPool(repoIdStrs, 3, async (repoId, idx) => {
        const fallbackName = repoNames[idx]?.trim() || repoId;
        const catalogLooksComplete = fallbackName.includes('/') && Boolean(mappedRepos[idx]?.webUrl);
        try {
          let name = fallbackName;
          let path = fallbackName;
          let webUrl = mappedRepos[idx]?.webUrl ?? '';
          if (!catalogLooksComplete) {
            const glProject = await gitlab.client.getProject(repoId);
            name = (glProject.name ?? fallbackName).trim() || fallbackName;
            path = (glProject.path_with_namespace ?? name).trim() || name;
            webUrl = (glProject.web_url ?? '').trim();
          }
          mappedRepos[idx] = { id: repoId, name, path, webUrl };

          const releaseRows = await gitlab.client.listReleases(repoId, { perPage: 8 });
          if (releaseRows.length > 0) {
            for (const rel of releaseRows) {
              const tagName = (rel.tag_name ?? '').trim();
              if (!tagName) continue;
              const releasedAt = (rel.released_at || rel.created_at || '').trim();
              releases.push({
                repoId,
                repoName: name,
                name: (rel.name ?? tagName).trim() || tagName,
                tagName,
                description: stripReleaseDescription(rel.description),
                releasedAt,
                webUrl: webUrl
                  ? `${webUrl.replace(/\/+$/, '')}/-/releases/${encodeURIComponent(tagName)}`
                  : '',
                source: 'release',
              });
            }
          } else {
            const tags = await gitlab.client.listTags(repoId, { perPage: 8 });
            for (const tag of tags) {
              const tagName = (tag.name ?? '').trim();
              if (!tagName) continue;
              const releasedAt = (tag.commit?.created_at ?? '').trim();
              releases.push({
                repoId,
                repoName: name,
                name: tagName,
                tagName,
                description: stripReleaseDescription(tag.message || tag.release?.description),
                releasedAt,
                webUrl: webUrl
                  ? `${webUrl.replace(/\/+$/, '')}/-/tags/${encodeURIComponent(tagName)}`
                  : '',
                source: 'tag',
              });
            }
          }
        } catch {
          // keep catalog fallback for this repo
        }
      });
    }

    releases.sort((a, b) => (b.releasedAt || '').localeCompare(a.releasedAt || ''));

    const summary: ProjectGitSummary = {
      projectId: project.id,
      projectIdentifier: project.identifier,
      mappedRepos,
      releases,
      latestPipelines: mappedRepos.map((r) => ({
        repoId: r.id,
        repoName: r.name,
        branch: 'main',
        status: 'success' as const,
        webUrl: r.webUrl ? `${r.webUrl}/-/pipelines` : '',
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
    const actorId = req.authUser?.person.id ?? null;
    let updated: OpenProjectCatalogEntry | null = null;
    await updateSettingsTransactional(
      this.db,
      (settings) => {
        const catalog = settings.openprojectProjectCatalog ?? [];
        const index = catalog.findIndex((p) => String(p.id) === id || p.identifier === id);
        if (index === -1) {
          return settings;
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

        const nextEntry: OpenProjectCatalogEntry = {
          ...current,
          active: nextActive,
          assignedTeamIds: nextTeams,
          gitRepoIds: nextGitRepoIds,
          gitRepoNames: nextGitRepoNames,
        };
        const nextCatalog = [...catalog];
        nextCatalog[index] = nextEntry;
        settings.openprojectProjectCatalog = nextCatalog;
        updated = nextEntry;
        return settings;
      },
      actorId,
    );

    if (!updated) {
      return { ok: false, message: 'ไม่พบโปรเจกต์ที่ระบุ' };
    }
    const savedProject: OpenProjectCatalogEntry = updated;
    await this.db.audit(actorId, 'project.update_config', savedProject.identifier, {
      projectId: savedProject.id,
      identifier: savedProject.identifier,
      active: savedProject.active,
      assignedTeamIds: savedProject.assignedTeamIds,
      gitRepoIds: savedProject.gitRepoIds,
    });

    return { ok: true, project: savedProject };
  }

  @Roles('admin')
  @Post('projects/sync')
  async syncProjects(@Req() req: AuthedRequest) {
    const client = await this.opSync.getClient();
    if (!client) {
      return { ok: false, message: 'ไม่ได้ตั้งค่าการเชื่อมต่อ myProject (OpenProject)' };
    }

    const liveProjects = await client.listProjects();
    const actorId = req.authUser?.person.id ?? null;
    let merged: OpenProjectCatalogEntry[] = [];
    await updateSettingsTransactional(
      this.db,
      (settings) => {
        const existingByIdentifier = new Map(
          (settings.openprojectProjectCatalog ?? []).map((p) => [p.identifier, p]),
        );
        const existingById = new Map(
          (settings.openprojectProjectCatalog ?? []).map((p) => [p.id, p]),
        );

        const nextCatalog: OpenProjectCatalogEntry[] = liveProjects
          .filter((p) => p.identifier)
          .map((p) => {
            const existing = existingByIdentifier.get(p.identifier ?? '') ?? existingById.get(p.id);
            return {
              id: p.id,
              identifier: p.identifier ?? '',
              name: p.name ?? p.identifier ?? '',
              active: existing !== undefined ? existing.active : (p.active ?? true),
              assignedTeamIds: existing?.assignedTeamIds ?? [],
              gitRepoIds: existing?.gitRepoIds ?? [],
              gitRepoNames: existing?.gitRepoNames ?? [],
            };
          });

        const liveIds = new Set(liveProjects.map((p) => p.id));
        for (const p of settings.openprojectProjectCatalog ?? []) {
          if (!liveIds.has(p.id) && p.identifier) {
            nextCatalog.push(p);
          }
        }

        settings.openprojectProjectCatalog = nextCatalog;
        merged = nextCatalog;
        return settings;
      },
      actorId,
    );
    await this.db.audit(actorId, 'project.sync_catalog', null, {
      totalSynced: merged.length,
    });

    return { ok: true, total: merged.length, projects: merged };
  }

  private async resolveGitLabClient(): Promise<{
    client: GitLabClient;
    baseUrl: string;
  } | null> {
    const connection = await getConnection(this.db, 'gitlab');
    const storedBase = (connection?.base_url ?? '').split('#')[0]?.trim() ?? '';
    const baseUrl = (this.config.gitlab.url || storedBase).replace(/\/+$/, '');
    const token = this.config.gitlab.apiToken || connectionToken(connection, this.config.tokenEncKey);
    if (!baseUrl || !token) {
      return null;
    }
    return { client: new GitLabClient(baseUrl, token), baseUrl };
  }
}

function stripReleaseDescription(raw: string | null | undefined): string {
  if (!raw) return '';
  return raw
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
}
