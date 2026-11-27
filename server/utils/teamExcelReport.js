const ExcelJS = require('exceljs');
const path = require('path');
const { formatEmployeeId } = require('./employeeId');

const TEST_NAME_REGEX = /\b(bhiv\s*(test|sips)|test\s*account|dummy|demo\s*user)\b/i;
const TEST_PREFIX_REGEX = /^(test[\s._-]|dummy[\s._-])/i;
const TEST_EMAIL_REGEX = /(bhivtest|bhivsips|\+test|dummy|@test\.)/i;

const EVIDENCE_REGEX = /\b(commit|commits|pr|pull\s*request|merge|merged|deploy|deployed|deployment|test|tests|tested|passed|verified|verify|fix|fixed|built|implemented|endpoint|endpoints|api|report|audit|migration|migrated|release|docker|vm|domain|review_packet|code_packet|swagger|pipeline|e2e|unit|lint|build)\b|https?:\/\/|github\.com|\d+\/\d+|\d+%/i;

/**
 * Exclude blank, dummy, and test accounts (e.g., Bhiv test, Bhiv Sips) from active team rosters.
 */
function isExcludedReportUser(emp) {
  if (!emp) return true;
  const name = String(emp.name || '').trim();
  const email = String(emp.email || '').trim();
  const empId = String(emp.employeeId || '').trim();
  if (!name && !email && !empId) return true;
  if (TEST_NAME_REGEX.test(name) || TEST_PREFIX_REGEX.test(name)) return true;
  if (email && TEST_EMAIL_REGEX.test(email)) return true;
  return false;
}

function isBlankGoalValue(val) {
  if (val === null || val === undefined) return true;
  const s = String(val).trim();
  return !s || s === '-';
}

/**
 * Normalize AIMS, BLOCKERS/ERRORS, and ACHIEVEMENTS according to reporting rules:
 * - All three empty -> "NOT Mention" + allMissing=true (Dark Red highlight, Rating = 0.0)
 * - Only one of Blocker or Achievement empty while the other is filled -> empty one = "None"
 * - AIM filled while both Blocker & Achievement empty -> both = "NOT Mention"
 * - AIM empty while Blocker or Achievement filled -> AIM = "NOT Mention"
 */
function normalizeMemberGoalFields(aimRaw, blockerRaw, achievementRaw) {
  const hasAim = !isBlankGoalValue(aimRaw);
  const hasBlocker = !isBlankGoalValue(blockerRaw);
  const hasAchievement = !isBlankGoalValue(achievementRaw);

  if (!hasAim && !hasBlocker && !hasAchievement) {
    return {
      aim: 'NOT Mention',
      blocker: 'NOT Mention',
      achievement: 'NOT Mention',
      allMissing: true
    };
  }

  const aim = hasAim ? String(aimRaw).trim() : 'NOT Mention';
  let blocker = hasBlocker ? String(blockerRaw).trim() : '';
  let achievement = hasAchievement ? String(achievementRaw).trim() : '';

  if (hasBlocker && !hasAchievement) {
    achievement = 'None';
  } else if (!hasBlocker && hasAchievement) {
    blocker = 'None';
  } else if (!hasBlocker && !hasAchievement) {
    blocker = 'NOT Mention';
    achievement = 'NOT Mention';
  }

  return {
    aim,
    blocker,
    achievement,
    allMissing: false
  };
}

function isMissingMarker(val) {
  const s = String(val || '').trim().toLowerCase();
  return !s || s === '-' || s === 'not mention';
}

function isExplicitNoneMarker(val) {
  const s = String(val || '').trim().toLowerCase();
  return s === 'none' || s === 'no' || s === 'n/a' || s === 'na' || s === 'no blocker' || s === 'no blockers';
}

/**
 * Deterministic qualitative rating (0.0 to 5.0) assessed on:
 * AIM clarity, Execution & Achievements evidence, Active Hours consistency,
 * Productivity %, and Blocker transparency (never penalizing solely for low keystrokes/mouse).
 */
