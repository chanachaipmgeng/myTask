import { Person, Size, Ticket } from './models';
import { scorePerson } from './scoring';
import { workflowStatusOf } from './workflow';

export type HygieneIssueType =
  | 'missing-mr-link'
  | 'missing-first-due'
  | 'missing-story-points'
  | 'unassigned-active'
  | 'actual-md-outlier'
  | 'bug-missing-cause';

export interface SyncHygieneIssue {
  ticketId: string;
  title: string;
  trackLabel: string;
  assignee: string;
  issueType: HygieneIssueType;
  severity: 'High' | 'Medium' | 'Low';
  detail: string;
  zScore?: number | null;
}

export interface DeliveryRiskItem {
  ticketId: string;
  title: string;
  module: string;
  assigneeId: string;
  assignee: string;
  trackLabel: string;
  status: string;
  estimateMd: number;
  actualMd: number;
  workingDaysLeft: number | null;
  riskScore: number;
  riskLevel: 'สูงมาก' | 'ปานกลาง' | 'ต่ำ';
  reasons: string[];
}

export interface ModuleBottleneckItem {
  module: string;
  ticketCount: number;
  avgReviewRounds: number;
  reopenTotal: number;
  avgRatio: number;
  slipRatePct: number;
}

export interface CoachingInsightItem {
  personId: string;
  nickname: string;
  role: string;
  trackLabel: string;
  developmentIndex: number | null;
  trendSlope: number;
  trendLabel: string;
  estimationAccuracyPct: number;
  onTimePct: number;
  firstPassPct: number;
  openWipCount: number;
  strengthNote: string;
  coachingFocus: string;
}

export interface AnalyticsReport {
  engine: 'python' | 'typescript-fallback';
  pythonVersion?: string;
  generatedAt: string;
  syncHygiene: {
    readinessScore: number;
    totalTickets: number;
    cleanTickets: number;
    issueCount: number;
    outlierCount: number;
    issues: SyncHygieneIssue[];
  };
  deliveryRisks: DeliveryRiskItem[];
  bottlenecks: {
    modules: ModuleBottleneckItem[];
    varianceBreakdown: { code: string; count: number; pct: number }[];
    bugCauseBreakdown: { cause: string; count: number; pct: number }[];
  };
  coachingInsights: CoachingInsightItem[];
}

