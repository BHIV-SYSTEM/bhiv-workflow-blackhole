/**
 * Tier 1 Feature Coverage: F15 — Socket.io Real-Time Integration & Room Isolation
 * Verifies authenticated Socket.io connections, real-time telemetry tick events,
 * device status updates, Vite client socket proxy configuration,
 * and targeted room notification isolation.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const { config, authHelper, ensureDbConnected, dbHelper, isPortOpen } = require('./tier1Common');
const { createSocketClient } = require('../helpers/socketClient');

// Resolve server-side Socket.io and notification service
const { Server } = require(path.resolve(config.paths.server, 'node_modules/socket.io'));
const jwt = require(path.resolve(config.paths.server, 'node_modules/jsonwebtoken'));
const notificationService = require(path.resolve(config.paths.server, 'modules/employee-monitoring-v2/services/notificationService.js'));

let ephemeralServer = null;
let ephemeralIo = null;
let socketServerUrl = null;

async function setupSocketServer() {
  if (ephemeralServer) return socketServerUrl;

  ephemeralServer = http.createServer();
  ephemeralIo = new Server(ephemeralServer, {
    cors: { origin: '*' }
  });

  // Socket authentication middleware mirroring production security
  ephemeralIo.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.headers?.['x-auth-token'];
    if (!token) {
      return next(new Error('Authentication token required'));
    }
    try {
      const decoded = jwt.verify(token, config.jwt.secret);
      socket.user = decoded;
      socket.userId = decoded.id || decoded._id || (decoded.user && (decoded.user.id || decoded.user._id));
      return next();
    } catch (err) {
      return next(new Error(`Invalid authentication token: ${err.message}`));
    }
  });

  ephemeralIo.on('connection', (socket) => {
    // Automatically join the user's targeted personal room
    if (socket.userId) {
      socket.join(String(socket.userId));
    }

    socket.on('join_room', (roomName) => {
      socket.join(roomName);
    });

    socket.on('leave_room', (roomName) => {
      socket.leave(roomName);
    });
  });

  await new Promise((resolve) => {
    ephemeralServer.listen(0, '127.0.0.1', () => {
      const port = ephemeralServer.address().port;
      socketServerUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });

  return socketServerUrl;
}

test.after(async () => {
  if (ephemeralIo) {
    ephemeralIo.close();
    ephemeralIo = null;
  }
  if (ephemeralServer) {
    await new Promise((res) => ephemeralServer.close(res));
    ephemeralServer = null;
  }
  await dbHelper.disconnect();
});

test('[F15] Socket.io Connection & Auth Token Verification', async () => {
  const serverUrl = await setupSocketServer();

  // 1. Generate valid JWT token
  const token = authHelper.createUserToken({ id: 'emp_f15_auth_01', role: 'User' });

  // 2. Connect client with auth token
  const client = createSocketClient({ url: serverUrl, token });
  await client.connect();

  assert.equal(client.isConnected(), true, 'Socket client must connect successfully with valid token');

  client.disconnect();
  assert.equal(client.isConnected(), false, 'Socket must be cleanly disconnected');
});

test('[F15] Telemetry Tick Real-Time Event Broadcast', async () => {
  const serverUrl = await setupSocketServer();

  const adminToken = authHelper.createAdminToken({ id: 'admin_f15_tick' });
  const adminClient = createSocketClient({ url: serverUrl, token: adminToken });
  await adminClient.connect();

  // Admin joins telemetry monitoring room
  adminClient.joinRoom('admin_monitoring_room');
  // Brief pause to allow socket handshake/room join to complete
  await new Promise((res) => setTimeout(res, 50));

  // Prepare event listener
  const tickPromise = adminClient.waitForEvent('monitoring-v2:telemetry-tick', 3000);

  // Broadcast telemetry tick from server to monitoring room
  const tickPayload = {
    employeeId: 'emp_f15_worker_01',
    sessionId: 'sess_f15_tick_99',
    deviceId: 'DEV-ACER-TICK',
    activeSeconds: 60,
    focusScore: 92,
    category: 'DEVELOPMENT',
    timestamp: new Date().toISOString()
  };

  ephemeralIo.to('admin_monitoring_room').emit('monitoring-v2:telemetry-tick', tickPayload);

  const received = await tickPromise;
  assert.ok(received, 'Admin client must receive telemetry tick');
  assert.equal(received.sessionId, 'sess_f15_tick_99');
  assert.equal(received.category, 'DEVELOPMENT');
  assert.equal(received.focusScore, 92);

  adminClient.disconnect();
});

test('[F15] Device Status & Heartbeat Broadcast Over Socket Channel', async () => {
  const serverUrl = await setupSocketServer();

  const token = authHelper.createUserToken({ id: 'emp_f15_status_01' });
  const client = createSocketClient({ url: serverUrl, token });
  await client.connect();

  const statusPromise = client.waitForEvent('monitoring-v2:device-status', 3000);

  const statusPayload = {
    deviceId: 'DEV-ACER-NITRO-F15',
    employeeId: 'emp_f15_status_01',
    status: 'ACTIVE',
    lastSeenAt: new Date().toISOString()
  };

  ephemeralIo.emit('monitoring-v2:device-status', statusPayload);

  const received = await statusPromise;
  assert.ok(received, 'Client must receive device-status broadcast');
  assert.equal(received.deviceId, 'DEV-ACER-NITRO-F15');
  assert.equal(received.status, 'ACTIVE');
  assert.ok(received.lastSeenAt, 'lastSeenAt must be populated');

  client.disconnect();
});

test('[F15] Vite Client Socket Proxy Configuration Verification', async () => {
  const viteConfigPath = path.resolve(config.paths.client, 'vite.config.js');
  assert.ok(fs.existsSync(viteConfigPath), 'client/vite.config.js must exist on disk');

  const content = fs.readFileSync(viteConfigPath, 'utf8');

  // Verify server configuration defines proxy mapping
  assert.ok(content.includes('server:'), 'vite.config.js must define server configuration');
  assert.ok(content.includes('proxy:'), 'vite.config.js must define proxy configuration');
  assert.ok(content.includes('target:'), 'vite.config.js proxy must define target destination');

  // If Vite server is running on port 5173, verify socket.io endpoint via HTTP polling
  const viteOnline = await isPortOpen(config.ports.frontend);
  if (viteOnline) {
    const res = await fetch(`http://localhost:${config.ports.frontend}/socket.io/?EIO=4&transport=polling`);
    assert.ok(res.status < 500, `Vite proxy to socket.io must succeed or return valid protocol response, got ${res.status}`);
  } else {
    // Verify offline proxy routing contract matches port 5000 backend
    assert.ok(content.includes('5000'), 'Vite proxy target must map to backend port 5000');
  }
});

test('[F15] Targeted Room Notification Security & Isolation', async () => {
  await ensureDbConnected();
  const serverUrl = await setupSocketServer();

  const employeeA = await dbHelper.getUserByEmail('ishan@blackhole.ai');
  const employeeB = await dbHelper.getUserByEmail('rudra@blackhole.ai');

  assert.ok(employeeA, 'employeeA must exist');
  assert.ok(employeeB, 'employeeB must exist');

  const tokenA = authHelper.createUserToken({ id: employeeA._id.toString() });
  const tokenB = authHelper.createUserToken({ id: employeeB._id.toString() });

  const clientA = createSocketClient({ url: serverUrl, token: tokenA });
  const clientB = createSocketClient({ url: serverUrl, token: tokenB });

  await Promise.all([clientA.connect(), clientB.connect()]);

  // Client B listens for events during window
  const bEventsPromise = clientB.collectEvents('employee-monitoring-alert', 800);
  // Client A expects targeted alert
  const aWaitPromise = clientA.waitForEvent('employee-monitoring-alert', 3000);

  // Send alert targeted strictly to Employee A
  await notificationService.sendAlert({
    employeeId: employeeA._id,
    alertType: 'idle_timeout',
    severity: 'medium',
    title: 'Idle Time Alert for Employee A',
    description: '15 minutes of inactivity recorded',
    io: ephemeralIo
  });

  const receivedByA = await aWaitPromise;
  const receivedByB = await bEventsPromise;

  assert.ok(receivedByA, 'Employee A must receive targeted monitoring alert');
  assert.equal(receivedByA.title, 'Idle Time Alert for Employee A');
  assert.equal(receivedByB.length, 0, 'Employee B must receive ZERO events intended for Employee A (room isolation)');

  clientA.disconnect();
  clientB.disconnect();
});
