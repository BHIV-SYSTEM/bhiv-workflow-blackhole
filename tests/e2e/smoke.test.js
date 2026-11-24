/**
 * Niyantran Employee Monitoring V2 — E2E Test Infrastructure Smoke Test
 * Verifies that all 10 harness components, helpers, configurations,
 * and live system interfaces (MongoDB, Windows WMI, Installer binary) are functional.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const config = require('./config');
const { httpClient, createHttpClient } = require('./helpers/httpClient');
const { dbHelper, createDbHelper } = require('./helpers/dbHelper');
const { createSocketClient } = require('./helpers/socketClient');
const { agentLoopbackClient, createAgentLoopbackClient } = require('./helpers/agentLoopbackClient');
const { authHelper, createAuthHelper } = require('./helpers/authHelper');
const WindowsHelper = require('./helpers/windowsHelper');
const Reporter = require('./helpers/reporter');
const { runPreflight, probeTcp } = require('./helpers/preflight');

test('[F1][F4] Config Module: exports complete subsystem configuration', () => {
  assert.equal(typeof config.backendUrl, 'string', 'backendUrl must be a string');
  assert.equal(typeof config.mongoUri, 'string', 'mongoUri must be a string');
  assert.equal(config.ports.mongodb, 27017, 'MongoDB port must be 27017');
  assert.equal(config.ports.backend, 5000, 'Backend port must be 5000');
  assert.equal(config.ports.loopback, 48120, 'Loopback port must be 48120');

  // Verify credentials
  assert.equal(config.credentials.admin.email, 'rudra@blackhole.ai');
  assert.equal(config.credentials.user.email, 'ishan@blackhole.ai');
  assert.equal(config.credentials.admin.role, 'Admin');
  assert.equal(config.credentials.user.role, 'User');

  // Verify hardware spec
  assert.equal(config.hardware.manufacturer, 'Acer');
  assert.equal(config.hardware.model, 'Nitro AN515-57');

  // Verify installer spec
  assert.equal(config.installer.version, '2.0.0');
  assert.equal(config.installer.fileName, 'NiyantranMonitoringAgentV2-Setup.exe');
  assert.equal(config.installer.sha256, 'B104D7D88C13A29074D7A01368705B90F23CDB07A6F459FE98E67315E4916003');
  assert.equal(config.installer.sizeBytes, 55808);

  // Verify features dictionary covers F1 to F16
  for (let i = 1; i <= 16; i++) {
    assert.ok(config.features[`F${i}`], `Feature F${i} must be defined in config.features`);
  }
});

test('[F1] WindowsHelper: validates installer binary existence, PE header, and SHA-256', () => {
  const result = WindowsHelper.verifyInstallerBinary();
  assert.ok(result.exists, `Installer binary must exist at ${config.installer.localPath}`);
  assert.ok(result.hasPeHeader, 'Installer binary must have valid Windows PE ("MZ") header');
  assert.equal(result.sizeBytes, config.installer.sizeBytes, 'Installer binary size must match expected 55808 bytes');
  assert.equal(result.sha256, config.installer.sha256, 'Installer binary SHA-256 must match authoritative hash');
  assert.ok(result.valid, 'Installer binary must be verified valid');
});

test('[F4] WindowsHelper: detects Acer Nitro AN515-57 host hardware via WMI/CIM', () => {
  const detection = WindowsHelper.isAcerHardware();
  assert.equal(typeof detection.manufacturer, 'string', 'Manufacturer must be reported');
  assert.equal(typeof detection.model, 'string', 'Model must be reported');
  assert.ok(detection.manufacturer.toLowerCase().includes('acer'), `Manufacturer must be Acer, got: ${detection.manufacturer}`);
  assert.ok(detection.model.toLowerCase().includes('nitro an515-57'), `Model must be Nitro AN515-57, got: ${detection.model}`);
  assert.ok(detection.uuid.length > 10, 'UUID must be detected');
  assert.ok(detection.isAcer, 'isAcer flag must evaluate to true');
});

test('[F10][F14] DbHelper: connects to live MongoDB and queries seeded users', async () => {
  await dbHelper.connect();

  // Assert seeded users exist
  const adminUser = await dbHelper.getUserByEmail('rudra@blackhole.ai');
  assert.ok(adminUser, 'Admin user rudra@blackhole.ai must exist in database');
  assert.equal(adminUser.role, 'Admin');

  const regularUser = await dbHelper.getUserByEmail('ishan@blackhole.ai');
  assert.ok(regularUser, 'Regular user ishan@blackhole.ai must exist in database');
  assert.equal(regularUser.role, 'User');

  // Verify assertDocumentExists helper
  await dbHelper.assertDocumentExists('users', { email: 'rudra@blackhole.ai' });

  // Verify privacy assertion helper on surveillance collections (keystrokes / screenshots)
  await dbHelper.assertCollectionEmpty('keystroke_logs', { employee_id: 'non_existent_test_id' });

  await dbHelper.disconnect();
});

test('[F8][F15] AuthHelper: generates and verifies signed JWT tokens with secret', () => {
  const adminToken = authHelper.createAdminToken({ testCustomClaim: 'e2e-infra-smoke' });
  assert.ok(typeof adminToken === 'string' && adminToken.length > 20, 'Admin token must be valid string');

  const decoded = authHelper.decodeToken(adminToken);
  assert.equal(decoded.email, config.credentials.admin.email);
  assert.equal(decoded.role, 'Admin');
  assert.equal(decoded.testCustomClaim, 'e2e-infra-smoke');

  const verified = authHelper.verifyToken(adminToken);
  assert.equal(verified.email, config.credentials.admin.email);

  const headers = authHelper.getAuthHeaders(adminToken);
  assert.equal(headers['x-auth-token'], adminToken);
  assert.equal(headers['Authorization'], `Bearer ${adminToken}`);

  const userToken = authHelper.createUserToken();
  const userDecoded = authHelper.decodeToken(userToken);
  assert.equal(userDecoded.email, config.credentials.user.email);
  assert.equal(userDecoded.role, 'User');
});

test('HttpClient: initializes and correctly formats requests and auth headers', () => {
  const client = createHttpClient('http://localhost:5000');
  client.setAuthToken('mock-test-jwt-token');

  const resolved = client.resolveUrl('/api/test', { param1: 'val1', count: 42 });
  assert.equal(resolved, 'http://localhost:5000/api/test?param1=val1&count=42');

  client.clearAuthToken();
  assert.equal(client.authToken, null);
});

test('[F2][F3] AgentLoopbackClient: verifies client interface contracts', () => {
  const client = createAgentLoopbackClient('http://127.0.0.1:48120');
  assert.equal(typeof client.getStatus, 'function');
  assert.equal(typeof client.getMini, 'function');
  assert.equal(typeof client.startSession, 'function');
  assert.equal(typeof client.pauseSession, 'function');
  assert.equal(typeof client.resumeSession, 'function');
  assert.equal(typeof client.endSession, 'function');
  assert.equal(typeof client.isHealthy, 'function');
});

test('[F15] SocketClient: verifies client interface contracts', () => {
  const client = createSocketClient({ url: 'http://localhost:5000', autoConnect: false });
  assert.equal(typeof client.connect, 'function');
  assert.equal(typeof client.disconnect, 'function');
  assert.equal(typeof client.joinRoom, 'function');
  assert.equal(typeof client.waitForEvent, 'function');
  assert.equal(typeof client.collectEvents, 'function');
  assert.equal(typeof client.isConnected, 'function');
  assert.equal(client.isConnected(), false);
});

test('Preflight & Reporter: validates probe connectivity and summary report generation', async () => {
  const tcpResult = await probeTcp('127.0.0.1', 27017, 1000);
  assert.ok(tcpResult.open, 'MongoDB port 27017 must be probed as open');

  const preflight = await runPreflight({ silent: true });
  assert.ok(preflight.services.mongo.online, 'Preflight MongoDB probe must be online');
  assert.equal(preflight.services.mongo.port, 27017);

  // Verify Reporter ANSI tables and JSON writer
  const mockTierStats = {
    'Tier 1 (Feature Coverage)': { total: 10, passed: 10, failed: 0, skipped: 0, durationMs: 120 }
  };
  const tierTable = Reporter.formatTierTable(mockTierStats);
  assert.ok(tierTable.includes('Tier 1 (Feature Coverage)'), 'Tier table must format Tier 1');

  const mockFeatureStats = {
    F1: { total: 5, passed: 5, failed: 0, skipped: 0 }
  };
  const featureTable = Reporter.formatFeatureTable(mockFeatureStats);
  assert.ok(featureTable.includes('Desktop Agent Installer'), 'Feature table must format F1');

  const tempJson = path.resolve(__dirname, 'reports/smoke_report.json');
  Reporter.writeJsonReport({ smokeTest: true, timestamp: new Date().toISOString() }, tempJson);
  assert.ok(fs.existsSync(tempJson), 'Smoke JSON report must be written');
  fs.unlinkSync(tempJson);
});
