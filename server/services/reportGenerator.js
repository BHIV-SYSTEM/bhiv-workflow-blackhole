const PDFDocument = require('pdfkit');
const fs = require('fs');
const fsPromises = fs.promises;
const path = require('path');
const { ChartJSNodeCanvas } = require('chartjs-node-canvas');
const User = require('../models/User');
const Department = require('../models/Department');
const ScreenCapture = require('../models/ScreenCapture');
const EmployeeActivity = require('../models/EmployeeActivity');
const MonitoringAlert = require('../models/MonitoringAlert');
const Attendance = require('../models/Attendance');
const DailyAttendance = require('../models/DailyAttendance');
const Aim = require('../models/Aim');
const Progress = require('../models/Progress');
const { formatEmployeeId } = require('../utils/employeeId');
const {
  getLocalDateKey,
  getIstRangeBounds,
  eachIstDateKey,
  summarizeActivitiesWithSession,
  resolveSessionsMap
} = require('../utils/telemetryMetrics');
const {
  computeDayProductivity,
  classifyZone,
  efficiencyLabelForDay,
  efficiencyColorForDay,
} = require('../utils/dayProductivity');
const {
  isExcludedReportUser,
  normalizeMemberGoalFields,
  computeQualitativeRating,
  getPerformanceGroup,
  computeCombinedScore,
  enrichAndRankTeamMembers,
  buildTeamReportWorkbook
} = require('../utils/teamExcelReport');

/**
 * Canonical day score used by every productivity display (daily cards, detail
 * chart, and reports). Samples are ordered oldest-first before the recurrence
 * runs, so a report can never disagree with the live monitoring surface.
 */
function dayProductivityFor(activities) {
  try {
    const chronological = Array.isArray(activities)
      ? [...activities].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      : [];
    const result = computeDayProductivity(chronological);
    return { score: result.score, zone: result.zone };
  } catch (error) {
    return { score: 0, zone: 'red' };
  }
}

function formatActiveTime(seconds) {
  if (!seconds || seconds <= 0) return '0h 0m';
  const totalMins = Math.round(seconds / 60);
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  return `${h}h ${m}m`;
}

function getLocalDateString(d) {
  return getLocalDateKey(d);
}

function normalizeGoalSnippet(text, maxLen = 240) {
  if (!text) return '';
  const cleaned = String(text).replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!cleaned || cleaned === '-') return '';
  return cleaned.length > maxLen ? `${cleaned.slice(0, maxLen - 3)}...` : cleaned;
}

/**
 * Collect unique, non-empty Aim, Blocker, and Key Achievement entries grouped by keyFn
 * across both Aim and Progress documents.
 */
function collectGoalFieldsMap(aims = [], progresses = [], keyFn) {
  const bucket = new Map();

  const appendUnique = (key, field, rawVal) => {
    const snippet = normalizeGoalSnippet(rawVal);
    if (!key || !snippet) return;
    if (!bucket.has(key)) {
      bucket.set(key, { aim: [], blocker: [], achievement: [] });
    }
    const entry = bucket.get(key);
    if (!entry[field].includes(snippet)) {
      entry[field].push(snippet);
    }
  };

  (aims || []).forEach((a) => {
    const key = keyFn(a);
    appendUnique(key, 'aim', a.aims);
    appendUnique(key, 'blocker', a.blockers);
    appendUnique(key, 'achievement', a.achievements);
  });

  (progresses || []).forEach((p) => {
    const key = keyFn(p);
    appendUnique(key, 'aim', p.notes);
    appendUnique(key, 'blocker', p.blockers);
    appendUnique(key, 'achievement', p.achievements);
  });

  const aimMap = new Map();
  const blockerMap = new Map();
  const achievementMap = new Map();

  bucket.forEach((val, key) => {
    aimMap.set(key, val.aim.length > 0 ? val.aim.slice(0, 2).join('; ') : '-');
    blockerMap.set(key, val.blocker.length > 0 ? val.blocker.slice(0, 2).join('; ') : '-');
    achievementMap.set(key, val.achievement.length > 0 ? val.achievement.slice(0, 2).join('; ') : '-');
  });

  return { aimMap, blockerMap, achievementMap };
}

class ReportGenerator {
  constructor() {
    this.chartRenderer = new ChartJSNodeCanvas({ 
      width: 700, 
      height: 280,
      backgroundColour: 'white'
    });
    this.reportsDir = process.env.REPORTS_STORAGE_PATH || './uploads/reports';
    this.ensureReportsDirectory();
  }

  parseDateRange(startDate, endDate) {
    return getIstRangeBounds(startDate, endDate);
  }

  async ensureReportsDirectory() {
    try {
      await fsPromises.mkdir(this.reportsDir, { recursive: true });
    } catch (error) {
      console.error('Error creating reports directory:', error);
    }
  }

  /**
   * Generate comprehensive employee monitoring report in PDF format
   */
  async generateEmployeeReport(employeeId, startDate, endDate, options = {}) {
    try {
      const employee = await this.getEmployeeInfo(employeeId);
      const reportData = await this.gatherReportData(employeeId, startDate, endDate);
      
      const doc = new PDFDocument({ 
        size: 'A4',
        layout: 'landscape',
        margin: 35,
        info: {
          Title: `Employee Monitoring Report - ${employee.name}`,
          Author: 'Niyantran Workflow Monitoring System',
          Subject: 'Employee Productivity and Activity Report',
          Keywords: 'monitoring, productivity, analytics, niyantran'
        }
      });

      const filename = `employee_report_${employeeId}_${Date.now()}.pdf`;
      const filepath = path.join(this.reportsDir, filename);

      const writeStream = fs.createWriteStream(filepath);
      doc.pipe(writeStream);

      // PAGE 1: Header, Executive KPI Summary, and Daily Breakdown Table
      await this.addReportHeader(doc, employee, startDate, endDate);
      await this.addExecutiveSummary(doc, reportData);
      await this.addDailyBreakdownTable(doc, reportData);

      // PAGE 2: Top Applications, Activity Timeline, and Policy Alerts
      doc.addPage();
      await this.addApplicationUsageSection(doc, reportData);
      await this.addViolationsSection(doc, reportData);
      await this.addActivityTimelineSection(doc, reportData);

      // PAGE 3: Visual Analytics Charts & Recommendations
      doc.addPage();
      await this.addChartsAndGraphs(doc, reportData);
      await this.addRecommendations(doc, reportData);

      doc.end();

      return new Promise((resolve, reject) => {
        writeStream.on('finish', () => {
          resolve({
            filename,
            filepath,
            size: writeStream.bytesWritten,
            generatedAt: new Date()
          });
        });
        writeStream.on('error', reject);
      });

    } catch (error) {
      console.error('Error generating employee report:', error);
      throw error;
    }
  }

  /**
   * Fetch all necessary data for the report
   */
  async gatherReportData(employeeId, startDate, endDate) {
    const { start, end } = this.parseDateRange(startDate, endDate);

    const [screenshots, activities, alerts, attendances, sessionsMap, aims, progresses] = await Promise.all([
      ScreenCapture.find({
        employee: employeeId,
        timestamp: { $gte: start, $lte: end }
      }).select('timestamp trigger_type is_violation').sort({ timestamp: -1 }).lean(),

      EmployeeActivity.find({
        employee: employeeId,
        timestamp: { $gte: start, $lte: end }
      }).select('timestamp keystroke_count mouse_activity_score mouse_event_count idle_duration interval_seconds app_category productivity_score active_application metadata').sort({ timestamp: -1 }).lean(),

      MonitoringAlert.find({
        employee: employeeId,
        timestamp: { $gte: start, $lte: end }
      }).select('timestamp alert_type severity title description').sort({ timestamp: -1 }).lean(),

      (async () => {
        try {
          const [attList, dailyList] = await Promise.all([
            Attendance.find({
              user: employeeId,
              $or: [
                { date: { $gte: start, $lte: end } },
                { startDayTime: { $gte: start, $lte: end } }
              ]
            }).lean(),
            DailyAttendance.find({
              user: employeeId,
              $or: [
                { date: { $gte: start, $lte: end } },
                { startDayTime: { $gte: start, $lte: end } }
              ]
            }).lean()
          ]);
          const combined = [...(attList || [])];
          const seen = new Set(combined.map(r => getLocalDateKey(r.startDayTime || r.date)));
          (dailyList || []).forEach(d => {
            const key = getLocalDateKey(d.startDayTime || d.date);
            if (key && !seen.has(key)) {
              combined.push({
                ...d,
                hoursWorked: d.totalHoursWorked || d.hoursWorked || 0
              });
              seen.add(key);
            }
          });
          return combined;
        } catch (e) {
          return [];
        }
      })(),

      resolveSessionsMap([employeeId], start, end),

      Aim.find({
        user: employeeId,
        date: { $gte: start, $lte: end }
      }).select('date aims blockers achievements progressPercentage').sort({ date: -1 }).lean(),

      Progress.find({
        user: employeeId,
        date: { $gte: start, $lte: end }
      }).select('date notes blockers achievements progressPercentage').sort({ date: -1 }).lean()
    ]);

    return {
      screenshots: screenshots || [],
      activities: activities || [],
      alerts: alerts || [],
      attendances: attendances || [],
      sessionsMap: sessionsMap || new Map(),
      aims: aims || [],
      progresses: progresses || [],
      period: { startDate, endDate }
    };
  }

  async getEmployeeInfo(employeeId) {
    const emp = await User.findById(employeeId).populate('department', 'name').lean();
    if (!emp) {
      return { name: 'Employee', email: '', employeeId: 'N/A', department: 'General', stillExist: 1 };
    }
    return {
      name: emp.name || 'Employee',
      email: emp.email || '',
      employeeId: emp.employeeId || formatEmployeeId(emp.email),
      department: emp.department?.name || emp.department || 'General',
      stillExist: emp.stillExist
    };
  }

