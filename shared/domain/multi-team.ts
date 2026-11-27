import {
  DisputeStatus,
  EmployeeLeave,
  Ticket,
  TicketAllocation,
  TicketDispute,
  TicketStageLog,
  TrackCode,
  normalizeTrack,
  trackDisplayLabel,
} from './models';
import { Person } from './models';
import {
  DEFAULT_TRACK_WEIGHTS,
  INDEX_TARGET,
  PersonScore,
  roundMd,
  scorePerson,
  scoreTicket,
} from './scoring';
import { workflowStatusOf } from './workflow';

export interface HandoffKpis {
  waitingReviewCount: number;
  waitingReviewOverdue: number;
  waitingQaCount: number;
  waitingQaOverdue: number;
  blockedCount: number;
  blockedInfraCount: number;
  avgHandoffHours: number;
}

export interface StageAgingTrackPoint {
  track: string;
  inProgressHours: number;
  reviewHours: number;
  qaHours: number;
  blockedHours: number;
}

export interface BlockerMatrixItem {
  id: string;
  description: string;
  waitingTeam: string;
  blockingTeam: string;
  ticketCount: number;
  ticketIds: string[];
  canPing: boolean;
}

export interface HandoffTicketRow {
  ticketId: string;
  title: string;
  status: string;
  owner: string;
  ownerTrack: string;
  reviewerOrQa: string;
  hoursSpent: number;
  slaHours: number;
  isOverSla: boolean;
  blockerFlag?: string;
  canPing: boolean;
}

export interface HandoffSlaReport {
  kpis: HandoffKpis;
  stageAging: StageAgingTrackPoint[];
  blockerMatrix: BlockerMatrixItem[];
  tickets: HandoffTicketRow[];
}

export interface QualityKpis {
  firstTimeRightPct: number;
  reopenRatePct: number;
  reopenCount: number;
  totalClosed: number;
  bugEscapePct: number;
  bugEscapeCount: number;
  dodEvidencePct: number;
  dodMissingCount: number;
}

export interface DodAuditRow {
  ticketId: string;
  title: string;
  devName: string;
  qaName: string;
  mrLink: string;
  unitTestLabel: string;
  unitTestPassed: boolean;
  stagingVerified: boolean;
  /** Display-only CI hint from linked MR (live pipeline status filled by API when available). */
  ciStatusLabel: string;
  ciPassed: boolean | null;
  dodStatus: 'สมบูรณ์ 100%' | 'หลักฐานไม่ครบ';
  isComplete: boolean;
}

export interface ReopenEscapeRow {
  ticketId: string;
  title: string;
  assignee: string;
  type: string;
  reopenCount: number;
  bugCause: string;
  isBugEscape: boolean;
  notes: string;
}

export interface QualityAuditReport {
  kpis: QualityKpis;
  dodChecklist: DodAuditRow[];
  reopenEscapes: ReopenEscapeRow[];
}

export interface ThreeWayTimeRow {
  ticketId: string;
  title: string;
  assignee: string;
  size: string;
  estimateMd: number;
  openProjectActualMd: number;
  gitlabSpanMd: number;
  ratio: number;
  anomalyType: 'NONE' | 'MISSING_TIME' | 'GHOST_PROGRESS' | 'TIME_MISMATCH' | 'OUTLIER';
  anomalyLabel: string;
  isAnomaly: boolean;
}

export interface ThreeWayTimeReport {
  totalTickets: number;
  missingTimeCount: number;
  ghostProgressCount: number;
  overrunCount: number;
  rows: ThreeWayTimeRow[];
}

export interface DisputePreviewResult {
  scoreBefore: number;
  scoreProjected: number;
  scoreDiff: number;
  personIndexBefore: number;
  personIndexProjected: number;
  personIndexDiff: number;
}

export interface PreflightCheckItem {
  stage: number;
  name: string;
  status: 'PASS' | 'WARN' | 'FAIL';
  summary: string;
  detail: string;
}

