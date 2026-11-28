import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { dayScore, dayScoreStyle, dayZoneStyle, dayEfficiencyLabel } from '@/lib/dayProductivity';
import {
  X,
  User,
  Activity,
  Clock,
  Keyboard,
  Mouse,
  TrendingUp,
  Monitor,
  Globe,
  Camera,
  AlertTriangle,
  Brain,
  Zap,
  Calendar,
  CheckCircle2,
  Clock3
} from 'lucide-react';
import axios from 'axios';
import { API_URL } from '@/lib/api';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

export function EmployeeDetailModal({ employee, onClose }) {
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);
  const [activityLogs, setActivityLogs] = useState([]);
  const [metrics, setMetrics] = useState({
    activeHours: employee?.totalActiveHours || employee?.activeHours || '0h 0m',
    idleTime: employee?.totalIdleTime || employee?.idleTime || '0m',
    keystrokes: employee?.keystrokes !== undefined ? employee.keystrokes : (employee?.keystrokesToday || 0),
    mouseActivity: employee?.mouseActivity || 0,
    productivityScore: employee?.productivityScore || 0,
    productivityEfficiency: employee?.productivityEfficiency || 'No Logs Today',
    currentActivity: employee?.currentActivity || { appName: 'Workspace', windowTitle: 'Active Session' }
  });
  const [timelineData, setTimelineData] = useState([]);
  const [dayProductivity, setDayProductivity] = useState(employee?.dayProductivity || null);

  useEffect(() => {
    if (employee) {
      fetchEmployeeDetails();
    }
  }, [employee]);

  // Live update: keep keystroke/metrics fresh while the modal stays
  // open — silent so the loading state doesn't flash every 30s.
  useEffect(() => {
    if (!employee) return undefined;
    const timer = setInterval(() => fetchEmployeeDetails(true), 30000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employee]);

  const fetchEmployeeDetails = async (silent = false) => {
    if (!employee?._id && !employee?.employeeId) return;
    const empId = employee._id || employee.employeeId;
    if (!silent) setLoading(true);
    try {
      const token = localStorage.getItem('WorkflowToken') || localStorage.getItem('token');
      
      // Target date for activity telemetry (defaults to today's IST calendar date)
      const istNow = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
      const istTodayStr = istNow.toISOString().slice(0, 10);
      const targetDate = employee.selectedDate || employee.date || istTodayStr;

      const response = await axios.get(
        `${API_URL}/monitoring/employees/${empId}/activity?date=${targetDate}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          timeout: 45000
        }
      );
      setFetchError(null);

      const logs = response.data.activities || [];
      const backendSummary = response.data.summary || null;
      setActivityLogs(logs);
      setDayProductivity(backendSummary?.dayProductivity || null);

      // The endpoint already returns only the selected IST day, so use the logs
      // as returned instead of re-filtering them with the browser's timezone.
      const dayLogs = logs;

      // Process logs for timeline & fallback metrics
      let totalKeystrokes = 0;
      let totalMouseScore = 0;
      let activeMouseCount = 0;
      let totalIdleSec = 0;
      let totalProdScore = 0;
      let totalSpanSec = 0;
      const hourlyMap = {};

      dayLogs.forEach((log) => {
        const intervalSec = Math.min(60, Math.max(1, Number(log.interval_seconds) || 30));
        totalSpanSec += intervalSec;
        const keys = Number(log.keystroke_count || 0);
        const mouseScore = Number(log.mouse_activity_score || 0);
        totalKeystrokes += keys;
        if (mouseScore > 0) {
          totalMouseScore += mouseScore;
          activeMouseCount++;
        }
        const isLogActive = keys > 0 || mouseScore >= 10 || Number(log.mouse_event_count || 0) >= 3;
        let idleVal = 0;
        if (!isLogActive) {
          let raw = Number(log.idle_duration || 0);
          if (raw > 10000) raw = Math.round(raw / 1000);
          idleVal = Math.min(intervalSec, Math.max(0, raw));
        }
        totalIdleSec += idleVal;
        totalProdScore += Number(log.productivity_score || 0);

        const hour = new Date(log.timestamp).getHours();
        const hourLabel = `${hour}:00`;
        if (!hourlyMap[hourLabel]) {
          hourlyMap[hourLabel] = { hour: hourLabel, keystrokes: 0, productivity: 0, count: 0 };
        }
        hourlyMap[hourLabel].keystrokes += keys;
        hourlyMap[hourLabel].productivity += Number(log.productivity_score || 0);
        hourlyMap[hourLabel].count++;
      });

      // Plot the canonical red/yellow/green day score so the chart ends on the
      // exact same percentage as the KPI card. Legacy per-sample averages are
      // kept only as a fallback for payloads that predate the day score.
      const backendHourly = backendSummary?.dayProductivity?.hourly;
      const processedTimeline = Array.isArray(backendHourly) && backendHourly.length > 0
        ? backendHourly.map((h) => ({
            hour: `${h.hour}:00`,
            keystrokes: hourlyMap[`${h.hour}:00`]?.keystrokes || 0,
            productivity: h.score
          }))
        : Object.values(hourlyMap).map((h) => ({
            hour: h.hour,
            keystrokes: h.keystrokes,
            productivity: Math.round(h.productivity / (h.count || 1))
          }));
      setTimelineData(processedTimeline);

      const logCount = dayLogs.length;
      const hasEmployeeSession = (employee?.activeSeconds || 0) > 0;
      let calculatedActiveSec = Math.max(0, totalSpanSec - totalIdleSec);
      if (hasEmployeeSession) {
        calculatedActiveSec = employee.activeSeconds;
      }
      const avgProd = logCount > 0
        ? Math.round(totalProdScore / logCount)
        : (hasEmployeeSession ? (employee?.productivityScore || 50) : 0);
      const avgMouse = activeMouseCount > 0 ? Math.round(totalMouseScore / activeMouseCount) : 0;

      const calculatedActiveHours = (hasEmployeeSession && employee?.totalActiveHours)
        ? employee.totalActiveHours
        : `${Math.floor(calculatedActiveSec / 3600)}h ${Math.floor((calculatedActiveSec % 3600) / 60)}m`;
      const calculatedIdleTime = `${Math.floor(totalIdleSec / 60)}m`;

      const summaryActiveSec = backendSummary?.activeSeconds ?? calculatedActiveSec;
      const summaryIdleSec = backendSummary?.totalIdleSeconds ?? totalIdleSec;
      const finalActiveHours =
        backendSummary?.activeHours ??
        (backendSummary
          ? `${Math.floor(summaryActiveSec / 3600)}h ${Math.floor((summaryActiveSec % 3600) / 60)}m`
          : ((logCount > 0 || hasEmployeeSession) ? calculatedActiveHours : '0h 0m'));
      const finalIdleTime =
        backendSummary?.idleTime ??
        (backendSummary
          ? `${Math.floor(summaryIdleSec / 60)}m`
          : (logCount > 0 ? calculatedIdleTime : '0m'));
      const finalKeystrokes = Number(
        backendSummary?.totalKeystrokes ?? (logCount > 0 ? totalKeystrokes : 0)
      );
      const finalMouse = Number(
        backendSummary?.mouseActivity ?? backendSummary?.avgMouseActivity ?? (logCount > 0 ? avgMouse : 0)
      );
      const canonicalScoreSource = backendSummary
        ? backendSummary
        : (employee?.dayProductivity ? employee : null);
      const finalProd = canonicalScoreSource ? dayScore(canonicalScoreSource) : avgProd;
      let finalEfficiency = 'No Telemetry Today';
      if (employee.stillExist === 0) finalEfficiency = 'Exited';
      else if (canonicalScoreSource) finalEfficiency = dayEfficiencyLabel(finalProd);

      const latest = dayLogs[0];
      const lastActiveDate = response.data.lastActiveTimestamp
        ? new Date(response.data.lastActiveTimestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
        : (latest?.timestamp ? new Date(latest.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : (employee.lastActiveTimestamp ? new Date(employee.lastActiveTimestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : null));

      let currentActivity = {
        appName: employee.stillExist === 0 ? 'Account Inactive (Exited)' : 'No Active Session',
        windowTitle: employee.stillExist === 0 ? 'Exited' : 'Away / Offline',
        url: ''
      };
      if (logCount > 0 && latest?.active_application) {
        currentActivity = {
          appName: latest.active_application.name || 'Desktop Workspace',
          windowTitle: latest.active_application.title || 'Session active',
          url: latest.active_application.url || ''
        };
      }

      setMetrics({
        activeHours: finalActiveHours,
        idleTime: finalIdleTime,
        keystrokes: finalKeystrokes,
        mouseActivity: finalMouse,
        productivityScore: finalProd,
        productivityEfficiency: finalEfficiency,
        lastActiveDate,
        currentActivity
      });
    } catch (error) {
      console.error('Error fetching employee detailed monitoring:', error);
      setFetchError(
        error.response?.data?.error
        || 'Could not load employee details. Please try again.'
      );
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const getEfficiencyBadge = (eff) => {
    if (eff === 'High Efficiency') return <Badge className="bg-emerald-600 text-white font-bold text-[10px]">⚡ High Efficiency</Badge>;
    if (eff === 'Moderate Efficiency') return <Badge className="bg-amber-600 text-white font-bold text-[10px]">⚖️ Moderate Efficiency</Badge>;
    if (eff === 'Low Efficiency') return <Badge className="bg-rose-600 text-white font-bold text-[10px]">🔻 Low Efficiency</Badge>;
    if (eff === 'Exited') return <Badge variant="outline" className="text-rose-400 border-rose-500/30 bg-rose-500/10 font-bold text-[10px]">Exited</Badge>;
    if (eff === 'No Activity') return <Badge className="bg-zinc-800 text-zinc-300 border border-zinc-700 font-semibold text-[10px]">⏸️ No Activity</Badge>;
    return <Badge className="bg-zinc-800 text-zinc-300 border border-zinc-700 font-semibold text-[10px]">⏸️ No Telemetry Today</Badge>;
  };

  if (!employee) return null;

  const dayScoreSource = dayProductivity ? { dayProductivity } : null;
  const currentDayScore = dayScore(dayScoreSource);
  const currentDayStyle = dayScoreStyle(dayScoreSource);

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden text-white">
        {/* Header */}
        <div className="p-5 bg-zinc-900/90 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="h-13 w-13 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center font-extrabold text-emerald-400 text-xl shadow-inner">
              {employee.name ? employee.name.charAt(0).toUpperCase() : 'E'}
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-2xl font-extrabold tracking-tight text-white">{employee.name}</h2>
                <Badge
                  className={
                    employee.currentStatus === 'Active'
                      ? 'bg-emerald-600 text-white'
                      : employee.currentStatus === 'Idle'
                      ? 'bg-amber-600 text-white'
                      : 'bg-zinc-700 text-zinc-300'
                  }
                >
                  {employee.currentStatus || 'Active'}
                </Badge>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">
                {employee.email} • {employee.department || 'General'}
                {metrics.lastActiveDate ? ` • Last Active: ${metrics.lastActiveDate}` : ''}
              </p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full text-zinc-400 hover:text-white hover:bg-zinc-800">
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Content Area */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {loading && (
            <div className="p-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 text-sm animate-pulse">
              Loading employee details...
            </div>
          )}

          {fetchError && (
            <div className="p-3 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-300 text-sm flex items-center justify-between gap-3">
              <span>{fetchError}</span>
              <Button variant="outline" size="sm" onClick={() => fetchEmployeeDetails()}>
                Retry
              </Button>
            </div>
          )}

          {/* Real-time Current Activity Highlight Card */}
          <Card className="border-l-4 border-l-emerald-500 bg-zinc-900/80 border-zinc-800 shadow-sm">
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
                <Monitor className="h-4 w-4 text-emerald-400 animate-pulse" />
                Current Active Application
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-4">
              <div>
                <p className="text-xs text-zinc-400">Application Name</p>
                <p className="font-bold text-lg text-white mt-0.5">{metrics.currentActivity.appName}</p>
              </div>
            </CardContent>
          </Card>

          {/* Key Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <Card className="p-3 bg-zinc-900/60 border-zinc-800">
              <p className="text-[11px] font-semibold text-zinc-400 flex items-center gap-1">
                <Clock className="h-3 w-3 text-emerald-400" /> Active Time
              </p>
              <p className="font-extrabold text-base mt-1 text-white">{metrics.activeHours}</p>
            </Card>

            <Card className="p-3 bg-zinc-900/60 border-zinc-800">
              <p className="text-[11px] font-semibold text-zinc-400 flex items-center gap-1">
                <Clock3 className="h-3 w-3 text-amber-400" /> Idle Time
              </p>
              <p className="font-extrabold text-base mt-1 text-white">{metrics.idleTime}</p>
            </Card>

            <Card className="p-3 bg-zinc-900/60 border-zinc-800">
              <p className="text-[11px] font-semibold text-zinc-400 flex items-center gap-1">
                <Mouse className="h-3 w-3 text-purple-400" /> Mouse Score
              </p>
              <p className="font-extrabold text-base mt-1 text-white">{metrics.mouseActivity}%</p>
            </Card>

            <Card className="p-3 bg-zinc-900/60 border-zinc-800">
              <p className="text-[11px] font-semibold text-zinc-400 flex items-center gap-1">
                <TrendingUp className={`h-3 w-3 ${currentDayStyle.text}`} /> Productivity
              </p>
              <p className={`font-extrabold text-base mt-1 flex items-center gap-1.5 ${currentDayStyle.text}`}>
                {currentDayScore}%
                <span className={`h-2 w-2 rounded-full ${currentDayStyle.dot}`} />
                <span className="text-[10px] font-semibold">{currentDayStyle.label}</span>
              </p>
            </Card>

            <Card className="p-3 bg-zinc-900/60 border-zinc-800">
              <p className="text-[11px] font-semibold text-zinc-400 flex items-center gap-1">
                <Zap className={`h-3 w-3 ${currentDayStyle.text}`} /> Efficiency
              </p>
              <div className="mt-1">
                {getEfficiencyBadge(
                  employee.stillExist === 0
                    ? 'Exited'
                    : (currentDayScore > 0 ? dayEfficiencyLabel(currentDayScore) : 'No Activity')
                )}
              </div>
            </Card>
          </div>

          {/* Productivity Gauge */}
          <Card className="bg-zinc-900/80 border-zinc-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold text-white">Overall Productivity Efficiency Rating</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-center justify-between text-xs sm:text-sm">
                <span className="font-semibold text-zinc-300">
                  Productivity Status: <span className={`font-bold ${currentDayStyle.text}`}>{currentDayStyle.label}</span>
                </span>
                <span className={`font-extrabold ${currentDayStyle.text}`}>{currentDayScore}%</span>
              </div>
              <Progress value={currentDayScore} className={`h-3 bg-zinc-800 ${currentDayStyle.bar}`} />
            </CardContent>
          </Card>

          {/* Activity Timeline Chart & Logs */}
          <Tabs defaultValue="timeline" className="w-full">
            <TabsList className="grid grid-cols-2 w-full max-w-xs bg-zinc-900 border border-zinc-800 p-1 rounded-xl">
              <TabsTrigger value="timeline" className="text-xs font-bold data-[state=active]:bg-emerald-600 data-[state=active]:text-white">
                Activity Timeline
              </TabsTrigger>
              <TabsTrigger value="logs" className="text-xs font-bold data-[state=active]:bg-emerald-600 data-[state=active]:text-white">
                Timestamped Logs ({activityLogs.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="timeline" className="mt-3">
              <Card className="bg-zinc-900/80 border-zinc-800">
                <CardHeader>
                  <CardTitle className="text-sm font-bold text-white">Hourly Activity & Productivity Trend</CardTitle>
                </CardHeader>
                <CardContent className="h-60">
                  {timelineData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={timelineData}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.2} stroke="#333" />
                        <XAxis dataKey="hour" stroke="#888888" fontSize={12} />
                        <YAxis stroke="#888888" fontSize={12} />
                        <Tooltip contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', color: '#fff' }} />
                        <Line type="monotone" dataKey="productivity" name="Productivity %" stroke="#10b981" strokeWidth={2.5} />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-zinc-400 text-xs sm:text-sm">
                      No desktop agent activity logs recorded for today yet.
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="logs" className="mt-3">
              <Card className="bg-zinc-900/80 border-zinc-800">
                <CardHeader>
                  <CardTitle className="text-sm font-bold text-white">Recent Activity Log History</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
                    {activityLogs.length > 0 ? (
                      activityLogs.slice(0, 15).map((log, i) => {
                        const hourKey = `${new Date(log.timestamp).getHours()}:00`;
                        const hourStyle = dayZoneStyle(
                          timelineData.find((h) => h.hour === hourKey)?.productivity ?? currentDayScore
                        );
                        return (
                        <div key={i} className="flex items-center justify-between p-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs">
                          <div>
                            <p className="font-bold text-white">{log.active_application?.name || 'Workspace'}</p>
                            <p className="text-zinc-400 truncate max-w-xs sm:max-w-md">{log.app_category || 'Work Activity'}</p>
                          </div>
                          <div className="text-right">
                            <span className={`font-bold ${hourStyle.text}`}>{hourStyle.label}</span>
                            <p className="text-[10px] text-zinc-500">{new Date(log.timestamp).toLocaleTimeString()}</p>
                          </div>
                        </div>
                        );
                      })
                    ) : (
                      <p className="text-xs text-zinc-400 text-center py-6">No recent desktop activity logs recorded today.</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        {/* Footer */}
        <div className="p-4 bg-zinc-900/90 border-t border-zinc-800 flex justify-end">
          <Button
            onClick={onClose}
            className="bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-black text-xs sm:text-sm px-6 h-10 rounded-xl shadow-lg border border-emerald-400 cursor-pointer"
          >
            Close Detailed View
          </Button>
        </div>
      </div>
    </div>
  );
}
