import { ChartPoint } from '../core/models';

/** Team totals from the 2568 report. Context only — not a person score. */
export const TEAM_CONTEXT_2568 = {
  yearLabel: '2568',
  tasks: 1319,
  onTimePct: 92.8,
  firstPassQaPct: 89,
  attendancePct: 94.7,
  workload: [
    { x: 'Bug', y: 46, text: '46%' },
    { x: 'Customization', y: 38, text: '38%' },
    { x: 'Enhancement', y: 12, text: '12%' },
    { x: 'Request', y: 4, text: '4%' },
  ] satisfies ChartPoint[],
};