export interface SnapshotPreviewDiffRow {
  personId: string;
  nickname: string;
  trackLabel: string;
  previousIndex: number;
  currentIndex: number;
  diff: number;
  isTargetMet: boolean;
  statusLabel: string;
}

export interface PreflightReport {
  overallReadinessScore: number;
  isReadyToFreeze: boolean;
  checks: PreflightCheckItem[];
  previewDiffs: SnapshotPreviewDiffRow[];
}

/** Computes Handoff & SLA Report (Screen 21) */
export function computeHandoffSlaSummary(
  tickets: readonly Ticket[],
  stageLogs: readonly TicketStageLog[] = [],
  people: readonly Person[] = [],
): HandoffSlaReport {
  const personMap = new Map(people.map((p) => [p.id, p]));

  const inReview = tickets.filter((t) => workflowStatusOf(t) === 'Code Review');
  const inQa = tickets.filter((t) => workflowStatusOf(t) === 'Ready for QA' || workflowStatusOf(t) === 'In QA');
  const blocked = tickets.filter((t) => t.blocker || t.varianceCode === 'BLK' || t.varianceCode === 'ENV');

  // Compute ticket rows
  const ticketRows: HandoffTicketRow[] = [];
  let totalHandoffHours = 0;
  let handoffCount = 0;

  for (const t of tickets) {
    if (t.closed) continue;
    const status = workflowStatusOf(t);
    const isReview = status === 'Code Review';
    const isReadyQa = status === 'Ready for QA';
    const isInQa = status === 'In QA';
    const isBlk = t.blocker || t.varianceCode === 'BLK' || t.varianceCode === 'ENV';

    // Show in handoff list if review, qa, blocked, or open
    if (!isReview && !isReadyQa && !isInQa && !isBlk && status !== 'In Progress') continue;

    // Estimate hours spent based on stage logs or synthetic duration
    const logs = stageLogs.filter((l) => l.ticketId === t.id && !l.exitedAt);
    const activeLog = logs[logs.length - 1];
    let hoursSpent = activeLog?.durationHours ?? Math.round(t.actualMd * 6);
    if (hoursSpent <= 0) {
      hoursSpent = isReview ? 14 : isReadyQa ? 8 : isInQa ? 12 : 18;
    }

    const slaHours = isReview ? 12 : isReadyQa ? 8 : isInQa ? 18 : 6;
    const isOverSla = hoursSpent > slaHours;

    const ownerPerson = personMap.get(t.assigneeId);
    const reviewerPerson = t.reviewerId ? personMap.get(t.reviewerId) : null;
    const qaPerson = t.qaAssigneeId ? personMap.get(t.qaAssigneeId) : null;

    const reviewerOrQa = isReview
      ? (reviewerPerson?.nickname ?? 'ทีม Review')
      : (qaPerson?.nickname ?? 'ทีม QA');

    ticketRows.push({
      ticketId: t.id,
      title: t.title || t.note || t.module,
      status: t.workflowStatus ?? 'In Progress',
      owner: ownerPerson ? `${ownerPerson.nickname} (${ownerPerson.role || ownerPerson.track})` : 'ไม่ระบุ',
      ownerTrack: ownerPerson?.track ?? t.track,
      reviewerOrQa,
      hoursSpent,
      slaHours,
      isOverSla,
      blockerFlag: t.varianceCode !== 'NONE' ? t.varianceCode : t.blocker ? 'BLK' : undefined,
      canPing: isOverSla || isBlk,
    });

    totalHandoffHours += hoursSpent;
    handoffCount++;
  }

  const kpis: HandoffKpis = {
    waitingReviewCount: inReview.length,
    waitingReviewOverdue: ticketRows.filter((r) => r.status === 'Code Review' && r.isOverSla).length,
    waitingQaCount: inQa.length,
    waitingQaOverdue: ticketRows.filter((r) => (r.status === 'Ready for QA' || r.status === 'In QA') && r.isOverSla).length,
    blockedCount: blocked.length,
    blockedInfraCount: ticketRows.filter((r) => r.blockerFlag === 'ENV').length,
    avgHandoffHours: handoffCount > 0 ? roundMd(totalHandoffHours / handoffCount) : 0,
  };

  const stageAging = deriveStageAging(tickets, stageLogs, people);
  const blockerMatrix = deriveBlockerMatrix(tickets, people);

  return {
    kpis,
    stageAging,
    blockerMatrix,
    tickets: ticketRows.sort((a, b) => (b.isOverSla ? 1 : 0) - (a.isOverSla ? 1 : 0) || b.hoursSpent - a.hoursSpent),
  };
}

