/**
 * Shared red / yellow / green presentation for the day score.
 * Display-only helper: no calculation rules or coaching text are rendered.
 */

export const DAY_ZONE_STYLES = {
  green: {
    zone: 'green',
    label: 'Green',
    dot: 'bg-emerald-500',
    stroke: '#10b981',
    text: 'text-emerald-600 dark:text-emerald-400',
    bar: '[&>div]:bg-emerald-500',
    badge: 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  },
  yellow: {
    zone: 'yellow',
    label: 'Yellow',
    dot: 'bg-amber-500',
    stroke: '#f59e0b',
    text: 'text-amber-600 dark:text-amber-400',
    bar: '[&>div]:bg-amber-500',
    badge: 'border border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400',
  },
  red: {
    zone: 'red',
    label: 'Red',
    dot: 'bg-rose-500',
    stroke: '#ef4444',
    text: 'text-rose-600 dark:text-rose-400',
    bar: '[&>div]:bg-rose-500',
    badge: 'border border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400',
  },
};

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** YYYY-MM-DD in IST, matching the server's day key. */
export function getIstDateKey(date = new Date()) {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(date);
  } catch (e) {
    return new Date(date).toISOString().slice(0, 10);
  }
}

/** Hour of day (0-23) in IST so charts match backend dayProductivity.hourly buckets. */
export function getIstHour(timestamp) {
  const ms = new Date(timestamp).getTime();
  if (!Number.isFinite(ms)) return 0;
  return new Date(ms + IST_OFFSET_MS).getUTCHours();
}

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

/**
 * Daily relative progress supplied by the server (0-100).
 *
 * The server derives it from today's team scores: the top worker is 100, the
 * least active is 0, and an employee who has not started the day stays at 0.
 * Falls back to the raw day score for older cached payloads that predate the
 * new field.
 */
export function workProgress(source) {
  const value = source?.dayProgress;
  if (value === undefined || value === null || Number.isNaN(Number(value))) {
    return dayScore(source);
  }
  return Math.max(0, Math.min(100, Number(value)));
}

/**
 * Zone styles for the daily relative progress bar.
 * Uses the standard thresholds on the displayed number:
 *   < 70 red, < 80 yellow, >= 80 green.
 */
export function workProgressStyle(source) {
  return dayZoneStyle(workProgress(source));
}
