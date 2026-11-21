/**
 * karmaClient.js
 *
 * Niyantran's client for publishing KARMA behavioral signals.
 * Flow: Niyantran -> bucketClient.storeKarmaEventRecord() -> Bucket -> KARMA
 * Niyantran CANNOT call KARMA directly (authorization.py enforces x-source: bucket|core|internal).
 */

"use strict";

const { storeKarmaEventRecord } = require("./bucketClient");

const SIGNALS = Object.freeze({
  ALLOW: "allow",
  NUDGE: "nudge",
  RESTRICT: "restrict",
  ESCALATE: "escalate",
});

const PRODUCT_CONTEXT = "workflow";
const DEFAULT_TTL = 300;

const REASON_CODES = Object.freeze({
  // Monitoring
  EXCESSIVE_IDLE:       "NIY_MON_001",
  DISALLOWED_SITE:      "NIY_MON_002",
  KEYSTROKE_ANOMALY:    "NIY_MON_003",
  SCREEN_CAPTURE_ALERT: "NIY_MON_004",
  // Attendance
  LATE_CHECKIN:         "NIY_ATT_001",
  EARLY_CHECKOUT:       "NIY_ATT_002",
  ATTENDANCE_ANOMALY:   "NIY_ATT_003",
  // EMS
  EMS_IDLE_THRESHOLD:   "NIY_EMS_001",
  EMS_MOUSE_INACTIVE:   "NIY_EMS_002",
  EMS_APP_SWITCH:       "NIY_EMS_003",
  // Normal
  NORMAL_ACTIVITY:      "NIY_NRM_001",
  // Lifecycle
  USER_LOGIN:           "NIY_LCY_001",
  USER_LOGOUT:          "NIY_LCY_002",
  SESSION_RESUME:       "NIY_LCY_003",
  // Tasks
  TASK_CREATED:         "NIY_TSK_001",
  TASK_COMPLETED:       "NIY_TSK_002",
});

function validateSignal(signal) {
  const violations = [];

  if (!signal.subject_id || typeof signal.subject_id !== "string") {
    violations.push("subject_id: required string");
  }
  if (signal.product_context !== PRODUCT_CONTEXT) {
    violations.push(`product_context: must be "${PRODUCT_CONTEXT}", got "${signal.product_context}"`);
  }
  if (!["allow", "nudge", "restrict", "escalate"].includes(signal.signal)) {
    violations.push(`signal: must be one of [allow, nudge, restrict, escalate], got "${signal.signal}"`);
  }
  if (typeof signal.severity !== "number" || signal.severity < 0.0 || signal.severity > 1.0) {
    violations.push(`severity: must be number 0.0-1.0, got "${signal.severity}"`);
  }
  if (!Number.isInteger(signal.ttl) || signal.ttl < 1) {
    violations.push(`ttl: must be integer >= 1, got "${signal.ttl}"`);
  }
  if (signal.requires_core_ack !== true) {
    violations.push("requires_core_ack: must be true");
  }
  if (!signal.opaque_reason_code || typeof signal.opaque_reason_code !== "string") {
    violations.push("opaque_reason_code: required string");
  }

  if (violations.length > 0) {
    throw new Error(
      `[karmaClient] Signal contract violations:\n${violations.map(v => "  - " + v).join("\n")}`
    );
  }
}

async function publishSignal({
  subjectId,
  signal,
  severity,
  ttl = DEFAULT_TTL,
  opaqueReasonCode,
  traceId,
}) {
  const payload = {
    subject_id: subjectId,
    product_context: PRODUCT_CONTEXT,
    signal,
    severity,
    ttl,
    requires_core_ack: true,
    opaque_reason_code: opaqueReasonCode,
  };

  validateSignal(payload);

  console.log(`[KARMA] >> signal=${signal} code=${opaqueReasonCode} user=${subjectId}`);

  try {
    const result = await storeKarmaEventRecord({
      subjectId,
      signal,
      severity,
      ttl,
      opaqueReasonCode,
      traceId,
    });
    console.log(`[KARMA] OK artifact_id=${result && result.artifact_id} hash=${result && result.hash ? result.hash.slice(0, 12) : "?"}`);
    return result;
  } catch (err) {
    console.error(`[KARMA] FAILED code=${opaqueReasonCode} user=${subjectId} error=${err.message}`);
    throw err;
  }
}