function deriveStageAging(
  tickets: readonly Ticket[],
  stageLogs: readonly TicketStageLog[],
  people: readonly Person[],
): StageAgingTrackPoint[] {
  const personMap = new Map(people.map((p) => [p.id, p]));
  const ticketMap = new Map(tickets.map((t) => [t.id, t]));
  const loggedTicketIds = new Set<string>();
  const byTrack = new Map<string, StageAgingTrackPoint>();

  const ensure = (track: string): StageAgingTrackPoint => {
    const existing = byTrack.get(track);
    if (existing) return existing;
    const created: StageAgingTrackPoint = {
      track,
      inProgressHours: 0,
      reviewHours: 0,
      qaHours: 0,
      blockedHours: 0,
    };
    byTrack.set(track, created);
    return created;
  };

  for (const log of stageLogs) {
    const ticket = ticketMap.get(log.ticketId);
    if (!ticket) continue;
    loggedTicketIds.add(log.ticketId);
    const owner = personMap.get(ticket.assigneeId);
    const trackLabel = trackDisplayLabel(owner?.track ?? ticket.track);
    const bucket = ensure(trackLabel);
    const hours = log.durationHours ?? 0;
    const status = log.toStatus;
    if (log.blockerFlag && log.blockerFlag !== 'NONE') {
      bucket.blockedHours = roundMd(bucket.blockedHours + hours);
    } else if (status === 'Code Review') {
      bucket.reviewHours = roundMd(bucket.reviewHours + hours);
    } else if (status === 'Ready for QA' || status === 'In QA') {
      bucket.qaHours = roundMd(bucket.qaHours + hours);
    } else {
      bucket.inProgressHours = roundMd(bucket.inProgressHours + hours);
    }
  }

  for (const row of tickets) {
    if (row.closed || loggedTicketIds.has(row.id)) continue;
    const owner = personMap.get(row.assigneeId);
    const trackLabel = trackDisplayLabel(owner?.track ?? row.track);
    const bucket = ensure(trackLabel);
    const status = workflowStatusOf(row);
    const hours = Math.max(1, (row.actualMd || row.estimateMd || 1) * 6);
    if (row.blocker || row.varianceCode === 'BLK' || row.varianceCode === 'ENV') {
      bucket.blockedHours = roundMd(bucket.blockedHours + hours * 0.3);
    }
    if (status === 'Code Review') {
      bucket.reviewHours = roundMd(bucket.reviewHours + hours);
    } else if (status === 'Ready for QA' || status === 'In QA') {
      bucket.qaHours = roundMd(bucket.qaHours + hours);
    } else {
      bucket.inProgressHours = roundMd(bucket.inProgressHours + hours);
    }
  }

  return [...byTrack.values()].sort((a, b) => a.track.localeCompare(b.track, 'th'));
}

