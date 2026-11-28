/**
 * Day Productivity Engine — red / yellow / green day score.
 *
 * The day always starts at 0. Continuous, focused work lifts the score; long
 * idle stretches pull it back. A strong final hour can no longer hide a weak
 * day: the displayed score also reflects how much of the day was actually
 * worked. Short pauses count as work; long gaps do not.
 *
 * Live work score, tick-by-tick (each telemetry sample ≈ 5 s):
 *
 *   P(0) = 0
 *   if target > P:  P ← P + α · (target − P) · Δt     (rise, α = 0.008 /s)
 *   else:           P ← P + β · (target − P) · Δt     (decay, β = 0.0008 /s)
 *
 * Δt is capped at 120 s so a telemetry gap never destroys the live score.
 * The per-tick `target` uses four criteria: input, mouse, keys and platform.
 * Voice-command users are credited for engagement and platform instead of
 * keystrokes they never produce, so they can still reach green.
 *
 * Day factor: active time / elapsed day. It is lenient — 70% active time earns
 * full credit — but a 1-hour burst after hours of idle stays red. The hourly
 * chart points use the same factor, so the last chart point always matches
 * the daily card.
 *
 * Zones (employee-confirmed): red < 70, yellow 70-79, green ≥ 80.
 */

const { evaluateSample, IST_OFFSET_MS } = require('./telemetryMetrics');

const ZONE = { RED: 'red', YELLOW: 'yellow', GREEN: 'green' };
const ZONE_THRESHOLDS = { yellow: 70, green: 80 }; // red < 70, yellow 70-79, green >= 80

// Asymmetric recurrence constants (per second).
const RISE_RATE = 0.008;   // α — climb toward the tick target while working
const DECAY_RATE = 0.0008; // β — gentle pull down while idle/distracted (a few points/minute)
const MAX_TICK_GAP_SEC = 120;

// Whole-day steadiness. Short breaks are forgiven; long idle time reduces the
// displayed score so a final burst cannot outrank steady work all day.
const FULL_CREDIT_COVERAGE = 0.70; // 70%+ of the elapsed day -> no reduction
const MIN_CREDIT_COVERAGE = 0.20;  // below this -> strongest reduction
const MIN_COVERAGE_FACTOR = 0.30;  // one good hour cannot become a green day
const MAX_DAY_SPAN_SEC = 12 * 3600; // ignore absurd multi-day spans leniently

// Unproductive platforms can never sustain a green target.
const DISTRACTION_TARGET_CAP = 45;

// Mode detection: voice/assistive platforms must own enough engaged time and
// the employee must barely type (normal typing ≈ 200+ keys/min).
const VOICE_MODE_MIN_ENGAGED_TICKS = 4;
const VOICE_MODE_PLATFORM_SHARE = 0.35;
const VOICE_MODE_MAX_KEYS_PER_MIN = 25;

const PLATFORM_FACTOR_STANDARD = {
  productive: 1.0,
  assistive: 0.9,
  voice: 0.9,
  neutral: 0.6,
  unproductive: 0.2,
};

const PLATFORM_FACTOR_VOICE = {
  voice: 1.0,
  assistive: 0.95,
  productive: 0.85,
  neutral: 0.5,
  unproductive: 0.15,
};

// ── Platform classification ──────────────────────────────────────────────────
// Window titles + app names only (raw URLs are prohibited by the platform
// privacy boundary). `app_category === 'DISTRACTION'` from the server-side
// classifier wins outright.

const UNPRODUCTIVE_PATTERNS = [
  /\byoutube\b/, /\bnetflix\b/, /\bprime video\b/, /\bhotstar\b/, /\bdisney\+/,
  /\bspotify\b/, /\binstagram\b/, /\bfacebook\b/, /\btwitter\b/, /\breddit\b/,
  /\btiktok\b/, /\btwitch\b/, /\bsteam\b/, /\belectric\s*games\b/, /\bgames?\b.*\blauncher\b/,
  /\bpinterest\b/, /\bsnapchat\b/, /\btelegram\b.*\bweb\b/, /\bsoundcloud\b/,
];

