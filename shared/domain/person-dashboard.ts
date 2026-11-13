import { KpiExplanation } from './kpi-meaning';
import { Person, Ticket, WorkCategory } from './models';
import { CATEGORY_LABELS, workflowStatusOf } from './workflow';
import {
  INDEX_TARGET,
  TrackWeights,
  WEEKLY_QUOTA,
  formatMd,
  formatPercent,
  scorePerson,
  scoreTicket,
} from './scoring';

export interface SelfTrendPoint {
  month: string;
  index: number;
  target: number;
}

export interface EffortBar {
  id: string;
  label: string;
  estimateMd: number;
  actualMd: number;
}

export interface SharePoint {
  x: string;
  y: number;
  text: string;
}

export interface QualityBar {
  id: string;
  label: string;
  reviewRounds: number;
  reopenCount: number;
}

export interface PersonWorkRow {
  id: string;
  title: string;
  type: string;
  size: string;
  status: string;
  estimateMd: number;
  actualMd: number;
  weekOffsetLabel: string;
  reviewRounds: number;
  reopenCount: number;
  score: number | null;
  dueOnLabel: string;
  unplannedLabel: string;
}

export interface PersonDashboardView {
  found: boolean;
  id: string;
  name: string;
  role: string;
  level: string;
  trackLabel: string;
  quota: number;
  index: number;
  indexLabel: string;
  target: number;
  formulaId: 'Implement' | 'RD';
  formula: string;
  calculation: string;
  quarterText: string;
  trend: SelfTrendPoint[];
  kpis: KpiExplanation[];
  effortBars: EffortBar[];
  slipShare: SharePoint[];
  categoryShare: SharePoint[];
  qualityBars: QualityBar[];
  openWork: PersonWorkRow[];
  closedWork: PersonWorkRow[];
  openCount: number;
  closedCount: number;
}

const MONTH_LABELS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

const IMPLEMENT_FORMULA =
  'สูตร Implement: คะแนนถ่วง 50% + ปิดตามแผน (เพดาน 100) 20% + สัดส่วนความแม่น 15% + คุณภาพจาก rework 15%';
const RESEARCH_FORMULA =
  'สูตร R&D: คะแนน Feature/CR ที่ผ่าน DoD 40% + คุณภาพ Spike 25% + MD ที่รับเข้าต่อ MD ที่วางไว้ 20% + คุณภาพรีวิวและ reopen 15%';

export function personDashboard(
  person: Person | undefined,
  tickets: readonly Ticket[],
  options?: { weights?: TrackWeights; quota?: number },
): PersonDashboardView {
  if (!person) {
    return emptyView();
  }
  const score = scorePerson(person, tickets, options?.weights);
  const research = person.track === 'RD';
  const indexLabel = formatPercent(score.developmentIndex);
  const own = tickets.filter((ticket) => ticket.assigneeId === person.id);
  const closed = own.filter((ticket) => ticket.closed);
  const open = own.filter((ticket) => !ticket.closed);
  return {
    found: true,
    id: person.id,
    name: person.nickname,
    role: person.role,
    level: person.level === 'FirstMonth' ? 'เดือนแรก' : person.level,
    trackLabel: research ? 'R&D' : 'Implement',
    quota: options?.quota ?? WEEKLY_QUOTA[person.level],
    index: round1(score.developmentIndex),
    indexLabel,
    target: INDEX_TARGET,
    formulaId: research ? 'RD' : 'Implement',
    formula: research ? RESEARCH_FORMULA : IMPLEMENT_FORMULA,
    calculation: research
      ? `คำนวณได้ ${indexLabel} จาก DoD ${formatPercent(score.dodWeightedScore)} คุณภาพ Spike ${formatPercent(score.spikeQuality)} รับเข้า ${formatPercent(score.outcomeIndexPct)} รีวิวและ reopen ${formatPercent(score.reviewReopenQuality)}`
      : `คำนวณได้ ${indexLabel} จากคะแนนถ่วง ${formatPercent(score.weightedScore)} ปิดตามแผน ${formatPercent(score.planIndexPct)} ความแม่น ${formatPercent(score.accuracyShare * 100)} คุณภาพ ${formatPercent(score.quality * 100)}`,
    quarterText: quarterText(person, tickets, options?.weights),
    trend: selfTrend(person, tickets, options?.weights),
    kpis: research ? researchKpis(score) : implementKpis(score),
    effortBars: effortBars(closed),
    slipShare: slipShare(closed),
    categoryShare: categoryShare(closed),
    qualityBars: qualityBars(closed),
    openWork: open.map(toWorkRow),
    closedWork: closed.map(toWorkRow),
    openCount: open.length,
    closedCount: closed.length,
  };
}

