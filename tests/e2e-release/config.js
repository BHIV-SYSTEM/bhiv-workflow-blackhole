import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../..');

export const PATHS = {
  root: ROOT_DIR,
  serverDir: path.join(ROOT_DIR, 'server'),
  clientDir: path.join(ROOT_DIR, 'client'),
  clientDistDir: path.join(ROOT_DIR, 'client', 'dist'),
  e2eDir: __dirname,
  suitesDir: path.join(__dirname, 'suites'),
  reportsDir: path.join(__dirname, 'reports'),
};

export const TENANT_ID = 'ten-bhiv-core';
export const ORGANIZATION = 'BHIV';
export const BRANCH = 'blackhole_mumbai';

export const JWT_SECRET =
  process.env.E2E_JWT_SECRET ||
  'e2e_niyantran_jwt_secret_0123456789abcdef0123456789abcdef';
export const TANTRA_EXECUTION_KEY =
  process.env.E2E_TANTRA_EXECUTION_KEY ||
  'e2e_tantra_exec_key_0123456789abcdef0123456789abcdef';
export const PARIKSHAK_API_KEY =
  process.env.E2E_PARIKSHAK_API_KEY ||
  'bhiv_live_niyantran_prod_key_77a9c2b4e8';

export const STANDARD_PRODUCTS = [
  'BHIV',
  'NIYANTRAN',
  'PARIKSHAK',
  'TRINETRA',
  'TANTRA',
  'VAJRA',
  'SAMVAD',
  'UNIGURU',
  'DRISHTI',
  'PRAVESH',
];

export const FEATURES = {
  F1: 'Non-blocking backend submission + invokeParikshak',
  F2: 'Submission context warning pop-up & revision flow',
  F3: 'Product & task_id propagation in task creation/ingestion',
  F4: 'Remove Knowledge approval backend & Parikshak sync',
  F5: 'Direct Knowledge user CRUD UI & deep-link params',
  F6: 'JWT & User identity resolution (zero EMP-BHIV-USR collision)',
  F7: 'Compliance join & admin employee CRUD API',
  F8: 'Restored & complete All Members Directory UI',
  F9: 'Backend Task/Product/User projections',
  F10: 'Inline Task/Product ID, Name, User Details & Quick-Access Pop-up',
};

export const DEFAULT_BROWSER_CANDIDATES = [
  process.env.E2E_BROWSER_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean);

export function discoverBrowserPath() {
  for (const candidate of DEFAULT_BROWSER_CANDIDATES) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

export function getFreePort(host = '127.0.0.1') {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, host, () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : null;
      server.close((closeErr) => {
        if (closeErr) reject(closeErr);
        else resolve(port);
      });
    });
  });
}

export async function resolvePorts() {
  const apiPort = process.env.E2E_API_PORT
    ? Number(process.env.E2E_API_PORT)
    : await getFreePort();
  const parikshakPort = process.env.E2E_PARIKSHAK_PORT
    ? Number(process.env.E2E_PARIKSHAK_PORT)
    : await getFreePort();

  return { apiPort, parikshakPort };
}

export function getRuntimeConfig() {
  return {
    apiUrl: process.env.E2E_API_URL || '',
    uiUrl: process.env.E2E_UI_URL || '',
    mongoUri: process.env.E2E_MONGO_URI || '',
    parikshakUrl: process.env.E2E_PARIKSHAK_URL || '',
    jwtSecret: JWT_SECRET,
    tantraExecutionKey: TANTRA_EXECUTION_KEY,
    parikshakApiKey: PARIKSHAK_API_KEY,
    browserPath: discoverBrowserPath(),
    tenantId: TENANT_ID,
    organization: ORGANIZATION,
    branch: BRANCH,
  };
}
