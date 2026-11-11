/**
 * TRINETRA AI — scoring, timeline and verification engine.
 *
 * All functions here are pure with respect to persistence: they take documents that
 * were already read by the caller and return derived numbers. That keeps the
 * productivity index reproducible and testable, and guarantees the layer never
 * writes into task, attendance, salary or submission collections.
 *
 * Honesty rule: a score is only produced from real telemetry. When there is not
 * enough signal the result is `null` with an explicit `data_quality` verdict rather
 * than a fabricated 0 or 100.
 */

const { APP_CATEGORIES, DEFAULT_APP_RULES } = require('../models/TrinetraConfig');

const PRODUCTIVE_CATEGORIES = ['FOCUS', 'DOCUMENTATION'];
const DEFAULT_INTERVAL_SECONDS = 30;
const DEFAULT_IDLE_THRESHOLD_SECONDS = 120;

const TASK_OPEN_STATUSES = ['Pending', 'In Progress', 'Submitted for Review', 'Pending Validation', 'Returned'];
const TASK_CLOSED_STATUSES = ['Approved', 'Completed', 'Closed'];

function num(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round(value, digits = 0) {
  const factor = Math.pow(10, digits);
  return Math.round(value * factor) / factor;
}

function startOfDay(date) {
  const value = new Date(date || new Date());
  value.setHours(0, 0, 0, 0);
  return value;
}

function endOfDay(date) {
  const value = new Date(date || new Date());
  value.setHours(23, 59, 59, 999);
  return value;
}

/** Inclusive day bounds. Mirrors the server-local convention already used by EMS. */
function getDayBounds(date) {
  return { start: startOfDay(date), end: endOfDay(date) };
}

/** Monday 00:00 → Sunday 23:59:59.999 for the week containing `date`. */
function getWeekBounds(date) {
  const anchor = startOfDay(date);
  const dayIndex = anchor.getDay(); // 0 = Sunday
  const offsetToMonday = dayIndex === 0 ? -6 : 1 - dayIndex;
  const start = new Date(anchor);
  start.setDate(start.getDate() + offsetToMonday);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function getPeriodBounds(range, date) {
  return String(range).toLowerCase() === 'weekly' ? getWeekBounds(date) : getDayBounds(date);
}

function normalizeText(value) {
  return String(value || '').toLowerCase().trim();
}

/**
 * Best-effort domain extraction from a window title (e.g. "Pull requests · GitHub -
 * Google Chrome" → github.com is not recoverable, but "app.niyantran.com/dashboard"
 * is). Kept intentionally conservative: only used to enrich categorisation.
 */
function extractDomain(text) {
  const match = String(text || '').match(
    /\b((?:[a-z0-9-]+\.)+(?:com|in|io|org|net|dev|ai|app|co|me|so|xyz|tech|info|cloud|site|online))\b/i
  );
  return match ? match[1].toLowerCase() : null;
}

function prepareRules(rules) {
  const source = Array.isArray(rules) && rules.length > 0 ? rules : DEFAULT_APP_RULES;
  return source
    .filter((rule) => rule && rule.pattern && APP_CATEGORIES.includes(rule.category))
    .map((rule) => ({
      pattern: normalizeText(rule.pattern),
      field: ['app', 'title', 'any'].includes(rule.field) ? rule.field : 'any',
      category: rule.category,
      label: rule.label || rule.pattern
    }))
    .filter((rule) => rule.pattern.length > 0);
}

/**
 * Resolve an app + window title into a policy category.
 * Stored `app_category` always wins so historical scoring stays stable even if an
 * admin later edits the taxonomy.
 */
function categorizeActivity(activity, rules) {
  if (activity && APP_CATEGORIES.includes(activity.app_category)) {
    return {
      category: activity.app_category,
      label: (activity.active_application && activity.active_application.name) || 'Unknown',
      matched_pattern: null,
      source: 'stored'
    };
  }

  const app = normalizeText(activity && activity.active_application && activity.active_application.name);
  const title = normalizeText(activity && activity.active_application && activity.active_application.title);
  const domain = extractDomain(title) || '';
  const prepared = prepareRules(rules);

  for (const rule of prepared) {
    if (rule.field === 'app' && app.includes(rule.pattern)) {
      return { category: rule.category, label: rule.label, matched_pattern: rule.pattern, source: 'app_rule' };
    }
    if (rule.field === 'title' && (title.includes(rule.pattern) || domain.includes(rule.pattern))) {
      return { category: rule.category, label: rule.label, matched_pattern: rule.pattern, source: 'title_rule' };
    }
    if (rule.field === 'any' && (app.includes(rule.pattern) || title.includes(rule.pattern) || domain.includes(rule.pattern))) {
      return { category: rule.category, label: rule.label, matched_pattern: rule.pattern, source: 'any_rule' };
    }
  }

  return {
    category: 'NEUTRAL',
    label: (activity && activity.active_application && activity.active_application.name) || 'Unknown',
    matched_pattern: null,
    source: 'unmatched'
  };
}

function isIdleInterval(activity, idleThresholdSeconds) {
  return num(activity.idle_duration) >= idleThresholdSeconds;
}

function hasInput(activity) {
  return (
    num(activity.keystroke_count) > 0 ||
    num(activity.mouse_activity_score) >= 10
  );
}

function intervalSeconds(activity) {
  const value = num(activity.interval_seconds);
  return value > 0 ? Math.min(value, 3600) : DEFAULT_INTERVAL_SECONDS;
}

/**
 * Core aggregation for one employee over one window.
 */
function summarizeActivities(activities, settings) {
  const scoring = (settings && settings.scoring) || {};
  const idleThresholdSeconds = num(scoring.idle_threshold_seconds, DEFAULT_IDLE_THRESHOLD_SECONDS);
  const rules = (settings && settings.app_rules) || DEFAULT_APP_RULES;

  const categorySeconds = {};
  for (const category of APP_CATEGORIES) {
    categorySeconds[category] = 0;
  }

  const appBuckets = new Map();
  const taskSeconds = new Map();

  let spanSeconds = 0;
  let activeSeconds = 0;
  let idleSeconds = 0;
  let awayIntervals = 0;
  let totalKeystrokes = 0;
  let mouseScoreSum = 0;
  let mouseSamples = 0;
  let activeIntervals = 0;
  let firstTimestamp = null;
  let lastTimestamp = null;

  for (const activity of activities) {
    const seconds = intervalSeconds(activity);
    const categoryInfo = categorizeActivity(activity, rules);
    const idle = isIdleInterval(activity, idleThresholdSeconds);
    const active = !idle && hasInput(activity);

    spanSeconds += seconds;
    if (idle) {
      idleSeconds += seconds;
      awayIntervals += 1;
    }
    if (active) {
      activeSeconds += seconds;
      activeIntervals += 1;
      categorySeconds[categoryInfo.category] = (categorySeconds[categoryInfo.category] || 0) + seconds;
      totalKeystrokes += num(activity.keystroke_count);
      mouseScoreSum += clamp(num(activity.mouse_activity_score), 0, 100);
      mouseSamples += 1;

      const appName = (activity.active_application && activity.active_application.name) || 'Unknown';
      const bucket = appBuckets.get(appName) || {
        app: appName,
        category: categoryInfo.category,
        seconds: 0,
        title: (activity.active_application && activity.active_application.title) || ''
      };
      bucket.seconds += seconds;
      if (activity.active_application && activity.active_application.title) {
        bucket.title = activity.active_application.title;
      }
      appBuckets.set(appName, bucket);
    }

    const taskKey = activity.task_id ? String(activity.task_id) : null;
    if (taskKey) {
      taskSeconds.set(taskKey, (taskSeconds.get(taskKey) || 0) + (active ? seconds : 0));
    }

    const timestamp = activity.timestamp ? new Date(activity.timestamp) : null;
    if (timestamp && !Number.isNaN(timestamp.getTime())) {
      if (!firstTimestamp || timestamp < firstTimestamp) firstTimestamp = timestamp;
      if (!lastTimestamp || timestamp > lastTimestamp) lastTimestamp = timestamp;
    }
  }

  const productiveSeconds = PRODUCTIVE_CATEGORIES.reduce(
    (sum, category) => sum + (categorySeconds[category] || 0),
    0
  );
  const distractionSeconds = categorySeconds.DISTRACTION || 0;
  const focusRatio = activeSeconds > 0 ? round((productiveSeconds / activeSeconds) * 100, 1) : null;
  const distractionRatio = activeSeconds > 0 ? round((distractionSeconds / activeSeconds) * 100, 1) : null;

  const activeMinutes = activeSeconds / 60;
  const keystrokesPerMinute = activeMinutes > 0 ? round(totalKeystrokes / activeMinutes, 1) : null;
  const targetKpm = num(scoring.target_keystrokes_per_minute, 60);
  const keyboardIntensity = activeMinutes > 0 ? clamp((keystrokesPerMinute / targetKpm) * 100, 0, 100) : null;
  const mouseIntensity = mouseSamples > 0 ? clamp(mouseScoreSum / mouseSamples, 0, 100) : null;

  let intensity = null;
  if (keyboardIntensity !== null && mouseIntensity !== null) {
    intensity = round(keyboardIntensity * 0.6 + mouseIntensity * 0.4, 1);
  } else if (keyboardIntensity !== null) {
    intensity = round(keyboardIntensity, 1);
  } else if (mouseIntensity !== null) {
    intensity = round(mouseIntensity, 1);
  }

  const minActiveMinutes = num(scoring.min_active_minutes_for_score, 5);
  let confidence = 'high';
  if (activeSeconds < minActiveMinutes * 60 || activeIntervals < 5) {
    confidence = 'insufficient';
  } else if (activeSeconds < 30 * 60) {
    confidence = 'low';
  } else if (activeSeconds < 4 * 60 * 60) {
    confidence = 'medium';
  }

  const apps = Array.from(appBuckets.values())
    .map((bucket) => ({
      app: bucket.app,
      category: bucket.category,
      seconds: bucket.seconds,
      minutes: round(bucket.seconds / 60, 1),
      percent_of_active: activeSeconds > 0 ? round((bucket.seconds / activeSeconds) * 100, 1) : 0,
      title: bucket.title
    }))
    .sort((a, b) => b.seconds - a.seconds);

  return {
    from: firstTimestamp,
    to: lastTimestamp,
    interval_count: activities.length,
    active_intervals: activeIntervals,
    away_intervals: awayIntervals,
    span_seconds: spanSeconds,
    active_seconds: activeSeconds,
    idle_seconds: idleSeconds,
    active_minutes: round(activeSeconds / 60, 1),
    idle_minutes: round(idleSeconds / 60, 1),
    category_seconds: categorySeconds,
    category_percent: APP_CATEGORIES.reduce((acc, category) => {
      acc[category] = activeSeconds > 0 ? round(((categorySeconds[category] || 0) / activeSeconds) * 100, 1) : 0;
      return acc;
    }, {}),
    productive_seconds: productiveSeconds,
    distraction_seconds: distractionSeconds,
    focus_ratio: focusRatio,
    distraction_ratio: distractionRatio,
    keystrokes: totalKeystrokes,
    keystrokes_per_minute: keystrokesPerMinute,
    intensity,
    apps,
    task_seconds: Object.fromEntries(taskSeconds),
    data_quality: {
      confidence,
      active_minutes: round(activeSeconds / 60, 1),
      samples: activities.length,
      sufficient: confidence !== 'insufficient'
    }
  };
}

/**
 * Deliverable completion rate over the assigned tasks of a window.
 * Returns null when nothing is assigned, so it never drags a score to 0 unfairly.
 */
function summarizeDeliverables(tasks) {
  if (!Array.isArray(tasks) || tasks.length === 0) {
    return {
      assigned: 0,
      completed: 0,
      on_time: 0,
      overdue: 0,
      with_evidence: 0,
      completion_rate: null,
      on_time_rate: null,
      avg_review_score: null,
      data_quality: { sufficient: false, reason: 'no_tasks_in_period' }
    };
  }

  let completed = 0;
  let onTime = 0;
  let overdue = 0;
  let withEvidence = 0;
  let reviewSum = 0;
  let reviewSamples = 0;

  for (const task of tasks) {
    if (TASK_CLOSED_STATUSES.includes(task.status)) completed += 1;
    if (task.on_time === true) onTime += 1;
    if (task.overdue === true) overdue += 1;
    if (task.has_evidence) withEvidence += 1;
    if (typeof task.review_score === 'number' && Number.isFinite(task.review_score)) {
      reviewSum += task.review_score;
      reviewSamples += 1;
    }
  }

  const completedWithEvidence = tasks.filter(
    (task) => TASK_CLOSED_STATUSES.includes(task.status) && task.has_evidence
  ).length;

  return {
    assigned: tasks.length,
    completed,
    completed_with_evidence: completedWithEvidence,
    on_time: onTime,
    overdue,
    with_evidence: withEvidence,
    completion_rate: round((completed / tasks.length) * 100, 1),
    on_time_rate: round((onTime / tasks.length) * 100, 1),
    avg_review_score: reviewSamples > 0 ? round(reviewSum / reviewSamples, 1) : null,
    data_quality: { sufficient: true }
  };
}

/**
 * Tri-Factor Productivity Index (0-100) or null when the window is too thin.
 * Weights are renormalised across whichever factors exist, so a day with telemetry
 * but no assigned tasks is not silently punished.
 */
function computeProductivityScore(activitySummary, deliverableSummary, settings) {
  const scoring = (settings && settings.scoring) || {};
  const focusWeight = num(scoring.focus_weight, 0.4);
  const intensityWeight = num(scoring.intensity_weight, 0.3);
  const deliverableWeight = num(scoring.deliverable_weight, 0.3);

  if (!activitySummary || !activitySummary.data_quality || !activitySummary.data_quality.sufficient) {
    return {
      score: null,
      status: 'insufficient_data',
      reason: 'Not enough active telemetry in this window to produce an honest score',
      factors: {
        focus: activitySummary ? activitySummary.focus_ratio : null,
        intensity: activitySummary ? activitySummary.intensity : null,
        deliverable: deliverableSummary ? deliverableSummary.completion_rate : null
      },
      weights_applied: null
    };
  }

  const components = [];
  if (typeof activitySummary.focus_ratio === 'number') {
    components.push({ key: 'focus', value: clamp(activitySummary.focus_ratio, 0, 100), weight: focusWeight });
  }
  if (typeof activitySummary.intensity === 'number') {
    components.push({ key: 'intensity', value: clamp(activitySummary.intensity, 0, 100), weight: intensityWeight });
  }
  if (deliverableSummary && typeof deliverableSummary.completion_rate === 'number') {
    components.push({
      key: 'deliverable',
      value: clamp(deliverableSummary.completion_rate, 0, 100),
      weight: deliverableWeight
    });
  }

  if (components.length === 0) {
    return {
      score: null,
      status: 'insufficient_data',
      reason: 'No scorable factor available for this window',
      factors: { focus: null, intensity: null, deliverable: null },
      weights_applied: null
    };
  }

  const weightTotal = components.reduce((sum, component) => sum + component.weight, 0);
  if (weightTotal <= 0) {
    const flat = components.reduce((sum, component) => sum + component.value, 0) / components.length;
    return {
      score: round(flat, 1),
      status: components.length === 3 ? 'complete' : 'partial',
      reason: null,
      factors: {
        focus: componentValue(components, 'focus'),
        intensity: componentValue(components, 'intensity'),
        deliverable: componentValue(components, 'deliverable')
      },
      weights_applied: components.reduce((acc, component) => {
        acc[component.key] = round(1 / components.length, 4);
        return acc;
      }, {})
    };
  }

  const weighted = components.reduce((sum, component) => sum + component.value * component.weight, 0) / weightTotal;

  return {
    score: round(weighted, 1),
    status: components.length === 3 ? 'complete' : 'partial',
    reason: components.length === 3 ? null : 'Some factors unavailable for this window',
    factors: {
      focus: componentValue(components, 'focus'),
      intensity: componentValue(components, 'intensity'),
      deliverable: componentValue(components, 'deliverable')
    },
    weights_applied: components.reduce((acc, component) => {
      acc[component.key] = round(component.weight / weightTotal, 4);
      return acc;
    }, {})
  };
}

function componentValue(components, key) {
  const found = components.find((component) => component.key === key);
  return found ? found.value : null;
}

/**
 * Coalesce raw 30s telemetry into readable workday segments.
 */
function buildTimeline(activities, settings) {
  const scoring = (settings && settings.scoring) || {};
  const idleThresholdSeconds = num(scoring.idle_threshold_seconds, DEFAULT_IDLE_THRESHOLD_SECONDS);
  const rules = (settings && settings.app_rules) || DEFAULT_APP_RULES;

  const ordered = [...activities]
    .filter((activity) => activity.timestamp)
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  const segments = [];
  for (const activity of ordered) {
    const start = new Date(activity.timestamp);
    if (Number.isNaN(start.getTime())) continue;

    const seconds = intervalSeconds(activity);
    const end = new Date(start.getTime() + seconds * 1000);
    const categoryInfo = categorizeActivity(activity, rules);
    const idle = isIdleInterval(activity, idleThresholdSeconds);
    const app = (activity.active_application && activity.active_application.name) || 'Unknown';
    const label = idle ? 'Idle / Away' : `${app} — ${categoryInfo.label}`;
    const previous = segments[segments.length - 1];

    const mergeable =
      previous &&
      previous.idle === idle &&
      previous.app === app &&
      previous.category === categoryInfo.category &&
      previous.task_id === (activity.task_id ? String(activity.task_id) : null) &&
      start.getTime() - new Date(previous.end).getTime() <= 90 * 1000;

    if (mergeable) {
      previous.end = end;
      previous.seconds += seconds;
      previous.samples += 1;
      continue;
    }

    segments.push({
      start,
      end,
      seconds,
      samples: 1,
      app,
      title: (activity.active_application && activity.active_application.title) || '',
      category: categoryInfo.category,
      label,
      idle,
      task_id: activity.task_id ? String(activity.task_id) : null
    });
  }

  return segments.map((segment) => ({
    ...segment,
    minutes: round(segment.seconds / 60, 1)
  }));
}

/** Merge consecutive idle intervals into explicit break blocks. */
function buildIdleClusters(activities, settings) {
  const scoring = (settings && settings.scoring) || {};
  const idleThresholdSeconds = num(scoring.idle_threshold_seconds, DEFAULT_IDLE_THRESHOLD_SECONDS);

  const ordered = [...activities]
    .filter((activity) => activity.timestamp)
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  const clusters = [];
  for (const activity of ordered) {
    if (!isIdleInterval(activity, idleThresholdSeconds)) continue;

    const start = new Date(activity.timestamp);
    if (Number.isNaN(start.getTime())) continue;
    const seconds = intervalSeconds(activity);
    const end = new Date(start.getTime() + seconds * 1000);
    const previous = clusters[clusters.length - 1];

    if (previous && start.getTime() - new Date(previous.end).getTime() <= 120 * 1000) {
      previous.end = end;
      previous.seconds += seconds;
      previous.samples += 1;
      continue;
    }

    clusters.push({ start, end, seconds, samples: 1 });
  }

  return clusters.map((cluster) => ({
    start: cluster.start,
    end: cluster.end,
    minutes: round(cluster.seconds / 60, 1),
    samples: cluster.samples
  }));
}

/**
 * Build one verification row per assigned task: tracked time from telemetry plus
 * submitted evidence (GitHub/PR/document) and review verdicts where they exist.
 */
function buildVerificationRows(tasks, submissionsByTask, taskSecondsByTaskId, now = new Date()) {
  const rows = [];

  for (const task of tasks) {
    const taskId = String(task._id);
    const submission = submissionsByTask.get(taskId) || null;
    const links = [];
    if (submission) {
      if (submission.githubLink) links.push({ type: 'github', url: submission.githubLink });
      if (submission.documentLink) links.push({ type: 'document', url: submission.documentLink });
      if (Array.isArray(submission.additionalLinks)) {
        for (const link of submission.additionalLinks) {
          if (link) links.push({ type: 'additional', url: String(link) });
        }
      }
    }
    if (Array.isArray(task.links)) {
      for (const link of task.links) {
        if (link) links.push({ type: 'task_link', url: String(link) });
      }
    }

    const reviewScore =
      submission && submission.parikshakReview && typeof submission.parikshakReview.score === 'number'
        ? submission.parikshakReview.score
        : submission && submission.aiReviewDetails && typeof submission.aiReviewDetails.score === 'number'
          ? submission.aiReviewDetails.score
          : null;

    const closed = TASK_CLOSED_STATUSES.includes(task.status);
    const dueDate = task.dueDate ? new Date(task.dueDate) : null;
    const referenceDate = submission && submission.createdAt ? new Date(submission.createdAt) : null;
    const onTime = closed && dueDate && referenceDate ? referenceDate <= dueDate : null;
    const overdue = !closed && dueDate ? now > dueDate : false;

    const trackedSeconds =
      (task.task_id && taskSecondsByTaskId.get(String(task.task_id))) ||
      taskSecondsByTaskId.get(taskId) ||
      0;

    let verification = 'in_progress';
    if (closed && links.length > 0) {
      verification = 'verified';
    } else if (closed && links.length === 0) {
      verification = 'evidence_missing';
    } else if (submission && !closed) {
      verification = 'pending_review';
    } else if (overdue) {
      verification = 'overdue';
    }

    rows.push({
      task_id: task.task_id || taskId,
      task_object_id: taskId,
      title: task.title,
      status: task.status,
      priority: task.priority,
      due_date: dueDate,
      submitted_at: referenceDate,
      closed_at: task.closedAt || null,
      tracked_seconds: trackedSeconds,
      tracked_minutes: round(trackedSeconds / 60, 1),
      evidence: links,
      evidence_count: links.length,
      review_score: reviewScore,
      parikshak_status:
        (submission && submission.parikshakReview && submission.parikshakReview.status) || null,
      on_time: onTime,
      overdue,
      verification
    });
  }

  return rows;
}

/** Aggregate verification rows into the deliverable summary consumed by scoring. */
function verificationToDeliverables(rows) {
  return summarizeDeliverables(
    rows.map((row) => ({
      status: row.status,
      on_time: row.on_time,
      overdue: row.overdue,
      has_evidence: row.evidence_count > 0,
      review_score: row.review_score
    }))
  );
}

module.exports = {
  APP_CATEGORIES,
  PRODUCTIVE_CATEGORIES,
  TASK_OPEN_STATUSES,
  TASK_CLOSED_STATUSES,
  DEFAULT_INTERVAL_SECONDS,
  num,
  clamp,
  round,
  startOfDay,
  endOfDay,
  getDayBounds,
  getWeekBounds,
  getPeriodBounds,
  extractDomain,
  normalizeText,
  prepareRules,
  categorizeActivity,
  isIdleInterval,
  hasInput,
  intervalSeconds,
  summarizeActivities,
  summarizeDeliverables,
  computeProductivityScore,
  buildTimeline,
  buildIdleClusters,
  buildVerificationRows,
  verificationToDeliverables
};