const VOICE_PATTERNS = [
  /\bdictation\b/, /\bdragon\b/, /\bspeech\s*recognition\b/, /\bspeech\s*to\s*text\b/,
  /\bvoice\s*to\s*text\b/, /\bvoice\s*typing\b/, /\bgoogle\s*voice\s*typing\b/,
  /\botter\b/, /\bwhisper\b/, /\bvoicenote\b/, /\bvoice\s*note\b/, /\baudio\s*memo\b/,
  /\bwindows\s*speech\b/, /\bvoice\s*control\b/, /\bvoice\s*command\b/,
  /\bvoice\s*recorder\b/, /\bvoice\s*memos?\b/, /\bmicrophone\b/,
];

const ASSISTIVE_PATTERNS = [
  /\bchatgpt\b/, /\bgpt-?\d\b/, /\bopenai\b/, /\bclaude\b/, /\bcopilot\b/,
  /\bgemini\b/, /\bperplexity\b/, /\bdeepseek\b/, /\bllama\b/, /\bchatbot\b/,
  /\bai assistant\b/, /\bartificial intelligence\b/, /\bcursor\b/, /\bwindsurf\b/, /\bantigravity\b/,
  /\bcodeium\b/, /\btabnine\b/, /\bgrimoire\b/, /\bpoe\.com\b/, /\byou\.com\b/,
  /\bblackhole\s*agent\b/, /\bniyantran\b.*\bagent\b/,
];

const PRODUCTIVE_PATTERNS = [
  /\bvisual studio code\b/, /\bvscode\b/, /\bvs code\b/, /\bintellij\b/, /\bwebstorm\b/,
  /\bpycharm\b/, /\bpostman\b/, /\bdocker\b/, /\bterminal\b/, /\bpowershell\b/,
  /\bcmd\b/, /\bgit\b/, /\bgithub\b/, /\bgitlab\b/, /\bbitbucket\b/, /\bjira\b/,
  /\bconfluence\b/, /\bslack\b/, /\bteams\b/, /\boutlook\b/, /\bexcel\b/, /\bword\b/,
  /\bpowerpoint\b/, /\bfigma\b/, /\bnotion\b/, /\btrello\b/, /\basana\b/,
  /\blinear\b/, /\bsonar\b/, /\bwebpack\b/, /\bvite\b/, /\bnode\.js\b/, /\bnpm\b/,
  /\bpython\b/, /\bpycharm\b/, /\bandroid studio\b/, /\bxcode\b/, /\bdatagrip\b/,
  /\binfiverse\b/, /\bblackhole\b/, /\bniyantran\b/, /\bactivity\s*dashboard\b/,
];

const PRODUCTIVE_NAME_PATTERNS = [
  // Bare process names the title-based patterns miss (VS Code's window title
  // is usually "file.js - Code").
  /^code(\.exe)?$/i, /^windowsterminal(\.exe)?$/i, /^powershell(\.exe)?$/i,
  /^cmd(\.exe)?$/i, /^wt(\.exe)?$/i, /^devenv(\.exe)?$/i, /^pycharm64(\.exe)?$/i,
  /^idea64(\.exe)?$/i, /^excel(\.exe)?$/i, /^winword(\.exe)?$/i, /^outlook(\.exe)?$/i,
  /^teams(\.exe)?$/i, /^slack(\.exe)?$/i, /^docker desktop(\.exe)?$/i,
];

function classifyPlatform(act) {
  const appCategory = String(act?.app_category || '').toUpperCase();
  if (appCategory === 'DISTRACTION') return 'unproductive';

  const appName = String(act?.active_application?.name || '');
  const title = String(act?.active_application?.title || '');
  const haystack = `${appName} ${title}`.toLowerCase();
  if (!haystack.trim()) return 'neutral';

  if (UNPRODUCTIVE_PATTERNS.some((re) => re.test(haystack))) return 'unproductive';
  if (VOICE_PATTERNS.some((re) => re.test(haystack))) return 'voice';
  if (ASSISTIVE_PATTERNS.some((re) => re.test(haystack))) return 'assistive';
  if (PRODUCTIVE_PATTERNS.some((re) => re.test(haystack))) return 'productive';
  if (PRODUCTIVE_NAME_PATTERNS.some((re) => re.test(appName.trim()))) return 'productive';
  return 'neutral';
}

