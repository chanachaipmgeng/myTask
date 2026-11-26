import { Body, Controller, Get, Put, Post, Query, Req, Res, Param, UnauthorizedException } from '@nestjs/common';
import type { Response } from 'express';
import { Inject } from '@nestjs/common';
import { Ticket } from '../../../shared/domain/models';
import { collectAlerts, projectedActual } from '../../../shared/domain/alerts';
import {
  extractTicketIdFromText,
  GitLabMergeRequestRaw,
  mapGitLabMergeRequests,
} from '../../../shared/domain/gitlab-mr';
import {
  filterGitActivityForTicket,
  mapGitLabActivityEvents,
} from '../../../shared/domain/gitlab-activity';
import {
  cleanBranchToTicketTitle,
  parseTicketIdFromBranch,
  suggestBranchNameFromTicket,
  CreateTicketFromBranchPayload,
} from '../../../shared/domain/git-branch';
import {
  getPersonGitSummary,
  linkGitBranchToTicket,
  listGitBranches,
  listTeamGitMappings,
  setTeamGitMappings,
  upsertGitBranch,
} from '../data/git.repo';
import { formatMd, scoreTicket } from '../../../shared/domain/scoring';
import { AuthedRequest, Public, Roles } from '../auth/auth.guard';
import { APP_CONFIG, AppConfig } from '../config';
import { getPerson, listPeople, listUnmappedOpUsers, setPersonOpenProjectUser } from '../data/people.repo';
import {
  connectionToken,
  getConnection,
  getSettings,
  saveSettings,
  upsertConnection,
} from '../data/settings.repo';
import {
  finishSyncRun,
  getWorkItem,
  getWorkItemByOpId,
  listSyncRuns,
  listWorkItems,
  startSyncRun,
  upsertWorkItem,
} from '../data/work-items.repo';
import { Db } from '../db/db.service';
import { CiStatus, GitLabClient } from '../integrations/gitlab/gitlab.client';
import {
  autoMatchCustomFieldsFromSchema,
  isoDurationToHours,
  validateMapping,
} from '../integrations/openproject/openproject.mapper';
import { resolveTicketSlaAndDueDates } from '../../../shared/domain/policy-sla';
import { todayInBangkok } from '../../../shared/domain/workflow';
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
      typeCatalog: settings.openprojectTypeCatalog ?? [],
      statusCatalog: settings.openprojectStatusCatalog ?? [],
      customFieldCatalog: settings.openprojectCustomFieldCatalog ?? [],
      enumerationCatalog: settings.openprojectEnumerationCatalog ?? [],
      groupCatalog: settings.openprojectGroupCatalog ?? [],
      rosterGroupIds: settings.openprojectRosterGroupIds ?? [],
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
      rosterGroupIds?: number[];
    },
    @Req() req: AuthedRequest,
  ) {
    if (
      body.mapping !== undefined ||
      typeof body.hoursPerMd === 'number' ||
      body.rosterGroupIds !== undefined
    ) {
      const settings = await getSettings(this.db);
      if (body.mapping !== undefined) {
        const checked = validateMapping(body.mapping);
        if (!checked.mapping) {
          return { ok: false, errors: checked.errors };
        }
        settings.openprojectMapping = checked.mapping;
      }
      if (typeof body.hoursPerMd === 'number') {
        settings.hoursPerMd = body.hoursPerMd;
      }
      if (body.rosterGroupIds !== undefined) {
        settings.openprojectRosterGroupIds = [
          ...new Set(
            (Array.isArray(body.rosterGroupIds) ? body.rosterGroupIds : [])
              .map((v) => Number(v))
              .filter((n) => Number.isFinite(n) && n > 0)
              .map((n) => Math.floor(n)),
          ),
        ];
      }
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
  @Roles('admin', 'lead', 'member')
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

  @Get('integrations/gitlab/branches')
  async listBranches(
    @Query('personId') personId?: string,
    @Query('unmatchedOnly') unmatchedOnly?: string,
    @Query('teamId') teamId?: string,
    @Query('status') status?: string,
  ) {
    const branches = await listGitBranches(this.db, {
      personId,
      unmatchedOnly: unmatchedOnly === 'true',
      teamId,
      status,
    });
    return { branches };
  }

  @Post('integrations/gitlab/sync-branches')
  async syncBranches(@Req() req: AuthedRequest) {
    const gitlab = await this.resolveGitLab();
    if (!gitlab) {
      if (this.config.production) {
        return {
          ok: false,
          source: 'disabled',
          totalBranches: 0,
          unmatchedCount: 0,
          message: 'โหมด production: ปิด demo GitLab branches — ตั้ง GITLAB URL/token ก่อนซิงก์',
        };
      }
      // In offline / unconfigured mode, provide demo branches so developers & reviewers can test the workflow
      const demoBranches = [
        {
          projectId: 101,
          projectName: 'frontend/myhr-portal',
          branchName: 'feature/payment-slip-export',
          authorUsername: 'paweena',
          personId: 'paweena',
          lastCommitSha: '7f9a2b1c4e8d',
          lastCommitTitle: 'feat: add export to excel for payroll slips',
          lastCommitAt: new Date(),
          status: 'active' as const,
        },
        {
          projectId: 101,
          projectName: 'frontend/myhr-portal',
          branchName: 'fix/IMP-101-avatar-border-radius',
          authorUsername: 'kanchawee',
          personId: 'kanchawee',
          ticketId: 'IMP-101',
          lastCommitSha: '4b3c2d1e0f9a',
          lastCommitTitle: 'fix(avatar): correct border radius token',
          lastCommitAt: new Date(),
          status: 'active' as const,
        },
        {
          projectId: 102,
          projectName: 'backend/core-api',
          branchName: 'spike/ai-prompt-optimization',
          authorUsername: 'chanachai',
          personId: 'chanachai',
          lastCommitSha: '9a8b7c6d5e4f',
          lastCommitTitle: 'poc: streaming response for coach summary',
          lastCommitAt: new Date(),
          status: 'active' as const,
        },
      ];
      for (const b of demoBranches) {
        await upsertGitBranch(this.db, b);
      }
      return {
        ok: true,
        source: 'demo',
        totalBranches: demoBranches.length,
        unmatchedCount: 2,
        message: 'โหมดตัวอย่าง: ซิงก์ข้อมูลจำลอง 3 Branch (มี 2 Branch ที่ยังไม่มีใบงาน)',
      };
    }

    try {
      const people = await listPeople(this.db);
      const byUsername = new Map(
        people.filter((p) => p.gitlabUsername).map((p) => [p.gitlabUsername!.toLowerCase(), p]),
      );
      const byEmail = new Map(
        people.filter((p) => p.email).map((p) => [p.email!.toLowerCase(), p]),
      );

      let totalBranches = 0;
      let unmatchedCount = 0;

      let projectList: { id: number; name?: string; path_with_namespace?: string; web_url?: string }[] = [];
      if (gitlab.projectIds.length > 0) {
        projectList = gitlab.projectIds.map((id) => ({ id: Number(id) }));
      } else {
        projectList = await gitlab.client.listProjects({ membership: true });
      }

      for (const proj of projectList) {
        try {
          const branches = await gitlab.client.listBranches(proj.id);
          const projName = proj.path_with_namespace || proj.name || `Project ${proj.id}`;

          for (const b of branches) {
            totalBranches++;
            const ticketId = parseTicketIdFromBranch(b.name);
            if (!ticketId) {
              unmatchedCount++;
            }

            const authorEmail = b.commit?.author_email?.toLowerCase();
            const authorName = b.commit?.author_name;
            // Prefer company email on the person record, then GitLab username.
            let matchedPerson =
              (authorEmail ? byEmail.get(authorEmail) : undefined) ??
              (authorName ? byUsername.get(authorName.toLowerCase()) : undefined);

            // Fallback: branch named OP-… → assignee on that ticket (covers old commits with personal email).
            if (!matchedPerson && ticketId) {
              const opNum = Number(ticketId);
              const ticket =
                (await getWorkItem(this.db, ticketId)) ??
                (await getWorkItem(this.db, `OP-${ticketId}`)) ??
                (Number.isFinite(opNum) ? await getWorkItemByOpId(this.db, opNum) : null);
              const assigneeId = ticket?.assigneeId?.trim();
              if (assigneeId) {
                matchedPerson =
                  people.find((p) => p.id === assigneeId) ??
                  (assigneeId.startsWith('op:')
                    ? people.find((p) => p.openprojectUserId === Number(assigneeId.slice(3)))
                    : undefined);
              }
            }

            await upsertGitBranch(this.db, {
              projectId: proj.id,
              projectName: projName,
              branchName: b.name,
              authorUsername: authorName,
              personId: matchedPerson?.id,
              ticketId,
              webUrl: b.web_url,
              lastCommitSha: b.commit?.short_id ?? b.commit?.id,
              lastCommitTitle: b.commit?.title,
              lastCommitAt: b.commit?.created_at,
              status: b.merged ? 'merged' : 'active',
            });
          }
        } catch {
          // Skip inaccessible projects
        }
      }

      await this.db.audit(req.authUser?.person.id ?? null, 'gitlab.sync_branches', 'gitlab', {
        totalBranches,
        unmatchedCount,
      });

      return { ok: true, totalBranches, unmatchedCount };
    } catch (err: any) {
      return { ok: false, message: `ไม่สามารถติดต่อ mygitplus ได้: ${err.message || String(err)}` };
    }
  }

  @Public()
  @Post('integrations/gitlab/webhook')
  async gitlabWebhook(@Body() payload: any) {
    if (!payload || payload.object_kind !== 'push') {
      return { ok: true, ignored: true };
    }

    const ref = String(payload.ref ?? '');
    if (!ref.startsWith('refs/heads/')) {
      return { ok: true, ignored: true };
    }

    const branchName = ref.replace('refs/heads/', '');
    const projectId = Number(payload.project?.id || payload.project_id);
    const projectName = String(payload.project?.path_with_namespace || payload.project?.name || `Project ${projectId}`);
    const authorUsername = payload.user_username || payload.user_name;
    const authorEmail = String(payload.user_email ?? '').trim().toLowerCase() || undefined;

    const people = await listPeople(this.db);
    // Prefer company email, then GitLab username.
    const matchedPerson =
      (authorEmail
        ? people.find((p) => p.email?.toLowerCase() === authorEmail)
        : undefined) ??
      people.find((p) => p.gitlabUsername?.toLowerCase() === authorUsername?.toLowerCase());

    const ticketId = parseTicketIdFromBranch(branchName);
    const latestCommit = Array.isArray(payload.commits) && payload.commits.length > 0
      ? payload.commits[payload.commits.length - 1]
      : null;

    await upsertGitBranch(this.db, {
      projectId,
      projectName,
      branchName,
      authorUsername,
      personId: matchedPerson?.id,
      ticketId,
      webUrl: payload.project?.web_url ? `${payload.project.web_url}/-/tree/${branchName}` : null,
      lastCommitSha: latestCommit?.id?.slice(0, 8),
      lastCommitTitle: latestCommit?.title || latestCommit?.message,
      lastCommitAt: latestCommit?.timestamp,
      status: 'active',
    });

    return {
      ok: true,
      branch: branchName,
      ticketId,
      unmatched: !ticketId,
    };
  }

  @Post('integrations/gitlab/create-branch-from-ticket')
  @Roles('admin', 'lead', 'member')
  async createBranchFromTicket(
    @Body()
    body: {
      ticketId?: string;
      gitlabProjectId?: string | number;
      branchName?: string;
      ref?: string;
    },
    @Req() req: AuthedRequest,
  ) {
    const ticketId = String(body.ticketId ?? '').trim();
    const gitlabProjectId = String(body.gitlabProjectId ?? '').trim();
    if (!ticketId || !gitlabProjectId) {
      return { ok: false, message: 'ต้องระบุ ticketId และ gitlabProjectId' };
    }

    const ticket = await getWorkItem(this.db, ticketId);
    if (!ticket) {
      return { ok: false, message: `ไม่พบใบงาน ${ticketId}` };
    }
    if (ticket.opId == null) {
      return { ok: false, message: 'ใบงานยังไม่มีรหัส OpenProject (opId) — สร้าง branch ไม่ได้' };
    }

    const role = req.authUser?.access ?? 'member';
    const selfId = req.authUser?.person.id;
    if (role === 'member' && ticket.assigneeId !== selfId) {
      return {
        ok: false,
        message: 'สมาชิกสร้าง branch ได้เฉพาะใบงานที่มอบหมายให้ตัวเอง',
      };
    }

    let branchName = String(body.branchName ?? '').trim();
    if (!branchName) {
      try {
        branchName = suggestBranchNameFromTicket({
          opId: ticket.opId,
          title: ticket.title ?? ticket.module,
          type: ticket.opType ?? ticket.type,
        });
      } catch (err) {
        return {
          ok: false,
          message: err instanceof Error ? err.message : String(err),
        };
      }
    }

    const parsedId = parseTicketIdFromBranch(branchName);
    if (parsedId !== String(ticket.opId)) {
      return {
        ok: false,
        message: `ชื่อ branch ต้องมีรหัส OP-${ticket.opId} เพื่อให้จับคู่ใบงานได้ (ตอนนี้จับได้: ${parsedId ?? 'ไม่มี'})`,
      };
    }

    const gitlab = await this.resolveGitLab();
    if (!gitlab) {
      const demoUrl = `https://mygitplus.example/-/tree/${encodeURIComponent(branchName)}`;
      await upsertGitBranch(this.db, {
        projectId: Number(gitlabProjectId) || 0,
        projectName: `GitLab ${gitlabProjectId}`,
        branchName,
        authorUsername: req.authUser?.person.gitlabUsername ?? req.authUser?.person.id ?? null,
        personId: req.authUser?.person.id ?? null,
        ticketId: ticket.id,
        webUrl: demoUrl,
        lastCommitSha: null,
        lastCommitTitle: `branch from ticket ${ticket.id}`,
        lastCommitAt: new Date().toISOString(),
        status: 'active',
      });
      await this.db.audit(
        req.authUser?.person.id ?? null,
        'gitlab.create_branch_from_ticket',
        ticket.id,
        { branchName, gitlabProjectId, source: 'offline' },
      );
      return {
        ok: true,
        source: 'offline' as const,
        branchName,
        webUrl: demoUrl,
        message: 'โหมดออฟไลน์: จำลองสร้าง branch ในฐานข้อมูล (ยังไม่ได้ยิง GitLab)',
      };
    }

    try {
      let ref = String(body.ref ?? '').trim();
      if (!ref) {
        try {
          const project = await gitlab.client.getProject(gitlabProjectId);
          ref = (project.default_branch || '').trim() || 'main';
        } catch {
          ref = 'main';
        }
      }

      const created = await gitlab.client.createBranch(gitlabProjectId, {
        branch: branchName,
        ref,
      });

      const webUrl =
        created.web_url ||
        `${gitlab.baseUrl.replace(/\/+$/, '')}/${gitlabProjectId}/-/tree/${encodeURIComponent(branchName)}`;

      await upsertGitBranch(this.db, {
        projectId: Number(gitlabProjectId) || 0,
        projectName: String(gitlabProjectId),
        branchName: created.name || branchName,
        authorUsername: req.authUser?.person.gitlabUsername ?? req.authUser?.person.id ?? null,
        personId: req.authUser?.person.id ?? null,
        ticketId: ticket.id,
        webUrl,
        lastCommitSha: created.commit?.short_id ?? created.commit?.id ?? null,
        lastCommitTitle: created.commit?.title ?? null,
        lastCommitAt: created.commit?.created_at ?? new Date().toISOString(),
        status: created.merged ? 'merged' : 'active',
      });

      await this.db.audit(
        req.authUser?.person.id ?? null,
        'gitlab.create_branch_from_ticket',
        ticket.id,
        { branchName, gitlabProjectId, ref, source: 'live' },
      );

      return {
        ok: true,
        source: 'live' as const,
        branchName: created.name || branchName,
        webUrl,
        ref,
      };
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }

  @Post('integrations/openproject/create-from-branch')
  async createTicketFromBranch(
    @Body() body: CreateTicketFromBranchPayload,
    @Req() req: AuthedRequest,
  ) {
    const opClient = await this.syncService.getClient();
    if (!opClient) {
      return { ok: false, message: 'ไม่ได้ตั้งค่าการเชื่อมต่อ myProject (OpenProject)' };
    }

    const settings = await getSettings(this.db);
    let assigneeOpId: number | undefined;

    if (body.assigneePersonId) {
      const person = await getPerson(this.db, body.assigneePersonId);
      if (person?.openprojectUserId) {
        assigneeOpId = person.openprojectUserId;
      }
    }

    const hoursPerMd = settings.hoursPerMd || 6;
    const estimatedHours = (body.estimateMd ?? 1) * hoursPerMd;
    const today = todayInBangkok();
    const mapping = settings.openprojectMapping;
    const sla = resolveTicketSlaAndDueDates({
      startDate: today,
      createdDate: today,
      ticketType: 'Feature',
      closed: false,
      autoSla: mapping.autoSla,
    });
    const cfPayload: Record<string, string | null | undefined> = {};
    if (mapping.customFields.receiptDate && sla.receiptDate) {
      cfPayload[mapping.customFields.receiptDate] = sla.receiptDate;
    }
    if (mapping.customFields.alertDate && sla.alertDate) {
      cfPayload[mapping.customFields.alertDate] = sla.alertDate;
    }
    if (mapping.customFields.policyDate && sla.policyDate) {
      cfPayload[mapping.customFields.policyDate] = sla.policyDate;
    }

    try {
      const wp = await opClient.createWorkPackage(body.projectId, {
        subject: body.subject,
        description: body.description ?? `สร้างจาก Git Branch: ${body.branchName}`,
        typeId: body.typeId,
        assigneeId: assigneeOpId,
        estimatedHours,
        startDate: today,
        dueDate: sla.resolvedDueOn,
        customFields: cfPayload,
      });

      if (body.branchId) {
        await linkGitBranchToTicket(this.db, body.branchId, String(wp.id));
      }

      await this.db.audit(req.authUser?.person.id ?? null, 'openproject.create_from_branch', String(wp.id), {
        branchName: body.branchName,
        projectId: body.projectId,
        subject: body.subject,
        ticketId: wp.id,
      });

      return {
        ok: true,
        ticketId: String(wp.id),
        subject: wp.subject,
        branchId: body.branchId,
      };
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }

  @Get('integrations/gitlab/person/:personId')
  async personGitSummary(
    @Param('personId') personId: string,
    @Query('ticketId') ticketId?: string,
    @Query('days') daysRaw?: string,
  ) {
    const summary = await getPersonGitSummary(this.db, personId);
    const person = await getPerson(this.db, personId);
    const days = Math.min(365, Math.max(7, Number(daysRaw) || 90));
    const empty = {
      summary,
      events: [] as ReturnType<typeof mapGitLabActivityEvents>,
      source: 'offline' as const,
      message: undefined as string | undefined,
    };

    const gitlabUsername = person?.gitlabUsername?.trim();
    if (!gitlabUsername) {
      return { ...empty, message: 'ยังไม่ได้ผูก GitLab username ของพนักงานคนนี้' };
    }

    const resolved = await this.resolveGitLab();
    if (!resolved) {
      return { ...empty, message: 'ยังไม่ได้ตั้งค่า GitLab' };
    }

    const today = new Date();
    const after = new Date(today);
    after.setUTCDate(after.getUTCDate() - days);
    const afterIso = after.toISOString().slice(0, 10);
    const beforeIso = today.toISOString().slice(0, 10);

    try {
      const openMrs = await resolved.client.listOpenMergeRequests({
        authorUsername: gitlabUsername,
        perPage: 50,
      });
      summary.openMrsCount = openMrs.length;

      const rawEvents = await resolved.client.getUserEvents(gitlabUsername, {
        after: afterIso,
        before: beforeIso,
        perPage: 100,
      });
      let events = mapGitLabActivityEvents(rawEvents);
      const filterTicket = (ticketId ?? '').trim();
      if (filterTicket) {
        let opId: number | null = null;
        const byId = await getWorkItem(this.db, filterTicket);
        if (byId?.opId != null) {
          opId = byId.opId;
        } else {
          const numeric = Number(filterTicket.replace(/^OP-/i, ''));
          if (Number.isFinite(numeric) && numeric > 0) {
            const byOp = await getWorkItemByOpId(this.db, numeric);
            opId = byOp?.opId ?? numeric;
          }
        }
        events = filterGitActivityForTicket(events, filterTicket, opId);
      }

      return { summary, events, source: 'live' as const };
    } catch (err) {
      return {
        ...empty,
        summary,
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }

  @Get('org/teams/git-mappings')
  @Roles('admin', 'lead')
  async getTeamGitMappings() {
    const mappings = await listTeamGitMappings(this.db);
    return { mappings };
  }

  @Put('org/teams/git-mappings')
  @Roles('admin')
  async saveTeamGitMappings(
    @Body() body: { teamId: string; projects: { id: number; name: string }[] },
    @Req() req: AuthedRequest,
  ) {
    if (!body.teamId || !Array.isArray(body.projects)) {
      return { ok: false, message: 'ข้อมูลไม่ถูกต้อง' };
    }
    await setTeamGitMappings(this.db, body.teamId, body.projects);
    await this.db.audit(req.authUser?.person.id ?? null, 'teams.update_git_mappings', body.teamId, {
      projectCount: body.projects.length,
    });
    return { ok: true };
  }

  @Post('integrations/openproject/discover-fields')
  @Roles('admin', 'lead')
  async discoverOpenProjectFields(@Req() req: AuthedRequest) {
    const client = await this.syncService.getClient();
    if (!client) {
      return {
        ok: false,
        fields: [],
        suggested: {},
        message: 'ยังไม่ได้ตั้งค่า URL / Token ของ myProject (OpenProject)',
      };
    }
    try {
      const fields = await client.discoverCustomFieldsFromSchemas(40);
      const suggested = autoMatchCustomFieldsFromSchema(fields);
      const settings = await getSettings(this.db);
      settings.openprojectCustomFieldCatalog = fields.map((f) => ({
        key: f.key,
        name: f.name,
        type: f.type,
        ...(f.sampleWpType ? { sampleWpType: f.sampleWpType } : {}),
        ...(f.options?.length ? { options: f.options } : {}),
      }));
      await saveSettings(this.db, settings, req.authUser?.person.id ?? null);
      await this.db.audit(req.authUser?.person.id ?? null, 'openproject.discover_fields', 'openproject', {
        fieldCount: fields.length,
        suggested,
      });
      return {
        ok: true,
        fields,
        suggested,
      };
    } catch (err) {
      return {
        ok: false,
        fields: [],
        suggested: {},
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }

  private readonly avatarCache = new Map<
    number,
    { ok: boolean; contentType: string; bytes: Buffer | null; expiresAt: number }
  >();

  @Public()
  @Get('integrations/openproject/users/:opUserId/avatar')
  async proxyOpenProjectUserAvatar(
    @Param('opUserId') opUserIdRaw: string,
    @Res() res: Response,
  ) {
    const opUserId = Number(opUserIdRaw);
    if (!Number.isFinite(opUserId) || opUserId <= 0) {
      res.status(400).end();
      return;
    }
    const now = Date.now();
    const cached = this.avatarCache.get(opUserId);
    if (cached && cached.expiresAt > now) {
      if (!cached.ok || !cached.bytes) {
        res.setHeader('Cache-Control', 'public, max-age=7200');
        res.status(404).end();
        return;
      }
      res.setHeader('Content-Type', cached.contentType);
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.status(200).send(cached.bytes);
      return;
    }

    const client = await this.syncService.getClient();
    if (!client) {
      this.avatarCache.set(opUserId, {
        ok: false,
        contentType: 'text/plain',
        bytes: null,
        expiresAt: now + 2 * 3600_000,
      });
      res.setHeader('Cache-Control', 'public, max-age=7200');
      res.status(404).end();
      return;
    }
    try {
      const fetched = await client.fetchUserAvatar(opUserId);
      const isOk = Boolean(fetched.ok && fetched.bytes);
      this.avatarCache.set(opUserId, {
        ok: isOk,
        contentType: fetched.contentType || 'image/jpeg',
        bytes: fetched.bytes,
        expiresAt: now + (isOk ? 60 * 60_000 : 2 * 3600_000),
      });
      if (!isOk) {
        res.setHeader('Cache-Control', 'public, max-age=7200');
        res.status(404).end();
        return;
      }
      res.setHeader('Content-Type', fetched.contentType || 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.status(200).send(fetched.bytes);
    } catch {
      this.avatarCache.set(opUserId, {
        ok: false,
        contentType: 'text/plain',
        bytes: null,
        expiresAt: now + 2 * 3600_000,
      });
      res.setHeader('Cache-Control', 'public, max-age=7200');
      res.status(404).end();
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
        groups: [],
        enumerations: [],
        customFields: [],
        message: 'ยังไม่ได้ตั้งค่า OpenProject',
      };
    }
    try {
      const [projects, statuses, types, groups, enumerations, customFields] = await Promise.all([
        client.listProjects(),
        client.listStatuses(),
        client.listTypes(),
        client.listGroups().catch(() => []),
        client.listEnumerations().catch(() => []),
        client.discoverCustomFieldsFromSchemas(40).catch(() => []),
      ]);
      const settings = await getSettings(this.db);
      const existingByIdentifier = new Map(
        (settings.openprojectProjectCatalog ?? []).map((p) => [p.identifier, p]),
      );
      const existingById = new Map(
        (settings.openprojectProjectCatalog ?? []).map((p) => [p.id, p]),
      );

      const catalog = projects
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
      settings.openprojectProjectCatalog = catalog;
      settings.openprojectTypeCatalog = types
        .filter((t) => t.name?.trim())
        .map((t) => ({
          id: t.id,
          name: (t.name ?? '').trim(),
          ...(t.color ? { color: t.color } : {}),
          isMilestone: Boolean(t.isMilestone),
        }));
      settings.openprojectStatusCatalog = statuses
        .filter((s) => s.name?.trim())
        .map((s) => ({
          id: s.id,
          name: (s.name ?? '').trim(),
          isClosed: Boolean(s.isClosed),
          ...(s.color ? { color: s.color } : {}),
        }));
      settings.openprojectEnumerationCatalog = enumerations
        .filter((e) => e.name?.trim())
        .map((e) => ({
          id: e.id,
          name: (e.name ?? '').trim(),
          type: e._type || 'Enumeration',
          active: e.active !== false,
          ...(e.color ? { color: e.color } : {}),
        }));
      settings.openprojectCustomFieldCatalog = customFields.map((f) => ({
        key: f.key,
        name: f.name,
        type: f.type,
        ...(f.sampleWpType ? { sampleWpType: f.sampleWpType } : {}),
        ...(f.options?.length ? { options: f.options } : {}),
      }));

      const groupCatalog: { id: number; name: string; memberCount?: number }[] = [];
      for (const g of groups) {
        let memberCount: number | undefined;
        try {
          memberCount = (await client.listGroupMemberUserIds(g.id)).length;
        } catch {
          memberCount = undefined;
        }
        groupCatalog.push({
          id: g.id,
          name: (g.name ?? `Group ${g.id}`).trim(),
          ...(memberCount != null ? { memberCount } : {}),
        });
      }
      settings.openprojectGroupCatalog = groupCatalog;

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
        groups: groupCatalog,
        enumerations: settings.openprojectEnumerationCatalog,
        customFields: settings.openprojectCustomFieldCatalog,
        rosterGroupIds: settings.openprojectRosterGroupIds ?? [],
        teamStaging: this.config.openproject.teamStaging,
      };
    } catch (err) {
      return {
        source: 'error' as const,
        projects: [],
        statuses: [],
        types: [],
        groups: [],
        enumerations: [],
        customFields: [],
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /** รายงานเทียบสด: users/groups · types/status · CF · enumerations */
  @Get('integrations/openproject/sync-audit')
  @Roles('admin', 'lead')
  async openProjectSyncAudit() {
    const client = await this.syncService.getClient();
    if (!client) {
      return { source: 'offline' as const, message: 'ยังไม่ได้ตั้งค่า OpenProject' };
    }
    const settings = await getSettings(this.db);
    const people = await listPeople(this.db, false);
    const rosterGroupIds = settings.openprojectRosterGroupIds ?? [];
    const mapping = settings.openprojectMapping;

    const opUsers: { id: number; name: string; locked: boolean }[] = [];
    try {
      for await (const user of client.paginateUsers()) {
        opUsers.push({
          id: user.id,
          name: user.name || user.login || `User ${user.id}`,
          locked: user.status === 'locked',
        });
      }
    } catch (err) {
      return {
        source: 'error' as const,
        message: err instanceof Error ? err.message : String(err),
      };
    }

    const groups = await client.listGroups().catch(() => []);
    const groupMembers: {
      id: number;
      name: string;
      memberIds: number[];
    }[] = [];
    const rosterMemberIds = new Set<number>();
    for (const g of groups) {
      const memberIds = await client.listGroupMemberUserIds(g.id).catch(() => [] as number[]);
      groupMembers.push({
        id: g.id,
        name: (g.name ?? `Group ${g.id}`).trim(),
        memberIds,
      });
      if (rosterGroupIds.includes(g.id)) {
        for (const id of memberIds) rosterMemberIds.add(id);
      }
    }

    const peopleByOp = new Map(
      people.filter((p) => p.openprojectUserId != null).map((p) => [p.openprojectUserId!, p]),
    );
    const activePeople = people.filter((p) => p.active);
    const activeNotInRoster =
      rosterGroupIds.length === 0
        ? []
        : activePeople
            .filter((p) => p.openprojectUserId == null || !rosterMemberIds.has(p.openprojectUserId))
            .map((p) => ({
              id: p.id,
              nickname: p.nickname,
              openprojectUserId: p.openprojectUserId ?? null,
            }));
    const inRosterMissingOrInactive =
      rosterGroupIds.length === 0
        ? []
        : [...rosterMemberIds]
            .map((opId) => {
              const person = peopleByOp.get(opId);
              const opUser = opUsers.find((u) => u.id === opId);
              if (person?.active) return null;
              return {
                opUserId: opId,
                opName: opUser?.name ?? null,
                personId: person?.id ?? null,
                personActive: person?.active ?? false,
                locked: opUser?.locked ?? false,
              };
            })
            .filter((row): row is NonNullable<typeof row> => row != null);

    const [liveTypes, liveStatuses, liveEnums, liveCfs] = await Promise.all([
      client.listTypes().catch(() => []),
      client.listStatuses().catch(() => []),
      client.listEnumerations().catch(() => []),
      client.discoverCustomFieldsFromSchemas(40).catch(() => []),
    ]);

    const statusMapKeys = new Set(
      Object.keys(mapping.statusMap ?? {}).map((k) => k.trim().toLowerCase()),
    );
    const typeMapKeys = new Set(Object.keys(mapping.typeMap ?? {}).map((k) => k.trim().toLowerCase()));
    const unmappedStatuses = liveStatuses
      .filter((s) => s.name?.trim() && !statusMapKeys.has(s.name.trim().toLowerCase()))
      .map((s) => ({ id: s.id, name: s.name ?? '' }));
    const unmappedTypes = liveTypes
      .filter((t) => t.name?.trim() && !typeMapKeys.has(t.name.trim().toLowerCase()))
      .map((t) => ({ id: t.id, name: t.name ?? '' }));

    const mappedCfEntries = Object.entries(mapping.customFields ?? {}).filter(
      ([, v]) => typeof v === 'string' && v.trim(),
    ) as [string, string][];
    const schemaKeys = new Set(liveCfs.map((f) => f.key));
    const mappedMissingInSchema = mappedCfEntries
      .filter(([, key]) => !schemaKeys.has(key))
      .map(([semantic, key]) => ({ semantic, key }));
    const importantKeys = [
      'customField43',
      'customField44',
      'customField45',
      'customField46',
      'customField163',
      'customField185',
      'customField219',
    ];
    const importantCfStatus = importantKeys.map((key) => ({
      key,
      foundInSchema: schemaKeys.has(key),
      schemaName: liveCfs.find((f) => f.key === key)?.name ?? null,
    }));

    return {
      source: 'live' as const,
      teamStaging: this.config.openproject.teamStaging,
      rosterGroupIds,
      users: {
        opTotal: opUsers.length,
        opLocked: opUsers.filter((u) => u.locked).length,
        peopleTotal: people.length,
        peopleActive: activePeople.length,
        peopleLinked: peopleByOp.size,
        activeNotInRoster,
        inRosterMissingOrInactive,
      },
      groups: groupMembers.map((g) => ({
        id: g.id,
        name: g.name,
        memberCount: g.memberIds.length,
        selected: rosterGroupIds.includes(g.id),
      })),
      types: {
        liveCount: liveTypes.length,
        catalogCount: settings.openprojectTypeCatalog?.length ?? 0,
        unmapped: unmappedTypes,
      },
      statuses: {
        liveCount: liveStatuses.length,
        catalogCount: settings.openprojectStatusCatalog?.length ?? 0,
        unmapped: unmappedStatuses,
      },
      customFields: {
        discoveredCount: liveCfs.length,
        mappedCount: mappedCfEntries.length,
        mappedMissingInSchema,
        importantCfStatus,
        fields: liveCfs,
      },
      enumerations: {
        liveCount: liveEnums.length,
        catalogCount: settings.openprojectEnumerationCatalog?.length ?? 0,
        items: liveEnums.map((e) => ({
          id: e.id,
          name: e.name ?? '',
          type: e._type || 'Enumeration',
          active: e.active !== false,
        })),
      },
    };
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

  /**
   * รายการ time entry แบบแถว (คน/ช่วงวัน) — ต่างจาก team-time ที่เป็น matrix
   * GET /api/time-entries?personId=&from=&to=&page=&pageSize=
   */
  @Get('time-entries')
  @Roles('admin', 'lead', 'member')
  async listTimeEntries(
    @Req() req: AuthedRequest,
    @Query('personId') personIdRaw?: string,
    @Query('from') fromRaw?: string,
    @Query('to') toRaw?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const { from, to } = resolveWeekRange(fromRaw, toRaw);
    const people = await listPeople(this.db, true);
    const role = req.authUser?.access ?? 'member';
    const selfId = req.authUser?.person.id;
    const personId = (personIdRaw ?? '').trim() || (role === 'member' ? selfId ?? '' : '');
    if (role === 'member' && personId && personId !== selfId) {
      return {
        source: 'offline' as const,
        from,
        to,
        items: [],
        result: [],
        count: 0,
        total: 0,
        page: 1,
        pageSize: 25,
        message: 'สมาชิกดูได้เฉพาะรายการของตัวเอง',
      };
    }

    const person = personId ? people.find((p) => p.id === personId) : undefined;
    const pageNum = Math.max(1, Number(page) || 1);
    const size = Math.min(100, Math.max(1, Number(pageSize) || 25));

    type TimeEntryRow = {
      id: number | string;
      personId: string;
      nickname: string;
      spentOn: string;
      hours: number;
      ticketId: string | null;
      opWorkPackageId: number | null;
      comment: string;
    };

    const items: TimeEntryRow[] = [];
    let source: 'live' | 'offline' = 'offline';
    const errors: string[] = [];
    const client = await this.syncService.getClient();
    const opUserId = person?.openprojectUserId ?? null;

    if (client && (opUserId != null || !personId)) {
      source = 'live';
      try {
        const tickets = await listWorkItems(this.db);
        const byOpId = new Map(
          tickets
            .filter((t) => typeof t.opId === 'number')
            .map((t) => [t.opId as number, t.id]),
        );
        for await (const entry of client.paginateTimeEntries({
          spentFrom: from,
          spentTo: to,
          userId: opUserId,
        })) {
          const hours = isoDurationToHours(entry.hours) || 0;
          const wpHref = entry._links?.workPackage?.href ?? '';
          const wpMatch = /\/work_packages\/(\d+)/.exec(wpHref);
          const opWpId = wpMatch ? Number(wpMatch[1]) : null;
          const spentOn = String(entry.spentOn ?? '').slice(0, 10);
          const userHref = entry._links?.user?.href ?? '';
          const userMatch = /\/users\/(\d+)/.exec(userHref);
          const entryUserId = userMatch ? Number(userMatch[1]) : null;
          const matchedPerson =
            people.find((p) => p.openprojectUserId === entryUserId) ?? person ?? null;
          if (personId && matchedPerson && matchedPerson.id !== personId) continue;
          items.push({
            id: entry.id ?? `${spentOn}-${items.length}`,
            personId: matchedPerson?.id ?? personId ?? '',
            nickname: matchedPerson?.nickname ?? '',
            spentOn,
            hours: Math.round(hours * 100) / 100,
            ticketId: opWpId != null ? byOpId.get(opWpId) ?? null : null,
            opWorkPackageId: opWpId,
            comment: timeEntryComment(entry.comment),
          });
        }
      } catch (err) {
        errors.push(err instanceof Error ? err.message : String(err));
        source = 'offline';
      }
    }

    items.sort((a, b) => b.spentOn.localeCompare(a.spentOn) || b.hours - a.hours);
    const total = items.length;
    const pageCount = Math.max(1, Math.ceil(total / size));
    const safePage = Math.min(pageNum, pageCount);
    const offset = (safePage - 1) * size;
    const pageItems = items.slice(offset, offset + size);

    return {
      source,
      from,
      to,
      personId: personId || null,
      items: pageItems,
      result: pageItems,
      count: total,
      total,
      page: safePage,
      pageSize: size,
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
    const alerts = collectAlerts(tickets, settings.alertRules.overrunLimit).filter((alert) => {
      if (alert.kind === 'deadline' || alert.kind === 'policy-alert' || alert.kind === 'policy-breach') {
        return includeDeadline;
      }
      return includeOverrun;
    });
    const byId = new Map(tickets.map((t) => [t.id, t]));
    const messages = alerts.map((alert) => {
      const ticket = byId.get(alert.ticketId);
      let text: string;
      if (alert.kind === 'policy-breach') {
        text = `ช่อง ${channel}: เกินกำหนด Policy Date ใบ ${alert.ticketId} (Policy ${ticket?.policyDate ?? '—'}) และยังไม่มี Reply / ยังไม่ปิดงาน`;
      } else if (alert.kind === 'policy-alert') {
        text = `ช่อง ${channel}: ถึงวันเตือน Alert SLA ใบ ${alert.ticketId} (Alert ${ticket?.alertDate ?? '—'} · Policy ${ticket?.policyDate ?? '—'})`;
      } else if (alert.kind === 'deadline') {
        text = `ช่อง ${channel}: สัปดาห์ที่ commit ใกล้หมด ใบ ${alert.ticketId} เหลือ ${formatMd(ticket?.workingDaysLeft ?? 0)} วันทำการและยังไม่ปิด`;
      } else {
        text = `ช่อง ${channel}: actual มีแนวโน้มเกิน estimate มากกว่า 50% ใบ ${alert.ticketId} คาดว่า ${formatMd(ticket ? (projectedActual(ticket) ?? 0) : 0)} MD จาก estimate ${formatMd(ticket?.estimateMd ?? 0)} MD`;
      }
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

function timeEntryComment(
  comment: { raw?: string; html?: string } | string | null | undefined,
): string {
  if (!comment) return '';
  if (typeof comment === 'string') return comment.trim();
  const raw = comment.raw?.trim();
  if (raw) return raw;
  return (comment.html ?? '').replace(/<[^>]+>/g, '').trim();
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
