import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Sparkles,
  CheckCircle2,
  Clock,
  Target,
  AlertCircle,
  Activity,
  Award,
  Calendar,
  User as UserIcon,
  Building2,
  Printer,
  Hash,
  Zap,
  MousePointer,
  Keyboard
} from 'lucide-react';
import { formatDate } from '@/lib/dateFormat';

/**
 * Generates an executive A4 printable HTML document.
 * Injected into a standalone hidden iframe to completely eliminate Radix portal & dialog scroll-lock bugs.
 */
function generatePrintableReportHtml(data) {
  const emp = data?.employee || {};
  const metrics = data?.metrics || {};
  const workSummary = data?.workSummary || {};
  const taskCounts = data?.taskCounts || {};
  const dateStr = data?.date ? formatDate(data.date) : new Date().toLocaleDateString('en-GB');
  const nowStr = `${new Date().toLocaleDateString('en-GB')} ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;

  const activeHours = metrics.activeHoursFormatted || "0h 0m";
  const productivity = metrics.productivityScore ?? 0;
  const efficiency = metrics.efficiencyScore ?? 0;
  const efficiencyLabel = metrics.efficiencyLabel || (efficiency >= 70 ? 'High' : efficiency >= 45 ? 'Moderate' : 'Low');
  const keystrokes = (metrics.keystrokes || 0).toLocaleString();
  const mouseEvents = (metrics.mouseEvents || 0).toLocaleString();
  const mouseScore = metrics.mouseScore ?? 0;
  const tasksDone = `${taskCounts.completed || 0} / ${taskCounts.total || 0}`;

  const escapeHtml = (str) => {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  };

  const aimText = escapeHtml(workSummary.aim || "No aim set for today");
  const aimStatus = escapeHtml(workSummary.completionStatus || "Not Set");
  const aimProgress = Math.min(100, Math.max(0, workSummary.progressPercentage || 0));
  const achievements = escapeHtml(workSummary.achievements || "In progress");
  const blockers = escapeHtml(workSummary.blockers || "No blockers reported");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Daily Performance Report - ${escapeHtml(emp.name || 'Employee')}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 10mm 14mm;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      margin: 0;
      padding: 0;
      color: #0f172a;
      background: #ffffff;
      font-size: 12px;
      line-height: 1.45;
    }
    .report-container {
      max-width: 100%;
      margin: 0 auto;
    }
    .header-banner {
      border-bottom: 2px solid #0f172a;
      padding-bottom: 12px;
      margin-bottom: 16px;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
    }
    .header-title {
      font-size: 20px;
      font-weight: 900;
      letter-spacing: -0.5px;
      color: #020617;
      text-transform: uppercase;
      margin: 0;
    }
    .header-subtitle {
      font-size: 11px;
      font-weight: 600;
      color: #475569;
      margin-top: 3px;
    }
    .header-meta {
      text-align: right;
    }
    .badge {
      display: inline-block;
      font-size: 10px;
      font-weight: 700;
      padding: 3px 8px;
      border-radius: 4px;
      background: #0f172a;
      color: #ffffff;
      letter-spacing: 0.5px;
      text-transform: uppercase;
    }
    .gen-date {
      font-size: 10px;
      color: #64748b;
      margin-top: 4px;
    }
    .meta-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 16px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
    }
    .meta-table td {
      padding: 8px 12px;
      border: 1px solid #e2e8f0;
      width: 25%;
    }
    .meta-label {
      font-size: 10px;
      text-transform: uppercase;
      font-weight: 700;
      color: #64748b;
      display: block;
      margin-bottom: 2px;
    }
    .meta-value {
      font-size: 12px;
      font-weight: 700;
      color: #0f172a;
    }
    .meta-value.mono {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      color: #2563eb;
    }
    .section-title {
      font-size: 11px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #1e293b;
      margin-bottom: 8px;
      margin-top: 14px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 10px;
      margin-bottom: 14px;
    }
    .metric-card {
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 10px 12px;
      background: #ffffff;
    }
    .metric-val {
      font-size: 18px;
      font-weight: 800;
      color: #0f172a;
      line-height: 1.2;
    }
    .metric-sub {
      font-size: 10px;
      font-weight: 600;
      color: #64748b;
      margin-top: 3px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .pill {
      font-size: 9px;
      font-weight: 700;
      padding: 2px 6px;
      border-radius: 3px;
      background: #e2e8f0;
      color: #334155;
    }
    .pill-green { background: #dcfce7; color: #166534; }
    .pill-blue { background: #dbeafe; color: #1e40af; }
    .aim-box {
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 12px;
      background: #ffffff;
      margin-bottom: 14px;
    }
    .aim-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 6px;
    }
    .aim-desc {
      font-size: 12px;
      font-weight: 600;
      color: #1e293b;
      margin: 0 0 10px 0;
      white-space: pre-wrap;
      line-height: 1.4;
    }
    .progress-bar-bg {
      background: #e2e8f0;
      height: 6px;
      border-radius: 3px;
      overflow: hidden;
    }
    .progress-bar-fill {
      background: #2563eb;
      height: 100%;
    }
    .two-col {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      margin-bottom: 14px;
    }
    .log-box {
      border-radius: 6px;
      padding: 12px;
    }
    .achieve-box {
      background: #f0fdf4;
      border: 1px solid #bbf7d0;
    }
    .blocker-box {
      background: #fffbeb;
      border: 1px solid #fef3c7;
    }
    .log-title {
      font-size: 11px;
      font-weight: 800;
      text-transform: uppercase;
      margin-bottom: 6px;
    }
    .achieve-title { color: #166534; }
    .blocker-title { color: #92400e; }
    .log-content {
      font-size: 11px;
      color: #1e293b;
      margin: 0;
      white-space: pre-wrap;
      line-height: 1.45;
    }
    .signatures {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 24px;
      padding-top: 14px;
      margin-top: 18px;
      border-top: 1px solid #cbd5e1;
    }
    .sig-line {
      border-bottom: 1px solid #94a3b8;
      height: 32px;
      margin-bottom: 6px;
    }
    .sig-title {
      font-size: 10px;
      font-weight: 700;
      color: #475569;
      text-transform: uppercase;
    }
    .footer-note {
      text-align: center;
      font-size: 9px;
      color: #94a3b8;
      margin-top: 16px;
    }
  </style>
</head>
<body>
  <div class="report-container">
    <div class="header-banner">
      <div>
        <h1 class="header-title">BLACKHOLE INFIVERSE LLP</h1>
        <div class="header-subtitle">Niyantran Workflow & Attendance Management Platform</div>
      </div>
      <div class="header-meta">
        <span class="badge">Day-End Performance Report</span>
        <div class="gen-date">Generated: ${nowStr}</div>
      </div>
    </div>

    <table class="meta-table">
      <tr>
        <td>
          <span class="meta-label">Employee</span>
          <span class="meta-value">${escapeHtml(emp.name || 'User')}</span>
        </td>
        <td>
          <span class="meta-label">Employee ID</span>
          <span class="meta-value mono">${escapeHtml(emp.employeeId || 'N/A')}</span>
        </td>
        <td>
          <span class="meta-label">Department</span>
          <span class="meta-value">${escapeHtml(emp.department || 'General')}</span>
        </td>
        <td>
          <span class="meta-label">Date</span>
          <span class="meta-value">${dateStr}</span>
        </td>
      </tr>
    </table>

    <div class="section-title">Telemetry & Activity Monitoring Metrics</div>
    <div class="metrics-grid">
      <div class="metric-card">
        <div class="metric-val">${activeHours}</div>
        <div class="metric-sub">
          <span>Active Working Hours</span>
          <span class="pill pill-blue">Active</span>
        </div>
      </div>
      <div class="metric-card">
        <div class="metric-val">${productivity}%</div>
        <div class="metric-sub">
          <span>Productivity Score</span>
          <span class="pill">${productivity >= 60 ? 'Optimal' : 'Standard'}</span>
        </div>
      </div>
      <div class="metric-card">
        <div class="metric-val">${efficiency}%</div>
        <div class="metric-sub">
          <span>Efficiency</span>
          <span class="pill pill-green">${efficiencyLabel}</span>
        </div>
      </div>
      <div class="metric-card">
        <div class="metric-val">${keystrokes}</div>
        <div class="metric-sub">
          <span>Total Keystrokes</span>
          <span class="pill">Keyboard</span>
        </div>
      </div>
      <div class="metric-card">
        <div class="metric-val">${mouseEvents}</div>
        <div class="metric-sub">
          <span>Mouse Events / Scrolls</span>
          <span class="pill">${mouseScore}% Activity</span>
        </div>
      </div>
      <div class="metric-card">
        <div class="metric-val">${tasksDone}</div>
        <div class="metric-sub">
          <span>Tasks Completed</span>
          <span class="pill">Workflow</span>
        </div>
      </div>
    </div>

    <div class="section-title">Daily Objective & Output Target</div>
    <div class="aim-box">
      <div class="aim-header">
        <strong style="font-size: 11px; text-transform: uppercase; color: #475569;">Target Aim</strong>
        <span class="pill ${aimStatus === 'Completed' ? 'pill-green' : 'pill-blue'}">${aimStatus}</span>
      </div>
      <p class="aim-desc">${aimText}</p>
      <div>
        <div style="display: flex; justify-content: space-between; font-size: 10px; color: #64748b; margin-bottom: 4px;">
          <span>Target Progress</span>
          <strong style="color: #0f172a;">${aimProgress}%</strong>
        </div>
        <div class="progress-bar-bg">
          <div class="progress-bar-fill" style="width: ${aimProgress}%;"></div>
        </div>
      </div>
    </div>

    <div class="two-col">
      <div class="log-box achieve-box">
        <div class="log-title achieve-title">Key Achievements & Deliverables</div>
        <p class="log-content">${achievements}</p>
      </div>
      <div class="log-box blocker-box">
        <div class="log-title blocker-title">Blockers & Challenges</div>
        <p class="log-content">${blockers}</p>
      </div>
    </div>

    <div class="signatures">
      <div>
        <div class="sig-line"></div>
        <div class="sig-title">Employee Signature</div>
        <div style="font-size: 10px; color: #64748b; margin-top: 2px;">Name: ${escapeHtml(emp.name || 'User')} &bull; Date: ${dateStr}</div>
      </div>
      <div>
        <div class="sig-line"></div>
        <div class="sig-title">Supervisor / Lead Verification</div>
        <div style="font-size: 10px; color: #166534; margin-top: 2px;">Status: Verified &bull; System Auto-Logged</div>
      </div>
    </div>

    <div class="footer-note">
      This is an official automated performance record generated by Blackhole Infiverse LLP &bull; Niyantran System &bull; Confidential
    </div>
  </div>
</body>
</html>`;
}

