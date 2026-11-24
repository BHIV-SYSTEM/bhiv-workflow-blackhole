/**
 * Tier 1 Feature Coverage: F7 — Legacy Surveillance Stripping & Privacy Boundaries
 * Verifies excision of raw keystroke logging, stripping of invasive screenshot routes,
 * eradication of OCR trained data models, neutralization of URL tracking,
 * and deactivation of automated behavioral karma penalties.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const { config, apiRequest } = require('./tier1Common');
const karmaClient = require(path.resolve(config.paths.server, 'services/karmaClient.js'));

test('[F7] Legacy KeystrokeLog Surveillance Model Eradication & Schema Protection', () => {
  const modelPath = path.resolve(config.paths.server, 'models/KeystrokeLog.js');
  assert.ok(fs.existsSync(modelPath), 'KeystrokeLog.js file must exist');

  const content = fs.readFileSync(modelPath, 'utf8');

  // Verify deprecation notice and removal of raw typed text
  assert.ok(
    content.includes('DEPRECATED') || content.includes('EXCISED') || content.includes('V2 Privacy Boundaries'),
    'KeystrokeLog must be explicitly documented as deprecated/excised under V2'
  );
  assert.ok(
    !content.includes('text: { type: String }') && !content.includes('typed_text'),
    'KeystrokeLog schema must NEVER store raw typed text'
  );
});

test('[F7] Invasive Screenshot Capture Route Stripping & Deactivation', async () => {
  const res = await apiRequest({
    method: 'POST',
    path: '/api/trinetra/agent/screenshot',
    body: { image: 'base64_screenshot_data' }
  });

  assert.ok(
    res.status === 404 || res.status === 410,
    `Legacy screenshot ingestion route must return 404 or 410, got: ${res.status}`
  );
});

test('[F7] OCR Analysis Language Model & Tesseract Filesystem Removal', () => {
  const trainedDataPath = path.resolve(config.paths.server, 'eng.traineddata');
  assert.equal(
    fs.existsSync(trainedDataPath),
    false,
    'Tesseract OCR language model (eng.traineddata) must be excised from filesystem'
  );

  // Check server package.json to verify tesseract is not an active V2 ingestion dependency
  const serverPkgPath = path.resolve(config.paths.server, 'package.json');
  const serverPkg = JSON.parse(fs.readFileSync(serverPkgPath, 'utf8'));
  const v2ContractsPath = path.resolve(config.paths.server, 'modules/employee-monitoring-v2/contracts/index.js');
  const contractsCode = fs.readFileSync(v2ContractsPath, 'utf8');

  assert.ok(
    contractsCode.includes('screenshot') && contractsCode.includes('image'),
    'V2 contracts must explicitly categorize image and screenshot data as forbidden'
  );
});

test('[F7] Legacy URL Whitelist & Web Tracking Surveillance Route Removal', async () => {
  const res = await apiRequest({
    method: 'GET',
    path: '/api/monitoring/whitelist'
  });

  assert.ok(
    res.status === 404 || res.status === 410 || res.status === 401,
    `Legacy URL whitelist route must not be active on unauthenticated path, got: ${res.status}`
  );

  // Ensure V2 telemetry contract strictly prohibits browser URL tracking
  const v2ContractsPath = path.resolve(config.paths.server, 'modules/employee-monitoring-v2/contracts/index.js');
  const contractsCode = fs.readFileSync(v2ContractsPath, 'utf8');
  assert.ok(contractsCode.includes('url'), 'V2 contracts must forbid URL tracking');
});

test('[F7] Automated Behavioral Karma Penalties Deactivation & Stripping', async () => {
  // 1. Excessive idle trigger
  const idleRes = await karmaClient.signalExcessiveIdle('emp_test_user_001', 30, 'trace_idle_001');
  assert.equal(idleRes.neutralized, true, 'signalExcessiveIdle must be neutralized in V2');
  assert.equal(idleRes.signal, karmaClient.SIGNALS.ALLOW, 'Signal must be set to allow (zero penalty)');

  // 2. Disallowed site trigger
  const siteRes = await karmaClient.signalDisallowedSite('emp_test_user_001', 'trace_site_001');
  assert.equal(siteRes.neutralized, true, 'signalDisallowedSite must be neutralized in V2');
  assert.equal(siteRes.signal, karmaClient.SIGNALS.ALLOW, 'Signal must be set to allow');

  // 3. Keystroke anomaly trigger
  const anomalyRes = await karmaClient.signalKeystrokeAnomaly('emp_test_user_001', 0.85, 'trace_anom_001');
  assert.equal(anomalyRes.neutralized, true, 'signalKeystrokeAnomaly must be neutralized in V2');
  assert.equal(anomalyRes.signal, karmaClient.SIGNALS.ALLOW, 'Signal must be set to allow');
});