function computeQualitativeRating({
  aim,
  blocker,
  achievement,
  allMissing,
  activeSeconds = 0,
  avgProductivity = 0
}) {
  if (allMissing) return 0.0;

  let score = 0;

  // 1. AIM clarity (up to 1.0)
  if (!isMissingMarker(aim)) {
    const aimWords = String(aim).trim().split(/\s+/).filter(Boolean).length;
    if (aimWords >= 8) score += 1.0;
    else if (aimWords >= 4) score += 0.8;
    else score += 0.55;
  }

  // 2. Execution & Achievements evidence (up to 1.8)
  const combinedWorkText = `${isMissingMarker(aim) ? '' : aim} ${isMissingMarker(achievement) || isExplicitNoneMarker(achievement) ? '' : achievement}`.trim();
  const hasRealAchievement = !isMissingMarker(achievement) && !isExplicitNoneMarker(achievement);
  const hasEvidence = EVIDENCE_REGEX.test(combinedWorkText);

  if (hasRealAchievement) {
    const achWords = String(achievement).trim().split(/\s+/).filter(Boolean).length;
    let execPts = achWords >= 12 ? 1.45 : achWords >= 5 ? 1.2 : 0.95;
    if (hasEvidence) execPts += 0.35;
    score += Math.min(1.8, execPts);
  } else if (!isMissingMarker(aim)) {
    const aimWords = String(aim).trim().split(/\s+/).filter(Boolean).length;
    let execPts = aimWords >= 12 ? 0.75 : 0.4;
    if (hasEvidence) execPts += 0.35;
    score += Math.min(1.1, execPts);
  }

  // 3. Active Hours consistency (up to 1.0)
  const hours = activeSeconds / 3600;
  if (hours >= 7) score += 1.0;
  else if (hours >= 5) score += 0.8;
  else if (hours >= 3) score += 0.55;
  else if (hours >= 1) score += 0.35;
  else if (hours > 0) score += 0.1;

  // 4. Productivity quality (up to 0.7)
  score += Math.min(0.7, (Math.max(0, Math.min(100, Number(avgProductivity || 0))) / 100) * 0.7);

  // 5. Blocker transparency (up to 0.5)
  if (!isMissingMarker(blocker)) {
    if (!isExplicitNoneMarker(blocker)) {
      const blockerWords = String(blocker).trim().split(/\s+/).filter(Boolean).length;
      score += blockerWords >= 5 ? 0.5 : 0.4;
    } else if (hasRealAchievement || hours >= 4) {
      score += 0.35;
    } else {
      score += 0.2;
    }
  }

  return Math.round(Math.min(5.0, Math.max(0.0, score)) * 10) / 10;
}

function getPerformanceGroup(avgProductivity) {
  const pct = Number(avgProductivity || 0);
  if (pct > 80) {
    return { tier: 'high', label: 'High Performance (>80%)', sortOrder: 0 };
  }
  if (pct >= 65) {
    return { tier: 'moderate', label: 'Moderate Performance (65%-80%)', sortOrder: 1 };
  }
  return { tier: 'low', label: 'Low Performance (1%-64%)', sortOrder: 2 };
}

function computeCombinedScore({ rating, avgProductivity, activeSeconds }) {
  const rNorm = Math.min(1, Math.max(0, Number(rating || 0) / 5));
  const pNorm = Math.min(1, Math.max(0, Number(avgProductivity || 0) / 100));
  const hNorm = Math.min(1, Math.max(0, Number(activeSeconds || 0) / (8 * 3600)));
  return Math.round(((rNorm * 0.45) + (pNorm * 0.35) + (hNorm * 0.20)) * 10000) / 10000;
}

/**
 * Filter active logged roster, compute Rating / Combined Score / Performance Group,
 * normalize AIMS/Blockers/Achievements, and sort into ranked tiers.
 */
function enrichAndRankTeamMembers(rawMembers = []) {
  const enriched = [];

  for (const m of rawMembers) {
    if (isExcludedReportUser(m)) continue;

    const goals = normalizeMemberGoalFields(m.aim, m.blocker, m.achievement);
    const hasLoggedMetrics = (m.totalActivities || 0) > 0 || (m.activeSeconds || 0) > 0 || (m.idleSeconds || 0) > 0;
    if (!hasLoggedMetrics && goals.allMissing) continue;

    const rating = computeQualitativeRating({
      ...goals,
      activeSeconds: m.activeSeconds || 0,
      avgProductivity: m.avgProductivity || 0
    });
    const perf = getPerformanceGroup(m.avgProductivity || 0);
    const combinedScore = computeCombinedScore({
      rating,
      avgProductivity: m.avgProductivity || 0,
      activeSeconds: m.activeSeconds || 0
    });

    enriched.push({
      ...m,
      employeeId: m.employeeId || formatEmployeeId(m.email) || 'N/A',
      aim: goals.aim,
      blocker: goals.blocker,
      achievement: goals.achievement,
      allLogsMissing: goals.allMissing,
      rating,
      combinedScore,
      performanceGroup: perf.label,
      performanceTier: perf.tier,
      _tierOrder: perf.sortOrder
    });
  }

  enriched.sort((a, b) => {
    if (a._tierOrder !== b._tierOrder) return a._tierOrder - b._tierOrder;
    if (b.combinedScore !== a.combinedScore) return b.combinedScore - a.combinedScore;
    if (b.avgProductivity !== a.avgProductivity) return b.avgProductivity - a.avgProductivity;
    return b.activeSeconds - a.activeSeconds;
  });

  return enriched.map((m, idx) => {
    const { _tierOrder, ...rest } = m;
    return { ...rest, rank: idx + 1 };
  });
}

