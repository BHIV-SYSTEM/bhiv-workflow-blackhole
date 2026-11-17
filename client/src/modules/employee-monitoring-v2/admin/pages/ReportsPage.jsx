/**
 * NIYANTRAN EMPLOYEE MONITORING V2
 * Analytics — Reports & Export Page
 */

import React, { useState } from 'react';
import Card, { CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card.jsx';
import Table, { TableHeader, TableBody, TableRow, TableHead, TableCell } from '../../components/ui/Table.jsx';
import Button from '../../components/ui/Button.jsx';
import Badge from '../../components/ui/Badge.jsx';
import { MOCK_LIVE_TEAM } from '../../mocks/mockFleetData.js';
import { Download, FileSpreadsheet, Calendar, Filter, CheckCircle2 } from 'lucide-react';

export const ReportsPage = () => {
  const [reportType, setReportType] = useState('productivity');
  const [downloadSuccess, setDownloadSuccess] = useState(false);

  const handleExport = (format) => {
    // Generate simple client-side mock export
    const data = MOCK_LIVE_TEAM.map((m) => ({
      name: m.name,
      department: m.department,
      role: m.role,
      employmentStatus: m.employmentStatus,
      sessionStatus: m.sessionStatus,
      focusedHours: (m.sessionDurationMinutes / 60).toFixed(1),
      inputRate: `${m.inputActivityPercent}%`,
    }));

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `niyantran_v2_report_${reportType}_${new Date().toISOString().split('T')[0]}.${format === 'csv' ? 'csv' : 'json'}`;
    a.click();
    URL.revokeObjectURL(url);

    setDownloadSuccess(true);
    setTimeout(() => setDownloadSuccess(false), 2500);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-100">
            Monitoring Reports & Exports
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Generate compliant aggregate reports without exposing private employee text or screens
          </p>
        </div>

        {/* Export buttons */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            icon={Download}
            onClick={() => handleExport('csv')}
          >
            Export CSV
          </Button>
          <Button
            variant="primary"
            size="sm"
            icon={FileSpreadsheet}
            onClick={() => handleExport('json')}
          >
            Export JSON
          </Button>
        </div>
      </div>

      {downloadSuccess && (
        <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>Report exported successfully! Download triggered in browser.</span>
        </div>
      )}

      {/* Report Configuration Card */}
      <Card>
        <CardContent className="p-5 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="text-xs font-semibold text-slate-400 block mb-1.5">Report Type</label>
            <select
              value={reportType}
              onChange={(e) => setReportType(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
            >
              <option value="productivity">Executive Productivity & Focus Summary</option>
              <option value="hardware_idle">Hardware Inactivity & Away Audit</option>
              <option value="device_handoff">Device Handoff & Session Governance</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-400 block mb-1.5">Date Range</label>
            <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-slate-200">
              <Calendar className="w-4 h-4 text-slate-400" />
              <span>Nov 01, 2026 — Nov 17, 2026 (MTD)</span>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-400 block mb-1.5">Privacy Guard</label>
            <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-[11px] text-emerald-300">
              Aggregated Metrics Only (Zero Keystrokes / Screen Scans)
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Report Data Preview Table */}
      <Card>
        <CardHeader>
          <CardTitle>Report Preview: Executive Summary</CardTitle>
          <CardDescription>
            Showing 7 active team members aggregated for current month
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow hover={false}>
                <TableHead>Employee</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Focused Hours</TableHead>
                <TableHead>Input Rate</TableHead>
                <TableHead>Attendance Sync</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {MOCK_LIVE_TEAM.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="font-semibold text-slate-200">{m.name}</TableCell>
                  <TableCell className="text-slate-400">{m.department}</TableCell>
                  <TableCell className="font-mono text-emerald-400">
                    {(m.sessionDurationMinutes / 60).toFixed(1)} hrs
                  </TableCell>
                  <TableCell className="font-mono text-slate-300">{m.inputActivityPercent}%</TableCell>
                  <TableCell>
                    <Badge variant="success">Verified (Read-Only)</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={m.employmentStatus === 'ACTIVE' ? 'neutral' : 'warning'}>
                      {m.employmentStatus}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default ReportsPage;
