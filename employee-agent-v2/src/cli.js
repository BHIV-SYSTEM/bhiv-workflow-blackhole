/**
 * NIYANTRAN EMPLOYEE MONITORING V2
 * Windows Desktop Monitoring Agent — Command Line Interface
 *
 * Provides real CLI commands:
 * - pair <pairingCode> [--url <url>]
 * - start <sessionId> [--url <url>] [--interval <seconds>]
 * - status
 * - renew-lease <sessionId> [--url <url>]
 */

import os from 'node:os';
import { SecureStore } from './storage/secureStore.js';
import { NiyantranMonitoringAgentV2 } from './agent.js';
import { SyncEngine } from './managers/syncEngine.js';
import { AGENT_CONFIG } from './config.js';

const secureStore = new SecureStore();

function getArg(flag, defaultValue = null) {
  const idx = process.argv.indexOf(flag);
  if (idx !== -1 && idx + 1 < process.argv.length) {
    return process.argv[idx + 1];
  }
  return defaultValue;
}

async function pairDevice(pairingCode, apiBaseUrl) {
  console.log(`[Agent CLI] Pairing workstation with enrollment code: ${pairingCode}...`);
  const url = apiBaseUrl || AGENT_CONFIG.API_BASE_URL;

  const payload = {
    pairingCode,
    deviceName: `${os.hostname()} (${os.userInfo().username})`,
    platform: 'windows',
    osVersion: `${os.type()} ${os.release()}`,
    agentVersion: '2.0.0-phase-e',
  };

  const response = await fetch(`${url}/devices/pair`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = await response.json();
  if (!response.ok) {
    console.error(`[Agent CLI] Pairing FAILED (HTTP ${response.status}):`, data.error || data);
    process.exit(1);
  }

  console.log('[Agent CLI] Pairing SUCCESSFUL!');
  console.log(`[Agent CLI] Device ID:   ${data.deviceId}`);
  console.log(`[Agent CLI] Device Name: ${data.deviceName}`);
  console.log('[Agent CLI] Securing cryptographic credentials with Windows DPAPI...');

  await secureStore.setSecret('deviceId', data.deviceId);
  await secureStore.setSecret('deviceKey', data.deviceKey);
  await secureStore.setSecret('apiBaseUrl', url);

  console.log('[Agent CLI] Credentials safely stored in Windows DPAPI vault.');
  return data;
}

async function getStatus() {
  const deviceId = await secureStore.getSecret('deviceId');
  const deviceKey = await secureStore.getSecret('deviceKey');
  const apiBaseUrl = await secureStore.getSecret('apiBaseUrl') || AGENT_CONFIG.API_BASE_URL;

  console.log('--- Niyantran Employee Monitoring Agent V2 Status ---');
  console.log(`Platform:      ${process.platform} (${os.release()})`);
  console.log(`Device ID:     ${deviceId || 'NOT ENROLLED'}`);
  console.log(`Encrypted Key: ${deviceKey ? 'DPAPI PROTECTED (Present)' : 'NONE'}`);
  console.log(`API Base URL:  ${apiBaseUrl}`);
  console.log('----------------------------------------------------');
}

async function runSession(requestedSessionId, durationSeconds = 60, intervalSeconds = 10, apiBaseUrl) {
  const deviceId = await secureStore.getSecret('deviceId');
  const deviceKey = await secureStore.getSecret('deviceKey');
  const url = apiBaseUrl || await secureStore.getSecret('apiBaseUrl') || AGENT_CONFIG.API_BASE_URL;

  if (!deviceId || !deviceKey) {
    console.error('[Agent CLI] ERROR: Device not paired. Run `npm run agent:pair <code>` first.');
    process.exit(1);
  }

  let sessionId = requestedSessionId;
  // If no explicit session ID provided or temporary default, resolve or provision via backend
  if (!sessionId || sessionId.startsWith('v2_sess_cli_')) {
    try {
      const activeRes = await fetch(`${url}/sessions/active-device-session`, {
        headers: { 'x-device-id': deviceId }
      });
      if (activeRes.ok) {
        const activeData = await activeRes.json();
        if (activeData.sessionId) {
          sessionId = activeData.sessionId;
          console.log(`[Agent CLI] Bound to authorized server session: ${sessionId}`);
        }
      }
    } catch (err) {
      console.warn(`[Agent CLI] Could not connect to /active-device-session (${err.message}). Using fallback ID.`);
    }
  }

  console.log(`[Agent CLI] Starting live monitoring session: ${sessionId}`);

  const agent = new NiyantranMonitoringAgentV2({
    deviceId,
    deviceKey,
    apiBaseUrl: url,
    telemetryIntervalMs: intervalSeconds * 1000,
  });

  await agent.initialize();

  agent.on('telemetry_emitted', ({ sample, result }) => {
    console.log(`[Agent CLI] Telemetry Emitted: ${sample.apps?.length || 0} apps tracked | Primary: ${sample.activeProcessCategory} | Idle: ${sample.hardwareIdleSeconds}s | Server accepted: ${result.success}`);
    if (sample.apps && sample.apps.length > 0) {
      console.log('   Observed foreground apps:');
      sample.apps.forEach((a) => console.log(`     - ${a.name}: ${a.durationSeconds}s (${a.category})`));
    }
  });

  agent.startMonitoring(sessionId, deviceId);

  if (durationSeconds > 0) {
    console.log(`[Agent CLI] Agent active. Tracking Win32 foreground windows for ${durationSeconds} seconds...`);
    return new Promise((resolve) => {
      setTimeout(async () => {
        console.log('[Agent CLI] Measured interval completed. Flushing final telemetry...');
        await agent.flushAndSyncTelemetry();
        agent.stopMonitoring('SCHEDULED_INTERVAL_COMPLETE');
        agent.shutdown();
        console.log('[Agent CLI] Monitoring stopped.');
        resolve();
      }, durationSeconds * 1000);
    });
  } else {
    console.log('[Agent CLI] Agent active. Running continuously (press Ctrl+C to stop)...');
    return new Promise((resolve) => {
      const handleExit = async () => {
        console.log('\n[Agent CLI] Stopping agent and flushing pending telemetry...');
        await agent.flushAndSyncTelemetry();
        agent.stopMonitoring('USER_INTERRUPT');
        agent.shutdown();
        console.log('[Agent CLI] Monitoring stopped cleanly.');
        resolve();
        process.exit(0);
      };
      process.on('SIGINT', handleExit);
      process.on('SIGTERM', handleExit);
    });
  }
}

// Main CLI dispatch
async function main() {
  const command = process.argv[2];
  const url = getArg('--url', process.env.API_BASE_URL || AGENT_CONFIG.API_BASE_URL);

  try {
    if (command === 'pair') {
      const code = process.argv[3] || getArg('--code');
      if (!code) {
        console.error('Usage: node src/cli.js pair <code> [--url <apiUrl>]');
        process.exit(1);
      }
      await pairDevice(code, url);
    } else if (command === 'status') {
      await getStatus();
    } else if (command === 'run') {
      const rawSession = process.argv[3] && !process.argv[3].startsWith('--') ? process.argv[3] : null;
      const sessionId = rawSession || getArg('--sessionId') || null;
      const duration = parseInt(getArg('--duration', '60'), 10);
      const interval = parseInt(getArg('--interval', '10'), 10);
      await runSession(sessionId, duration, interval, url);
    } else {
      console.log('Niyantran Monitoring Agent V2 CLI');
      console.log('Commands:');
      console.log('  pair <pairingCode> [--url <url>]');
      console.log('  run [sessionId] [--duration <seconds>] [--interval <seconds>] [--url <url>]');
      console.log('  status');
    }
  } catch (err) {
    console.error('[Agent CLI] Fatal Error:', err.message);
    process.exit(1);
  }
}

main();
