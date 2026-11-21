#!/usr/bin/env node
/**
 * Niyantran Employee Monitoring V2 — Canonical E2E Test Runner Entrypoint
 * Supports:
 *   node tests/e2e/runner.js
 *   node tests/e2e/runner.js --tier=1,2,3,4
 *   node tests/e2e/runner.js --feature=F1..F16
 *   node tests/e2e/runner.js --preflight-only
 *   node tests/e2e/runner.js --strict-preflight
 *
 * Exit codes:
 *   0: All executed tests passed (or preflight succeeded in preflight-only mode)
 *   1: One or more tests failed
 *   2: Preflight health check failed or configuration error
 */

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const config = require('./config');
const { runPreflight } = require('./helpers/preflight');
const Reporter = require('./helpers/reporter');

// ANSI helper
const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m'
};

/**
 * Parse CLI command-line arguments.
 * @param {string[]} args
 */
function parseArgs(args) {
  const options = {
    preflightOnly: false,
    strictPreflight: false,
    tiers: ['tier1', 'tier2', 'tier3', 'tier4'],
    features: null,
    json: false,
    help: false
  };

  for (const arg of args) {
    if (arg === '--preflight-only') {
      options.preflightOnly = true;
    } else if (arg === '--strict-preflight') {
      options.strictPreflight = true;
    } else if (arg.startsWith('--tier=')) {
      const val = arg.split('=')[1].trim();
      if (val.toLowerCase() !== 'all') {
        const selected = val.split(',').map((t) => {
          const num = t.trim().replace(/^tier/i, '');
          return `tier${num}`;
        });
        options.tiers = selected;
      } else {
        options.tiers = ['tier1', 'tier2', 'tier3', 'tier4', 'tier5'];
      }
    } else if (arg.startsWith('--feature=')) {
      const val = arg.split('=')[1].trim();
      options.features = val.split(',').map((f) => f.trim().toUpperCase());
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    }
  }

  return options;
}

/**
 * Print CLI help documentation.
 */
function printHelp() {
  console.log(`
${ANSI.bold}Niyantran Employee Monitoring V2 — E2E Test Runner${ANSI.reset}

${ANSI.bold}Usage:${ANSI.reset}
  node tests/e2e/runner.js [options]
  npm run test:e2e -- [options]

${ANSI.bold}Options:${ANSI.reset}
  --tier=1,2,3,4        Run tests for specified tier(s) (comma-separated, default: all)
  --feature=F1..F16     Filter tests matching specific feature(s) (e.g. --feature=F1,F4)
  --preflight-only      Check service ports (5000, 5173, 27017, 48120) and exit
  --strict-preflight    Require MongoDB and core services to be healthy before executing
  --json                Output summary report in JSON
  --help, -h            Show this help message

${ANSI.bold}Exit Codes:${ANSI.reset}
  0  All executed tests passed (or preflight succeeded in --preflight-only mode)
  1  One or more tests failed
  2  Preflight check failed or configuration error
`);
}

/**
 * Discover test files in the specified tier directories.
 * @param {string[]} targetTiers
 * @param {string[]|null} targetFeatures
 * @returns {Array<{ filePath: string, tierName: string, relativePath: string }>}
 */
