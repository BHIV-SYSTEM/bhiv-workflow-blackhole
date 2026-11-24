/**
 * Niyantran Employee Monitoring V2 — Preflight Service Health Checker
 * Probes ports 5000 (Backend), 5173 (Frontend), 27017 (MongoDB), and 48120 (Loopback Daemon),
 * measuring latency, service health, and formatting terminal preflight status tables.
 */

const net = require('node:net');
const config = require('../config');

// ANSI escape sequences
const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m'
};

/**
 * Probe TCP port connectivity.
 * @param {string} host
 * @param {number} port
 * @param {number} [timeoutMs=1500]
 * @returns {Promise<{ open: boolean, latencyMs: number, error: string|null }>}
 */
function probeTcp(host, port, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const start = Date.now();
    const socket = new net.Socket();
    let settled = false;

    const cleanup = () => {
      if (!settled) {
        settled = true;
        socket.destroy();
      }
    };

    socket.setTimeout(timeoutMs);

    socket.connect(port, host, () => {
      const latencyMs = Date.now() - start;
      cleanup();
      resolve({ open: true, latencyMs, error: null });
    });

    socket.on('timeout', () => {
      cleanup();
      resolve({ open: false, latencyMs: timeoutMs, error: `Connection timed out after ${timeoutMs}ms` });
    });

    socket.on('error', (err) => {
      cleanup();
      resolve({ open: false, latencyMs: Date.now() - start, error: err.message });
    });
  });
}

/**
 * Probe an HTTP endpoint.
 * @param {string} url
 * @param {number} [timeoutMs=1500]
 * @returns {Promise<{ ok: boolean, status: number, latencyMs: number, error: string|null }>}
 */
async function probeHttp(url, timeoutMs = 1500) {
  const start = Date.now();
  try {
    const res = await fetch(url, {
      method: 'GET',
      signal: AbortSignal.timeout(timeoutMs)
    });
    return {
      ok: res.ok || res.status === 404 || res.status === 401 || res.status === 403, // Server replied
      status: res.status,
      latencyMs: Date.now() - start,
      error: null
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      latencyMs: Date.now() - start,
      error: err.message
    };
  }
}

/**
 * Run preflight checks on all 4 required subsystem ports.
 * @param {Object} [options]
 * @param {boolean} [options.silent=false]
 * @returns {Promise<{ allHealthy: boolean, services: Object, results: Array }>}
 */
async function runPreflight(options = {}) {
  const silent = Boolean(options.silent);

  const probes = [
    {
      name: 'MongoDB Database',
      port: config.ports.mongodb,
      host: '127.0.0.1',
      url: config.mongoUri,
      type: 'tcp',
      required: true,
      description: 'MongoDB persistence layer'
    },
    {
      name: 'Express Backend API',
      port: config.ports.backend,
      host: '127.0.0.1',
      url: `${config.backendUrl}/api/health`,
      type: 'http',
      required: false, // Optional for isolated unit/smoke tests, required for live E2E
      description: 'Node.js Express 5.1 server'
    },
    {
      name: 'Vite Frontend Client',
      port: config.ports.frontend,
      host: '127.0.0.1',
      url: config.frontendUrl,
      type: 'http',
      required: false,
      description: 'React 19 + Vite dashboard'
    },
    {
      name: 'Desktop Agent Loopback',
      port: config.ports.loopback,
      host: '127.0.0.1',
      url: `${config.loopbackUrl}/status`,
      type: 'http',
      required: false,
      description: 'Native agent loopback daemon'
    }
  ];

  const results = [];
  const services = {};

  for (const item of probes) {
    const tcpResult = await probeTcp(item.host, item.port, config.timeouts.preflightProbeTimeout);
    let httpResult = null;
    if (tcpResult.open && item.type === 'http') {
      httpResult = await probeHttp(item.url, config.timeouts.preflightProbeTimeout);
    }

    const online = tcpResult.open;
    const latency = httpResult ? httpResult.latencyMs : tcpResult.latencyMs;
    const note = httpResult
      ? (httpResult.ok ? `HTTP ${httpResult.status} OK` : `HTTP ${httpResult.status}`)
      : (tcpResult.open ? 'Port Open' : (tcpResult.error || 'Connection refused'));

    const probeSummary = {
      name: item.name,
      port: item.port,
      host: item.host,
      target: `${item.host}:${item.port}`,
      online,
      latencyMs: latency,
      required: item.required,
      note,
      error: tcpResult.error
    };

    results.push(probeSummary);
    services[item.port] = probeSummary;
  }

  // Key service handles
  services.mongo = services[config.ports.mongodb];
  services.backend = services[config.ports.backend];
  services.frontend = services[config.ports.frontend];
  services.loopback = services[config.ports.loopback];

  const allHealthy = results.every((r) => r.online);
  const requiredHealthy = results.filter((r) => r.required).every((r) => r.online);

  if (!silent) {
    printPreflightTable(results);
  }

  return {
    allHealthy,
    requiredHealthy,
    services,
    results
  };
}

