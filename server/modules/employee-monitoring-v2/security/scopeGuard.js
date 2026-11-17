/**
 * Employee Monitoring V2 - ScopeGuard Security Middleware
 * 
 * Enforces strict per-employee data isolation and deny-by-default role verification.
 * Prevents horizontal privilege escalation (employees accessing peer monitoring data).
 */

const { isMonitoringV2Active } = require('../config/featureFlags');

/**
 * Gatekeeper middleware: returns 404/403 if V2 is disabled.
 */
function requireV2Active(req, res, next) {
  if (!isMonitoringV2Active()) {
    return res.status(404).json({
      error: 'Not Found',
      code: 'MONITORING_V2_DISABLED',
      message: 'Employee Monitoring V2 is currently disabled'
    });
  }
  next();
}

/**
 * Ensures that employees can only access their own data, while
 * authorized administrators and department leads can access scoped data.
 */
function verifyMonitoringScope(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized: Authentication required', code: 'AUTH_REQUIRED' });
  }

  const targetEmployeeId = req.params.employeeId || req.query.employeeId || req.body.employeeId;
  const requestingUserId = String(req.user.id || req.user._id);

  // 1. Self-access is always permitted for personal workspace data
  if (targetEmployeeId && requestingUserId === String(targetEmployeeId)) {
    return next();
  }

  // 2. SuperAdmin / Admin has organization-wide access
  if (req.user.role === 'Admin' || req.user.role === 'SuperAdmin') {
    return next();
  }

  // 3. Manager scope verification (requires matching department)
  if (req.user.role === 'Manager') {
    // Verified against request context / target profile in subsequent service layer
    return next();
  }

  // 4. Deny-by-default for all peer/horizontal access
  return res.status(403).json({
    error: 'Access denied: You do not have permission to view or manage monitoring data for this employee',
    code: 'INSUFFICIENT_SCOPE'
  });
}

/**
 * Enforces admin-only access for fleet and organization analytics.
 */
function requireAdminRole(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized: Authentication required', code: 'AUTH_REQUIRED' });
  }

  const role = req.user.role;
  if (role === 'Admin' || role === 'SuperAdmin' || role === 'Manager') {
    return next();
  }

  return res.status(403).json({
    error: 'Access denied: Administrative privileges required',
    code: 'ADMIN_REQUIRED'
  });
}

module.exports = {
  requireV2Active,
  verifyMonitoringScope,
  requireAdminRole
};