  /**
   * PAGE 1: Header Banner with crisp typography (Landscape A4: 841.89pt wide)
   */
  async addReportHeader(doc, employee, startDate, endDate) {
    const pageWidth = doc.page.width;

    // Header Background Banner
    doc.rect(0, 0, pageWidth, 88)
       .fill('#0f172a'); // Deep slate

    // Left Accent Bar
    doc.rect(0, 0, 6, 88)
       .fill('#3b82f6'); // Bright blue

    // Title
    doc.fillColor('#ffffff')
       .fontSize(18)
       .font('Helvetica-Bold')
       .text('NIYANTRAN WORKFLOW', 35, 18);

    doc.fillColor('#94a3b8')
       .fontSize(10)
       .font('Helvetica')
       .text('Employee Telemetry & Activity Monitoring Report', 35, 40);

    // Metadata Row
    const deptName = typeof employee.department === 'object' ? (employee.department?.name || 'General') : (employee.department || 'General');
    const startStr = new Date(startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const endStr = new Date(endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const empIdStr = employee.employeeId || formatEmployeeId(employee.email);

    doc.fontSize(9)
       .fillColor('#e2e8f0')
       .font('Helvetica-Bold')
       .text(`Employee: `, 35, 60, { continued: true })
       .font('Helvetica')
       .text(`${employee.name} (${empIdStr} • ${employee.email || 'N/A'})`, { continued: true })
       .font('Helvetica-Bold')
       .text(`   •   Department: `, { continued: true })
       .font('Helvetica')
       .text(`${deptName}`);

    doc.fontSize(8.5)
       .fillColor('#94a3b8')
       .text(`Period: ${startStr} to ${endStr}   •   Status: ${employee.stillExist === 0 ? 'Exited Account' : 'Active Employee'}`, 35, 73);

    // Set document cursor below banner
    doc.y = 102;
  }

  /**
   * PAGE 1: Executive KPI Cards (Row of 4 aligned cards across landscape width)
   */
  async addExecutiveSummary(doc, reportData) {
    const summary = this.calculateExecutiveSummary(reportData);

    doc.fontSize(11.5)
       .font('Helvetica-Bold')
       .fillColor('#0f172a')
       .text('EXECUTIVE KPI SUMMARY', 35, doc.y);

    const boxY = doc.y + 6;
    const boxWidth = 142;
    const boxHeight = 54;
    const gap = 15.5;
    const startX = 35;

    const summaryItems = [
      {
        label: 'Productivity Score',
        value: `${summary.productivityScore}%`,
        color: summary.productivityScore >= 80 ? '#10b981' : (summary.productivityScore >= 70 ? '#f59e0b' : '#ef4444')
      },
      {
        label: 'Active Work Hours',
        value: summary.activeHoursFormatted || `${summary.activeHours}h`,
        color: '#0284c7'
      },
      {
        label: 'Idle Time',
        value: summary.idleTimeFormatted || '0h 0m',
        color: '#6366f1'
      },
      {
        label: 'Total Keystrokes',
        value: summary.totalKeystrokes.toLocaleString(),
        color: '#8b5cf6'
      },
      {
        label: 'Security Violations',
        value: `${summary.violations}`,
        color: summary.violations > 0 ? '#ef4444' : '#10b981'
      }
    ];

    summaryItems.forEach((item, index) => {
      const currentX = startX + index * (boxWidth + gap);

      // Card Background with smooth rounded borders
      doc.roundedRect(currentX, boxY, boxWidth, boxHeight, 6)
         .fillAndStroke('#f8fafc', '#e2e8f0');

      // Value
      doc.fillColor(item.color)
         .fontSize(18)
         .font('Helvetica-Bold')
         .text(item.value, currentX, boxY + 10, { width: boxWidth, align: 'center' });

      // Label
      doc.fillColor('#64748b')
         .fontSize(8.5)
         .font('Helvetica')
         .text(item.label, currentX, boxY + 34, { width: boxWidth, align: 'center' });
    });

    // Advance cursor safely
    doc.y = boxY + boxHeight + 16;
  }

  /**
   * Build unified daily breakdown rows shared across Individual PDF, CSV, and Chart
   */
  buildIndividualDailyRows(reportData) {
    const { start, end } = this.parseDateRange(reportData.period.startDate, reportData.period.endDate);
    const activitiesByDay = new Map();

    (reportData.activities || []).forEach(act => {
      const dStr = getLocalDateString(act.timestamp);
      if (!dStr) return;
      if (!activitiesByDay.has(dStr)) activitiesByDay.set(dStr, []);
      activitiesByDay.get(dStr).push(act);
    });

    const sessionByDay = new Map();
    if (reportData.sessionsMap instanceof Map) {
      reportData.sessionsMap.forEach((val) => {
        if (val && val.dateKey) {
          sessionByDay.set(val.dateKey, val);
        }
      });
    }

    if (sessionByDay.size === 0 && reportData.attendances?.length > 0) {
      reportData.attendances.forEach(att => {
        const dKey = getLocalDateString(att.startDayTime || att.date);
        if (!dKey) return;
        let sec = 0;
        if (att.hoursWorked > 0) {
          sec = Math.round(att.hoursWorked * 3600);
        } else if (att.startDayTime) {
          const isToday = dKey === getLocalDateString(new Date());
          const endSession = att.endDayTime
            ? new Date(att.endDayTime)
            : (isToday ? new Date() : new Date(new Date(att.startDayTime).getTime() + 8 * 3600 * 1000));
          sec = Math.max(0, Math.floor((endSession - new Date(att.startDayTime)) / 1000));
        }
        if (sec > 0 && !sessionByDay.has(dKey)) {
          sessionByDay.set(dKey, { sessionSeconds: sec, startTime: att.startDayTime || null, dateKey: dKey });
        }
      });
    }

    const { aimMap, blockerMap, achievementMap } = collectGoalFieldsMap(
      reportData.aims,
      reportData.progresses,
      (docItem) => getLocalDateString(docItem.date)
    );

    const rows = [];
    for (const dStr of eachIstDateKey(start, end)) {
      const dayLogs = activitiesByDay.get(dStr) || [];
      const daySession = sessionByDay.get(dStr) || null;
      const summary = summarizeActivitiesWithSession(dayLogs, daySession);
      const dayProductivity = dayProductivityFor(dayLogs);

      const eff = efficiencyLabelForDay(dayProductivity.score, summary.hasActivity);
      const effColor = efficiencyColorForDay(dayProductivity.score, summary.hasActivity);

      const goals = normalizeMemberGoalFields(
        aimMap.get(dStr),
        blockerMap.get(dStr),
        achievementMap.get(dStr)
      );
      const rating = summary.hasActivity
        ? computeQualitativeRating({
            ...goals,
            activeSeconds: summary.activeSeconds,
            avgProductivity: dayProductivity.score
          })
        : 0;
      const perf = getPerformanceGroup(dayProductivity.score);

      rows.push({
        date: dStr,
        aim: goals.aim,
        blocker: goals.blocker,
        achievement: goals.achievement,
        allLogsMissing: goals.allMissing,
        activitiesCount: summary.logCount,
        avgProd: dayProductivity.score,
        dayProductivity,
        legacyAvgProd: summary.avgProductivityScore,
        rating,
        performanceTier: summary.hasActivity ? perf.tier : 'inactive',
        performanceGroup: summary.hasActivity ? perf.label : 'No Activity',
        activeSeconds: summary.activeSeconds,
        activeHoursFormatted: summary.hasActivity ? formatActiveTime(summary.activeSeconds) : '-',
        idleSeconds: summary.totalIdleSeconds,
        idleTimeFormatted: summary.hasActivity ? formatActiveTime(summary.totalIdleSeconds) : '-',
        keystrokes: summary.totalKeystrokes,
        avgMouse: summary.avgMouseActivity,
        hasActivity: summary.hasActivity,
        eff,
        effColor
      });
    }

    return rows.sort((a, b) => a.date.localeCompare(b.date));
  }

  /**
   * PAGE 1: Daily Breakdown Table (Landscape A4 with AIM, Blocker, Key Achievements)
   */
  async addDailyBreakdownTable(doc, reportData) {
    doc.fontSize(11.5)
       .font('Helvetica-Bold')
       .fillColor('#0f172a')
       .text('DAILY PERFORMANCE BREAKDOWN', 35, doc.y);

    doc.moveDown(0.5);

    const dailyRows = this.buildIndividualDailyRows(reportData);
    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;
    const tableX = 35;
    const tableWidth = 772;
    let currentY = doc.y;

    const printTableHeader = (yPos) => {
      doc.rect(tableX, yPos, tableWidth, 22).fill('#1e293b');
      doc.fillColor('#ffffff').fontSize(7.5).font('Helvetica-Bold');
      doc.text('Date', tableX + 4, yPos + 7, { width: 52 });
      doc.text('AIM', tableX + 58, yPos + 7, { width: 112 });
      doc.text('Blocker', tableX + 172, yPos + 7, { width: 90 });
      doc.text('Achievements', tableX + 264, yPos + 7, { width: 112 });
      doc.text('Acts', tableX + 378, yPos + 7, { width: 32, align: 'center' });
      doc.text('Prod', tableX + 412, yPos + 7, { width: 38, align: 'center' });
      doc.text('Rating', tableX + 452, yPos + 7, { width: 36, align: 'center' });
      doc.text('Active Hr', tableX + 490, yPos + 7, { width: 46, align: 'center' });
      doc.text('Idle Time', tableX + 538, yPos + 7, { width: 46, align: 'center' });
      doc.text('Keys', tableX + 586, yPos + 7, { width: 46, align: 'center' });
      doc.text('Mouse', tableX + 634, yPos + 7, { width: 38, align: 'center' });
      doc.text('Tier / Efficiency', tableX + 674, yPos + 7, { width: 94, align: 'right' });
      return yPos + 22;
    };

    currentY = printTableHeader(currentY);

    dailyRows.forEach((row, idx) => {
      doc.fontSize(7).font('Helvetica');
      const aimH = doc.heightOfString(row.aim, { width: 112 });
      const blkH = doc.heightOfString(row.blocker, { width: 90 });
      const achH = doc.heightOfString(row.achievement, { width: 112 });
      const rowHeight = Math.max(20, Math.ceil(Math.max(aimH, blkH, achH)) + 10);

      if (currentY + rowHeight > pageHeight - 35) {
        doc.addPage();
        doc.rect(0, 0, pageWidth, 38).fill('#0f172a');
        doc.fillColor('#ffffff').fontSize(10).font('Helvetica-Bold')
           .text('NIYANTRAN WORKFLOW - DAILY PERFORMANCE BREAKDOWN (CONTINUED)', 35, 13);
        currentY = printTableHeader(52);
      }

      const count = row.activitiesCount;
      const activeMetric = count > 0 || row.hasActivity;
      const tierBg = !activeMetric
        ? (idx % 2 === 1 ? '#f8fafc' : '#ffffff')
        : row.performanceTier === 'high'
          ? '#dcfce7'
          : row.performanceTier === 'moderate'
            ? '#ffedd5'
            : '#fee2e2';

      doc.rect(tableX, currentY, tableWidth, rowHeight).fill(tierBg);
      doc.rect(tableX, currentY + rowHeight - 1, tableWidth, 1).fill('#e2e8f0');

      doc.fontSize(7).font('Helvetica');
      doc.fillColor('#0f172a').text(row.date, tableX + 4, currentY + 5, { width: 52 });

      if (row.allLogsMissing) {
        doc.fillColor('#991b1b').font('Helvetica-Bold');
      } else {
        doc.fillColor('#1e293b').font('Helvetica');
      }
      doc.text(row.aim, tableX + 58, currentY + 5, { width: 112 });
      doc.fillColor(row.allLogsMissing ? '#991b1b' : '#475569').text(row.blocker, tableX + 172, currentY + 5, { width: 90 });
      doc.fillColor(row.allLogsMissing ? '#991b1b' : '#1e293b').text(row.achievement, tableX + 264, currentY + 5, { width: 112 });

      doc.font('Helvetica').fillColor('#475569').text(count > 0 ? count.toString() : '-', tableX + 378, currentY + 5, { width: 32, align: 'center' });
      doc.fillColor(activeMetric ? row.effColor : '#94a3b8')
         .font(activeMetric ? 'Helvetica-Bold' : 'Helvetica')
         .text(activeMetric ? `${row.avgProd}%` : '-', tableX + 412, currentY + 5, { width: 38, align: 'center' });

      doc.fillColor('#0f172a').font('Helvetica-Bold')
         .text(activeMetric ? `${Number(row.rating || 0).toFixed(1)}` : '-', tableX + 452, currentY + 5, { width: 36, align: 'center' });

      if (activeMetric && row.activeSeconds > 8 * 3600) {
        doc.roundedRect(tableX + 492, currentY + 3, 42, 13, 3).fill('#6b21a8');
        doc.fillColor('#ffffff').font('Helvetica-Bold').text(row.activeHoursFormatted, tableX + 490, currentY + 6, { width: 46, align: 'center' });
      } else if (activeMetric && row.activeSeconds < 3600) {
        doc.roundedRect(tableX + 492, currentY + 3, 42, 13, 3).fill('#7f1d1d');
        doc.fillColor('#ffffff').font('Helvetica-Bold').text(row.activeHoursFormatted, tableX + 490, currentY + 6, { width: 46, align: 'center' });
      } else {
        doc.fillColor('#0f172a').font('Helvetica').text(row.activeHoursFormatted, tableX + 490, currentY + 5, { width: 46, align: 'center' });
      }

      doc.fillColor('#475569').font('Helvetica')
         .text(row.idleTimeFormatted || '-', tableX + 538, currentY + 5, { width: 46, align: 'center' });

      if (activeMetric && (!row.keystrokes || row.keystrokes <= 0)) {
        doc.roundedRect(tableX + 590, currentY + 3, 38, 13, 3).fill('#1d4ed8');
        doc.fillColor('#ffffff').font('Helvetica-Bold').text('-', tableX + 586, currentY + 6, { width: 46, align: 'center' });
      } else {
        doc.fillColor('#475569').font('Helvetica')
           .text(row.keystrokes > 0 ? row.keystrokes.toLocaleString() : '-', tableX + 586, currentY + 5, { width: 46, align: 'center' });
      }

      doc.fillColor('#475569')
         .text(count > 0 ? `${row.avgMouse}%` : '-', tableX + 634, currentY + 5, { width: 38, align: 'center' });
      doc.fillColor(row.effColor).font('Helvetica-Bold')
         .text(activeMetric ? `${row.eff}` : '-', tableX + 674, currentY + 5, { width: 94, align: 'right' });

      currentY += rowHeight;
    });

    doc.y = currentY + 15;
  }

  /**
   * PAGE 2: Top Application Usage & Distribution
   */
  async addApplicationUsageSection(doc, reportData) {
    const pageWidth = doc.page.width;

    // Header on Page 2
    doc.rect(0, 0, pageWidth, 45)
       .fill('#0f172a');

    doc.fillColor('#ffffff')
       .fontSize(12)
       .font('Helvetica-Bold')
       .text('NIYANTRAN WORKFLOW - WORKSPACE & SECURITY AUDIT', 40, 16);

    doc.y = 65;

    doc.fontSize(13)
       .font('Helvetica-Bold')
       .fillColor('#0f172a')
       .text('APPLICATION & WORKSPACE USAGE', 40, doc.y);

    doc.moveDown(0.6);

    const appStats = this.calculateActivityStats(reportData.activities);
    const sortedApps = Object.entries(appStats).sort((a, b) => b[1] - a[1]);
    const totalActs = reportData.activities.length || 1;

    if (sortedApps.length === 0) {
      doc.fontSize(9.5)
         .font('Helvetica')
         .fillColor('#64748b')
         .text('No active application usage recorded in this period.', 40, doc.y);
      doc.moveDown(1.5);
      return;
    }

    const startX = 35;
    let currentY = doc.y;

    sortedApps.slice(0, 6).forEach(([appName, count]) => {
      const pct = Math.round((count / totalActs) * 100);
      const estMinutes = Math.round((count * 30) / 60);

      doc.fontSize(9)
         .font('Helvetica-Bold')
         .fillColor('#1e293b')
         .text(appName, startX, currentY, { width: 280, ellipsis: true });

      doc.font('Helvetica')
         .fillColor('#64748b')
         .text(`${count} sessions (~${estMinutes} mins)`, startX + 290, currentY, { width: 170 });

      // Progress bar background
      const barX = startX + 470;
      const barWidth = 250;
      doc.roundedRect(barX, currentY + 2, barWidth, 7, 3)
         .fill('#e2e8f0');

      // Filled progress
      const fillW = Math.max(3, Math.round((pct / 100) * barWidth));
      doc.roundedRect(barX, currentY + 2, fillW, 7, 3)
         .fill('#3b82f6');

      doc.fontSize(8)
         .fillColor('#1e293b')
         .font('Helvetica-Bold')
         .text(`${pct}%`, barX + barWidth + 8, currentY);

      currentY += 18;
    });

    doc.y = currentY + 15;
  }

  /**
   * PAGE 2: Policy Violations & Security Alerts (No black boxes, 100% visible text)
   */
  async addViolationsSection(doc, reportData) {
    doc.fontSize(13)
       .font('Helvetica-Bold')
       .fillColor('#0f172a')
       .text('POLICY VIOLATIONS & SECURITY ALERTS', 35, doc.y);

    doc.moveDown(0.6);

    const alerts = reportData.alerts || [];

    if (alerts.length === 0) {
      // Clean checkmark card
      const boxY = doc.y;
      doc.roundedRect(35, boxY, 772, 34, 6)
         .fillAndStroke('#f0fdf4', '#bbf7d0');

      doc.fillColor('#15803d')
         .fontSize(9.5)
         .font('Helvetica-Bold')
         .text('✓ No policy violations or security alerts detected during this period.', 50, boxY + 10);

      doc.y = boxY + 46;
      return;
    }

    const boxWidth = 772;
    const boxHeight = 46;

    alerts.slice(0, 4).forEach((alert) => {
      const boxY = doc.y;
      const isHigh = alert.severity === 'high';
      const isMed = alert.severity === 'medium';

      const bg = isHigh ? '#fef2f2' : (isMed ? '#fffbeb' : '#f8fafc');
      const border = isHigh ? '#fca5a5' : (isMed ? '#fde68a' : '#cbd5e1');
      const titleColor = isHigh ? '#b91c1c' : (isMed ? '#b45309' : '#1e40af');

      // Card Background (Light pastel with clean border)
      doc.roundedRect(35, boxY, boxWidth, boxHeight, 6)
         .fillAndStroke(bg, border);

      // Title
      doc.fillColor(titleColor)
         .fontSize(10)
         .font('Helvetica-Bold')
         .text(alert.title || 'Security Notification', 47, boxY + 7, { width: boxWidth - 24 });

      // Description (Crisp charcoal text)
      doc.fillColor('#1e293b')
         .fontSize(8.5)
         .font('Helvetica')
         .text(alert.description || 'Automated policy rule triggered', 47, boxY + 20, { width: boxWidth - 24, lineBreak: false });

      // Severity and Timestamp
      const tsStr = new Date(alert.timestamp).toLocaleString();
      doc.fillColor('#64748b')
         .fontSize(7.5)
         .text(`${tsStr}  •  Severity: ${String(alert.severity || 'low').toUpperCase()}`, 47, boxY + 32);

      doc.y = boxY + boxHeight + 7;
    });

    doc.moveDown(0.6);
  }

  /**
   * PAGE 2: Activity Timeline (Recent Sessions)
   */
  async addActivityTimelineSection(doc, reportData) {
    doc.fontSize(13)
       .font('Helvetica-Bold')
       .fillColor('#0f172a')
       .text('RECENT ACTIVITY TIMELINE', 35, doc.y);

    doc.moveDown(0.5);

    const dayScoreByDate = new Map(
      (reportData.dailyMetrics || []).map((d) => [d.date, d.avgProd])
    );
    const timeline = this.createActivityTimeline(reportData.activities, dayScoreByDate);

    if (timeline.length === 0) {
      doc.fontSize(9)
         .font('Helvetica')
         .fillColor('#64748b')
         .text('No activity timeline recorded for this period.', 35, doc.y);
      return;
    }

    const startX = 35;
    let currentY = doc.y;

    timeline.slice(0, 8).forEach(entry => {
      // Timeline bullet
      doc.circle(startX + 4, currentY + 5, 2.5)
         .fill('#3b82f6');

      // Time
      doc.fontSize(8)
         .font('Helvetica-Bold')
         .fillColor('#0f172a')
         .text(entry.time, startX + 14, currentY, { width: 85 });

      // Activity Description
      doc.font('Helvetica')
         .fillColor('#334155')
         .text(entry.activity, startX + 105, currentY, { width: 660, ellipsis: true });

      currentY += 15;
    });

    doc.y = currentY + 10;
  }

  /**
   * PAGE 3: Visual Analytics Charts
   */
  async addChartsAndGraphs(doc, reportData) {
    const pageWidth = doc.page.width;

    // Header on Page 3
    doc.rect(0, 0, pageWidth, 42)
       .fill('#0f172a');

    doc.fillColor('#ffffff')
       .fontSize(12)
       .font('Helvetica-Bold')
       .text('NIYANTRAN WORKFLOW - VISUAL ANALYTICS & INSIGHTS', 35, 14);

    doc.y = 58;

    doc.fontSize(13)
       .font('Helvetica-Bold')
       .fillColor('#0f172a')
       .text('PRODUCTIVITY TREND ANALYSIS', 35, doc.y);

    doc.moveDown(0.5);

    try {
      const productivityChart = await this.generateProductivityChart(reportData);
      if (productivityChart) {
        const chartY = doc.y;
        doc.image(productivityChart, 35, chartY, { width: 772, height: 210 });
        doc.y = chartY + 225;
      }
    } catch (error) {
      console.warn('Chart render fallback:', error.message);
    }

    doc.moveDown(0.6);
  }

  /**
   * PAGE 3: Recommendations & Official Document Footer
   */
  async addRecommendations(doc, reportData) {
    const pageHeight = doc.page.height;
    doc.fontSize(13)
       .font('Helvetica-Bold')
       .fillColor('#0f172a')
       .text('PERFORMANCE RECOMMENDATIONS', 35, doc.y);

    doc.moveDown(0.5);

    const recommendations = this.generateRecommendations(reportData);

    recommendations.forEach((item, index) => {
      doc.fontSize(9.5)
         .font('Helvetica-Bold')
         .fillColor('#0f172a')
         .text(`${index + 1}. ${item.title}`, 40, doc.y);

      doc.fontSize(8.5)
         .font('Helvetica')
         .fillColor('#475569')
         .text(item.description, 55, doc.y, { width: 740 });

      doc.moveDown(0.5);
    });

    // Official Confidentiality Footer (Positioned within landscape page bounds)
    const footerY = Math.min(doc.y + 18, pageHeight - 30);
    doc.rect(35, footerY, 772, 1)
       .fill('#e2e8f0');

    doc.fontSize(7.5)
       .font('Helvetica')
       .fillColor('#94a3b8')
       .text(`Generated on ${new Date().toLocaleString()}  •  Niyantran Workflow Monitoring System  •  Confidential`, 35, footerY + 7, { align: 'center', width: 772, lineBreak: false });
  }

  /**
   * Data calculation helpers
   */
  calculateExecutiveSummary(reportData) {
    const activities = reportData.activities || [];
    const attendances = reportData.attendances || [];
    const sessionsMap = reportData.sessionsMap instanceof Map ? reportData.sessionsMap : new Map();

    const activitiesByDay = new Map();
    activities.forEach(act => {
      const dKey = getLocalDateKey(act.timestamp);
      if (!dKey) return;
      if (!activitiesByDay.has(dKey)) activitiesByDay.set(dKey, []);
      activitiesByDay.get(dKey).push(act);
    });

    const sessionByDay = new Map();
    sessionsMap.forEach((val) => {
      if (val && val.dateKey) {
        sessionByDay.set(val.dateKey, val);
      }
    });

    // Fallback to attendances if caller passed mock reportData without sessionsMap
    if (sessionByDay.size === 0 && attendances.length > 0) {
      attendances.forEach(att => {
        const dKey = getLocalDateKey(att.startDayTime || att.date);
        if (!dKey) return;
        let sec = 0;
        if (att.hoursWorked > 0) {
          sec = Math.round(att.hoursWorked * 3600);
        } else if (att.startDayTime) {
          const isToday = dKey === getLocalDateKey(new Date());
          const endSession = att.endDayTime ? new Date(att.endDayTime) : (isToday ? new Date() : new Date(att.startDayTime));
          sec = Math.max(0, Math.floor((endSession - new Date(att.startDayTime)) / 1000));
        }
        if (sec > 0 && !sessionByDay.has(dKey)) {
          sessionByDay.set(dKey, { sessionSeconds: sec, startTime: att.startDayTime || null, dateKey: dKey });
        }
      });
    }

    const allDays = new Set([...activitiesByDay.keys(), ...sessionByDay.keys()]);
    let totalKeys = 0;
    let totalActiveSec = 0;
    let totalIdleSec = 0;
    let prodDaySum = 0;
    let legacyProdDaySum = 0;
    let prodDayCount = 0;

    allDays.forEach((dKey) => {
      const dayLogs = activitiesByDay.get(dKey) || [];
      const daySession = sessionByDay.get(dKey) || null;
      const summary = summarizeActivitiesWithSession(dayLogs, daySession);
      totalKeys += summary.totalKeystrokes;
      totalActiveSec += summary.activeSeconds;
      totalIdleSec += summary.totalIdleSeconds;
      if (summary.hasActivity) {
        prodDaySum += dayProductivityFor(dayLogs).score;
        legacyProdDaySum += summary.avgProductivityScore;
        prodDayCount++;
      }
    });

    const overallSummary = summarizeActivitiesWithSession(activities, null);
    const avgProd = prodDayCount > 0 ? Math.round(prodDaySum / prodDayCount) : 0;
    const zone = classifyZone(avgProd, prodDayCount > 0);
    const activeHours = Math.round((totalActiveSec / 3600) * 10) / 10;
    const activeHoursFormatted = formatActiveTime(totalActiveSec);
    const idleTimeFormatted = formatActiveTime(totalIdleSec);
    const avgMouse = overallSummary.avgMouseActivity;

    return {
      productivityScore: avgProd,
      dayProductivity: { score: avgProd, zone },
      legacyAvgProductivityScore: prodDayCount > 0 ? Math.round(legacyProdDaySum / prodDayCount) : 0,
      productivityEfficiency: efficiencyLabelForDay(avgProd, prodDayCount > 0),
      activeHours,
      activeHoursFormatted,
      activeSeconds: totalActiveSec,
      idleSeconds: totalIdleSec,
      idleTimeFormatted,
      totalKeystrokes: totalKeys,
      avgMouseActivity: avgMouse,
      violations: reportData.alerts?.length || 0,
      focusScore: avgProd > 0 ? Math.min(100, Math.round((avgProd * 0.7) + (avgMouse * 0.3))) : 0
    };
  }

  calculateActivityStats(activities) {
    const stats = {};
    (activities || []).forEach(act => {
      let appName = act.active_application?.name;
      if (!appName || appName === 'Unknown' || appName === 'null') {
        const isActive = (act.keystroke_count || 0) > 0 || (act.mouse_activity_score || 0) >= 15;
        appName = isActive ? 'Active Desktop Workspace' : 'System Background';
      }
      stats[appName] = (stats[appName] || 0) + 1;
    });
    return stats;
  }

  createActivityTimeline(activities, dayScoreByDate = new Map()) {
    return (activities || []).slice(0, 15).map(act => {
      let appName = act.active_application?.name;
      if (!appName || appName === 'Unknown' || appName === 'null') {
        const isActive = (act.keystroke_count || 0) > 0 || (act.mouse_activity_score || 0) >= 15;
        appName = isActive ? 'Active Desktop Workspace' : 'System Background';
      }
      const title = act.active_application?.title ? ` - ${act.active_application.title}` : '';
      const canonicalScore = dayScoreByDate.get(getLocalDateKey(act.timestamp));
      const prod = Number.isFinite(canonicalScore) ? ` (Day Score: ${canonicalScore}%)` : '';
      const timeStr = new Date(act.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      return {
        time: timeStr,
        activity: `${appName}${title}${prod}`
      };
    });
  }

  generateRecommendations(reportData) {
    const summary = this.calculateExecutiveSummary(reportData);
    const recs = [];

    if (summary.productivityScore < 60) {
      recs.push({
        title: 'Structured Work Blocks',
        description: 'Implement focused 45-minute working intervals with targeted deliverables to boost consistency.'
      });
    } else {
      recs.push({
        title: 'Maintain Productive Cadence',
        description: 'Activity rhythms demonstrate strong workflow discipline. Continue regular task execution habits.'
      });
    }

    if (summary.violations > 0) {
      recs.push({
        title: 'Review System Alerts & Idle Thresholds',
        description: 'Resolve recurring idle timeouts by ensuring work sessions are properly concluded prior to breaks.'
      });
    }

    recs.push({
      title: 'Ergonomic & Activity Balance',
      description: 'Maintain steady mouse and keyboard inputs while ensuring short screen breaks during intensive coding.'
    });

    return recs;
  }

  /**
   * Chart generation with actual telemetry
   */
  async generateProductivityChart(reportData) {
    try {
      const labels = this.getTimeLabels(reportData.period);
      const data = this.getProductivityData(reportData);

      const chartConfig = {
        type: 'line',
        data: {
          labels,
          datasets: [{
            label: 'Daily Productivity Score (%)',
            data,
            borderColor: '#2563eb',
            backgroundColor: 'rgba(37, 99, 235, 0.1)',
            fill: true,
            tension: 0.3,
            borderWidth: 2,
            pointBackgroundColor: '#2563eb',
            pointRadius: 4
          }]
        },
        options: {
          responsive: false,
          animation: false,
          plugins: {
            legend: {
              display: true,
              labels: { font: { size: 10 } }
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              max: 100,
              ticks: { font: { size: 9 }, stepSize: 20 }
            },
            x: {
              ticks: { font: { size: 8 } }
            }
          }
        }
      };

      return await this.chartRenderer.renderToBuffer(chartConfig);
    } catch (error) {
      console.warn('Error generating productivity chart buffer:', error.message);
      return null;
    }
  }

  getTimeLabels(period) {
    const labels = [];
    const start = new Date(period.startDate);
    const end = new Date(period.endDate);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      labels.push(`${d.getMonth() + 1}/${d.getDate()}`);
    }
    return labels;
  }

  getProductivityData(reportData) {
    return this.buildIndividualDailyRows(reportData).map(row => row.avgProd);
  }

  /**
   * Comprehensive CSV Export method
   */
  async exportToCSV(employeeId, startDate, endDate, dataType = 'all') {
    try {
      const employee = await this.getEmployeeInfo(employeeId);
      const reportData = await this.gatherReportData(employeeId, startDate, endDate);
      const summary = this.calculateExecutiveSummary(reportData);

      const startStr = new Date(startDate).toISOString().split('T')[0];
      const endStr = new Date(endDate).toISOString().split('T')[0];

      let csv = 'NIYANTRAN WORKFLOW - EMPLOYEE PERFORMANCE REPORT\n';
      csv += `Employee Name,${employee.name}\n`;
      csv += `Employee ID,${employee.employeeId || formatEmployeeId(employee.email)}\n`;
      csv += `Email,${employee.email}\n`;
      csv += `Department,${employee.department}\n`;
      csv += `Status,${employee.stillExist === 0 ? 'Exited' : 'Active'}\n`;
      csv += `Period,${startStr} to ${endStr}\n`;
      csv += `Generated At,${new Date().toISOString()}\n\n`;

      const empIdFormatted = employee.employeeId || formatEmployeeId(employee.email) || 'N/A';

      csv += 'EXECUTIVE KPI SUMMARY\n';
      csv += 'Employee ID,Employee Name,Total Activities,Average Productivity Score (%),Active Hours,Total Keystrokes,Total Alerts\n';
      csv += `"${empIdFormatted}","${employee.name}",${reportData.activities.length},${summary.productivityScore}%,${summary.activeHoursFormatted || `${summary.activeHours}h`},${summary.totalKeystrokes},${summary.violations}\n\n`;

      const cleanField = (txt) => {
        if (!txt || txt === '-') return '-';
        return String(txt).replace(/"/g, '""').replace(/[\r\n\t]+/g, ' ').trim();
      };

      csv += 'DAILY PERFORMANCE BREAKDOWN\n';
      csv += 'Employee ID,Date,AIM,Blocker,Achievement,Total Activities,Productivity Score (%),Active Hours,Total Keystrokes,Mouse Activity (%),Efficiency Rating\n';

      const dailyRows = this.buildIndividualDailyRows(reportData);
      dailyRows.forEach(day => {
        const aim = cleanField(day.aim);
        const blocker = cleanField(day.blocker);
        const achievement = cleanField(day.achievement);
        const hasMetrics = day.activitiesCount > 0 || day.hasActivity;

        csv += `"${empIdFormatted}","${day.date}","${aim}","${blocker}","${achievement}",${day.activitiesCount > 0 ? day.activitiesCount : '-'},"${hasMetrics ? `${day.avgProd}%` : '-'}","${day.activeHoursFormatted}",${day.keystrokes > 0 ? day.keystrokes : '-'},"${day.activitiesCount > 0 ? `${day.avgMouse}%` : '-'}","${hasMetrics ? day.eff : '-'}"\n`;
      });
      csv += '\n';

      csv += 'DETAILED ACTIVITY LOGS\n';
      csv += 'Employee ID,Timestamp,Application,Window Title,Day Score (%),Idle Duration (s),Keystrokes,Mouse Score (%)\n';

      if (reportData.activities.length > 0) {
        const dayScoreByDate = new Map(dailyRows.map((day) => [day.date, day.avgProd]));
        reportData.activities.forEach(act => {
          const ts = act.timestamp ? new Date(act.timestamp).toISOString() : '';
          const app = (act.active_application?.name || 'Workspace').replace(/"/g, '""');
          const title = (act.active_application?.title || '').replace(/"/g, '""');
          const canonicalScore = dayScoreByDate.get(getLocalDateKey(act.timestamp));
          const dayScoreText = Number.isFinite(canonicalScore) ? canonicalScore : 0;
          csv += `"${empIdFormatted}","${ts}","${app}","${title}",${dayScoreText},${act.idle_duration || 0},${act.keystroke_count || 0},${act.mouse_activity_score || 0}\n`;
        });
      } else {
        csv += 'No activity logs recorded in this period\n';
      }

      const filename = `employee_export_${employeeId}_${Date.now()}.csv`;
      const filepath = path.join(this.reportsDir, filename);
      await fsPromises.writeFile(filepath, '\uFEFF' + csv, 'utf8');

      return {
        filename,
        filepath,
        generatedAt: new Date()
      };
    } catch (error) {
      console.error('Error in exportToCSV:', error);
      throw error;
    }
  }

  /**
   * TEAM REPORT: Gather aggregated telemetry for all members
   */
  async gatherTeamReportData(startDate, endDate, options = {}) {
    const { start, end } = this.parseDateRange(startDate, endDate);

    let userQuery = { role: { $nin: ['admin', 'Admin'] } };
    if (!options.includeExited) {
      userQuery.stillExist = 1; // Strictly only active users
    }
    if (options.department && options.department !== 'all') {
      userQuery.department = options.department;
    }
    if (Array.isArray(options.employeeIds) && options.employeeIds.length > 0) {
      userQuery._id = { $in: options.employeeIds };
    }

    const rawEmployees = await User.find(userQuery)
      .select('name email department stillExist role employeeId')
      .populate('department', 'name')
      .lean();

    const employees = rawEmployees.filter((emp) => !isExcludedReportUser(emp));
    const empIds = employees.map(e => e._id);

    if (empIds.length === 0) {
      return {
        period: { startDate, endDate },
        totalEmployees: 0,
        activeMembersCount: 0,
        teamSummary: {
          teamAvgProductivity: 0,
          teamTotalHours: 0,
          teamTotalHoursFormatted: '0h 0m',
          teamTotalIdleHoursFormatted: '0h 0m',
          teamTotalKeystrokes: 0,
          teamTotalAlerts: 0,
          teamTotalActivities: 0,
          teamAvgRating: 0
        },
        members: [],
        teamApps: {},
        alertStats: {},
        dailyTeamScores: []
      };
    }

    // Unified single source of truth: fetch activity rows once and evaluate every day
    // with summarizeActivitiesWithSession() from telemetryMetrics.js so Reports and
    // Employee Monitoring always produce identical metrics.
    const [allActivities, alertTypesData, empAlertsData, sessionsMap, aimsData, progressesData] = await Promise.all([
      EmployeeActivity.find({
        employee: { $in: empIds },
        timestamp: { $gte: start, $lte: end }
      })
      .select('employee timestamp keystroke_count mouse_activity_score mouse_event_count idle_duration interval_seconds app_category active_application metadata')
      .sort({ timestamp: 1 })
      .lean(),

      // Team alert categories breakdown
      MonitoringAlert.aggregate([
        {
          $match: {
            employee: { $in: empIds },
            timestamp: { $gte: start, $lte: end }
          }
        },
        {
          $group: {
            _id: { $ifNull: ['$alert_type', { $ifNull: ['$severity', 'general_alert'] }] },
            count: { $sum: 1 }
          }
        }
      ]),

      // Alert count per employee
      MonitoringAlert.aggregate([
        {
          $match: {
            employee: { $in: empIds },
            timestamp: { $gte: start, $lte: end }
          }
        },
        {
          $group: {
            _id: '$employee',
            alertsCount: { $sum: 1 }
          }
        }
      ]),

      // Unified session durations (WorkSession > Attendance > DailyAttendance)
      resolveSessionsMap(empIds, start, end),

      // Team daily aims
      Aim.find({
        user: { $in: empIds },
        date: { $gte: start, $lte: end }
      }).select('user date aims blockers achievements progressPercentage').sort({ date: -1 }).lean(),

      // Team progress updates
      Progress.find({
        user: { $in: empIds },
        date: { $gte: start, $lte: end }
      }).select('user date notes blockers achievements progressPercentage').sort({ date: -1 }).lean()
    ]);

    const {
      aimMap: empAimMap,
      blockerMap: empBlockerMap,
      achievementMap: empAchieveMap
    } = collectGoalFieldsMap(
      aimsData,
      progressesData,
      (docItem) => (docItem.user ? docItem.user.toString() : null)
    );

    const empAlertsMap = new Map();
    empAlertsData.forEach(a => {
      if (a._id) empAlertsMap.set(a._id.toString(), a.alertsCount);
    });

    const teamApps = {};
    const dailyByEmpMap = new Map();
    for (const act of allActivities) {
      const empIdStr = act?.employee ? act.employee.toString() : null;
      const dKey = getLocalDateKey(act?.timestamp);
      if (empIdStr && dKey) {
        if (!dailyByEmpMap.has(empIdStr)) dailyByEmpMap.set(empIdStr, new Map());
        const empDays = dailyByEmpMap.get(empIdStr);
        if (!empDays.has(dKey)) empDays.set(dKey, []);
        empDays.get(dKey).push(act);
      }
      let appName = act?.active_application?.name || 'Desktop Workspace';
      if (appName === 'Unknown' || appName === 'null') appName = 'Desktop Workspace';
      teamApps[appName] = (teamApps[appName] || 0) + 1;
    }

    const alertStats = {};
    let teamTotalAlerts = 0;
    alertTypesData.forEach(al => {
      const type = al._id || 'general_alert';
      alertStats[type] = al.count;
      teamTotalAlerts += al.count;
    });

    const dailyTeamMap = {};
    for (const dStr of eachIstDateKey(start, end)) {
      dailyTeamMap[dStr] = { sum: 0, count: 0 };
    }

    const sessionByEmpMap = new Map();
    if (sessionsMap instanceof Map) {
      sessionsMap.forEach((val) => {
        if (!val?.empId || !val?.dateKey) return;
        if (!sessionByEmpMap.has(val.empId)) sessionByEmpMap.set(val.empId, new Map());
        sessionByEmpMap.get(val.empId).set(val.dateKey, val);
      });
    }

    let teamTotalActivities = 0;
    const members = employees.map(emp => {
      const idStr = emp._id.toString();
      const empDays = dailyByEmpMap.get(idStr) || new Map();
      const empSessions = sessionByEmpMap.get(idStr) || new Map();
      const allDayKeys = new Set([...empDays.keys(), ...empSessions.keys()]);

      let totalActivities = 0;
      let keystrokes = 0;
      let totalIdleSec = 0;
      let effectiveActiveSec = 0;
      let prodDaySum = 0;
      let legacyProdDaySum = 0;
      let mouseDaySum = 0;
      let mouseDayCount = 0;
      let workedDays = 0;

      allDayKeys.forEach(dKey => {
        const dayLogs = empDays.get(dKey) || [];
        const daySession = empSessions.get(dKey) || null;
        const dayMetrics = summarizeActivitiesWithSession(dayLogs, daySession);
        if (!dayMetrics.hasActivity) return;

        const dayProductivity = dayProductivityFor(dayLogs);
        workedDays++;
        totalActivities += dayMetrics.logCount;
        keystrokes += dayMetrics.totalKeystrokes;
        totalIdleSec += dayMetrics.totalIdleSeconds;
        effectiveActiveSec += dayMetrics.activeSeconds;
        prodDaySum += dayProductivity.score;
        legacyProdDaySum += dayMetrics.avgProductivityScore;
        if (dayMetrics.avgMouseActivity > 0) {
          mouseDaySum += dayMetrics.avgMouseActivity;
          mouseDayCount++;
        }

        if (dailyTeamMap[dKey]) {
          dailyTeamMap[dKey].sum += dayProductivity.score;
          dailyTeamMap[dKey].count += 1;
        }
      });

      teamTotalActivities += totalActivities;
      const alertsCount = empAlertsMap.get(idStr) || 0;

      const avgProd = workedDays > 0 ? Math.round(prodDaySum / workedDays) : 0;
      const activeHoursDecimal = Math.round((effectiveActiveSec / 3600) * 10) / 10;
      const activeHoursFormatted = formatActiveTime(effectiveActiveSec);
      const idleTimeFormatted = formatActiveTime(totalIdleSec);
      const idleTime = `${Math.floor(totalIdleSec / 60)}m`;
      const avgMouse = mouseDayCount > 0 ? Math.round(mouseDaySum / mouseDayCount) : 0;
      const hasActivity = workedDays > 0 || effectiveActiveSec > 0;

      const avgZone = classifyZone(avgProd, hasActivity);
      const efficiency = efficiencyLabelForDay(avgProd, hasActivity);
      const effColor = efficiencyColorForDay(avgProd, hasActivity);

      const goals = normalizeMemberGoalFields(
        empAimMap.get(idStr),
        empBlockerMap.get(idStr),
        empAchieveMap.get(idStr)
      );
      const rating = computeQualitativeRating({
        ...goals,
        activeSeconds: effectiveActiveSec,
        avgProductivity: avgProd
      });
      const perf = getPerformanceGroup(avgProd);
      const combinedScore = computeCombinedScore({
        rating,
        avgProductivity: avgProd,
        activeSeconds: effectiveActiveSec
      });

      return {
        id: idStr,
        name: emp.name || 'Employee',
        email: emp.email || '',
        employeeId: emp.employeeId || formatEmployeeId(emp.email),
        department: typeof emp.department === 'object' ? (emp.department?.name || 'General') : (emp.department || 'General'),
        stillExist: emp.stillExist,
        totalActivities,
        workedDays,
        avgProductivity: avgProd,
        dayProductivity: { score: avgProd, zone: avgZone },
        legacyAvgProductivity: workedDays > 0 ? Math.round(legacyProdDaySum / workedDays) : 0,
        activeHours: activeHoursDecimal,
        activeHoursFormatted,
        activeSeconds: effectiveActiveSec,
        idleSeconds: totalIdleSec,
        idleTime,
        idleTimeFormatted,
        totalKeystrokes: keystrokes,
        avgMouse,
        alertsCount,
        efficiency,
        effColor,
        aim: goals.aim,
        blocker: goals.blocker,
        achievement: goals.achievement,
        allLogsMissing: goals.allMissing,
        rating,
        combinedScore,
        performanceGroup: hasActivity ? perf.label : 'No Activity',
        performanceTier: hasActivity ? perf.tier : 'inactive'
      };
    });

    members.sort((a, b) => {
      if (b.totalActivities !== a.totalActivities) {
        return b.totalActivities - a.totalActivities;
      }
      return b.activeSeconds - a.activeSeconds;
    });

    const activeMembers = members.filter(m => m.totalActivities > 0 || m.activeSeconds > 0);
    const teamAvgProd = activeMembers.length > 0
      ? Math.round(activeMembers.reduce((sum, m) => sum + m.avgProductivity, 0) / activeMembers.length)
      : 0;
    const teamAvgRating = activeMembers.length > 0
      ? Math.round((activeMembers.reduce((sum, m) => sum + (m.rating || 0), 0) / activeMembers.length) * 100) / 100
      : 0;
    const teamTotalHours = Math.round(members.reduce((sum, m) => sum + (m.activeSeconds / 3600), 0) * 10) / 10;
    const teamTotalKeystrokes = members.reduce((sum, m) => sum + m.totalKeystrokes, 0);
    const teamTotalIdleSeconds = members.reduce((sum, m) => sum + (m.idleSeconds || 0), 0);

    return {
      period: { startDate, endDate },
      totalEmployees: employees.length,
      activeMembersCount: activeMembers.length,
      teamSummary: {
        teamAvgProductivity: teamAvgProd,
        teamAvgDayProductivity: teamAvgProd,
        teamAvgDayProductivityZone: classifyZone(teamAvgProd, activeMembers.length > 0),
        legacyTeamAvgProductivity: activeMembers.length > 0
          ? Math.round(activeMembers.reduce((sum, m) => sum + (m.legacyAvgProductivity || 0), 0) / activeMembers.length)
          : 0,
        teamAvgRating,
        teamTotalHours,
        teamTotalHoursFormatted: formatActiveTime(members.reduce((sum, m) => sum + m.activeSeconds, 0)),
        teamTotalIdleHoursFormatted: formatActiveTime(teamTotalIdleSeconds),
        teamTotalKeystrokes,
        teamTotalAlerts,
        teamTotalActivities
      },
      members,
      teamApps,
      alertStats,
      dailyTeamScores: Object.entries(dailyTeamMap).map(([date, d]) => ({
        date,
        score: d.count > 0 ? Math.round(d.sum / d.count) : 0
      })).sort((a, b) => a.date.localeCompare(b.date))
    };
  }

  /**
   * TEAM REPORT: Consolidated All-Members PDF (Landscape A4 with AIM, Blocker, Key Achievements)
   */
  async generateTeamReport(startDate, endDate, options = {}) {
    try {
      const data = await this.gatherTeamReportData(startDate, endDate, options);
      const doc = new PDFDocument({
        size: 'A4',
        layout: 'landscape',
        margin: 35,
        info: {
          Title: 'Consolidated Team Performance Report',
          Author: 'Niyantran Workflow Monitoring System',
          Subject: 'All Members Performance & Telemetry Audit'
        }
      });

      const filename = `team_report_${Date.now()}.pdf`;
      const filepath = path.join(this.reportsDir, filename);
      const writeStream = fs.createWriteStream(filepath);
      doc.pipe(writeStream);

      const pageWidth = doc.page.width;   // 841.89pt in landscape A4
      const pageHeight = doc.page.height; // 595.28pt in landscape A4
      const sDate = new Date(startDate);
      const eDate = new Date(endDate);
      const isSameDay = sDate.toDateString() === eDate.toDateString();
      const sDay = String(sDate.getDate()).padStart(2, '0');
      const sMonth = String(sDate.getMonth() + 1).padStart(2, '0');
      const eDay = String(eDate.getDate()).padStart(2, '0');
      const eMonth = String(eDate.getMonth() + 1).padStart(2, '0');
      const dateDisplay = isSameDay ? `${sDay}/${sMonth}` : `${sDay}/${sMonth} - ${eDay}/${eMonth}`;
      const periodLabel = isSameDay ? `Date: ${sDay}/${sMonth}/${sDate.getFullYear()}` : `Period: ${sDay}/${sMonth}/${sDate.getFullYear()} to ${eDay}/${eMonth}/${eDate.getFullYear()}`;

      const rankedMembers = enrichAndRankTeamMembers(data.members);
      const highTierCount = rankedMembers.filter(m => m.performanceTier === 'high').length;
      const moderateTierCount = rankedMembers.filter(m => m.performanceTier === 'moderate').length;
      const lowTierCount = rankedMembers.filter(m => m.performanceTier === 'low').length;
      const missingKeyCount = rankedMembers.filter(m => !m.totalKeystrokes || m.totalKeystrokes <= 0).length;
      const overEightCount = rankedMembers.filter(m => (m.activeSeconds || 0) > 8 * 3600).length;
      const underOneCount = rankedMembers.filter(m => (m.activeSeconds || 0) < 3600).length;
      const avgTeamProd = rankedMembers.length > 0
        ? Math.round(rankedMembers.reduce((s, m) => s + Number(m.avgProductivity || 0), 0) / rankedMembers.length)
        : 0;
      const avgTeamRating = rankedMembers.length > 0
        ? (rankedMembers.reduce((s, m) => s + Number(m.rating || 0), 0) / rankedMembers.length).toFixed(2)
        : '0.00';
      const totalActiveSecSum = rankedMembers.reduce((s, m) => s + Number(m.activeSeconds || 0), 0);
      const totalIdleSecSum = rankedMembers.reduce((s, m) => s + Number(m.idleSeconds || 0), 0);
      const totalKeystrokesSum = rankedMembers.reduce((s, m) => s + Number(m.totalKeystrokes || 0), 0);

      // ==================== PAGE 1 ====================
      // Header Banner
      doc.rect(0, 0, pageWidth, 88).fill('#0f172a');
      doc.rect(0, 0, 6, 88).fill('#6366f1');

      doc.fillColor('#ffffff').fontSize(18).font('Helvetica-Bold').text('NIYANTRAN WORKFLOW', 35, 18);
      doc.fillColor('#94a3b8').fontSize(10).font('Helvetica').text('Consolidated Team Performance & Telemetry Report', 35, 40);

      doc.fontSize(9).fillColor('#e2e8f0').font('Helvetica-Bold')
         .text('Report Scope: ', 35, 60, { continued: true })
         .font('Helvetica').text(`Active Logged Employees: ${rankedMembers.length}   •   ${periodLabel}`);

      doc.fontSize(8.5).fillColor('#94a3b8')
         .text(`Generated on ${new Date().toLocaleString()}   •   Excludes Blank, Test & Zero-Activity Dummy Accounts`, 35, 73);

      doc.y = 100;

      // Executive KPI Cards (5 aligned across 772pt)
      doc.fontSize(11).font('Helvetica-Bold').fillColor('#0f172a').text('TEAM EXECUTIVE KPI SUMMARY', 35, doc.y);

      const boxY = doc.y + 6;
      const boxWidth = 142;
      const boxHeight = 52;
      const gap = 15.5;
      const startX = 35;

      const kpiItems = [
        {
          label: 'Team Avg Productivity',
          value: `${avgTeamProd}%`,
          color: avgTeamProd >= 80 ? '#10b981' : (avgTeamProd >= 70 ? '#f59e0b' : '#dc2626')
        },
        {
          label: 'Avg Rating (out of 5.0)',
          value: `${avgTeamRating}/5`,
          color: '#7c3aed'
        },
        {
          label: 'Total Active Hours',
          value: formatActiveTime(totalActiveSecSum),
          color: '#0284c7'
        },
        {
          label: 'Total Idle Time',
          value: formatActiveTime(totalIdleSecSum),
          color: '#6366f1'
        },
        {
          label: 'Total Keystrokes',
          value: totalKeystrokesSum.toLocaleString(),
          color: '#0f766e'
        }
      ];

      kpiItems.forEach((item, index) => {
        const currentX = startX + index * (boxWidth + gap);
        doc.roundedRect(currentX, boxY, boxWidth, boxHeight, 6).fillAndStroke('#f8fafc', '#e2e8f0');
        doc.fillColor(item.color).fontSize(16).font('Helvetica-Bold').text(item.value, currentX, boxY + 10, { width: boxWidth, align: 'center' });
        doc.fillColor('#64748b').fontSize(8).font('Helvetica').text(item.label, currentX, boxY + 33, { width: boxWidth, align: 'center' });
      });

      // Executive Tier & Highlight Breakdown Strip
      const stripY = boxY + boxHeight + 8;
      doc.roundedRect(35, stripY, 772, 22, 4).fillAndStroke('#f1f5f9', '#cbd5e1');
      doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#0f172a').text(
        `Executive Summary:  Active: ${rankedMembers.length}   |   High (>=80% Green): ${highTierCount}   |   Moderate (70-79% Orange): ${moderateTierCount}   |   Low (<70% Dark Red): ${lowTierCount}   |   Missing Keys (Blue): ${missingKeyCount}   |   >8h Active (Purple): ${overEightCount}   |   <1h Active (Red): ${underOneCount}`,
        43,
        stripY + 7,
        { width: 756, ellipsis: true }
      );

      doc.y = stripY + 30;

      // All Members Roster Table
      doc.fontSize(11).font('Helvetica-Bold').fillColor('#0f172a').text('ALL MEMBERS PERFORMANCE ROSTER', 35, doc.y);
      doc.moveDown(0.4);

      const tableX = 35;
      const tableWidth = 772;
      let currentY = doc.y;

      const printTableHeader = (yPos) => {
        doc.rect(tableX, yPos, tableWidth, 22).fill('#1e293b');
        doc.fillColor('#ffffff').fontSize(7).font('Helvetica-Bold');
        doc.text('#', tableX + 2, yPos + 7, { width: 20, align: 'center' });
        doc.text('Emp ID', tableX + 24, yPos + 7, { width: 42 });
        doc.text('Name', tableX + 68, yPos + 7, { width: 68 });
        doc.text('AIMS', tableX + 138, yPos + 7, { width: 96 });
        doc.text('Blockers', tableX + 236, yPos + 7, { width: 76 });
        doc.text('Achievements', tableX + 314, yPos + 7, { width: 96 });
        doc.text('Acts', tableX + 412, yPos + 7, { width: 28, align: 'center' });
        doc.text('Prod', tableX + 442, yPos + 7, { width: 32, align: 'center' });
        doc.text('Rating', tableX + 476, yPos + 7, { width: 32, align: 'center' });
        doc.text('Active Hr', tableX + 510, yPos + 7, { width: 40, align: 'center' });
        doc.text('Idle Time', tableX + 552, yPos + 7, { width: 38, align: 'center' });
        doc.text('Keys', tableX + 592, yPos + 7, { width: 38, align: 'center' });
        doc.text('Mouse', tableX + 632, yPos + 7, { width: 32, align: 'center' });
        doc.text('Tier / Efficiency', tableX + 666, yPos + 7, { width: 102, align: 'right' });
        return yPos + 22;
      };

      currentY = printTableHeader(currentY);

      rankedMembers.forEach((m) => {
        const aimText = m.aim || 'NOT Mention';
        const blockerText = m.blocker || 'NOT Mention';
        const achievementText = m.achievement || 'NOT Mention';

        doc.fontSize(6.8).font('Helvetica');
        const aimH = doc.heightOfString(aimText, { width: 96 });
        const blkH = doc.heightOfString(blockerText, { width: 76 });
        const achH = doc.heightOfString(achievementText, { width: 96 });
        const rowHeight = Math.max(20, Math.ceil(Math.max(aimH, blkH, achH)) + 9);

        if (currentY + rowHeight > pageHeight - 35) {
          doc.addPage();
          doc.rect(0, 0, pageWidth, 38).fill('#0f172a');
          doc.fillColor('#ffffff').fontSize(10).font('Helvetica-Bold').text('NIYANTRAN WORKFLOW - ALL MEMBERS ROSTER (CONTINUED)', 35, 13);
          currentY = printTableHeader(52);
        }

        const tierBg = m.performanceTier === 'high'
          ? '#dcfce7'
          : m.performanceTier === 'moderate'
            ? '#ffedd5'
            : '#fee2e2';
        const tierFont = m.performanceTier === 'high'
          ? '#065f46'
          : m.performanceTier === 'moderate'
            ? '#9a3412'
            : '#991b1b';

        doc.rect(tableX, currentY, tableWidth, rowHeight).fill(tierBg);
        doc.rect(tableX, currentY + rowHeight - 1, tableWidth, 1).fill('#cbd5e1');

        doc.fontSize(6.8).font('Helvetica');

        // 0. Rank
        doc.fillColor('#0f172a').font('Helvetica-Bold').text(String(m.rank), tableX + 2, currentY + 5, { width: 20, align: 'center' });

        // 1. Emp ID
        doc.fillColor('#4338ca').font('Helvetica-Bold').text(m.employeeId || 'N/A', tableX + 24, currentY + 5, { width: 42, ellipsis: true });

        // 2. Name
        doc.fillColor('#0f172a').font('Helvetica-Bold').text(m.name, tableX + 68, currentY + 5, { width: 68, ellipsis: true });

        // 3. AIMS / Blockers / Achievements
        if (m.allLogsMissing) {
          doc.fillColor('#991b1b').font('Helvetica-Bold');
          doc.text(aimText, tableX + 138, currentY + 5, { width: 96 });
          doc.text(blockerText, tableX + 236, currentY + 5, { width: 76 });
          doc.text(achievementText, tableX + 314, currentY + 5, { width: 96 });
        } else {
          doc.fillColor('#1e293b').font('Helvetica').text(aimText, tableX + 138, currentY + 5, { width: 96 });
          doc.fillColor('#92400e').text(blockerText, tableX + 236, currentY + 5, { width: 76 });
          doc.fillColor('#065f46').text(achievementText, tableX + 314, currentY + 5, { width: 96 });
        }

        // 4. Activities
        doc.fillColor('#334155').font('Helvetica').text(m.totalActivities > 0 ? m.totalActivities.toString() : '0', tableX + 412, currentY + 5, { width: 28, align: 'center' });

        // 5. Productivity
        const hasMetrics = m.totalActivities > 0 || m.activeSeconds > 0;
        doc.fillColor(tierFont).font('Helvetica-Bold')
           .text(hasMetrics ? `${m.avgProductivity}%` : '-', tableX + 442, currentY + 5, { width: 32, align: 'center' });

        // 6. Rating
        doc.fillColor('#0f172a').font('Helvetica-Bold')
           .text(Number(m.rating || 0).toFixed(1), tableX + 476, currentY + 5, { width: 32, align: 'center' });

        // 7. Active Hour (>8h Purple, <1h Dark Red)
        const activeText = hasMetrics ? (m.activeHoursFormatted || `${m.activeHours}h`) : '-';
        if (hasMetrics && m.activeSeconds > 8 * 3600) {
          doc.roundedRect(tableX + 511, currentY + 3, 38, 13, 3).fill('#6b21a8');
          doc.fillColor('#ffffff').font('Helvetica-Bold').text(activeText, tableX + 510, currentY + 6, { width: 40, align: 'center' });
        } else if (hasMetrics && m.activeSeconds < 3600) {
          doc.roundedRect(tableX + 511, currentY + 3, 38, 13, 3).fill('#7f1d1d');
          doc.fillColor('#ffffff').font('Helvetica-Bold').text(activeText, tableX + 510, currentY + 6, { width: 40, align: 'center' });
        } else {
          doc.fillColor('#0f172a').font('Helvetica').text(activeText, tableX + 510, currentY + 5, { width: 40, align: 'center' });
        }

        // 8. Idle Time
        const idleText = (m.idleSeconds > 0 || hasMetrics) ? (m.idleTimeFormatted || '0h 0m') : '-';
        doc.fillColor('#334155').font('Helvetica').text(idleText, tableX + 552, currentY + 5, { width: 38, align: 'center' });

        // 9. Key Strokes (Blue highlight if missing)
        if (!m.totalKeystrokes || m.totalKeystrokes <= 0) {
          doc.roundedRect(tableX + 594, currentY + 3, 34, 13, 3).fill('#1d4ed8');
          doc.fillColor('#ffffff').font('Helvetica-Bold').text('-', tableX + 592, currentY + 6, { width: 38, align: 'center' });
        } else {
          doc.fillColor('#334155').font('Helvetica').text(m.totalKeystrokes.toLocaleString(), tableX + 592, currentY + 5, { width: 38, align: 'center' });
        }

        // 10. Mouse Score
        doc.fillColor('#334155').text(`${m.avgMouse || 0}%`, tableX + 632, currentY + 5, { width: 32, align: 'center' });

        // 11. Performance Group / Efficiency
        doc.fillColor(tierFont).font('Helvetica-Bold')
           .text(`${m.performanceGroup} (${dateDisplay})`, tableX + 666, currentY + 5, { width: 102, align: 'right', ellipsis: true });

        currentY += rowHeight;
      });

      // ==================== PAGE 2: APPLICATION USAGE & AUDIT ====================
      doc.addPage();
      doc.rect(0, 0, pageWidth, 42).fill('#0f172a');
      doc.fillColor('#ffffff').fontSize(12).font('Helvetica-Bold').text('NIYANTRAN WORKFLOW - TEAM SOFTWARE & WORKSPACE AUDIT', 35, 14);

      doc.y = 58;
      doc.fontSize(12.5).font('Helvetica-Bold').fillColor('#0f172a').text('TOP APPLICATIONS USED ACROSS TEAM', 35, doc.y);
      doc.moveDown(0.5);

      const sortedTeamApps = Object.entries(data.teamApps || {}).sort((a, b) => b[1] - a[1]);
      const totalTeamActs = data.teamSummary.teamTotalActivities || 1;

      if (sortedTeamApps.length === 0) {
        doc.fontSize(9.5).font('Helvetica').fillColor('#64748b').text('No application activity recorded across the team in this period.', 35, doc.y);
        doc.moveDown(1);
      } else {
        let appY = doc.y;
        sortedTeamApps.slice(0, 6).forEach(([appName, count]) => {
          const pct = Math.round((count / totalTeamActs) * 100);
          const estHours = Math.round((count * 30 / 3600) * 10) / 10;

          doc.fontSize(9).font('Helvetica-Bold').fillColor('#1e293b').text(appName, 35, appY, { width: 280, ellipsis: true });
          doc.font('Helvetica').fillColor('#64748b').text(`${count} sessions (~${estHours}h total)`, 325, appY, { width: 170 });

          const barX = 505;
          const barWidth = 250;
          doc.roundedRect(barX, appY + 2, barWidth, 7, 3).fill('#e2e8f0');
          const fillW = Math.max(3, Math.round((pct / 100) * barWidth));
          doc.roundedRect(barX, appY + 2, fillW, 7, 3).fill('#6366f1');

          doc.fontSize(8).fillColor('#1e293b').font('Helvetica-Bold').text(`${pct}%`, barX + barWidth + 8, appY);
          appY += 17;
        });
        doc.y = appY + 10;
      }

      // Team Security & Alerts Breakdown
      doc.fontSize(12.5).font('Helvetica-Bold').fillColor('#0f172a').text('TEAM SECURITY ALERTS & NOTIFICATIONS', 35, doc.y);
      doc.moveDown(0.5);

      const alertEntries = Object.entries(data.alertStats || {});
      if (alertEntries.length === 0) {
        const boxY = doc.y;
        doc.roundedRect(35, boxY, 772, 32, 6).fillAndStroke('#f0fdf4', '#bbf7d0');
        doc.fillColor('#15803d').fontSize(9.5).font('Helvetica-Bold')
           .text('✓ Zero security violations or policy warnings triggered across the entire team.', 50, boxY + 9);
        doc.y = boxY + 42;
      } else {
        let alertY = doc.y;
        alertEntries.slice(0, 5).forEach(([alertType, count]) => {
          doc.roundedRect(35, alertY, 772, 24, 4).fillAndStroke('#fffbeb', '#fde68a');
          doc.fillColor('#b45309').fontSize(9).font('Helvetica-Bold')
             .text(`Alert Type: ${alertType}`, 47, alertY + 6, { width: 420 });
          doc.fillColor('#1e293b').font('Helvetica')
             .text(`Total Events: ${count} across team`, 500, alertY + 6, { width: 295, align: 'right' });
          alertY += 28;
        });
        doc.y = alertY + 8;
      }

      // Executive Recommendations for the Team
      doc.fontSize(12.5).font('Helvetica-Bold').fillColor('#0f172a').text('EXECUTIVE WORKFORCE RECOMMENDATIONS', 35, doc.y);
      doc.moveDown(0.4);

      const teamRecs = [
        {
          title: 'Workforce Capacity & Balance',
          desc: `Average team productivity sits at ${data.teamSummary.teamAvgProductivity}%. Maintain balanced task assignments across active staff to prevent individual fatigue.`
        },
        {
          title: 'Idle Threshold Calibration',
          desc: `${data.teamSummary.teamTotalAlerts} security notifications were logged. Standardize clock-out procedures for team breaks to eliminate unnecessary idle warnings.`
        },
        {
          title: 'Continuous Review',
          desc: 'Audit inactive or low-engagement accounts to verify access rights and optimize team license distribution.'
        }
      ];

      teamRecs.forEach((rec, idx) => {
        doc.fontSize(9).font('Helvetica-Bold').fillColor('#0f172a').text(`${idx + 1}. ${rec.title}`, 40, doc.y);
        doc.fontSize(8.5).font('Helvetica').fillColor('#475569').text(rec.desc, 55, doc.y, { width: 740 });
        doc.moveDown(0.4);
      });

      // Footer
      const footerY = Math.min(doc.y + 15, pageHeight - 28);
      doc.rect(35, footerY, 772, 1).fill('#e2e8f0');
      doc.fontSize(7.5).font('Helvetica').fillColor('#94a3b8')
         .text(`Generated on ${new Date().toLocaleString()}  •  Niyantran Workflow Monitoring System  •  Confidential Team Report`, 35, footerY + 6, { align: 'center', width: 772, lineBreak: false });

      doc.end();

      return new Promise((resolve, reject) => {
        writeStream.on('finish', () => {
          resolve({
            filename,
            filepath,
            size: writeStream.bytesWritten,
            generatedAt: new Date()
          });
        });
        writeStream.on('error', reject);
      });

    } catch (error) {
      console.error('Error in generateTeamReport:', error);
      throw error;
    }
  }

  /**
   * Bulk Report alias
   */
  async generateBulkReport(employeeIds, startDate, endDate, options = {}) {
    return this.generateTeamReport(startDate, endDate, { ...options, employeeIds });
  }

  collectGoalFieldsMap(aims, progresses, keyFn) {
    return collectGoalFieldsMap(aims, progresses, keyFn);
  }

  /**
   * TEAM XLSX EXPORT (Two-sheet formatted workbook: Team Report + Executive Summary)
   */
  async exportTeamXLSX(startDate, endDate, options = {}) {
    try {
      await this.ensureReportsDirectory();
      const data = await this.gatherTeamReportData(startDate, endDate, options);
      return await buildTeamReportWorkbook({
        rawMembers: data.members,
        startDate,
        endDate,
        reportsDir: this.reportsDir
      });
    } catch (error) {
      console.error('Error in exportTeamXLSX:', error);
      throw error;
    }
  }

  /**
   * TEAM CSV EXPORT
   */
  async exportTeamCSV(startDate, endDate, options = {}) {
    try {
      const data = await this.gatherTeamReportData(startDate, endDate, options);
      const rankedMembers = enrichAndRankTeamMembers(data.members);
      const sDate = new Date(startDate);
      const eDate = new Date(endDate);
      const isSameDay = sDate.toDateString() === eDate.toDateString();
      const sDay = String(sDate.getDate()).padStart(2, '0');
      const sMonth = String(sDate.getMonth() + 1).padStart(2, '0');
      const eDay = String(eDate.getDate()).padStart(2, '0');
      const eMonth = String(eDate.getMonth() + 1).padStart(2, '0');
      const dateDisplay = isSameDay ? `${sDay}/${sMonth}` : `${sDay}/${sMonth} - ${eDay}/${eMonth}`;

      let csv = 'Rank,Emp ID,Name,Date,Activities,Productivity (%),Rating,Active Hour,Idle Time,Key Strokes,Mouse Score,Efficiency,AIMS,BLOCKERS/ERRORS,ACHIEVEMENTS,Combined Score,Performance Group\n';

      const cleanField = (txt) => {
        if (!txt || txt === '-') return '-';
        return String(txt).replace(/"/g, '""').replace(/[\r\n\t]+/g, ' ').trim();
      };

      rankedMembers.forEach(m => {
        const empId = (m.employeeId || formatEmployeeId(m.email) || 'N/A').replace(/"/g, '""');
        const name = (m.name || 'Employee').replace(/"/g, '""');
        const aim = cleanField(m.aim);
        const blocker = cleanField(m.blocker);
        const achievement = cleanField(m.achievement);
        const acts = m.totalActivities > 0 ? m.totalActivities : 0;
        const prod = `${m.avgProductivity || 0}%`;
        const rating = Number(m.rating || 0).toFixed(1);
        const hours = (m.totalActivities > 0 || m.activeSeconds > 0) ? (m.activeHoursFormatted || `${m.activeHours}h`) : '-';
        const idle = (m.idleSeconds > 0 || m.totalActivities > 0 || m.activeSeconds > 0) ? (m.idleTimeFormatted || '0h 0m') : '-';
        const keys = m.totalKeystrokes > 0 ? m.totalKeystrokes : '-';
        const mouse = `${m.avgMouse || 0}%`;
        const eff = m.efficiency === 'No Activity' ? '-' : m.efficiency;
        const combined = Number(m.combinedScore || 0).toFixed(4);
        const group = cleanField(m.performanceGroup);
        csv += `${m.rank},"${empId}","${name}","${dateDisplay}",${acts},"${prod}",${rating},"${hours}","${idle}","${keys}","${mouse}","${eff}","${aim}","${blocker}","${achievement}",${combined},"${group}"\n`;
      });

      const filename = `team_export_${Date.now()}.csv`;
      const filepath = path.join(this.reportsDir, filename);
      await fsPromises.writeFile(filepath, '\uFEFF' + csv, 'utf8');

      return {
        filename,
        filepath,
        generatedAt: new Date()
      };
    } catch (error) {
      console.error('Error in exportTeamCSV:', error);
      throw error;
    }
  }
}

module.exports = new ReportGenerator();
