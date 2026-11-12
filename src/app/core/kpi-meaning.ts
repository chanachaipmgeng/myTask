import { Person, Ticket } from './models';
import { TicketScore, UNPLANNED_DENOMINATOR, formatPercent, scoreTicket } from './scoring';

export interface KpiExplanation {
  id: string;
  label: string;
  value: string;
  meaning: string;
  criterion: string;
}

export function scorePartNotes(score: TicketScore): string {
  if (score.total === null) {
    return 'ยังไม่ปิด จึงยังไม่มีคะแนน';
  }
  return [weekCriterion(score.week), accuracyCriterion(score), reviewCriterion(score.review), reopenCriterion(score.reopen)].join(
    ' · ',
  );
}

export function weekCriterion(points: number): string {
  if (points === 40) {
    return '40 มาจากส่งตรงสัปดาห์';
  }
  if (points === 20) {
    return '20 มาจากเลื่อน 1 สัปดาห์';
  }
  return '0 มาจากเลื่อนเกิน 1 สัปดาห์';
}

export function accuracyCriterion(score: TicketScore): string {
  if (score.exempt) {
    return '20 มาจากยกเว้น REQ/BLK/ENV ไม่ได้หักความแม่น';
  }
  if (score.accuracy === 20) {
    return '20 มาจากอัตราส่วน 0.8–1.5';
  }
  if (score.accuracy === 10) {
    return '10 มาจากอัตราส่วนชายขอบ';
  }
  return '0 มาจากอัตราส่วนนอกช่วง';
}

export function reviewCriterion(points: number): string {
  if (points === 20) {
    return '20 มาจากรีวิวไม่เกิน 2 รอบและไม่มี blocker';
  }
  if (points === 10) {
    return '10 มาจากรีวิว 3 รอบ';
  }
  return '0 มาจากรีวิวที่พัง security หรือ boundary';
}

export function reopenCriterion(points: number): string {
  if (points === 20) {
    return '20 มาจากไม่ reopen';
  }
  if (points === 10) {
    return '10 มาจาก reopen ครั้งเดียว';
  }
  return '0 มาจาก reopen ซ้ำ';
}

export function kpiExplanations(tickets: readonly Ticket[], people: readonly Person[]): KpiExplanation[] {
  const closed = tickets.filter((ticket) => ticket.closed);
  const count = closed.length;
  const share = (include: (ticket: Ticket) => boolean): number =>
    count === 0 ? 0 : (closed.filter(include).length / count) * 100;
  const plannedMd = people.reduce((sum, person) => sum + person.plannedMd, 0);
  const closedMd = closed.reduce((sum, ticket) => sum + ticket.actualMd, 0);
  const plan = plannedMd === 0 ? 0 : (closedMd / plannedMd) * 100;
  const unplannedMd = tickets
    .filter((ticket) => ticket.track === 'Implement' && ticket.unplanned)
    .reduce((sum, ticket) => sum + (ticket.closed ? ticket.actualMd : ticket.estimateMd), 0);
  const researchPlanned = people
    .filter((person) => person.track === 'RD')
    .reduce((sum, person) => sum + person.plannedMd, 0);
  const spikeMd = tickets
    .filter((ticket) => ticket.track === 'RD' && ticket.type === 'Spike')
    .reduce((sum, ticket) => sum + ticket.estimateMd, 0);
  const spike = researchPlanned === 0 ? 0 : (spikeMd / researchPlanned) * 100;

  return [
    {
      id: 'ontime',
      label: 'ส่งตามสัปดาห์',
      value: `${formatPercent(share((ticket) => scoreTicket(ticket).week === 40))}%`,
      meaning: 'ความน่าเชื่อถือของแผน ไม่ใช่ความเร็ว',
      criterion: '40 มาจากส่งตรงสัปดาห์',
    },
    {
      id: 'accuracy',
      label: 'ความแม่น estimate',
      value: `${formatPercent(share((ticket) => scoreTicket(ticket).accuracyInBand))}%`,
      meaning: 'การตีขนาดเก่งขึ้น เทียบกับตัวเอง',
      criterion: '20 มาจากอัตราส่วน 0.8–1.5',
    },
    {
      id: 'review',
      label: 'คุณภาพรีวิว',
      value: `${formatPercent(share((ticket) => scoreTicket(ticket).review === 20))}%`,
      meaning: 'ส่งให้คนอื่นตรวจแล้วยังไม่พังเรื่อง security หรือ boundary',
      criterion: '20 มาจากรีวิวไม่เกิน 2 รอบและไม่มี blocker',
    },
    {
      id: 'reopen',
      label: 'ไม่ reopen',
      value: `${formatPercent(share((ticket) => scoreTicket(ticket).reopen === 20))}%`,
      meaning: 'ของที่ส่งแล้วอยู่ได้หลัง DEV/UAT',
      criterion: '20 มาจากไม่ reopen',
    },
    {
      id: 'plan',
      label: 'ปิดตามแผน',
      value: `${formatPercent(plan)}%`,
      meaning: 'ปิดได้ตาม MD ที่รับไว้',
      criterion: 'ดัชนีใช้ไม่เกิน 100 แม้ตัวเลขจริงจะเกิน',
    },
    {
      id: 'unplanned',
      label: 'นอกแผน Implement',
      value: `${formatPercent((unplannedMd / UNPLANNED_DENOMINATOR) * 100)}%`,
      meaning: 'งานกระทันหันกินช่องนอกแผน',
      criterion: 'unplanned MD / 5 ไม่เข้าดัชนี เป้าไม่เกิน 25%',
    },
    {
      id: 'spike',
      label: 'สัดส่วน Spike',
      value: `${formatPercent(spike)}%`,
      meaning: 'สัดส่วนการค้นพบ ต่ำไปคือเดา มากไปคือ requirement ยังไม่พร้อม',
      criterion: 'เป้า 15–40% ของ MD ที่วางไว้ ไม่เข้าดัชนี',
    },
  ];
}
