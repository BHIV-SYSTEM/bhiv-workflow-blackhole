/**
 * NIYANTRAN EMPLOYEE MONITORING V2
 * Admin Overview — Main Fleet Dashboard Page
 */

import React from 'react';
import { useMonitoringV2Context } from '../../context/MonitoringV2Context.jsx';
import MockDataService from '../../services/mockDataService.js';
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

  const stats = MockDataService.getSummaryStats();
  const liveTeam = MockDataService.getLiveTeam({ department: departmentFilter }).slice(0, 5);
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
          title="All Users"
          value={stats.allUsers}
          subtext="Total directory"
          icon={Users}
        />
        <MetricCard
          title="Active Users"
          value={stats.activeUsers}
          subtext="Employed staff"
          icon={UserCheck}
        />
        <MetricCard
          title="Exited Users"
          value={stats.exitedUsers}
          subtext="Separated/former"
          icon={UserX}
        />
        <MetricCard
          title="Connected Agents"
          value={stats.connectedAgents}
          subtext="Desktop v2.0.0"
          icon={Laptop}
        />
        <MetricCard
          title="Active Sessions"
          value={stats.activeSessions}
          subtext="Working now"
          icon={Activity}
          badge={<Badge variant="success">Live</Badge>}
        />
        <MetricCard
          title="Idle Sessions"
          value={stats.idleSessions}
          subtext=">5m inactivity"
          icon={Clock}
          badge={<Badge variant="warning">Idle</Badge>}
        />
        <MetricCard
          title="Offline Sessions"
          value={stats.offlineSessions}
          subtext="No heartbeat"
          icon={WifiOff}
          badge={<Badge variant="neutral">Offline</Badge>}
        />
      </div>

      {/* Charts Row: Hourly Trends & Category Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Daily Telemetry Cadence</CardTitle>
            <CardDescription>
              Hourly aggregate distribution of active focused hours vs idle time across active devices
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ActivityBarChart data={trends} height={190} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Application Categories</CardTitle>
            <CardDescription>
              Distribution of authorized process categories (non-invasive binary names)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CategoryDonut categories={categories} size={150} />
          </CardContent>
        </Card>
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
