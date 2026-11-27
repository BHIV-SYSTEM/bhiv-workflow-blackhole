/**
 * Shared red / yellow / green presentation for the day score.
 * Display-only helper: no calculation rules or coaching text are rendered.
 */

export const DAY_ZONE_STYLES = {
  green: {
    zone: 'green',
    label: 'Green',
    dot: 'bg-emerald-500',
    text: 'text-emerald-600 dark:text-emerald-400',
    bar: '[&>div]:bg-emerald-500',
    badge: 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  },
  yellow: {
    zone: 'yellow',
    label: 'Yellow',
    dot: 'bg-amber-500',
    text: 'text-amber-600 dark:text-amber-400',
    bar: '[&>div]:bg-amber-500',
    badge: 'border border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400',
  },
  red: {
    zone: 'red',
    label: 'Red',
    dot: 'bg-rose-500',
    text: 'text-rose-600 dark:text-rose-400',
    bar: '[&>div]:bg-rose-500',
    badge: 'border border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400',
  },
};

/** Zone for a numeric score. */
export function dayZone(score) {
  const value = Number(score) || 0;
  if (value >= 80) return 'green';
  if (value >= 70) return 'yellow';
  return 'red';
}

/** Zone styles for a numeric score. */
export function dayZoneStyle(score) {
  return DAY_ZONE_STYLES[dayZone(score)];
}

/** Efficiency is the day-score colour, written as a label. */
export function dayEfficiencyLabel(score) {
  const zone = dayZone(score);
  if (zone === 'green') return 'High Efficiency';
  if (zone === 'yellow') return 'Moderate Efficiency';
  return 'Low Efficiency';
}

/**
 * Read the canonical day score from a payload. Legacy averages are never used
 * as a display fallback — a missing score is shown as 0, not random data.
 */
export function dayScore(source) {
  const value = source?.dayProductivity?.score;
  if (value === undefined || value === null || Number.isNaN(Number(value))) return 0;
  return Number(value);
}

/** Zone styles for a progress payload (employee / team summary row). */
export function dayScoreStyle(source) {
  return dayZoneStyle(dayScore(source));
}
