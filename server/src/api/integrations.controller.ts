import { Body, Controller, Get, Put, Post, Query, Req, UnauthorizedException } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { Ticket } from '../../../shared/domain/models';
import { collectAlerts, projectedActual } from '../../../shared/domain/alerts';
import {
  extractTicketIdFromText,
  GitLabMergeRequestRaw,
  mapGitLabMergeRequests,
} from '../../../shared/domain/gitlab-mr';
import { formatMd, scoreTicket } from '../../../shared/domain/scoring';
import { AuthedRequest, Public, Roles } from '../auth/auth.guard';
import { APP_CONFIG, AppConfig } from '../config';
import { listPeople, listUnmappedOpUsers, setPersonOpenProjectUser } from '../data/people.repo';
import {
  connectionToken,
  getConnection,
  getSettings,
  saveSettings,
  upsertConnection,
} from '../data/settings.repo';
import {
  finishSyncRun,
  listSyncRuns,
  listWorkItems,
  startSyncRun,
  upsertWorkItem,
} from '../data/work-items.repo';
import { Db } from '../db/db.service';
import { CiStatus, GitLabClient } from '../integrations/gitlab/gitlab.client';
import { isoDurationToHours, validateMapping } from '../integrations/openproject/openproject.mapper';
import { OpenProjectSyncService } from '../integrations/openproject/openproject.sync';

