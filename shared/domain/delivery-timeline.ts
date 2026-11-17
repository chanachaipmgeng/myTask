import type { Ticket, TicketStageLog, WorkflowStatus } from './models';
import { workflowStatusOf } from './workflow';

export type DeliveryTimelineTone = 'done' | 'current' | 'pending' | 'warning' | 'info';

export interface DeliveryTimelineItem {
  id: string;
  title: string;
  detail: string;
  at: string | null;
  atLabel: string;
  tone: DeliveryTimelineTone;
  done: boolean;
  /** Syncfusion e-icons class เช่น e-circle-check */
  dotCss: string;
}

const STATUS_RANK: Record<WorkflowStatus, number> = {
  Backlog: 0,
  'In Progress': 1,
  Reopened: 1,
  'Code Review': 2,
  'Ready for QA': 3,
  'In QA': 4,
  Done: 5,
};

/** สร้างเส้นเหตุการณ์ส่งมอบจากฟิลด์ใบงาน + stage logs (ถ้ามี) */
export function buildDeliveryTimeline(
  ticket: Ticket,
  stageLogs: readonly TicketStageLog[] = [],
): DeliveryTimelineItem[] {
  const status = workflowStatusOf(ticket);
  const rank = STATUS_RANK[status] ?? 0;
  const items: DeliveryTimelineItem[] = [];

  const started = Boolean(ticket.actualStartOn) || rank >= STATUS_RANK['In Progress'];
  items.push(
    step({
      id: 'start',
      title: 'เริ่มงานจริง',
      detail: started
        ? 'เข้า In Progress แล้ว — นับเป็นวันเริ่มงานจริง'
        : 'ยังไม่เข้า In Progress',
      at: ticket.actualStartOn ?? null,
      done: started,
      current: status === 'In Progress' || status === 'Reopened',
      warning: false,
      dotCss: 'e-play',
    }),
  );

  const dueLocked = Boolean(ticket.firstDueOn || ticket.dueOn);
  items.push(
    step({
      id: 'first-due',
      title: 'ล็อกกำหนดส่งครั้งแรก',
      detail: dueLocked
        ? ticket.originalFirstDueOn && ticket.originalFirstDueOn !== ticket.firstDueOn
          ? `เดิม ${ticket.originalFirstDueOn} · ปัจจุบัน ${ticket.firstDueOn ?? ticket.dueOn}`
          : `First Due ${ticket.firstDueOn ?? ticket.dueOn}`
        : 'ยังไม่ล็อกวันส่งครั้งแรก',
      at: ticket.firstDueOn ?? ticket.dueOn ?? null,
      done: dueLocked,
      current: false,
      warning: false,
      dotCss: 'e-day',
    }),
  );

  const hasMr = Boolean(ticket.mrLink?.trim());
  items.push(
    step({
      id: 'mr',
      title: 'แนบลิงก์ MR',
      detail: hasMr ? ticket.mrLink!.trim() : 'ยังไม่มีลิงก์ Merge Request',
      at: hasMr ? (ticket.devDeliveredOn ?? ticket.readyForQaAt ?? ticket.actualStartOn ?? null) : null,
      done: hasMr || rank >= STATUS_RANK['Code Review'],
      current: status === 'Code Review' && !hasMr,
      warning: false,
      dotCss: 'e-link',
    }),
  );

  if (ticket.isPaused || ticket.pausedAt || (ticket.pausedDays != null && ticket.pausedDays > 0)) {
    items.push(
      step({
        id: 'paused',
        title: ticket.isPaused ? 'พักงาน (MD Mandate)' : 'เคยพักงาน / ชดเชยวัน',
        detail: [
          ticket.pausedReason || 'Paused (By MD Mandate)',
          ticket.pausedDays != null ? `+${ticket.pausedDays} วันทำงาน` : null,
          ticket.pausedByTicketId ? `จากใบ ${ticket.pausedByTicketId}` : null,
        ]
          .filter(Boolean)
          .join(' · '),
        at: ticket.pausedAt ?? null,
        done: true,
        current: Boolean(ticket.isPaused),
        warning: Boolean(ticket.isPaused),
        dotCss: 'e-pause',
      }),
    );
  }

  const delivered = Boolean(ticket.readyForQaAt || ticket.devDeliveredOn) || rank >= STATUS_RANK['Ready for QA'];
  items.push(
    step({
      id: 'ready-qa',
      title: 'ส่งเข้า Ready for QA',
      detail: delivered
        ? 'จุดวัด On-time ของ Dev (Fair Cutoff) — ไม่นับคิวรอ QA'
        : 'ยังไม่ย้ายเข้า Ready for QA',
      at: ticket.readyForQaAt ?? ticket.devDeliveredOn ?? null,
      done: delivered,
      current: status === 'Ready for QA' || status === 'In QA',
      warning: false,
      dotCss: 'e-check-box',
    }),
  );

  if (ticket.reopenCount > 0) {
    items.push(
      step({
        id: 'reopen',
        title: `ตีกลับ / Reopen × ${ticket.reopenCount}`,
        detail: 'มีรอบ reopen จาก QA หรือรีวิว',
        at: null,
        done: true,
        current: status === 'Reopened',
        warning: true,
        dotCss: 'e-refresh',
      }),
    );
  }

  const closed = Boolean(ticket.closed || ticket.closedOn) || status === 'Done';
  items.push(
    step({
      id: 'done',
      title: 'ปิดงาน Done',
      detail: closed ? 'ปิดการ์ดแล้ว' : 'ยังไม่ปิดเข้า Done',
      at: ticket.closedOn ?? null,
      done: closed,
      current: status === 'Done',
      warning: false,
      dotCss: 'e-circle-check',
    }),
  );

  const logs = stageLogs
    .filter((log) => log.ticketId === ticket.id)
    .slice()
    .sort((a, b) => String(a.enteredAt).localeCompare(String(b.enteredAt)));

  const logItems: DeliveryTimelineItem[] = logs.map((log) => {
    const blocking =
      log.blockingTeam || (log.blockerFlag && log.blockerFlag !== 'NONE')
        ? [
            log.blockingTeam ? `ทีม ${log.blockingTeam}` : null,
            log.blockerFlag && log.blockerFlag !== 'NONE' ? `ธง ${log.blockerFlag}` : null,
          ]
            .filter(Boolean)
            .join(' · ')
        : null;
    return step({
      id: `log-${log.id}`,
      title: log.fromStatus ? `${log.fromStatus} → ${log.toStatus}` : `เข้า ${log.toStatus}`,
      detail: [
        blocking,
        log.durationHours != null ? `${log.durationHours} ชม.` : null,
        log.exitedAt ? 'จบช่วงนี้แล้ว' : 'ยังค้างสถานะนี้',
      ]
        .filter(Boolean)
        .join(' · '),
      at: log.enteredAt,
      done: true,
      current: !log.exitedAt,
      warning: Boolean(blocking),
      dotCss: blocking ? 'e-warning' : 'e-timeline-work-week',
    });
  });

  // ลำดับ milestone คงที่ตามโฟลว์ส่งมอบ แล้วต่อด้วย stage logs ตามเวลา
  return [...items, ...logItems];
}

function step(input: {
  id: string;
  title: string;
  detail: string;
  at: string | null;
  done: boolean;
  current: boolean;
  warning: boolean;
  dotCss: string;
}): DeliveryTimelineItem {
  let tone: DeliveryTimelineTone = 'pending';
  if (input.warning) {
    tone = 'warning';
  } else if (input.done && input.current) {
    tone = 'current';
  } else if (input.done) {
    tone = 'done';
  } else if (input.current) {
    tone = 'info';
  }
  return {
    id: input.id,
    title: input.title,
    detail: input.detail,
    at: input.at,
    atLabel: formatAtLabel(input.at, input.done),
    tone,
    done: input.done,
    dotCss: input.dotCss,
  };
}

function formatAtLabel(at: string | null, done: boolean): string {
  if (!at) {
    return done ? '—' : 'ยังไม่ถึง';
  }
  const raw = String(at);
  return raw.length >= 10 ? raw.slice(0, 10) : raw;
}

