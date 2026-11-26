import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { discoverBrowserPath } from '../config.js';

function isIgnoredOptionalTelemetryUrl(url) {
  if (!url) return false;
  return (
    url.includes('localhost:8103/prana') ||
    url.includes('127.0.0.1:8103/prana')
  );
}

function getPathnameSafe(rawUrl) {
  try {
    return new URL(rawUrl).pathname;
  } catch {
    return '';
  }
}

function isUnconfiguredPravesh503Response(res) {
  return (
    res.status() === 503 &&
    res.request().method() === 'POST' &&
    getPathnameSafe(res.url()) === '/api/pravesh/exchange'
  );
}

function isIgnoredOptionalConsoleError(msg, pravesh503Tracker) {
  const text = msg.text() || '';
  const locUrl = msg.location()?.url || '';
  if (isIgnoredOptionalTelemetryUrl(locUrl) || isIgnoredOptionalTelemetryUrl(text)) {
    return true;
  }
  if (
    pravesh503Tracker.pending > 0 &&
    getPathnameSafe(locUrl) === '/api/pravesh/exchange' &&
    text.includes('Failed to load resource') &&
    text.includes('503')
  ) {
    pravesh503Tracker.pending -= 1;
    return true;
  }
  return false;
}

export async function launchBrowser(browserPath = discoverBrowserPath()) {
  if (!browserPath) {
    throw new Error(
      'No Chrome or Edge executable found. Set E2E_BROWSER_PATH to a valid browser binary.'
    );
  }

  return chromium.launch({
    executablePath: browserPath,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu'],
  });
}

export async function openTrackedSession(browser, baseUrl) {
  const baseOrigin = new URL(baseUrl).origin;
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  await context.addInitScript((apiBase) => {
    window.__EMS_API_BASE = apiBase;
  }, `${baseOrigin}/api`);
  const page = await context.newPage();

  const consoleErrors = [];
  const pageErrors = [];
  const serverErrors = [];
  const pravesh503Tracker = { pending: 0 };

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      if (isIgnoredOptionalConsoleError(msg, pravesh503Tracker)) return;
      consoleErrors.push({
        text: msg.text(),
        location: msg.location()?.url || '',
      });
    }
  });

  page.on('pageerror', (err) => {
    pageErrors.push({
      message: err?.message || String(err),
      stack: err?.stack || '',
    });
  });

  page.on('response', (res) => {
    const url = res.url();
    if (isIgnoredOptionalTelemetryUrl(url)) return;
    if (url.startsWith(baseOrigin) && isUnconfiguredPravesh503Response(res)) {
      pravesh503Tracker.pending += 1;
      return;
    }
    if (url.startsWith(baseOrigin) && res.status() >= 500) {
      serverErrors.push({
        url,
        status: res.status(),
      });
    }
  });

  return {
    context,
    page,
    baseUrl: baseOrigin,
    consoleErrors,
    pageErrors,
    serverErrors,
    clearErrors() {
      consoleErrors.length = 0;
      pageErrors.length = 0;
      serverErrors.length = 0;
    },
    async close() {
      await context.close();
    },
  };
}

export async function loginViaUi(page, baseUrl, email, password) {
  const targetUrl = `${baseUrl.replace(/\/$/, '')}/login`;
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
  await page.locator('#email').waitFor({ state: 'visible', timeout: 15000 });
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);

  await Promise.all([
    page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 }),
    page.locator('button[type="submit"]').click(),
  ]);

  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
}

export async function reloadAndVerify(page) {
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
}

export function assertNoErrors(session, contextLabel = 'browser session') {
  assert.equal(
    session.pageErrors.length,
    0,
    `${contextLabel}: unexpected uncaught pageerrors: ${JSON.stringify(session.pageErrors)}`
  );
  assert.equal(
    session.serverErrors.length,
    0,
    `${contextLabel}: unexpected HTTP >= 500 responses: ${JSON.stringify(session.serverErrors)}`
  );
  assert.equal(
    session.consoleErrors.length,
    0,
    `${contextLabel}: unexpected console errors: ${JSON.stringify(session.consoleErrors)}`
  );
}
