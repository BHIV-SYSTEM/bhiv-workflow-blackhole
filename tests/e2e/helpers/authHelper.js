/**
 * Niyantran Employee Monitoring V2 — E2E Auth Helper
 * Programmatic JWT generation, token verification, and HTTP login helpers
 * supporting Admin and User workflows.
 */

const path = require('node:path');
const config = require('../config');

// Resolve jsonwebtoken from server subsystem
let jwt;
try {
  jwt = require(path.resolve(config.paths.server, 'node_modules/jsonwebtoken'));
} catch {
  try {
    jwt = require('jsonwebtoken');
  } catch (err) {
    throw new Error(`Unable to resolve jsonwebtoken from ${config.paths.server}/node_modules/jsonwebtoken: ${err.message}`);
  }
}

class AuthHelper {
  constructor(jwtSecret = config.jwt.secret, backendUrl = config.backendUrl) {
    this.jwtSecret = jwtSecret;
    this.backendUrl = backendUrl.replace(/\/+$/, '');
  }

  /**
   * Programmatically generate a signed JWT token with a given payload.
   * Matches server/routes/auth.js token generation format.
   * @param {Object} payload
   * @param {string} [secret]
   * @param {string|number} [expiresIn]
   * @returns {string}
   */
  createToken(payload, secret = this.jwtSecret, expiresIn = config.jwt.expiresIn) {
    const opts = {};
    if (expiresIn) opts.expiresIn = expiresIn;
    return jwt.sign(payload, secret, opts);
  }

  /**
   * Programmatically generate a valid Admin JWT token for Rudra.
   * @param {Object} [overrides]
   * @returns {string}
   */
  createAdminToken(overrides = {}) {
    const payload = {
      id: '507f1f77bcf86cd799439011', // default ObjectId-like ID or real ID
      name: config.credentials.admin.name,
      email: config.credentials.admin.email,
      role: 'Admin',
      department: config.credentials.admin.department,
      branch: config.credentials.admin.branch,
      ...overrides
    };
    return this.createToken(payload);
  }

  /**
   * Programmatically generate a valid User JWT token for Ishan.
   * @param {Object} [overrides]
   * @returns {string}
   */
  createUserToken(overrides = {}) {
    const payload = {
      id: '507f1f77bcf86cd799439012',
      name: config.credentials.user.name,
      email: config.credentials.user.email,
      role: 'User',
      department: config.credentials.user.department,
      branch: config.credentials.user.branch,
      ...overrides
    };
    return this.createToken(payload);
  }

  /**
   * Decode a JWT token without verification.
   * @param {string} token
   * @returns {Object|null}
   */
  decodeToken(token) {
    return jwt.decode(token);
  }

  /**
   * Verify and decode a JWT token.
   * @param {string} token
   * @param {string} [secret]
   * @returns {Object}
   */
  verifyToken(token, secret = this.jwtSecret) {
    return jwt.verify(token, secret);
  }

  /**
   * Construct standard dual authentication headers.
   * @param {string} token
   * @returns {{ 'x-auth-token': string, 'Authorization': string }}
   */
  getAuthHeaders(token) {
    return {
      'x-auth-token': token,
      'Authorization': `Bearer ${token}`
    };
  }

  /**
   * Authenticate against the live backend API via POST /api/auth/login.
   * @param {string} email
   * @param {string} password
   * @returns {Promise<{ ok: boolean, status: number, token: string|null, user: Object|null, error: string|null }>}
   */
  async login(email, password) {
    const url = `${this.backendUrl}/api/auth/login`;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ email, password }),
        signal: AbortSignal.timeout(config.timeouts.shortTimeout)
      });

      const data = await response.json().catch(() => null);

      if (response.ok && data?.token) {
        return {
          ok: true,
          status: response.status,
          token: data.token,
          user: data.user || null,
          error: null
        };
      }

      return {
        ok: false,
        status: response.status,
        token: null,
        user: null,
        error: data?.error || data?.message || `HTTP ${response.status} login failed`
      };
    } catch (err) {
      return {
        ok: false,
        status: 0,
        token: null,
        user: null,
        error: err.message
      };
    }
  }

  /**
   * Login with seeded Admin credentials (Rudra).
   */
  async loginAdmin() {
    return this.login(config.credentials.admin.email, config.credentials.admin.password);
  }

  /**
   * Login with seeded User credentials (Ishan).
   */
  async loginUser() {
    return this.login(config.credentials.user.email, config.credentials.user.password);
  }
}

// Factory function
function createAuthHelper(jwtSecret = config.jwt.secret, backendUrl = config.backendUrl) {
  return new AuthHelper(jwtSecret, backendUrl);
}

// Singleton instance
const authHelper = new AuthHelper(config.jwt.secret, config.backendUrl);

module.exports = {
  AuthHelper,
  createAuthHelper,
  authHelper
};
