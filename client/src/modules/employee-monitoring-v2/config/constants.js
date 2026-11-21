/**
 * NIYANTRAN EMPLOYEE MONITORING V2
 * Client Constants & Configurations
 */

export const V2_ROUTES = Object.freeze({
  ADMIN_CONSOLE: '/admin/monitoring-v2',
  ADMIN_DEVICES: '/admin/monitoring-v2/devices',
  ADMIN_ANALYTICS: '/admin/monitoring-v2/analytics',
  EMPLOYEE_WORKSPACE: '/employee/monitoring-v2',
  EMPLOYEE_DEVICES: '/employee/monitoring-v2/devices',
  EMPLOYEE_PRIVACY: '/employee/monitoring-v2/privacy',
});

export const DEVICE_MODES = Object.freeze({
  PHONE: 'phone',
  LAPTOP_PC: 'laptop_pc',
  SWITCH_DEVICE: 'switch_device',
});

export const SESSION_STATES = Object.freeze({
  INACTIVE: 'INACTIVE',
  INITIALIZING: 'INITIALIZING',
  ACTIVE: 'ACTIVE',
  PAUSED: 'PAUSED',
  CONFLICT: 'V1_AGENT_CONFLICT',
  TERMINATED: 'TERMINATED',
});

export const PRIVACY_STANDARDS = Object.freeze({
  NO_KEYLOGGING: 'Raw keystroke content & text reconstruction permanently disabled',
  NO_SCREENSHOTS: 'Visual screen capture and display scraping permanently disabled',
  NO_CLIPBOARD: 'Clipboard inspection and file scanning permanently disabled',
  LOCAL_AGGREGATION: 'Telemetry aggregated into 60-second activity counts only',
});

export const DEPARTMENTS = Object.freeze([
  'All Departments',
  'Engineering',
  'Product',
  'Design',
  'Customer Operations',
  'Quality Assurance',
]);