function discoverTestFiles(targetTiers, targetFeatures) {
  const discovered = [];
  const baseDir = path.resolve(__dirname);

  // Check smoke tests in root tests/e2e directory when tier 1 is included
  if (targetTiers.includes('tier1')) {
    const rootFiles = fs.readdirSync(baseDir, { withFileTypes: true });
    for (const entry of rootFiles) {
      if (entry.isFile() && entry.name.endsWith('.test.js')) {
        // If feature filter is active, check if filename or smoke matches
        if (targetFeatures && targetFeatures.length > 0) {
          const upperName = entry.name.toUpperCase();
          const matches = targetFeatures.some((f) => upperName.includes(f));
          if (!matches && !upperName.includes('SMOKE')) continue;
        }

        const fullPath = path.join(baseDir, entry.name);
        discovered.push({
          filePath: fullPath,
          tierName: 'Tier 1 (Feature Coverage)',
          relativePath: `tests/e2e/${entry.name}`
        });
      }
    }
  }

  const tierMap = {
    tier1: 'Tier 1 (Feature Coverage)',
    tier2: 'Tier 2 (Boundary & Negative)',
    tier3: 'Tier 3 (Cross-Combinations)',
    tier4: 'Tier 4 (Acceptance Scenarios)',
    tier5: 'Tier 5 (Adversarial Stress Testing)'
  };

  for (const tierKey of targetTiers) {
    const tierDir = path.join(baseDir, tierKey);
    if (!fs.existsSync(tierDir)) continue;

    const files = fs.readdirSync(tierDir, { withFileTypes: true });
    for (const file of files) {
      if (!file.isFile() || !file.name.endsWith('.test.js')) continue;

      // Filter by feature if specified
      if (targetFeatures && targetFeatures.length > 0) {
        const matchesFeature = targetFeatures.some((feat) => {
          const upperName = file.name.toUpperCase();
          return upperName.startsWith(`${feat}.`) ||
            upperName.includes(`.${feat}.`) ||
            upperName.includes(`_${feat}_`) ||
            upperName.includes(`-${feat}-`) ||
            upperName.includes(`[${feat}]`);
        });
        if (!matchesFeature) continue;
      }

      discovered.push({
        filePath: path.join(tierDir, file.name),
        tierName: tierMap[tierKey] || 'Tier 1 (Feature Coverage)',
        relativePath: `tests/e2e/${tierKey}/${file.name}`
      });
    }
  }

  return discovered;
}

