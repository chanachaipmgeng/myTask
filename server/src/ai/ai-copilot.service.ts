import { Inject, Injectable } from '@nestjs/common';
import { collectAlerts, projectedActual } from '../../../shared/domain/alerts';
import { cleanBranchToTicketTitle } from '../../../shared/domain/git-branch';
import { normalizeTrack, Person, Size, Ticket, TicketType, TrackCode } from '../../../shared/domain/models';
import { formatMd, scoreTicket } from '../../../shared/domain/scoring';
import { AuthUser } from '../auth/auth.types';
import { ScopeContext } from '../auth/visibility-scope.service';
import { APP_CONFIG, AppConfig } from '../config';
import { connectionToken, getConnection, getSettings } from '../data/settings.repo';
import { finishSyncRun, listWorkItems, startSyncRun } from '../data/work-items.repo';
import { Db } from '../db/db.service';

export interface AiChatHistoryItem {
  role: 'user' | 'assistant';
  text: string;
}

export interface AiChatRequest {
  message: string;
  history?: AiChatHistoryItem[];
  track?: string;
}

export interface AiChatResponse {
  ok: boolean;
  reply: string;
  provider: 'gemini' | 'rule-based';
  suggestions: string[];
  ticketIds: string[];
  generatedAt: string;
}

export interface AiBriefingMetrics {
  peopleCount: number;
  openCount: number;
  closedCount: number;
  closedMd: number;
  openMd: number;
  avgScore: number | null;
  alertCount: number;
  blockedCount: number;
  mdDirectCount: number;
  reopenTotal: number;
  freePeopleCount: number;
}

export interface AiBriefingResponse {
  ok: boolean;
  briefing: string;
  provider: 'gemini' | 'rule-based';
  period: 'daily' | 'weekly';
  sent: boolean;
  teamsMessage?: string;
  metrics: AiBriefingMetrics;
  generatedAt: string;
}

export interface CapacityEntry {
  personId: string;
  name: string;
  track: string;
  level: string;
  quota: number;
  openMd: number;
  freeMd: number;
  wipCount: number;
}

export interface ScopedSnapshot {
  people: Person[];
  tickets: Ticket[];
  openTickets: Ticket[];
  closedTickets: Ticket[];
  myOpenTickets: Ticket[];
  myClosedTickets: Ticket[];
  alerts: Array<{ kind: string; ticketId: string; title: string; assignee: string; detail: string }>;
  capacity: CapacityEntry[];
  metrics: AiBriefingMetrics;
}

const DEFAULT_LEVEL_QUOTA: Record<string, number> = {
  Senior: 4.5,
  Mid: 4.0,
  Junior: 3.5,
  FirstMonth: 2.5,
};

export function buildScopedSnapshot(
  people: Person[],
  tickets: Ticket[],
  selfId: string,
  overrunLimit = 1.5,
  levelQuotas: Record<string, number> = DEFAULT_LEVEL_QUOTA,
): ScopedSnapshot {
  const personById = new Map(people.map((p) => [p.id, p]));
  const openTickets = tickets.filter((t) => !t.closed);
  const closedTickets = tickets.filter((t) => t.closed);
  const myOpenTickets = openTickets.filter((t) => t.assigneeId === selfId);
  const myClosedTickets = closedTickets.filter((t) => t.assigneeId === selfId);

  const rawAlerts = collectAlerts(tickets, overrunLimit);
  const ticketById = new Map(tickets.map((t) => [t.id, t]));
  const alerts = rawAlerts.map((a) => {
    const t = ticketById.get(a.ticketId);
    const owner = t?.assigneeId ? (personById.get(t.assigneeId)?.nickname ?? t.assigneeId) : 'ยังไม่ระบุ';
    let detail = '';
    if (a.kind === 'policy-breach') {
      detail = `เกินกำหนด Policy Date (${t?.policyDate ?? '—'})`;
    } else if (a.kind === 'policy-alert') {
      detail = `ถึงวันเตือน Alert SLA (${t?.alertDate ?? '—'})`;
    } else if (a.kind === 'deadline') {
      detail = `เหลือ ${formatMd(t?.workingDaysLeft ?? 0)} วันทำการ`;
    } else {
      detail = `คาดใช้ ${formatMd(t ? (projectedActual(t) ?? 0) : 0)} MD จาก Est ${formatMd(t?.estimateMd ?? 0)} MD`;
    }
    return {
      kind: a.kind,
      ticketId: a.ticketId,
      title: t?.title || t?.module || a.ticketId,
      assignee: owner,
      detail,
    };
  });

  const capacity: CapacityEntry[] = people
    .map((p) => {
      const assigned = openTickets.filter((t) => t.assigneeId === p.id);
      const openMd = Number(assigned.reduce((s, t) => s + (t.estimateMd || 0), 0).toFixed(2));
      const quota = p.plannedMd > 0 ? p.plannedMd : (levelQuotas[p.level] ?? 4.0);
      const freeMd = Number(Math.max(0, quota - openMd).toFixed(2));
      const wipCount = assigned.filter((t) => {
        const st = t.workflowStatus || t.opStatus || '';
        return st === 'In Progress' || st === 'Code Review';
      }).length;
      return {
        personId: p.id,
        name: p.nickname || p.fullName,
        track: p.track,
        level: p.level,
        quota,
        openMd,
        freeMd,
        wipCount,
      };
    })
    .sort((a, b) => b.freeMd - a.freeMd || a.wipCount - b.wipCount);

  const closedScores = closedTickets
    .map((t) => scoreTicket(t).total)
    .filter((v): v is number => typeof v === 'number');
  const avgScore =
    closedScores.length > 0
      ? Number((closedScores.reduce((s, v) => s + v, 0) / closedScores.length).toFixed(1))
      : null;

  const metrics: AiBriefingMetrics = {
    peopleCount: people.length,
    openCount: openTickets.length,
    closedCount: closedTickets.length,
    closedMd: Number(closedTickets.reduce((s, t) => s + (t.estimateMd || 0), 0).toFixed(2)),
    openMd: Number(openTickets.reduce((s, t) => s + (t.estimateMd || 0), 0).toFixed(2)),
    avgScore,
    alertCount: alerts.length,
    blockedCount: openTickets.filter((t) => t.blocker || t.opStatus === 'Blocked').length,
    mdDirectCount: openTickets.filter((t) => t.isMdDirect).length,
    reopenTotal: tickets.reduce((s, t) => s + (t.reopenCount || 0), 0),
    freePeopleCount: capacity.filter((c) => c.freeMd >= 0.5 && c.wipCount <= 2).length,
  };

  return {
    people,
    tickets,
    openTickets,
    closedTickets,
    myOpenTickets,
    myClosedTickets,
    alerts,
    capacity,
    metrics,
  };
}

