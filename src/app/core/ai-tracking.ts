import { Person, Ticket } from './models';
import { SPIKE_RATIO_MAX, SPIKE_RATIO_MIN, formatMd, formatPercent, scorePerson } from './scoring';

export type AiTrackLabel = 'Spike' | 'myBOX' | 'AI Agent' | 'AI';

export interface AiTicketPoint {
  id: string;
  module: string;
  label: AiTrackLabel;
  md: number;
  closed: boolean;
}

export interface ResearchSpikeShare {
  ratio: number;
  percentLabel: string;
  spikeMd: number;
  plannedMd: number;
  inBand: boolean;
  bandLabel: string;
}

export function aiTrackLabel(ticket: Ticket): AiTrackLabel | null {
  const text = `${ticket.module} ${ticket.note}`;
  if (/mybox/i.test(text)) {
    return 'myBOX';
  }
  if (/ai agent/i.test(text)) {
    return 'AI Agent';
  }
  if (/\bai\b/i.test(text)) {
    return 'AI';
  }
  if (ticket.type === 'Spike') {
    return 'Spike';
  }
  return null;
}

export function aiTicketPoints(tickets: readonly Ticket[]): AiTicketPoint[] {
  return tickets.flatMap((ticket) => {
    const label = aiTrackLabel(ticket);
    if (!label) {
      return [];
    }
    return [
      {
        id: ticket.id,
        module: ticket.module,
        label,
        md: ticket.closed ? ticket.actualMd : ticket.estimateMd,
        closed: ticket.closed,
      },
    ];
  });
}

/** Same R&D spike ratio as scorePerson: spike estimate MD / planned MD. Not a new score. */
export function researchSpikeShare(people: readonly Person[], tickets: readonly Ticket[]): ResearchSpikeShare {
  const research = people.filter((person) => person.track === 'RD');
  let spikeMd = 0;
  let plannedMd = 0;
  for (const person of research) {
    const score = scorePerson(person, tickets);
    spikeMd += score.spikeMd;
    plannedMd += score.plannedMd;
  }
  const ratio = plannedMd === 0 ? 0 : spikeMd / plannedMd;
  const inBand = ratio >= SPIKE_RATIO_MIN && ratio <= SPIKE_RATIO_MAX;
  return {
    ratio,
    percentLabel: `${formatPercent(ratio * 100)}%`,
    spikeMd,
    plannedMd,
    inBand,
    bandLabel: inBand ? 'ในช่วง 15–40%' : 'นอกช่วง 15–40%',
  };
}

export function acceptedTrackedMd(tickets: readonly Ticket[]): number {
  return aiTicketPoints(tickets)
    .filter((point) => point.closed)
    .reduce((sum, point) => sum + point.md, 0);
}

export function formatTrackedMd(value: number): string {
  return formatMd(value);
}