function emptyView(): PersonDashboardView {
  return {
    found: false,
    id: '',
    name: '',
    role: '',
    level: '',
    trackLabel: '',
    quota: 0,
    index: 0,
    indexLabel: '',
    target: INDEX_TARGET,
    formulaId: 'Implement',
    formula: '',
    calculation: '',
    quarterText: '',
    trend: [],
    kpis: [],
    effortBars: [],
    slipShare: [],
    categoryShare: [],
    qualityBars: [],
    openWork: [],
    closedWork: [],
    openCount: 0,
    closedCount: 0,
  };
}

function effortBars(closed: readonly Ticket[]): EffortBar[] {
  return closed.slice(0, 12).map((ticket) => ({
    id: ticket.id,
    label: ticket.id,
    estimateMd: ticket.estimateMd,
    actualMd: ticket.actualMd,
  }));
}

function slipShare(closed: readonly Ticket[]): SharePoint[] {
  let onTime = 0;
  let slip1 = 0;
  let slip2 = 0;
  for (const ticket of closed) {
    if (ticket.weekOffset <= 0) {
      onTime += 1;
    } else if (ticket.weekOffset === 1) {
      slip1 += 1;
    } else {
      slip2 += 1;
    }
  }
  return [
    { x: 'ตรงสัปดาห์', y: onTime, text: String(onTime) },
    { x: 'เลื่อน 1', y: slip1, text: String(slip1) },
    { x: 'เลื่อน 2+', y: slip2, text: String(slip2) },
  ].filter((row) => row.y > 0);
}

function categoryShare(closed: readonly Ticket[]): SharePoint[] {
  const counts = new Map<string, number>();
  for (const ticket of closed) {
    const key =
      ticket.workCategory && ticket.workCategory in CATEGORY_LABELS
        ? CATEGORY_LABELS[ticket.workCategory as WorkCategory]
        : ticket.type;
    const weight = ticket.storyPoints ?? (ticket.actualMd || ticket.estimateMd || 1);
    counts.set(key, (counts.get(key) ?? 0) + weight);
  }
  return [...counts.entries()]
    .map(([x, y]) => ({ x, y: round1(y), text: `${x} ${formatMd(y)}` }))
    .sort((left, right) => right.y - left.y || left.x.localeCompare(right.x, 'th'));
}

function qualityBars(closed: readonly Ticket[]): QualityBar[] {
  return closed.slice(0, 12).map((ticket) => ({
    id: ticket.id,
    label: ticket.id,
    reviewRounds: ticket.reviewRounds,
    reopenCount: ticket.reopenCount,
  }));
}

function toWorkRow(ticket: Ticket): PersonWorkRow {
  const scored = scoreTicket(ticket);
  return {
    id: ticket.id,
    title: ticket.title?.trim() || ticket.module,
    type: ticket.type,
    size: ticket.size,
    status: workflowStatusOf(ticket),
    estimateMd: ticket.estimateMd,
    actualMd: ticket.actualMd,
    weekOffsetLabel: weekOffsetLabel(ticket.weekOffset),
    reviewRounds: ticket.reviewRounds,
    reopenCount: ticket.reopenCount,
    score: scored.total,
    dueOnLabel: formatDate(ticket.dueOn ?? ticket.firstDueOn ?? null),
    unplannedLabel: ticket.unplanned ? 'นอกแผน' : 'ในแผน',
  };
}

