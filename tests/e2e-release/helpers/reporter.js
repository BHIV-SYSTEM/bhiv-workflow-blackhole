import fs from 'node:fs';
import path from 'node:path';
import { FEATURES, PATHS } from '../config.js';

const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  gray: '\x1b[90m',
};

export function formatDuration(ms) {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

export function formatTierTable(tierStats) {
  const lines = [];
  lines.push(`${ANSI.bold}${ANSI.cyan}┌────────────────────────────────┬────────┬────────┬────────┬────────┬─────────────┐${ANSI.reset}`);
  lines.push(
    `${ANSI.bold}${ANSI.cyan}│${ANSI.reset} ${ANSI.bold}${'Test Tier'.padEnd(30)}${ANSI.reset} ` +
      `${ANSI.bold}${ANSI.cyan}│${ANSI.reset} ${ANSI.bold}${'Total'.padStart(6)}${ANSI.reset} ` +
      `${ANSI.bold}${ANSI.cyan}│${ANSI.reset} ${ANSI.bold}${'Passed'.padStart(6)}${ANSI.reset} ` +
      `${ANSI.bold}${ANSI.cyan}│${ANSI.reset} ${ANSI.bold}${'Failed'.padStart(6)}${ANSI.reset} ` +
      `${ANSI.bold}${ANSI.cyan}│${ANSI.reset} ${ANSI.bold}${'Skip'.padStart(6)}${ANSI.reset} ` +
      `${ANSI.bold}${ANSI.cyan}│${ANSI.reset} ${ANSI.bold}${'Duration'.padStart(11)}${ANSI.reset} ${ANSI.bold}${ANSI.cyan}│${ANSI.reset}`
  );
  lines.push(`${ANSI.bold}${ANSI.cyan}├────────────────────────────────┼────────┼────────┼────────┼────────┼─────────────┤${ANSI.reset}`);

  let grandTotal = 0;
  let grandPassed = 0;
  let grandFailed = 0;
  let grandSkipped = 0;
  let grandDuration = 0;

  for (const [tierName, stats] of Object.entries(tierStats)) {
    if (stats.total === 0 && tierName.startsWith('Smoke')) continue;
    grandTotal += stats.total;
    grandPassed += stats.passed;
    grandFailed += stats.failed;
    grandSkipped += stats.skipped;
    grandDuration += stats.durationMs;

    const failColor = stats.failed > 0 ? ANSI.red : ANSI.gray;
    const passColor = stats.passed > 0 ? ANSI.green : ANSI.gray;
    const skipColor = stats.skipped > 0 ? ANSI.yellow : ANSI.gray;

    lines.push(
      `${ANSI.bold}${ANSI.cyan}│${ANSI.reset} ${tierName.padEnd(30)} ` +
        `${ANSI.bold}${ANSI.cyan}│${ANSI.reset} ${String(stats.total).padStart(6)} ` +
        `${ANSI.bold}${ANSI.cyan}│${ANSI.reset} ${passColor}${String(stats.passed).padStart(6)}${ANSI.reset} ` +
        `${ANSI.bold}${ANSI.cyan}│${ANSI.reset} ${failColor}${String(stats.failed).padStart(6)}${ANSI.reset} ` +
        `${ANSI.bold}${ANSI.cyan}│${ANSI.reset} ${skipColor}${String(stats.skipped).padStart(6)}${ANSI.reset} ` +
        `${ANSI.bold}${ANSI.cyan}│${ANSI.reset} ${formatDuration(stats.durationMs).padStart(11)} ${ANSI.bold}${ANSI.cyan}│${ANSI.reset}`
    );
  }

  lines.push(`${ANSI.bold}${ANSI.cyan}├────────────────────────────────┼────────┼────────┼────────┼────────┼─────────────┤${ANSI.reset}`);
  lines.push(
    `${ANSI.bold}${ANSI.cyan}│${ANSI.reset} ${ANSI.bold}${'TOTAL'.padEnd(30)}${ANSI.reset} ` +
      `${ANSI.bold}${ANSI.cyan}│${ANSI.reset} ${ANSI.bold}${String(grandTotal).padStart(6)}${ANSI.reset} ` +
      `${ANSI.bold}${ANSI.cyan}│${ANSI.reset} ${grandPassed > 0 ? ANSI.green : ANSI.gray}${ANSI.bold}${String(grandPassed).padStart(6)}${ANSI.reset} ` +
      `${ANSI.bold}${ANSI.cyan}│${ANSI.reset} ${grandFailed > 0 ? ANSI.red : ANSI.gray}${ANSI.bold}${String(grandFailed).padStart(6)}${ANSI.reset} ` +
      `${ANSI.bold}${ANSI.cyan}│${ANSI.reset} ${ANSI.bold}${String(grandSkipped).padStart(6)}${ANSI.reset} ` +
      `${ANSI.bold}${ANSI.cyan}│${ANSI.reset} ${ANSI.bold}${formatDuration(grandDuration).padStart(11)}${ANSI.reset} ${ANSI.bold}${ANSI.cyan}│${ANSI.reset}`
  );
  lines.push(`${ANSI.bold}${ANSI.cyan}└────────────────────────────────┴────────┴────────┴────────┴────────┴─────────────┘${ANSI.reset}`);

  return lines.join('\n');
}

export function formatFeatureTable(featureStats) {
  const lines = [];
  lines.push(`${ANSI.bold}${ANSI.cyan}┌──────┬────────────────────────────────────────────┬───────┬────────┬────────┬──────────┐${ANSI.reset}`);
  lines.push(
    `${ANSI.bold}${ANSI.cyan}│${ANSI.reset} ${ANSI.bold}${'#'.padEnd(4)}${ANSI.reset} ` +
      `${ANSI.bold}${ANSI.cyan}│${ANSI.reset} ${ANSI.bold}${'Feature Description'.padEnd(42)}${ANSI.reset} ` +
      `${ANSI.bold}${ANSI.cyan}│${ANSI.reset} ${ANSI.bold}${'Tests'.padStart(5)}${ANSI.reset} ` +
      `${ANSI.bold}${ANSI.cyan}│${ANSI.reset} ${ANSI.bold}${'Passed'.padStart(6)}${ANSI.reset} ` +
      `${ANSI.bold}${ANSI.cyan}│${ANSI.reset} ${ANSI.bold}${'Failed'.padStart(6)}${ANSI.reset} ` +
      `${ANSI.bold}${ANSI.cyan}│${ANSI.reset} ${ANSI.bold}${'Status'.padEnd(8)}${ANSI.reset} ${ANSI.bold}${ANSI.cyan}│${ANSI.reset}`
  );
  lines.push(`${ANSI.bold}${ANSI.cyan}├──────┼────────────────────────────────────────────┼───────┼────────┼────────┼──────────┤${ANSI.reset}`);

  for (let i = 1; i <= 10; i++) {
    const fKey = `F${i}`;
    const desc = FEATURES[fKey] || 'Unknown';
    const truncated = desc.length > 42 ? `${desc.slice(0, 39)}...` : desc.padEnd(42);
    const stats = featureStats[fKey] || { total: 0, passed: 0, failed: 0, skipped: 0 };

    let statusBadge = `${ANSI.gray}PENDING${ANSI.reset} `;
    if (stats.total > 0) {
      if (stats.failed > 0) statusBadge = `${ANSI.red}${ANSI.bold}FAILED${ANSI.reset}  `;
      else if (stats.passed > 0) statusBadge = `${ANSI.green}${ANSI.bold}PASS${ANSI.reset}    `;
      else statusBadge = `${ANSI.yellow}SKIPPED${ANSI.reset} `;
    }

    lines.push(
      `${ANSI.bold}${ANSI.cyan}│${ANSI.reset} ${fKey.padEnd(4)} ` +
        `${ANSI.bold}${ANSI.cyan}│${ANSI.reset} ${truncated} ` +
        `${ANSI.bold}${ANSI.cyan}│${ANSI.reset} ${String(stats.total).padStart(5)} ` +
        `${ANSI.bold}${ANSI.cyan}│${ANSI.reset} ${stats.passed > 0 ? ANSI.green : ANSI.gray}${String(stats.passed).padStart(6)}${ANSI.reset} ` +
        `${ANSI.bold}${ANSI.cyan}│${ANSI.reset} ${stats.failed > 0 ? ANSI.red : ANSI.gray}${String(stats.failed).padStart(6)}${ANSI.reset} ` +
        `${ANSI.bold}${ANSI.cyan}│${ANSI.reset} ${statusBadge} ${ANSI.bold}${ANSI.cyan}│${ANSI.reset}`
    );
  }

  lines.push(`${ANSI.bold}${ANSI.cyan}└──────┴────────────────────────────────────────────┴───────┴────────┴────────┴──────────┘${ANSI.reset}`);
  return lines.join('\n');
}

export function writeJsonReport(
  reportData,
  outputPath = path.join(PATHS.reportsDir, 'latest.json')
) {
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(outputPath, JSON.stringify(reportData, null, 2), 'utf8');
  return outputPath;
}

export function printSummaryReport({
  tierStats,
  featureStats,
  failures,
  grandSummary,
  reportPath,
}) {
  console.log(`\n${ANSI.bold}${ANSI.magenta}╔══════════════════════════════════════════════════════════════════════════════╗${ANSI.reset}`);
  console.log(`${ANSI.bold}${ANSI.magenta}║         NIYANTRAN PRODUCTION RELEASE (R1-R4) — E2E TEST SUMMARY             ║${ANSI.reset}`);
  console.log(`${ANSI.bold}${ANSI.magenta}╚══════════════════════════════════════════════════════════════════════════════╝${ANSI.reset}\n`);

  console.log(`${ANSI.bold}1. Breakdown by Tier:${ANSI.reset}`);
  console.log(formatTierTable(tierStats));

  console.log(`\n${ANSI.bold}2. Feature Matrix (F1 - F10):${ANSI.reset}`);
  console.log(formatFeatureTable(featureStats));

  if (failures.length > 0) {
    console.log(`\n${ANSI.bold}${ANSI.red}FAILURE SUMMARY (${failures.length} failed):${ANSI.reset}`);
    failures.forEach((f, idx) => {
      console.log(`  ${ANSI.red}${idx + 1}) ${f.name}${ANSI.reset}`);
      if (f.file) console.log(`     ${ANSI.gray}file: ${f.file}${ANSI.reset}`);
      console.log(`     ${ANSI.red}${f.error}${ANSI.reset}`);
    });
  }

  const badge =
    grandSummary.failed === 0
      ? `${ANSI.green}${ANSI.bold}ALL TESTS PASSED${ANSI.reset}`
      : `${ANSI.red}${ANSI.bold}TEST FAILURES DETECTED${ANSI.reset}`;

  console.log(`\n${ANSI.bold}Execution Status:${ANSI.reset} ${badge}`);
  console.log(
    `${ANSI.gray}Total: ${grandSummary.total} | Passed: ${grandSummary.passed} | Failed: ${grandSummary.failed} | Skipped: ${grandSummary.skipped} | Duration: ${formatDuration(grandSummary.durationMs)}${ANSI.reset}`
  );
  if (reportPath) {
    console.log(`${ANSI.cyan}JSON Report Saved:${ANSI.reset} ${reportPath}\n`);
  }
}