export function buildRuleBasedBriefing(
  snapshot: ScopedSnapshot,
  period: 'daily' | 'weekly',
): string {
  const m = snapshot.metrics;
  const label = period === 'daily' ? 'สรุปภาพรวมรายวัน (Daily Briefing)' : 'สรุปภาพรวมรายสัปดาห์ (Weekly Briefing)';
  const topAlerts = snapshot.alerts.slice(0, 5);
  const topFree = snapshot.capacity.filter((c) => c.freeMd >= 0.5).slice(0, 4);

  const lines: string[] = [
    `### 📊 ${label}`,
    `- **งานปิดแล้ว:** ${m.closedCount} ใบ (${formatMd(m.closedMd)} MD) · **คะแนนเฉลี่ย:** ${m.avgScore !== null ? `${m.avgScore}/100` : 'ยังไม่มีข้อมูล'}`,
    `- **งานกำลังดำเนินการ (Open):** ${m.openCount} ใบ (${formatMd(m.openMd)} MD) · **Blocked:** ${m.blockedCount} ใบ · **งานด่วน MD-Direct:** ${m.mdDirectCount} ใบ`,
    `- **แจ้งเตือน SLA / Overrun:** ${m.alertCount} รายการ · **ยอด Reopen สะสม:** ${m.reopenTotal} ครั้ง`,
  ];

  if (topAlerts.length > 0) {
    lines.push('', '**🚨 ใบงานที่ต้องเร่งติดตาม (Top Alerts):**');
    for (const a of topAlerts) {
      lines.push(`- **${a.ticketId}** (${a.assignee}) — ${a.detail}`);
    }
  } else {
    lines.push('', '**✅ สถานะ SLA:** ไม่มีใบงานที่เสี่ยงเกิน SLA หรือ Overrun ในขณะนี้');
  }

  if (topFree.length > 0) {
    lines.push('', '**👥 พนักงานที่ยังมีคิวว่างพร้อมรับงาน:**');
    for (const c of topFree) {
      lines.push(`- **${c.name}** (${c.track}) — ว่าง ${formatMd(c.freeMd)} MD (WIP ${c.wipCount} ใบ)`);
    }
  }

  return lines.join('\n');
}

export function answerDeterministic(
  rawMessage: string,
  snapshot: ScopedSnapshot,
  selfName: string,
): { reply: string; suggestions: string[]; ticketIds: string[] } {
  const msg = rawMessage.trim();
  const lower = msg.toLowerCase();

  // 1. Specific Ticket ID lookup (e.g., OP-73421, IMP-100, RD-12)
  const idMatch = msg.match(/\b([A-Za-z]{2,6}-\d{1,7})\b/);
  if (idMatch) {
    const queryId = idMatch[1]!.toUpperCase();
    const found = snapshot.tickets.find((t) => t.id.toUpperCase() === queryId);
    if (found) {
      const owner = snapshot.people.find((p) => p.id === found.assigneeId)?.nickname || found.assigneeId || 'ยังไม่ระบุ';
      const scoreVal = found.closed ? scoreTicket(found).total : null;
      const scoreText = scoreVal !== null ? `${scoreVal}/100` : 'ยังไม่ปิดงาน';
      const stageLabel = found.workflowStatus || found.opStatus || (found.closed ? 'Done' : 'In Progress');
      const lines = [
        `### 🎫 รายละเอียดใบงาน **${found.id}**`,
        `- **เรื่อง:** ${found.title || found.module}`,
        `- **สถานะ:** ${stageLabel}${found.blocker ? ' (Blocked)' : ''}${found.isMdDirect ? ' · [MD-DIRECT]' : ''}`,
        `- **ผู้รับผิดชอบ:** ${owner} (${found.track})`,
        `- **เวลา:** Estimate ${formatMd(found.estimateMd)} MD · Actual ${formatMd(found.actualMd)} MD`,
        `- **กำหนดส่ง:** ${found.firstDueOn || found.dueOn || '—'} · **คะแนน:** ${scoreText} · **Reopen:** ${found.reopenCount || 0} ครั้ง`,
      ];
      return {
        reply: lines.join('\n'),
        suggestions: ['ใบงานไหนเสี่ยงเกิน SLA?', 'สัปดาห์นี้ใครคิวว่างบ้าง?', 'สรุปภาพรวมทีม'],
        ticketIds: [found.id],
      };
    }
    return {
      reply: `ไม่พบใบงาน **${queryId}** ในขอบเขตสิทธิ์ที่คุณเข้าถึงได้ครับ ลองตรวจสอบรหัสใบงานอีกครั้ง`,
      suggestions: ['สรุปงานของฉันตอนนี้', 'ใบงานไหนเสี่ยงเกิน SLA?'],
      ticketIds: [],
    };
  }

  // 2. Capacity / Who is free
  if (/ว่าง|คิว|จ่ายงาน|capacity|assign|รับงาน/.test(lower)) {
    const trackMatch = msg.toUpperCase().match(/\b(IMP|RND|RD|QA|UXBA|SUP|INFRA)\b/);
    const wantedTrack = trackMatch ? trackMatch[1] : null;
    const pool = snapshot.capacity.filter((c) => {
      if (!wantedTrack) return true;
      if (wantedTrack === 'RD' || wantedTrack === 'RND') return c.track === 'RD' || c.track === 'RND';
      if (wantedTrack === 'IMP') return c.track === 'IMP' || c.track === 'Implement';
      return c.track.toUpperCase() === wantedTrack;
    });
    const available = pool.filter((c) => c.freeMd > 0).slice(0, 6);
    if (available.length === 0) {
      return {
        reply: `ขณะนี้ไม่มีพนักงาน${wantedTrack ? `สาย **${wantedTrack}** ` : ''}ที่ยังมีโควต้าว่างเหลืออยู่ครับ (ทีมในขอบเขตมีทั้งหมด ${pool.length} คน)`,
        suggestions: ['ใบงานไหนเสี่ยงเกิน SLA?', 'สรุปภาพรวมทีม'],
        ticketIds: [],
      };
    }
    const lines = [
      `### 👥 รายชื่อผู้ที่ยังมีคิวว่าง${wantedTrack ? ` (สาย ${wantedTrack})` : ''}`,
      ...available.map(
        (c, idx) =>
          `${idx + 1}. **${c.name}** (${c.track} · ${c.level}) — ว่าง **${formatMd(c.freeMd)} MD** จากโควต้า ${formatMd(c.quota)} MD (เปิดอยู่ ${formatMd(c.openMd)} MD · WIP ${c.wipCount} ใบ)`,
      ),
    ];
    return {
      reply: lines.join('\n'),
      suggestions: ['ใบงานไหนเสี่ยงเกิน SLA?', 'สรุป Executive Briefing ทีม', 'สรุปงานของฉันตอนนี้'],
      ticketIds: [],
    };
  }

  // 3. SLA / Alerts / Overrun / Blocked
  if (/sla|ค้าง|แจ้งเตือน|alert|overrun|เกิน|block|เสี่ยง|ล่าช้า/.test(lower)) {
    const top = snapshot.alerts.slice(0, 6);
    if (top.length === 0) {
      return {
        reply: `✅ ขณะนี้ไม่พบใบงานที่เกิน SLA หรือมีแนวโน้ม Overrun ในขอบเขตของคุณครับ (งานเปิดอยู่ทั้งหมด ${snapshot.metrics.openCount} ใบ)`,
        suggestions: ['สัปดาห์นี้ใครคิวว่างบ้าง?', 'สรุปภาพรวมทีม'],
        ticketIds: [],
      };
    }
    const lines = [
      `### 🚨 ใบงานที่ต้องเฝ้าระวัง SLA / Overrun (${snapshot.alerts.length} รายการ)`,
      ...top.map((a) => `- **${a.ticketId}** (${a.assignee}) — ${a.detail} · ${a.title.slice(0, 56)}`),
    ];
    return {
      reply: lines.join('\n'),
      suggestions: ['สัปดาห์นี้ใครคิวว่างบ้าง?', 'สรุป Executive Briefing ทีม'],
      ticketIds: Array.from(new Set(top.map((a) => a.ticketId))),
    };
  }

  // 4. My work
  if (/ของฉัน|งานฉัน|งานเรา|my work|ค้างอะไร/.test(lower)) {
    const open = snapshot.myOpenTickets.slice(0, 6);
    const closedCount = snapshot.myClosedTickets.length;
    const myScores = snapshot.myClosedTickets
      .map((t) => scoreTicket(t).total)
      .filter((v): v is number => typeof v === 'number');
    const myAvg =
      myScores.length > 0
        ? (myScores.reduce((s, v) => s + v, 0) / myScores.length).toFixed(1)
        : '—';
    const lines = [
      `### 🧑‍💻 สรุปงานของ **${selfName}**`,
      `- **งานที่เปิดอยู่:** ${snapshot.myOpenTickets.length} ใบ · **งานปิดแล้ว:** ${closedCount} ใบ · **คะแนนเฉลี่ย:** ${myAvg}`,
    ];
    if (open.length > 0) {
      lines.push('', '**รายการงานที่กำลังทำ/ค้างอยู่:**');
      for (const t of open) {
        const st = t.workflowStatus || t.opStatus || 'In Progress';
        lines.push(`- **${t.id}** [${st}] ${t.title || t.module} (${formatMd(t.estimateMd)} MD · ส่ง ${t.firstDueOn || t.dueOn || '—'})`);
      }
    } else {
      lines.push('', '🎉 ไม่มีใบงานค้างในมือขณะนี้');
    }
    return {
      reply: lines.join('\n'),
      suggestions: ['ใบงานไหนเสี่ยงเกิน SLA?', 'สัปดาห์นี้ใครคิวว่างบ้าง?'],
      ticketIds: open.map((t) => t.id),
    };
  }

  // 5. Team Briefing / Score / Overview
  if (/briefing|สรุป|ภาพรวม|คะแนน|score|ทีม|reopen/.test(lower)) {
    return {
      reply: buildRuleBasedBriefing(snapshot, 'weekly'),
      suggestions: ['สัปดาห์นี้ใครคิวว่างบ้าง?', 'ใบงานไหนเสี่ยงเกิน SLA?', 'สรุปงานของฉันตอนนี้'],
      ticketIds: snapshot.alerts.slice(0, 4).map((a) => a.ticketId),
    };
  }

  // 6. Default helpful response
  const m = snapshot.metrics;
  return {
    reply: [
      `สวัสดีครับ **${selfName}** ผมคือผู้ช่วย AI ของระบบ myTask (Man-day Scorecard)`,
      `ตอนนี้ในขอบเขตของคุณมีงานเปิดอยู่ **${m.openCount} ใบ** (${formatMd(m.openMd)} MD), แจ้งเตือน SLA **${m.alertCount} รายการ** และคนที่มีคิวว่าง **${m.freePeopleCount} คน**`,
      '',
      'ลองถามหรือกดปุ่มไมโครโฟนเพื่อพูดคำสั่งได้เลย เช่น:',
      '- *"สัปดาห์นี้ใครคิวว่างบ้างสาย IMP?"*',
      '- *"ใบงานไหนเสี่ยงเกิน SLA?"*',
      '- *"สรุปงานของฉันตอนนี้"* หรือระบุรหัสใบงานเช่น *"สถานะ OP-73421"*',
    ].join('\n'),
    suggestions: ['สัปดาห์นี้ใครคิวว่างบ้าง?', 'ใบงานไหนเสี่ยงเกิน SLA?', 'สรุปงานของฉันตอนนี้', 'สรุป Executive Briefing ทีม'],
    ticketIds: [],
  };
}