function weekOffsetLabel(offset: number): string {
  if (offset <= 0) {
    return 'ตรงสัปดาห์';
  }
  if (offset === 1) {
    return 'เลื่อน 1';
  }
  return 'เลื่อน 2+';
}

function formatDate(iso: string | null): string {
  if (!iso) {
    return '—';
  }
  const [year, month, day] = iso.split('-');
  if (!year || !month || !day) {
    return iso;
  }
  return `${day}/${month}/${year}`;
}

function selfTrend(person: Person, tickets: readonly Ticket[], weights?: TrackWeights): SelfTrendPoint[] {
  const own = tickets.filter((ticket) => ticket.assigneeId === person.id && ticket.closed && ticket.closedOn);
  const months = [...new Set(own.map((ticket) => ticket.closedOn!.slice(0, 7)))].sort();
  return months.map((month) => {
    const inMonth = own.filter((ticket) => ticket.closedOn!.startsWith(month));
    return {
      month: monthLabel(month),
      index: round1(scorePerson(person, inMonth, weights).developmentIndex),
      target: INDEX_TARGET,
    };
  });
}

function quarterText(person: Person, tickets: readonly Ticket[], weights?: TrackWeights): string {
  const own = tickets.filter((ticket) => ticket.assigneeId === person.id && ticket.closed && ticket.closedOn);
  const quarters = new Map<string, { label: string; order: number; tickets: Ticket[] }>();
  for (const ticket of own) {
    const quarter = quarterOf(ticket.closedOn!);
    const group = quarters.get(quarter.key);
    if (group) {
      group.tickets.push(ticket);
    } else {
      quarters.set(quarter.key, { label: quarter.label, order: quarter.order, tickets: [ticket] });
    }
  }
  const ordered = [...quarters.values()].sort((left, right) => left.order - right.order);
  const current = ordered.at(-1);
  if (!current) {
    return 'ยังไม่มีใบที่ปิด จึงยังไม่มีแนวโน้มของคนนี้';
  }
  const currentIndex = formatPercent(scorePerson(person, current.tickets, weights).developmentIndex);
  const previous = ordered.at(-2);
  if (!previous) {
    return `${current.label} ดัชนี ${currentIndex} ยังไม่มีไตรมาสก่อนของคนนี้`;
  }
  const previousScore = scorePerson(person, previous.tickets, weights).developmentIndex;
  const previousIndex = formatPercent(previousScore);
  const delta = round1(scorePerson(person, current.tickets, weights).developmentIndex - previousScore);
  const direction = delta > 0 ? 'สูงขึ้นจากตัวเอง' : delta < 0 ? 'ต่ำลงจากตัวเอง' : 'เท่ากับตัวเอง';
  return `${current.label} ดัชนี ${currentIndex} เทียบ${previous.label} ดัชนี ${previousIndex} ${direction} ${formatPercent(Math.abs(delta))}`;
}

