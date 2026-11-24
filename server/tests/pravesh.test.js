const assert = require('assert');
const jwt = require('jsonwebtoken');
const express = require('express');
const http = require('http');

process.env.PRAVESH_JWT_SECRET = 'test-pravesh-secret-123';
process.env.JWT_SECRET = 'test-niyantran-secret-456';
process.env.PRAVESH_APP_SLUG = 'niyantran';

const User = require('../models/User');
const praveshRouter = require('../routes/pravesh');

function requestJson(baseUrl, path, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const url = new URL(path, baseUrl);
    const req = http.request(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => {
          raw += chunk;
        });
        res.on('end', () => {
          resolve({ status: res.statusCode, body: JSON.parse(raw) });
        });
      }
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function runTests() {
  const originalFindOne = User.findOne;
  const mockUsers = new Map([
    [
      'bhivmssu0030@outlook.com',
      {
        _id: '65f000000000000000000030',
        name: 'Namita Ramesh Mhatre',
        email: 'bhivmssu0030@outlook.com',
        role: 'User',
        department: 'dept1',
        branch: 'blackhole_mumbai',
        stillExist: 1,
      },
    ],
    [
      'bhivmssu0099@outlook.com',
      {
        _id: '65f000000000000000000099',
        name: 'Exited Student',
        email: 'bhivmssu0099@outlook.com',
        role: 'User',
        stillExist: 0,
      },
    ],
  ]);

  User.findOne = async ({ email }) => mockUsers.get(email) || null;

  const app = express();
  app.use(express.json());
  app.use('/api/pravesh', praveshRouter);

  const server = app.listen(0);
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 1. Existing BHIVMSSU account allowed & logs in
    const validToken = jwt.sign(
      { user_id: 'p1', email: 'BHIVMSSU0030@outlook.com', allowedApps: ['niyantran'], roles: ['user'] },
      process.env.PRAVESH_JWT_SECRET
    );
    const res1 = await requestJson(baseUrl, '/api/pravesh/exchange', { token: validToken });
    assert.strictEqual(res1.status, 200);
    assert.strictEqual(res1.body.success, true);
    assert.strictEqual(res1.body.user.id, '65f000000000000000000030');
    assert.strictEqual(res1.body.user.email, 'bhivmssu0030@outlook.com');

    // 2. App not in allowedApps (when PRAVESH_REQUIRE_APP_CLAIM=true) -> 403 ACCOUNT_NOT_ALLOWED
    process.env.PRAVESH_REQUIRE_APP_CLAIM = 'true';
    const disallowedAppToken = jwt.sign(
      { user_id: 'p2', email: 'BHIVMSSU0030@outlook.com', allowedApps: ['sampada'] },
      process.env.PRAVESH_JWT_SECRET
    );
    const res2 = await requestJson(baseUrl, '/api/pravesh/exchange', { token: disallowedAppToken });
    delete process.env.PRAVESH_REQUIRE_APP_CLAIM;
    assert.strictEqual(res2.status, 403);
    assert.strictEqual(res2.body.code, 'ACCOUNT_NOT_ALLOWED');

    // 3. Unsupported personal email not in Niyantran -> 403 ACCOUNT_NOT_ALLOWED
    const unsupportedEmailToken = jwt.sign(
      { user_id: 'p3', email: 'student@gmail.com', allowedApps: ['niyantran'] },
      process.env.PRAVESH_JWT_SECRET
    );
    const res3 = await requestJson(baseUrl, '/api/pravesh/exchange', { token: unsupportedEmailToken });
    assert.strictEqual(res3.status, 403);
    assert.strictEqual(res3.body.code, 'ACCOUNT_NOT_ALLOWED');

    // 4. Supported BHIVMSSU email NOT created in Niyantran yet -> 403 ACCOUNT_NOT_SUPPORTED (no auto-creation)
    const missingLocalUserToken = jwt.sign(
      { user_id: 'p4', email: 'BHIVMSSU0018@outlook.com', allowedApps: ['niyantran'] },
      process.env.PRAVESH_JWT_SECRET
    );
    const res4 = await requestJson(baseUrl, '/api/pravesh/exchange', { token: missingLocalUserToken });
    assert.strictEqual(res4.status, 403);
    assert.strictEqual(res4.body.code, 'ACCOUNT_NOT_SUPPORTED');

    // 5. Guest account -> 403 ACCOUNT_NOT_SUPPORTED
    const guestToken = jwt.sign(
      { user_id: 'p5', isGuest: true, allowedApps: ['niyantran'] },
      process.env.PRAVESH_JWT_SECRET
    );
    const res5 = await requestJson(baseUrl, '/api/pravesh/exchange', { token: guestToken });
    assert.strictEqual(res5.status, 403);
    assert.strictEqual(res5.body.code, 'ACCOUNT_NOT_SUPPORTED');

    // 6. Exited account -> 403 ACCOUNT_DEACTIVATED
    const exitedToken = jwt.sign(
      { user_id: 'p6', email: 'BHIVMSSU0099@outlook.com', allowedApps: ['niyantran'] },
      process.env.PRAVESH_JWT_SECRET
    );
    const res6 = await requestJson(baseUrl, '/api/pravesh/exchange', { token: exitedToken });
    assert.strictEqual(res6.status, 403);
    assert.strictEqual(res6.body.code, 'ACCOUNT_DEACTIVATED');

    console.log('All 6 Pravesh exchange tests passed.');
  } finally {
    User.findOne = originalFindOne;
    server.close();
  }
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