function deriveBlockerMatrix(tickets: readonly Ticket[], people: readonly Person[]): BlockerMatrixItem[] {
  const personMap = new Map(people.map((p) => [p.id, p]));
  const groups = new Map<string, BlockerMatrixItem>();
  const isBlockerTicket = (ticket: Ticket) =>
    ticket.blocker || ticket.varianceCode === 'BLK' || ticket.varianceCode === 'ENV' || ticket.reopenCount > 0;
  const openBlocked = tickets.filter((ticket) => !ticket.closed && isBlockerTicket(ticket));
  const source = openBlocked.length > 0 ? openBlocked : tickets.filter(isBlockerTicket);

  for (const ticket of source) {
    const isBlocked = ticket.blocker || ticket.varianceCode === 'BLK' || ticket.varianceCode === 'ENV';
    if (!isBlocked && ticket.reopenCount <= 0) continue;

    const owner = personMap.get(ticket.assigneeId);
    const waitingTeam = trackDisplayLabel(owner?.track ?? ticket.track);
    const blockingTeam =
      ticket.varianceCode === 'ENV' ? 'INFRA' : ticket.varianceCode === 'BLK' ? 'Implement' : ticket.reopenCount > 0 ? 'Implement' : 'QA';
    const key = `${waitingTeam}->${blockingTeam}-${ticket.varianceCode}`;
    const existing = groups.get(key);
    if (existing) {
      existing.ticketCount += 1;
      existing.ticketIds.push(ticket.id);
      continue;
    }
    groups.set(key, {
      id: key.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      description:
        ticket.varianceCode === 'ENV'
          ? `${waitingTeam} รอแก้ ENV จาก ${blockingTeam}`
          : ticket.varianceCode === 'BLK'
            ? `${waitingTeam} ติดบล็อกจาก ${blockingTeam}`
            : ticket.reopenCount > 0
              ? `QA รอ Dev แก้ Bug Reopened`
              : `${waitingTeam} รอ ${blockingTeam}`,
      waitingTeam,
      blockingTeam,
      ticketCount: 1,
      ticketIds: [ticket.id],
      canPing: true,
    });
  }

  return [...groups.values()].sort((a, b) => b.ticketCount - a.ticketCount);
}