function formatReportDateDisplay(startDate, endDate) {
  const s = new Date(startDate);
  const e = new Date(endDate);
  const fmtSingle = (d) => {
    const day = String(d.getDate()).padStart(2, '0');
    const mon = d.toLocaleString('en-US', { month: 'short' });
    return `${day}-${mon}`;
  };
  const fmtFull = (d) => {
    const day = String(d.getDate()).padStart(2, '0');
    const mon = d.toLocaleString('en-US', { month: 'short' });
    return `${day}-${mon}-${d.getFullYear()}`;
  };
  if (s.toDateString() === e.toDateString()) {
    return { short: fmtSingle(s), full: fmtFull(s) };
  }
  return {
    short: `${fmtSingle(s)} to ${fmtSingle(e)}`,
    full: `${fmtFull(s)} to ${fmtFull(e)}`
  };
}

const TIER_STYLES = {
  high: { fill: 'FFD1FAE5', font: 'FF065F46' },     // Green (> 80%)
  moderate: { fill: 'FFFED7AA', font: 'FF9A3412' }, // Orange (65% - 80%)
  low: { fill: 'FF991B1B', font: 'FFFFFFFF' }       // Dark Red (1% - 64%)
};

const CELL_HIGHLIGHT_STYLES = {
  missingKeystrokes: { fill: 'FF1D4ED8', font: 'FFFFFFFF' }, // Blue
  overEightHours: { fill: 'FF6B21A8', font: 'FFFFFFFF' },    // Purple
  underOneHour: { fill: 'FF7F1D1D', font: 'FFFFFFFF' },      // Dark Red
  missingGoals: { fill: 'FF7F1D1D', font: 'FFFFFFFF' }       // Dark Red
};

function applySolidCellStyle(cell, argbFill, argbFont, bold = false) {
  cell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: argbFill }
  };
  cell.font = {
    name: 'Calibri',
    size: 10,
    bold,
    color: { argb: argbFont }
  };
}

/**
 * Generate the two-sheet styled .xlsx workbook matching the leadership report specification.
 */