export function buildAnalyticsReport(
  people: readonly Person[],
  tickets: readonly Ticket[],
  engine: 'python' | 'typescript-fallback' = 'typescript-fallback',
): AnalyticsReport {
  const personMap = new Map(people.map((person) => [person.id, person]));
  const issues: SyncHygieneIssue[] = [];
  const ticketsWithIssue = new Set<string>();

  // 1. Z-Score statistics per Size for closed tickets
  const ratiosBySize = new Map<Size, number[]>();
  for (const ticket of tickets) {
    if (ticket.closed && ticket.estimateMd > 0) {
      const ratio = ticket.actualMd / ticket.estimateMd;
      const list = ratiosBySize.get(ticket.size) ?? [];
      list.push(ratio);
      ratiosBySize.set(ticket.size, list);
    }
  }

  const sizeStats = new Map<Size, { mean: number; stdev: number }>();
  for (const [size, values] of ratiosBySize.entries()) {
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance =
      values.length > 1
        ? values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / (values.length - 1)
        : 0;
    sizeStats.set(size, { mean, stdev: Math.sqrt(variance) });
  }

  let outlierCount = 0;

  for (const ticket of tickets) {
    const status = workflowStatusOf(ticket);
    const assignee = personMap.get(ticket.assigneeId)?.nickname ?? 'ยังไม่มีผู้รับ';
    const trackLabel = ticket.track === 'RD' ? 'R&D' : 'Implement';
    const title = ticket.title?.trim() || ticket.module;

    if (
      (status === 'Code Review' || status === 'Ready for QA' || status === 'In QA' || status === 'Done') &&
      !ticket.mrLink?.trim()
    ) {
      issues.push({
        ticketId: ticket.id,
        title,
        trackLabel,
        assignee,
        issueType: 'missing-mr-link',
        severity: 'High',
        detail: `สถานะ ${status} แต่ยังไม่มีลิงก์ Merge Request (mygit)`,
      });
      ticketsWithIssue.add(ticket.id);
    }

    if (status !== 'Backlog' && !ticket.firstDueOn) {
      issues.push({
        ticketId: ticket.id,
        title,
        trackLabel,
        assignee,
        issueType: 'missing-first-due',
        severity: 'Medium',
        detail: 'เริ่มงานแล้วแต่ยังไม่ได้ล็อกวันส่งครั้งแรก (firstDueOn)',
      });
      ticketsWithIssue.add(ticket.id);
    }

    if (status !== 'Backlog' && !ticket.storyPoints) {
      issues.push({
        ticketId: ticket.id,
        title,
        trackLabel,
        assignee,
        issueType: 'missing-story-points',
        severity: 'Low',
        detail: 'ยังไม่ได้ระบุ Story Points บนบอร์ด',
      });
      ticketsWithIssue.add(ticket.id);
    }

    if (status !== 'Backlog' && !ticket.assigneeId.trim()) {
      issues.push({
        ticketId: ticket.id,
        title,
        trackLabel,
        assignee,
        issueType: 'unassigned-active',
        severity: 'High',
        detail: `ใบงานอยู่ในสถานะ ${status} แต่ยังไม่มีผู้รับผิดชอบ`,
      });
      ticketsWithIssue.add(ticket.id);
    }

    if (
      ticket.closed &&
      (ticket.workCategory === 'BugInternal' || ticket.workCategory === 'BugProduction') &&
      !ticket.bugCause
    ) {
      issues.push({
        ticketId: ticket.id,
        title,
        trackLabel,
        assignee,
        issueType: 'bug-missing-cause',
        severity: 'Medium',
        detail: 'ใบงาน Bug ปิดแล้วแต่ยังไม่ระบุสาเหตุ (Bug Cause)',
      });
      ticketsWithIssue.add(ticket.id);
    }

    if (ticket.estimateMd > 0 && ticket.actualMd > 0) {
      const ratio = ticket.actualMd / ticket.estimateMd;
      const stats = sizeStats.get(ticket.size);
      const z = stats && stats.stdev > 0.05 ? (ratio - stats.mean) / stats.stdev : 0;
      if (z >= 1.8 || ratio >= 1.75) {
        outlierCount += 1;
        issues.push({
          ticketId: ticket.id,
          title,
          trackLabel,
          assignee,
          issueType: 'actual-md-outlier',
          severity: ratio >= 2 ? 'High' : 'Medium',
          detail: `Actual/Estimate = ${round2(ratio)}x (Z-Score ${round2(z)}) สูงกว่าค่าปกติของขนาด ${ticket.size}`,
          zScore: round2(z),
        });
        ticketsWithIssue.add(ticket.id);
      }
    }
  }

  const totalTickets = tickets.length;
  const cleanTickets = Math.max(0, totalTickets - ticketsWithIssue.size);
  const readinessScore = totalTickets > 0 ? Math.round((cleanTickets / totalTickets) * 100) : 100;

  // 2. Delivery Risk Radar for open tickets
  const openCountByPerson = new Map<string, number>();
  for (const ticket of tickets) {
    if (!ticket.closed && ticket.assigneeId) {
      openCountByPerson.set(ticket.assigneeId, (openCountByPerson.get(ticket.assigneeId) ?? 0) + 1);
    }
  }

  const deliveryRisks: DeliveryRiskItem[] = [];
  for (const ticket of tickets) {
    if (ticket.closed) {
      continue;
    }
    const reasons: string[] = [];
    let score = 15;
    const ratio = ticket.estimateMd > 0 ? ticket.actualMd / ticket.estimateMd : 0;
    if (ratio > 1.5) {
      score += 40;
      reasons.push(`ใช้เวลาจริงเกิน Estimate ไปแล้ว (${round2(ratio)}x)`);
    } else if (ratio > 1.0) {
      score += 25;
      reasons.push(`เวลาจริงแตะ/เกิน Estimate (${round2(ratio)}x)`);
    }

    if (ticket.workingDaysLeft !== null && ticket.workingDaysLeft <= 1) {
      score += 30;
      reasons.push(`เหลือเวลาในสัปดาห์ที่ commit เพียง ${ticket.workingDaysLeft} วัน`);
    } else if (ticket.workingDaysLeft !== null && ticket.workingDaysLeft <= 2) {
      score += 15;
      reasons.push(`เหลือเวลาทำงาน ${ticket.workingDaysLeft} วัน`);
    }

    const wip = openCountByPerson.get(ticket.assigneeId) ?? 0;
    if (wip > 2) {
      score += 15;
      reasons.push(`ผู้รับถือ WIP เกินเกณฑ์ (${wip} ใบ)`);
    }
    if (!ticket.assigneeId.trim()) {
      score += 20;
      reasons.push('ยังไม่มีผู้รับผิดชอบใบงาน');
    }
    if (ticket.reopenCount > 0) {
      score += 15;
      reasons.push(`ถูกตีกลับ (Reopen ${ticket.reopenCount} ครั้ง)`);
    }

    const capped = Math.min(100, score);
    const riskLevel: DeliveryRiskItem['riskLevel'] =
      capped >= 65 ? 'สูงมาก' : capped >= 40 ? 'ปานกลาง' : 'ต่ำ';
    if (reasons.length === 0) {
      reasons.push('อยู่ในเกณฑ์ปกติ');
    }

    deliveryRisks.push({
      ticketId: ticket.id,
      title: ticket.title?.trim() || ticket.module,
      module: ticket.module,
      assigneeId: ticket.assigneeId,
      assignee: personMap.get(ticket.assigneeId)?.nickname ?? 'ยังไม่มีผู้รับ',
      trackLabel: ticket.track === 'RD' ? 'R&D' : 'Implement',
      status: workflowStatusOf(ticket),
      estimateMd: ticket.estimateMd,
      actualMd: ticket.actualMd,
      workingDaysLeft: ticket.workingDaysLeft,
      riskScore: capped,
      riskLevel,
      reasons,
    });
  }
  deliveryRisks.sort((a, b) => b.riskScore - a.riskScore);

  // 3. Bottlenecks by Module, Variance, and Bug Cause
  const byModule = new Map<string, Ticket[]>();
  const varianceCounts = new Map<string, number>();
  const bugCauses = new Map<string, number>();

  for (const ticket of tickets) {
    const mod = ticket.module || 'ทั่วไป';
    const list = byModule.get(mod) ?? [];
    list.push(ticket);
    byModule.set(mod, list);

    if (ticket.varianceCode && ticket.varianceCode !== 'NONE') {
      varianceCounts.set(ticket.varianceCode, (varianceCounts.get(ticket.varianceCode) ?? 0) + 1);
    }
    if (ticket.bugCause) {
      bugCauses.set(ticket.bugCause, (bugCauses.get(ticket.bugCause) ?? 0) + 1);
    }
  }

  const modules: ModuleBottleneckItem[] = [];
  for (const [mod, list] of byModule.entries()) {
    const count = list.length;
    const avgReview = list.reduce((sum, item) => sum + item.reviewRounds, 0) / count;
    const reopenTotal = list.reduce((sum, item) => sum + item.reopenCount, 0);
    const ratios = list.filter((item) => item.estimateMd > 0).map((item) => item.actualMd / item.estimateMd);
    const avgRatio = ratios.length > 0 ? ratios.reduce((a, b) => a + b, 0) / ratios.length : 1;
    const slipped = list.filter((item) => item.weekOffset > 0).length;
    modules.push({
      module: mod,
      ticketCount: count,
      avgReviewRounds: round2(avgReview),
      reopenTotal,
      avgRatio: round2(avgRatio),
      slipRatePct: round1((slipped / count) * 100),
    });
  }
  modules.sort((a, b) => b.reopenTotal - a.reopenTotal || b.avgReviewRounds - a.avgReviewRounds);

  const totalVar = [...varianceCounts.values()].reduce((a, b) => a + b, 0) || 1;
  const varianceBreakdown = [...varianceCounts.entries()].map(([code, count]) => ({
    code,
    count,
    pct: round1((count / totalVar) * 100),
  }));

  const totalBug = [...bugCauses.values()].reduce((a, b) => a + b, 0) || 1;
  const bugCauseBreakdown = [...bugCauses.entries()].map(([cause, count]) => ({
    cause,
    count,
    pct: round1((count / totalBug) * 100),
  }));

  // 4. Coaching Insights & OLS Linear Regression Slope per Person
  const coachingInsights: CoachingInsightItem[] = people.map((person) => {
    const personScore = scorePerson(person, tickets);
    const closed = tickets.filter((t) => t.assigneeId === person.id && t.closed);
    const openWip = openCountByPerson.get(person.id) ?? 0;

    const accurateCount = closed.filter((t) => {
      if (t.estimateMd <= 0) return false;
      const r = t.actualMd / t.estimateMd;
      return r >= 0.8 && r <= 1.5;
    }).length;
    const onTimeCount = closed.filter((t) => t.weekOffset === 0 || ['REQ', 'BLK', 'ENV'].includes(t.varianceCode)).length;
    const firstPassCount = closed.filter((t) => t.reviewRounds <= 2 && !t.blocker && t.reopenCount === 0).length;

    const denom = closed.length || 1;
    const estimationAccuracyPct = round1((accurateCount / denom) * 100);
    const onTimePct = round1((onTimeCount / denom) * 100);
    const firstPassPct = round1((firstPassCount / denom) * 100);

    // Monthly OLS slope
    const months = ['2025-08', '2025-09', '2025-10'];
    const yValues: number[] = [];
    for (const m of months) {
      const mTickets = closed.filter((t) => (t.closedOn ?? '').startsWith(m));
      if (mTickets.length > 0) {
        const sub = scorePerson(person, mTickets);
        if (sub.developmentIndex !== null) {
          yValues.push(sub.developmentIndex);
        }
      }
    }
    const slope = olsSlope(yValues);
    const trendLabel =
      slope > 1.2 ? 'กำลังพัฒนาขึ้นต่อเนื่อง' : slope < -1.2 ? 'แนวโน้มลดลง ควรช่วยปลดล็อก' : 'รักษามาตรฐานสม่ำเสมอ';

    const strengths: string[] = [];
    if (onTimePct >= 85) strengths.push('ส่งมอบตรงสัปดาห์แม่นยำ');
    if (firstPassPct >= 85) strengths.push('คุณภาพโค้ดและ DoD ผ่านรอบแรกสูง');
    if (estimationAccuracyPct >= 80) strengths.push('ประเมินขนาดงาน (Estimate) แม่นยำ');
    const strengthNote = strengths.length > 0 ? strengths.join(' · ') : 'รับผิดชอบงานตามแผนสปรินต์';

    let coachingFocus = 'รักษาจังหวะการทำงานและแบ่งปันเทคนิคการประเมินงานให้ทีม';
    if (estimationAccuracyPct < 70) {
      coachingFocus = 'แนะนำให้ซอยใบงานขนาด L/XL เป็นใบย่อยก่อนตั้ง Estimate MD';
    } else if (firstPassPct < 75) {
      coachingFocus = 'ควรทำ Self-checklist ด้าน Boundary/DoD ก่อนเปิด Merge Request';
    } else if (onTimePct < 75) {
      coachingFocus = 'ควรแจ้ง Blocker/Variance ตั้งแต่วันที่ 2 ของสัปดาห์เมื่อเริ่มเห็นแนวโน้มเกินแผน';
    }

    return {
      personId: person.id,
      nickname: person.nickname,
      role: person.role,
      trackLabel: person.track === 'RD' ? 'R&D' : 'Implement',
      developmentIndex: personScore.developmentIndex !== null ? round1(personScore.developmentIndex) : null,
      trendSlope: round2(slope),
      trendLabel,
      estimationAccuracyPct,
      onTimePct,
      firstPassPct,
      openWipCount: openWip,
      strengthNote,
      coachingFocus,
    };
  });

  return {
    engine,
    generatedAt: new Date().toISOString(),
    syncHygiene: {
      readinessScore,
      totalTickets,
      cleanTickets,
      issueCount: issues.length,
      outlierCount,
      issues,
    },
    deliveryRisks,
    bottlenecks: {
      modules,
      varianceBreakdown,
      bugCauseBreakdown,
    },
    coachingInsights,
  };
}

function olsSlope(values: readonly number[]): number {
  const n = values.length;
  if (n < 2) {
    return 0;
  }
  const meanX = (n - 1) / 2;
  const meanY = values.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - meanX) * (values[i] - meanY);
    den += (i - meanX) ** 2;
  }
  return den === 0 ? 0 : num / den;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
