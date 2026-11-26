import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, execFile } from 'node:child_process';
import {
  PATHS,
  JWT_SECRET,
  TANTRA_EXECUTION_KEY,
  PARIKSHAK_API_KEY,
} from '../config.js';
import { SEED_PASSWORD, SEED_USERS } from './seedData.js';

const OMITTED_ENV_PREFIXES = ['EMAIL_', 'CLOUDINARY_'];
const OMITTED_ENV_KEYS = new Set(['BUCKET_BASE_URL', 'BUCKET_URL']);

function generateValidVapidKeys() {
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();
  return {
    publicKey: ecdh.getPublicKey().toString('base64url'),
    privateKey: ecdh.getPrivateKey().toString('base64url'),
  };
}

function buildIsolatedServerEnv({
  port,
  mongoUri,
  parikshakUrl,
  jwtSecret,
  tantraExecutionKey,
  parikshakApiKey,
  uiUrl,
}) {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (OMITTED_ENV_KEYS.has(k)) continue;
    if (OMITTED_ENV_PREFIXES.some((prefix) => k.startsWith(prefix))) continue;
    env[k] = v;
  }

  const originList = [
    `http://127.0.0.1:${port}`,
    `http://localhost:${port}`,
  ];
  if (uiUrl) {
    originList.push(uiUrl.replace(/\/$/, ''));
  }

  const normalizedParikshakUrl = parikshakUrl
    .replace(/\/parikshak\/review\/?$/i, '')
    .replace(/\/$/, '');

  const vapid = generateValidVapidKeys();

  return {
    ...env,
    NODE_ENV: 'test',
    PORT: String(port),
    MONGODB_URI: mongoUri,
    JWT_SECRET: jwtSecret,
    TANTRA_EXECUTION_KEY: tantraExecutionKey,
    FRONTEND_URL: (uiUrl || `http://127.0.0.1:${port}`).replace(/\/$/, ''),
    CORS_ORIGIN: [...new Set(originList)].join(','),
    PARIKSHAK_URL: normalizedParikshakUrl,
    PARIKSHAK_API_KEY: parikshakApiKey,
    PARIKSHAK_TIMEOUT_MS: '5000',
    PRAVESH_JWT_SECRET: '',
    GEMINI_API_KEY: 'e2e_dummy_gemini_key',
    VAPID_PUBLIC_KEY: vapid.publicKey,
    VAPID_PRIVATE_KEY: vapid.privateKey,
  };
}

function killProcessTreeWindows(pid) {
  return new Promise((resolve) => {
    execFile('taskkill', ['/PID', String(pid), '/T', '/F'], () => resolve());
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Spawns the isolated Niyantran Express server (server/index.js) and waits
 * for both HTTP /api/ping and real MongoDB-backed /api/auth/login readiness.
 */
export async function startAppServer({
  port,
  mongoUri,
  parikshakUrl,
  jwtSecret = JWT_SECRET,
  tantraExecutionKey = TANTRA_EXECUTION_KEY,
  parikshakApiKey = PARIKSHAK_API_KEY,
  uiUrl = '',
  readyTimeoutMs = 30000,
}) {
  const serverNodeModules = path.join(PATHS.serverDir, 'node_modules');
  if (!fs.existsSync(serverNodeModules)) {
    throw new Error(
      `Missing ${serverNodeModules}. Install server dependencies before starting app server.`
    );
  }

  const env = buildIsolatedServerEnv({
    port,
    mongoUri,
    parikshakUrl,
    jwtSecret,
    tantraExecutionKey,
    parikshakApiKey,
    uiUrl,
  });

  const logs = { stdout: [], stderr: [] };
  let exitInfo = null;

  const child = spawn(process.execPath, ['index.js'], {
    cwd: PATHS.serverDir,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout.on('data', (chunk) => {
    logs.stdout.push(chunk.toString('utf8'));
  });
  child.stderr.on('data', (chunk) => {
    logs.stderr.push(chunk.toString('utf8'));
  });
  child.on('exit', (code, signal) => {
    exitInfo = { code, signal };
  });

  const baseUrl = `http://127.0.0.1:${port}`;
  const effectiveUiUrl = (uiUrl || baseUrl).replace(/\/$/, '');

  async function waitForReady() {
    const deadline = Date.now() + readyTimeoutMs;
    let lastError = 'Server did not respond in time';

    // 1. Wait for GET /api/ping
    while (Date.now() < deadline) {
      if (exitInfo) {
        throw new Error(
          `Server exited prematurely (code=${exitInfo.code}, signal=${exitInfo.signal}).\nSTDOUT:\n${logs.stdout.join('')}\nSTDERR:\n${logs.stderr.join('')}`
        );
      }

      try {
        const res = await fetch(`${baseUrl}/api/ping`, {
          signal: AbortSignal.timeout(2000),
        });
        if (res.ok) {
          const data = await res.json().catch(() => null);
          if (data?.message === 'Pong!') {
            break;
          }
        }
        lastError = `/api/ping returned HTTP ${res.status}`;
      } catch (err) {
        lastError = err?.message || 'ping failed';
      }
      await sleep(250);
    }

    if (Date.now() >= deadline) {
      throw new Error(
        `Timed out waiting for /api/ping (${lastError}).\nSTDOUT:\n${logs.stdout.join('')}\nSTDERR:\n${logs.stderr.join('')}`
      );
    }

    // 2. Verify real MongoDB connectivity via DB-backed /api/auth/login
    // Catches server/index.js's MongoDB failure bypass trap.
    while (Date.now() < deadline) {
      if (exitInfo) {
        throw new Error(
          `Server exited during DB check (code=${exitInfo.code}, signal=${exitInfo.signal}).\nSTDERR:\n${logs.stderr.join('')}`
        );
      }
      try {
        const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: SEED_USERS.admin.email,
            password: SEED_PASSWORD,
          }),
          signal: AbortSignal.timeout(3000),
        });
        if (loginRes.ok) {
          const loginData = await loginRes.json().catch(() => null);
          if (loginData?.token) {
            return;
          }
        }
        lastError = `DB-backed login check returned HTTP ${loginRes.status}`;
      } catch (err) {
        lastError = err?.message || 'login check failed';
      }
      await sleep(300);
    }

    throw new Error(
      `Server bound port ${port} but DB-backed login check failed (${lastError}).\nSTDOUT:\n${logs.stdout.join('')}\nSTDERR:\n${logs.stderr.join('')}`
    );
  }

  let stopped = false;

  async function stop() {
    if (stopped) return;
    stopped = true;
    if (exitInfo || child.killed) return;

    const pid = child.pid;
    const closedPromise = new Promise((resolve) => {
      child.once('exit', () => resolve(true));
    });

    try {
      child.kill('SIGTERM');
    } catch {
      // ignore
    }

    const exitedCleanly = await Promise.race([
      closedPromise,
      sleep(3000).then(() => false),
    ]);

    if (!exitedCleanly && pid) {
      if (process.platform === 'win32') {
        await killProcessTreeWindows(pid);
      } else {
        try {
          child.kill('SIGKILL');
        } catch {
          // ignore
        }
      }
      await Promise.race([closedPromise, sleep(1500)]);
    }
  }

  return {
    child,
    port,
    baseUrl,
    apiUrl: `${baseUrl}/api`,
    uiUrl: effectiveUiUrl,
    waitForReady,
    stop,
    getLogs() {
      return {
        stdout: logs.stdout.join(''),
        stderr: logs.stderr.join(''),
      };
    },
  };
}