async function buildTeamReportWorkbook({ rawMembers = [], startDate, endDate, reportsDir }) {
  const rankedMembers = enrichAndRankTeamMembers(rawMembers);
  const dateDisplay = formatReportDateDisplay(startDate, endDate);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Niyantran Workflow Monitoring System';
  workbook.created = new Date();

  // ==================== SHEET 1: TEAM REPORT ====================
  const sheet = workbook.addWorksheet('Team Report', {
    views: [{ state: 'frozen', ySplit: 8 }]
  });

  const headers = [
    'Rank',
    'Emp ID',
    'Name',
    'Date',
    'Activities',
    'Productivity (%)',
    'Rating',
    'Active Hour',
    'Idle Time',
    'Key Strokes',
    'Mouse Score',
    'Efficiency',
    'AIMS',
    'BLOCKERS/ERRORS',
    'ACHIEVEMENTS',
    'Combined Score',
    'Performance Group'
  ];

  // Row 1: Title Banner
  sheet.mergeCells('A1:Q1');
  const titleCell = sheet.getCell('A1');
  titleCell.value = 'EMPLOYEE PRODUCTIVITY & PERFORMANCE REPORT';
  applySolidCellStyle(titleCell, 'FF0F172A', 'FFFFFFFF', true);
  titleCell.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  sheet.getRow(1).height = 28;

  // Row 2: Subtitle
  sheet.mergeCells('A2:Q2');
  const subCell = sheet.getCell('A2');
  subCell.value = `Date: ${dateDisplay.full} | Active Logged Employees: ${rankedMembers.length} | Includes Emp ID, Idle Time, Rating & Full Work Logs`;
  applySolidCellStyle(subCell, 'FF1E293B', 'FFE2E8F0', true);
  subCell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFE2E8F0' } };
  subCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  sheet.getRow(2).height = 20;

  // Row 3: Blank spacer
  sheet.getRow(3).height = 8;

  // Row 4-6: Legend
  sheet.mergeCells('A4:Q4');
  const legendTitle = sheet.getCell('A4');
  legendTitle.value = 'REPORT LEGEND & COLOR RULES:';
  legendTitle.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF0F172A' } };

  sheet.getCell('A5').value = 'Row Performance Colors:';
  sheet.getCell('A5').font = { name: 'Calibri', size: 9.5, bold: true };
  sheet.mergeCells('B5:Q5');
  sheet.getCell('B5').value = 'GREEN: Productivity > 80% | ORANGE: Productivity 65% - 80% | DARK RED: Productivity 1% - 64%';
  sheet.getCell('B5').font = { name: 'Calibri', size: 9.5, bold: true, color: { argb: 'FF334155' } };

  sheet.getCell('A6').value = 'Cell Highlight & Rating Rules:';
  sheet.getCell('A6').font = { name: 'Calibri', size: 9.5, bold: true };
  sheet.mergeCells('B6:Q6');
  sheet.getCell('B6').value = "• Key Strokes (Blue): Missing Key Strokes | Active Hours (Purple >8h, Dark Red <1h) | AIMS/Blockers/Achievements: Dark Red if all missing; 'None' if one missing | Rating: Assessed on Aim, Execution, Achievements, Quality, Consistency, Blockers & Evidence.";
  sheet.getCell('B6').font = { name: 'Calibri', size: 9, color: { argb: 'FF475569' } };
  sheet.getCell('B6').alignment = { wrapText: true };
  sheet.getRow(6).height = 28;
  sheet.getRow(7).height = 8;

  // Row 8: Table Headers
  const headerRow = sheet.getRow(8);
  headerRow.height = 24;
  headers.forEach((label, idx) => {
    const cell = headerRow.getCell(idx + 1);
    cell.value = label;
    applySolidCellStyle(cell, 'FF1E293B', 'FFFFFFFF', true);
    cell.alignment = {
      vertical: 'middle',
      horizontal: idx >= 12 && idx <= 14 ? 'left' : 'center',
      wrapText: true
    };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF334155' } },
      bottom: { style: 'medium', color: { argb: 'FF0F172A' } },
      left: { style: 'thin', color: { argb: 'FF334155' } },
      right: { style: 'thin', color: { argb: 'FF334155' } }
    };
  });

  const dataStartRow = 9;
  let overEightHoursCount = 0;
  let underOneHourCount = 0;
  let missingKeystrokesCount = 0;
  let highCount = 0;
  let moderateCount = 0;
  let lowCount = 0;
  let prodSum = 0;
  let ratingSum = 0;

  rankedMembers.forEach((m, index) => {
    const rowIdx = dataStartRow + index;
    const row = sheet.getRow(rowIdx);
    const tierStyle = TIER_STYLES[m.performanceTier] || TIER_STYLES.low;

    if (m.performanceTier === 'high') highCount++;
    else if (m.performanceTier === 'moderate') moderateCount++;
    else lowCount++;

    prodSum += Number(m.avgProductivity || 0);
    ratingSum += Number(m.rating || 0);

    const hasHours = (m.totalActivities || 0) > 0 || (m.activeSeconds || 0) > 0;
    const activeHourText = hasHours ? (m.activeHoursFormatted || '0h 0m') : '-';
    const idleTimeText = (m.idleSeconds || 0) > 0 || hasHours ? (m.idleTimeFormatted || '0h 0m') : '-';
    const keystrokesMissing = !m.totalKeystrokes || m.totalKeystrokes <= 0;
    if (keystrokesMissing) missingKeystrokesCount++;

    const activeSec = Number(m.activeSeconds || 0);
    const isOverEight = activeSec > 8 * 3600;
    const isUnderOne = activeSec < 3600;
    if (isOverEight) overEightHoursCount++;
    if (isUnderOne) underOneHourCount++;

    const values = [
      m.rank,
      m.employeeId,
      m.name,
      dateDisplay.short,
      m.totalActivities > 0 ? m.totalActivities : 0,
      Number(((m.avgProductivity || 0) / 100).toFixed(4)),
      Number((m.rating || 0).toFixed(1)),
      activeHourText,
      idleTimeText,
      keystrokesMissing ? '-' : m.totalKeystrokes,
      Number(((m.avgMouse || 0) / 100).toFixed(4)),
      m.efficiency || 'No Activity',
      m.aim,
      m.blocker,
      m.achievement,
      Number((m.combinedScore || 0).toFixed(4)),
      m.performanceGroup
    ];

    values.forEach((val, colIdx) => {
      const cell = row.getCell(colIdx + 1);
      cell.value = val;
      applySolidCellStyle(cell, tierStyle.fill, tierStyle.font, colIdx === 0 || colIdx === 2 || colIdx === 6);
      cell.alignment = {
        vertical: 'top',
        horizontal: colIdx === 2 || colIdx === 12 || colIdx === 13 || colIdx === 14 || colIdx === 16 ? 'left' : 'center',
        wrapText: colIdx >= 12 && colIdx <= 14
      };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
      };
    });

    // Number formats
    row.getCell(6).numFmt = '0%';
    row.getCell(7).numFmt = '0.0';
    row.getCell(11).numFmt = '0%';
    row.getCell(16).numFmt = '0.000';

    // Specific cell highlight overrides
    if (keystrokesMissing) {
      applySolidCellStyle(row.getCell(10), CELL_HIGHLIGHT_STYLES.missingKeystrokes.fill, CELL_HIGHLIGHT_STYLES.missingKeystrokes.font, true);
    }
    if (isOverEight) {
      applySolidCellStyle(row.getCell(8), CELL_HIGHLIGHT_STYLES.overEightHours.fill, CELL_HIGHLIGHT_STYLES.overEightHours.font, true);
    } else if (isUnderOne) {
      applySolidCellStyle(row.getCell(8), CELL_HIGHLIGHT_STYLES.underOneHour.fill, CELL_HIGHLIGHT_STYLES.underOneHour.font, true);
    }
    if (m.allLogsMissing) {
      applySolidCellStyle(row.getCell(13), CELL_HIGHLIGHT_STYLES.missingGoals.fill, CELL_HIGHLIGHT_STYLES.missingGoals.font, true);
      applySolidCellStyle(row.getCell(14), CELL_HIGHLIGHT_STYLES.missingGoals.fill, CELL_HIGHLIGHT_STYLES.missingGoals.font, true);
      applySolidCellStyle(row.getCell(15), CELL_HIGHLIGHT_STYLES.missingGoals.fill, CELL_HIGHLIGHT_STYLES.missingGoals.font, true);
    }

    const maxGoalLen = Math.max(String(m.aim || '').length, String(m.blocker || '').length, String(m.achievement || '').length);
    row.height = Math.min(96, Math.max(22, Math.ceil(maxGoalLen / 46) * 14 + 8));
  });

  const colWidths = [7, 12, 22, 11, 11, 15, 9, 12, 12, 13, 13, 18, 42, 34, 42, 15, 28];
  colWidths.forEach((w, idx) => {
    sheet.getColumn(idx + 1).width = w;
  });

  const lastDataRow = Math.max(dataStartRow, dataStartRow + rankedMembers.length - 1);
  if (rankedMembers.length > 0) {
    sheet.autoFilter = { from: 'A8', to: `Q${lastDataRow}` };
  }

  // ==================== SHEET 2: EXECUTIVE SUMMARY ====================
  const summarySheet = workbook.addWorksheet('Executive Summary');
  summarySheet.mergeCells('A1:B1');
  const sumTitle = summarySheet.getCell('A1');
  sumTitle.value = `EXECUTIVE SUMMARY — ${dateDisplay.full.toUpperCase()}`;
  applySolidCellStyle(sumTitle, 'FF0F172A', 'FFFFFFFF', true);
  sumTitle.font = { name: 'Calibri', size: 13, bold: true, color: { argb: 'FFFFFFFF' } };
  sumTitle.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  summarySheet.getRow(1).height = 26;

  const sumHeaders = summarySheet.getRow(3);
  sumHeaders.height = 22;
  ['Metric', 'Value'].forEach((h, i) => {
    const c = sumHeaders.getCell(i + 1);
    c.value = h;
    applySolidCellStyle(c, 'FF1E293B', 'FFFFFFFF', true);
    c.alignment = { vertical: 'middle', horizontal: i === 1 ? 'center' : 'left' };
  });

  const totalEmp = rankedMembers.length;
  const avgProdDecimal = totalEmp > 0 ? Math.round((prodSum / totalEmp) * 10) / 1000 : 0;
  const avgRatingVal = totalEmp > 0 ? Math.round((ratingSum / totalEmp) * 100) / 100 : 0;

  const summaryRows = [
    {
      label: 'Total Active Logged Employees',
      value: totalEmp > 0 ? { formula: `COUNTA('Team Report'!B${dataStartRow}:B${lastDataRow})`, result: totalEmp } : 0,
      numFmt: '0'
    },
    {
      label: 'High Performance Tier (> 80% — Green)',
      value: totalEmp > 0 ? { formula: `COUNTIF('Team Report'!F${dataStartRow}:F${lastDataRow},">0.8")`, result: highCount } : 0,
      numFmt: '0',
      style: TIER_STYLES.high
    },
    {
      label: 'Moderate Performance Tier (65% - 80% — Orange)',
      value: totalEmp > 0 ? { formula: `COUNTIFS('Team Report'!F${dataStartRow}:F${lastDataRow},">=0.65",'Team Report'!F${dataStartRow}:F${lastDataRow},"<=0.8")`, result: moderateCount } : 0,
      numFmt: '0',
      style: TIER_STYLES.moderate
    },
    {
      label: 'Low Performance Tier (1% - 64% — Dark Red)',
      value: totalEmp > 0 ? { formula: `COUNTIF('Team Report'!F${dataStartRow}:F${lastDataRow},"<0.65")`, result: lowCount } : 0,
      numFmt: '0',
      style: TIER_STYLES.low
    },
    {
      label: 'Average Team Productivity',
      value: totalEmp > 0 ? { formula: `AVERAGE('Team Report'!F${dataStartRow}:F${lastDataRow})`, result: avgProdDecimal } : 0,
      numFmt: '0.0%'
    },
    {
      label: 'Average Qualitative Rating (out of 5.0)',
      value: totalEmp > 0 ? { formula: `AVERAGE('Team Report'!G${dataStartRow}:G${lastDataRow})`, result: avgRatingVal } : 0,
      numFmt: '0.00'
    },
    {
      label: 'Employees with Missing Keystrokes (Blue Highlight)',
      value: totalEmp > 0 ? { formula: `COUNTIF('Team Report'!J${dataStartRow}:J${lastDataRow},"-")`, result: missingKeystrokesCount } : 0,
      numFmt: '0',
      style: CELL_HIGHLIGHT_STYLES.missingKeystrokes
    },
    {
      label: 'Employees Logging > 8 Active Hours (Purple Highlight)',
      value: overEightHoursCount,
      numFmt: '0',
      style: CELL_HIGHLIGHT_STYLES.overEightHours
    },
    {
      label: 'Employees Logging < 1 Active Hour (Dark Red Highlight)',
      value: underOneHourCount,
      numFmt: '0',
      style: CELL_HIGHLIGHT_STYLES.underOneHour
    }
  ];

  summaryRows.forEach((item, i) => {
    const r = summarySheet.getRow(4 + i);
    r.height = 22;
    const labelCell = r.getCell(1);
    const valCell = r.getCell(2);
    labelCell.value = item.label;
    valCell.value = item.value;
    valCell.numFmt = item.numFmt;
    labelCell.font = { name: 'Calibri', size: 10.5, bold: true, color: { argb: 'FF0F172A' } };
    valCell.font = { name: 'Calibri', size: 10.5, bold: true, color: { argb: 'FF0F172A' } };
    labelCell.alignment = { vertical: 'middle', horizontal: 'left' };
    valCell.alignment = { vertical: 'middle', horizontal: 'center' };
    if (item.style) {
      applySolidCellStyle(valCell, item.style.fill, item.style.font, true);
    }
    [labelCell, valCell].forEach((c) => {
      c.border = {
        top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
      };
    });
  });

  summarySheet.getColumn(1).width = 52;
  summarySheet.getColumn(2).width = 20;

  const filename = `team_productivity_report_${Date.now()}.xlsx`;
  const filepath = path.join(reportsDir, filename);
  await workbook.xlsx.writeFile(filepath);

  return {
    filename,
    filepath,
    generatedAt: new Date(),
    summary: {
      totalActiveEmployees: totalEmp,
      highCount,
      moderateCount,
      lowCount,
      avgProductivity: Math.round(avgProdDecimal * 1000) / 10,
      avgRating: avgRatingVal,
      missingKeystrokesCount,
      overEightHoursCount,
      underOneHourCount
    }
  };
}

module.exports = {
  isExcludedReportUser,
  normalizeMemberGoalFields,
  computeQualitativeRating,
  getPerformanceGroup,
  computeCombinedScore,
  enrichAndRankTeamMembers,
  buildTeamReportWorkbook
};

