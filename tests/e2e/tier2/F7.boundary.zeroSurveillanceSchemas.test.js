/**
 * Niyantran Employee Monitoring V2 — Tier 2 Boundary Test
 * Feature F7: Legacy Surveillance Stripping
 *
 * Boundary & Negative Tests:
 * 1. Legacy screenshot upload endpoint returns 404 or 410 Gone.
 * 2. Legacy keystroke ingest endpoint returns 404 or 410 Gone.
 * 3. Schema strict validation: KeystrokeLog collection has zero active writes.
 * 4. OCR upload or language model references are completely absent from server.
 * 5. Database collection inspection: zero raw text or screenshot documents created.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const config = require('../config');
const { httpClient } = require('../helpers/httpClient');
const { dbHelper } = require('../helpers/dbHelper');

async function safeGet(urlPath) {
  try {
    return await httpClient.request('GET', urlPath);
  } catch (err) {
    return { status: 0, ok: false, error: err.message, data: null };
  }
}

async function safePost(urlPath, body = {}) {
  try {
    return await httpClient.request('POST', urlPath, body);
  } catch (err) {
    return { status: 0, ok: false, error: err.message, data: null };
  }
}

test('[F7] Legacy screenshot upload endpoint returns 404 or 410 Gone', async () => {
  const res = await safePost('/api/trinetra/agent/screenshot', { image: 'test' });
  if (res.status !== 0) {
    assert.ok([404, 410].includes(res.status), `Legacy screenshot route must be 404/410, got: ${res.status}`);
  } else {
    // In-process check: verify no active router exposes /api/trinetra/agent/screenshot
    const trinetraRoutePath = path.resolve(config.paths.server, 'routes/trinetra.js');
    if (fs.existsSync(trinetraRoutePath)) {
      const content = fs.readFileSync(trinetraRoutePath, 'utf8');
      assert.ok(!content.includes("router.post('/agent/screenshot'"), 'trinetra must not expose active screenshot ingestion');
    }
  }
});

test('[F7] Legacy keystroke ingest endpoint returns 404 or 410 Gone', async () => {
  const res = await safePost('/api/agent/keystroke/ingest', { keys: ['a', 'b', 'c'] });
  if (res.status !== 0) {
    assert.ok([404, 410].includes(res.status), `Legacy keystroke route must be 404/410, got: ${res.status}`);
  } else {
    // In-process verification: verify server/index.js does not mount legacy keystroke route
    const indexPath = path.resolve(config.paths.server, 'index.js');
    const content = fs.readFileSync(indexPath, 'utf8');
    assert.ok(!content.includes("'/api/agent/keystroke'"), 'server/index.js must not mount /api/agent/keystroke route');
  }
});

test('[F7] Schema strict validation: KeystrokeLog collection has zero active writes', async () => {
  await dbHelper.connect();

  // Query keystroke logs for recent test activity
  const recentLogs = await dbHelper.keystrokeLogs.find({
    timestamp: { $gte: new Date(Date.now() - 3600 * 1000) }
  }).toArray();

  assert.equal(recentLogs.length, 0, 'keystroke_logs collection must have zero active records from V2 sessions');
});

test('[F7] OCR upload or language model references are completely absent from server', () => {
  // Verify eng.traineddata binary is absent
  const trainedDataPath = path.resolve(config.paths.server, 'eng.traineddata');
  assert.equal(fs.existsSync(trainedDataPath), false, 'eng.traineddata OCR model must be removed from server');

  // Verify server package.json does not depend on tesseract.js
  const pkgPath = path.resolve(config.paths.server, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const allDeps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  assert.equal(allDeps['tesseract.js'], undefined, 'tesseract.js must not be a dependency');
});

test('[F7] Database collection inspection: AggregatedTelemetryV2 strictly omits forbidden fields', async () => {
  await dbHelper.connect();

  // Query latest V2 telemetry records
  const sample = await dbHelper.telemetry.findOne({});
  if (sample) {
    assert.equal(sample.text, undefined, 'AggregatedTelemetryV2 must never contain text');
    assert.equal(sample.keystrokes, undefined, 'AggregatedTelemetryV2 must never contain keystrokes');
    assert.equal(sample.screenshot, undefined, 'AggregatedTelemetryV2 must never contain screenshot');
    assert.equal(sample.url, undefined, 'AggregatedTelemetryV2 must never contain url');
    assert.equal(sample.windowTitle, undefined, 'AggregatedTelemetryV2 must never contain windowTitle');
  } else {
    // Model schema check
    const AggregatedTelemetryV2 = require(path.resolve(config.paths.server, 'modules/employee-monitoring-v2/models/AggregatedTelemetryV2'));
    const schemaPaths = Object.keys(AggregatedTelemetryV2.schema.paths);
    const forbidden = ['text', 'keystrokes', 'screenshot', 'url', 'windowTitle', 'clipboard'];
    for (const f of forbidden) {
      assert.ok(!schemaPaths.includes(f), `Schema must not contain forbidden surveillance field: ${f}`);
    }
  }

  await dbHelper.disconnect();
});