// Same app/window pair appears in thousands of 5-second samples. Cache the
// regex classification so summary endpoints do not repeat that work per tick.
const CLASSIFICATION_CACHE_LIMIT = 5000;
const classificationCache = new Map();
function classifyPlatformCached(act) {
  const category = String(act?.app_category || '').toUpperCase();
  const name = String(act?.active_application?.name || '');
  const title = String(act?.active_application?.title || '');
  const key = `${category}\u0000${name}\u0000${title}`;
  const cached = classificationCache.get(key);
  if (cached !== undefined) return cached;
  if (classificationCache.size >= CLASSIFICATION_CACHE_LIMIT) {
    // Evict the oldest quarter instead of clearing everything. Window titles
    // repeat heavily within a day, so a full clear made the regex suite run
    // again on every sample right after the cache filled up.
    let toEvict = Math.floor(CLASSIFICATION_CACHE_LIMIT / 4);
    for (const oldKey of classificationCache.keys()) {
      classificationCache.delete(oldKey);
      if (--toEvict <= 0) break;
    }
  }
  const value = classifyPlatform(act);
  classificationCache.set(key, value);
  return value;
}

// ── Per-criterion helpers ────────────────────────────────────────────────────

/** Graded engagement from system idle (reading/thinking credit, 5-min cliff). */
function engagementFactor(rawIdleSec) {
  if (rawIdleSec < 30) return 1;
  if (rawIdleSec < 120) return 0.8;
  if (rawIdleSec < 300) return 0.5;
  return 0;
}

/** Normalized mouse movement 0-100 (same normalization as evaluateSample). */
function normalizedMouse(act, ev) {
  const mouseScore = Number(act?.mouse_activity_score || 0);
  if (mouseScore > 0) return Math.min(100, mouseScore);
  const events = Number(act?.mouse_event_count || 0);
  if (events > 0 && ev.sampleSec > 0) {
    return Math.min(100, Math.round((((events / ev.sampleSec) * 60) / 120) * 100));
  }
  return 0;
}

/** Keystroke criterion: 60 keys/min or more earns full credit. */
function keyFactor(ev) {
  if (ev.keys <= 0 || ev.sampleSec <= 0) return 0;
  const cadencePerMin = (ev.keys / ev.sampleSec) * 60;
  return Math.min(1, cadencePerMin / 60);
}

function classifyZone(score, hasActivity) {
  if (!hasActivity) return ZONE.RED;
  if (score >= ZONE_THRESHOLDS.green) return ZONE.GREEN;
  if (score >= ZONE_THRESHOLDS.yellow) return ZONE.YELLOW;
  return ZONE.RED;
}

/**
 * Lenient day factor from active time / elapsed time.
 * Returns 1 once the day is at least 70% active, and never returns 0 while
 * there is real activity — a weak day should still be visible, just low.
 */
function dayCoverageFactor(activeSec, elapsedSec) {
  if (!Number.isFinite(activeSec) || !Number.isFinite(elapsedSec) || elapsedSec <= 0) return 0;
  const coverage = Math.max(0, Math.min(1, activeSec / elapsedSec));
  if (coverage >= FULL_CREDIT_COVERAGE) return 1;
  if (coverage <= MIN_CREDIT_COVERAGE) return MIN_COVERAGE_FACTOR;
  return MIN_COVERAGE_FACTOR
    + (1 - MIN_COVERAGE_FACTOR)
      * ((coverage - MIN_CREDIT_COVERAGE) / (FULL_CREDIT_COVERAGE - MIN_CREDIT_COVERAGE));
}

// Efficiency is only a name for the day-score colour — never a second score.
const EFFICIENCY_BY_ZONE = {
  green: 'High Efficiency',
  yellow: 'Moderate Efficiency',
  red: 'Low Efficiency',
};
const EFFICIENCY_COLOR_BY_ZONE = {
  green: '#10b981',
  yellow: '#f59e0b',
  red: '#ef4444',
};

function efficiencyLabelForDay(score, hasActivity = true) {
  if (!hasActivity) return 'No Activity';
  return EFFICIENCY_BY_ZONE[classifyZone(score, true)];
}

function efficiencyColorForDay(score, hasActivity = true) {
  if (!hasActivity) return '#94a3b8';
  return EFFICIENCY_COLOR_BY_ZONE[classifyZone(score, true)];
}

// ── Tick target ──────────────────────────────────────────────────────────────

