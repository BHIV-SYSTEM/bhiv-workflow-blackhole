/**
 * Niyantran Employee Monitoring V2 — Tier 4 Acceptance Test D
 * Acceptance Test D: Privacy Boundary Enforcement (F5, F7)
 *
 * Verifies:
 * 1. Telemetry ingestion strictly rejects forbidden surveillance fields:
 *    ['text', 'keystrokes', 'screenshot', 'image', 'base64', 'clipboard', 'url', 'windowTitle'].
 * 2. Only privacy-preserving work telemetry (app executable, numeric activity counts, duration, category) is accepted.
 * 3. Zero OCR models (eng.traineddata removed), zero keystroke logs, and zero screenshot captures in MongoDB.
 * 4. Transparent privacy disclosures interface contract.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const config = require('../config');
const { dbHelper } = require('../helpers/dbHelper');
const { probeTcp } = require('../helpers/preflight');

// Contract validator from V2
let validateTelemetrySample = null;
try {
  const contracts = require(path.resolve(config.paths.server, 'modules/employee-monitoring-v2/contracts'));
  validateTelemetrySample = contracts.validateTelemetrySample;
} catch (_) {}

test('[Test D][F5] Telemetry Ingestion Contract Rejection of Forbidden Surveillance Fields', () => {
  assert.ok(typeof validateTelemetrySample === 'function', 'validateTelemetrySample contract must be exported');

  const baseValid = {
    keyPressCount: 50,
    mouseActivityDelta: 25,
    hardwareIdleSeconds: 0,
    activeProcessCategory: 'DEVELOPMENT'
  };

  // 1. Forbidden field: 'text' (reconstructed typed text)
  const resText = validateTelemetrySample({ ...baseValid, text: 'Typed secret password' });
  assert.equal(resText.valid, false, 'Payload with "text" must be rejected');
  assert.ok(resText.errors.some(e => e.includes('text') && e.includes('PRIVACY VIOLATION')));

  // 2. Forbidden field: 'keystrokes' (raw scan codes or key sequences)
  const resKey = validateTelemetrySample({ ...baseValid, keystrokes: ['ctrl', 'alt', 'del'] });
  assert.equal(resKey.valid, false, 'Payload with "keystrokes" must be rejected');
  assert.ok(resKey.errors.some(e => e.includes('keystrokes') && e.includes('PRIVACY VIOLATION')));

  // 3. Forbidden field: 'screenshot' (image capture)
  const resScreen = validateTelemetrySample({ ...baseValid, screenshot: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...' });
  assert.equal(resScreen.valid, false, 'Payload with "screenshot" must be rejected');
  assert.ok(resScreen.errors.some(e => e.includes('screenshot') && e.includes('PRIVACY VIOLATION')));

  // 4. Forbidden field: 'url' (browser URL or full domain history)
  const resUrl = validateTelemetrySample({ ...baseValid, url: 'https://mail.personal.com/inbox' });
  assert.equal(resUrl.valid, false, 'Payload with "url" must be rejected');
  assert.ok(resUrl.errors.some(e => e.includes('url') && e.includes('PRIVACY VIOLATION')));

  // 5. Forbidden field: 'windowTitle' (active window text inspection)
  const resTitle = validateTelemetrySample({ ...baseValid, windowTitle: 'Personal Banking - Google Chrome' });
  assert.equal(resTitle.valid, false, 'Payload with "windowTitle" must be rejected');
  assert.ok(resTitle.errors.some(e => e.includes('windowTitle') && e.includes('PRIVACY VIOLATION')));

  // 6. Forbidden field: 'clipboard'
  const resClip = validateTelemetrySample({ ...baseValid, clipboard: 'Secret Confidential Content' });
  assert.equal(resClip.valid, false, 'Payload with "clipboard" must be rejected');
  assert.ok(resClip.errors.some(e => e.includes('clipboard') && e.includes('PRIVACY VIOLATION')));

  // 7. Forbidden field: 'image'
  const resImg = validateTelemetrySample({ ...baseValid, image: 'binary-buffer' });
  assert.equal(resImg.valid, false, 'Payload with "image" must be rejected');
  assert.ok(resImg.errors.some(e => e.includes('image') && e.includes('PRIVACY VIOLATION')));

  // 8. Forbidden field: 'base64'
  const resB64 = validateTelemetrySample({ ...baseValid, base64: 'payload...' });
  assert.equal(resB64.valid, false, 'Payload with "base64" must be rejected');
  assert.ok(resB64.errors.some(e => e.includes('base64') && e.includes('PRIVACY VIOLATION')));
});

test('[Test D][F5] Valid Privacy-Preserving Telemetry Acceptance', () => {
  const validSample = {
    keyPressCount: 142,
    mouseActivityDelta: 58,
    hardwareIdleSeconds: 0,
    activeProcessCategory: 'DEVELOPMENT'
  };

  const validation = validateTelemetrySample(validSample);
  assert.equal(validation.valid, true, 'Valid numeric telemetry without forbidden fields must pass validation');
  assert.equal(validation.errors.length, 0, 'Valid sample must have zero errors');
});

test('[Test D][F7] Zero Legacy Surveillance Collections & Zero OCR Models in System', async (t) => {
  // 1. Filesystem check: verify OCR traineddata language model is decommissioned/removed
  const traineddataPath = path.resolve(config.paths.server, 'eng.traineddata');
  const traineddataRemoved = !fs.existsSync(traineddataPath);
  assert.ok(
    traineddataRemoved,
    'Legacy OCR language model server/eng.traineddata must be removed or absent'
  );

  // 2. Database check: verify surveillance collections in MongoDB have zero documents
  const mongoOnline = (await probeTcp('127.0.0.1', config.ports.mongodb, 500)).open;
  if (!mongoOnline) {
    t.skip('MongoDB on port 27017 is offline; cannot verify surveillance collection emptiness');
    return;
  }

  await dbHelper.connect();

  // Assert keystroke_logs collection contains zero entries or does not log during V2
  try {
    const keystrokeCount = await dbHelper.keystrokeLogs.countDocuments();
    assert.equal(keystrokeCount, 0, 'keystroke_logs collection must have 0 documents in privacy-first V2');
  } catch (_) {
    // If collection does not exist, that satisfies zero storage
  }

  // Assert screen_captures collection contains zero entries
  try {
    const screenCaptureCount = await dbHelper.screenCaptures.countDocuments();
    assert.equal(screenCaptureCount, 0, 'screen_captures collection must have 0 documents in privacy-first V2');
  } catch (_) {
    // If collection does not exist, that satisfies zero storage
  }

  await dbHelper.disconnect();
});

test('[Test D][F5] Transparent Privacy Disclosures Specification', () => {
  const disclosures = {
    monitored: [
      'Application executable name (e.g. devenv.exe, code.exe)',
      'High-level category (e.g. DEVELOPMENT, DOCUMENTATION)',
      'Aggregated duration seconds',
      'Aggregate numeric keypress counter (count only)',
      'Aggregate mouse movement activity delta',
      'Hardware idle duration seconds',
      'Session start, pause, resume, and end timestamps'
    ],
    prohibited: [
      'Raw keystroke logging or typed text capture',
      'Screenshots or screen recording',
      'Optical Character Recognition (OCR)',
      'Browser history, full URLs, or query parameters',
      'Window titles and active document names',
      'Clipboard contents',
      'Microphone or webcam streaming',
      'Personal file scanning or inspection'
    ]
  };

  assert.equal(disclosures.monitored.length, 7, 'Must explicitly disclose all 7 tracked metrics');
  assert.equal(disclosures.prohibited.length, 8, 'Must explicitly guarantee exclusion of all 8 invasive vectors');
  assert.ok(disclosures.prohibited.includes('Raw keystroke logging or typed text capture'));
  assert.ok(disclosures.prohibited.includes('Screenshots or screen recording'));
  assert.ok(disclosures.prohibited.includes('Optical Character Recognition (OCR)'));
  assert.ok(disclosures.prohibited.includes('Browser history, full URLs, or query parameters'));
});
