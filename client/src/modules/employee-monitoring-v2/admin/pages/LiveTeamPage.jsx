/**
 * NIYANTRAN EMPLOYEE MONITORING V2
 * Admin Overview — Live Team Activity Table Page
 */

import React, { useState, useEffect } from 'react';
import { useMonitoringV2Context } from '../../context/MonitoringV2Context.jsx';
import MockDataService from '../../services/mockDataService.js';
import monitoringV2Api from '../../services/monitoringV2Api.js';
import Card, { CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card.jsx';
import Table, { TableHeader, TableBody, TableRow, TableHead, TableCell } from '../../components/ui/Table.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import SearchInput from '../../components/ui/SearchInput.jsx';
import Tabs from '../../components/ui/Tabs.jsx';
import {
  Laptop,
  Smartphone,
  Eye,
  AlertTriangle,
  Radio,
  RefreshCw,
} from 'lucide-react';

const STATUS_OPTIONS = [
  { label: 'All Sessions', value: 'ALL' },
  { label: 'Active', value: 'ACTIVE' },
  { label: 'Idle', value: 'IDLE' },
  { label: 'V1 Conflict', value: 'V1_AGENT_CONFLICT' },
];

export const LiveTeamPage = () => {
  const { departmentFilter, searchQuery, setSearchQuery, setActiveTab } = useMonitoringV2Context();
  const [selectedStatus, setSelectedStatus] = useState('ALL');
  const [backendTeam, setBackendTeam] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchLiveTeam = async () => {
    setLoading(true);
    try {
      const res = await monitoringV2Api.getLiveTeam();
      if (res?.data?.team && res.data.team.length > 0) {
        const mapped = res.data.team.map((s) => ({
          id: s.sessionId || s.employeeId,
          name: s.employeeName,
          role: s.department || 'Software Engineer',
          department: s.department,
          avatar: (s.employeeName || 'U').split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase(),
          employmentStatus: 'ACTIVE',
          sessionStatus: s.state,
          activeDevice: {
            type: s.mode === 'PHONE' ? 'phone' : 'laptop',
            name: s.deviceId || (s.mode === 'PHONE' ? 'Mobile Phone' : 'Windows PC'),
          },
          currentCategory: s.primaryCategory || 'DEVELOPMENT',
          currentApplication: s.primaryCategory === 'DEVELOPMENT' ? 'VS Code' : 'Chrome',
          inputActivityPercent: s.focusScore || 70,
          lastHeartbeatSecondsAgo: Math.max(0, Math.round((Date.now() - new Date(s.lastTelemetryAt || s.startedAt).getTime()) / 1000)),
          isPilotUser: true,
        }));
        setBackendTeam(mapped);
      }
    } catch {
      // Backend live team fallback to mock
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLiveTeam();
    const interval = setInterval(fetchLiveTeam, 10000);
    return () => clearInterval(interval);
  }, []);

  const mockTeam = MockDataService.getLiveTeam({
    department: departmentFilter,
    search: searchQuery,
    sessionStatus: selectedStatus,
  });

  const rawTeam = backendTeam && backendTeam.length > 0 ? backendTeam : mockTeam;
  const team = rawTeam.filter((m) => {
    if (selectedStatus !== 'ALL' && m.sessionStatus !== selectedStatus) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        m.name?.toLowerCase().includes(q) ||
        m.role?.toLowerCase().includes(q) ||
        m.currentApplication?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-100 flex items-center gap-2">
            <span>Live Team Telemetry</span>
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Real-time activity telemetry across registered workstations & mobile PWA sessions
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
          <SearchInput
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search employee, role, or app..."
            className="w-full sm:w-64"
          />
          <Button
            variant="outline"
            size="sm"
            icon={RefreshCw}
            onClick={fetchLiveTeam}
            className={`text-xs ${loading ? 'animate-spin' : ''}`}
            title="Refresh Live Fleet"
          >
            Refresh
          </Button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <Tabs
          options={STATUS_OPTIONS}
          activeValue={selectedStatus}
          onChange={setSelectedStatus}
        />
        <div className="text-xs text-slate-400">
          Showing <span className="font-semibold text-slate-200">{team.length}</span> members in <span className="font-semibold text-indigo-400">{departmentFilter}</span>
        </div>
      </div>

      {/* Main Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow hover={false}>
                <TableHead>Employee & Role</TableHead>
                <TableHead>Employment</TableHead>
                <TableHead>Session State</TableHead>
                <TableHead>Active Device</TableHead>
                <TableHead>Focused Category</TableHead>
                <TableHead>Active Application</TableHead>
                <TableHead>Input Rate (60s)</TableHead>
                <TableHead>Last Heartbeat</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {team.length === 0 ? (
                <TableRow hover={false}>
                  <TableCell colSpan={9} className="text-center py-10 text-slate-500">
                    No team members matched the current filters.
                  </TableCell>
                </TableRow>
              ) : (
                team.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-indigo-600/20 text-indigo-300 font-bold text-xs flex items-center justify-center border border-indigo-500/30">
                          {member.avatar}
                        </div>
                        <div>
                          <div className="font-semibold text-slate-200 flex items-center gap-1.5">
                            <span>{member.name}</span>
                            {member.isPilotUser && (
                              <Badge variant="purple" className="text-[9px] py-0 px-1">
                                Pilot
                              </Badge>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-400">{member.role}</div>
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
                      {member.activeDevice ? (
                        <div className="flex items-center gap-1.5 text-xs text-slate-300">
                          {member.activeDevice.type === 'phone' ? (
                            <Smartphone className="w-3.5 h-3.5 text-sky-400" />
                          ) : (
                            <Laptop className="w-3.5 h-3.5 text-indigo-400" />
                          )}
                          <span>{member.activeDevice.name}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-500">—</span>
                      )}
                    </TableCell>

                    <TableCell>
                      <span className="font-mono text-xs text-indigo-300">
                        {member.currentCategory}
                      </span>
                    </TableCell>

                    <TableCell>
                      <span className="text-xs text-slate-300 font-medium">
                        {member.currentApplication || '—'}
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

                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={Eye}
                        onClick={() => setActiveTab('activity')}
                        className="text-slate-400 hover:text-slate-100"
                        title="View Detailed Activity"
                      >
                        Details
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default LiveTeamPage;
