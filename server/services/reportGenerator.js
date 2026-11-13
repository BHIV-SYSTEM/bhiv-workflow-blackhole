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
  getEfficiencyLabel,
  summarizeActivitiesWithSession,
  resolveSessionsMap
} = require('../utils/telemetryMetrics');

function formatActiveTime(seconds) {
  if (!seconds || seconds <= 0) return '0h 0m';
  const totalMins = Math.round(seconds / 60);
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  return `${h}h ${m}m`;
}

function getLocalDateString(d) {
  if (!d) return null;
  const dateObj = d instanceof Date ? d : new Date(d);
  if (isNaN(dateObj.getTime())) return null;
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
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
    let start, end;
    if (typeof startDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(startDate.trim())) {
      const [y, m, d] = startDate.trim().split('-').map(Number);
      start = new Date(y, m - 1, d, 0, 0, 0, 0);
    } else {
      start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
    }

    if (typeof endDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(endDate.trim())) {
      const [y, m, d] = endDate.trim().split('-').map(Number);
      end = new Date(y, m - 1, d, 23, 59, 59, 999);
    } else {
      end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
    }

    return { start, end };
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
        margin: 40,
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
      }).select('timestamp keystroke_count mouse_activity_score mouse_event_count idle_duration interval_seconds app_category productivity_score active_application').sort({ timestamp: -1 }).lean(),

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
   * PAGE 1: Header Banner with crisp typography (No overlap, proper branding)
   */
  async addReportHeader(doc, employee, startDate, endDate) {
    const pageWidth = doc.page.width; // 595 for A4

    // Header Background Banner
    doc.rect(0, 0, pageWidth, 95)
       .fill('#0f172a'); // Deep slate

    // Left Accent Bar
    doc.rect(0, 0, 6, 95)
       .fill('#3b82f6'); // Bright blue

    // Title
    doc.fillColor('#ffffff')
       .fontSize(18)
       .font('Helvetica-Bold')
       .text('NIYANTRAN WORKFLOW', 40, 22);

    doc.fillColor('#94a3b8')
       .fontSize(10)
       .font('Helvetica')
       .text('Employee Telemetry & Activity Monitoring Report', 40, 44);

    // Metadata Row
    const deptName = typeof employee.department === 'object' ? (employee.department?.name || 'General') : (employee.department || 'General');
    const startStr = new Date(startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const endStr = new Date(endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const empIdStr = employee.employeeId || formatEmployeeId(employee.email);

    doc.fontSize(9)
       .fillColor('#e2e8f0')
       .font('Helvetica-Bold')
       .text(`Employee: `, 40, 68, { continued: true })
       .font('Helvetica')
       .text(`${employee.name} (${empIdStr} • ${employee.email || 'N/A'})`, { continued: true })
       .font('Helvetica-Bold')
       .text(`   •   Department: `, { continued: true })
       .font('Helvetica')
       .text(`${deptName}`);

    doc.fontSize(8.5)
       .fillColor('#94a3b8')
       .text(`Period: ${startStr} to ${endStr}   •   Status: ${employee.stillExist === 0 ? 'Exited Account' : 'Active Employee'}`, 40, 81);

    // Set document cursor below banner
    doc.y = 110;
  }

  /**
   * PAGE 1: Executive KPI Cards (Row of 4 perfectly aligned cards)
   */
  async addExecutiveSummary(doc, reportData) {
    const summary = this.calculateExecutiveSummary(reportData);

    doc.fontSize(12)
       .font('Helvetica-Bold')
       .fillColor('#0f172a')
       .text('EXECUTIVE KPI SUMMARY', 40, doc.y);

    const boxY = doc.y + 6;
    const boxWidth = 117;
    const boxHeight = 58;
    const gap = 15;
    const startX = 40;

    const summaryItems = [
      {
        label: 'Productivity Score',
        value: `${summary.productivityScore}%`,
        color: summary.productivityScore >= 60 ? '#10b981' : (summary.productivityScore >= 40 ? '#f59e0b' : '#ef4444')
      },
      {
        label: 'Active Work Hours',
        value: summary.activeHoursFormatted || `${summary.activeHours}h`,
        color: '#0284c7'
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
         .text(item.value, currentX, boxY + 12, { width: boxWidth, align: 'center' });

      // Label
      doc.fillColor('#64748b')
         .fontSize(8.5)
         .font('Helvetica')
         .text(item.label, currentX, boxY + 36, { width: boxWidth, align: 'center' });
    });

    // Advance cursor safely
    doc.y = boxY + boxHeight + 18;
  }

  /**
   * PAGE 1: Daily Breakdown Table
   */
  async addDailyBreakdownTable(doc, reportData) {
    doc.fontSize(12)
       .font('Helvetica-Bold')
       .fillColor('#0f172a')
       .text('DAILY PERFORMANCE BREAKDOWN', 40, doc.y);

    doc.moveDown(0.5);

    // Group activities by date
    const dailyMap = {};
    const { start, end } = this.parseDateRange(reportData.period.startDate, reportData.period.endDate);

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dStr = getLocalDateString(d);
      dailyMap[dStr] = {
        date: dStr,
        activitiesCount: 0,
        keystrokes: 0,
        mouseSum: 0,
        activeSeconds: 0,
        prodSum: 0,
        topApps: {}
      };
    }

    reportData.activities.forEach(act => {
      const dStr = getLocalDateString(act.timestamp);
      if (dailyMap[dStr]) {
        dailyMap[dStr].activitiesCount++;
        dailyMap[dStr].keystrokes += (act.keystroke_count || 0);
        dailyMap[dStr].mouseSum += (act.mouse_activity_score || 0);
        
        const isActive = (act.keystroke_count || 0) > 0 || (act.mouse_activity_score || 0) >= 15;
        let idle = 0;
        if (!isActive) {
          let raw = act.idle_duration || 0;
          if (raw > 10000) raw = Math.round(raw / 1000);
          idle = Math.min(30, Math.max(0, raw));
        }
        dailyMap[dStr].activeSeconds += Math.max(0, 30 - idle);

        if (act.productivity_score > 0) {
          dailyMap[dStr].prodSum += act.productivity_score;
        }

        let appName = act.active_application?.name;
        if (!appName || appName === 'Unknown' || appName === 'null') {
          appName = isActive ? 'Desktop Workspace' : 'System Background';
        }
        dailyMap[dStr].topApps[appName] = (dailyMap[dStr].topApps[appName] || 0) + 1;
      }
    });

    // Merge official attendance for each day
    reportData.attendances?.forEach(att => {
      const dStr = getLocalDateString(att.date || att.startDayTime);
      if (dStr && dailyMap[dStr]) {
        let sec = 0;
        if (att.hoursWorked > 0) {
          sec = Math.round(att.hoursWorked * 3600);
        } else if (att.startDayTime) {
          const isToday = getLocalDateString(new Date()) === dStr;
          const endSession = att.endDayTime 
            ? new Date(att.endDayTime) 
            : (isToday ? new Date() : new Date(new Date(att.startDayTime).getTime() + 8 * 3600 * 1000));
          sec = Math.min(10 * 3600, Math.max(0, Math.floor((endSession - new Date(att.startDayTime)) / 1000)));
        }
        if (sec > 0) {
          dailyMap[dStr].activeSeconds = Math.max(dailyMap[dStr].activeSeconds, sec);
        }
      }
    });

    const dailyRows = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date));

    // Table Column Coordinates (Total width = 515)
    const tableX = 40;
    const tableWidth = 515;
    let currentY = doc.y;

    // Table Header
    doc.rect(tableX, currentY, tableWidth, 22)
       .fill('#1e293b');

    doc.fillColor('#ffffff')
       .fontSize(8.5)
       .font('Helvetica-Bold');

    doc.text('Date', tableX + 8, currentY + 6, { width: 75 });
    doc.text('Activities', tableX + 85, currentY + 6, { width: 60, align: 'center' });
    doc.text('Productivity', tableX + 150, currentY + 6, { width: 70, align: 'center' });
    doc.text('Active Hours', tableX + 225, currentY + 6, { width: 65, align: 'center' });
    doc.text('Keystrokes', tableX + 295, currentY + 6, { width: 65, align: 'center' });
    doc.text('Mouse Score', tableX + 365, currentY + 6, { width: 65, align: 'center' });
    doc.text('Efficiency', tableX + 435, currentY + 6, { width: 75, align: 'right' });

    currentY += 22;

    // Render table rows
    dailyRows.forEach((row, idx) => {
      const isZebra = idx % 2 === 1;
      const rowHeight = 20;

      // Background
      doc.rect(tableX, currentY, tableWidth, rowHeight)
         .fill(isZebra ? '#f8fafc' : '#ffffff');

      // Thin bottom border
      doc.rect(tableX, currentY + rowHeight - 1, tableWidth, 1)
         .fill('#e2e8f0');

      const count = row.activitiesCount;
      const avgProd = count > 0 ? Math.round(row.prodSum / count) : 0;
      const activeHoursStr = (count > 0 || row.activeSeconds > 0) ? formatActiveTime(row.activeSeconds) : '-';
      const avgMouse = count > 0 ? Math.round(row.mouseSum / count) : 0;

      let eff = 'No Activity';
      let effColor = '#94a3b8';
      if (count > 0) {
        if (avgProd >= 60) {
          eff = 'High Efficiency';
          effColor = '#10b981';
        } else if (avgProd >= 40) {
          eff = 'Moderate';
          effColor = '#f59e0b';
        } else {
          eff = 'Low Efficiency';
          effColor = '#ef4444';
        }
      }

      doc.fontSize(8).font('Helvetica');

      // Date
      doc.fillColor('#0f172a')
         .text(row.date, tableX + 8, currentY + 5);

      // Activities
      doc.fillColor('#475569')
         .text(count.toString(), tableX + 85, currentY + 5, { width: 60, align: 'center' });

      // Productivity %
      doc.fillColor(count > 0 ? effColor : '#94a3b8')
         .font(count > 0 ? 'Helvetica-Bold' : 'Helvetica')
         .text(count > 0 ? `${avgProd}%` : '-', tableX + 150, currentY + 5, { width: 70, align: 'center' });

      // Active Hours
      doc.fillColor('#0f172a')
         .font('Helvetica')
         .text(activeHoursStr, tableX + 225, currentY + 5, { width: 65, align: 'center' });

      // Keystrokes
      doc.fillColor('#475569')
         .text(row.keystrokes > 0 ? row.keystrokes.toLocaleString() : '-', tableX + 295, currentY + 5, { width: 65, align: 'center' });

      // Mouse Score
      doc.fillColor('#475569')
         .text(count > 0 ? `${avgMouse}%` : '-', tableX + 365, currentY + 5, { width: 65, align: 'center' });

      // Efficiency Rating
      doc.fillColor(effColor)
         .font('Helvetica-Bold')
         .text(eff, tableX + 435, currentY + 5, { width: 75, align: 'right' });

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

    const startX = 40;
    let currentY = doc.y;

    sortedApps.slice(0, 6).forEach(([appName, count]) => {
      const pct = Math.round((count / totalActs) * 100);
      const estMinutes = Math.round((count * 30) / 60);

      doc.fontSize(9)
         .font('Helvetica-Bold')
         .fillColor('#1e293b')
         .text(appName, startX, currentY, { width: 200 });

      doc.font('Helvetica')
         .fillColor('#64748b')
         .text(`${count} sessions (~${estMinutes} mins)`, startX + 210, currentY, { width: 140 });

      // Progress bar background
      const barX = startX + 360;
      const barWidth = 150;
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
       .text('POLICY VIOLATIONS & SECURITY ALERTS', 40, doc.y);

    doc.moveDown(0.6);

    const alerts = reportData.alerts || [];

    if (alerts.length === 0) {
      // Clean checkmark card
      const boxY = doc.y;
      doc.roundedRect(40, boxY, 515, 36, 6)
         .fillAndStroke('#f0fdf4', '#bbf7d0');

      doc.fillColor('#15803d')
         .fontSize(9.5)
         .font('Helvetica-Bold')
         .text('✓ No policy violations or security alerts detected during this period.', 55, boxY + 11);

      doc.y = boxY + 48;
      return;
    }

    const boxWidth = 515;
    const boxHeight = 50;

    alerts.slice(0, 4).forEach((alert) => {
      const boxY = doc.y;
      const isHigh = alert.severity === 'high';
      const isMed = alert.severity === 'medium';

      const bg = isHigh ? '#fef2f2' : (isMed ? '#fffbeb' : '#f8fafc');
      const border = isHigh ? '#fca5a5' : (isMed ? '#fde68a' : '#cbd5e1');
      const titleColor = isHigh ? '#b91c1c' : (isMed ? '#b45309' : '#1e40af');

      // Card Background (Light pastel with clean border)
      doc.roundedRect(40, boxY, boxWidth, boxHeight, 6)
         .fillAndStroke(bg, border);

      // Title
      doc.fillColor(titleColor)
         .fontSize(10)
         .font('Helvetica-Bold')
         .text(alert.title || 'Security Notification', 52, boxY + 8, { width: boxWidth - 24 });

      // Description (Crisp charcoal text)
      doc.fillColor('#1e293b')
         .fontSize(8.5)
         .font('Helvetica')
         .text(alert.description || 'Automated policy rule triggered', 52, boxY + 22, { width: boxWidth - 24, lineBreak: false });

      // Severity and Timestamp
      const tsStr = new Date(alert.timestamp).toLocaleString();
      doc.fillColor('#64748b')
         .fontSize(7.5)
         .text(`${tsStr}  •  Severity: ${String(alert.severity || 'low').toUpperCase()}`, 52, boxY + 35);

      doc.y = boxY + boxHeight + 8;
    });

    doc.moveDown(0.8);
  }

  /**
   * PAGE 2: Activity Timeline (Recent Sessions)
   */
  async addActivityTimelineSection(doc, reportData) {
    doc.fontSize(13)
       .font('Helvetica-Bold')
       .fillColor('#0f172a')
       .text('RECENT ACTIVITY TIMELINE', 40, doc.y);

    doc.moveDown(0.5);

    const timeline = this.createActivityTimeline(reportData.activities);

    if (timeline.length === 0) {
      doc.fontSize(9)
         .font('Helvetica')
         .fillColor('#64748b')
         .text('No activity timeline recorded for this period.', 40, doc.y);
      return;
    }

    const startX = 40;
    let currentY = doc.y;

    timeline.slice(0, 10).forEach(entry => {
      // Timeline bullet
      doc.circle(startX + 4, currentY + 5, 2.5)
         .fill('#3b82f6');

      // Time
      doc.fontSize(8)
         .font('Helvetica-Bold')
         .fillColor('#0f172a')
         .text(entry.time, startX + 14, currentY, { width: 80 });

      // Activity Description
      doc.font('Helvetica')
         .fillColor('#334155')
         .text(entry.activity, startX + 100, currentY, { width: 400 });

      currentY += 16;
    });

    doc.y = currentY + 10;
  }

  /**
   * PAGE 3: Visual Analytics Charts
   */
  async addChartsAndGraphs(doc, reportData) {
    const pageWidth = doc.page.width;

    // Header on Page 3
    doc.rect(0, 0, pageWidth, 45)
       .fill('#0f172a');

    doc.fillColor('#ffffff')
       .fontSize(12)
       .font('Helvetica-Bold')
       .text('NIYANTRAN WORKFLOW - VISUAL ANALYTICS & INSIGHTS', 40, 16);

    doc.y = 65;

    doc.fontSize(13)
       .font('Helvetica-Bold')
       .fillColor('#0f172a')
       .text('PRODUCTIVITY TREND ANALYSIS', 40, doc.y);

    doc.moveDown(0.5);

    try {
      const productivityChart = await this.generateProductivityChart(reportData);
      if (productivityChart) {
        const chartY = doc.y;
        doc.image(productivityChart, 40, chartY, { width: 515, height: 180 });
        doc.y = chartY + 200;
      }
    } catch (error) {
      console.warn('Chart render fallback:', error.message);
    }

    doc.moveDown(0.8);
  }

  /**
   * PAGE 3: Recommendations & Official Document Footer
   */
  async addRecommendations(doc, reportData) {
    doc.fontSize(13)
       .font('Helvetica-Bold')
       .fillColor('#0f172a')
       .text('PERFORMANCE RECOMMENDATIONS', 40, doc.y);

    doc.moveDown(0.6);

    const recommendations = this.generateRecommendations(reportData);

    recommendations.forEach((item, index) => {
      doc.fontSize(9.5)
         .font('Helvetica-Bold')
         .fillColor('#0f172a')
         .text(`${index + 1}. ${item.title}`, 45, doc.y);

      doc.fontSize(8.5)
         .font('Helvetica')
         .fillColor('#475569')
         .text(item.description, 60, doc.y, { width: 490 });

      doc.moveDown(0.6);
    });

    // Official Confidentiality Footer (Positioned within page bounds, preventing accidental extra page)
    const footerY = Math.min(doc.y + 25, 770);
    doc.rect(40, footerY, 515, 1)
       .fill('#e2e8f0');

    doc.fontSize(7.5)
       .font('Helvetica')
       .fillColor('#94a3b8')
       .text(`Generated on ${new Date().toLocaleString()}  •  Niyantran Workflow Monitoring System  •  Confidential`, 40, footerY + 8, { align: 'center', width: 515, lineBreak: false });
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
    let prodDaySum = 0;
    let prodDayCount = 0;

    allDays.forEach((dKey) => {
      const dayLogs = activitiesByDay.get(dKey) || [];
      const daySession = sessionByDay.get(dKey) || null;
      const summary = summarizeActivitiesWithSession(dayLogs, daySession);
      totalKeys += summary.totalKeystrokes;
      totalActiveSec += summary.activeSeconds;
      if (summary.hasActivity) {
        prodDaySum += summary.avgProductivityScore;
        prodDayCount++;
      }
    });

    const overallSummary = summarizeActivitiesWithSession(activities, null);
    const avgProd = prodDayCount > 0 ? Math.round(prodDaySum / prodDayCount) : 0;
    const activeHours = Math.round((totalActiveSec / 3600) * 10) / 10;
    const activeHoursFormatted = formatActiveTime(totalActiveSec);
    const avgMouse = overallSummary.avgMouseActivity;

    return {
      productivityScore: avgProd,
      productivityEfficiency: getEfficiencyLabel(avgProd, prodDayCount > 0),
      activeHours,
      activeHoursFormatted,
      activeSeconds: totalActiveSec,
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

  createActivityTimeline(activities) {
    return (activities || []).slice(0, 15).map(act => {
      let appName = act.active_application?.name;
      if (!appName || appName === 'Unknown' || appName === 'null') {
        const isActive = (act.keystroke_count || 0) > 0 || (act.mouse_activity_score || 0) >= 15;
        appName = isActive ? 'Active Desktop Workspace' : 'System Background';
      }
      const title = act.active_application?.title ? ` - ${act.active_application.title}` : '';
      const prod = act.productivity_score ? ` (Score: ${act.productivity_score}%)` : '';
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
    const dailyMap = {};
    (reportData.activities || []).forEach(act => {
      const dStr = new Date(act.timestamp).toISOString().split('T')[0];
      if (!dailyMap[dStr]) dailyMap[dStr] = { sum: 0, count: 0 };
      if (act.productivity_score > 0) {
        dailyMap[dStr].sum += act.productivity_score;
        dailyMap[dStr].count++;
      }
    });

    const start = new Date(reportData.period.startDate);
    const end = new Date(reportData.period.endDate);
    const scores = [];

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dStr = d.toISOString().split('T')[0];
      const day = dailyMap[dStr];
      scores.push(day && day.count > 0 ? Math.round(day.sum / day.count) : 0);
    }

    return scores;
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

      // Build daily map for breakdown
      const dailyMap = {};
      const { start: pStart, end: pEnd } = this.parseDateRange(startDate, endDate);
      for (let d = new Date(pStart); d <= pEnd; d.setDate(d.getDate() + 1)) {
        const dStr = getLocalDateString(d);
        dailyMap[dStr] = {
          date: dStr,
          activitiesCount: 0,
          keystrokes: 0,
          mouseSum: 0,
          activeSeconds: 0,
          prodSum: 0
        };
      }

      reportData.activities.forEach(act => {
        const dStr = getLocalDateString(act.timestamp);
        if (dailyMap[dStr]) {
          dailyMap[dStr].activitiesCount++;
          dailyMap[dStr].keystrokes += (act.keystroke_count || 0);
          dailyMap[dStr].mouseSum += (act.mouse_activity_score || 0);
          const isActive = (act.keystroke_count || 0) > 0 || (act.mouse_activity_score || 0) >= 15;
          let idle = 0;
          if (!isActive) {
            let raw = act.idle_duration || 0;
            if (raw > 10000) raw = Math.round(raw / 1000);
            idle = Math.min(30, Math.max(0, raw));
          }
          dailyMap[dStr].activeSeconds += Math.max(0, 30 - idle);
          if (act.productivity_score > 0) dailyMap[dStr].prodSum += act.productivity_score;
        }
      });

      reportData.attendances?.forEach(att => {
        const dStr = getLocalDateString(att.date || att.startDayTime);
        if (dStr && dailyMap[dStr]) {
          let sec = 0;
          if (att.hoursWorked > 0) {
            sec = Math.round(att.hoursWorked * 3600);
          } else if (att.startDayTime) {
            const isToday = getLocalDateString(new Date()) === dStr;
            const endSession = att.endDayTime 
              ? new Date(att.endDayTime) 
              : (isToday ? new Date() : new Date(new Date(att.startDayTime).getTime() + 8 * 3600 * 1000));
            sec = Math.min(10 * 3600, Math.max(0, Math.floor((endSession - new Date(att.startDayTime)) / 1000)));
          }
          if (sec > 0) {
            dailyMap[dStr].activeSeconds = Math.max(dailyMap[dStr].activeSeconds, sec);
          }
        }
      });

      // Build daily aim & progress lookup
      const dailyAimMap = {};
      const dailyBlockerMap = {};
      const dailyAchieveMap = {};

      (reportData.aims || []).forEach(a => {
        const dStr = getLocalDateString(a.date);
        if (dStr) {
          if (!dailyAimMap[dStr] && a.aims) dailyAimMap[dStr] = a.aims;
          if (!dailyBlockerMap[dStr] && a.blockers) dailyBlockerMap[dStr] = a.blockers;
          if (!dailyAchieveMap[dStr] && a.achievements) dailyAchieveMap[dStr] = a.achievements;
        }
      });

      (reportData.progresses || []).forEach(p => {
        const dStr = getLocalDateString(p.date);
        if (dStr) {
          if (!dailyAimMap[dStr] && p.notes) dailyAimMap[dStr] = p.notes;
          if (!dailyBlockerMap[dStr] && p.blockers) dailyBlockerMap[dStr] = p.blockers;
          if (!dailyAchieveMap[dStr] && p.achievements) dailyAchieveMap[dStr] = p.achievements;
        }
      });

      const cleanField = (txt) => {
        if (!txt || txt === '-') return '-';
        return String(txt).replace(/"/g, '""').replace(/[\r\n\t]+/g, ' ').trim();
      };

      csv += 'DAILY PERFORMANCE BREAKDOWN\n';
      csv += 'Employee ID,Date,AIM,Blocker,Achievement,Total Activities,Productivity Score (%),Active Hours,Total Keystrokes,Mouse Activity (%),Efficiency Rating\n';

      const dailyRows = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date));
      dailyRows.forEach(day => {
        const aim = cleanField(dailyAimMap[day.date]);
        const blocker = cleanField(dailyBlockerMap[day.date]);
        const achievement = cleanField(dailyAchieveMap[day.date]);
        const prod = day.activitiesCount > 0 ? Math.round(day.prodSum / day.activitiesCount) : 0;
        let eff = 'Low Efficiency';
        if (prod >= 60) eff = 'High Efficiency';
        else if (prod >= 40) eff = 'Moderate Efficiency';
        const activeText = (day.activitiesCount > 0 || day.activeSeconds > 0) ? formatActiveTime(day.activeSeconds) : '-';
        const avgMouse = day.activitiesCount > 0 ? Math.round(day.mouseSum / day.activitiesCount) : 0;

        csv += `"${empIdFormatted}","${day.date}","${aim}","${blocker}","${achievement}",${day.activitiesCount > 0 ? day.activitiesCount : '-'},"${day.activitiesCount > 0 ? `${prod}%` : '-'}","${activeText}",${day.keystrokes > 0 ? day.keystrokes : '-'},"${day.activitiesCount > 0 ? `${avgMouse}%` : '-'}","${day.activitiesCount > 0 ? eff : '-'}"\n`;
      });
      csv += '\n';

      csv += 'DETAILED ACTIVITY LOGS\n';
      csv += 'Employee ID,Timestamp,Application,Window Title,Productivity Score (%),Idle Duration (s),Keystrokes,Mouse Score (%)\n';

      if (reportData.activities.length > 0) {
        reportData.activities.forEach(act => {
          const ts = act.timestamp ? new Date(act.timestamp).toISOString() : '';
          const app = (act.active_application?.name || 'Workspace').replace(/"/g, '""');
          const title = (act.active_application?.title || '').replace(/"/g, '""');
          csv += `"${empIdFormatted}","${ts}","${app}","${title}",${act.productivity_score || 0},${act.idle_duration || 0},${act.keystroke_count || 0},${act.mouse_activity_score || 0}\n`;
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

    const employees = await User.find(userQuery)
      .select('name email department stillExist role employeeId')
      .populate('department', 'name')
      .lean();

    const empIds = employees.map(e => e._id);

    if (empIds.length === 0) {
      return {
        period: { startDate, endDate },
        totalEmployees: 0,
        activeMembersCount: 0,
        teamSummary: {
          teamAvgProductivity: 0,
          teamTotalHours: 0,
          teamTotalKeystrokes: 0,
          teamTotalAlerts: 0,
          teamTotalActivities: 0
        },
        members: [],
        teamApps: {},
        alertStats: {},
        dailyTeamScores: []
      };
    }

    // High performance: aggregate directly in MongoDB using the exact same sample-evaluation rules as telemetryMetrics.js
    const offsetMin = -new Date().getTimezoneOffset();
    const tzSign = offsetMin >= 0 ? '+' : '-';
    const tzAbs = Math.abs(offsetMin);
    const mongoTz = `${tzSign}${String(Math.floor(tzAbs / 60)).padStart(2, '0')}:${String(tzAbs % 60).padStart(2, '0')}`;

    const sampleSecExpr = {
      $cond: [
        {
          $and: [
            { $gte: [{ $ifNull: ['$interval_seconds', 30] }, 1] },
            { $lte: [{ $ifNull: ['$interval_seconds', 30] }, 120] }
          ]
        },
        { $ifNull: ['$interval_seconds', 30] },
        30
      ]
    };
    const rawIdleExpr = {
      $cond: [
        { $gt: [{ $ifNull: ['$idle_duration', 0] }, 10000] },
        { $round: [{ $divide: [{ $ifNull: ['$idle_duration', 0] }, 1000] }, 0] },
        { $max: [0, { $ifNull: ['$idle_duration', 0] }] }
      ]
    };
    const hasInputExpr = {
      $or: [
        { $gt: [{ $ifNull: ['$keystroke_count', 0] }, 0] },
        { $gt: [{ $ifNull: ['$mouse_activity_score', 0] }, 0] },
        { $gt: [{ $ifNull: ['$mouse_event_count', 0] }, 0] }
      ]
    };
    const isIdleExpr = {
      $and: [
        { $not: [hasInputExpr] },
        { $gte: ['$_rawIdle', 30] }
      ]
    };
    const effectiveMouseScoreExpr = {
      $cond: [
        { $gt: [{ $ifNull: ['$mouse_activity_score', 0] }, 0] },
        { $min: [100, { $ifNull: ['$mouse_activity_score', 0] }] },
        {
          $cond: [
            { $gt: [{ $ifNull: ['$mouse_event_count', 0] }, 0] },
            {
              $min: [
                100,
                {
                  $round: [
                    {
                      $multiply: [
                        {
                          $divide: [
                            { $multiply: [{ $divide: [{ $ifNull: ['$mouse_event_count', 0] }, '$_sampleSec'] }, 60] },
                            240
                          ]
                        },
                        100
                      ]
                    },
                    0
                  ]
                }
              ]
            },
            0
          ]
        }
      ]
    };
    const qualityScoreExpr = {
      $cond: [
        '$_isIdle',
        0,
        {
          $min: [
            100,
            {
              $round: [
                {
                  $add: [
                    {
                      $cond: [
                        { $eq: [{ $toUpper: { $ifNull: ['$app_category', ''] } }, 'DISTRACTION'] },
                        15,
                        55
                      ]
                    },
                    {
                      $multiply: [
                        {
                          $min: [
                            1,
                            {
                              $divide: [
                                { $multiply: [{ $divide: [{ $ifNull: ['$keystroke_count', 0] }, '$_sampleSec'] }, 60] },
                                120
                              ]
                            }
                          ]
                        },
                        30
                      ]
                    },
                    {
                      $multiply: [
                        { $divide: [effectiveMouseScoreExpr, 100] },
                        15
                      ]
                    }
                  ]
                },
                0
              ]
            }
          ]
        }
      ]
    };

    const [empDailyStats, topAppsData, alertTypesData, empAlertsData, sessionsMap, aimsData, progressesData] = await Promise.all([
      // 1. Employee per-day telemetry buckets (duration-weighted & interval-normalized)
      EmployeeActivity.aggregate([
        {
          $match: {
            employee: { $in: empIds },
            timestamp: { $gte: start, $lte: end }
          }
        },
        {
          $addFields: {
            _sampleSec: sampleSecExpr,
            _rawIdle: rawIdleExpr
          }
        },
        {
          $addFields: {
            _isIdle: isIdleExpr
          }
        },
        {
          $addFields: {
            _activeSec: { $cond: ['$_isIdle', 0, '$_sampleSec'] },
            _qualityScore: qualityScoreExpr,
            _dayKey: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp', timezone: mongoTz } }
          }
        },
        {
          $group: {
            _id: { employee: '$employee', date: '$_dayKey' },
            totalActivities: { $sum: 1 },
            keystrokes: { $sum: { $ifNull: ['$keystroke_count', 0] } },
            activeMouseSum: {
              $sum: {
                $cond: [{ $gt: [{ $ifNull: ['$mouse_activity_score', 0] }, 0] }, '$mouse_activity_score', 0]
              }
            },
            activeMouseCount: {
              $sum: {
                $cond: [{ $gt: [{ $ifNull: ['$mouse_activity_score', 0] }, 0] }, 1, 0]
              }
            },
            totalTelemetrySec: { $sum: '$_sampleSec' },
            weightedQualitySum: { $sum: { $multiply: ['$_qualityScore', '$_sampleSec'] } },
            activeSeconds: { $sum: '$_activeSec' }
          }
        }
      ]),

      // 2. Team top applications
      EmployeeActivity.aggregate([
        {
          $match: {
            employee: { $in: empIds },
            timestamp: { $gte: start, $lte: end }
          }
        },
        {
          $group: {
            _id: {
              $ifNull: ['$active_application.name', 'Desktop Workspace']
            },
            count: { $sum: 1 }
          }
        },
        { $sort: { count: -1 } },
        { $limit: 25 }
      ]),

      // 3. Team alert categories breakdown
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

      // 4. Alert count per employee
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

      // 5. Unified session durations (WorkSession > Attendance > DailyAttendance)
      resolveSessionsMap(empIds, start, end),

      // 6. Team daily aims
      Aim.find({
        user: { $in: empIds },
        date: { $gte: start, $lte: end }
      }).select('user date aims blockers achievements progressPercentage').sort({ date: -1 }).lean(),

      // 7. Team progress updates
      Progress.find({
        user: { $in: empIds },
        date: { $gte: start, $lte: end }
      }).select('user date notes blockers achievements progressPercentage').sort({ date: -1 }).lean()
    ]);

    const empAimMap = new Map();
    const empBlockerMap = new Map();
    const empAchieveMap = new Map();

    (aimsData || []).forEach(a => {
      const uId = a.user ? a.user.toString() : null;
      if (!uId) return;
      if (!empAimMap.has(uId) && a.aims) empAimMap.set(uId, a.aims);
      if (!empBlockerMap.has(uId) && a.blockers) empBlockerMap.set(uId, a.blockers);
      if (!empAchieveMap.has(uId) && a.achievements) empAchieveMap.set(uId, a.achievements);
    });

    (progressesData || []).forEach(p => {
      const uId = p.user ? p.user.toString() : null;
      if (!uId) return;
      if (!empAimMap.has(uId) && p.notes) empAimMap.set(uId, p.notes);
      if (!empBlockerMap.has(uId) && p.blockers) empBlockerMap.set(uId, p.blockers);
      if (!empAchieveMap.has(uId) && p.achievements) empAchieveMap.set(uId, p.achievements);
    });

    const empAlertsMap = new Map();
    empAlertsData.forEach(a => {
      if (a._id) empAlertsMap.set(a._id.toString(), a.alertsCount);
    });

    const teamApps = {};
    topAppsData.forEach(app => {
      let name = app._id || 'Desktop Workspace';
      if (name === 'Unknown' || name === 'null') name = 'Desktop Workspace';
      teamApps[name] = app.count;
    });

    const alertStats = {};
    let teamTotalAlerts = 0;
    alertTypesData.forEach(al => {
      const type = al._id || 'general_alert';
      alertStats[type] = al.count;
      teamTotalAlerts += al.count;
    });

    const dailyTeamMap = {};
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dStr = getLocalDateString(d);
      dailyTeamMap[dStr] = { sum: 0, count: 0 };
    }

    // Group daily telemetry buckets per employee and merge with resolved session days
    const dailyByEmpMap = new Map();
    empDailyStats.forEach(row => {
      const empIdStr = row?._id?.employee ? row._id.employee.toString() : null;
      const dKey = row?._id?.date;
      if (!empIdStr || !dKey) return;
      if (!dailyByEmpMap.has(empIdStr)) dailyByEmpMap.set(empIdStr, new Map());
      dailyByEmpMap.get(empIdStr).set(dKey, row);
    });

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
      let activeMouseSum = 0;
      let activeMouseCount = 0;
      let effectiveActiveSec = 0;
      let prodDaySum = 0;
      let workedDays = 0;

      allDayKeys.forEach(dKey => {
        const dayTelemetry = empDays.get(dKey);
        const daySession = empSessions.get(dKey);
        const sessionSec = Number(daySession?.sessionSeconds || 0);
        const hasTelemetry = Boolean(dayTelemetry && dayTelemetry.totalActivities > 0);
        const hasSession = sessionSec > 0 || Boolean(daySession?.startTime);

        if (!hasTelemetry && !hasSession) return;

        workedDays++;
        const dayActiveSec = sessionSec > 0
          ? sessionSec
          : Number(dayTelemetry?.activeSeconds || 0);
        effectiveActiveSec += dayActiveSec;

        let dayProd = 0;
        if (hasTelemetry && dayTelemetry.totalTelemetrySec > 0) {
          dayProd = Math.min(100, Math.round(dayTelemetry.weightedQualitySum / dayTelemetry.totalTelemetrySec));
        } else if (sessionSec > 0) {
          dayProd = 50;
        }
        prodDaySum += dayProd;

        if (hasTelemetry) {
          totalActivities += dayTelemetry.totalActivities;
          keystrokes += dayTelemetry.keystrokes || 0;
          activeMouseSum += dayTelemetry.activeMouseSum || 0;
          activeMouseCount += dayTelemetry.activeMouseCount || 0;
        }

        if (dailyTeamMap[dKey]) {
          dailyTeamMap[dKey].sum += dayProd;
          dailyTeamMap[dKey].count += 1;
        }
      });

      teamTotalActivities += totalActivities;
      const alertsCount = empAlertsMap.get(idStr) || 0;

      const avgProd = workedDays > 0 ? Math.round(prodDaySum / workedDays) : 0;
      const activeHoursDecimal = Math.round((effectiveActiveSec / 3600) * 10) / 10;
      const activeHoursFormatted = formatActiveTime(effectiveActiveSec);
      const avgMouse = activeMouseCount > 0 ? Math.round(activeMouseSum / activeMouseCount) : 0;

      let efficiency = 'No Activity';
      let effColor = '#94a3b8';
      if (workedDays > 0 || effectiveActiveSec > 0) {
        if (avgProd >= 60) {
          efficiency = 'High Efficiency';
          effColor = '#10b981';
        } else if (avgProd >= 40) {
          efficiency = 'Moderate';
          effColor = '#f59e0b';
        } else {
          efficiency = 'Low';
          effColor = '#ef4444';
        }
      }

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
        activeHours: activeHoursDecimal,
        activeHoursFormatted,
        activeSeconds: effectiveActiveSec,
        totalKeystrokes: keystrokes,
        avgMouse,
        alertsCount,
        efficiency,
        effColor,
        aim: empAimMap.get(idStr) || '-',
        blocker: empBlockerMap.get(idStr) || '-',
        achievement: empAchieveMap.get(idStr) || '-'
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
    const teamTotalHours = Math.round(members.reduce((sum, m) => sum + (m.activeSeconds / 3600), 0) * 10) / 10;
    const teamTotalKeystrokes = members.reduce((sum, m) => sum + m.totalKeystrokes, 0);

    return {
      period: { startDate, endDate },
      totalEmployees: employees.length,
      activeMembersCount: activeMembers.length,
      teamSummary: {
        teamAvgProductivity: teamAvgProd,
        teamTotalHours,
        teamTotalHoursFormatted: formatActiveTime(members.reduce((sum, m) => sum + m.activeSeconds, 0)),
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
   * TEAM REPORT: Consolidated All-Members PDF
   */
  async generateTeamReport(startDate, endDate, options = {}) {
    try {
      const data = await this.gatherTeamReportData(startDate, endDate, options);
      const doc = new PDFDocument({
        size: 'A4',
        margin: 40,
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

      const pageWidth = doc.page.width;
      const sDate = new Date(startDate);
      const eDate = new Date(endDate);
      const isSameDay = sDate.toDateString() === eDate.toDateString();
      const sDay = String(sDate.getDate()).padStart(2, '0');
      const sMonth = String(sDate.getMonth() + 1).padStart(2, '0');
      const eDay = String(eDate.getDate()).padStart(2, '0');
      const eMonth = String(eDate.getMonth() + 1).padStart(2, '0');
      const dateDisplay = isSameDay ? `${sDay}/${sMonth}` : `${sDay}/${sMonth} - ${eDay}/${eMonth}`;
      const periodLabel = isSameDay ? `Date: ${sDay}/${sMonth}/${sDate.getFullYear()}` : `Period: ${sDay}/${sMonth}/${sDate.getFullYear()} to ${eDay}/${eMonth}/${eDate.getFullYear()}`;

      // ==================== PAGE 1 ====================
      // Header Banner
      doc.rect(0, 0, pageWidth, 95).fill('#0f172a');
      doc.rect(0, 0, 6, 95).fill('#6366f1'); // Indigo/purple accent for team report

      doc.fillColor('#ffffff').fontSize(18).font('Helvetica-Bold').text('NIYANTRAN WORKFLOW', 40, 22);
      doc.fillColor('#94a3b8').fontSize(10).font('Helvetica').text('Consolidated Team Performance & Telemetry Report', 40, 44);

      doc.fontSize(9).fillColor('#e2e8f0').font('Helvetica-Bold')
         .text('Report Scope: ', 40, 68, { continued: true })
         .font('Helvetica').text(`Active Workforce (${data.totalEmployees} Active Members)   •   ${periodLabel}`);

      doc.fontSize(8.5).fillColor('#94a3b8')
         .text(`Generated on ${new Date().toLocaleString()}   •   Scope: Active Employees Only`, 40, 81);

      doc.y = 110;

      // Executive KPI Cards
      doc.fontSize(12).font('Helvetica-Bold').fillColor('#0f172a').text('TEAM EXECUTIVE KPI SUMMARY', 40, doc.y);

      const boxY = doc.y + 6;
      const boxWidth = 117;
      const boxHeight = 58;
      const gap = 15;
      const startX = 40;

      const kpiItems = [
        {
          label: 'Team Avg Productivity',
          value: `${data.teamSummary.teamAvgProductivity}%`,
          color: data.teamSummary.teamAvgProductivity >= 60 ? '#10b981' : (data.teamSummary.teamAvgProductivity >= 40 ? '#f59e0b' : '#ef4444')
        },
        {
          label: 'Total Active Hours',
          value: data.teamSummary.teamTotalHoursFormatted || `${data.teamSummary.teamTotalHours}h`,
          color: '#0284c7'
        },
        {
          label: 'Total Keystrokes',
          value: data.teamSummary.teamTotalKeystrokes.toLocaleString(),
          color: '#8b5cf6'
        },
        {
          label: 'Total Security Alerts',
          value: `${data.teamSummary.teamTotalAlerts}`,
          color: data.teamSummary.teamTotalAlerts > 0 ? '#ef4444' : '#10b981'
        }
      ];

      kpiItems.forEach((item, index) => {
        const currentX = startX + index * (boxWidth + gap);
        doc.roundedRect(currentX, boxY, boxWidth, boxHeight, 6).fillAndStroke('#f8fafc', '#e2e8f0');
        doc.fillColor(item.color).fontSize(18).font('Helvetica-Bold').text(item.value, currentX, boxY + 12, { width: boxWidth, align: 'center' });
        doc.fillColor('#64748b').fontSize(8.5).font('Helvetica').text(item.label, currentX, boxY + 36, { width: boxWidth, align: 'center' });
      });

      doc.y = boxY + boxHeight + 18;

      // All Members Roster Table (8 Exact Columns from Handwritten Specification)
      doc.fontSize(12).font('Helvetica-Bold').fillColor('#0f172a').text('ALL MEMBERS PERFORMANCE ROSTER', 40, doc.y);
      doc.moveDown(0.5);

      const tableX = 40;
      const tableWidth = 515;
      let currentY = doc.y;

      // Table Header Function: Emp ID | Name | Date | Activities | Productivity | Active Hour | Key Strokes | Mouse Score | Efficiency
      const printTableHeader = (yPos) => {
        doc.rect(tableX, yPos, tableWidth, 22).fill('#1e293b');
        doc.fillColor('#ffffff').fontSize(7.5).font('Helvetica-Bold');
        doc.text('Emp ID', tableX + 5, yPos + 6, { width: 52 });
        doc.text('Name', tableX + 60, yPos + 6, { width: 85 });
        doc.text('Date', tableX + 148, yPos + 6, { width: 48, align: 'center' });
        doc.text('Activities', tableX + 200, yPos + 6, { width: 44, align: 'center' });
        doc.text('Productivity', tableX + 248, yPos + 6, { width: 50, align: 'center' });
        doc.text('Active Hour', tableX + 302, yPos + 6, { width: 48, align: 'center' });
        doc.text('Key Strokes', tableX + 354, yPos + 6, { width: 50, align: 'center' });
        doc.text('Mouse Score', tableX + 408, yPos + 6, { width: 52, align: 'center' });
        doc.text('Efficiency', tableX + 464, yPos + 6, { width: 46, align: 'right' });
        return yPos + 22;
      };

      currentY = printTableHeader(currentY);

      data.members.forEach((m, idx) => {
        if (currentY > 750) {
          doc.addPage();
          doc.rect(0, 0, pageWidth, 40).fill('#0f172a');
          doc.fillColor('#ffffff').fontSize(10).font('Helvetica-Bold').text('NIYANTRAN WORKFLOW - ALL MEMBERS ROSTER (CONTINUED)', 40, 14);
          currentY = printTableHeader(55);
        }

        const isZebra = idx % 2 === 1;
        const rowHeight = 20;

        doc.rect(tableX, currentY, tableWidth, rowHeight).fill(isZebra ? '#f8fafc' : '#ffffff');
        doc.rect(tableX, currentY + rowHeight - 1, tableWidth, 1).fill('#e2e8f0');

        doc.fontSize(7.5).font('Helvetica');

        // 0. Emp ID
        doc.fillColor('#6366f1').font('Helvetica-Bold').text(m.employeeId || 'N/A', tableX + 5, currentY + 5, { width: 52, ellipsis: true });

        // 1. Name
        doc.fillColor('#0f172a').font('Helvetica-Bold').text(m.name, tableX + 60, currentY + 5, { width: 85, ellipsis: true });

        // 2. Date (Respected Date e.g. 24/10 or range 24/10 - 26/10)
        doc.fillColor('#475569').font('Helvetica').text(dateDisplay, tableX + 148, currentY + 5, { width: 48, align: 'center' });

        // 3. Activities
        doc.fillColor('#475569').text(m.totalActivities > 0 ? m.totalActivities.toString() : '-', tableX + 200, currentY + 5, { width: 44, align: 'center' });

        // 4. Productivity
        doc.fillColor(m.totalActivities > 0 ? m.effColor : '#94a3b8').font(m.totalActivities > 0 ? 'Helvetica-Bold' : 'Helvetica')
           .text(m.totalActivities > 0 ? `${m.avgProductivity}%` : '-', tableX + 248, currentY + 5, { width: 50, align: 'center' });

        // 5. Active Hour
        const activeText = (m.totalActivities > 0 || m.activeSeconds > 0) ? (m.activeHoursFormatted || `${m.activeHours}h`) : '-';
        doc.fillColor('#0f172a').font('Helvetica').text(activeText, tableX + 302, currentY + 5, { width: 48, align: 'center' });

        // 6. Key Strokes
        doc.fillColor('#475569').text(m.totalKeystrokes > 0 ? m.totalKeystrokes.toLocaleString() : '-', tableX + 354, currentY + 5, { width: 50, align: 'center' });

        // 7. Mouse Score
        doc.fillColor('#475569').text(m.totalActivities > 0 ? `${m.avgMouse}%` : '-', tableX + 408, currentY + 5, { width: 52, align: 'center' });

        // 8. Efficiency Rating
        doc.fillColor(m.effColor).font('Helvetica-Bold').text(m.efficiency === 'No Activity' ? '-' : m.efficiency, tableX + 464, currentY + 5, { width: 46, align: 'right' });

        currentY += rowHeight;
      });

      // ==================== PAGE 2: APPLICATION USAGE & AUDIT ====================
      doc.addPage();
      doc.rect(0, 0, pageWidth, 45).fill('#0f172a');
      doc.fillColor('#ffffff').fontSize(12).font('Helvetica-Bold').text('NIYANTRAN WORKFLOW - TEAM SOFTWARE & WORKSPACE AUDIT', 40, 16);

      doc.y = 65;
      doc.fontSize(13).font('Helvetica-Bold').fillColor('#0f172a').text('TOP APPLICATIONS USED ACROSS TEAM', 40, doc.y);
      doc.moveDown(0.6);

      const sortedTeamApps = Object.entries(data.teamApps || {}).sort((a, b) => b[1] - a[1]);
      const totalTeamActs = data.teamSummary.teamTotalActivities || 1;

      if (sortedTeamApps.length === 0) {
        doc.fontSize(9.5).font('Helvetica').fillColor('#64748b').text('No application activity recorded across the team in this period.', 40, doc.y);
        doc.moveDown(1);
      } else {
        let appY = doc.y;
        sortedTeamApps.slice(0, 6).forEach(([appName, count]) => {
          const pct = Math.round((count / totalTeamActs) * 100);
          const estHours = Math.round((count * 30 / 3600) * 10) / 10;

          doc.fontSize(9).font('Helvetica-Bold').fillColor('#1e293b').text(appName, 40, appY, { width: 200, ellipsis: true });
          doc.font('Helvetica').fillColor('#64748b').text(`${count} sessions (~${estHours}h total)`, 245, appY, { width: 140 });

          const barX = 390;
          const barWidth = 120;
          doc.roundedRect(barX, appY + 2, barWidth, 7, 3).fill('#e2e8f0');
          const fillW = Math.max(3, Math.round((pct / 100) * barWidth));
          doc.roundedRect(barX, appY + 2, fillW, 7, 3).fill('#6366f1');

          doc.fontSize(8).fillColor('#1e293b').font('Helvetica-Bold').text(`${pct}%`, barX + barWidth + 6, appY);
          appY += 18;
        });
        doc.y = appY + 12;
      }

      // Team Security & Alerts Breakdown
      doc.fontSize(13).font('Helvetica-Bold').fillColor('#0f172a').text('TEAM SECURITY ALERTS & NOTIFICATIONS', 40, doc.y);
      doc.moveDown(0.6);

      const alertEntries = Object.entries(data.alertStats || {});
      if (alertEntries.length === 0) {
        const boxY = doc.y;
        doc.roundedRect(40, boxY, 515, 34, 6).fillAndStroke('#f0fdf4', '#bbf7d0');
        doc.fillColor('#15803d').fontSize(9.5).font('Helvetica-Bold')
           .text('✓ Zero security violations or policy warnings triggered across the entire team.', 55, boxY + 10);
        doc.y = boxY + 44;
      } else {
        let alertY = doc.y;
        alertEntries.forEach(([alertType, count]) => {
          doc.roundedRect(40, alertY, 515, 26, 4).fillAndStroke('#fffbeb', '#fde68a');
          doc.fillColor('#b45309').fontSize(9).font('Helvetica-Bold')
             .text(`Alert Type: ${alertType}`, 52, alertY + 7, { width: 260 });
          doc.fillColor('#1e293b').font('Helvetica')
             .text(`Total Events: ${count} across team`, 320, alertY + 7, { width: 220, align: 'right' });
          alertY += 31;
        });
        doc.y = alertY + 10;
      }

      // Executive Recommendations for the Team
      doc.fontSize(13).font('Helvetica-Bold').fillColor('#0f172a').text('EXECUTIVE WORKFORCE RECOMMENDATIONS', 40, doc.y);
      doc.moveDown(0.5);

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
        doc.fontSize(9.5).font('Helvetica-Bold').fillColor('#0f172a').text(`${idx + 1}. ${rec.title}`, 45, doc.y);
        doc.fontSize(8.5).font('Helvetica').fillColor('#475569').text(rec.desc, 60, doc.y, { width: 490 });
        doc.moveDown(0.5);
      });

      // Footer
      const footerY = Math.min(doc.y + 20, 770);
      doc.rect(40, footerY, 515, 1).fill('#e2e8f0');
      doc.fontSize(7.5).font('Helvetica').fillColor('#94a3b8')
         .text(`Generated on ${new Date().toLocaleString()}  •  Niyantran Workflow Monitoring System  •  Confidential Team Report`, 40, footerY + 8, { align: 'center', width: 515, lineBreak: false });

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

  /**
   * TEAM CSV EXPORT
   */
  async exportTeamCSV(startDate, endDate, options = {}) {
    try {
      const data = await this.gatherTeamReportData(startDate, endDate, options);
      const sDate = new Date(startDate);
      const eDate = new Date(endDate);
      const isSameDay = sDate.toDateString() === eDate.toDateString();
      const sDay = String(sDate.getDate()).padStart(2, '0');
      const sMonth = String(sDate.getMonth() + 1).padStart(2, '0');
      const eDay = String(eDate.getDate()).padStart(2, '0');
      const eMonth = String(eDate.getMonth() + 1).padStart(2, '0');
      const dateDisplay = isSameDay ? `${sDay}/${sMonth}` : `${sDay}/${sMonth} - ${eDay}/${eMonth}`;

      // Exact Columns matching specification with Employee ID, AIM, Blocker, Achievement:
      // Emp ID,Name,Date,AIM,Blocker,Achievement,Activities,Productivity,Active Hour,Key Strokes,Mouse Score,Efficiency
      let csv = 'Emp ID,Name,Date,AIM,Blocker,Achievement,Activities,Productivity,Active Hour,Key Strokes,Mouse Score,Efficiency\n';

      const cleanField = (txt) => {
        if (!txt || txt === '-') return '-';
        return String(txt).replace(/"/g, '""').replace(/[\r\n\t]+/g, ' ').trim();
      };

      data.members.forEach(m => {
        const empId = (m.employeeId || formatEmployeeId(m.email) || 'N/A').replace(/"/g, '""');
        const name = (m.name || 'Employee').replace(/"/g, '""');
        const aim = cleanField(m.aim);
        const blocker = cleanField(m.blocker);
        const achievement = cleanField(m.achievement);
        const acts = m.totalActivities > 0 ? m.totalActivities : '-';
        const prod = m.totalActivities > 0 ? `${m.avgProductivity}%` : '-';
        const hours = (m.totalActivities > 0 || m.activeSeconds > 0) ? (m.activeHoursFormatted || `${m.activeHours}h`) : '-';
        const keys = m.totalKeystrokes > 0 ? m.totalKeystrokes : '-';
        const mouse = m.totalActivities > 0 ? `${m.avgMouse}%` : '-';
        const eff = m.efficiency === 'No Activity' ? '-' : m.efficiency;
        csv += `"${empId}","${name}","${dateDisplay}","${aim}","${blocker}","${achievement}",${acts},"${prod}","${hours}","${keys}","${mouse}","${eff}"\n`;
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
