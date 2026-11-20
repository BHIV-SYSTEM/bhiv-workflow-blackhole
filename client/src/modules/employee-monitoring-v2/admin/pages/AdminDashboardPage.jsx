/**
 * NIYANTRAN EMPLOYEE MONITORING V2
 * Admin Overview — Main Fleet Dashboard Page
 */

import React, { useState, useEffect } from 'react';
import { useMonitoringV2Context } from '../../context/MonitoringV2Context.jsx';
import MockDataService from '../../services/mockDataService.js';
import monitoringV2Api from '../../services/monitoringV2Api.js';
import MetricCard from '../../components/ui/MetricCard.jsx';
import Card, { CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card.jsx';
import Table, { TableHeader, TableBody, TableRow, TableHead, TableCell } from '../../components/ui/Table.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import ActivityBarChart from '../../components/charts/ActivityBarChart.jsx';
import CategoryDonut from '../../components/charts/CategoryDonut.jsx';
import PrivacyShieldBadge from '../../components/common/PrivacyShieldBadge.jsx';
import {
  Users,
  UserCheck,
  UserX,
  Activity,
  Clock,
  WifiOff,
  Laptop,
  ArrowRight,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';

export const AdminDashboardPage = () => {
  const { departmentFilter, setActiveTab } = useMonitoringV2Context();

  const [realLiveTeam, setRealLiveTeam] = useState(null);

  useEffect(() => {
    let mounted = true;
    async function loadData() {
      try {
        const teamRes = await monitoringV2Api.getLiveTeam();
        if (mounted && teamRes?.data?.team && teamRes.data.team.length > 0) {
          const mapped = teamRes.data.team.map((s) => ({
            id: s.sessionId || s.employeeId,
            name: s.employeeName,
            role: s.department || 'Engineer',
            department: s.department,
            avatar: (s.employeeName || 'U').split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase(),
            employmentStatus: 'ACTIVE',
            sessionStatus: s.state,
            activeDevice: { name: s.deviceId || (s.mode === 'PHONE' ? 'Mobile Phone' : 'Windows PC') },
            currentCategory: s.primaryCategory || 'DEVELOPMENT',
            inputActivityPercent: s.focusScore || 70,
            lastHeartbeatSecondsAgo: Math.max(0, Math.round((Date.now() - new Date(s.lastTelemetryAt || s.startedAt).getTime()) / 1000)),
          }));
          setRealLiveTeam(mapped);
        }
      } catch {
        // Fallback to local fleet mock
      }
    }

    loadData();
    const interval = setInterval(loadData, 8000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  const stats = MockDataService.getSummaryStats();
  const liveTeam = realLiveTeam && realLiveTeam.length > 0
    ? realLiveTeam.slice(0, 5)
    : MockDataService.getLiveTeam({ department: departmentFilter }).slice(0, 5);
  const trends = MockDataService.getDailyTrends();
  const categories = MockDataService.getCategoryBreakdown();
  const alerts = MockDataService.getAlerts().filter((a) => !a.resolved);

  return (
    <div className="space-y-6">
      {/* Top Banner: Privacy Assurance & V1 Conflict Alert (if any) */}
      <div className="flex flex-col lg:flex-row gap-4 justify-between items-start lg:items-center">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-100">
            Fleet Monitoring Overview
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Real-time aggregate productivity & workstation health | Zero screen scraping or keylogging
          </p>
        </div>
        <PrivacyShieldBadge compact />
      </div>

      {/* V1 Conflict Alert Banner if active */}
      {alerts.some((a) => a.type === 'V1_AGENT_CONFLICT') && (
        <div className="p-3.5 rounded-xl border border-amber-500/30 bg-amber-950/20 text-amber-200 text-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              <strong>Coexistence Warning:</strong> 1 workstation is actively running the legacy V1 agent. V2 telemetry is safely paused on that node.
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setActiveTab('alerts')}
            className="text-amber-300 border-amber-500/30 hover:bg-amber-900/40 text-xs"
          >
            Review Conflict
          </Button>
        </div>
      )}

      {/* Primary KPI Metrics: Separate Employment Status from Live Work-Session Status */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <MetricCard
          label="Total Headcount"
          value={stats.employment.totalHeadcount}
          subtext="Active in HR Master"
          icon={Users}
        />
        <MetricCard
          label="Employed Active"
          value={stats.employment.employedActive}
          subtext="Contract active"
          icon={UserCheck}
        />
        <MetricCard
          label="On Leave Today"
          value={stats.employment.onLeaveToday}
          subtext="Approved leave"
          icon={UserX}
        />
        <MetricCard
          label="Active Session"
          value={realLiveTeam ? realLiveTeam.length : stats.workSessions.activeSessions}
          subtext="Actively working"
          icon={Activity}
          highlight="emerald"
        />
        <MetricCard
          label="Idle Session"
          value={stats.workSessions.idleSessions}
          subtext="No input >3 min"
          icon={Clock}
          highlight="amber"
        />
        <MetricCard
          label="Offline Today"
          value={stats.workSessions.offlineWorkstations}
          subtext="No session opened"
          icon={WifiOff}
        />
        <MetricCard
          label="V1 Coexistence"
          value={stats.workSessions.v1ConflictHold}
          subtext="V2 paused (V1 run)"
          icon={Laptop}
          highlight="purple"
        />
      </div>

      {/* Aggregate Charts Grid: 1-hour Activity Distribution & Categories */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Fleet Activity Heatmap (Hourly Aggregates)</CardTitle>
                <CardDescription>
                  Aggregated active vs idle minutes across all enrolled workstations today
                </CardDescription>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <span className="w-2.5 h-2.5 rounded bg-indigo-500 inline-block" /> Focused
                <span className="w-2.5 h-2.5 rounded bg-amber-500 inline-block ml-2" /> Idle
              </div>
            </CardHeader>
            <CardContent>
              <ActivityBarChart data={trends} />
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle>Work Category Distribution</CardTitle>
              <CardDescription>
                High-level classification (Zero private URLs/Text)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CategoryDonut categories={categories} />
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Live Team Quick Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Live Team Activity</CardTitle>
            <CardDescription>
              Current work sessions filtered by {departmentFilter}
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            icon={ArrowRight}
            onClick={() => setActiveTab('live-team')}
          >
            View All Team Members
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow hover={false}>
                <TableHead>Employee</TableHead>
                <TableHead>Employment</TableHead>
                <TableHead>Session Status</TableHead>
                <TableHead>Current Device</TableHead>
                <TableHead>Focused Category</TableHead>
                <TableHead>Input Rate (60s)</TableHead>
                <TableHead>Last Sync</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {liveTeam.map((member) => (
                <TableRow key={member.id}>
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-indigo-600/30 text-indigo-300 font-semibold text-[11px] flex items-center justify-center border border-indigo-500/30">
                        {member.avatar}
                      </div>
                      <div>
                        <div className="font-medium text-slate-200">{member.name}</div>
                        <div className="text-[10px] text-slate-500">{member.role}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={member.employmentStatus === 'ACTIVE' ? 'success' : 'neutral'}>
                      {member.employmentStatus}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        member.sessionStatus === 'ACTIVE'
                          ? 'success'
                          : member.sessionStatus === 'IDLE'
                            ? 'warning'
                            : member.sessionStatus === 'V1_AGENT_CONFLICT'
                              ? 'danger'
                              : 'neutral'
                      }
                    >
                      {member.sessionStatus}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="text-xs text-slate-300 flex items-center gap-1.5">
                      <Laptop className="w-3.5 h-3.5 text-slate-400" />
                      <span>{member.activeDevice?.name || 'None'}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="font-mono text-xs text-indigo-300">
                      {member.currentCategory}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                        <div
                          className="h-full bg-indigo-500 rounded-full"
                          style={{ width: `${member.inputActivityPercent}%` }}
                        />
                      </div>
                      <span className="font-mono text-xs text-slate-400">
                        {member.inputActivityPercent}%
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-[11px] text-slate-400 font-mono">
                      {member.lastHeartbeatSecondsAgo < 60
                        ? `${member.lastHeartbeatSecondsAgo}s ago`
                        : `${Math.round(member.lastHeartbeatSecondsAgo / 60)}m ago`}
                    </span>
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

export default AdminDashboardPage;