export function DayEndReportDialog({ isOpen, onClose, reportData, isLoading }) {
  if (!isOpen) return null;

  const handlePrint = () => {
    try {
      const printableHtml = generatePrintableReportHtml(reportData);

      // Create an invisible iframe for reliable standalone printing
      const iframe = document.createElement('iframe');
      iframe.setAttribute('style', 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;');
      document.body.appendChild(iframe);

      const frameDoc = iframe.contentWindow || iframe.contentDocument;
      const targetDoc = frameDoc.document || frameDoc;

      targetDoc.open();
      targetDoc.write(printableHtml);
      targetDoc.close();

      setTimeout(() => {
        try {
          iframe.contentWindow.focus();
          iframe.contentWindow.print();
        } catch (e) {
          console.error("Iframe print error, falling back to window.print:", e);
          window.print();
        }
        setTimeout(() => {
          try {
            document.body.removeChild(iframe);
          } catch (e) {}
        }, 3000);
      }, 300);
    } catch (err) {
      console.error("Print generation error, falling back to window.print():", err);
      window.print();
    }
  };

  const employee = reportData?.employee || {};
  const workSummary = reportData?.workSummary || {};
  const metrics = reportData?.metrics || {};
  const taskCounts = reportData?.taskCounts || {};

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-[95vw] max-w-3xl sm:max-w-3xl max-h-[90vh] overflow-y-auto border-border bg-card text-card-foreground shadow-2xl p-6 rounded-2xl">
        <div className="space-y-5">
          {/* On-Screen Dialog Header */}
          <DialogHeader className="border-b border-border/60 pb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500">
                  <Award className="h-6 w-6" />
                </div>
                <div>
                  <DialogTitle className="text-xl font-bold text-foreground flex items-center gap-2">
                    Day-End Performance & Work Report
                    <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-xs font-semibold">
                      Day Completed
                    </Badge>
                  </DialogTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Official daily summary, verified telemetry metrics, and task progress
                  </p>
                </div>
              </div>
            </div>
          </DialogHeader>

          {isLoading ? (
            <div className="py-12 text-center text-sm text-muted-foreground flex flex-col items-center justify-center gap-2">
              <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
              <p>Generating your day-end performance report...</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Employee & Date Meta Card */}
              <div className="p-4 rounded-xl bg-muted/40 border border-border/70 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                <div className="space-y-0.5">
                  <span className="text-muted-foreground flex items-center gap-1 font-medium">
                    <UserIcon className="h-3.5 w-3.5" /> Employee
                  </span>
                  <p className="font-bold text-foreground text-sm break-words">
                    {employee.name || 'User'}
                  </p>
                </div>

                <div className="space-y-0.5">
                  <span className="text-muted-foreground flex items-center gap-1 font-medium">
                    <Hash className="h-3.5 w-3.5" /> Emp ID
                  </span>
                  <p className="font-mono font-bold text-foreground text-sm">
                    {employee.employeeId || 'N/A'}
                  </p>
                </div>

                <div className="space-y-0.5">
                  <span className="text-muted-foreground flex items-center gap-1 font-medium">
                    <Building2 className="h-3.5 w-3.5" /> Department
                  </span>
                  <p className="font-bold text-foreground text-sm break-words">
                    {employee.department || 'General'}
                  </p>
                </div>

                <div className="space-y-0.5">
                  <span className="text-muted-foreground flex items-center gap-1 font-medium">
                    <Calendar className="h-3.5 w-3.5" /> Date
                  </span>
                  <p className="font-bold text-foreground text-sm">
                    {reportData?.date ? formatDate(reportData.date) : formatDate(new Date())}
                  </p>
                </div>
              </div>

              {/* Comprehensive 6-Metric Telemetry & Performance Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {/* 1. Active Working Hours */}
                <div className="p-3.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-center">
                  <div className="text-2xl font-black text-blue-600 dark:text-blue-400">
                    {metrics.activeHoursFormatted || "0h 0m"}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-1 flex items-center justify-center gap-1 font-medium">
                    <Clock className="h-3.5 w-3.5 text-blue-500" /> Active Working Time
                  </div>
                </div>

                {/* 2. Productivity Score */}
                <div className="p-3.5 rounded-xl bg-purple-500/10 border border-purple-500/20 text-center">
                  <div className="text-2xl font-black text-purple-600 dark:text-purple-400">
                    {metrics.productivityScore ?? 0}%
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-1 flex items-center justify-center gap-1 font-medium">
                    <Activity className="h-3.5 w-3.5 text-purple-500" /> Productivity Score
                  </div>
                </div>

                {/* 3. Efficiency Score */}
                <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-center">
                  <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                    {metrics.efficiencyScore ?? 0}%
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-1 flex items-center justify-center gap-1 font-medium">
                    <Zap className="h-3.5 w-3.5 text-emerald-500" /> Efficiency ({metrics.efficiencyLabel || 'Good'})
                  </div>
                </div>

                {/* 4. Keystrokes */}
                <div className="p-3.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-center">
                  <div className="text-2xl font-black text-indigo-600 dark:text-indigo-400">
                    {(metrics.keystrokes || 0).toLocaleString()}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-1 flex items-center justify-center gap-1 font-medium">
                    <Keyboard className="h-3.5 w-3.5 text-indigo-500" /> Total Keystrokes
                  </div>
                </div>

                {/* 5. Mouse Activity & Scrolls */}
                <div className="p-3.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-center">
                  <div className="text-2xl font-black text-cyan-600 dark:text-cyan-400">
                    {(metrics.mouseEvents || 0).toLocaleString()}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-1 flex items-center justify-center gap-1 font-medium">
                    <MousePointer className="h-3.5 w-3.5 text-cyan-500" /> Mouse Events / Scrolls ({metrics.mouseScore ?? 0}%)
                  </div>
                </div>

                {/* 6. Tasks Done */}
                <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-center">
                  <div className="text-2xl font-black text-amber-600 dark:text-amber-400">
                    {taskCounts.completed || 0} / {taskCounts.total || 0}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-1 flex items-center justify-center gap-1 font-medium">
                    <CheckCircle2 className="h-3.5 w-3.5 text-amber-500" /> Tasks Done
                  </div>
                </div>
              </div>

              {/* Daily Aim Section */}
              <div className="p-4 rounded-xl bg-card border border-border/80 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-primary flex items-center gap-1.5 uppercase tracking-wide">
                    <Target className="h-4 w-4 text-primary" /> Today's Aim
                  </span>
                  <Badge
                    variant="outline"
                    className={
                      workSummary.completionStatus === 'Completed'
                        ? 'border-emerald-500/40 text-emerald-500 bg-emerald-500/10 text-xs font-semibold'
                        : workSummary.completionStatus === 'In Progress'
                          ? 'border-blue-500/40 text-blue-500 bg-blue-500/10 text-xs font-semibold'
                          : 'border-slate-400 text-slate-500 bg-slate-100 text-xs font-semibold'
                    }
                  >
                    {workSummary.completionStatus || 'Not Set'}
                  </Badge>
                </div>
                <p className="text-sm font-semibold text-foreground break-words leading-relaxed">
                  {workSummary.aim || "No aim set for today."}
                </p>
                <div className="pt-1">
                  <div className="flex justify-between text-xs text-muted-foreground mb-1">
                    <span>Aim Progress</span>
                    <span className="font-bold text-foreground">{workSummary.progressPercentage || 0}%</span>
                  </div>
                  <Progress value={workSummary.progressPercentage || 0} className="h-2" />
                </div>
              </div>

              {/* Achievements & Blockers Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Achievements */}
                <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/25 space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wide">
                    <CheckCircle2 className="h-4 w-4" />
                    Key Achievements
                  </div>
                  <p className="text-xs text-foreground/95 leading-relaxed whitespace-pre-wrap break-words">
                    {workSummary.achievements || "In progress."}
                  </p>
                </div>

                {/* Blockers */}
                <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/25 space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wide">
                    <AlertCircle className="h-4 w-4" />
                    Blockers & Challenges
                  </div>
                  <p className="text-xs text-foreground/95 leading-relaxed whitespace-pre-wrap break-words">
                    {workSummary.blockers || "No blockers reported."}
                  </p>
                </div>
              </div>

              {/* Footer Notice */}
              <p className="text-xs text-muted-foreground text-center italic pt-1">
                ✨ Verified report logged in Niyantran platform. Automatically aggregated for payroll & productivity audits.
              </p>
            </div>
          )}

          {/* Action Buttons */}
          <DialogFooter className="border-t border-border/60 pt-4 flex flex-row items-center justify-between sm:justify-between gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handlePrint}
              className="text-xs flex items-center gap-2 border-primary/40 hover:bg-primary/10 text-primary font-semibold"
            >
              <Printer className="h-4 w-4" /> Print / Save as PDF
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={onClose}
              className="text-xs px-6 font-semibold"
            >
              Close
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default DayEndReportDialog;
