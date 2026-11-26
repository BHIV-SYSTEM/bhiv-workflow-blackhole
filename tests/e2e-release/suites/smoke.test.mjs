import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { getRuntimeConfig } from '../config.js';
import {
  apiRequest,
  getMockRequests,
  loginApi,
  resetMock,
  setMockMode,
} from '../helpers/apiClient.js';
import {
  assertNoErrors,
  launchBrowser,
  loginViaUi,
  openTrackedSession,
  reloadAndVerify,
} from '../helpers/browserHelper.js';
import {
  SEED_PASSWORD,
  SEED_USERS,
  getDbSnapshot,
  resetAndSeed,
} from '../helpers/seedData.js';

const cfg = getRuntimeConfig();
let browser = null;

before(async () => {
  assert.ok(cfg.apiUrl, 'E2E_API_URL must be provided by runner');
  assert.ok(cfg.uiUrl, 'E2E_UI_URL must be provided by runner');
  assert.ok(cfg.mongoUri, 'E2E_MONGO_URI must be provided by runner');
  assert.ok(cfg.parikshakUrl, 'E2E_PARIKSHAK_URL must be provided by runner');
  browser = await launchBrowser(cfg.browserPath);
});

after(async () => {
  if (browser) {
    await browser.close();
  }
});

test('smoke: GET /api/ping responds with Pong!', async () => {
  const res = await apiRequest(cfg.apiUrl, '/api/ping');
  assert.equal(res.status, 200);
  assert.equal(res.data?.message, 'Pong!');
});

test('smoke: resetAndSeed() persists expected departments, users, legacy contexts, and tasks in MongoDB', async () => {
  await resetAndSeed(cfg.mongoUri);
  const snap = await getDbSnapshot(cfg.mongoUri);

  assert.equal(snap.departments.length, 2);
  assert.equal(snap.users.length, 6);
  assert.equal(snap.productcontexts.length, 2);
  assert.equal(snap.tasks.length, 4);

  const pendingCtx = snap.productcontexts.find((c) => c.productId === 'NIYANTRAN');
  const rejectedCtx = snap.productcontexts.find((c) => c.productId === 'PARIKSHAK');
  assert.equal(pendingCtx?.status, 'PENDING_APPROVAL');
  assert.equal(rejectedCtx?.status, 'REJECTED');
  assert.equal(rejectedCtx?.rejectionReason, 'Legacy rejection');

  const noProdTask = snap.tasks.find((t) => t.title === 'Internal Process Documentation');
  assert.equal(noProdTask?.product, null);
  assert.equal(noProdTask?.task_id, undefined);
});

test('smoke: real DB-backed POST /api/auth/login succeeds for admin and emp1', async () => {
  const adminRes = await loginApi(
    cfg.apiUrl,
    SEED_USERS.admin.email,
    SEED_PASSWORD
  );
  assert.equal(adminRes.status, 200);
  assert.ok(adminRes.token);
  assert.equal(adminRes.user?.role, 'Admin');
  assert.equal(adminRes.user?.email, SEED_USERS.admin.email);

  const empRes = await loginApi(
    cfg.apiUrl,
    SEED_USERS.emp1.email,
    SEED_PASSWORD
  );
  assert.equal(empRes.status, 200);
  assert.ok(empRes.token);
  assert.equal(empRes.user?.role, 'User');
  assert.equal(empRes.user?.email, SEED_USERS.emp1.email);
});

test('smoke: Parikshak mock records requests, supports mode toggle/reset, and integrates with /api/submissions/parikshak-status', async () => {
  await resetMock(cfg.parikshakUrl);

  const healthRes = await apiRequest(cfg.parikshakUrl, '/health');
  assert.equal(healthRes.status, 200);
  assert.equal(healthRes.data?.status, 'healthy');

  const productsRes = await apiRequest(
    cfg.parikshakUrl,
    '/api/v1/knowledge/products'
  );
  assert.equal(productsRes.status, 404);

  // Verify live Niyantran server sees Parikshak mock as ONLINE
  const { token } = await loginApi(
    cfg.apiUrl,
    SEED_USERS.emp1.email,
    SEED_PASSWORD
  );
  const statusRes = await apiRequest(
    cfg.apiUrl,
    '/api/submissions/parikshak-status',
    { token }
  );
  assert.equal(statusRes.status, 200);
  assert.equal(statusRes.data?.status, 'ONLINE');

  // Direct mock recording + mode toggling
  const ingestRes = await apiRequest(
    cfg.parikshakUrl,
    '/api/v1/knowledge/ingest',
    {
      method: 'POST',
      body: { product_id: 'NIYANTRAN', content: 'Smoke context' },
    }
  );
  assert.equal(ingestRes.status, 200);
  assert.equal(ingestRes.data?.status, 'SUCCESS');

  const withdrawRes = await apiRequest(
    cfg.parikshakUrl,
    '/api/v1/knowledge/withdraw',
    {
      method: 'POST',
      body: { product_id: 'NIYANTRAN', context_id: 'CTX-1' },
    }
  );
  assert.equal(withdrawRes.status, 200);
  assert.equal(withdrawRes.data?.status, 'SUCCESS');

  await setMockMode(cfg.parikshakUrl, {
    reviewMode: 'FAIL',
    failReason: 'Smoke test forced fail',
  });
  const failReview = await apiRequest(cfg.parikshakUrl, '/parikshak/review', {
    method: 'POST',
    body: { task_id: 'T-NIY-101' },
  });
  assert.equal(failReview.status, 200);
  assert.equal(failReview.data?.status, 'FAIL');
  assert.equal(failReview.data?.reason, 'Smoke test forced fail');

  const recorded = await getMockRequests(cfg.parikshakUrl);
  assert.equal(recorded.length, 3);
  assert.deepEqual(
    recorded.map((r) => r.path),
    [
      '/api/v1/knowledge/ingest',
      '/api/v1/knowledge/withdraw',
      '/parikshak/review',
    ]
  );

  await resetMock(cfg.parikshakUrl);
  const afterReset = await getMockRequests(cfg.parikshakUrl);
  assert.equal(afterReset.length, 0);
});

test('smoke: headless browser UI login and reload for emp1 (/userdashboard) with zero errors', async () => {
  const session = await openTrackedSession(browser, cfg.uiUrl);
  try {
    await loginViaUi(
      session.page,
      cfg.uiUrl,
      SEED_USERS.emp1.email,
      SEED_PASSWORD
    );
    assert.ok(
      session.page.url().includes('/userdashboard'),
      `Expected /userdashboard after emp1 login, got ${session.page.url()}`
    );

    await reloadAndVerify(session.page);
    assert.ok(
      session.page.url().includes('/userdashboard'),
      `Expected /userdashboard after reload, got ${session.page.url()}`
    );

    assertNoErrors(session, 'emp1 /userdashboard');
  } finally {
    await session.close();
  }
});

test('smoke: headless browser UI login and reload for admin (/dashboard) with zero errors', async () => {
  const session = await openTrackedSession(browser, cfg.uiUrl);
  try {
    await loginViaUi(
      session.page,
      cfg.uiUrl,
      SEED_USERS.admin.email,
      SEED_PASSWORD
    );
    assert.ok(
      session.page.url().includes('/dashboard'),
      `Expected /dashboard after admin login, got ${session.page.url()}`
    );

    await reloadAndVerify(session.page);
    assert.ok(
      session.page.url().includes('/dashboard'),
      `Expected /dashboard after reload, got ${session.page.url()}`
    );

    assertNoErrors(session, 'admin /dashboard');
  } finally {
    await session.close();
  }
});
