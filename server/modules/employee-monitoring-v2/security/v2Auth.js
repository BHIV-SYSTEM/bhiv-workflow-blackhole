/**
 * Employee Monitoring V2 - Authentication Adapter
 * 
 * Bridges standard Niyantran JWT authentication to V2 routes.
 * Supports test bypass if req.user is pre-populated in test harnesses.
 */

let baseAuth = null;
try {
  baseAuth = require('../../../middleware/auth');
} catch (_) {
  // Standalone test fallback
  baseAuth = (req, res, next) => {
    if (req.user) return next();
    return res.status(401).json({ error: 'Authentication required' });
  };
}

module.exports = function v2Auth(req, res, next) {
  // If request already has an authenticated user (e.g. supertest mock or parent middleware)
  if (req.user && (req.user.id || req.user._id)) {
    return next();
  }

  // Support token passed in query parameter (e.g. direct browser download links)
  if (!req.header('x-auth-token') && !req.header('Authorization') && req.query && req.query.token) {
    req.headers = req.headers || {};
    req.headers['x-auth-token'] = req.query.token;
  }

  return baseAuth(req, res, next);
};
