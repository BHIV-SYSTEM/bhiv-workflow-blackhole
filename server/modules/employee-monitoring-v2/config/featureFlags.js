/**
 * Employee Monitoring V2 - Feature Flags & Runtime Gatekeeper
 * 
 * Secure-by-Default: All V2 flags default to false.
 * Missing or invalid configuration guarantees disabled state.
 */

function parseBoolean(val, defaultVal = false) {
  if (typeof val === 'boolean') return val;
  if (typeof val === 'string') {
    const lower = val.trim().toLowerCase();
    if (lower === 'true' || lower === '1') return true;
    if (lower === 'false' || lower === '0') return false;
  }
  return defaultVal;
}

const FEATURE_FLAGS = Object.freeze({
  // Master kill switch for V2 backend routes and ingestion
  ENABLE_MONITORING_V2: parseBoolean(process.env.ENABLE_MONITORING_V2, false),

  // Independent UI switches
  ENABLE_MONITORING_V2_ADMIN_UI: parseBoolean(process.env.ENABLE_MONITORING_V2_ADMIN_UI, false),
  ENABLE_MONITORING_V2_EMPLOYEE_UI: parseBoolean(process.env.ENABLE_MONITORING_V2_EMPLOYEE_UI, false),

  // Ingestion & Agent switches
  ENABLE_MONITORING_V2_AGENT: parseBoolean(process.env.ENABLE_MONITORING_V2_AGENT, false),
  ENABLE_MONITORING_V2_INGESTION: parseBoolean(process.env.ENABLE_MONITORING_V2_INGESTION, false),

  // Emergency halt flag (immediately blocks all V2 telemetry processing)
  EMERGENCY_TELEMETRY_HALT: parseBoolean(process.env.EMERGENCY_TELEMETRY_HALT, false)
});

/**
 * Returns true only if master V2 flag is enabled and telemetry is not halted.
 */
function isMonitoringV2Active() {
  return FEATURE_FLAGS.ENABLE_MONITORING_V2 === true && FEATURE_FLAGS.EMERGENCY_TELEMETRY_HALT !== true;
}

/**
 * Checks if a user is explicitly enrolled in the pilot cohort.
 */
function isPilotUser(userId) {
  if (!isMonitoringV2Active()) return false;
  const rawList = process.env.MONITORING_V2_PILOT_USERS || '';
  const allowed = rawList.split(',').map((id) => id.trim()).filter(Boolean);
  return allowed.includes(String(userId));
}

module.exports = {
  FEATURE_FLAGS,
  isMonitoringV2Active,
  isPilotUser
};
