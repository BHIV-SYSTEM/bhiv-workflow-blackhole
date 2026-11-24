/**
 * Niyantran Employee Monitoring V2 — Tier 1 Common Test Helper
 * Provides unified request dispatching (live HTTP vs. in-memory Express/Supertest),
 * database lifecycle hooks, agent loopback fallback, and authentication utilities.
 */

const path = require('node:path');
const net = require('node:net');
const fs = require('node:fs');
const crypto = require('node:crypto');

// Ensure background intervals created by loaded services (e.g. EMS signals) do not prevent process exit
const originalSetInterval = global.setInterval;
global.setInterval = function (...args) {
  const timer = originalSetInterval.apply(this, args);
  if (timer && typeof timer.unref === 'function') {
    timer.unref();
  }
  return timer;
};

// Subsystem configurations & helpers
const config = require('../config');
const { httpClient, createHttpClient } = require('../helpers/httpClient');
const { dbHelper } = require('../helpers/dbHelper');
const { authHelper } = require('../helpers/authHelper');
const WindowsHelper = require('../helpers/windowsHelper');
const { createSocketClient } = require('../helpers/socketClient');
const { agentLoopbackClient, createAgentLoopbackClient } = require('../helpers/agentLoopbackClient');

// Ensure mandatory environment variables for V2 modules
process.env.JWT_SECRET = config.jwt.secret;
process.env.ENABLE_MONITORING_V2 = 'true';
process.env.ENABLE_MONITORING_V2_AGENT = 'true';
process.env.ENABLE_MONITORING_V2_INGESTION = 'true';
process.env.ENABLE_MONITORING_V2_ADMIN_UI = 'true';
process.env.ENABLE_MONITORING_V2_EMPLOYEE_UI = 'true';
process.env.MONITORING_V2_ENCRYPTION_KEY = process.env.MONITORING_V2_ENCRYPTION_KEY || 'test-tier1-encryption-key-32ch';

// Lazy-loaded express & supertest from server subsystem
let expressModule = null;
let supertestModule = null;
let sharedExpressApp = null;

function getExpress() {
  if (!expressModule) {
    try {
      expressModule = require(path.resolve(config.paths.server, 'node_modules/express'));
    } catch {
      expressModule = require('express');
    }
  }
  return expressModule;
}

function getSupertest() {
  if (!supertestModule) {
    try {
      supertestModule = require(path.resolve(config.paths.server, 'node_modules/supertest'));
    } catch {
      supertestModule = require('supertest');
    }
  }
  return supertestModule;
}

/**
 * Build or retrieve shared Express application mounting all live production routers.
 */
function getSharedApp() {
  if (sharedExpressApp) return sharedExpressApp;

  const express = getExpress();
  const app = express();
  app.use(express.json());

  // Mount real routes
  try {
    const v2Routes = require(path.resolve(config.paths.server, 'modules/employee-monitoring-v2/routes'));
    app.use('/api/monitoring-v2', v2Routes);
  } catch (err) {
    console.warn('[tier1Common] Warning loading v2Routes:', err.message);
  }

  try {
    const attendanceRoutes = require(path.resolve(config.paths.server, 'routes/attendance'));
    app.use('/api/attendance', attendanceRoutes);
    const attendanceStatusRoutes = require(path.resolve(config.paths.server, 'routes/attendanceStatus'));
    app.use('/api/attendance', attendanceStatusRoutes);
  } catch (err) {
    console.warn('[tier1Common] Warning loading attendanceRoutes:', err.message);
  }

  try {
    const alertsRoutes = require(path.resolve(config.paths.server, 'routes/alerts'));
    app.use('/api/alerts', alertsRoutes);
  } catch (err) {
    console.warn('[tier1Common] Warning loading alertsRoutes:', err.message);
  }

  try {
    const trinetra = require(path.resolve(config.paths.server, 'routes/trinetra'));
    app.use('/api/trinetra', trinetra.router || trinetra);
  } catch (err) {
    console.warn('[tier1Common] Warning loading trinetra:', err.message);
  }

  try {
    const dashboardRoutes = require(path.resolve(config.paths.server, 'routes/dashboard'));
    app.use('/api/dashboard', dashboardRoutes);
  } catch (err) {
    console.warn('[tier1Common] Warning loading dashboardRoutes:', err.message);
  }

  try {
    const authRoutes = require(path.resolve(config.paths.server, 'routes/auth'));
    app.use('/api/auth', authRoutes);
  } catch (err) {
    console.warn('[tier1Common] Warning loading authRoutes:', err.message);
  }

  sharedExpressApp = app;
  return sharedExpressApp;
}