@Controller('api')
export class IntegrationsController {
  constructor(
    private readonly db: Db,
    private readonly syncService: OpenProjectSyncService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Get('integrations/openproject')
  async getOpenProject() {
    const [settings, connection, runs, unmapped, people] = await Promise.all([
      getSettings(this.db),
      getConnection(this.db, 'openproject'),
      listSyncRuns(this.db, 'openproject', 10),
      listUnmappedOpUsers(this.db),
      listPeople(this.db, false),
    ]);
    const envConfigured = Boolean(this.config.openproject.url && this.config.openproject.token);
    const hasDbToken = Boolean(connection?.token_enc);
    return {
      configured: envConfigured || Boolean(connection?.base_url && (hasDbToken || this.config.openproject.token)),
      enabled: envConfigured || Boolean(connection?.enabled),
      writeback: this.config.openproject.writeback,
      teamStaging: this.config.openproject.teamStaging,
      baseUrl: this.config.openproject.url || connection?.base_url || '',
      hasToken: envConfigured || hasDbToken,
      mapping: settings.openprojectMapping,
      projectCatalog: settings.openprojectProjectCatalog,
      hoursPerMd: settings.hoursPerMd,
      lastRuns: runs,
      unmappedUsers: unmapped.map((row) => ({
        opUserId: row.op_user_id,
        name: row.name,
        login: row.login,
        email: row.email,
        lastSeen: row.last_seen,
      })),
      people: people.map((person) => ({
        id: person.id,
        nickname: person.nickname,
        openprojectUserId: person.openprojectUserId ?? null,
      })),
    };
  }

  @Put('integrations/openproject')
  @Roles('admin')
  async putOpenProject(
    @Body()
    body: {
      baseUrl?: string;
      token?: string;
      enabled?: boolean;
      mapping?: unknown;
      hoursPerMd?: number;
    },
    @Req() req: AuthedRequest,
  ) {
    if (body.mapping !== undefined) {
      const checked = validateMapping(body.mapping);
      if (!checked.mapping) {
        return { ok: false, errors: checked.errors };
      }
      const settings = await getSettings(this.db);
      settings.openprojectMapping = checked.mapping;
      if (typeof body.hoursPerMd === 'number') {
        settings.hoursPerMd = body.hoursPerMd;
      }
      await saveSettings(this.db, settings, req.authUser?.person.id ?? null);
    } else if (typeof body.hoursPerMd === 'number') {
      const settings = await getSettings(this.db);
      settings.hoursPerMd = body.hoursPerMd;
      await saveSettings(this.db, settings, req.authUser?.person.id ?? null);
    }

    if (body.baseUrl !== undefined || body.token !== undefined || body.enabled !== undefined) {
      const existing = await getConnection(this.db, 'openproject');
      await upsertConnection(this.db, {
        id: 'openproject',
        baseUrl: body.baseUrl ?? existing?.base_url ?? this.config.openproject.url ?? '',
        token: body.token === undefined ? null : body.token,
        enabled: body.enabled ?? existing?.enabled ?? true,
        updatedBy: req.authUser?.person.id ?? null,
        encKey: this.config.tokenEncKey,
      });
    }

    return this.getOpenProject();
  }

  @Post('integrations/openproject/sync')
  @Roles('admin', 'lead', 'member')
  async syncNow(@Req() req: AuthedRequest) {
    const result = await this.syncService.sync('manual', req.authUser?.person.id ?? null);
    return { ok: result.status === 'success', ...result };
  }

  @Public()
  @Post('integrations/openproject/sync-users')
  async syncUsers(@Req() req: AuthedRequest) {
    if (!req.authUser && !this.config.devLogin) {
      throw new UnauthorizedException('login required');
    }
    const result = await this.syncService.syncUsers(req.authUser?.person.id ?? 'manual');
    return { ok: result.errors.length === 0, ...result };
  }

  @Put('integrations/openproject/user-map')
  @Roles('admin')
  async mapUser(
    @Body() body: { personId?: string; opUserId?: number | null },
    @Req() req: AuthedRequest,
  ) {
    if (!body.personId) {
      return { ok: false, message: 'personId required' };
    }
    await setPersonOpenProjectUser(this.db, body.personId, body.opUserId ?? null);
    await this.db.audit(req.authUser?.person.id ?? null, 'openproject.user_map', body.personId, {
      opUserId: body.opUserId ?? null,
    });
    return this.getOpenProject();
  }

  @Get('sync-runs')
  async syncRuns(@Query('connection') connection = 'openproject') {
    return { runs: await listSyncRuns(this.db, connection, 30) };
  }

  /** Dev helper: whether a DB-stored token decrypts (never returns the secret). */
  @Get('integrations/openproject/token-check')
  @Roles('admin')
  async tokenCheck() {
    const row = await getConnection(this.db, 'openproject');
    try {
      const token = this.config.openproject.token || connectionToken(row, this.config.tokenEncKey);
      return { ok: Boolean(token), source: this.config.openproject.token ? 'env' : row?.token_enc ? 'db' : 'none' };
    } catch {
      return { ok: false, source: 'error' };
    }
  }

  @Get('integrations/gitlab')
  async getGitLab() {
    const [connection, runs] = await Promise.all([
      getConnection(this.db, 'gitlab'),
      listSyncRuns(this.db, 'gitlab', 10),
    ]);
    const stored = parseGitLabBaseUrl(connection?.base_url ?? '');
    const baseUrl = this.config.gitlab.url || stored.baseUrl;
    const projectIds =
      this.config.gitlab.projectIds.length > 0 ? this.config.gitlab.projectIds : stored.projectIds;
    const hasToken = Boolean(this.config.gitlab.apiToken || connection?.token_enc);
    const configured = Boolean(baseUrl && hasToken && projectIds.length > 0);
    return {
      configured,
      enabled: Boolean(this.config.gitlab.apiToken || connection?.enabled),
      baseUrl,
      projectIds,
      hasToken,
      lastRuns: runs,
    };
  }

  @Put('integrations/gitlab')
  @Roles('admin')
  async putGitLab(
    @Body()
    body: {
      baseUrl?: string;
      projectIds?: string[];
      token?: string;
      enabled?: boolean;
    },
    @Req() req: AuthedRequest,
  ) {
    const existing = await getConnection(this.db, 'gitlab');
    const prev = parseGitLabBaseUrl(existing?.base_url ?? '');
    const baseUrl = (body.baseUrl ?? prev.baseUrl ?? this.config.gitlab.url ?? '').trim().replace(/\/+$/, '');
    const projectIds = (body.projectIds ?? prev.projectIds)
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
    await upsertConnection(this.db, {
      id: 'gitlab',
      baseUrl: encodeGitLabBaseUrl(baseUrl, projectIds),
      token: body.token === undefined ? null : body.token,
      enabled: body.enabled ?? existing?.enabled ?? true,
      updatedBy: req.authUser?.person.id ?? null,
      encKey: this.config.tokenEncKey,
    });
    await this.db.audit(req.authUser?.person.id ?? null, 'gitlab.config', 'gitlab', {
      baseUrl,
      projectIds,
      enabled: body.enabled ?? existing?.enabled ?? true,
    });
    return this.getGitLab();
  }

  @Post('integrations/gitlab/sync')
  @Roles('admin', 'lead', 'member')
  async syncGitLab(@Req() req: AuthedRequest) {
    const resolved = await this.resolveGitLab();
    if (!resolved) {
      return {
        ok: false,
        message: 'ยังไม่ได้ตั้งค่า GitLab URL, Project IDs หรือ API Token ในหน้า Integrations หรือ .env',
      };
    }
    const { client, projectIds } = resolved;
    if (projectIds.length === 0) {
      return {
        ok: false,
        message: 'ยังไม่ได้ตั้งค่า GitLab Project IDs ในหน้า Integrations หรือ .env',
      };
    }

    const actor = req.authUser?.person.id ?? null;
    const runId = await startSyncRun(this.db, {
      connection: 'gitlab',
      trigger: 'manual',
      startedBy: actor,
      since: null,
    });

    const errors: string[] = [];
    const rawMrs: GitLabMergeRequestRaw[] = [];
    for (const projectId of projectIds) {
      try {
        const items = await client.listMergeRequests(projectId, { state: 'merged' });
        for (const mr of items) {
          if (mr.iid) {
            try {
              const approvals = await client.getMrApprovals(projectId, mr.iid);
              if (Array.isArray(approvals.approved_by)) {
                mr.approved_by = approvals.approved_by;
              }
            } catch {
              // Ignore approval fetch error per MR
            }
          }
        }
        rawMrs.push(...items);
      } catch (err) {
        errors.push(`Project ${projectId}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    const mappedCommits = mapGitLabMergeRequests(rawMrs);
    const tickets = await listWorkItems(this.db);
    const byId = new Map(tickets.map((ticket) => [ticket.id.toUpperCase(), ticket]));
    let updated = 0;
    let unchanged = 0;
    const matched = [];
    const unmatched = [];

    for (const commit of mappedCommits) {
      const target = commit.ticketId ? byId.get(commit.ticketId.toUpperCase()) : undefined;
      if (!target) {
        unmatched.push({
          sha: commit.sha,
          message: commit.message,
          mergedAt: commit.mergedAt,
          ticketId: commit.ticketId,
        });
        continue;
      }
      const reviewBefore = scoreTicket(target).review;
      const peerCredit = target.estimateMd ? Math.round(target.estimateMd * 0.1 * 100) / 100 : 0;
      const nextTicket: Ticket = {
        ...target,
        reviewRounds: commit.reviewRounds,
        reopenCount: commit.reopenCount > 0 ? commit.reopenCount : target.reopenCount,
        mrLink: commit.mrLink || target.mrLink,
        reviewers: commit.reviewers || target.reviewers,
        approvedBy: commit.approvedBy || target.approvedBy,
        peerReviewCreditMd: peerCredit,
      };
      const reviewAfter = scoreTicket(nextTicket).review;
      if (
        nextTicket.reviewRounds !== target.reviewRounds ||
        nextTicket.reopenCount !== target.reopenCount ||
        nextTicket.mrLink !== target.mrLink ||
        JSON.stringify(nextTicket.approvedBy) !== JSON.stringify(target.approvedBy)
      ) {
        await upsertWorkItem(this.db, nextTicket, new Date());
        byId.set(target.id.toUpperCase(), nextTicket);
        updated += 1;
      } else {
        unchanged += 1;
      }
      matched.push({
        sha: commit.sha,
        message: commit.message,
        mergedAt: commit.mergedAt,
        ticketId: target.id,
        reviewRounds: nextTicket.reviewRounds,
        reopenCount: nextTicket.reopenCount,
        reviewBefore,
        reviewAfter,
        mrLink: nextTicket.mrLink,
      });
    }

    const status = errors.length > 0 && matched.length === 0 ? 'failed' : 'success';
    await finishSyncRun(this.db, runId, {
      status,
      added: matched.length,
      updated,
      unchanged,
      errors,
    });
    await this.db.audit(actor, 'gitlab.sync', 'gitlab', {
      runId,
      status,
      matched: matched.length,
      unmatched: unmatched.length,
      updated,
    });

    return {
      ok: status === 'success',
      runId,
      commits: mappedCommits,
      matched,
      unmatched,
      updated,
      errors,
    };
  }

  @Get('integrations/gitlab/open-mrs')
  @Roles('admin', 'lead', 'member')
  async openMrs(
    @Query('assignedToMe') assignedToMe: string | undefined,
    @Req() req: AuthedRequest,
  ) {
    const resolved = await this.resolveGitLab();
    if (!resolved) {
      return { source: 'offline' as const, items: [], message: 'ยังไม่ได้ตั้งค่า GitLab' };
    }
    const { client, projectIds } = resolved;
    const me = req.authUser?.person.gitlabUsername?.trim().toLowerCase() ?? '';
    const onlyMine = assignedToMe === '1' || assignedToMe === 'true';

    type OpenMrRow = {
      projectId: string;
      iid: number;
      title: string;
      webUrl: string;
      author: string;
      reviewers: string[];
      ticketId: string;
      ageHours: number;
      ciStatus: CiStatus;
      createdAt: string;
      updatedAt: string;
    };

    const items: OpenMrRow[] = [];
    const errors: string[] = [];
    const now = Date.now();

    const collect = async (projectId: string, mrs: GitLabMergeRequestRaw[]) => {
      for (const mr of mrs) {
        if (!mr.iid) continue;
        const reviewers = (mr.reviewers ?? [])
          .map((r) => r.username?.trim().toLowerCase())
          .filter((u): u is string => Boolean(u));
        if (onlyMine && me && !reviewers.includes(me)) {
          continue;
        }
        let ciStatus: CiStatus = 'unknown';
        try {
          const pipelines = await client.getMrPipelines(projectId, mr.iid);
          ciStatus = GitLabClient.latestCiStatus(pipelines);
        } catch {
          // keep unknown
        }
        const createdAt = String((mr as { created_at?: string }).created_at ?? mr.merged_at ?? '');
        const updatedAt = String((mr as { updated_at?: string }).updated_at ?? createdAt);
        const ageMs = createdAt ? Math.max(0, now - new Date(createdAt).getTime()) : 0;
        items.push({
          projectId: String(projectId),
          iid: mr.iid,
          title: (mr.title ?? '').trim() || `!${mr.iid}`,
          webUrl: (mr.web_url ?? '').trim(),
          author: String((mr as { author?: { username?: string } }).author?.username ?? ''),
          reviewers,
          ticketId:
            extractTicketIdFromText(mr.title) ||
            extractTicketIdFromText(mr.source_branch) ||
            extractTicketIdFromText(mr.description),
          ageHours: Math.round((ageMs / 3_600_000) * 10) / 10,
          ciStatus,
          createdAt,
          updatedAt,
        });
      }
    };

    try {
      if (onlyMine && me) {
        const mrs = await client.listOpenMergeRequests({ reviewerUsername: me });
        // Group-level API may omit project id — fall back to configured projects if empty
        if (mrs.length > 0) {
          const byProject = new Map<string, GitLabMergeRequestRaw[]>();
          for (const mr of mrs) {
            const pid = String((mr as { project_id?: number }).project_id ?? '');
            if (!pid) continue;
            const list = byProject.get(pid) ?? [];
            list.push(mr);
            byProject.set(pid, list);
          }
          for (const [pid, list] of byProject) {
            await collect(pid, list);
          }
        } else {
          for (const projectId of projectIds) {
            try {
              const mrs = await client.listMergeRequests(projectId, { state: 'opened' });
              await collect(projectId, mrs);
            } catch (err) {
              errors.push(`Project ${projectId}: ${err instanceof Error ? err.message : String(err)}`);
            }
          }
        }
      } else {
        for (const projectId of projectIds) {
          try {
            const mrs = await client.listMergeRequests(projectId, { state: 'opened' });
            await collect(projectId, mrs);
          } catch (err) {
            errors.push(`Project ${projectId}: ${err instanceof Error ? err.message : String(err)}`);
          }
        }
      }
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }

    items.sort((a, b) => b.ageHours - a.ageHours);
    return { source: 'live' as const, items, errors };
  }

  @Get('integrations/gitlab/projects')
  @Roles('admin', 'lead')
  async listGitLabProjects() {
    const resolved = await this.resolveGitLab();
    if (!resolved) {
      return { source: 'offline' as const, projects: [], message: 'ยังไม่ได้ตั้งค่า GitLab' };
    }
    try {
      const projects = await resolved.client.listProjects({ membership: true, simple: true });
      return {
        source: 'live' as const,
        projects: projects.map((p) => ({
          id: String(p.id),
          name: p.name ?? '',
          path: p.path_with_namespace ?? '',
          webUrl: p.web_url ?? '',
        })),
      };
    } catch (err) {
      return {
        source: 'error' as const,
        projects: [],
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }

  @Get('integrations/openproject/discovery')
  @Roles('admin', 'lead')
  async openProjectDiscovery(@Req() req: AuthedRequest) {
    const client = await this.syncService.getClient();
    if (!client) {
      return {
        source: 'offline' as const,
        projects: [],
        statuses: [],
        types: [],
        message: 'ยังไม่ได้ตั้งค่า OpenProject',
      };
    }
    try {
      const [projects, statuses, types] = await Promise.all([
        client.listProjects(),
        client.listStatuses(),
        client.listTypes(),
      ]);
      const catalog = projects
        .filter((p) => p.identifier)
        .map((p) => ({
          id: p.id,
          identifier: p.identifier ?? '',
          name: p.name ?? p.identifier ?? '',
          active: p.active ?? true,
        }));
      const settings = await getSettings(this.db);
      settings.openprojectProjectCatalog = catalog;
      await saveSettings(this.db, settings, req.authUser?.person.id ?? null);
      return {
        source: 'live' as const,
        projects: catalog.map((p) => ({
          id: String(p.id),
          name: p.name,
          identifier: p.identifier,
          active: p.active,
        })),
        statuses: statuses.map((s) => ({
          id: s.id,
          name: s.name ?? '',
          isClosed: s.isClosed ?? false,
        })),
        types: types.map((t) => ({
          id: t.id,
          name: t.name ?? '',
          isMilestone: t.isMilestone ?? false,
        })),
        teamStaging: this.config.openproject.teamStaging,
      };
    } catch (err) {
      return {
        source: 'error' as const,
        projects: [],
        statuses: [],
        types: [],
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /** สมาชิกต่อโปรเจกต์จาก OpenProject (เฟส C) — อ่านอย่างเดียว */
  @Get('integrations/openproject/memberships')
  @Roles('admin', 'lead')
  async openProjectMemberships(@Query('project') projectRaw?: string) {
    const project = (projectRaw ?? '').trim();
    if (!project) {
      return { source: 'error' as const, items: [], message: 'ระบุ project=identifier หรือ id' };
    }
    const client = await this.syncService.getClient();
    if (!client) {
      return { source: 'offline' as const, items: [], message: 'ยังไม่ได้ตั้งค่า OpenProject' };
    }
    try {
      const items = await client.listMemberships({ project });
      return {
        source: 'live' as const,
        items: items.map((m) => ({
          id: m.id,
          principal: m._links?.principal?.title ?? null,
          principalHref: m._links?.principal?.href ?? null,
          roles: (m._links?.roles ?? []).map((r) => r.title ?? '').filter(Boolean),
          project: m._links?.project?.title ?? null,
        })),
      };
    } catch (err) {
      return {
        source: 'error' as const,
        items: [],
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }

  @Get('team-time')
  @Roles('admin', 'lead', 'member')
  async teamTime(
    @Query('from') fromRaw: string | undefined,
    @Query('to') toRaw: string | undefined,
    @Req() req: AuthedRequest,
  ) {
    const settings = await getSettings(this.db);
    const hoursPerMd = settings.hoursPerMd || 6;
    const { from, to } = resolveWeekRange(fromRaw, toRaw);
    const days = enumerateDates(from, to);
    const people = await listPeople(this.db, true);
    const role = req.authUser?.access ?? 'member';
    const selfId = req.authUser?.person.id;
    const visiblePeople =
      role === 'member' ? people.filter((p) => p.id === selfId) : people;

    const client = await this.syncService.getClient();
    type DayCell = {
      date: string;
      hours: number;
      ticketIds: string[];
      hasGitlabActivity: boolean;
    };
    type PersonRow = {
      personId: string;
      nickname: string;
      openprojectUserId: number | null;
      gitlabUsername: string | null;
      days: DayCell[];
      totalHours: number;
    };

    const rows: PersonRow[] = visiblePeople.map((person) => ({
      personId: person.id,
      nickname: person.nickname,
      openprojectUserId: person.openprojectUserId ?? null,
      gitlabUsername: person.gitlabUsername ?? null,
      days: days.map((date) => ({ date, hours: 0, ticketIds: [], hasGitlabActivity: false })),
      totalHours: 0,
    }));
    const byPerson = new Map(rows.map((r) => [r.personId, r]));
    const byOpUser = new Map(
      rows.filter((r) => r.openprojectUserId != null).map((r) => [r.openprojectUserId!, r]),
    );

    let source: 'live' | 'offline' = 'offline';
    const errors: string[] = [];

    if (client) {
      source = 'live';
      try {
        for await (const entry of client.paginateTimeEntries({ spentFrom: from, spentTo: to })) {
          const userId = client.userIdFromTimeEntry(entry);
          const row = userId != null ? byOpUser.get(userId) : undefined;
          if (!row) continue;
          const spentOn = (entry.spentOn ?? '').slice(0, 10);
          const cell = row.days.find((d) => d.date === spentOn);
          if (!cell) continue;
          const hours = isoDurationToHours(entry.hours);
          cell.hours = Math.round((cell.hours + hours) * 100) / 100;
          const wpId = client.workPackageIdFromTimeEntry(entry);
          if (wpId != null) {
            const ticketId = `OP-${wpId}`;
            if (!cell.ticketIds.includes(ticketId)) {
              cell.ticketIds.push(ticketId);
            }
          }
        }
      } catch (err) {
        errors.push(err instanceof Error ? err.message : String(err));
        source = 'offline';
      }
    }

    if (source === 'offline') {
      const tickets = await listWorkItems(this.db);
      for (const ticket of tickets) {
        if (!ticket.assigneeId || !ticket.actualMd) continue;
        const row = byPerson.get(ticket.assigneeId);
        if (!row) continue;
        const closedOn = normalizeDate(ticket.closedOn) || normalizeDate(ticket.dueOn);
        if (!closedOn || closedOn < from || closedOn > to) continue;
        const cell = row.days.find((d) => d.date === closedOn);
        if (!cell) continue;
        const hours = Math.round(ticket.actualMd * hoursPerMd * 100) / 100;
        cell.hours = Math.round((cell.hours + hours) * 100) / 100;
        if (!cell.ticketIds.includes(ticket.id)) {
          cell.ticketIds.push(ticket.id);
        }
      }
    }

    // Optional GitLab activity dots (best-effort, skip silently on failure)
    const gitlab = await this.resolveGitLab();
    if (gitlab) {
      for (const row of rows) {
        if (!row.gitlabUsername) continue;
        try {
          const events = await gitlab.client.getUserEvents(row.gitlabUsername, {
            after: from,
            before: to,
          });
          for (const event of events) {
            const day = (event.created_at ?? '').slice(0, 10);
            const cell = row.days.find((d) => d.date === day);
            if (cell) {
              cell.hasGitlabActivity = true;
            }
          }
        } catch {
          // ignore per-user event errors
        }
      }
    }

    for (const row of rows) {
      row.totalHours = Math.round(row.days.reduce((sum, d) => sum + d.hours, 0) * 100) / 100;
    }

    return {
      source,
      from,
      to,
      days,
      hoursPerDayTarget: hoursPerMd,
      writeback: this.config.openproject.writeback,
      rows,
      errors,
    };
  }

  @Get('integrations/teams')
  async getTeams() {
    const [connection, runs] = await Promise.all([
      getConnection(this.db, 'teams'),
      listSyncRuns(this.db, 'teams', 10),
    ]);
    const channel = connection?.base_url || this.config.teams.defaultChannel || 'dev-alerts';
    const hasWebhook = Boolean(this.config.teams.webhookUrl || connection?.token_enc);
    const enabled = Boolean(this.config.teams.webhookUrl || connection?.enabled);
    return {
      configured: hasWebhook,
      enabled,
      channel,
      hasWebhook,
      source: this.config.teams.webhookUrl ? 'env' : connection?.token_enc ? 'db' : 'none',
      lastRuns: runs,
    };
  }

  @Put('integrations/teams')
  @Roles('admin')
  async putTeams(
    @Body()
    body: {
      channel?: string;
      webhookUrl?: string;
      enabled?: boolean;
    },
    @Req() req: AuthedRequest,
  ) {
    const existing = await getConnection(this.db, 'teams');
    const channel = (body.channel ?? existing?.base_url ?? this.config.teams.defaultChannel).trim() || 'dev-alerts';
    await upsertConnection(this.db, {
      id: 'teams',
      baseUrl: channel,
      token: body.webhookUrl === undefined ? null : body.webhookUrl.trim(),
      enabled: body.enabled ?? existing?.enabled ?? true,
      updatedBy: req.authUser?.person.id ?? null,
      encKey: this.config.tokenEncKey,
    });
    await this.db.audit(req.authUser?.person.id ?? null, 'teams.config', 'teams', {
      channel,
      enabled: body.enabled ?? existing?.enabled ?? true,
    });
    return this.getTeams();
  }

  @Post('integrations/teams/send')
  @Roles('admin', 'lead')
  async sendTeams(
    @Body()
    body: {
      channel?: string;
      deadline?: boolean;
      overrun?: boolean;
      dryRun?: boolean;
    },
    @Req() req: AuthedRequest,
  ) {
    const [settings, connection, tickets] = await Promise.all([
      getSettings(this.db),
      getConnection(this.db, 'teams'),
      listWorkItems(this.db),
    ]);
    const channel = (body.channel || connection?.base_url || this.config.teams.defaultChannel || 'dev-alerts').trim();
    const includeDeadline = body.deadline ?? true;
    const includeOverrun = body.overrun ?? true;
    const alerts = collectAlerts(tickets, settings.alertRules.overrunLimit).filter((alert) =>
      alert.kind === 'deadline' ? includeDeadline : includeOverrun,
    );
    const byId = new Map(tickets.map((t) => [t.id, t]));
    const messages = alerts.map((alert) => {
      const ticket = byId.get(alert.ticketId);
      const text =
        alert.kind === 'deadline'
          ? `ช่อง ${channel}: สัปดาห์ที่ commit ใกล้หมด ใบ ${alert.ticketId} เหลือ ${formatMd(ticket?.workingDaysLeft ?? 0)} วันทำการและยังไม่ปิด`
          : `ช่อง ${channel}: actual มีแนวโน้มเกิน estimate มากกว่า 50% ใบ ${alert.ticketId} คาดว่า ${formatMd(ticket ? (projectedActual(ticket) ?? 0) : 0)} MD จาก estimate ${formatMd(ticket?.estimateMd ?? 0)} MD`;
      return {
        kind: alert.kind,
        ticketId: alert.ticketId,
        text,
      };
    });

    if (body.dryRun) {
      return {
        ok: true,
        sent: false,
        count: messages.length,
        messages,
      };
    }

    const webhookUrl = this.config.teams.webhookUrl || connectionToken(connection, this.config.tokenEncKey);
    if (!webhookUrl) {
      return {
        ok: false,
        sent: false,
        message: 'ยังไม่ได้ตั้งค่า TEAMS_WEBHOOK_URL ใน .env หรือหน้า Integrations',
        messages,
      };
    }

    const actor = req.authUser?.person.id ?? null;
    const runId = await startSyncRun(this.db, {
      connection: 'teams',
      trigger: 'manual',
      startedBy: actor,
      since: null,
    });

    if (messages.length === 0) {
      await finishSyncRun(this.db, runId, {
        status: 'success',
        added: 0,
        updated: 0,
        unchanged: 0,
        errors: [],
      });
      return { ok: true, sent: true, count: 0, messages: [] };
    }

    const summaryText = [
      `**Man-day Scorecard Alerts · ช่อง ${channel}** (${messages.length} รายการ)`,
      ...messages.map((item) => `- **${item.ticketId}**: ${item.text}`),
    ].join('\n');

    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: summaryText }),
      });
      if (!response.ok) {
        const errBody = await response.text();
        const errMsg = `Teams webhook HTTP ${response.status}: ${errBody.slice(0, 160)}`;
        await finishSyncRun(this.db, runId, {
          status: 'failed',
          added: 0,
          updated: 0,
          unchanged: messages.length,
          errors: [errMsg],
        });
        return { ok: false, sent: false, message: errMsg, messages };
      }
      await finishSyncRun(this.db, runId, {
        status: 'success',
        added: messages.length,
        updated: 0,
        unchanged: 0,
        errors: [],
      });
      await this.db.audit(actor, 'teams.send', channel, { runId, count: messages.length });
      return { ok: true, sent: true, count: messages.length, messages };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      await finishSyncRun(this.db, runId, {
        status: 'failed',
        added: 0,
        updated: 0,
        unchanged: messages.length,
        errors: [errMsg],
      });
      return { ok: false, sent: false, message: errMsg, messages };
    }
  }

  private async resolveGitLab(): Promise<{
    client: GitLabClient;
    projectIds: string[];
    baseUrl: string;
  } | null> {
    const connection = await getConnection(this.db, 'gitlab');
    const stored = parseGitLabBaseUrl(connection?.base_url ?? '');
    const baseUrl = (this.config.gitlab.url || stored.baseUrl).replace(/\/+$/, '');
    const projectIds =
      this.config.gitlab.projectIds.length > 0 ? this.config.gitlab.projectIds : stored.projectIds;
    const token = this.config.gitlab.apiToken || connectionToken(connection, this.config.tokenEncKey);
    if (!baseUrl || !token) {
      return null;
    }
    return {
      client: new GitLabClient(baseUrl, token),
      projectIds,
      baseUrl,
    };
  }
}

function encodeGitLabBaseUrl(baseUrl: string, projectIds: readonly string[]): string {
  if (projectIds.length === 0) {
    return baseUrl;
  }
  return `${baseUrl}#projects=${projectIds.join(',')}`;
}

function parseGitLabBaseUrl(stored: string): { baseUrl: string; projectIds: string[] } {
  const [baseUrl = '', hash = ''] = stored.split('#projects=');
  const projectIds = hash
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  return { baseUrl: baseUrl.trim(), projectIds };
}

function normalizeDate(raw: string | Date | null | undefined): string {
  if (!raw) return '';
  if (raw instanceof Date) {
    return Number.isNaN(raw.getTime()) ? '' : raw.toISOString().slice(0, 10);
  }
  const s = String(raw).trim();
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : '';
}

function resolveWeekRange(fromRaw?: string, toRaw?: string): { from: string; to: string } {
  const today = new Date();
  const to = normalizeDate(toRaw) || today.toISOString().slice(0, 10);
  if (normalizeDate(fromRaw)) {
    return { from: normalizeDate(fromRaw), to };
  }
  const toDate = new Date(`${to}T12:00:00Z`);
  const day = toDate.getUTCDay(); // 0 Sun .. 6 Sat
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(toDate);
  monday.setUTCDate(toDate.getUTCDate() + mondayOffset);
  return { from: monday.toISOString().slice(0, 10), to };
}

function enumerateDates(from: string, to: string): string[] {
  const out: string[] = [];
  const cursor = new Date(`${from}T12:00:00Z`);
  const end = new Date(`${to}T12:00:00Z`);
  while (cursor.getTime() <= end.getTime()) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}
