/**
 * NIYANTRAN EMPLOYEE MONITORING V2
 * Hardware Detection & Loopback Server Unit Tests
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { detectHardwareInfo } from '../src/native/hardwareDetector.js';
import { LocalAgentServer } from '../src/server/localAgentServer.js';

test('HardwareDetector: detects Acer Nitro AN515-57 hardware metadata', async () => {
  const hw = await detectHardwareInfo();
  assert.ok(hw, 'Hardware info must be returned');
  assert.equal(hw.manufacturer, 'Acer');
  assert.equal(hw.model, 'Nitro AN515-57');
  assert.ok(hw.os, 'OS must be present');
});

test('LocalAgentServer: /status returns Acer metadata and leaseExpiresAt', async () => {
  const mockAgent = {
    lifecycle: { currentState: 'ACTIVE_MONITORING' },
    secureStore: {
      getSecret: async (key) => (key === 'deviceId' ? 'DEV-TEST-ACER' : null)
    },
    win32Monitor: {
      lastSample: {
        appName: 'Code.exe',
        category: 'ENGINEERING',
        activeSeconds: 45,
        idleSeconds: 15
      }
    },
    leaseManager: {
      leaseExpiresAt: Date.now() + 60000
    },
    hardwareInfo: {
      manufacturer: 'Acer',
      model: 'Nitro AN515-57',
      uuid: 'E77CA225-2515-EC11-80E1-088FC3199D36'
    }
  };

  const testPort = 48199;
  const server = new LocalAgentServer(mockAgent, { port: testPort });
  server.start();

  await new Promise((resolve) => setTimeout(resolve, 100));

  try {
    // 1. GET /status
    const statusData = await new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${testPort}/status`, (res) => {
        let body = '';
        res.on('data', chunk => { body += chunk; });
        res.on('end', () => {
          assert.equal(res.statusCode, 200);
          resolve(JSON.parse(body));
        });
      }).on('error', reject);
    });

    assert.equal(statusData.status, 'ok');
    assert.equal(statusData.manufacturer, 'Acer');
    assert.equal(statusData.model, 'Nitro AN515-57');
    assert.equal(statusData.deviceId, 'DEV-TEST-ACER');
    assert.equal(statusData.sessionState, 'ACTIVE_MONITORING');
    assert.equal(statusData.currentApp, 'Code.exe');
    assert.equal(statusData.currentCategory, 'ENGINEERING');
    assert.equal(statusData.activeSeconds, 45);
    assert.equal(statusData.hardwareIdleSeconds, 15);
    assert.ok(statusData.leaseExpiresAt, 'leaseExpiresAt must be populated');

    // 2. POST /open
    const openData = await new Promise((resolve, reject) => {
      const req = http.request(`http://127.0.0.1:${testPort}/open`, { method: 'POST' }, (res) => {
        let body = '';
        res.on('data', chunk => { body += chunk; });
        res.on('end', () => {
          assert.equal(res.statusCode, 200);
          resolve(JSON.parse(body));
        });
      });
      req.on('error', reject);
      req.end();
    });

    assert.equal(openData.success, true);
    assert.equal(openData.message, 'Agent opened/foregrounded');
  } finally {
    server.stop();
  }
});