/**
 * Probe whether a TCP port is currently open and accepting connections.
 * @param {number} port
 * @param {string} [host='127.0.0.1']
 * @param {number} [timeoutMs=300]
 * @returns {Promise<boolean>}
 */
function isPortOpen(port, host = '127.0.0.1', timeoutMs = 300) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let status = false;

    socket.setTimeout(timeoutMs);

    socket.on('connect', () => {
      status = true;
      socket.destroy();
    });

    socket.on('timeout', () => {
      socket.destroy();
    });

    socket.on('error', () => {
      socket.destroy();
    });

    socket.on('close', () => {
      resolve(status);
    });

    socket.connect(port, host);
  });
}

/**
 * Execute an API request transparently:
 * If port 5000 is open, uses real HTTP requests via httpClient.
 * If port 5000 is offline, executes directly against the in-memory Express application via Supertest.
 *
 * @param {Object} options
 * @param {'GET'|'POST'|'PUT'|'DELETE'|'PATCH'} [options.method='GET']
 * @param {string} options.path Endpoint URL path (e.g. '/api/monitoring-v2/installer/info')
 * @param {any} [options.body=null]
 * @param {string} [options.token=null] JWT token
 * @param {Object} [options.headers={}] Custom headers
 * @param {Object} [options.query=null] Query parameters
 * @returns {Promise<{ status: number, ok: boolean, body: any, data: any, headers: Object, text: string, buffer: Buffer|null }>}
 */
async function apiRequest({ method = 'GET', path: reqPath, body = null, token = null, headers = {}, query = null }) {
  const backendOnline = await isPortOpen(config.ports.backend);

  if (backendOnline) {
    // Live backend execution
    const client = createHttpClient(config.backendUrl);
    if (token) client.setAuthToken(token);
    try {
      const res = await client.request(method, reqPath, body, { headers, query });
      return {
        status: res.status,
        ok: res.ok,
        body: res.data,
        data: res.data,
        headers: res.headers,
        text: res.rawText,
        buffer: res.buffer
      };
    } catch (err) {
      if (err.cause?.code === 'ECONNREFUSED') {
        // Fall back to in-memory app
      } else {
        throw err;
      }
    }
  }

  // In-memory Express execution via Supertest
  const request = getSupertest();
  const app = getSharedApp();

  let req = request(app)[method.toLowerCase()](reqPath);

  if (query) {
    req = req.query(query);
  }

  if (token) {
    req = req.set('x-auth-token', token).set('Authorization', `Bearer ${token}`);
  }

  for (const [k, v] of Object.entries(headers)) {
    req = req.set(k, v);
  }

  if (body !== null && method !== 'GET') {
    req = req.send(body);
  }

  const res = await req;
  const isOk = res.status >= 200 && res.status < 300;

  return {
    status: res.status,
    ok: isOk,
    body: res.body,
    data: res.body,
    headers: res.headers,
    text: res.text,
    buffer: res.body instanceof Buffer ? res.body : (Buffer.isBuffer(res.body) ? res.body : null)
  };
}

/**
 * Ensure MongoDB database is connected for tests requiring direct queries.
 */
async function ensureDbConnected() {
  return dbHelper.connect();
}

/**
 * Retrieves or creates a dedicated, isolated test employee to prevent cross-test parallel collisions.
 */
async function getOrCreateTestUser(email, name = 'Test User') {
  await ensureDbConnected();
  let user = await dbHelper.getUserByEmail(email);
  if (!user) {
    const res = await dbHelper.users.insertOne({
      name,
      email,
      role: 'User',
      department: 'Technology',
      branch: 'blackhole_mumbai',
      password: '$2a$10$YourHashedPasswordHere',
      stillExist: 1,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    user = await dbHelper.getUserById(res.insertedId);
  }
  return user;
}

module.exports = {
  config,
  dbHelper,
  authHelper,
  WindowsHelper,
  httpClient,
  createHttpClient,
  agentLoopbackClient,
  createAgentLoopbackClient,
  createSocketClient,
  isPortOpen,
  getSharedApp,
  apiRequest,
  ensureDbConnected,
  getOrCreateTestUser
};