function standardTarget(act, ev, platform, rawIdle) {
  const hasInput = ev.hasInput;
  const actionsFactor = hasInput
    ? 1
    : (rawIdle < 30 ? 0.6 : rawIdle < 120 ? 0.4 : rawIdle < 300 ? 0.2 : 0);

  const actions = 25 * actionsFactor;
  const mouse = 25 * (normalizedMouse(act, ev) / 100);
  const keys = 25 * keyFactor(ev);
  const platformPts = 25 * (PLATFORM_FACTOR_STANDARD[platform] ?? 0.6);

  let target = actions + mouse + keys + platformPts;
  if (platform === 'unproductive') target = Math.min(target, DISTRACTION_TARGET_CAP);
  return { target, criteria: { actions, mouse, keys, platform: platformPts } };
}

function voiceTarget(act, ev, platform, rawIdle) {
  const engaged = engagementFactor(rawIdle);
  const voiceLike = platform === 'voice' || platform === 'assistive';

  const platformPts = 40 * (PLATFORM_FACTOR_VOICE[platform] ?? 0.5);
  const engagement = 30 * engaged;
  const mouse = 15 * (normalizedMouse(act, ev) / 100);
  // Input substitute: full credit while engaged on a voice/assistive platform
  // even with zero keystrokes — voice IS their keyboard.
  const input = 15 * ((ev.hasInput || (engaged > 0 && voiceLike)) ? 1 : 0);

  let target = platformPts + engagement + mouse + input;
  if (platform === 'unproductive') target = Math.min(target, DISTRACTION_TARGET_CAP);
  return { target, criteria: { actions: engagement, mouse, keys: input, platform: platformPts } };
}

// ── Engine ───────────────────────────────────────────────────────────────────

/**
 * Compute the day productivity score for an ordered (oldest-first) list of
 * EmployeeActivity samples.
 *
 * @returns {{
 *   score: number, zone: 'red'|'yellow'|'green', mode: 'standard'|'voice',
 *   hasActivity: boolean, criteria: {actions:number, mouse:number, keys:number, platform:number},
 *   trend: 'rising'|'steady'|'falling'|'none', engagedSeconds: number,
 *   voiceShare: number, hourly: Array<{hour:number, score:number}>
 * }}
 */
