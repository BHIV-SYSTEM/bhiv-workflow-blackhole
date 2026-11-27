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

/**
 * Read the day score from any progress payload that carries it.
 * Legacy score fields are used only when a payload has no day score yet.
 */
export function dayScore(source) {
  const value = source?.dayProductivity?.score;
  if (value !== undefined && value !== null && !Number.isNaN(Number(value))) {
    return Number(value);
  }
  const legacy = source?.productivityScore ?? source?.avgProductivityScore ?? source?.avgProductivity ?? 0;
  return Number(legacy) || 0;
}

/** Zone styles for a progress payload (employee / team summary row). */
export function dayScoreStyle(source) {
  return dayZoneStyle(dayScore(source));
}