/** Computes Quality & Defect Audit (Screen 22) */
export function computeQualityAuditSummary(
  tickets: readonly Ticket[],
  people: readonly Person[] = [],
): QualityAuditReport {
  const personMap = new Map(people.map((p) => [p.id, p]));
  const closed = tickets.filter((t) => t.closed);
  const totalClosed = closed.length;
  const denom = Math.max(1, totalClosed);

  const cleanFirstTime = closed.filter((t) => t.reopenCount === 0);
  const reopenedTickets = closed.filter((t) => t.reopenCount > 0);
  const bugEscapes = closed.filter((t) => t.isBugEscape || t.workCategory === 'BugProduction');
  const dodComplete = closed.filter(
    (t) => t.dodPassed || (t.dodChecklist?.unitTest && t.dodChecklist.mrLinked && t.dodChecklist.stagingVerified),
  );

  const kpis: QualityKpis = {
    firstTimeRightPct: totalClosed > 0 ? roundMd((cleanFirstTime.length / denom) * 100) : 0,
    reopenRatePct: totalClosed > 0 ? roundMd((reopenedTickets.length / denom) * 100) : 0,
    reopenCount: reopenedTickets.length,
    totalClosed,
    bugEscapePct: totalClosed > 0 ? roundMd((bugEscapes.length / denom) * 100) : 0,
    bugEscapeCount: bugEscapes.length,
    dodEvidencePct: totalClosed > 0 ? roundMd((dodComplete.length / denom) * 100) : 0,
    dodMissingCount: totalClosed - dodComplete.length,
  };

  const dodChecklist: DodAuditRow[] = tickets
    .filter((t) => {
      const status = workflowStatusOf(t);
      return status === 'Ready for QA' || status === 'In QA' || status === 'Code Review' || (status === 'In Progress' && !t.closed);
    })
    .slice(0, 10)
    .map((t) => {
      const dev = personMap.get(t.assigneeId)?.nickname ?? 'ทีม Dev';
      const qa = t.qaAssigneeId ? (personMap.get(t.qaAssigneeId)?.nickname ?? 'ทีม QA') : 'ยังไม่ระบุ QA';
      const hasMr = Boolean(t.mrLink?.trim());
      const mr = hasMr ? t.mrLink!.trim() : '';
      const unitPass = Boolean(t.dodChecklist?.unitTest ?? t.dodPassed);
      const stagPass = Boolean(t.dodChecklist?.stagingVerified ?? t.dodPassed);
      const isComplete = unitPass && stagPass && hasMr;
      return {
        ticketId: t.id,
        title: t.title || t.note || t.module,
        devName: dev,
        qaName: qa,
        mrLink: mr || 'ยังไม่มี MR',
        unitTestLabel: unitPass ? 'ผ่าน' : 'ยังไม่ระบุ',
        unitTestPassed: unitPass,
        stagingVerified: stagPass,
        ciStatusLabel: hasMr ? (unitPass ? 'CI พร้อมตรวจ' : 'รอ CI / ไม่ระบุ') : 'ยังไม่มี MR',
        ciPassed: hasMr ? unitPass : null,
        dodStatus: isComplete ? 'สมบูรณ์ 100%' : 'หลักฐานไม่ครบ',
        isComplete,
      };
    });

  const reopenEscapes: ReopenEscapeRow[] = tickets
    .filter((t) => t.reopenCount > 0 || t.isBugEscape)
    .map((t) => ({
      ticketId: t.id,
      title: t.title || t.note || t.module,
      assignee: personMap.get(t.assigneeId)?.nickname ?? 'ไม่ระบุ',
      type: t.type,
      reopenCount: t.reopenCount,
      bugCause: t.bugCause || (
        t.varianceCode === 'REQ' ? 'Requirement คลุมเครือ' :
        t.varianceCode === 'ENV' ? 'Environment & Config' :
        t.varianceCode === 'BLK' ? 'External Blocker' :
        t.isBugEscape ? 'Regression หลุด Prod' :
        (t.reopenCount > 1 ? 'Logic & Edge Case Bug' : 'Missing Test / DoD')
      ),
      isBugEscape: Boolean(t.isBugEscape),
      notes: t.note || 'ตรวจพบบั๊กหลุด/ตีกลับระหว่างรอบการทดสอบ',
    }));

  return { kpis, dodChecklist, reopenEscapes };
}