async function signalExcessiveIdle(userId, idleMinutes, traceId) {
  // Automated behavioral penalties (nudge, restrict, escalate) permanently excised under V2 privacy boundaries.
  console.log(`[KARMA] Automated idle penalty neutralized for user ${userId} (${idleMinutes}m idle). Zero automated penalties.`);
  return { success: true, signal: SIGNALS.ALLOW, neutralized: true };
}

async function signalDisallowedSite(userId, traceId) {
  // Automated behavioral penalties excised under V2 privacy boundaries.
  console.log(`[KARMA] Disallowed site penalty neutralized for user ${userId}. Zero automated penalties.`);
  return { success: true, signal: SIGNALS.ALLOW, neutralized: true };
}

async function signalKeystrokeAnomaly(userId, anomalyScore, traceId) {
  // Automated behavioral penalties excised under V2 privacy boundaries.
  console.log(`[KARMA] Keystroke anomaly penalty neutralized for user ${userId}. Zero automated penalties.`);
  return { success: true, signal: SIGNALS.ALLOW, neutralized: true };
}

async function signalNormalActivity(userId, traceId) {
  return publishSignal({
    subjectId: userId,
    signal: SIGNALS.ALLOW,
    severity: 0.0,
    ttl: DEFAULT_TTL,
    opaqueReasonCode: REASON_CODES.NORMAL_ACTIVITY,
    traceId,
  });
}

async function signalLateCheckin(userId, minutesLate, traceId) {
  const severity = Math.min(1.0, Math.round((minutesLate / 120) * 100) / 100);
  return publishSignal({
    subjectId: userId,
    signal: minutesLate > 60 ? SIGNALS.RESTRICT : SIGNALS.NUDGE,
    severity,
    ttl: DEFAULT_TTL,
    opaqueReasonCode: REASON_CODES.LATE_CHECKIN,
    traceId,
  });
}

async function signalUserLogin(userId, traceId) {
  return publishSignal({
    subjectId: userId,
    signal: SIGNALS.ALLOW,
    severity: 0.0,
    ttl: DEFAULT_TTL,
    opaqueReasonCode: REASON_CODES.USER_LOGIN,
    traceId,
  });
}

async function signalUserLogout(userId, traceId) {
  return publishSignal({
    subjectId: userId,
    signal: SIGNALS.ALLOW,
    severity: 0.0,
    ttl: DEFAULT_TTL,
    opaqueReasonCode: REASON_CODES.USER_LOGOUT,
    traceId,
  });
}

async function signalSessionResume(userId, traceId) {
  return publishSignal({
    subjectId: userId,
    signal: SIGNALS.ALLOW,
    severity: 0.0,
    ttl: DEFAULT_TTL,
    opaqueReasonCode: REASON_CODES.SESSION_RESUME,
    traceId,
  });
}

async function signalTaskCreated(assigneeId, traceId) {
  return publishSignal({
    subjectId: assigneeId,
    signal: SIGNALS.ALLOW,
    severity: 0.0,
    ttl: DEFAULT_TTL,
    opaqueReasonCode: REASON_CODES.TASK_CREATED,
    traceId,
  });
}

async function signalTaskCompleted(assigneeId, traceId) {
  return publishSignal({
    subjectId: assigneeId,
    signal: SIGNALS.ALLOW,
    severity: 0.0,
    ttl: DEFAULT_TTL,
    opaqueReasonCode: REASON_CODES.TASK_COMPLETED,
    traceId,
  });
}

module.exports = {
  publishSignal,
  validateSignal,
  signalExcessiveIdle,
  signalDisallowedSite,
  signalKeystrokeAnomaly,
  signalNormalActivity,
  signalLateCheckin,
  signalUserLogin,
  signalUserLogout,
  signalSessionResume,
  signalTaskCreated,
  signalTaskCompleted,
  SIGNALS,
  PRODUCT_CONTEXT,
  REASON_CODES,
  DEFAULT_TTL,
};