function computeDayProductivity(activities = [], options = {}) {
  const logs = Array.isArray(activities) ? activities : [];
  const opts = options || {};
  const evalCache = opts.evalCache || null;
  // Summary cards only need the score. Charts pass details: true to keep the
  // hourly timeline and trend, which are not needed by team/monthly tables.
  const includeDetails = opts.details !== false;

  const base = {
    score: 0,
    zone: ZONE.RED,
    mode: 'standard',
    hasActivity: logs.length > 0,
    criteria: { actions: 0, mouse: 0, keys: 0, platform: 0 },
    trend: 'none',
    engagedSeconds: 0,
    voiceShare: 0,
    hourly: [],
  };
  if (logs.length === 0) return base;

  // Pass 1 — classify every tick, find the day's span and detect input mode.
  let firstMs = null;
  const ticks = logs.map((act) => {
    const ev = (evalCache && evalCache.get(act)) || evaluateSample(act);
    const platform = classifyPlatformCached(act);
    // evaluateSample normalizes idle internally; re-derive the raw value the
    // same way so engagement grading matches the shared source of truth.
    let rawIdle = Number(act?.idle_duration || 0);
    if (!Number.isFinite(rawIdle) || rawIdle < 0) rawIdle = 0;
    if (rawIdle > 10000) rawIdle = Math.round(rawIdle / 1000);
    const ms = new Date(act.timestamp).getTime();
    if (Number.isFinite(ms) && (firstMs === null || ms < firstMs)) firstMs = ms;
    return { act, ev, platform, rawIdle, ms };
  });

  let engagedTicks = 0;
  let voiceLikeTicks = 0;
  let totalKeys = 0;
  let engagedSeconds = 0;
  for (const t of ticks) {
    const engaged = t.ev.isIdleSample ? 0 : 1;
    if (engaged) {
      engagedTicks += 1;
      engagedSeconds += t.ev.sampleSec;
      totalKeys += t.ev.keys;
      if (t.platform === 'voice' || t.platform === 'assistive') voiceLikeTicks += 1;
    }
  }
  const voiceShare = engagedTicks > 0 ? voiceLikeTicks / engagedTicks : 0;
  const keysPerMin = engagedSeconds > 0 ? (totalKeys / engagedSeconds) * 60 : 0;
  const mode = (
    engagedTicks >= VOICE_MODE_MIN_ENGAGED_TICKS
    && voiceShare >= VOICE_MODE_PLATFORM_SHARE
    && keysPerMin < VOICE_MODE_MAX_KEYS_PER_MIN
  ) ? 'voice' : 'standard';

  // Pass 2 — asymmetric rise/decay recurrence, P(0) = 0. The displayed score
  // is the live score scaled by how much of the day so far was really worked.
  let score = 0;
  let prevMs = null;
  let activeSecSoFar = 0;
  let displayedScore = 0;
  const scoreTimeline = []; // {ms, score} for trend (displayed score)
  const hourlyMap = new Map(); // hour -> last displayed score in that hour
  const criteriaSum = { actions: 0, mouse: 0, keys: 0, platform: 0 };
  const collectDetails = includeDetails;

  for (const t of ticks) {
    const ms = t.ms;
    const tickSec = t.ev.sampleSec;
    const dt = Number.isFinite(ms) && prevMs !== null
      ? Math.min(MAX_TICK_GAP_SEC, Math.max(0, (ms - prevMs) / 1000)) || tickSec
      : tickSec;
    prevMs = Number.isFinite(ms) ? ms : prevMs;

    const built = mode === 'voice'
      ? voiceTarget(t.act, t.ev, t.platform, t.rawIdle)
      : standardTarget(t.act, t.ev, t.platform, t.rawIdle);
    const target = Math.max(0, Math.min(100, built.target));

    const rate = target > score ? RISE_RATE : DECAY_RATE;
    score += rate * (target - score) * dt;
    score = Math.max(0, Math.min(100, score));

    activeSecSoFar += t.ev.activeSec;
    const elapsedSpanSec = Number.isFinite(ms) && firstMs !== null
      ? Math.min(MAX_DAY_SPAN_SEC, Math.max(tickSec, (ms - firstMs) / 1000 + tickSec))
      : Math.max(tickSec, activeSecSoFar);
    const factor = dayCoverageFactor(activeSecSoFar, elapsedSpanSec);
    displayedScore = Math.round(score * factor);

    if (collectDetails) {
      criteriaSum.actions += built.criteria.actions;
      criteriaSum.mouse += built.criteria.mouse;
      criteriaSum.keys += built.criteria.keys;
      criteriaSum.platform += built.criteria.platform;

      if (Number.isFinite(ms)) {
        scoreTimeline.push({ ms, score: displayedScore });
        const hour = new Date(ms + IST_OFFSET_MS).getUTCHours();
        hourlyMap.set(hour, { hour, score: displayedScore });
      }
    }
  }

  const n = ticks.length;
  const criteria = collectDetails ? {
    actions: Math.round((criteriaSum.actions / n) * 10) / 10,
    mouse: Math.round((criteriaSum.mouse / n) * 10) / 10,
    keys: Math.round((criteriaSum.keys / n) * 10) / 10,
    platform: Math.round((criteriaSum.platform / n) * 10) / 10,
  } : { actions: 0, mouse: 0, keys: 0, platform: 0 };

  // Trend: displayed score now vs ~10 min ago (earliest point if day is young).
  let trend = 'none';
  if (collectDetails && scoreTimeline.length >= 2) {
    const nowMs = scoreTimeline[scoreTimeline.length - 1].ms;
    const reference = scoreTimeline.find((p) => p.ms >= nowMs - 10 * 60 * 1000)
      || scoreTimeline[0];
    const delta = displayedScore - reference.score;
    trend = delta > 2 ? 'rising' : delta < -2 ? 'falling' : 'steady';
  }

  const finalScore = displayedScore;
  return {
    score: finalScore,
    zone: classifyZone(finalScore, true),
    mode,
    hasActivity: true,
    criteria,
    trend,
    engagedSeconds,
    voiceShare: Math.round(voiceShare * 100) / 100,
    hourly: [...hourlyMap.values()].sort((a, b) => a.hour - b.hour),
  };
}

module.exports = {
  ZONE,
  ZONE_THRESHOLDS,
  classifyPlatform,
  classifyZone,
  computeDayProductivity,
  efficiencyLabelForDay,
  efficiencyColorForDay,
};
