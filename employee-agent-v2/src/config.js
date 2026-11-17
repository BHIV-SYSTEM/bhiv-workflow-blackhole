/**
 * NIYANTRAN EMPLOYEE MONITORING V2
 * Desktop Agent Configuration & Invariants
 */

export const AGENT_CONFIG = Object.freeze({
  VERSION: '2.0.0-phase-a',
  API_BASE_URL: process.env.V2_SERVER_URL || 'http://localhost:5000/api/monitoring-v2',
  TELEMETRY_INTERVAL_MS: 60 * 1000,       // 60-second aggregation window
  HEARTBEAT_INTERVAL_MS: 30 * 1000,       // 30-second heartbeat
  LEASE_TIMEOUT_MS: 90 * 1000,            // 90-second autonomous lease expiry
  MAX_OFFLINE_BUFFER_MINUTES: 120,        // 2 hours maximum offline telemetry buffering
  IDLE_THRESHOLD_SECONDS: 300,            // 5 minutes of zero inputs marks idle
});

export const PRIVACY_INVARIANTS = Object.freeze({
  KEYSTROKE_TEXT_CAPTURE_ENABLED: false,  // Strictly prohibited
  SCREENSHOT_CAPTURE_ENABLED: false,       // Strictly prohibited
  CLIPBOARD_INSPECTION_ENABLED: false,     // Strictly prohibited
  PRIVATE_WINDOW_TRACKING_ENABLED: false,  // Strictly prohibited
});

export const AGENT_STATES = Object.freeze({
  UNINITIALIZED: 'UNINITIALIZED',
  INITIALIZING: 'INITIALIZING',
  V1_AGENT_CONFLICT: 'V1_AGENT_CONFLICT',
  IDLE_WAITING_AUTH: 'IDLE_WAITING_AUTH',
  ACTIVE_MONITORING: 'ACTIVE_MONITORING',
  PAUSED: 'PAUSED',
  STOPPED: 'STOPPED',
});

export const V1_PROCESS_NAMES = Object.freeze([
  'Niyantran Employee Agent.exe',
  'niyantran-agent.exe',
  'electron.exe', // Evaluated with command line pattern matching in conflictDetector
]);
