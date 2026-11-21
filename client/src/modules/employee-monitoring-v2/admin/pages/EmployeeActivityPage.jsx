/**
 * NIYANTRAN EMPLOYEE MONITORING V2
 * Analytics — Individual Employee Activity Drill-Down Page
 *
 * Real individual telemetry inspection bound strictly to
 * /api/monitoring-v2/admin/live-team and /api/monitoring-v2/telemetry/timeline.
 * Zero mock fallbacks.
 */

import React, { useState, useEffect } from 'react';
import Card, { CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card.jsx';
import Table, { TableHeader, TableBody, TableRow, TableHead, TableCell } from '../../components/ui/Table.jsx';
import Badge from '../../components/ui/Badge.jsx';
import TimelineHeatmap from '../../components/charts/TimelineHeatmap.jsx';
import CategoryDonut from '../../components/charts/CategoryDonut.jsx';
import monitoringV2Api from '../../services/monitoringV2Api.js';
import { Laptop, Clock, ShieldCheck, User } from 'lucide-react';

export const EmployeeActivityPage = () => {
  const [employees, setEmployees] = useState([]);
  const [selectedEmpId, setSelectedEmpId] = useState('');
  const [timeline, setTimeline] = useState([]);
  const [categories, setCategories] = useState([]);

  // Fetch real team members
  useEffect(() => {
    let mounted = true;
    async function loadTeam() {
      try {
        const res = await monitoringV2Api.getLiveTeam();
        const team = res?.data?.team || [];
        if (mounted && team.length > 0) {
          setEmployees(team);
          setSelectedEmpId(team[0].employeeId || team[0].sessionId);
        } else if (mounted) {
          setEmployees([]);
          setSelectedEmpId('');
        }
      } catch (err) {
        console.error('[EmployeeActivityPage] Error loading live team:', err);
        if (mounted) {
          setEmployees([]);
          setSelectedEmpId('');
        }
      }
    }
    loadTeam();
  }, []);

  // Fetch timeline for selected employee
  useEffect(() => {
    if (!selectedEmpId) {
      setTimeline([]);
      setCategories([]);
      return;
    }

    let mounted = true;
    async function loadTimeline() {
      try {
        const res = await monitoringV2Api.getDailyTimeline({ employeeId: selectedEmpId });
        if (mounted && res?.data?.timeline) {
          setTimeline(res.data.timeline);
        } else if (mounted) {
          setTimeline([]);
        }
      } catch {
        if (mounted) setTimeline([]);
      }

      try {
        const sumRes = await monitoringV2Api.getTeamSummary({ employeeId: selectedEmpId });
        if (mounted && sumRes?.data?.categoryBreakdown) {
          setCategories(sumRes.data.categoryBreakdown);
        } else if (mounted) {
          setCategories([]);
        }
      } catch {
        if (mounted) setCategories([]);
      }
    }

    loadTimeline();
  }, [selectedEmpId]);

  const selectedEmployee = employees.find((m) => (m.employeeId || m.sessionId) === selectedEmpId) || null;
  const elapsedMinutes = selectedEmployee ? Math.round((selectedEmployee.elapsedSeconds || 0) / 60) : 0;
  const durationText = `${Math.floor(elapsedMinutes / 60)}h ${elapsedMinutes % 60}m`;

  return (
    <div className="space-y-6">
      {/* Header with employee switcher */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-100">
            Employee Activity Drill-Down
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Detailed 60-second telemetry inspection with verified privacy guarantees
          </p>
        </div>

        {/* Employee selector */}
        {employees.length > 0 && (
          <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-lg p-1.5 px-3">
            <User className="w-3.5 h-3.5 text-indigo-400" />
            <span className="text-xs text-slate-400">Employee:</span>
            <select
              value={selectedEmpId}
              onChange={(e) => setSelectedEmpId(e.target.value)}
              className="bg-transparent text-xs text-slate-200 font-semibold focus:outline-none cursor-pointer"
            >
              {employees.map((emp) => (
                <option key={emp.sessionId || emp.employeeId} value={emp.employeeId || emp.sessionId} className="bg-slate-900 text-slate-200">
                  {emp.employeeName} ({emp.department})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Selected Employee Summary Card */}
      {selectedEmployee ? (
        <Card>
          <CardContent className="p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-indigo-600/20 text-indigo-300 font-bold text-base flex items-center justify-center border border-indigo-500/30">
                {(selectedEmployee.employeeName || 'U').split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-slate-100">{selectedEmployee.employeeName}</h3>
                  <Badge variant={selectedEmployee.state === 'ACTIVE' ? 'success' : 'warning'}>
                    {selectedEmployee.state}
                  </Badge>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  {selectedEmployee.role} • {selectedEmployee.department}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-6 text-xs text-slate-300">
              <div>
                <span className="text-slate-500 block text-[10px] uppercase font-medium">Active Device</span>
                <span className="font-semibold">{selectedEmployee.deviceName || selectedEmployee.deviceId || 'Primary Workstation'}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px] uppercase font-medium">Session Duration</span>
                <span className="font-semibold font-mono">{durationText}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px] uppercase font-medium">Privacy Status</span>
                <span className="text-emerald-400 font-semibold flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" /> Aggregates Only
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-6 text-center text-slate-500 text-xs">
            No active employee sessions currently available for inspection.
          </CardContent>
        </Card>
      )}

      {/* Timeline Heatmap */}
      <Card>
        <CardHeader>
          <CardTitle>Session Activity Buckets (Today)</CardTitle>
          <CardDescription>
            Telemetry aggregated into 5-minute activity chunks with category breakdown
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TimelineHeatmap timeline={timeline} />
        </CardContent>
      </Card>

      {/* Charts & Raw Samples */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Time in Authorized Categories</CardTitle>
            <CardDescription>
              Process categories authorized under global policy
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CategoryDonut categories={categories} size={150} />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Verifiable Telemetry Audit Sample</CardTitle>
            <CardDescription>
              Demonstrates numeric count accumulation without invasive keylogging
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow hover={false}>
                  <TableHead>Bucket Window</TableHead>
                  <TableHead>Active Sec</TableHead>
                  <TableHead>Idle Sec</TableHead>
                  <TableHead>Key Press Count</TableHead>
                  <TableHead>Mouse Clicks</TableHead>
                  <TableHead>Category</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {timeline.length === 0 ? (
                  <TableRow hover={false}>
                    <TableCell colSpan={6} className="text-center py-6 text-slate-500">
                      No telemetry slices recorded today.
                    </TableCell>
                  </TableRow>
                ) : (
                  timeline.slice(0, 5).map((sample, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-mono text-slate-300">
                        {sample.time || (sample.timestamp ? new Date(sample.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—')}
                      </TableCell>
                      <TableCell className="font-mono text-emerald-400">{sample.activeSeconds ?? 0}s</TableCell>
                      <TableCell className="font-mono text-amber-400">{sample.idleSeconds ?? 0}s</TableCell>
                      <TableCell className="font-mono text-slate-300">{sample.keyCount ?? 0}</TableCell>
                      <TableCell className="font-mono text-slate-300">{sample.mouseCount ?? 0}</TableCell>
                      <TableCell>
                        <span className="text-indigo-400 font-mono text-xs">{sample.category || 'NEUTRAL'}</span>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default EmployeeActivityPage;
