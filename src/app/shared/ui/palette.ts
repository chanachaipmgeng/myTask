import {
  PRISM_CHART_PALETTE_DARK,
  PRISM_CHART_PALETTE_LIGHT,
} from '../../../../shared/domain/palette';

export * from '../../../../shared/domain/palette';

export function prismChartPalette(isDark = false): string[] {
  return [...(isDark ? PRISM_CHART_PALETTE_DARK : PRISM_CHART_PALETTE_LIGHT)];
}
