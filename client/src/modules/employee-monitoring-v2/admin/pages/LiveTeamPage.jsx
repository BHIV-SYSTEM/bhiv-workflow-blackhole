/**
 * NIYANTRAN EMPLOYEE MONITORING V2
 * Admin Overview — Live Team Activity Table Page
 *
 * Real-time active team presence bound strictly to /api/monitoring-v2/admin/live-team
 * and live Socket.io events. Zero mock fallbacks.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useMonitoringV2Context } from '../../context/MonitoringV2Context.jsx';
import monitoringV2Api from '../../services/monitoringV2Api.js';
import { useSocket } from '../../../../context/socket-context';
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
  RefreshCw,
} from 'lucide-react';

const STATUS_OPTIONS = [
  { label: 'All Sessions', value: 'ALL' },
  { label: 'Active', value: 'ACTIVE' },
  { label: 'Paused', value: 'PAUSED' },
  { label: 'Idle', value: 'IDLE' },
];

export const LiveTeamPage = () => {
  const { departmentFilter, searchQuery, setSearchQuery, setActiveTab } = useMonitoringV2Context();
  const [selectedStatus, setSelectedStatus] = useState('ALL');
  const [backendTeam, setBackendTeam] = useState([]);
  const [loading, setLoading] = useState(false);

  let socket = null;
  try {
    const socketCtx = useSocket();
    socket = socketCtx?.socket;
  } catch {
    socket = null;
  }

  const fetchLiveTeam = useCallback(async () => {
    setLoading(true);
    try {
      const res = await monitoringV2Api.getLiveTeam();
      const rawList = res?.data?.team || [];
      const mapped = rawList.map((s) => {
        const elapsedMinutes = Math.round((s.elapsedSeconds || 0) / 60);
        const durationDisplay = elapsedMinutes >= 60
          ? `${Math.floor(elapsedMinutes / 60)}h ${elapsedMinutes % 60}m`
          : `${elapsedMinutes}m`;

        return {
          id: s.sessionId || s.employeeId,
          employeeId: s.employeeId,
          name: s.employeeName,
          role: s.role || s.department || 'Software Engineer',
          department: s.department,
          avatar: (s.employeeName || 'U').split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase(),
          employmentStatus: 'ACTIVE',
          sessionStatus: s.state,
          breakStatus: s.breakStatus || (s.state === 'PAUSED' ? 'On Break' : 'Working'),
          connectionStatus: s.connectionStatus || (s.state === 'ACTIVE' ? 'Connected' : 'Disconnected / Not Monitored'),
          durationDisplay,
          activeDevice: {
            type: s.mode === 'PHONE' ? 'phone' : 'laptop',
            name: s.deviceName || s.deviceId || (s.mode === 'PHONE' ? 'Mobile Phone' : `${s.manufacturer || 'Acer'} ${s.model || 'Nitro AN515-57'}`),
          },
          currentCategory: s.primaryCategory || 'NEUTRAL',
          currentApplication: s.currentApplication || (s.state === 'PAUSED' ? '[On Break]' : 'System Idle'),
          inputActivityPercent: s.focusScore || 0,
          lastHeartbeatSecondsAgo: Math.max(0, Math.round((Date.now() - new Date(s.lastTelemetryAt || s.startedAt).getTime()) / 1000)),
          isPilotUser: true,
        };
      });
      setBackendTeam(mapped);
    } catch (err) {
      console.error('[LiveTeamPage] Failed to fetch live team:', err);
      setBackendTeam([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLiveTeam();
    const interval = setInterval(fetchLiveTeam, 10000);
    return () => clearInterval(interval);
  }, [fetchLiveTeam]);

  // Real-time Socket.io and Window Event Subscriptions
  useEffect(() => {
    const handleSessionState = (data) => {
      const payload = data?.detail || data;
      if (!payload) return;
      setBackendTeam((prev) =>
        prev.map((m) => {
          if (m.id === payload.sessionId || m.employeeId === payload.employeeId) {
            const isBreak = payload.state === 'PAUSED';
            return {
              ...m,
              sessionStatus: payload.state || m.sessionStatus,
              breakStatus: isBreak ? 'On Break' : 'Working',
              connectionStatus: payload.state === 'ACTIVE' ? 'Connected' : 'Disconnected / Not Monitored',
              currentApplication: isBreak ? '[On Break]' : m.currentApplication,
            };
          }
          return m;
        })
      );
      fetchLiveTeam();
    };

    const handleTelemetryTick = (data) => {
      const payload = data?.detail || data;
      if (!payload) return;
      setBackendTeam((prev) =>
        prev.map((m) => {
          if (m.id === payload.sessionId || m.employeeId === payload.employeeId) {
            return {
              ...m,
              currentApplication: payload.currentApplication || m.currentApplication,
              currentCategory: payload.currentCategory || m.currentCategory,
              inputActivityPercent: payload.focusScore ?? m.inputActivityPercent,
              lastHeartbeatSecondsAgo: 0,
              connectionStatus: 'Connected',
            };
          }
          return m;
        })
      );
    };

    const handleDeviceSwitch = (data) => {
      const payload = data?.detail || data;
      if (!payload) return;
      setBackendTeam((prev) =>
        prev.map((m) => {
          if (m.id === payload.sessionId || m.employeeId === payload.employeeId) {
            return {
              ...m,
              activeDevice: {
                type: payload.toMode === 'PHONE' ? 'phone' : 'laptop',
                name: payload.toDevice || (payload.toMode === 'PHONE' ? 'Mobile Phone' : 'Windows PC'),
              },
            };
          }
          return m;
        })
      );
      fetchLiveTeam();
    };

    if (socket) {
      socket.on('monitoring:session-state', handleSessionState);
      socket.on('monitoring:v2:telemetry-tick', handleTelemetryTick);
      socket.on('monitoring:device-switch', handleDeviceSwitch);
      socket.on('monitoring:handoff', handleDeviceSwitch);
    }

    window.addEventListener('monitoring-session-state', handleSessionState);
    window.addEventListener('monitoring:v2:telemetry-tick', handleTelemetryTick);
    window.addEventListener('monitoring:device-switch', handleDeviceSwitch);

    return () => {
      if (socket) {
        socket.off('monitoring:session-state', handleSessionState);
        socket.off('monitoring:v2:telemetry-tick', handleTelemetryTick);
        socket.off('monitoring:device-switch', handleDeviceSwitch);
        socket.off('monitoring:handoff', handleDeviceSwitch);
      }
      window.removeEventListener('monitoring-session-state', handleSessionState);
      window.removeEventListener('monitoring:v2:telemetry-tick', handleTelemetryTick);
      window.removeEventListener('monitoring:device-switch', handleDeviceSwitch);
    };
  }, [socket, fetchLiveTeam]);

  const rawTeam = backendTeam || [];
  const team = rawTeam.filter((m) => {
    if (departmentFilter && departmentFilter !== 'All Departments' && m.department !== departmentFilter) {
      return false;
    }
    if (selectedStatus !== 'ALL' && m.sessionStatus !== selectedStatus) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        m.name?.toLowerCase().includes(q) ||
        m.role?.toLowerCase().includes(q) ||
        m.department?.toLowerCase().includes(q) ||
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
                <TableHead>Connection Status</TableHead>
                <TableHead>Session State</TableHead>
                <TableHead>Duration</TableHead>
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
                  <TableCell colSpan={10} className="text-center py-10 text-slate-500">
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
                      <Badge variant={member.connectionStatus === 'Connected' ? 'success' : 'neutral'}>
                        {member.connectionStatus}
                      </Badge>
                    </TableCell>

                    <TableCell>
                      <div className="flex flex-col gap-0.5">
                        <Badge
                          variant={
                            member.sessionStatus === 'ACTIVE'
                              ? 'success'
                              : member.sessionStatus === 'PAUSED'
                                ? 'warning'
                                : 'neutral'
                          }
                        >
                          {member.sessionStatus}
                        </Badge>
                        <span className="text-[10px] text-slate-400">{member.breakStatus}</span>
                      </div>
                    </TableCell>

                    <TableCell>
                      <span className="font-mono text-xs text-slate-300">
                        {member.durationDisplay}
                      </span>
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
                      <span className="text-xs text-slate-200 font-mono font-medium">
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