function buildTestIndex(testFiles) {
  const index = new Map();
  const testRegex = /(?:test|it)\s*\(\s*(['"`])((?:\\.|(?!\1).)*)\1/g;
  for (const tf of testFiles) {
    try {
      const content = fs.readFileSync(tf.filePath, 'utf8');
      let m;
      while ((m = testRegex.exec(content)) !== null) {
        index.set(m[2].trim(), {
          file: tf.relativePath,
          tierName: tf.tierName
        });
      }
    } catch (_) {}
  }
  return index;
}

/**
 * Run a batch of test files using Node 24 native test runner in TAP mode.
 * @param {Array<{ filePath: string, tierName: string, relativePath: string }>} testFiles
 * @param {Map<string, { file: string, tierName: string }>} [testIndex]
 * @returns {Promise<{ rawTap: string, tests: Array, durationMs: number }>}
 */
function executeTestsTap(testFiles, testIndex) {
  return new Promise((resolve) => {
    const filePaths = testFiles.map((f) => f.filePath);
    const start = Date.now();

    const env = {
      ...process.env,
      ENABLE_MONITORING_V2: 'true',
      ENABLE_MONITORING_V2_AGENT: 'true',
      ENABLE_MONITORING_V2_INGESTION: 'true',
      ENABLE_MONITORING_V2_ADMIN_UI: 'true',
      ENABLE_MONITORING_V2_EMPLOYEE_UI: 'true'
    };

    const child = spawn(
      process.execPath,
      ['--test', '--test-concurrency=1', '--test-reporter=tap', ...filePaths],
      {
        cwd: config.paths.root,
        env,
        stdio: ['ignore', 'pipe', 'pipe']
      }
    );

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });

    child.on('close', () => {
      const durationMs = Date.now() - start;
      const parsedTests = parseTapOutput(stdout, testFiles, testIndex);
      resolve({
        rawTap: stdout,
        rawStderr: stderr,
        tests: parsedTests,
        durationMs
      });
    });
  });
}

/**
 * Parse TAP v13 output stream into structured test entries.
 * @param {string} tapText
 * @param {Array} testFiles
 * @param {Map<string, { file: string, tierName: string }>} [testIndex]
 * @returns {Array<{ name: string, passed: boolean, skipped: boolean, durationMs: number, file: string, tierName: string, features: string[], error?: string }>}
 */
function parseTapOutput(tapText, testFiles, testIndex) {
  const tests = [];
  const lines = tapText.split('\n');

  let currentTest = null;
  let inYaml = false;
  let yamlLines = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check for test result line: "ok <num> - <name>" or "not ok <num> - <name>"
    const match = line.match(/^(ok|not ok)\s+(\d+)\s+-\s+(.+)$/);
    if (match) {
      if (currentTest) {
        tests.push(currentTest);
      }

      const status = match[1];
      let testName = match[3].trim();
      let skipped = false;

      if (testName.includes('# SKIP')) {
        skipped = true;
        testName = testName.replace(/#\s*SKIP.*/i, '').trim();
      }

      const passed = status === 'ok' && !skipped;

      // Extract associated features e.g. [F1] or F1
      const featureMatches = testName.match(/\bF\d{1,2}\b/g) || [];
      const features = [...new Set(featureMatches)];

      currentTest = {
        name: testName,
        passed,
        skipped,
        durationMs: 0,
        file: '',
        tierName: 'Tier 1 (Feature Coverage)',
        features,
        error: passed ? null : 'Test failed'
      };
      inYaml = false;
      yamlLines = [];
      continue;
    }

    if (line.trim() === '---') {
      inYaml = true;
      continue;
    }
    if (line.trim() === '...') {
      inYaml = false;
      if (currentTest && yamlLines.length > 0) {
        for (const yLine of yamlLines) {
          const durMatch = yLine.match(/duration_ms:\s*([\d.]+)/);
          if (durMatch) currentTest.durationMs = parseFloat(durMatch[1]);
          const fileMatch = yLine.match(/file:\s*'(.+)'/);
          if (fileMatch) currentTest.file = fileMatch[1];
          const locMatch = yLine.match(/location:\s*'(.+?):\d+:\d+'/);
          if (locMatch) currentTest.file = locMatch[1];
        }
      }
      continue;
    }

    if (inYaml) {
      yamlLines.push(line);
      if (currentTest && !currentTest.passed && !currentTest.skipped) {
        if (line.includes('error:') || line.includes('failure:') || line.includes('message:')) {
          currentTest.error = line.trim();
        }
      }
    }
  }

  if (currentTest) {
    tests.push(currentTest);
  }

  // Correlate tests with discovered files if file attribute was omitted by TAP
  for (const t of tests) {
    if (!t.file && testIndex && testIndex.has(t.name)) {
      const entry = testIndex.get(t.name);
      t.file = entry.file;
      t.tierName = entry.tierName;
    } else if (!t.file && testFiles.length === 1) {
      t.file = testFiles[0].relativePath;
      t.tierName = testFiles[0].tierName;
    } else if (t.file) {
      const matched = testFiles.find((tf) => t.file.includes(path.basename(tf.filePath)));
      if (matched) {
        t.tierName = matched.tierName;
      }
    }

    // Default feature from filename if none in test title
    if (t.features.length === 0 && t.file) {
      const base = path.basename(t.file);
      const fMatch = base.match(/^F(\d{1,2})\./i);
      if (fMatch) {
        t.features.push(`F${fMatch[1]}`);
      }
    }
  }

  return tests;
}

/**
 * Main Runner Function.
 */
async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    process.exit(0);
  }

  console.log(`\n${ANSI.bold}${ANSI.cyan}========================================================================${ANSI.reset}`);
  console.log(`${ANSI.bold}${ANSI.cyan}         NIYANTRAN EMPLOYEE MONITORING V2 — E2E TEST RUNNER            ${ANSI.reset}`);
  console.log(`${ANSI.bold}${ANSI.cyan}========================================================================${ANSI.reset}`);

  // 1. Preflight Phase
  console.log(`\n${ANSI.bold}Checking subsystem service ports...${ANSI.reset}`);
  const preflight = await runPreflight({ silent: false });

  if (options.preflightOnly) {
    if (options.strictPreflight && !preflight.allHealthy) {
      console.log(`${ANSI.red}${ANSI.bold}Strict preflight check failed: Not all required services are online.${ANSI.reset}\n`);
      process.exit(2);
    }
    console.log(`${ANSI.green}${ANSI.bold}Preflight probe complete.${ANSI.reset}\n`);
    process.exit(0);
  }

  // 2. Strict Preflight Enforcement
  if (options.strictPreflight && !preflight.services.mongo.online) {
    console.error(`${ANSI.red}${ANSI.bold}FATAL: MongoDB is offline on port 27017. Cannot execute E2E tests.${ANSI.reset}`);
    process.exit(2);
  }

  // 3. Discovery Phase
  const testFiles = discoverTestFiles(options.tiers, options.features);
  console.log(`\n${ANSI.bold}Discovered ${testFiles.length} test suite file${testFiles.length === 1 ? '' : 's'} matching criteria:${ANSI.reset}`);
  for (const tf of testFiles) {
    console.log(`  ${ANSI.cyan}•${ANSI.reset} [${tf.tierName}] ${ANSI.gray}${tf.relativePath}${ANSI.reset}`);
  }

  if (testFiles.length === 0) {
    console.log(`\n${ANSI.yellow}No test files discovered for selected criteria (Tiers: ${options.tiers.join(', ')}).${ANSI.reset}`);
    process.exit(0);
  }

  // 4. Execution Phase
  console.log(`\n${ANSI.bold}Executing test suites via Node 24 native test runner...${ANSI.reset}`);

  const testIndex = buildTestIndex(testFiles);

  // Group discovered files by tier to preserve exact tier attribution
  const tierFilesMap = new Map();
  for (const tf of testFiles) {
    if (!tierFilesMap.has(tf.tierName)) {
      tierFilesMap.set(tf.tierName, []);
    }
    tierFilesMap.get(tf.tierName).push(tf);
  }

  const execution = { tests: [], durationMs: 0 };
  for (const [tierName, files] of tierFilesMap.entries()) {
    const res = await executeTestsTap(files, testIndex);
    for (const t of res.tests) {
      t.tierName = tierName;
    }
    execution.tests.push(...res.tests);
    execution.durationMs += res.durationMs;
  }

  // 5. Aggregate Statistics
  const tierStats = {
    'Tier 1 (Feature Coverage)': { total: 0, passed: 0, failed: 0, skipped: 0, durationMs: 0 },
    'Tier 2 (Boundary & Negative)': { total: 0, passed: 0, failed: 0, skipped: 0, durationMs: 0 },
    'Tier 3 (Cross-Combinations)': { total: 0, passed: 0, failed: 0, skipped: 0, durationMs: 0 },
    'Tier 4 (Acceptance Scenarios)': { total: 0, passed: 0, failed: 0, skipped: 0, durationMs: 0 },
    'Tier 5 (Adversarial Stress Testing)': { total: 0, passed: 0, failed: 0, skipped: 0, durationMs: 0 }
  };

  const featureStats = {};
  for (let i = 1; i <= 16; i++) {
    featureStats[`F${i}`] = { total: 0, passed: 0, failed: 0, skipped: 0 };
  }

  const failures = [];
  let grandTotal = 0;
  let grandPassed = 0;
  let grandFailed = 0;
  let grandSkipped = 0;

  for (const t of execution.tests) {
    grandTotal++;
    const tStat = tierStats[t.tierName] || tierStats['Tier 1 (Feature Coverage)'];
    tStat.total++;
    tStat.durationMs += (t.durationMs || 0);

    if (t.skipped) {
      grandSkipped++;
      tStat.skipped++;
    } else if (t.passed) {
      grandPassed++;
      tStat.passed++;
    } else {
      grandFailed++;
      tStat.failed++;
      failures.push({
        name: t.name,
        file: t.file,
        error: t.error || 'Assertion failed'
      });
    }

    for (const fKey of t.features) {
      if (featureStats[fKey]) {
        featureStats[fKey].total++;
        if (t.skipped) featureStats[fKey].skipped++;
        else if (t.passed) featureStats[fKey].passed++;
        else featureStats[fKey].failed++;
      }
    }
  }

  const grandSummary = {
    total: grandTotal,
    passed: grandPassed,
    failed: grandFailed,
    skipped: grandSkipped,
    durationMs: execution.durationMs
  };

  // 6. JSON Report Output
  const reportData = {
    timestamp: new Date().toISOString(),
    environment: {
      nodeVersion: process.version,
      platform: process.platform,
      hardware: config.hardware
    },
    preflight: preflight.results,
    summary: grandSummary,
    tierBreakdown: tierStats,
    featureMatrix: featureStats,
    failures,
    tests: execution.tests
  };

  const reportPath = Reporter.writeJsonReport(reportData);

  // 7. Terminal Summary
  if (!options.json) {
    Reporter.printSummaryReport({
      tierStats,
      featureStats,
      failures,
      grandSummary,
      reportPath
    });
  } else {
    console.log(JSON.stringify(reportData, null, 2));
  }

  // 8. Exit Semantics Contract: 0 = pass, 1 = failure, 2 = config/preflight error
  process.exit(grandFailed > 0 ? 1 : 0);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`\n${ANSI.red}${ANSI.bold}Fatal Test Runner Error:${ANSI.reset}`, err);
    process.exit(2);
  });
}

module.exports = {
  main,
  parseArgs,
  discoverTestFiles,
  executeTestsTap,
  parseTapOutput
};