/**
 * Format and print preflight results ANSI table.
 * @param {Array} results
 */
function printPreflightTable(results) {
  console.log(`\n${ANSI.bold}${ANSI.cyan}┌──────────────────────────────┬──────────────┬──────────────┬──────────────┬──────────────────────────────┐${ANSI.reset}`);
  console.log(`${ANSI.bold}${ANSI.cyan}│${ANSI.reset} ${ANSI.bold}${'Service Name'.padEnd(28)}${ANSI.reset} ${ANSI.bold}${ANSI.cyan}│${ANSI.reset} ${ANSI.bold}${'Target'.padEnd(12)}${ANSI.reset} ${ANSI.bold}${ANSI.cyan}│${ANSI.reset} ${ANSI.bold}${'Status'.padEnd(12)}${ANSI.reset} ${ANSI.bold}${ANSI.cyan}│${ANSI.reset} ${ANSI.bold}${'Latency'.padStart(12)}${ANSI.reset} ${ANSI.bold}${ANSI.cyan}│${ANSI.reset} ${ANSI.bold}${'Note'.padEnd(28)}${ANSI.reset} ${ANSI.bold}${ANSI.cyan}│${ANSI.reset}`);
  console.log(`${ANSI.bold}${ANSI.cyan}├──────────────────────────────┼──────────────┼──────────────┼──────────────┼──────────────────────────────┤${ANSI.reset}`);

  for (const r of results) {
    const statusText = r.online
      ? `${ANSI.green}${ANSI.bold}ONLINE${ANSI.reset}      `
      : `${ANSI.red}OFFLINE${ANSI.reset}     `;
    const latencyText = r.online ? `${r.latencyMs}ms` : '-';
    const noteText = r.note.length > 28 ? `${r.note.substring(0, 25)}...` : r.note.padEnd(28);

    console.log(
      `${ANSI.bold}${ANSI.cyan}│${ANSI.reset} ` +
      `${r.name.padEnd(28)} ` +
      `${ANSI.bold}${ANSI.cyan}│${ANSI.reset} ` +
      `${r.target.padEnd(12)} ` +
      `${ANSI.bold}${ANSI.cyan}│${ANSI.reset} ` +
      `${statusText} ` +
      `${ANSI.bold}${ANSI.cyan}│${ANSI.reset} ` +
      `${latencyText.padStart(12)} ` +
      `${ANSI.bold}${ANSI.cyan}│${ANSI.reset} ` +
      `${noteText} ` +
      `${ANSI.bold}${ANSI.cyan}│${ANSI.reset}`
    );
  }

  console.log(`${ANSI.bold}${ANSI.cyan}└──────────────────────────────┴──────────────┴──────────────┴──────────────┴──────────────────────────────┘${ANSI.reset}\n`);
}

module.exports = {
  runPreflight,
  probeTcp,
  probeHttp,
  printPreflightTable
};