@Injectable()
export class AiCopilotService {
  constructor(
    private readonly db: Db,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  private geminiKey(): string {
    return (this.config.geminiApiKey || process.env['GEMINI_API_KEY'] || '').trim();
  }

  async getStatus() {
    const conn = await getConnection(this.db, 'teams');
    const teamsConfigured = Boolean(this.config.teams.webhookUrl || (conn?.token_enc && conn?.enabled));
    const hasGemini = Boolean(this.geminiKey());
    return {
      ok: true,
      provider: hasGemini ? ('gemini' as const) : ('rule-based' as const),
      model: hasGemini ? 'gemini-2.5-flash' : 'local-smart-engine',
      voiceSupported: true,
      teamsConfigured,
    };
  }

  private async loadScopedSnapshot(ctxScope: ScopeContext, trackFilter?: string): Promise<ScopedSnapshot> {
    const [settings, rawTickets] = await Promise.all([
      getSettings(this.db),
      listWorkItems(this.db),
    ]);
    let tickets = ctxScope.isAdmin ? rawTickets : rawTickets.filter((t) => ctxScope.canAccessTicket(t));
    let people = ctxScope.visiblePeople;

    const cleanTrack = trackFilter?.trim();
    if (cleanTrack && cleanTrack !== 'All') {
      people = people.filter((p) => p.track === cleanTrack);
      const ids = new Set(people.map((p) => p.id));
      tickets = tickets.filter((t) => t.track === cleanTrack || (t.assigneeId && ids.has(t.assigneeId)));
    }

    return buildScopedSnapshot(
      people,
      tickets,
      ctxScope.selfId,
      settings.alertRules?.overrunLimit ?? 1.5,
      settings.weeklyQuotas as unknown as Record<string, number> | undefined,
    );
  }

  async chat(
    ctxScope: ScopeContext,
    authUser: AuthUser,
    body: AiChatRequest,
  ): Promise<AiChatResponse> {
    const message = (body.message ?? '').trim().slice(0, 1200);
    if (!message) {
      return {
        ok: false,
        reply: 'กรุณาพิมพ์หรือพูดคำถามที่ต้องการครับ',
        provider: 'rule-based',
        suggestions: ['สัปดาห์นี้ใครคิวว่างบ้าง?', 'ใบงานไหนเสี่ยงเกิน SLA?', 'สรุปงานของฉันตอนนี้'],
        ticketIds: [],
        generatedAt: new Date().toISOString(),
      };
    }

    const snapshot = await this.loadScopedSnapshot(ctxScope, body.track);
    const selfName = authUser.person.nickname || authUser.person.fullName;
    const deterministic = answerDeterministic(message, snapshot, selfName);
    const apiKey = this.geminiKey();

    if (apiKey) {
      try {
        const llmReply = await this.callGeminiChat(apiKey, message, body.history ?? [], snapshot, selfName, authUser.access);
        if (llmReply) {
          const mentionedIds = Array.from(
            new Set(
              (llmReply.match(/\b[A-Za-z]{2,6}-\d{1,7}\b/g) ?? [])
                .map((id) => id.toUpperCase())
                .filter((id) => snapshot.tickets.some((t) => t.id.toUpperCase() === id)),
            ),
          ).slice(0, 8);
          await this.db.audit(authUser.person.id, 'ai.chat', 'gemini', { length: message.length });
          return {
            ok: true,
            reply: llmReply,
            provider: 'gemini',
            suggestions: deterministic.suggestions,
            ticketIds: mentionedIds.length > 0 ? mentionedIds : deterministic.ticketIds,
            generatedAt: new Date().toISOString(),
          };
        }
      } catch {
        // Fall back cleanly to deterministic engine
      }
    }

    await this.db.audit(authUser.person.id, 'ai.chat', 'rule-based', { length: message.length });
    return {
      ok: true,
      reply: deterministic.reply,
      provider: 'rule-based',
      suggestions: deterministic.suggestions,
      ticketIds: deterministic.ticketIds,
      generatedAt: new Date().toISOString(),
    };
  }

  async briefing(
    ctxScope: ScopeContext,
    authUser: AuthUser,
    body: { period?: 'daily' | 'weekly'; channel?: string; sendToTeams?: boolean },
  ): Promise<AiBriefingResponse> {
    const period: 'daily' | 'weekly' = body.period === 'daily' ? 'daily' : 'weekly';
    const snapshot = await this.loadScopedSnapshot(ctxScope);
    const fallbackText = buildRuleBasedBriefing(snapshot, period);
    const apiKey = this.geminiKey();

    let briefingText = fallbackText;
    let provider: 'gemini' | 'rule-based' = 'rule-based';

    if (apiKey) {
      try {
        const llmText = await this.callGeminiBriefing(apiKey, snapshot, period);
        if (llmText) {
          briefingText = llmText;
          provider = 'gemini';
        }
      } catch {
        // Fallback to rule-based briefing
      }
    }

    let sent = false;
    let teamsMessage: string | undefined;

    if (body.sendToTeams) {
      const connection = await getConnection(this.db, 'teams');
      const channel = (
        body.channel ||
        connection?.base_url ||
        this.config.teams.defaultChannel ||
        'dev-alerts'
      ).trim();
      const webhookUrl =
        this.config.teams.webhookUrl ||
        connectionToken(connection, this.config.tokenEncKey, this.config.tokenEncKeyPrev);

      if (!webhookUrl) {
        teamsMessage = 'ยังไม่ได้ตั้งค่า TEAMS_WEBHOOK_URL ใน .env หรือหน้า Integrations';
      } else {
        const runId = await startSyncRun(this.db, {
          connection: 'teams',
          trigger: 'manual',
          startedBy: authUser.person.id,
          since: null,
        });
        try {
          const payloadText = `**myTask AI ${period === 'daily' ? 'Daily' : 'Weekly'} Briefing · ช่อง ${channel}**\n\n${briefingText}`;
          const res = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: payloadText }),
            signal: AbortSignal.timeout(10_000),
          });
          if (!res.ok) {
            const errBody = await res.text();
            teamsMessage = `Teams webhook HTTP ${res.status}: ${errBody.slice(0, 140)}`;
            await finishSyncRun(this.db, runId, {
              status: 'failed',
              added: 0,
              updated: 0,
              unchanged: 0,
              errors: [teamsMessage],
            });
          } else {
            sent = true;
            teamsMessage = `ส่ง AI Briefing เข้าช่อง ${channel} เรียบร้อยแล้ว`;
            await finishSyncRun(this.db, runId, {
              status: 'success',
              added: 1,
              updated: 0,
              unchanged: 0,
              errors: [],
            });
            await this.db.audit(authUser.person.id, 'ai.briefing.teams', channel, { period, provider });
          }
        } catch (err) {
          teamsMessage = err instanceof Error ? err.message : String(err);
          await finishSyncRun(this.db, runId, {
            status: 'failed',
            added: 0,
            updated: 0,
            unchanged: 0,
            errors: [teamsMessage],
          });
        }
      }
    }

    return {
      ok: true,
      briefing: briefingText,
      provider,
      period,
      sent,
      teamsMessage,
      metrics: snapshot.metrics,
      generatedAt: new Date().toISOString(),
    };
  }

  private async callGeminiChat(
    apiKey: string,
    message: string,
    history: AiChatHistoryItem[],
    snapshot: ScopedSnapshot,
    selfName: string,
    role: string,
  ): Promise<string | null> {
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
    const compactContext = {
      viewer: { name: selfName, role },
      metrics: snapshot.metrics,
      topFreeCapacity: snapshot.capacity.slice(0, 10),
      topAlerts: snapshot.alerts.slice(0, 12),
      myOpenTickets: snapshot.myOpenTickets.slice(0, 10).map((t) => ({
        id: t.id,
        title: t.title || t.module,
        status: t.workflowStatus || t.opStatus || 'In Progress',
        estimateMd: t.estimateMd,
        actualMd: t.actualMd,
        dueOn: t.firstDueOn || t.dueOn,
      })),
    };
    const systemText = `คุณคือผู้ช่วย AI ประจำระบบ myTask (Man-day Scorecard) ตอบคำถามเป็นภาษาไทยที่กระชับ ชัดเจน เป็นกันเอง และอ้างอิงเฉพาะข้อมูลจริงใน JSON ด้านล่างนี้เท่านั้น (ห้ามแต่งตัวเลขหรือรหัสใบงานเอง)
หากกล่าวถึงใบงานให้ระบุรหัสใบงานตรงตัว (เช่น OP-73421)
บริบทข้อมูลที่ผ่านการกรองสิทธิ์แล้ว:
${JSON.stringify(compactContext)}`;

    const contents = [
      ...history.slice(-6).map((h) => ({
        role: h.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: h.text.slice(0, 800) }],
      })),
      { role: 'user', parts: [{ text: message }] },
    ];

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemText }] },
        contents,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    return data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
  }

  private async callGeminiBriefing(
    apiKey: string,
    snapshot: ScopedSnapshot,
    period: 'daily' | 'weekly',
  ): Promise<string | null> {
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
    const prompt = `สรุป Executive Briefing แบบ${period === 'daily' ? 'รายวัน' : 'รายสัปดาห์'} สำหรับส่งเข้า Microsoft Teams ของทีมพัฒนาซอฟต์แวร์
เงื่อนไข:
- ใช้ภาษาไทยแบบกระชับ อ่านจบใน 30 วินาที เป็น Markdown bullet points
- ไม่ใส่ลำดับคะแนนรายบุคคล (เพื่อความเหมาะสมในช่องรวม)
- เน้น 3 หัวข้อ: 1) ภาพรวมความคืบหน้า & คะแนนเฉลี่ย 2) ใบงานเสี่ยง SLA/Blocked ที่ต้องปลดล็อก 3) กำลังคนว่างที่พร้อมรับงานต่อ
ข้อมูลจริง:
${JSON.stringify({
  metrics: snapshot.metrics,
  topAlerts: snapshot.alerts.slice(0, 6),
  freeCapacity: snapshot.capacity.filter((c) => c.freeMd >= 0.5).slice(0, 5),
})}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    return data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
  }

  async recommendAssignees(
    ctxScope: ScopeContext,
    authUser: AuthUser,
    body: {
      ticketId?: string;
      title?: string;
      module?: string;
      track?: string;
      estimateMd?: number;
    },
  ): Promise<AiRecommendAssigneesResponse> {
    const [settings, rawTickets] = await Promise.all([
      getSettings(this.db),
      listWorkItems(this.db),
    ]);
    const tickets = ctxScope.isAdmin ? rawTickets : rawTickets.filter((t) => ctxScope.canAccessTicket(t));
    const existing = body.ticketId
      ? tickets.find((t) => t.id.toUpperCase() === body.ticketId!.trim().toUpperCase())
      : undefined;

    const target: SkillMatchTarget = {
      ticketId: existing?.id ?? body.ticketId ?? '',
      title: existing?.title || body.title || '',
      module: existing?.module || body.module || '',
      track: existing?.track || body.track || 'IMP',
      estimateMd: existing?.estimateMd ?? body.estimateMd ?? 1.0,
    };

    const recommendations = recommendAssigneesForTicket(
      target,
      ctxScope.visiblePeople,
      tickets,
      settings.weeklyQuotas as unknown as Record<string, number> | undefined,
    );

    await this.db.audit(authUser.person.id, 'ai.recommend_assignees', target.ticketId || 'adhoc', {
      topPersonId: recommendations[0]?.personId ?? null,
      count: recommendations.length,
    });

    return {
      ok: true,
      ticketId: target.ticketId,
      provider: 'skill-match',
      recommendations,
    };
  }

  async draftTicketFromBranch(
    authUser: AuthUser,
    body: {
      branchName: string;
      projectName?: string;
      lastCommitTitle?: string;
      authorName?: string;
    },
  ): Promise<AiBranchDraftResponse> {
    const branchName = (body.branchName ?? '').trim();
    const heuristic = draftTicketFromBranchHeuristic({
      branchName,
      projectName: body.projectName,
      lastCommitTitle: body.lastCommitTitle,
      authorName: body.authorName,
    });

    const apiKey = this.geminiKey();
    if (apiKey && branchName) {
      try {
        const aiDraft = await this.callGeminiBranchDraft(apiKey, body, heuristic);
        if (aiDraft) {
          await this.db.audit(authUser.person.id, 'ai.draft_branch', branchName, { provider: 'gemini' });
          return { ok: true, provider: 'gemini', draft: aiDraft };
        }
      } catch {
        // Fall back cleanly to heuristic parser
      }
    }

    await this.db.audit(authUser.person.id, 'ai.draft_branch', branchName || 'unknown', { provider: 'rule-based' });
    return { ok: true, provider: 'rule-based', draft: heuristic };
  }

  private async callGeminiBranchDraft(
    apiKey: string,
    input: { branchName: string; projectName?: string; lastCommitTitle?: string; authorName?: string },
    fallback: BranchTicketDraft,
  ): Promise<BranchTicketDraft | null> {
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
    const prompt = `แปลงข้อมูล Git Branch ต่อไปนี้เป็นร่างใบงานสำหรับระบบ OpenProject (myProject) ตอบเป็น JSON ล้วนเท่านั้น (ไม่มี markdown code fence)
Schema:
{"subject":"หัวข้อใบงานที่อ่านเข้าใจง่าย","module":"ชื่อโมดูลสั้นๆ","track":"IMP|RND|QA|UXBA|SUP|INFRA","type":"Feature|CR|Bug-Fix|Bug-Investigate|Spike|Ops|TechDebt","size":"XS|S|M|L|XL","estimateMd":1.0,"reasoning":"เหตุผลสั้นๆ 1 ประโยคภาษาไทย"}

ข้อมูล Branch:
- branchName: ${input.branchName}
- projectName: ${input.projectName ?? ''}
- lastCommitTitle: ${input.lastCommitTitle ?? ''}
- authorName: ${input.authorName ?? ''}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json' },
      }),
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!rawText) return null;
    const parsed = JSON.parse(rawText) as Partial<BranchTicketDraft>;
    const validTypes: TicketType[] = ['Feature', 'CR', 'Bug-Fix', 'Bug-Investigate', 'Spike', 'Ops', 'TechDebt'];
    const validSizes: Size[] = ['XS', 'S', 'M', 'L', 'XL'];
    const est = Number(parsed.estimateMd);
    return {
      subject: (parsed.subject || fallback.subject).trim().slice(0, 180),
      module: (parsed.module || fallback.module).trim().slice(0, 60),
      track: normalizeTrack(parsed.track || fallback.track),
      type: validTypes.includes(parsed.type as TicketType) ? (parsed.type as TicketType) : fallback.type,
      size: validSizes.includes(parsed.size as Size) ? (parsed.size as Size) : fallback.size,
      estimateMd: Number.isFinite(est) && est >= 0.25 && est <= 20 ? Number(est.toFixed(2)) : fallback.estimateMd,
      reasoning: (parsed.reasoning || fallback.reasoning).trim().slice(0, 240),
    };
  }

  async estimateEffort(
    ctxScope: ScopeContext,
    authUser: AuthUser,
    body: {
      title: string;
      module?: string;
      track?: string;
      type?: string;
      currentEstimateMd?: number;
    },
  ): Promise<AiEffortEstimateResponse> {
    const rawTickets = await listWorkItems(this.db);
    const scopedTickets = ctxScope.isAdmin ? rawTickets : rawTickets.filter((t) => ctxScope.canAccessTicket(t));
    const closedTickets = scopedTickets.filter((t) => t.closed && (t.actualMd > 0 || t.estimateMd > 0));
    const result = estimateEffortFromHistory(body, closedTickets);

    await this.db.audit(authUser.person.id, 'ai.estimate_effort', body.module || 'adhoc', {
      recommendedMd: result.recommendedMd,
      confidence: result.confidence,
      matches: result.similarTickets.length,
    });

    return { ok: true, provider: 'similarity', ...result };
  }

  async disputeCopilot(
    ctxScope: ScopeContext,
    authUser: AuthUser,
    body: {
      mode: 'draft' | 'review';
      ticketId: string;
      rawText?: string;
      requestedFlag?: string;
      disputeReason?: string;
    },
  ): Promise<AiDisputeCopilotResponse> {
    const mode: 'draft' | 'review' = body.mode === 'review' ? 'review' : 'draft';
    if (mode === 'review' && authUser.access === 'member') {
      return {
        ok: false,
        mode,
        provider: 'rule-based',
        suggestedFlag: 'BLK',
        polishedReason: '',
        summary: 'สิทธิ์ member ไม่สามารถใช้โหมดสรุปหลักฐานสำหรับผู้อนุมัติได้',
        verdict: 'REVIEW_CAREFULLY',
        evidencePoints: [],
      };
    }

    const rawTickets = await listWorkItems(this.db);
    const ticketId = (body.ticketId ?? '').trim();
    const ticket = rawTickets.find((t) => t.id.toUpperCase() === ticketId.toUpperCase()) ?? null;
    if (ticket && !ctxScope.isAdmin && !ctxScope.canAccessTicket(ticket)) {
      return {
        ok: false,
        mode,
        provider: 'rule-based',
        suggestedFlag: 'BLK',
        polishedReason: '',
        summary: 'ไม่มีสิทธิ์เข้าถึงใบงานนี้',
        verdict: 'REVIEW_CAREFULLY',
        evidencePoints: [],
      };
    }

    const heuristic = buildDisputeCopilotHeuristic(
      mode,
      ticket,
      body.rawText ?? '',
      body.requestedFlag ?? '',
      body.disputeReason ?? '',
    );

    const apiKey = this.geminiKey();
    if (apiKey && mode === 'draft' && (body.rawText ?? '').trim().length >= 6) {
      try {
        const polished = await this.callGeminiDisputeDraft(apiKey, ticket, body.rawText ?? '', heuristic);
        if (polished) {
          await this.db.audit(authUser.person.id, 'ai.dispute_copilot', `${mode}:${ticketId}`, { provider: 'gemini' });
          return { ok: true, mode, provider: 'gemini', ...polished };
        }
      } catch {
        // Fallback to heuristic
      }
    }

    await this.db.audit(authUser.person.id, 'ai.dispute_copilot', `${mode}:${ticketId}`, { provider: 'rule-based' });
    return { ok: true, mode, provider: 'rule-based', ...heuristic };
  }

  private async callGeminiDisputeDraft(
    apiKey: string,
    ticket: Ticket | null,
    rawText: string,
    fallback: Omit<AiDisputeCopilotResponse, 'ok' | 'mode' | 'provider'>,
  ): Promise<Omit<AiDisputeCopilotResponse, 'ok' | 'mode' | 'provider'> | null> {
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
    const prompt = `ช่วยเรียบเรียงเหตุผลคำขอทบทวนคะแนนใบงานให้กระชับ สุภาพ เป็นมืออาชีพแบบอิงข้อเท็จจริง และเลือก VarianceCode ที่เหมาะสมที่สุด ตอบเป็น JSON ล้วนเท่านั้น:
{"suggestedFlag":"BLK|ENV|REQ","polishedReason":"เหตุผลภาษาไทยที่เรียบเรียงแล้ว 2-3 ประโยค","summary":"สรุปสั้น 1 ประโยค"}

ใบงาน: ${ticket ? `${ticket.id} (${ticket.title || ticket.module}, Est ${ticket.estimateMd} MD, Actual ${ticket.actualMd} MD)` : 'ไม่ระบุ'}
ข้อความดิบจากพนักงาน: ${rawText}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json' },
      }),
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { suggestedFlag?: string; polishedReason?: string; summary?: string };
    const flag = parsed.suggestedFlag === 'ENV' || parsed.suggestedFlag === 'REQ' || parsed.suggestedFlag === 'BLK'
      ? parsed.suggestedFlag
      : fallback.suggestedFlag;
    return {
      ...fallback,
      suggestedFlag: flag,
      polishedReason: (parsed.polishedReason || fallback.polishedReason).trim().slice(0, 600),
      summary: (parsed.summary || fallback.summary).trim().slice(0, 240),
    };
  }
}

export interface SkillMatchTarget {
  ticketId: string;
  title: string;
  module: string;
  track: string;
  estimateMd: number;
}

export interface AssigneeRecommendation {
  personId: string;
  name: string;
  track: string;
  level: string;
  matchScore: number;
  breakdown: {
    skillScore: number;
    capacityScore: number;
    wipScore: number;
    qualityScore: number;
  };
  freeMd: number;
  quota: number;
  openMd: number;
  wipCount: number;
  moduleHistoryCount: number;
  avgScore: number | null;
  reasons: string[];
}

export interface AiRecommendAssigneesResponse {
  ok: boolean;
  ticketId: string;
  provider: 'skill-match';
  recommendations: AssigneeRecommendation[];
}

export interface BranchTicketDraft {
  subject: string;
  module: string;
  track: TrackCode;
  type: TicketType;
  size: Size;
  estimateMd: number;
  reasoning: string;
}

export interface AiBranchDraftResponse {
  ok: boolean;
  provider: 'gemini' | 'rule-based';
  draft: BranchTicketDraft;
}

function tokenizeKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9ก-๙]+/i)
    .map((w) => w.trim())
    .filter((w) => w.length >= 3);
}

export function recommendAssigneesForTicket(
  target: SkillMatchTarget,
  people: Person[],
  allTickets: Ticket[],
  levelQuotas: Record<string, number> = DEFAULT_LEVEL_QUOTA,
): AssigneeRecommendation[] {
  const targetTrack = normalizeTrack(target.track);
  const targetModuleLower = target.module.trim().toLowerCase();
  const targetTokens = new Set(tokenizeKeywords(`${target.module} ${target.title}`));
  const needMd = Math.max(0.25, Number(target.estimateMd) || 1.0);

  const scored: AssigneeRecommendation[] = people.map((p) => {
    const pTrack = normalizeTrack(p.track);
    const personTickets = allTickets.filter((t) => t.assigneeId === p.id);
    const openTickets = personTickets.filter((t) => !t.closed);
    const closedTickets = personTickets.filter((t) => t.closed);

    // 1. Skill & Track Affinity (0 - 40)
    let trackPoints = 4;
    if (pTrack === targetTrack) {
      trackPoints = 24;
    } else if (
      (pTrack === 'IMP' && targetTrack === 'RND') ||
      (pTrack === 'RND' && targetTrack === 'IMP')
    ) {
      trackPoints = 12;
    }

    let moduleMatches = 0;
    let keywordHits = 0;
    for (const t of personTickets) {
      if (targetModuleLower && t.module?.trim().toLowerCase() === targetModuleLower) {
        moduleMatches += 1;
      } else if (targetTokens.size > 0) {
        const hay = `${t.module ?? ''} ${t.title ?? ''}`.toLowerCase();
        for (const tok of targetTokens) {
          if (hay.includes(tok)) {
            keywordHits += 1;
            break;
          }
        }
      }
    }
    const skillPoints = Math.min(16, moduleMatches * 5 + keywordHits * 2);
    const skillScore = Math.min(40, trackPoints + skillPoints);

    // 2. Free Capacity (0 - 30)
    const openMd = Number(openTickets.reduce((s, t) => s + (t.estimateMd || 0), 0).toFixed(2));
    const quota = p.plannedMd > 0 ? p.plannedMd : (levelQuotas[p.level] ?? 4.0);
    const freeMd = Number(Math.max(0, quota - openMd).toFixed(2));
    let capacityScore: number;
    if (freeMd >= needMd) {
      capacityScore = Math.min(30, Math.round(24 + Math.min(6, (freeMd - needMd) * 2)));
    } else {
      capacityScore = Math.round((freeMd / Math.max(0.5, needMd)) * 20);
    }

    // 3. WIP Balance (0 - 15)
    const wipCount = openTickets.filter((t) => {
      const st = t.workflowStatus || t.opStatus || '';
      return st === 'In Progress' || st === 'Code Review';
    }).length;
    const wipScore = wipCount === 0 ? 15 : wipCount === 1 ? 12 : wipCount === 2 ? 7 : 2;

    // 4. Quality Track Record (0 - 15)
    const closedScores = closedTickets
      .map((t) => scoreTicket(t).total)
      .filter((v): v is number => typeof v === 'number');
    const avgScore =
      closedScores.length > 0
        ? Number((closedScores.reduce((s, v) => s + v, 0) / closedScores.length).toFixed(1))
        : null;
    const avgReopen =
      closedTickets.length > 0
        ? closedTickets.reduce((s, t) => s + (t.reopenCount || 0), 0) / closedTickets.length
        : 0;
    const baseQuality = avgScore !== null ? Math.round((avgScore / 100) * 15) : 11;
    const qualityScore = Math.max(2, Math.min(15, Math.round(baseQuality - Math.min(4, avgReopen * 3))));

    const matchScore = Math.min(100, skillScore + capacityScore + wipScore + qualityScore);

    const reasons: string[] = [];
    if (pTrack === targetTrack) {
      reasons.push(`ตรงสายงาน ${pTrack}`);
    } else {
      reasons.push(`สายงาน ${pTrack}`);
    }
    if (moduleMatches > 0) {
      reasons.push(`เคยทำโมดูล ${target.module} มาแล้ว ${moduleMatches} ใบ`);
    } else if (keywordHits > 0) {
      reasons.push(`มีประสบการณ์งานคล้ายกัน ${keywordHits} ใบ`);
    }
    reasons.push(
      freeMd >= needMd
        ? `คิวว่าง ${formatMd(freeMd)} MD เพียงพอ (WIP ${wipCount})`
        : `คิวว่าง ${formatMd(freeMd)} MD (WIP ${wipCount})`,
    );
    if (avgScore !== null) {
      reasons.push(`คะแนนเฉลี่ย ${avgScore}`);
    }

    return {
      personId: p.id,
      name: p.nickname || p.fullName,
      track: p.track,
      level: p.level,
      matchScore,
      breakdown: {
        skillScore,
        capacityScore,
        wipScore,
        qualityScore,
      },
      freeMd,
      quota,
      openMd,
      wipCount,
      moduleHistoryCount: moduleMatches,
      avgScore,
      reasons,
    };
  });

  return scored
    .sort((a, b) => b.matchScore - a.matchScore || b.freeMd - a.freeMd)
    .slice(0, 3);
}

export function draftTicketFromBranchHeuristic(input: {
  branchName: string;
  projectName?: string;
  lastCommitTitle?: string;
  authorName?: string;
}): BranchTicketDraft {
  const branch = (input.branchName ?? '').trim();
  const lower = branch.toLowerCase();
  const commit = (input.lastCommitTitle ?? '').trim();
  const proj = (input.projectName ?? '').trim();

  let type: TicketType = 'Feature';
  let size: Size = 'M';
  let estimateMd = 1.0;
  let track: TrackCode = 'IMP';
  let prefixReason = 'ประเมินจากรูปแบบชื่อ Branch มาตรฐาน';

  if (/^(fix|bugfix|hotfix|bug)[/_-]/.test(lower) || /\b(fix|bug|hotfix)\b/.test(lower)) {
    type = 'Bug-Fix';
    size = 'S';
    estimateMd = 0.5;
    prefixReason = 'ตรวจพบ prefix แก้ไขบั๊ก (fix/hotfix) จึงแนะนำ Bug-Fix ขนาด S (0.5 MD)';
  } else if (/^(spike|poc|research|exp)[/_-]/.test(lower)) {
    type = 'Spike';
    size = 'M';
    estimateMd = 1.0;
    track = 'RND';
    prefixReason = 'ตรวจพบ prefix ทดลอง/วิจัย (spike/poc) จึงแนะนำสาย RND ประเภท Spike (1.0 MD)';
  } else if (/^(refactor|techdebt|debt|cleanup)[/_-]/.test(lower)) {
    type = 'TechDebt';
    size = 'M';
    estimateMd = 1.0;
    track = 'RND';
    prefixReason = 'ตรวจพบ prefix ปรับโครงสร้างโค้ด (refactor/techdebt) แนะนำ TechDebt (1.0 MD)';
  } else if (/^(ops|infra|ci|cd|deploy|devops)[/_-]/.test(lower)) {
    type = 'Ops';
    size = 'S';
    estimateMd = 0.5;
    track = 'INFRA';
    prefixReason = 'ตรวจพบ prefix โครงสร้าง/CI (infra/ops) แนะนำสาย INFRA ประเภท Ops (0.5 MD)';
  } else if (/^(cr|enhance|enhancement|improve)[/_-]/.test(lower)) {
    type = 'CR';
    size = 'M';
    estimateMd = 1.0;
    prefixReason = 'ตรวจพบ prefix ปรับปรุงฟีเจอร์ (cr/enhance) แนะนำประเภท CR (1.0 MD)';
  } else if (/^(feat|feature)[/_-]/.test(lower)) {
    type = 'Feature';
    size = 'M';
    estimateMd = 1.5;
    prefixReason = 'ตรวจพบ prefix พัฒนาฟีเจอร์ใหม่ (feat/feature) แนะนำ Feature ขนาด M (1.5 MD)';
  }

  if (/\b(qa|test|e2e|spec)\b/.test(lower)) {
    track = 'QA';
  } else if (/\b(ux|ui|figma|design)\b/.test(lower)) {
    track = 'UXBA';
  } else if (/\b(ai|ml|llm|rnd|core|api)\b/.test(lower) && track === 'IMP') {
    track = 'RND';
  }

  const cleanedBranch = cleanBranchToTicketTitle(branch);
  const useCommit =
    commit.length >= 8 &&
    !/^(merge |wip|update |fix$)/i.test(commit) &&
    commit.length <= 120;
  const subject = useCommit
    ? `${commit} (${branch})`
    : cleanedBranch || branch || 'งานจาก Git Branch';

  const moduleName = proj || branch.split('/')[0] || 'General';

  return {
    subject: subject.slice(0, 180),
    module: moduleName.slice(0, 60),
    track,
    type,
    size,
    estimateMd,
    reasoning: prefixReason,
  };
}

export interface SimilarTicketMatch {
  id: string;
  title: string;
  module: string;
  estimateMd: number;
  actualMd: number;
  size: Size;
  similarityPct: number;
}

export interface EffortEstimateCore {
  recommendedMd: number;
  size: Size;
  minMd: number;
  maxMd: number;
  confidence: 'high' | 'medium' | 'low';
  warning: string | null;
  reasoning: string;
  similarTickets: SimilarTicketMatch[];
}

export interface AiEffortEstimateResponse extends EffortEstimateCore {
  ok: boolean;
  provider: 'similarity';
}

export interface AiDisputeCopilotResponse {
  ok: boolean;
  mode: 'draft' | 'review';
  provider: 'gemini' | 'rule-based';
  suggestedFlag: 'BLK' | 'ENV' | 'REQ';
  polishedReason: string;
  summary: string;
  verdict: 'APPROVE_LIKELY' | 'NEEDS_EVIDENCE' | 'REVIEW_CAREFULLY';
  evidencePoints: string[];
}

function sizeFromMd(md: number): Size {
  if (md <= 0.25) return 'XS';
  if (md <= 0.5) return 'S';
  if (md <= 1.5) return 'M';
  if (md <= 3.0) return 'L';
  return 'XL';
}

export function estimateEffortFromHistory(
  input: {
    title: string;
    module?: string;
    track?: string;
    type?: string;
    currentEstimateMd?: number;
  },
  closedTickets: Ticket[],
): EffortEstimateCore {
  const queryTokens = new Set(tokenizeKeywords(`${input.module ?? ''} ${input.title ?? ''}`));
  const modLower = (input.module ?? '').trim().toLowerCase();
  const trackNorm = input.track ? normalizeTrack(input.track) : null;
  const typeLower = (input.type ?? '').trim().toLowerCase();

  const scored: Array<{ ticket: Ticket; score: number }> = [];
  for (const t of closedTickets) {
    const tTokens = new Set(tokenizeKeywords(`${t.module ?? ''} ${t.title ?? ''}`));
    let overlap = 0;
    for (const tok of queryTokens) {
      if (tTokens.has(tok)) overlap += 1;
    }
    const union = Math.max(1, queryTokens.size + tTokens.size - overlap);
    let sim = queryTokens.size > 0 ? overlap / union : 0;

    if (modLower && t.module?.trim().toLowerCase() === modLower) {
      sim += 0.35;
    }
    if (trackNorm && normalizeTrack(t.track) === trackNorm) {
      sim += 0.15;
    }
    if (typeLower && t.type?.toLowerCase().includes(typeLower)) {
      sim += 0.12;
    }

    if (sim > 0.12) {
      scored.push({ ticket: t, score: Math.min(0.99, sim) });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, 5);

  if (top.length === 0) {
    const fallbackMd = Number((input.currentEstimateMd && input.currentEstimateMd > 0 ? input.currentEstimateMd : 1.0).toFixed(2));
    return {
      recommendedMd: fallbackMd,
      size: sizeFromMd(fallbackMd),
      minMd: Number(Math.max(0.25, fallbackMd * 0.75).toFixed(2)),
      maxMd: Number((fallbackMd * 1.35).toFixed(2)),
      confidence: 'low',
      warning: null,
      reasoning: 'ยังไม่มีใบงานเก่าที่ปิดแล้วใกล้เคียงพอในขอบเขต จึงใช้ค่าฐานเบื้องต้น',
      similarTickets: [],
    };
  }

  let weightSum = 0;
  let mdSum = 0;
  const actuals: number[] = [];
  for (const item of top) {
    const md = item.ticket.actualMd > 0 ? item.ticket.actualMd : item.ticket.estimateMd;
    actuals.push(md);
    weightSum += item.score;
    mdSum += md * item.score;
  }

  const rawRec = weightSum > 0 ? mdSum / weightSum : 1.0;
  const recommendedMd = Number((Math.round(rawRec * 4) / 4).toFixed(2)) || 0.5;
  const minMd = Number(Math.min(...actuals).toFixed(2));
  const maxMd = Number(Math.max(...actuals).toFixed(2));
  const confidence: 'high' | 'medium' | 'low' =
    top.length >= 3 && (top[0]?.score ?? 0) >= 0.45
      ? 'high'
      : top.length >= 2
        ? 'medium'
        : 'low';

  let warning: string | null = null;
  if (input.currentEstimateMd && input.currentEstimateMd > 0 && input.currentEstimateMd < recommendedMd * 0.7) {
    warning = `ค่า Estimate ปัจจุบัน (${formatMd(input.currentEstimateMd)} MD) ต่ำกว่าสถิติงานคล้ายกัน (${formatMd(recommendedMd)} MD) — เสี่ยง Overrun`;
  }

  return {
    recommendedMd,
    size: sizeFromMd(recommendedMd),
    minMd,
    maxMd,
    confidence,
    warning,
    reasoning: `อ้างอิงจากใบงานปิดแล้วที่ใกล้เคียง ${top.length} ใบ (ช่วงจริง ${formatMd(minMd)}–${formatMd(maxMd)} MD)`,
    similarTickets: top.map((item) => ({
      id: item.ticket.id,
      title: item.ticket.title || item.ticket.module,
      module: item.ticket.module,
      estimateMd: item.ticket.estimateMd,
      actualMd: item.ticket.actualMd,
      size: item.ticket.size,
      similarityPct: Math.round(item.score * 100),
    })),
  };
}

export function buildDisputeCopilotHeuristic(
  mode: 'draft' | 'review',
  ticket: Ticket | null,
  rawText: string,
  requestedFlag: string,
  disputeReason: string,
): Omit<AiDisputeCopilotResponse, 'ok' | 'mode' | 'provider'> {
  const combined = `${rawText} ${disputeReason} ${ticket?.note ?? ''}`.toLowerCase();

  let suggestedFlag: 'BLK' | 'ENV' | 'REQ' = 'BLK';
  if (/env|server|เซิร์ฟเวอร์|ล่ม|deploy|staging|uat|infra|db|network|timeout/.test(combined)) {
    suggestedFlag = 'ENV';
  } else if (/req|spec|สเปก|เงื่อนไข|แก้ความต้องการ|ปรับขอบเขต|ลูกค้าเปลี่ยน|ไม่เคลียร์/.test(combined)) {
    suggestedFlag = 'REQ';
  } else if (requestedFlag === 'ENV' || requestedFlag === 'REQ' || requestedFlag === 'BLK') {
    suggestedFlag = requestedFlag;
  }

  const evidencePoints: string[] = [];
  if (ticket) {
    evidencePoints.push(
      `ใบงาน ${ticket.id}: Estimate ${formatMd(ticket.estimateMd)} MD · Actual ${formatMd(ticket.actualMd)} MD · Reopen ${ticket.reopenCount || 0} ครั้ง`,
    );
    if (ticket.blocker) {
      evidencePoints.push('มีสถานะ Blocker บันทึกไว้ในระบบ');
    }
    if (ticket.isPaused || (ticket.pausedDays ?? 0) > 0) {
      evidencePoints.push(`มีการพักเวลา/เลื่อนแผน ${ticket.pausedDays ?? 0} วันทำการ`);
    }
    if (ticket.isMdDirect) {
      evidencePoints.push('เป็นงานแทรกเร่งด่วน [MD-DIRECT]');
    }
    if (ticket.mrLink) {
      evidencePoints.push('มีลิงก์ Merge Request แนบยืนยันการส่งมอบโค้ด');
    }
    if (ticket.dodPassed) {
      evidencePoints.push('ผ่านเกณฑ์ตรวจคุณภาพ DoD แล้ว');
    }
  }

  if (mode === 'draft') {
    const cleanRaw = rawText.trim();
    const flagLabel =
      suggestedFlag === 'ENV'
        ? 'ปัญหาสภาพแวดล้อม/เซิร์ฟเวอร์ (ENV)'
        : suggestedFlag === 'REQ'
          ? 'การเปลี่ยนแปลง/ความไม่ชัดเจนของสเปก (REQ)'
          : 'การติดขัดรอระบบหรือทีมภายนอก (BLK)';
    const polishedReason = cleanRaw
      ? `ขอทบทวนคะแนนใบงาน${ticket ? ` ${ticket.id}` : ''} เนื่องจากพบ${flagLabel} — ${cleanRaw}${ticket ? ` (Est ${formatMd(ticket.estimateMd)} MD / Actual ${formatMd(ticket.actualMd)} MD)` : ''} ส่งผลให้ใช้เวลาจริงเกินแผนโดยอยู่นอกเหนือการควบคุมของผู้พัฒนา`
      : `ขอทบทวนคะแนนใบงาน${ticket ? ` ${ticket.id}` : ''} เนื่องจากพบ${flagLabel} ซึ่งส่งผลกระทบต่อระยะเวลาดำเนินการจริง`;
    return {
      suggestedFlag,
      polishedReason,
      summary: `แนะนำใช้รหัส ${suggestedFlag} (${flagLabel}) และเรียบเรียงเหตุผลพร้อมอ้างอิงตัวเลขใบงานแล้ว`,
      verdict: 'APPROVE_LIKELY',
      evidencePoints,
    };
  }

  // Review mode for Lead/Admin
  const hasStrongSignal = Boolean(
    ticket?.blocker ||
      ticket?.isMdDirect ||
      (ticket?.pausedDays ?? 0) > 0 ||
      (disputeReason.trim().length >= 25 && ticket?.dodPassed),
  );
  const verdict: 'APPROVE_LIKELY' | 'NEEDS_EVIDENCE' | 'REVIEW_CAREFULLY' = hasStrongSignal
    ? 'APPROVE_LIKELY'
    : disputeReason.trim().length < 15
      ? 'NEEDS_EVIDENCE'
      : 'REVIEW_CAREFULLY';

  const summary =
    verdict === 'APPROVE_LIKELY'
      ? `พบหลักฐานสนับสนุนชัดเจนในระบบ (${evidencePoints.length} จุด) — แนะนำพิจารณาอนุมัติรหัส ${suggestedFlag}`
      : verdict === 'NEEDS_EVIDENCE'
        ? 'เหตุผลประกอบค่อนข้างสั้นและยังไม่พบธง Blocker/Paused ในระบบ — แนะนำขอหลักฐานเพิ่มเติมก่อนอนุมัติ'
        : `ควรตรวจสอบหลักฐานแนบเทียบกับชั่วโมงทำงานจริง (Est ${formatMd(ticket?.estimateMd ?? 0)} vs Actual ${formatMd(ticket?.actualMd ?? 0)} MD) ก่อนตัดสินใจ`;

  return {
    suggestedFlag,
    polishedReason: disputeReason,
    summary,
    verdict,
    evidencePoints,
  };
}
