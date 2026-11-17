/**
 * NIYANTRAN EMPLOYEE MONITORING V2
 * Analytics — Individual Employee Activity Drill-Down Page
 */

import React, { useState } from 'react';
import Card, { CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card.jsx';
import Table, { TableHeader, TableBody, TableRow, TableHead, TableCell } from '../../components/ui/Table.jsx';
import Badge from '../../components/ui/Badge.jsx';
import TimelineHeatmap from '../../components/charts/TimelineHeatmap.jsx';
import CategoryDonut from '../../components/charts/CategoryDonut.jsx';
import MockDataService from '../../services/mockDataService.js';
import PrivacyShieldBadge from '../../components/common/PrivacyShieldBadge.jsx';
import { MOCK_LIVE_TEAM } from '../../mocks/mockFleetData.js';
import { Laptop, Clock, ShieldCheck, User } from 'lucide-react';

export const EmployeeActivityPage = () => {
  const [selectedEmpId, setSelectedEmpId] = useState('emp_101');
  const employee = MOCK_LIVE_TEAM.find((m) => m.id === selectedEmpId) || MOCK_LIVE_TEAM[0];
  const timeline = MockDataService.getPersonalTimeline();
  const categories = MockDataService.getCategoryBreakdown();

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
        <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-lg p-1.5 px-3">
          <User className="w-3.5 h-3.5 text-indigo-400" />
          <span className="text-xs text-slate-400">Employee:</span>
          <select
            value={selectedEmpId}
            onChange={(e) => setSelectedEmpId(e.target.value)}
            className="bg-transparent text-xs text-slate-200 font-semibold focus:outline-none cursor-pointer"
          >
            {MOCK_LIVE_TEAM.map((emp) => (
              <option key={emp.id} value={emp.id} className="bg-slate-900 text-slate-200">
                {emp.name} ({emp.department})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Selected Employee Summary Card */}
      <Card>
        <CardContent className="p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-indigo-600/20 text-indigo-300 font-bold text-base flex items-center justify-center border border-indigo-500/30">
              {employee.avatar}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-100">{employee.name}</h3>
                <Badge variant={employee.sessionStatus === 'ACTIVE' ? 'success' : 'warning'}>
                  {employee.sessionStatus}
                </Badge>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {employee.role} • {employee.department}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-6 text-xs text-slate-300">
            <div>
              <span className="text-slate-500 block text-[10px] uppercase font-medium">Active Device</span>
              <span className="font-semibold">{employee.activeDevice?.name || 'None'}</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px] uppercase font-medium">Session Duration</span>
              <span className="font-semibold font-mono">
                {Math.floor(employee.sessionDurationMinutes / 60)}h {employee.sessionDurationMinutes % 60}m
              </span>
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
                {timeline.slice(0, 5).map((sample, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="font-mono text-slate-300">{sample.time}</TableCell>
                    <TableCell className="font-mono text-emerald-400">{sample.activeSeconds}s</TableCell>
                    <TableCell className="font-mono text-amber-400">{sample.idleSeconds}s</TableCell>
                    <TableCell className="font-mono text-slate-300">{sample.keyCount}</TableCell>
                    <TableCell className="font-mono text-slate-300">{sample.mouseCount}</TableCell>
                    <TableCell>
                      <span className="text-indigo-400 font-mono text-xs">{sample.category}</span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default EmployeeActivityPage;
