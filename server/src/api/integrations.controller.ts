import { Body, Controller, Get, Put, Post, Query, Req } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { collectAlerts, projectedActual } from '../../../shared/domain/alerts';
import { GitLabMergeRequestRaw, mapGitLabMergeRequests } from '../../../shared/domain/gitlab-mr';
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
import { validateMapping } from '../integrations/openproject/openproject.mapper';
import { OpenProjectSyncService } from '../integrations/openproject/openproject.sync';

@Controller('api')
export class IntegrationsController {
  constructor(
    private readonly db: Db,
    private readonly syncService: OpenProjectSyncService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Public()
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
      baseUrl: this.config.openproject.url || connection?.base_url || '',
      hasToken: envConfigured || hasDbToken,
      mapping: settings.openprojectMapping,
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

  @Public()
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

  @Public()
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
    const connection = await getConnection(this.db, 'gitlab');
    const stored = parseGitLabBaseUrl(connection?.base_url ?? '');
    const baseUrl = (this.config.gitlab.url || stored.baseUrl).replace(/\/+$/, '');
    const projectIds =
      this.config.gitlab.projectIds.length > 0 ? this.config.gitlab.projectIds : stored.projectIds;
    const token = this.config.gitlab.apiToken || connectionToken(connection, this.config.tokenEncKey);
    if (!baseUrl || !token || projectIds.length === 0) {
      return {
        ok: false,
        message: 'ยังไม่ได้ตั้งค่า GitLab URL, Project IDs หรือ API Token ในหน้า Integrations หรือ .env',
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
        const encoded = encodeURIComponent(projectId);
        const url = `${baseUrl}/api/v4/projects/${encoded}/merge_requests?state=merged&per_page=100`;
        const response = await fetch(url, {
          headers: {
            Accept: 'application/json',
            'PRIVATE-TOKEN': token,
          },
        });
        if (!response.ok) {
          const text = await response.text();
          errors.push(`Project ${projectId}: HTTP ${response.status} ${text.slice(0, 120)}`);
          continue;
        }
        const items = (await response.json()) as GitLabMergeRequestRaw[];
        if (Array.isArray(items)) {
          rawMrs.push(...items);
        }
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
      const nextTicket = {
        ...target,
        reviewRounds: commit.reviewRounds,
        reopenCount: commit.reopenCount > 0 ? commit.reopenCount : target.reopenCount,
        mrLink: commit.mrLink || target.mrLink,
      };
      const reviewAfter = scoreTicket(nextTicket).review;
      if (
        nextTicket.reviewRounds !== target.reviewRounds ||
        nextTicket.reopenCount !== target.reopenCount ||
        nextTicket.mrLink !== target.mrLink
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

  @Public()
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
