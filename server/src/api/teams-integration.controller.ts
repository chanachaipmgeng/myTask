import { Body, Controller, Get, Inject, Post, Put, Req } from '@nestjs/common';
import { collectAlerts, projectedActual } from '../../../shared/domain/alerts';
import { formatMd } from '../../../shared/domain/scoring';
import { AuthedRequest, Roles } from '../auth/auth.guard';
import { VisibilityScopeService } from '../auth/visibility-scope.service';
import { validateExternalUrl } from '../common/security';
import { APP_CONFIG, AppConfig } from '../config';
import { connectionToken, getConnection, getSettings, upsertConnection } from '../data/settings.repo';
import { finishSyncRun, listSyncRuns, listWorkItems, startSyncRun } from '../data/work-items.repo';
import { Db } from '../db/db.service';

@Controller('api')
export class TeamsIntegrationController {
  constructor(
    private readonly db: Db,
    private readonly scope: VisibilityScopeService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Get('integrations/teams')
  @Roles('admin', 'lead')
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
    const channel =
      (body.channel ?? existing?.base_url ?? this.config.teams.defaultChannel).trim() || 'dev-alerts';
    const cleanWebhookUrl =
      body.webhookUrl === undefined
        ? null
        : validateExternalUrl(body.webhookUrl, {
            production: this.config.production,
            allowedHosts: this.config.allowedIntegrationHosts,
            allowEmpty: true,
          });
    await upsertConnection(this.db, {
      id: 'teams',
      baseUrl: channel,
      token: cleanWebhookUrl,
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
      policySla?: boolean;
      dryRun?: boolean;
    },
    @Req() req: AuthedRequest,
  ) {
    const ctx = await this.scope.resolve(req.authUser);
    const [settings, connection, rawTickets] = await Promise.all([
      getSettings(this.db),
      getConnection(this.db, 'teams'),
      listWorkItems(this.db),
    ]);
    const tickets = ctx.isAdmin ? rawTickets : rawTickets.filter((t) => ctx.canAccessTicket(t));
    const channel = (
      body.channel ||
      connection?.base_url ||
      this.config.teams.defaultChannel ||
      'dev-alerts'
    ).trim();
    const includeDeadline = body.deadline ?? true;
    const includePolicySla = body.policySla ?? includeDeadline;
    const includeOverrun = body.overrun ?? true;
    const overrunPct = Math.max(0, Math.round((settings.alertRules.overrunLimit - 1) * 100));
    const alerts = collectAlerts(tickets, settings.alertRules.overrunLimit).filter((alert) => {
      if (alert.kind === 'policy-alert' || alert.kind === 'policy-breach') {
        return includePolicySla;
      }
      if (alert.kind === 'deadline') {
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
        text = `ช่อง ${channel}: actual มีแนวโน้มเกิน estimate มากกว่า ${overrunPct}% ใบ ${alert.ticketId} คาดว่า ${formatMd(ticket ? (projectedActual(ticket) ?? 0) : 0)} MD จาก estimate ${formatMd(ticket?.estimateMd ?? 0)} MD`;
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

    const webhookUrl =
      this.config.teams.webhookUrl ||
      connectionToken(connection, this.config.tokenEncKey, this.config.tokenEncKeyPrev);
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
        signal: AbortSignal.timeout(10_000),
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