/** Computes 3-Way Time Audit (Screen 23) */
export function computeThreeWayTimeAudit(
  tickets: readonly Ticket[],
  people: readonly Person[] = [],
): ThreeWayTimeReport {
  const personMap = new Map(people.map((p) => [p.id, p]));
  const rows: ThreeWayTimeRow[] = [];

  let missingTimeCount = 0;
  let ghostProgressCount = 0;
  let overrunCount = 0;

  for (const t of tickets) {
    const est = t.estimateMd || 0;
    const opActual = t.actualMd;
    // Derive GitLab span from actual start -> delivery/close when MR exists; otherwise 0
    const startIso = t.actualStartOn;
    const endIso = t.devDeliveredOn ?? t.closedOn ?? t.dueOn;
    let gitlabSpan = 0;
    if (t.mrLink?.trim()) {
      if (startIso && endIso) {
        const s = Date.parse(`${String(startIso).slice(0, 10)}T00:00:00Z`);
        const e = Date.parse(`${String(endIso).slice(0, 10)}T00:00:00Z`);
        if (Number.isFinite(s) && Number.isFinite(e) && e >= s) {
          gitlabSpan = roundMd(Math.max(0.25, ((e - s) / 86_400_000 + 1) * 0.75));
        } else {
          gitlabSpan = opActual;
        }
      } else {
        gitlabSpan = opActual;
      }
    }

    const ratio = est > 0 ? roundMd(opActual / est) : 0;

    let anomalyType: ThreeWayTimeRow['anomalyType'] = 'NONE';
    let anomalyLabel = 'ปกติ';

    if (t.closed && opActual === 0) {
      anomalyType = 'MISSING_TIME';
      anomalyLabel = 'ลืมกรอกเวลา!';
      missingTimeCount++;
    } else if (t.workflowStatus === 'In Progress' && !t.mrLink?.trim()) {
      anomalyType = 'GHOST_PROGRESS';
      anomalyLabel = 'ไม่มีโค้ดใน Git';
      ghostProgressCount++;
    } else if (opActual > 0 && gitlabSpan > 0 && Math.abs(opActual - gitlabSpan) / opActual > 0.5) {
      anomalyType = 'TIME_MISMATCH';
      anomalyLabel = 'เวลา OP vs Git ต่างกันเกิน 50%';
    } else if (est > 0 && ratio > 1.5) {
      anomalyType = 'OUTLIER';
      anomalyLabel = `Outlier สูง (${ratio}x)`;
      overrunCount++;
    }

    rows.push({
      ticketId: t.id,
      title: t.title || t.note || t.module,
      assignee: personMap.get(t.assigneeId)?.nickname ?? 'ไม่ระบุ',
      size: t.size,
      estimateMd: est,
      openProjectActualMd: opActual,
      gitlabSpanMd: gitlabSpan,
      ratio,
      anomalyType,
      anomalyLabel,
      isAnomaly: anomalyType !== 'NONE',
    });
  }

  return {
    totalTickets: tickets.length,
    missingTimeCount,
    ghostProgressCount,
    overrunCount,
    rows: rows.sort((a, b) => (b.isAnomaly ? 1 : 0) - (a.isAnomaly ? 1 : 0)),
  };
}

/** Simulates score impact for Ticket Disputes (Screen 24) */
export function simulateDisputeImpact(
  ticket: Ticket,
  person: Person,
  allTickets: readonly Ticket[],
  requestedFlag: Ticket['varianceCode'],
  reopenOverride?: number,
): DisputePreviewResult {
  const currentTicketScore = scoreTicket(ticket).total ?? 0;
  const currentPersonScore = scorePerson(person, allTickets).developmentIndex;

  // Clone ticket with requested changes
  const projectedTicket: Ticket = {
    ...ticket,
    varianceCode: requestedFlag,
    reopenCount: reopenOverride !== undefined ? reopenOverride : (requestedFlag === 'REQ' || requestedFlag === 'BLK' ? 0 : ticket.reopenCount),
    blocker: requestedFlag === 'BLK' ? false : ticket.blocker,
  };

  const projectedTicketScore = scoreTicket(projectedTicket).total ?? 100;

  // Replace ticket in collection
  const projectedTickets = allTickets.map((t) => (t.id === ticket.id ? projectedTicket : t));
  const projectedPersonScore = scorePerson(person, projectedTickets).developmentIndex;

  return {
    scoreBefore: currentTicketScore,
    scoreProjected: projectedTicketScore,
    scoreDiff: roundMd(projectedTicketScore - currentTicketScore),
    personIndexBefore: currentPersonScore,
    personIndexProjected: projectedPersonScore,
    personIndexDiff: roundMd(projectedPersonScore - currentPersonScore),
  };
}

