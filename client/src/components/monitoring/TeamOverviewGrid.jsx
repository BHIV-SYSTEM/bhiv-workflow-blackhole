import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { dayScore, dayScoreStyle, dayZoneStyle, dayEfficiencyLabel } from '@/lib/dayProductivity';
import {
  Users,
  Activity,
  Clock,
  Keyboard,
  Mouse,
  TrendingUp,
  Monitor,
  Eye,
  CheckCircle2,
  AlertCircle,
  Clock3,
  Sparkles,
  ArrowUpRight,
  Info
} from 'lucide-react';

export function TeamOverviewGrid({
  employees = [],
  summary = {},
  loading = false,
  onSelectEmployee,
  searchQuery = '',
  onSearchChange,
  departmentFilter = 'all',
  onDepartmentChange,
  departments = []
}) {
  const teamDayScore = dayScore({
    dayProductivity: { score: summary.avgDayProductivity },
  });
  const teamDayStyle = dayZoneStyle(teamDayScore);

  const sortedEmployees = useMemo(() => {
    return [...employees].sort((a, b) => {
      const aExited = a.stillExist === 0 || a.currentStatus === 'Exited';
      const bExited = b.stillExist === 0 || b.currentStatus === 'Exited';
      if (aExited !== bExited) return aExited ? 1 : -1;

      const aStarted = (a.hasStartedDay || a.currentStatus === 'Active' || a.currentStatus === 'Idle' || a.activeSeconds > 0 || a.keystrokesToday > 0) ? 1 : 0;
      const bStarted = (b.hasStartedDay || b.currentStatus === 'Active' || b.currentStatus === 'Idle' || b.activeSeconds > 0 || b.keystrokesToday > 0) ? 1 : 0;
      if (aStarted !== bStarted) return bStarted - aStarted;

      return (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' });
    });
  }, [employees]);
  const getStatusBadge = (status) => {
    switch (status) {
      case 'Active':
        return (
          <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 flex items-center gap-1.5 px-2.5 py-1 font-semibold text-xs whitespace-nowrap flex-shrink-0">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            Active
          </Badge>
        );
      case 'Idle':
        return (
          <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30 flex items-center gap-1.5 px-2.5 py-1 font-semibold text-xs whitespace-nowrap flex-shrink-0">
            <span className="h-2 w-2 rounded-full bg-amber-500"></span>
            Idle
          </Badge>
        );
      case 'Exited':
        return (
          <Badge className="bg-rose-500/15 text-rose-400 border-rose-500/30 flex items-center gap-1.5 px-2.5 py-1 font-semibold text-xs whitespace-nowrap flex-shrink-0">
            <span className="h-2 w-2 rounded-full bg-rose-500"></span>
            Exited
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="text-zinc-400 border-zinc-700 bg-zinc-900/60 flex items-center gap-1.5 px-2.5 py-1 font-semibold text-xs whitespace-nowrap flex-shrink-0">
            <span className="h-2 w-2 rounded-full bg-zinc-500"></span>
            Away / Offline
          </Badge>
        );
    }
  };

  const getEfficiencyBadge = (emp) => {
    if (emp.stillExist === 0 || emp.currentStatus === 'Exited') {
      return (
        <Badge variant="outline" className="text-rose-400 border-rose-500/30 bg-rose-500/10 font-semibold text-[11px] px-2 py-0.5 shadow-sm">
          Account Exited
        </Badge>
      );
    }

    // If employee is Away or has 0 active seconds and 0 keystrokes today
    if (
      emp.productivityEfficiency === 'No Activity' ||
      emp.productivityEfficiency === 'No Logs Today' ||
      emp.productivityEfficiency === 'No Logs Recorded' ||
      ((!emp.activeSeconds || emp.activeSeconds === 0) && (!emp.keystrokesToday || emp.keystrokesToday === 0)) ||
      dayScore(emp) === 0
    ) {
      return (
        <Badge className="bg-zinc-800 text-zinc-300 border border-zinc-700 font-medium text-[11px] px-2 py-0.5 shadow-sm">
          ⏸️ No Logs Today
        </Badge>
      );
    }

    const label = dayEfficiencyLabel(dayScore(emp));
    if (label === 'High Efficiency') {
      return (
        <Badge className="bg-emerald-600 text-white font-bold text-[11px] px-2 py-0.5 shadow-sm border border-emerald-400/30">
          ⚡ High Efficiency
        </Badge>
      );
    } else if (label === 'Moderate Efficiency') {
      return (
        <Badge className="bg-amber-600 text-white font-bold text-[11px] px-2 py-0.5 shadow-sm border border-amber-400/30">
          ⚖️ Moderate Efficiency
        </Badge>
      );
    }
    return (
      <Badge className="bg-rose-600 text-white font-bold text-[11px] px-2 py-0.5 shadow-sm border border-rose-400/30">
        🔻 Low Efficiency
      </Badge>
    );
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="animate-pulse h-24 bg-zinc-900/40 border-zinc-800" />
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => (
            <Card key={i} className="animate-pulse h-64 bg-zinc-900/40 border-zinc-800" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Aggregated Summary Banner (No text selection artifacts) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 select-none">
        <Card className="border-l-4 border-l-emerald-500 bg-zinc-950/90 border-zinc-800 shadow-md">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Total Team</p>
              <h3 className="text-2xl font-extrabold text-white mt-1">{summary.totalEmployees || employees.length}</h3>
              <p className="text-xs text-zinc-400 mt-0.5">Monitored Accounts</p>
            </div>
            <div className="h-12 w-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shadow-inner">
              <Users className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-blue-500 bg-zinc-950/90 border-zinc-800 shadow-md">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Currently Active</p>
              <h3 className="text-2xl font-extrabold text-blue-400 mt-1">{summary.activeCount || 0}</h3>
              <p className="text-xs text-zinc-400 mt-0.5">Real-time Working</p>
            </div>
            <div className="h-12 w-12 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 shadow-inner">
              <Activity className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-amber-500 bg-zinc-950/90 border-zinc-800 shadow-md">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Idle / Away</p>
              <h3 className="text-2xl font-extrabold text-amber-400 mt-1">
                {(summary.idleCount || 0) + (summary.awayCount || 0)}
              </h3>
              <p className="text-xs text-zinc-400 mt-0.5">Inactive or On Break</p>
            </div>
            <div className="h-12 w-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shadow-inner">
              <Clock3 className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-purple-500 bg-zinc-950/90 border-zinc-800 shadow-md">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Team Avg Score</p>
              <h3 className={`text-2xl font-extrabold mt-1 ${teamDayStyle.text}`}>{teamDayScore}%</h3>
              <div className="flex items-center gap-1.5 mt-0.5 text-xs text-zinc-400">
                <span className={`h-2 w-2 rounded-full ${teamDayStyle.dot}`} />
                <span>{teamDayStyle.label}</span>
              </div>
            </div>
            <div className="h-12 w-12 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 shadow-inner">
              <TrendingUp className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Grid, Skeleton, or Empty State */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => (
            <Card key={i} className="border-zinc-800 bg-zinc-950/80 animate-pulse overflow-hidden">
              <div className="h-1.5 w-full bg-zinc-800" />
              <CardHeader className="pb-3 pt-4 px-5 border-b border-zinc-900">
                <div className="flex items-center gap-3">
                  <div className="h-11 w-11 rounded-full bg-zinc-800/80 flex-shrink-0" />
                  <div className="space-y-2 flex-1">
                    <div className="h-4 bg-zinc-800/80 rounded w-3/4" />
                    <div className="h-3 bg-zinc-800/50 rounded w-1/2" />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 px-5 pt-4 pb-4">
                <div className="h-14 bg-zinc-900/60 rounded-xl" />
                <div className="grid grid-cols-2 gap-2">
                  <div className="h-12 bg-zinc-900/40 rounded-lg" />
                  <div className="h-12 bg-zinc-900/40 rounded-lg" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : employees.length === 0 ? (
        <Card className="p-12 text-center border-dashed bg-zinc-950/80 border-zinc-800">
          <CardContent className="flex flex-col items-center justify-center space-y-3">
            <Users className="h-12 w-12 text-zinc-600" />
            <h3 className="font-bold text-lg text-white">No employees found</h3>
            <p className="text-sm text-zinc-400 max-w-sm">
              No matching employees found for the selected tab or search query.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {sortedEmployees.map((emp) => (
            <Card
              key={emp._id}
              className="group hover:shadow-2xl transition-all duration-300 border-zinc-800 hover:border-emerald-500/60 relative overflow-hidden bg-zinc-950/90 flex flex-col justify-between shadow-lg"
            >
              {/* Top Accent Line */}
              <div
                className={`h-1.5 w-full ${
                  emp.currentStatus === 'Active'
                    ? 'bg-emerald-500'
                    : emp.currentStatus === 'Idle'
                    ? 'bg-amber-500'
                    : emp.currentStatus === 'Exited'
                    ? 'bg-rose-500'
                    : 'bg-zinc-600'
                }`}
              />

              <div>
                {/* Header: Employee Name & Status (No clipping) */}
                <CardHeader className="pb-3 pt-4 px-5 border-b border-zinc-900">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="h-11 w-11 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center font-extrabold text-emerald-400 text-lg shadow-inner flex-shrink-0">
                        {emp.name ? emp.name.charAt(0).toUpperCase() : 'E'}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="font-extrabold text-base leading-tight text-white group-hover:text-emerald-400 transition-colors truncate">
                          {emp.name}
                        </h4>
                        <p className="text-xs text-zinc-400 truncate mt-0.5">{emp.email}</p>
                        <Badge variant="secondary" className="text-[10px] mt-1 font-semibold px-2 py-0.5 bg-zinc-900 text-zinc-300 border border-zinc-800">
                          {emp.department || 'General'}
                        </Badge>
                      </div>
                    </div>
                    {getStatusBadge(emp.currentStatus)}
                  </div>
                </CardHeader>

                <CardContent className="space-y-4 px-5 pt-4 pb-4 text-sm">
                  {/* Productivity Score Bar */}
                  <div className="space-y-2 bg-zinc-900/60 p-3 rounded-xl border border-zinc-800">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-zinc-300 flex items-center gap-1.5">
                        <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
                        Productivity Score
                      </span>
                      <span className={`font-extrabold text-sm flex items-center gap-1.5 ${dayScoreStyle(emp).text}`}>
                        {dayScore(emp)}%
                        <span className={`h-2 w-2 rounded-full ${dayScoreStyle(emp).dot}`} />
                        <span className="font-semibold text-[10px]">{dayScoreStyle(emp).label}</span>
                      </span>
                    </div>
                    <Progress value={dayScore(emp)} className={`h-2 bg-zinc-800 ${dayScoreStyle(emp).bar}`} />
                    <div className="flex items-center justify-between pt-1">
                      {getEfficiencyBadge(emp)}
                      <span className="text-[11px] text-zinc-400 font-medium">
                        Keystrokes: {emp.keystrokesToday ? emp.keystrokesToday.toLocaleString() : 0}
                      </span>
                    </div>
                  </div>

                  {/* Telemetry Metrics Grid */}
                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="bg-zinc-900/50 p-2.5 rounded-xl border border-zinc-800/80">
                      <p className="text-[11px] font-semibold text-zinc-400 flex items-center gap-1">
                        <Clock className="h-3 w-3 text-emerald-400" />
                        Active Hours
                      </p>
                      <p className="font-extrabold text-sm mt-0.5 text-white">{emp.activeHours || '0h 0m'}</p>
                    </div>

                    <div className="bg-zinc-900/50 p-2.5 rounded-xl border border-zinc-800/80">
                      <p className="text-[11px] font-semibold text-zinc-400 flex items-center gap-1">
                        <Clock3 className="h-3 w-3 text-amber-400" />
                        Idle Time
                      </p>
                      <p className="font-extrabold text-sm mt-0.5 text-white">{emp.idleTime || '0m'}</p>
                    </div>

                    <div className="bg-zinc-900/50 p-2.5 rounded-xl border border-zinc-800/80">
                      <p className="text-[11px] font-semibold text-zinc-400 flex items-center gap-1">
                        <Keyboard className="h-3 w-3 text-blue-400" />
                        Keystrokes Today
                      </p>
                      <p className="font-extrabold text-sm mt-0.5 text-white">
                        {emp.keystrokesToday ? emp.keystrokesToday.toLocaleString() : 0}
                      </p>
                    </div>

                    <div className="bg-zinc-900/50 p-2.5 rounded-xl border border-zinc-800/80">
                      <p className="text-[11px] font-semibold text-zinc-400 flex items-center gap-1">
                        <Mouse className="h-3 w-3 text-purple-400" />
                        Mouse Activity
                      </p>
                      <p className="font-extrabold text-sm mt-0.5 text-white">{emp.mouseActivity || 0}%</p>
                    </div>
                  </div>

                  {/* Current Activity Card */}
                  <div className="bg-zinc-900/80 p-3 rounded-xl border border-zinc-800">
                    <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Monitor className="h-3.5 w-3.5 text-emerald-400" />
                      Current Activity
                    </p>
                    <p className="font-bold text-sm text-white truncate mt-1">
                      {emp.currentActivity?.appName || (emp.stillExist === 1 ? 'Active Workspace' : 'System Exited')}
                    </p>
                    <p className="text-xs text-zinc-400 truncate mt-0.5">
                      {emp.currentActivity?.windowTitle || 'No active session log'}
                    </p>
                  </div>
                </CardContent>
              </div>

              {/* Card Footer Action Button */}
              <div className="px-5 py-3.5 bg-zinc-900/60 border-t border-zinc-900">
                <Button
                  onClick={() => onSelectEmployee(emp)}
                  className="w-full bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-black text-xs sm:text-sm flex items-center justify-center gap-2 h-11 rounded-xl shadow-lg shadow-emerald-950/40 border border-emerald-400 transition-all duration-200 cursor-pointer"
                >
                  <Eye className="h-4 w-4 stroke-[2.5]" />
                  View Detailed Activity
                  <ArrowUpRight className="h-4 w-4 stroke-[2.5]" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
