const fs = require('fs');
const os = require('os');
const path = require('path');
const ExcelJS = require('exceljs');
const {
  isExcludedReportUser,
  normalizeMemberGoalFields,
  computeQualitativeRating,
  getPerformanceGroup,
  enrichAndRankTeamMembers,
  buildTeamReportWorkbook
} = require('../utils/teamExcelReport');
const {
  summarizeActivitiesWithSession,
  getEfficiencyLabel,
  getLocalDateKey,
  getIstDayBounds,
  getIstRangeBounds
} = require('../utils/telemetryMetrics');

describe('Team Excel Report (.xlsx) & Unified Telemetry', () => {
  test('filters blank, Bhiv test, Bhiv Sips, and dummy accounts', () => {
    expect(isExcludedReportUser({ name: 'Bhiv test', email: 'test@bhiv.com' })).toBe(true);
    expect(isExcludedReportUser({ name: 'Bhiv Sips', email: 'sips@bhiv.com' })).toBe(true);
    expect(isExcludedReportUser({ name: '', email: '' })).toBe(true);
    expect(isExcludedReportUser({ name: 'Dummy Account', email: 'dummy@example.com' })).toBe(true);
    expect(isExcludedReportUser({ name: 'Rudra Parmeshwar', email: 'rudra@blackholeinfiverse.com' })).toBe(false);
  });

  test('normalizes AIMS, Blockers, and Achievements per spec', () => {
    expect(normalizeMemberGoalFields('-', '', null)).toEqual({
      aim: 'NOT Mention',
      blocker: 'NOT Mention',
      achievement: 'NOT Mention',
      allMissing: true
    });

    expect(normalizeMemberGoalFields('Deploy workflow', 'Staging token pending', '')).toEqual({
      aim: 'Deploy workflow',
      blocker: 'Staging token pending',
      achievement: 'None',
      allMissing: false
    });

    expect(normalizeMemberGoalFields('Deploy workflow', '', 'Deployed PR #42 and passed 50/50 tests')).toEqual({
      aim: 'Deploy workflow',
      blocker: 'None',
      achievement: 'Deployed PR #42 and passed 50/50 tests',
      allMissing: false
    });

    expect(normalizeMemberGoalFields('Research module', '-', '-')).toEqual({
      aim: 'Research module',
      blocker: 'NOT Mention',
      achievement: 'NOT Mention',
      allMissing: false
    });
  });

  test('computes qualitative rating: 0.0 when all missing, high when concrete evidence present', () => {
    const missingGoals = normalizeMemberGoalFields('', '', '');
    expect(computeQualitativeRating({
      ...missingGoals,
      activeSeconds: 8 * 3600,
      avgProductivity: 70
    })).toBe(0.0);

    const strongRating = computeQualitativeRating({
      aim: 'Complete end-to-end production hardening and verify test suite across modules',
      blocker: 'Resolved Docker container mount permission issue on staging VM',
      achievement: 'Merged PR and deployed release; 183/183 unit tests passed with 100% build invariance',
      allMissing: false,
      activeSeconds: 8 * 3600,
      avgProductivity: 82
    });
    expect(strongRating).toBeGreaterThanOrEqual(4.5);
    expect(strongRating).toBeLessThanOrEqual(5.0);
  });

  test('builds two-sheet .xlsx workbook with Idle Time, highlights, and Executive Summary', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'niyantran-xlsx-'));
    try {
      const rawMembers = [
        {
          id: '1',
          employeeId: 'BHIV109',
          name: 'Prakash Yadav',
          email: 'prakash@blackholeinfiverse.com',
          totalActivities: 177,
          avgProductivity: 85,
          activeSeconds: 9 * 3600,
          activeHoursFormatted: '9h 0m',
          idleSeconds: 2700,
          idleTimeFormatted: '0h 45m',
          totalKeystrokes: 2639,
          avgMouse: 83,
          efficiency: getEfficiencyLabel(85, true),
          aim: 'Parikshak evaluation engine schema v1.0',
          blocker: 'Resolved exception boundary panic',
          achievement: 'Verified 183/183 unit tests passed and deployed build'
        },
        {
          id: '2',
          employeeId: 'BHIV154',
          name: 'Gauri Deshpande',
          email: 'gauri@blackholeinfiverse.com',
          totalActivities: 95,
          avgProductivity: 72,
          activeSeconds: 6 * 3600,
          activeHoursFormatted: '6h 0m',
          idleSeconds: 1800,
          idleTimeFormatted: '0h 30m',
          totalKeystrokes: 0, // missing keystrokes -> Blue highlight
          avgMouse: 75,
          efficiency: getEfficiencyLabel(72, true),
          aim: 'Complete UI/UX build for module',
          blocker: 'Work in progress',
          achievement: ''
        },
        {
          id: '3',
          employeeId: 'BHIV9',
          name: 'Karan Bharda',
          email: 'karan@blackholeinfiverse.com',
          totalActivities: 20,
          avgProductivity: 49,
          activeSeconds: 1800, // < 1h -> Dark Red highlight
          activeHoursFormatted: '0h 30m',
          idleSeconds: 3600,
          idleTimeFormatted: '1h 0m',
          totalKeystrokes: 100,
          avgMouse: 50,
          efficiency: getEfficiencyLabel(49, true),
          aim: '-',
          blocker: '-',
          achievement: '-'
        },
        {
          id: '4',
          employeeId: 'BHIV999',
          name: 'Bhiv test',
          email: 'bhivtest@blackholeinfiverse.com',
          totalActivities: 10,
          avgProductivity: 90,
          activeSeconds: 3600,
          activeHoursFormatted: '1h 0m',
          idleSeconds: 0,
          idleTimeFormatted: '0h 0m',
          totalKeystrokes: 50,
          avgMouse: 50,
          efficiency: 'High Efficiency',
          aim: 'Test',
          blocker: 'None',
          achievement: 'Test'
        }
      ];

      const result = await buildTeamReportWorkbook({
        rawMembers,
        startDate: '2026-11-23',
        endDate: '2026-11-23',
        reportsDir: tmpDir
      });

      expect(fs.existsSync(result.filepath)).toBe(true);
      expect(result.summary.totalActiveEmployees).toBe(3); // Bhiv test excluded
      expect(result.summary.highCount).toBe(1);
      expect(result.summary.moderateCount).toBe(1);
      expect(result.summary.lowCount).toBe(1);
      expect(result.summary.missingKeystrokesCount).toBe(1);
      expect(result.summary.overEightHoursCount).toBe(1);
      expect(result.summary.underOneHourCount).toBe(1);

      const wb = new ExcelJS.Workbook();
      await wb.xlsx.readFile(result.filepath);
      expect(wb.worksheets.map((s) => s.name)).toEqual(['Team Report', 'Executive Summary']);

      const teamSheet = wb.getWorksheet('Team Report');
      const headerValues = teamSheet.getRow(8).values.slice(1);
      expect(headerValues).toEqual([
        'Rank', 'Emp ID', 'Name', 'Date', 'Activities', 'Productivity (%)',
        'Rating', 'Active Hour', 'Idle Time', 'Key Strokes', 'Mouse Score',
        'Efficiency', 'AIMS', 'BLOCKERS/ERRORS', 'ACHIEVEMENTS',
        'Combined Score', 'Performance Group'
      ]);

      // Row 9: High (>=80%), Active Hour > 8h -> Purple
      expect(teamSheet.getRow(9).getCell(3).value).toBe('Prakash Yadav');
      expect(teamSheet.getRow(9).getCell(9).value).toBe('0h 45m');
      expect(teamSheet.getRow(9).getCell(8).fill.fgColor.argb).toBe('FF6B21A8');
      expect(teamSheet.getRow(9).getCell(1).fill.fgColor.argb).toBe('FFD1FAE5');

      // Row 10: Moderate (70%-79%), Missing Keystrokes -> Blue, empty Achievement -> 'None'
      expect(teamSheet.getRow(10).getCell(3).value).toBe('Gauri Deshpande');
      expect(teamSheet.getRow(10).getCell(10).value).toBe('-');
      expect(teamSheet.getRow(10).getCell(10).fill.fgColor.argb).toBe('FF1D4ED8');
      expect(teamSheet.getRow(10).getCell(15).value).toBe('None');

      // Row 11: Low (<70%), Active < 1h -> Dark Red, all 3 missing -> NOT Mention + Rating 0.0
      expect(teamSheet.getRow(11).getCell(3).value).toBe('Karan Bharda');
      expect(teamSheet.getRow(11).getCell(7).value).toBe(0);
      expect(teamSheet.getRow(11).getCell(8).fill.fgColor.argb).toBe('FF7F1D1D');
      expect(teamSheet.getRow(11).getCell(13).value).toBe('NOT Mention');
      expect(teamSheet.getRow(11).getCell(13).fill.fgColor.argb).toBe('FF7F1D1D');

      expect(getPerformanceGroup(80).tier).toBe('high');
      expect(getPerformanceGroup(79).tier).toBe('moderate');
      expect(getPerformanceGroup(70).tier).toBe('moderate');
      expect(getPerformanceGroup(69).tier).toBe('low');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('IST day boundary helpers match IST midnight regardless of host timezone', () => {
    expect(getLocalDateKey('2026-11-26T18:30:00.000Z')).toBe('2026-11-27');
    expect(getLocalDateKey('2026-11-26T18:29:59.000Z')).toBe('2026-11-26');
    const bounds = getIstDayBounds('2026-11-27');
    expect(bounds.start.toISOString()).toBe('2026-11-26T18:30:00.000Z');
    expect(bounds.end.toISOString()).toBe('2026-11-27T18:29:59.999Z');
    expect(bounds.dateKey).toBe('2026-11-27');
    const range = getIstRangeBounds('2026-11-27', '2026-11-27');
    expect(range.start.toISOString()).toBe('2026-11-26T18:30:00.000Z');
    expect(range.end.toISOString()).toBe('2026-11-27T18:29:59.999Z');
  });

  test('telemetryMetrics exposes idleTimeFormatted consistent with activeSeconds', () => {
    const now = new Date();
    const res = summarizeActivitiesWithSession([
      {
        timestamp: now,
        interval_seconds: 60,
        keystroke_count: 25,
        mouse_activity_score: 70,
        idle_duration: 0,
        active_application: { name: 'VS Code' }
      },
      {
        timestamp: now,
        interval_seconds: 120,
        keystroke_count: 0,
        mouse_activity_score: 0,
        idle_duration: 360,
        active_application: { name: 'VS Code' }
      }
    ], null);

    expect(res.totalIdleSeconds).toBe(120);
    expect(res.idleTimeFormatted).toBe('0h 2m');
    expect(res.activeSeconds).toBe(60);
    expect(res.productivityEfficiency).toBe('Moderate Efficiency');
  });

  test('generateTeamReport builds a valid PDF with Idle Time, Rating, and Executive Summary', async () => {
    const reportGenerator = require('../services/reportGenerator');
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'niyantran-pdf-'));
    const origDir = reportGenerator.reportsDir;
    const origGather = reportGenerator.gatherTeamReportData.bind(reportGenerator);

    reportGenerator.reportsDir = tmpDir;
    reportGenerator.gatherTeamReportData = async () => ({
      period: { startDate: '2026-11-23', endDate: '2026-11-23' },
      totalEmployees: 2,
      activeMembersCount: 2,
      teamSummary: {
        teamAvgProductivity: 78,
        teamAvgRating: 4.1,
        teamTotalHours: 14,
        teamTotalHoursFormatted: '14h 0m',
        teamTotalIdleHoursFormatted: '1h 15m',
        teamTotalKeystrokes: 2639,
        teamTotalAlerts: 0,
        teamTotalActivities: 197
      },
      members: [
        {
          id: '1',
          employeeId: 'BHIV109',
          name: 'Prakash Yadav',
          email: 'prakash@blackholeinfiverse.com',
          totalActivities: 177,
          avgProductivity: 85,
          activeSeconds: 9 * 3600,
          activeHoursFormatted: '9h 0m',
          idleSeconds: 2700,
          idleTimeFormatted: '0h 45m',
          totalKeystrokes: 2639,
          avgMouse: 83,
          efficiency: 'High Efficiency',
          effColor: '#10b981',
          aim: 'Parikshak evaluation engine schema v1.0',
          blocker: 'Resolved exception boundary panic',
          achievement: 'Verified 183/183 unit tests passed'
        },
        {
          id: '2',
          employeeId: 'BHIV9',
          name: 'Karan Bharda',
          email: 'karan@blackholeinfiverse.com',
          totalActivities: 20,
          avgProductivity: 49,
          activeSeconds: 1800,
          activeHoursFormatted: '0h 30m',
          idleSeconds: 1800,
          idleTimeFormatted: '0h 30m',
          totalKeystrokes: 0,
          avgMouse: 50,
          efficiency: 'Moderate Efficiency',
          effColor: '#f59e0b',
          aim: '-',
          blocker: '-',
          achievement: '-'
        }
      ],
      teamApps: { 'VS Code': 150 },
      alertStats: {},
      dailyTeamScores: []
    });

    try {
      const pdf = await reportGenerator.generateTeamReport('2026-11-23', '2026-11-23');
      expect(fs.existsSync(pdf.filepath)).toBe(true);
      expect(pdf.size).toBeGreaterThan(1500);
      const header = fs.readFileSync(pdf.filepath).subarray(0, 5).toString('utf8');
      expect(header).toBe('%PDF-');
    } finally {
      reportGenerator.reportsDir = origDir;
      reportGenerator.gatherTeamReportData = origGather;
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