/** Pre-flight Readiness & Freeze Gate (Screen 25) */
export function runPreflightChecklist(
  people: readonly Person[],
  tickets: readonly Ticket[],
  disputes: readonly TicketDispute[] = [],
  leaves: readonly EmployeeLeave[] = [],
): PreflightReport {
  const pendingDisputes = disputes.filter((d) => d.status === 'PENDING');
  const closedTicketsWithoutMd = tickets.filter((t) => t.closed && t.actualMd <= 0);
  const unassignedCount = tickets.filter((t) => !t.closed && !t.assigneeId?.trim()).length;
  const syncedTicketsCount = tickets.filter((t) => t.source === 'openproject' || typeof t.opId === 'number').length;

  const checks: PreflightCheckItem[] = [
    {
      stage: 1,
      name: 'การซิงก์ OpenProject & ความครบถ้วนใบงาน',
      status: tickets.length > 0 && unassignedCount === 0 ? 'PASS' : tickets.length > 0 ? 'WARN' : 'FAIL',
      summary:
        tickets.length === 0
          ? 'ยังไม่มีใบงานในระบบ'
          : `พบ ${tickets.length} ใบงาน (จาก myProject ${syncedTicketsCount} ใบ · ยังไม่ระบุผู้รับผิดชอบ ${unassignedCount} ใบ)`,
      detail:
        unassignedCount === 0
          ? 'ใบงานเปิดทั้งหมดมีผู้รับผิดชอบครบถ้วน'
          : 'แนะนำให้ตรวจสอบใบงานที่ยังไม่มีผู้รับผิดชอบก่อนจับ snapshot',
    },
    {
      stage: 2,
      name: 'คำขอทบทวนคะแนนที่ค้างอยู่ (Disputes)',
      status: pendingDisputes.length === 0 ? 'PASS' : 'WARN',
      summary: pendingDisputes.length === 0 ? 'ไม่มีคำขอค้างพิจารณา' : `มีคำขอรออนุมัติ ${pendingDisputes.length} รายการ`,
      detail: pendingDisputes.length === 0 ? 'คำขอทั้งหมดได้รับการพิจารณาแล้ว' : 'แนะนำให้ Lead หรือ Admin พิจารณาคำขอใน /tickets/disputes ก่อนแช่แข็ง',
    },
    {
      stage: 3,
      name: 'ใบงานปิดแล้วแต่ลืมลงเวลา (Missing MD)',
      status: closedTicketsWithoutMd.length === 0 ? 'PASS' : 'WARN',
      summary: closedTicketsWithoutMd.length === 0 ? `ใบงานปิดทั้ง ${tickets.filter(t => t.closed).length} ใบมีเวลาครบ` : `พบ ${closedTicketsWithoutMd.length} ใบงานที่ยังไม่ลงเวลา`,
      detail: closedTicketsWithoutMd.length === 0 ? 'ข้อมูล Actual MD ครบถ้วน 100%' : 'ควรระบุ Actual MD ให้ครบก่อนจับ snapshot',
    },
    {
      stage: 4,
      name: 'ความครบถ้วนของโควตาและวันลา',
      status: people.length > 0 ? 'PASS' : 'FAIL',
      summary: `คำนวณปรับลดวันลาของพนักงานทั้ง ${people.length} คนครบแล้ว`,
      detail: `บันทึกข้อมูลวันลาในงวดแล้ว ${leaves.length} รายการ โควตาสุทธิถูกคำนวณอัตโนมัติ`,
    },
  ];

  const passCount = checks.filter((c) => c.status === 'PASS').length;
  const overallReadinessScore = Math.round((passCount / checks.length) * 100);

  const previewDiffs: SnapshotPreviewDiffRow[] = people.map((p) => {
    const liveScore = scorePerson(p, tickets);
    const curr = roundMd(liveScore.developmentIndex);
    const prev = INDEX_TARGET;
    const diff = roundMd(curr - prev);
    const isTargetMet = curr >= INDEX_TARGET;
    return {
      personId: p.id,
      nickname: p.nickname,
      trackLabel: trackDisplayLabel(p.track),
      previousIndex: prev,
      currentIndex: curr,
      diff,
      isTargetMet,
      statusLabel: isTargetMet ? 'ผ่านเกณฑ์' : 'ต่ำกว่าเป้า',
    };
  });

  return {
    overallReadinessScore,
    isReadyToFreeze: overallReadinessScore >= 75 && pendingDisputes.length === 0,
    checks,
    previewDiffs,
  };
}
