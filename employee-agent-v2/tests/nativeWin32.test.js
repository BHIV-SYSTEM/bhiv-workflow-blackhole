/**
 * NIYANTRAN EMPLOYEE MONITORING V2
 * Native Windows Application & State Monitor Tests
 *
 * Verifies real native Windows OS application detection, duration accounting,
 * and privacy invariant compliance.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { Win32Monitor } from '../src/native/win32Monitor.js';

test('Win32Monitor: real native sample returns valid OS process without window title', async () => {
  const monitor = new Win32Monitor();
  const sample = await monitor.sample();

  assert.equal(sample.success, true);
  assert.equal(typeof sample.exeName, 'string');
  assert.equal(typeof sample.appName, 'string');
  assert.equal(typeof sample.pid, 'number');
  assert.equal(typeof sample.idleMs, 'number');
  assert.equal(typeof sample.isLocked, 'boolean');
  assert.equal(typeof sample.isIdle, 'boolean');
  assert.equal(typeof sample.timestamp, 'string');

  // STRICT PRIVACY INVARIANTS:
  // Must NOT expose window titles, browser URLs, tab titles, or file paths
  assert.equal(sample.windowTitle, undefined, 'Window title must NOT be returned');
  assert.equal(sample.title, undefined, 'Title must NOT be returned');
  assert.equal(sample.url, undefined, 'URL must NOT be returned');
  assert.equal(sample.tabTitle, undefined, 'Tab title must NOT be returned');
  assert.equal(sample.text, undefined, 'Raw text must NOT be returned');
  assert.equal(sample.content, undefined, 'Content must NOT be returned');
  assert.equal(sample.filePath, undefined, 'File path must NOT be returned');
});

test('Win32Monitor: duration measurement accumulates accurately without double-counting', () => {
  const monitor = new Win32Monitor();
  monitor.isMonitoring = true;
  monitor.isPaused = false;

  // Simulate 3 seconds in VS Code
  monitor.processSample({ appName: 'Visual Studio Code', exeName: 'Code.exe', isIdle: false, isLocked: false });
  monitor.processSample({ appName: 'Visual Studio Code', exeName: 'Code.exe', isIdle: false, isLocked: false });
  monitor.processSample({ appName: 'Visual Studio Code', exeName: 'Code.exe', isIdle: false, isLocked: false });

  // Simulate 2 seconds in Slack
  monitor.processSample({ appName: 'Slack', exeName: 'slack.exe', isIdle: false, isLocked: false });
  monitor.processSample({ appName: 'Slack', exeName: 'slack.exe', isIdle: false, isLocked: false });

  // Simulate 1 second Idle
  monitor.processSample({ appName: 'Slack', exeName: 'slack.exe', isIdle: true, isLocked: false });

  const metrics = monitor.flushWindowMetrics(60);

  assert.equal(metrics.windowDurationSeconds, 60);
  assert.equal(metrics.idleSeconds, 1);
  assert.equal(metrics.lockSeconds, 0);

  // App breakdown
  const codeApp = metrics.apps.find((a) => a.name === 'Visual Studio Code');
  const slackApp = metrics.apps.find((a) => a.name === 'Slack');

  assert.ok(codeApp, 'Visual Studio Code must be in metrics');
  assert.equal(codeApp.durationSeconds, 3);
  assert.ok(slackApp, 'Slack must be in metrics');
  assert.equal(slackApp.durationSeconds, 2);

  // Total active seconds must be 3 + 2 = 5
  assert.equal(metrics.totalActiveSeconds, 5);

  // Flush must reset accumulators
  const nextMetrics = monitor.flushWindowMetrics(60);
  assert.equal(nextMetrics.apps.length, 0);
  assert.equal(nextMetrics.idleSeconds, 0);
  assert.equal(nextMetrics.totalActiveSeconds, 0);
});

test('Win32Monitor: pause stops accumulation and resume continues correctly', () => {
  const monitor = new Win32Monitor();
  monitor.isMonitoring = true;
  monitor.isPaused = false;

  // Active
  monitor.processSample({ appName: 'Notepad', exeName: 'notepad.exe', isIdle: false, isLocked: false });

  // Pause
  monitor.pauseMonitoring();
  assert.equal(monitor.isPaused, true);

  // While paused, incoming samples must NOT be accumulated
  monitor.processSample({ appName: 'Notepad', exeName: 'notepad.exe', isIdle: false, isLocked: false });
  monitor.processSample({ appName: 'Notepad', exeName: 'notepad.exe', isIdle: false, isLocked: false });

  // Resume
  monitor.resumeMonitoring();
  assert.equal(monitor.isPaused, false);
  monitor.processSample({ appName: 'Notepad', exeName: 'notepad.exe', isIdle: false, isLocked: false });

  const metrics = monitor.flushWindowMetrics(60);
  const notepad = metrics.apps.find((a) => a.name === 'Notepad');
  assert.equal(notepad.durationSeconds, 2, 'Must have accumulated only 2 active seconds');
});
