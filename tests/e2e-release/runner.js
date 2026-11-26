#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import {
  JWT_SECRET,
  PARIKSHAK_API_KEY,
  PATHS,
  TANTRA_EXECUTION_KEY,
  discoverBrowserPath,
  resolvePorts,
} from './config.js';
import { startMongo } from './helpers/mongoHarness.js';
import { startParikshakMock } from './helpers/parikshakMock.js';
import { resetAndSeed } from './helpers/seedData.js';
import { startAppServer } from './helpers/appServer.js';
import { printSummaryReport, writeJsonReport } from './helpers/reporter.js';

function parseArgs(argv) {
  const opts = {
    smoke: false,
    tiers: ['tier1', 'tier2', 'tier3', 'tier4'],
    explicitTiers: false,
    features: null,
    json: false,
    buildClient: false,
    uiUrl: '',
    help: false,
  };

  for (const arg of argv) {
    if (arg === '--smoke') {
      opts.smoke = true;
    } else if (arg.startsWith('--tier=')) {
      opts.explicitTiers = true;
      const val = arg.split('=')[1].trim();
      if (val.toLowerCase() === 'all') {
        opts.tiers = ['tier1', 'tier2', 'tier3', 'tier4'];
      } else {
        opts.tiers = val
          .split(',')
          .map((t) => t.trim().replace(/^tier/i, ''))
          .filter(Boolean)
          .map((num) => `tier${num}`);
      }
    } else if (arg.startsWith('--feature=')) {
      const val = arg.split('=')[1].trim();
      opts.features = val
        .split(',')
        .map((f) => f.trim().toUpperCase())
        .filter(Boolean);
    } else if (arg === '--json') {
      opts.json = true;
    } else if (arg === '--build-client') {
      opts.buildClient = true;
    } else if (arg.startsWith('--ui-url=')) {
      opts.uiUrl = arg.slice('--ui-url='.length).trim();
    } else if (arg === '--help' || arg === '-h') {
      opts.help = true;
    }
  }

  return opts;
}

function printHelp() {
  console.log(`
Niyantran Production Release (R1-R4) — E2E Test Runner

Usage:
  node tests/e2e-release/runner.js [options]

Options:
  --smoke             Run smoke harness verification (suites/smoke.test.mjs)
  --tier=1,2,3,4      Run specified tier(s) (default: 1,2,3,4)
  --feature=F1..F10   Filter suites/tests for specific feature(s)
  --build-client      Run client production build before booting server
  --ui-url=<url>      Override UI URL (e.g. separate Vite dev server)
  --json              Print structured JSON report to stdout
  --help, -h          Show this help message
`);
}

function tierLabelFromFilename(filename) {
  const lower = filename.toLowerCase();
  if (lower.startsWith('smoke')) return 'Smoke Harness';
  if (lower.startsWith('tier1')) return 'Tier 1 (Feature Coverage)';
  if (lower.startsWith('tier2')) return 'Tier 2 (Boundary & Negative)';
  if (lower.startsWith('tier3')) return 'Tier 3 (Cross-Combinations)';
  if (lower.startsWith('tier4')) return 'Tier 4 (Acceptance Scenarios)';
  return 'Tier 1 (Feature Coverage)';
}

