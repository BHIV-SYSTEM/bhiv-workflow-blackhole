import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import {
  Calendar as CalendarIcon,
  Clock,
  Clock3,
  Keyboard,
  Mouse,
  TrendingUp,
  Zap,
  Users,
  Eye,
  Search,
  Filter,
  ArrowUpRight,
  Monitor
} from 'lucide-react';
import axios from 'axios';
import { API_URL } from '@/lib/api';

export function DailyMonitoringView({ onSelectEmployee, departmentFilter = 'all', statusTab = 'active', searchQuery: initialSearch = '' }) {
  const [selectedDate, setSelectedDate] = useState(() => {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  });

  const [loading, setLoading] = useState(true);
  const [dailyData, setDailyData] = useState({
    teamMetrics: {
      totalActiveHours: '0h 0m',
      totalIdleTime: '0m',
      avgProductivityScore: 0,
      totalKeystrokes: 0,
      overallProductivityEfficiency: 'No Activity'
    },
    employees: []
  });
  const [searchQuery, setSearchQuery] = useState(initialSearch);

  useEffect(() => {
    if (initialSearch !== undefined) {
      setSearchQuery(initialSearch);
    }
  }, [initialSearch]);

  useEffect(() => {
    fetchDailySummary();
  }, [selectedDate, departmentFilter, statusTab]);

  const fetchDailySummary = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('WorkflowToken') || localStorage.getItem('token');
      const response = await axios.get(
        `${API_URL}/monitoring/daily-summary?date=${selectedDate}&department=${departmentFilter}&statusTab=${statusTab}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (response.data.success) {
        setDailyData({
          teamMetrics: response.data.teamMetrics || {},
          employees: response.data.employees || []
        });
      }
    } catch (error) {
      console.error('Error fetching daily summary:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredEmployees = React.useMemo(() => {
    const list = dailyData.employees.filter((emp) => {
      if (statusTab === 'active' && emp.stillExist === 0) return false;
      if (statusTab === 'exited' && emp.stillExist === 1) return false;
      return (
        emp.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        emp.email.toLowerCase().includes(searchQuery.toLowerCase())
      );
    });

    return list.sort((a, b) => {
      const aExited = a.stillExist === 0;
      const bExited = b.stillExist === 0;
      if (aExited !== bExited) return aExited ? 1 : -1;

      const aStarted = (a.hasStartedDay || a.activeSeconds > 0 || (a.totalActiveHours && a.totalActiveHours !== '0h 0m')) ? 1 : 0;
      const bStarted = (b.hasStartedDay || b.activeSeconds > 0 || (b.totalActiveHours && b.totalActiveHours !== '0h 0m')) ? 1 : 0;
      if (aStarted !== bStarted) return bStarted - aStarted;

      return (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' });
    });
  }, [dailyData.employees, statusTab, searchQuery]);

  const getEfficiencyBadge = (efficiency, emp = null) => {
    if (emp && emp.stillExist === 0) {
      return <Badge variant="outline" className="text-rose-400 border-rose-500/30 bg-rose-500/10 font-semibold text-[11px]">Exited</Badge>;
    }
    if (
      efficiency === 'No Activity' ||
      efficiency === 'No Logs Today' ||
      efficiency === 'No Logs Recorded' ||
      (emp && (!emp.productivityScore || emp.productivityScore === 0) && (!emp.keystrokes || emp.keystrokes === 0))
    ) {
      return <Badge variant="outline" className="text-zinc-400 border-zinc-700 bg-zinc-900/60 font-semibold text-[11px]">💤 No Activity</Badge>;
    }
    if (efficiency === 'High Efficiency') {
      return <Badge className="bg-emerald-500 text-white font-semibold text-[11px]">⚡ High Efficiency</Badge>;
    } else if (efficiency === 'Moderate Efficiency') {
      return <Badge className="bg-amber-500 text-white font-semibold text-[11px]">⚖️ Moderate Efficiency</Badge>;
    }
    return <Badge className="bg-rose-500 text-white font-semibold text-[11px]">🔻 Low Efficiency</Badge>;
  };

  const formatDateDisplay = (dateStr) => {
    try {
      const parts = String(dateStr || '').split('-').map(Number);
      const parsed = parts.length === 3 && !parts.some(Number.isNaN)
        ? new Date(parts[0], parts[1] - 1, parts[2])
        : new Date(dateStr);
      const options = { year: 'numeric', month: 'long', day: 'numeric' };
      return parsed.toLocaleDateString(undefined, options);
    } catch (e) {
      return dateStr;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Date Picker Bar */}
      <Card className="border-l-4 border-l-primary bg-card shadow-sm">
        <CardContent className="p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
              <CalendarIcon className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-xl font-bold">Daily Activity Report</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Viewing activity breakdown for <span className="font-semibold text-foreground">{formatDateDisplay(selectedDate)}</span>
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
            {/* Date Selector Input */}
            <div className="flex items-center gap-2 bg-muted/50 p-1.5 rounded-xl border border-border">
              <label className="text-xs font-semibold text-muted-foreground px-2">Select Date:</label>
              <Input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-auto h-9 text-xs bg-background"
              />
            </div>

            {/* Search Input */}
            <div className="relative flex-1 md:w-64">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search employee..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9 text-xs"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Team Daily Overview KPI Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card className="p-4 bg-gradient-to-br from-emerald-500/5 to-background border-emerald-500/20">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Active Hours</p>
          <h3 className="text-2xl font-bold mt-1 text-emerald-600 dark:text-emerald-400">
            {dailyData.teamMetrics.totalActiveHours || '0h 0m'}
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">Aggregated Working</p>
        </Card>

        <Card className="p-4 bg-gradient-to-br from-amber-500/5 to-background border-amber-500/20">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Idle Time</p>
          <h3 className="text-2xl font-bold mt-1 text-amber-600 dark:text-amber-400">
            {dailyData.teamMetrics.totalIdleTime || '0m'}
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">Aggregated Idle</p>
        </Card>

        <Card className="p-4 bg-gradient-to-br from-blue-500/5 to-background border-blue-500/20">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Avg Productivity</p>
          <h3 className="text-2xl font-bold mt-1 text-blue-600 dark:text-blue-400">
            {dailyData.teamMetrics.avgProductivityScore || 0}%
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">Team Score Average</p>
        </Card>

        <Card className="p-4 bg-gradient-to-br from-purple-500/5 to-background border-purple-500/20">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Keystrokes</p>
          <h3 className="text-2xl font-bold mt-1 text-purple-600 dark:text-purple-400">
            {dailyData.teamMetrics.totalKeystrokes ? dailyData.teamMetrics.totalKeystrokes.toLocaleString() : 0}
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">Daily Keystrokes</p>
        </Card>

        <Card className="p-4 bg-gradient-to-br from-primary/5 to-background border-primary/20">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Daily Efficiency</p>
          <div className="mt-1">
            {getEfficiencyBadge(dailyData.teamMetrics.overallProductivityEfficiency)}
          </div>
          <p className="text-xs text-muted-foreground mt-1">Overall Team Index</p>
        </Card>
      </div>

      {/* Employee Daily Details Table */}
      <Card className="border-border">
        <CardHeader className="pb-3 border-b border-border">
          <CardTitle className="text-base font-bold flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            Employee Performance for {formatDateDisplay(selectedDate)}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground animate-pulse">Loading daily summary data...</div>
          ) : filteredEmployees.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">No employee activity recorded for this date.</div>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/50 text-xs font-semibold uppercase text-muted-foreground border-b border-border">
                <tr>
                  <th className="p-4">Employee</th>
                  <th className="p-4">Active Hours</th>
                  <th className="p-4">Idle Time</th>
                  <th className="p-4">Productivity</th>
                  <th className="p-4">Keystrokes</th>
                  <th className="p-4">Mouse Score</th>
                  <th className="p-4">Activity Details (Top Apps)</th>
                  <th className="p-4">Efficiency</th>
                  <th className="p-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredEmployees.map((emp) => (
                  <tr key={emp.employeeId} className="hover:bg-muted/30 transition-colors">
                    <td className="p-4 font-medium">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-foreground">{emp.name}</p>
                          {emp.stillExist === 0 && (
                            <Badge variant="outline" className="text-[10px] text-rose-400 border-rose-500/30 bg-rose-500/10 px-1.5 py-0">
                              Exited
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">{emp.email}</p>
                      </div>
                    </td>
                    <td className="p-4 font-semibold text-emerald-600 dark:text-emerald-400">{emp.totalActiveHours}</td>
                    <td className="p-4 font-semibold text-amber-600 dark:text-amber-400">{emp.totalIdleTime}</td>
                    <td className="p-4 font-bold">
                      <div className="flex items-center gap-2">
                        <span className="w-8">{emp.productivityScore}%</span>
                        <Progress value={emp.productivityScore} className="h-1.5 w-16" />
                      </div>
                    </td>
                    <td className="p-4">{emp.keystrokes ? emp.keystrokes.toLocaleString() : 0}</td>
                    <td className="p-4">{emp.mouseActivity}%</td>
                    <td className="p-4">
                      <div className="flex flex-wrap gap-1">
                        {emp.activityDetails && emp.activityDetails.length > 0 ? (
                          emp.activityDetails.map((app, idx) => (
                            <Badge key={idx} variant="outline" className="text-[10px] font-normal">
                              {app.name}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-xs text-muted-foreground">Away / No Logs</span>
                        )}
                      </div>
                    </td>
                    <td className="p-4">{getEfficiencyBadge(emp.productivityEfficiency, emp)}</td>
                    <td className="p-4 text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onSelectEmployee({ ...emp, selectedDate })}
                        className="text-xs font-semibold text-primary hover:bg-primary/10"
                      >
                        <Eye className="h-3.5 w-3.5 mr-1" />
                        Details
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
