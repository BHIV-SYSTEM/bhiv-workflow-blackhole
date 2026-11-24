/**
 * NIYANTRAN EMPLOYEE MONITORING V2
 * Client Feature Flag Resolver
 *
 * All flags default to false (disabled) unless explicitly set to "true" in environment.
 * In Phase A, these flags ensure V2 UI routes and components remain strictly inactive
 * in production and do not interfere with V1 Employee Monitoring.
 */

const parseBooleanFlag = (val) => {
  if (typeof val === 'boolean') return val;
  if (typeof val === 'string') {
    const normalized = val.trim().toLowerCase();
    return normalized === 'true' || normalized === '1';
  }
  return false;
};

export const UI_FEATURE_FLAGS = Object.freeze({
  ENABLE_MONITORING_V2: parseBooleanFlag(import.meta.env?.VITE_ENABLE_MONITORING_V2),
  ENABLE_V2_ADMIN_CONSOLE: parseBooleanFlag(import.meta.env?.VITE_ENABLE_V2_ADMIN_CONSOLE),
  ENABLE_V2_EMPLOYEE_WORKSPACE: parseBooleanFlag(import.meta.env?.VITE_ENABLE_V2_EMPLOYEE_WORKSPACE),
  ENABLE_V2_DEVICE_SWITCHER: parseBooleanFlag(import.meta.env?.VITE_ENABLE_V2_DEVICE_SWITCHER),
  ENABLE_V2_LIVE_STREAM: parseBooleanFlag(import.meta.env?.VITE_ENABLE_V2_LIVE_STREAM),
});

export const isMonitoringV2Enabled = () => UI_FEATURE_FLAGS.ENABLE_MONITORING_V2;
export const isAdminConsoleEnabled = () =>
  UI_FEATURE_FLAGS.ENABLE_MONITORING_V2 && UI_FEATURE_FLAGS.ENABLE_V2_ADMIN_CONSOLE;
export const isEmployeeWorkspaceEnabled = () =>
  UI_FEATURE_FLAGS.ENABLE_MONITORING_V2 && UI_FEATURE_FLAGS.ENABLE_V2_EMPLOYEE_WORKSPACE;