function discoverTestFiles(opts) {
  if (!fs.existsSync(PATHS.suitesDir)) return [];

  const allFiles = fs
    .readdirSync(PATHS.suitesDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.test.mjs'))
    .map((entry) => entry.name)
    .sort();

  const selected = [];

  for (const name of allFiles) {
    const lower = name.toLowerCase();
    if (opts.smoke && !opts.explicitTiers) {
      if (lower.startsWith('smoke')) {
        selected.push({
          filePath: path.join(PATHS.suitesDir, name),
          relativePath: `tests/e2e-release/suites/${name}`,
          tierName: 'Smoke Harness',
        });
      }
      continue;
    }

    const matchesTier = opts.tiers.some((t) => lower.startsWith(t));
    const matchesSmoke = opts.smoke && lower.startsWith('smoke');
    if (!matchesTier && !matchesSmoke) continue;

    selected.push({
      filePath: path.join(PATHS.suitesDir, name),
      relativePath: `tests/e2e-release/suites/${name}`,
      tierName: tierLabelFromFilename(name),
    });
  }

  return selected;
}

function runCommandAsync(cmd, args, cwd, quiet = false) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd,
      shell: process.platform === 'win32' && cmd.endsWith('.cmd'),
      stdio: quiet ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    });
    let stderr = '';
    if (quiet && child.stderr) {
      child.stderr.on('data', (d) => {
        stderr += d.toString('utf8');
      });
    }
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${args.join(' ')} exited with code ${code}${stderr ? `: ${stderr}` : ''}`));
    });
  });
}

function parseTapOutput(tapText, fallbackFile) {
  const tests = [];
  const lines = tapText.split(/\r?\n/);

  let current = null;
  let inYaml = false;
  let yamlLines = [];

  function flushCurrent() {
    if (!current) return;
    if (yamlLines.length > 0) {
      let collectingErrorBlock = false;
      const errorBlockLines = [];
      for (const yLine of yamlLines) {
        const durMatch = yLine.match(/duration_ms:\s*([\d.]+)/);
        if (durMatch) current.durationMs = parseFloat(durMatch[1]);
        const locMatch = yLine.match(/location:\s*'(.+?):\d+:\d+'/);
        if (locMatch) current.file = locMatch[1];
        const fileMatch = yLine.match(/file:\s*'(.+)'/);
        if (fileMatch) current.file = fileMatch[1];

        if (!current.passed && !current.skipped) {
          if (/^\s*error:\s*\|-?\s*$/.test(yLine)) {
            collectingErrorBlock = true;
            continue;
          }
          if (collectingErrorBlock) {
            if (/^\s{4}[a-zA-Z0-9_]+:/.test(yLine) || /^\s{2}[a-zA-Z0-9_]+:/.test(yLine) && !/^\s{4,}/.test(yLine)) {
              collectingErrorBlock = false;
            } else {
              errorBlockLines.push(yLine.trim());
              continue;
            }
          }
          if (/^\s*(error|message|failure):\s*(.+)$/.test(yLine)) {
            const m = yLine.match(/^\s*(?:error|message|failure):\s*(.+)$/);
            if (m && m[1] !== '|-' && m[1] !== '|') {
              errorBlockLines.push(m[1].replace(/^['"]|['"]$/g, '').trim());
            }
          }
        }
      }
      if (!current.passed && !current.skipped && errorBlockLines.length > 0) {
        current.error = errorBlockLines.join(' ');
      }
    }
    if (!current.file) current.file = fallbackFile.relativePath;
    tests.push(current);
    current = null;
    yamlLines = [];
    inYaml = false;
  }

  for (const rawLine of lines) {
    // Only parse top-level test assertions or leaf indented tests, skipping suite/describe wrappers
    const topMatch = rawLine.match(/^(ok|not ok)\s+(\d+)\s+-\s+(.+)$/);
    const subMatch = rawLine.match(/^ {4}(ok|not ok)\s+(\d+)\s+-\s+(.+)$/);

    if (topMatch || subMatch) {
      flushCurrent();
      const match = subMatch || topMatch;
      const isSub = Boolean(subMatch);
      const status = match[1];
      let name = match[3].trim();
      let skipped = false;

      if (name.includes('# SKIP')) {
        skipped = true;
        name = name.replace(/#\s*SKIP.*/i, '').trim();
      } else if (name.includes('# TODO')) {
        skipped = true;
        name = name.replace(/#\s*TODO.*/i, '').trim();
      }

      const featureMatches = name.match(/\bF(?:10|[1-9])\b/g) || [];
      const features = [...new Set(featureMatches)];

      current = {
        name,
        passed: status === 'ok' && !skipped,
        skipped,
        isSub,
        durationMs: 0,
        file: fallbackFile.relativePath,
        tierName: fallbackFile.tierName,
        features,
        error: status === 'ok' || skipped ? null : 'Test failed',
      };
      inYaml = false;
      yamlLines = [];
      continue;
    }

    const trimmed = rawLine.trim();
    if (trimmed === '---') {
      inYaml = true;
      continue;
    }
    if (trimmed === '...') {
      inYaml = false;
      continue;
    }
    if (inYaml) {
      yamlLines.push(rawLine);
    }
  }

  flushCurrent();

  // If subtests were emitted (e.g. describe blocks), filter out container suite entries that wrap them
  const hasSubtests = tests.some((t) => t.isSub);
  const filtered = hasSubtests
    ? tests.filter((t, idx) => t.isSub || !tests.slice(0, idx).some((prev) => prev.isSub))
    : tests;

  return filtered.map(({ isSub, ...rest }) => rest);
}

function executeSingleSuite(testFile, sharedEnv, testNamePattern) {
  return new Promise((resolve) => {
    const args = ['--test', '--test-concurrency=1', '--test-reporter=tap'];
    if (testNamePattern) {
      args.push('--test-name-pattern', testNamePattern);
    }
    args.push(testFile.filePath);

    const start = Date.now();
    const child = spawn(process.execPath, args, {
      cwd: PATHS.root,
      env: { ...process.env, ...sharedEnv },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => {
      stdout += d.toString('utf8');
    });
    child.stderr.on('data', (d) => {
      stderr += d.toString('utf8');
    });

    child.on('close', (code) => {
      const durationMs = Date.now() - start;
      let parsed = parseTapOutput(stdout, testFile);

      if (parsed.length === 0 && code !== 0) {
        parsed = [
          {
            name: `${path.basename(testFile.filePath)} (suite execution)`,
            passed: false,
            skipped: false,
            durationMs,
            file: testFile.relativePath,
            tierName: testFile.tierName,
            features: [],
            error: (stderr || stdout || `Exited with code ${code}`).trim(),
          },
        ];
      }

      resolve({
        exitCode: code,
        durationMs,
        tests: parsed,
        rawTap: stdout,
        rawStderr: stderr,
      });
    });
  });
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    printHelp();
    process.exit(0);
  }

  const log = (...args) => {
    if (!opts.json) console.log(...args);
  };

  if (opts.buildClient) {
    log('Building client production bundle...');
    await runCommandAsync('npm.cmd', ['--prefix', PATHS.clientDir, 'run', 'build'], PATHS.root, opts.json);
  }

  const testFiles = discoverTestFiles(opts);
  if (testFiles.length === 0) {
    const emptyReport = {
      timestamp: new Date().toISOString(),
      summary: { total: 0, passed: 0, failed: 0, skipped: 0, durationMs: 0 },
      tierBreakdown: {},
      featureMatrix: {},
      failures: [],
      tests: [],
    };
    writeJsonReport(emptyReport);
    if (opts.json) {
      console.log(JSON.stringify(emptyReport, null, 2));
    } else {
      console.log('No test files discovered for selected options.');
    }
    process.exit(0);
  }

  let mongo = null;
  let parikshak = null;
  let appServer = null;

  const cleanup = async () => {
    if (appServer) {
      await appServer.stop().catch(() => {});
      appServer = null;
    }
    if (parikshak) {
      await parikshak.stop().catch(() => {});
      parikshak = null;
    }
    if (mongo) {
      await mongo.stop().catch(() => {});
      mongo = null;
    }
  };

  const onSignal = async () => {
    await cleanup();
    process.exit(130);
  };
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);

  const executionStart = Date.now();

  try {
    const { apiPort, parikshakPort } = await resolvePorts();
    log(`Starting ephemeral MongoDB...`);
    mongo = await startMongo();

    log(`Starting Parikshak mock on 127.0.0.1:${parikshakPort}...`);
    parikshak = await startParikshakMock(parikshakPort);

    log(`Seeding initial MongoDB fixtures...`);
    await resetAndSeed(mongo.uri);

    log(`Booting Niyantran server on 127.0.0.1:${apiPort}...`);
    appServer = await startAppServer({
      port: apiPort,
      mongoUri: mongo.uri,
      parikshakUrl: parikshak.url,
      jwtSecret: JWT_SECRET,
      tantraExecutionKey: TANTRA_EXECUTION_KEY,
      parikshakApiKey: PARIKSHAK_API_KEY,
      uiUrl: opts.uiUrl,
    });
    await appServer.waitForReady();
    log(`Server ready & DB-backed auth verified at ${appServer.baseUrl}`);

    const browserPath = discoverBrowserPath();
    const sharedEnv = {
      E2E_API_URL: appServer.baseUrl,
      E2E_UI_URL: appServer.uiUrl,
      E2E_MONGO_URI: mongo.uri,
      E2E_PARIKSHAK_URL: parikshak.url,
      E2E_JWT_SECRET: JWT_SECRET,
      E2E_TANTRA_EXECUTION_KEY: TANTRA_EXECUTION_KEY,
      E2E_PARIKSHAK_API_KEY: PARIKSHAK_API_KEY,
      E2E_BROWSER_PATH: browserPath || '',
      E2E_FEATURE_FILTER: opts.features ? opts.features.join(',') : '',
    };

    const testNamePattern = opts.features
      ? `(${opts.features.join('|')})`
      : null;

    const allTests = [];
    for (const tf of testFiles) {
      log(`Running ${tf.relativePath}...`);
      const res = await runSuiteAndCollect(tf, sharedEnv, testNamePattern);
      allTests.push(...res.tests);
    }

    const tierStats = {
      'Smoke Harness': { total: 0, passed: 0, failed: 0, skipped: 0, durationMs: 0 },
      'Tier 1 (Feature Coverage)': { total: 0, passed: 0, failed: 0, skipped: 0, durationMs: 0 },
      'Tier 2 (Boundary & Negative)': { total: 0, passed: 0, failed: 0, skipped: 0, durationMs: 0 },
      'Tier 3 (Cross-Combinations)': { total: 0, passed: 0, failed: 0, skipped: 0, durationMs: 0 },
      'Tier 4 (Acceptance Scenarios)': { total: 0, passed: 0, failed: 0, skipped: 0, durationMs: 0 },
    };

    const featureStats = {};
    for (let i = 1; i <= 10; i++) {
      featureStats[`F${i}`] = { total: 0, passed: 0, failed: 0, skipped: 0 };
    }

    const failures = [];
    let total = 0;
    let passed = 0;
    let failed = 0;
    let skipped = 0;

    for (const t of allTests) {
      total++;
      const tStat = tierStats[t.tierName] || tierStats['Tier 1 (Feature Coverage)'];
      tStat.total++;
      tStat.durationMs += t.durationMs || 0;

      if (t.skipped) {
        skipped++;
        tStat.skipped++;
      } else if (t.passed) {
        passed++;
        tStat.passed++;
      } else {
        failed++;
        tStat.failed++;
        failures.push({
          name: t.name,
          file: t.file,
          error: t.error || 'Assertion failed',
        });
      }

      for (const fKey of t.features || []) {
        if (featureStats[fKey]) {
          featureStats[fKey].total++;
          if (t.skipped) featureStats[fKey].skipped++;
          else if (t.passed) featureStats[fKey].passed++;
          else featureStats[fKey].failed++;
        }
      }
    }

    const grandSummary = {
      total,
      passed,
      failed,
      skipped,
      durationMs: Date.now() - executionStart,
    };

    const reportData = {
      timestamp: new Date().toISOString(),
      environment: {
        nodeVersion: process.version,
        platform: process.platform,
        apiUrl: appServer.baseUrl,
        uiUrl: appServer.uiUrl,
        parikshakUrl: parikshak.url,
        browserPath,
      },
      summary: grandSummary,
      tierBreakdown: tierStats,
      featureMatrix: featureStats,
      failures,
      tests: allTests,
    };

    const reportPath = writeJsonReport(reportData);

    if (opts.json) {
      console.log(JSON.stringify(reportData, null, 2));
    } else {
      printSummaryReport({
        tierStats,
        featureStats,
        failures,
        grandSummary,
        reportPath,
      });
    }

    await cleanup();
    process.exit(failed > 0 ? 1 : 0);
  } catch (err) {
    await cleanup();
    if (opts.json) {
      console.log(
        JSON.stringify(
          {
            timestamp: new Date().toISOString(),
            fatalError: err?.message || String(err),
            summary: { total: 0, passed: 0, failed: 1, skipped: 0, durationMs: Date.now() - executionStart },
          },
          null,
          2
        )
      );
    } else {
      console.error('Fatal E2E Runner Error:', err);
    }
    process.exit(2);
  }
}

async function runSuiteAndCollect(tf, sharedEnv, testNamePattern) {
  return executeSingleSuite(tf, sharedEnv, testNamePattern);
}

main();
