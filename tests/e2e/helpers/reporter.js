/**
 * Niyantran Employee Monitoring V2 — E2E Test Reporter
 * Formats ANSI terminal summary tables per-tier and per-feature,
 * prints detailed failure reports, and writes structured JSON to tests/e2e/reports/latest.json.
 */

const fs = require('node:fs');
const path = require('node:path');
const config = require('../config');

// ANSI escape sequences
const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m'
};

class Reporter {
  /**
   * Format milliseconds to human-readable string.
   * @param {number} ms
   * @returns {string}
   */
  static formatDuration(ms) {
    if (ms < 1000) return `${Math.round(ms)}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  }

  /**
   * Format Tier Summary ANSI table.
   * @param {Object} tierStats Map of tierName -> { total, passed, failed, skipped, durationMs }
   * @returns {string}
   */
  static formatTierTable(tierStats) {
    const lines = [];
    lines.push(`${ANSI.bold}${ANSI.cyan}┌──────────────────────────────┬────────┬────────┬────────┬────────┬─────────────┐${ANSI.reset}`);
    lines.push(`${ANSI.bold}${ANSI.cyan}│${ANSI.reset} ${ANSI.bold}${'Test Tier'.padEnd(28)}${ANSI.reset} ${ANSI.bold}${ANSI.cyan}│${ANSI.reset} ${ANSI.bold}${'Total'.padStart(6)}${ANSI.reset} ${ANSI.bold}${ANSI.cyan}│${ANSI.reset} ${ANSI.bold}${'Passed'.padStart(6)}${ANSI.reset} ${ANSI.bold}${ANSI.cyan}│${ANSI.reset} ${ANSI.bold}${'Failed'.padStart(6)}${ANSI.reset} ${ANSI.bold}${ANSI.cyan}│${ANSI.reset} ${ANSI.bold}${'Skip'.padStart(6)}${ANSI.reset} ${ANSI.bold}${ANSI.cyan}│${ANSI.reset} ${ANSI.bold}${'Duration'.padStart(11)}${ANSI.reset} ${ANSI.bold}${ANSI.cyan}│${ANSI.reset}`);
    lines.push(`${ANSI.bold}${ANSI.cyan}├──────────────────────────────┼────────┼────────┼────────┼────────┼─────────────┤${ANSI.reset}`);

    let grandTotal = 0;
    let grandPassed = 0;
    let grandFailed = 0;
    let grandSkipped = 0;
    let grandDuration = 0;

    const tiers = ['Tier 1 (Feature Coverage)', 'Tier 2 (Boundary & Negative)', 'Tier 3 (Cross-Combinations)', 'Tier 4 (Acceptance Scenarios)'];
    if (tierStats['Tier 5 (Adversarial Stress Testing)']) {
      tiers.push('Tier 5 (Adversarial Stress Testing)');
    }

    for (const tierName of tiers) {
      const stats = tierStats[tierName] || { total: 0, passed: 0, failed: 0, skipped: 0, durationMs: 0 };
      grandTotal += stats.total;
      grandPassed += stats.passed;
      grandFailed += stats.failed;
      grandSkipped += stats.skipped;
      grandDuration += stats.durationMs;

      const failColor = stats.failed > 0 ? ANSI.red : ANSI.gray;
      const passColor = stats.passed > 0 ? ANSI.green : ANSI.gray;
      const skipColor = stats.skipped > 0 ? ANSI.yellow : ANSI.gray;

      lines.push(
        `${ANSI.bold}${ANSI.cyan}│${ANSI.reset} ` +
        `${tierName.padEnd(28)} ` +
        `${ANSI.bold}${ANSI.cyan}│${ANSI.reset} ` +
        `${String(stats.total).padStart(6)} ` +
        `${ANSI.bold}${ANSI.cyan}│${ANSI.reset} ` +
        `${passColor}${String(stats.passed).padStart(6)}${ANSI.reset} ` +
        `${ANSI.bold}${ANSI.cyan}│${ANSI.reset} ` +
        `${failColor}${String(stats.failed).padStart(6)}${ANSI.reset} ` +
        `${ANSI.bold}${ANSI.cyan}│${ANSI.reset} ` +
        `${skipColor}${String(stats.skipped).padStart(6)}${ANSI.reset} ` +
        `${ANSI.bold}${ANSI.cyan}│${ANSI.reset} ` +
        `${this.formatDuration(stats.durationMs).padStart(11)} ` +
        `${ANSI.bold}${ANSI.cyan}│${ANSI.reset}`
      );
    }

    lines.push(`${ANSI.bold}${ANSI.cyan}├──────────────────────────────┼────────┼────────┼────────┼────────┼─────────────┤${ANSI.reset}`);

    const totalFailColor = grandFailed > 0 ? ANSI.red : ANSI.gray;
    const totalPassColor = grandPassed > 0 ? ANSI.green : ANSI.gray;

    lines.push(
      `${ANSI.bold}${ANSI.cyan}│${ANSI.reset} ` +
      `${ANSI.bold}${'TOTAL GRAND SUMMARY'.padEnd(28)}${ANSI.reset} ` +
      `${ANSI.bold}${ANSI.cyan}│${ANSI.reset} ` +
      `${ANSI.bold}${String(grandTotal).padStart(6)}${ANSI.reset} ` +
      `${ANSI.bold}${ANSI.cyan}│${ANSI.reset} ` +
      `${totalPassColor}${ANSI.bold}${String(grandPassed).padStart(6)}${ANSI.reset} ` +
      `${ANSI.bold}${ANSI.cyan}│${ANSI.reset} ` +
      `${totalFailColor}${ANSI.bold}${String(grandFailed).padStart(6)}${ANSI.reset} ` +
      `${ANSI.bold}${ANSI.cyan}│${ANSI.reset} ` +
      `${ANSI.bold}${String(grandSkipped).padStart(6)}${ANSI.reset} ` +
      `${ANSI.bold}${ANSI.cyan}│${ANSI.reset} ` +
      `${ANSI.bold}${this.formatDuration(grandDuration).padStart(11)}${ANSI.reset} ` +
      `${ANSI.bold}${ANSI.cyan}│${ANSI.reset}`
    );
    lines.push(`${ANSI.bold}${ANSI.cyan}└──────────────────────────────┴────────┴────────┴────────┴────────┴─────────────┘${ANSI.reset}`);

    return lines.join('\n');
  }

  /**
   * Format Feature Coverage ANSI table (F1 through F16).
   * @param {Object} featureStats Map of featureKey (F1..F16) -> { total, passed, failed, skipped }
   * @returns {string}
   */
  static formatFeatureTable(featureStats) {
    const lines = [];
    lines.push(`${ANSI.bold}${ANSI.cyan}┌──────┬────────────────────────────────────────────┬───────┬────────┬────────┬──────────┐${ANSI.reset}`);
    lines.push(`${ANSI.bold}${ANSI.cyan}│${ANSI.reset} ${ANSI.bold}${'#'.padEnd(4)}${ANSI.reset} ${ANSI.bold}${ANSI.cyan}│${ANSI.reset} ${ANSI.bold}${'Feature Description'.padEnd(42)}${ANSI.reset} ${ANSI.bold}${ANSI.cyan}│${ANSI.reset} ${ANSI.bold}${'Tests'.padStart(5)}${ANSI.reset} ${ANSI.bold}${ANSI.cyan}│${ANSI.reset} ${ANSI.bold}${'Passed'.padStart(6)}${ANSI.reset} ${ANSI.bold}${ANSI.cyan}│${ANSI.reset} ${ANSI.bold}${'Failed'.padStart(6)}${ANSI.reset} ${ANSI.bold}${ANSI.cyan}│${ANSI.reset} ${ANSI.bold}${'Status'.padEnd(8)}${ANSI.reset} ${ANSI.bold}${ANSI.cyan}│${ANSI.reset}`);
    lines.push(`${ANSI.bold}${ANSI.cyan}├──────┼────────────────────────────────────────────┼───────┼────────┼────────┼──────────┤${ANSI.reset}`);

    for (let i = 1; i <= 16; i++) {
      const fKey = `F${i}`;
      const fName = config.features[fKey] || 'Unknown';
      const stats = featureStats[fKey] || { total: 0, passed: 0, failed: 0, skipped: 0 };

      let statusBadge;
      if (stats.total === 0) {
        statusBadge = `${ANSI.gray}PENDING${ANSI.reset} `;
      } else if (stats.failed > 0) {
        statusBadge = `${ANSI.red}${ANSI.bold}FAILED${ANSI.reset}  `;
      } else if (stats.passed > 0) {
        statusBadge = `${ANSI.green}${ANSI.bold}PASS${ANSI.reset}    `;
      } else {
        statusBadge = `${ANSI.yellow}SKIPPED${ANSI.reset} `;
      }

      const truncatedName = fName.length > 42 ? `${fName.substring(0, 39)}...` : fName.padEnd(42);

      lines.push(
        `${ANSI.bold}${ANSI.cyan}│${ANSI.reset} ` +
        `${fKey.padEnd(4)} ` +
        `${ANSI.bold}${ANSI.cyan}│${ANSI.reset} ` +
        `${truncatedName} ` +
        `${ANSI.bold}${ANSI.cyan}│${ANSI.reset} ` +
        `${String(stats.total).padStart(5)} ` +
        `${ANSI.bold}${ANSI.cyan}│${ANSI.reset} ` +
        `${(stats.passed > 0 ? ANSI.green : ANSI.gray)}${String(stats.passed).padStart(6)}${ANSI.reset} ` +
        `${ANSI.bold}${ANSI.cyan}│${ANSI.reset} ` +
        `${(stats.failed > 0 ? ANSI.red : ANSI.gray)}${String(stats.failed).padStart(6)}${ANSI.reset} ` +
        `${ANSI.bold}${ANSI.cyan}│${ANSI.reset} ` +
        `${statusBadge} ` +
        `${ANSI.bold}${ANSI.cyan}│${ANSI.reset}`
      );
    }

    lines.push(`${ANSI.bold}${ANSI.cyan}└──────┴────────────────────────────────────────────┴───────┴────────┴────────┴──────────┘${ANSI.reset}`);
    return lines.join('\n');
  }

  /**
   * Format failure details list.
   * @param {Array<{ name: string, file: string, error: string, stack?: string }>} failures
   * @returns {string}
   */
  static formatFailures(failures) {
    if (!failures || failures.length === 0) return '';

    const lines = [];
    lines.push(`\n${ANSI.bold}${ANSI.red}════════════════════════════════════════════════════════════════════════════════${ANSI.reset}`);
    lines.push(`${ANSI.bold}${ANSI.red} FAILURE SUMMARY (${failures.length} test${failures.length === 1 ? '' : 's'} failed)${ANSI.reset}`);
    lines.push(`${ANSI.bold}${ANSI.red}════════════════════════════════════════════════════════════════════════════════${ANSI.reset}\n`);

    failures.forEach((failure, idx) => {
      lines.push(`${ANSI.bold}${ANSI.red}${idx + 1}) ${failure.name}${ANSI.reset}`);
      if (failure.file) {
        lines.push(`   ${ANSI.gray}at ${failure.file}${ANSI.reset}`);
      }
      lines.push(`   ${ANSI.red}${failure.error || 'Assertion failed'}${ANSI.reset}`);
      if (failure.stack) {
        const stackLines = failure.stack
          .split('\n')
          .slice(1, 4)
          .map((s) => `     ${ANSI.dim}${s.trim()}${ANSI.reset}`)
          .join('\n');
        if (stackLines) lines.push(stackLines);
      }
      lines.push('');
    });

    return lines.join('\n');
  }

  /**
   * Write JSON report to file.
   * @param {Object} reportData
   * @param {string} [outputPath]
   */
  static writeJsonReport(reportData, outputPath = path.resolve(config.paths.reports, 'latest.json')) {
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(outputPath, JSON.stringify(reportData, null, 2), 'utf8');
    return outputPath;
  }

  /**
   * Print entire consolidated summary report to terminal.
   * @param {Object} options
   */
  static printSummaryReport({ tierStats, featureStats, failures, grandSummary, reportPath }) {
    console.log(`\n${ANSI.bold}${ANSI.magenta}╔══════════════════════════════════════════════════════════════════════════════╗${ANSI.reset}`);
    console.log(`${ANSI.bold}${ANSI.magenta}║      NIYANTRAN EMPLOYEE MONITORING V2 — E2E TEST EXECUTION SUMMARY          ║${ANSI.reset}`);
    console.log(`${ANSI.bold}${ANSI.magenta}╚══════════════════════════════════════════════════════════════════════════════╝${ANSI.reset}\n`);

    console.log(`${ANSI.bold}1. Breakdown by Test Tier:${ANSI.reset}`);
    console.log(this.formatTierTable(tierStats));

    console.log(`\n${ANSI.bold}2. Feature Inventory Matrix (F1 — F16):${ANSI.reset}`);
    console.log(this.formatFeatureTable(featureStats));

    if (failures && failures.length > 0) {
      console.log(this.formatFailures(failures));
    }

    console.log(`\n${ANSI.bold}Execution Status:${ANSI.reset} ${grandSummary.failed === 0 ? `${ANSI.green}${ANSI.bold}ALL TESTS PASSED${ANSI.reset}` : `${ANSI.red}${ANSI.bold}TEST FAILURES DETECTED${ANSI.reset}`}`);
    console.log(`${ANSI.gray}Total: ${grandSummary.total} | Passed: ${grandSummary.passed} | Failed: ${grandSummary.failed} | Skipped: ${grandSummary.skipped} | Duration: ${this.formatDuration(grandSummary.durationMs)}${ANSI.reset}`);
    if (reportPath) {
      console.log(`${ANSI.cyan}JSON Report Saved:${ANSI.reset} ${reportPath}\n`);
    }
  }
}

module.exports = Reporter;