function implementKpis(score: ReturnType<typeof scorePerson>): KpiExplanation[] {
  return [
    {
      id: 'weighted',
      label: 'คะแนนถ่วง',
      value: formatPercent(score.weightedScore),
      meaning: 'ความน่าเชื่อถือของแผน ไม่ใช่ความเร็ว',
      criterion: '40 มาจากส่งตรงสัปดาห์ น้ำหนัก 50% ในดัชนี',
    },
    {
      id: 'plan',
      label: 'ปิดตามแผน',
      value: `${formatPercent(score.planRawPct)}%`,
      meaning: 'ปิดได้ตาม MD ที่รับไว้',
      criterion: 'ดัชนีใช้ไม่เกิน 100 แม้ตัวเลขจริงจะเกิน น้ำหนัก 20%',
    },
    {
      id: 'accuracy',
      label: 'ความแม่น estimate',
      value: `${formatPercent(score.accuracyShare * 100)}%`,
      meaning: 'การตีขนาดเก่งขึ้น เทียบกับตัวเอง',
      criterion: '20 มาจากอัตราส่วน 0.8–1.5 น้ำหนัก 15%',
    },
    {
      id: 'rework',
      label: 'คุณภาพจาก rework',
      value: `${formatPercent(score.quality * 100)}%`,
      meaning: 'ของที่ส่งแล้วอยู่ได้หลัง DEV/UAT',
      criterion: '20 มาจากไม่ reopen น้ำหนัก 15%',
    },
    {
      id: 'unplanned',
      label: 'นอกแผน',
      value: `${formatPercent(score.unplannedRatio * 100)}%`,
      meaning: 'งานกระทันหันกินช่องนอกแผน',
      criterion: 'unplanned MD / 5 ไม่เข้าดัชนี เป้าไม่เกิน 25%',
    },
  ];
}

function researchKpis(score: ReturnType<typeof scorePerson>): KpiExplanation[] {
  return [
    {
      id: 'dod',
      label: 'คะแนน DoD',
      value: formatPercent(score.dodWeightedScore),
      meaning: 'Feature และ CR ที่ส่งแล้วผ่านเกณฑ์ที่รับไว้',
      criterion: 'เฉพาะใบที่ปิดและผ่าน DoD น้ำหนัก 40%',
    },
    {
      id: 'spike',
      label: 'คุณภาพ Spike',
      value: formatPercent(score.spikeQuality),
      meaning: 'Spike ที่ปิดใน time-box และแตกใบลูกที่ตีขนาดแล้ว',
      criterion: '100 เมื่อปิดใน time-box 0.5 หรือ 1 MD และมีใบลูกที่ตีขนาดแล้ว น้ำหนัก 25%',
    },
    {
      id: 'outcome',
      label: 'MD ที่รับเข้า',
      value: `${formatPercent(score.outcomeRawPct)}%`,
      meaning: 'ปิดได้ตาม MD ที่รับไว้',
      criterion: 'actual ของ Feature/CR ที่ผ่าน DoD ต่อ estimate ของ Feature/CR น้ำหนัก 20%',
    },
    {
      id: 'review',
      label: 'คุณภาพรีวิวและ reopen',
      value: formatPercent(score.reviewReopenQuality),
      meaning: 'ส่งให้คนอื่นตรวจแล้วยังไม่พังเรื่อง security หรือ boundary และอยู่ได้หลัง DEV/UAT',
      criterion: '20 มาจากรีวิวไม่เกิน 2 รอบและไม่มี blocker และ 20 มาจากไม่ reopen น้ำหนัก 15%',
    },
    {
      id: 'spike-ratio',
      label: 'สัดส่วน Spike',
      value: `${formatPercent(score.spikeRatio * 100)}%`,
      meaning: 'สัดส่วนการค้นพบ ต่ำไปคือเดา มากไปคือ requirement ยังไม่พร้อม',
      criterion: 'เป้า 15–40% ของ MD ที่วางไว้ ไม่เข้าดัชนี',
    },
  ];
}

function monthLabel(yearMonth: string): string {
  const [year, month] = yearMonth.split('-');
  const label = MONTH_LABELS[Number(month) - 1] ?? yearMonth;
  return `${label} ${Number(year) + 543}`;
}

function quarterOf(iso: string): { key: string; label: string; order: number } {
  const [yearText, monthText] = iso.split('-');
  const year = Number(yearText);
  const quarter = Math.floor((Number(monthText) - 1) / 3) + 1;
  return {
    key: `${year}-Q${quarter}`,
    label: `ไตรมาส ${quarter}/${year + 543}`,
    order: year * 4 + quarter,
  };
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
