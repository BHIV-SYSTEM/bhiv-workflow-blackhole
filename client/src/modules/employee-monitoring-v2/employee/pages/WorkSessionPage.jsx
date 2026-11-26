import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../../../context/auth-context';
import api from '../../../../lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../../components/ui/card';
import { Badge } from '../../../../components/ui/badge';
import { Button } from '../../../../components/ui/button';
import { Progress } from '../../../../components/ui/progress';
import AgentStatusCard from '../../../../components/attendance/AgentStatusCard';
import DeviceSwitchCard from '../../../../components/attendance/DeviceSwitchCard';
import {
  Activity,
  CalendarClock,
  CheckCircle2,
  Clock,
  Globe,
  Keyboard,
  Laptop,
  Lock,
  MousePointer,
  RefreshCw,
  Smartphone,
  Timer,
  TrendingUp,
} from 'lucide-react';

/**
 * Employee Work Session page.
 *
 * Employees see their OWN data only: agent connection, workday state,
 * device handover, and a personal day-in-review (keystrokes, mouse movement,
 * productivity, websites visited with times). The activity summary endpoint
 * is self-scoped server-side; other employees' data is never requested here —
 * team monitoring stays on the admin/manager /monitoring page.
 */

const fmtInt = (n) => Number(n || 0).toLocaleString();

const fmtDuration = (seconds) => {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
};

const fmtTime = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const productivityTone = (score) =>
  score >= 50 ? 'text-emerald-600 dark:text-emerald-400'
    : score >= 30 ? 'text-amber-600 dark:text-amber-400'
      : 'text-rose-600 dark:text-rose-400';

export const WorkSessionPage = () => {
  const { user } = useAuth();
  const userId = user?._id || user?.id;

  const [workday, setWorkday] = useState({
    dayStarted: false,
    dayEndedToday: false,
    startTime: null,
    activeDevice: null,
  });
  const [summary, setSummary] = useState(null);
  const [summaryError, setSummaryError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(new Date().toLocaleTimeString());

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/attendance/status');
      if (res) {
        setWorkday({
          dayStarted: Boolean(res.dayStarted),
          dayEndedToday: Boolean(res.dayEndedToday),
          startTime: res.startTime || null,
          activeDevice: res.activeDevice || null,
        });
      }
    } catch (e) {
      console.error('Could not load workday status:', e);
    }

    // Own day-in-review (self-scoped on the server: 403 for anyone else).
    if (userId) {
      try {
        const r = await api.get(`/agent/activity/summary/${userId}`);
        setSummary(r?.summary || null);
        setSummaryError(null);
      } catch (e) {
        console.error('Could not load activity summary:', e);
        setSummaryError(e?.message || 'Could not load your activity');
      }
    }

    setLastRefresh(new Date().toLocaleTimeString());
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    fetchData();
    const intervalId = setInterval(fetchData, 30000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') fetchData();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [fetchData]);

  const isWorkdayActive = workday.dayStarted && !workday.dayEndedToday;
  const workdayLabel = isWorkdayActive
    ? 'Active'
    : workday.dayEndedToday
      ? 'Ended'
      : 'Not started';

  const activeDeviceLabel = workday.activeDevice?.deviceType === 'Mobile'
    ? 'Mobile Phone'
    : workday.activeDevice?.deviceType === 'Desktop'
      ? 'Laptop / PC'
      : 'Not set';

  const hourly = summary?.hourly || [];
  const peakActivity = Math.max(
    1,
    ...hourly.map((h) => (h.keystrokes || 0) + (h.mouseEvents || 0))
  );
  const websiteVisits = summary?.websiteVisits || [];
  const recentLogs = summary?.recentLogs || [];
  const hasData = Boolean(summary && (summary.totalLogs > 0 || websiteVisits.length > 0));
  const productivityScore = Math.min(100, Math.max(0, Number(summary?.avgProductivityScore || 0)));

  return (
    <div className="space-y-6 pb-8">
      {/* Page Header */}
      <div className="rounded-2xl border border-border/60 bg-card/80 backdrop-blur-sm p-5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="h-11 w-11 rounded-xl bg-primary/15 text-primary border border-primary/30 flex items-center justify-center shrink-0">
            <Laptop className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Work Session</h1>
              <Badge
                variant="outline"
                className={
                  isWorkdayActive
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                    : workday.dayEndedToday
                      ? 'border-blue-500/40 bg-blue-500/10 text-blue-600 dark:text-blue-400'
                      : 'border-border/60 text-muted-foreground'
                }
              >
                {isWorkdayActive && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5 animate-pulse" />
                )}
                {workdayLabel}
              </Badge>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
              Manage your desktop agent, switch active devices, and review your workday activity.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 self-start sm:self-center shrink-0">
          <span className="text-xs text-muted-foreground font-mono hidden md:inline">
            Updated {lastRefresh}
          </span>
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading} className="h-9 px-3.5">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </Button>
        </div>
      </div>

      {/* Agent & Device Switch Row (equal height) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
        <AgentStatusCard className="h-full" />
        <DeviceSwitchCard userId={userId} className="h-full" />
      </div>

      {/* Full-width Today's Workday Overview */}
      <Card className="neo-card shadow-lg border-l-4 border-l-emerald-500">
        <CardHeader className="border-b bg-gradient-to-r from-emerald-500/5 to-transparent">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-500 shrink-0">
                <CalendarClock className="h-4 w-4" />
              </div>
              <div>
                <CardTitle className="text-base">Today&apos;s Workday</CardTitle>
                <CardDescription>
                  A laptop/PC workday requires the signed-in V1 agent; on mobile you can start without it.
                </CardDescription>
              </div>
            </div>
            <Badge
              variant="outline"
              className={
                isWorkdayActive
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 self-start sm:self-center'
                  : 'self-start sm:self-center'
              }
            >
              {isWorkdayActive && <CheckCircle2 className="h-3.5 w-3.5 mr-1" />}
              {workdayLabel}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="pt-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-xl border border-border/50 bg-muted/30 p-3.5 flex items-center justify-between gap-3">
              <div className="space-y-0.5">
                <p className="text-xs text-muted-foreground">Session status</p>
                <p className="text-sm font-semibold">{workdayLabel}</p>
              </div>
              <Activity className={`h-4 w-4 shrink-0 ${isWorkdayActive ? 'text-emerald-500' : 'text-muted-foreground'}`} />
            </div>

            <div className="rounded-xl border border-border/50 bg-muted/30 p-3.5 flex items-center justify-between gap-3">
              <div className="space-y-0.5 min-w-0">
                <p className="text-xs text-muted-foreground">Started at</p>
                <p className="text-sm font-semibold truncate tabular-nums">
                  {workday.startTime ? new Date(workday.startTime).toLocaleString() : 'Not started today'}
                </p>
              </div>
              <Timer className="h-4 w-4 text-muted-foreground shrink-0" />
            </div>

            <div className="rounded-xl border border-border/50 bg-muted/30 p-3.5 flex items-center justify-between gap-3">
              <div className="space-y-0.5">
                <p className="text-xs text-muted-foreground">Active device</p>
                <p className="text-sm font-semibold">{activeDeviceLabel}</p>
              </div>
              {workday.activeDevice?.deviceType === 'Mobile' ? (
                <Smartphone className="h-4 w-4 text-primary shrink-0" />
              ) : (
                <Laptop className="h-4 w-4 text-primary shrink-0" />
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Personal Day-in-Review Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-emerald-500/15 text-emerald-500 border border-emerald-500/30 flex items-center justify-center shrink-0">
            <TrendingUp className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold tracking-tight">Your Day in Review</h2>
            <p className="text-xs text-muted-foreground">
              Personal telemetry summary for today.
            </p>
          </div>
        </div>
        <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400 self-start sm:self-center">
          <Lock className="h-3 w-3 mr-1" />
          Private · Visible only to you
        </Badge>
      </div>

      {summaryError && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-600 dark:text-amber-400">
          {summaryError}
        </div>
      )}

      {!summary && !summaryError && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((slot) => (
            <Card key={slot} className="neo-card shadow-sm">
              <CardContent className="pt-5 space-y-2.5 animate-pulse">
                <div className="h-3 w-24 rounded bg-muted" />
                <div className="h-7 w-16 rounded bg-muted" />
                <div className="h-2.5 w-32 rounded bg-muted" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {summary && !hasData && (
        <Card className="neo-card shadow-lg">
          <CardContent className="py-10 text-center space-y-2 max-w-md mx-auto">
            <div className="h-11 w-11 rounded-2xl bg-muted/60 border border-border/60 flex items-center justify-center mx-auto">
              <Activity className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-semibold">No activity recorded yet today</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Start your workday with the desktop agent signed in — your keystrokes, mouse
              movement, productivity score, and visited sites will appear here automatically.
            </p>
          </CardContent>
        </Card>
      )}

      {hasData && (
        <div className="space-y-6">
          {/* Headline KPI metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="neo-card shadow-lg border-l-4 border-l-blue-500">
              <CardContent className="pt-5 space-y-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="font-medium">Keystrokes</span>
                  <div className="h-8 w-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-500">
                    <Keyboard className="h-4 w-4" />
                  </div>
                </div>
                <div className="text-2xl font-bold tabular-nums">{fmtInt(summary.totalKeystrokes)}</div>
                <p className="text-[11px] text-muted-foreground">{fmtInt(summary.totalLogs)} telemetry samples</p>
              </CardContent>
            </Card>

            <Card className="neo-card shadow-lg border-l-4 border-l-purple-500">
              <CardContent className="pt-5 space-y-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="font-medium">Mouse Movement</span>
                  <div className="h-8 w-8 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-500">
                    <MousePointer className="h-4 w-4" />
                  </div>
                </div>
                <div className="text-2xl font-bold tabular-nums">{fmtInt(summary.totalMouseEvents)}</div>
                <p className="text-[11px] text-muted-foreground">
                  Avg activity {summary.totalMouseActivity || 0}/100
                </p>
              </CardContent>
            </Card>

            <Card className="neo-card shadow-lg border-l-4 border-l-emerald-500">
              <CardContent className="pt-5 space-y-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="font-medium">Productivity</span>
                  <div className="h-8 w-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                    <TrendingUp className="h-4 w-4" />
                  </div>
                </div>
                <div className={`text-2xl font-bold tabular-nums ${productivityTone(productivityScore)}`}>
                  {productivityScore}%
                </div>
                <Progress value={productivityScore} className="h-1.5" />
                <p className="text-[11px] text-muted-foreground">{summary.productivityEfficiency || 'No Activity'}</p>
              </CardContent>
            </Card>

            <Card className="neo-card shadow-lg border-l-4 border-l-amber-500">
              <CardContent className="pt-5 space-y-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="font-medium">Active Time</span>
                  <div className="h-8 w-8 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-500">
                    <Clock className="h-4 w-4" />
                  </div>
                </div>
                <div className="text-2xl font-bold tabular-nums">{summary.activeHours || '0h 0m'}</div>
                <p className="text-[11px] text-muted-foreground">Idle {summary.idleTime || '0m'}</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
            {/* Hour-by-hour activity */}
            <Card className="neo-card shadow-lg flex flex-col">
              <CardHeader className="border-b">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Activity className="h-4 w-4 text-primary" /> Activity by Hour
                  </CardTitle>
                  <span className="text-[11px] text-muted-foreground">Productivity %</span>
                </div>
              </CardHeader>
              <CardContent className="pt-5 flex-1 flex flex-col justify-between">
                {hourly.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No hourly data yet.</p>
                ) : (
                  <div className="flex items-end gap-2 h-44 pt-4 border-b border-border/50 pb-2 overflow-x-auto">
                    {hourly.map((h) => {
                      const activity = (h.keystrokes || 0) + (h.mouseEvents || 0);
                      const heightPct = Math.max(6, Math.round((activity / peakActivity) * 100));
                      const tone = h.avgProductivity >= 50
                        ? 'bg-emerald-500 hover:bg-emerald-400'
                        : h.avgProductivity >= 30
                          ? 'bg-amber-500 hover:bg-amber-400'
                          : 'bg-rose-400 hover:bg-rose-300';
                      return (
                        <div
                          key={h.hour}
                          className="flex-1 min-w-[24px] flex flex-col items-center justify-end h-full gap-1.5 group"
                          title={`${h.label} — ${fmtInt(h.keystrokes)} keys, ${fmtInt(h.mouseEvents)} mouse, ${h.avgProductivity}% productive`}
                        >
                          <span className="text-[10px] font-mono text-muted-foreground tabular-nums">
                            {activity > 0 ? `${h.avgProductivity}%` : ''}
                          </span>
                          <div className={`w-full max-w-[32px] rounded-t-md transition-colors ${tone}`} style={{ height: `${heightPct}%` }} />
                          <span className="text-[10px] text-muted-foreground font-mono">{h.label}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-4 pt-3 text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> ≥50% productive</span>
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> 30–49%</span>
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-rose-400" /> &lt;30%</span>
                </div>
              </CardContent>
            </Card>

            {/* Websites & apps visited */}
            <Card className="neo-card shadow-lg flex flex-col">
              <CardHeader className="border-b">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Globe className="h-4 w-4 text-primary" /> Websites &amp; Apps You Visited
                  </CardTitle>
                  {websiteVisits.length > 0 && (
                    <Badge variant="outline" className="text-[11px] font-mono">
                      {websiteVisits.length}
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="pt-4 flex-1">
                {websiteVisits.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No website data yet today.</p>
                ) : (
                  <ul className="space-y-2 max-h-64 overflow-y-auto pr-1">
                    {websiteVisits.map((v, i) => (
                      <li
                        key={`${v.startedAt}-${i}`}
                        className="flex items-center justify-between gap-3 text-xs rounded-xl border border-border/50 bg-muted/25 px-3 py-2 hover:bg-muted/45 transition-colors"
                      >
                        <div className="min-w-0">
                          <p className="font-medium truncate">{v.label}</p>
                          {v.url && <p className="text-[11px] text-muted-foreground truncate">{v.url}</p>}
                        </div>
                        <div className="text-right shrink-0">
                          <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                            {fmtTime(v.startedAt)} – {fmtTime(v.endedAt)}
                          </span>
                          <span className="block text-[11px] font-semibold text-foreground/80 tabular-nums">
                            {fmtDuration(v.seconds)}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Recent activity feed */}
          <Card className="neo-card shadow-lg">
            <CardHeader className="border-b">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Clock className="h-4 w-4 text-primary" /> Recent Activity
                </CardTitle>
                {recentLogs.length > 0 && (
                  <Badge variant="outline" className="text-[11px] font-mono">
                    {recentLogs.length} entries
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              {recentLogs.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing recorded yet.</p>
              ) : (
                <ul className="divide-y divide-border/40">
                  {recentLogs.map((log, i) => (
                    <li
                      key={log._id || i}
                      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 py-2.5 text-xs first:pt-0 last:pb-0"
                    >
                      <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-muted/60 text-muted-foreground shrink-0 tabular-nums">
                        {fmtTime(log.timestamp)}
                      </span>
                      <span className="flex-1 min-w-0 truncate font-medium">
                        {log.active_application?.name || 'Workspace'}
                        {log.active_application?.title && (
                          <span className="text-muted-foreground font-normal"> — {log.active_application.title}</span>
                        )}
                      </span>
                      <span className="flex items-center gap-3 text-muted-foreground shrink-0 tabular-nums">
                        <span className="flex items-center gap-1"><Keyboard className="h-3 w-3" /> {fmtInt(log.keystroke_count)}</span>
                        <span className="flex items-center gap-1"><MousePointer className="h-3 w-3" /> {fmtInt(log.mouse_event_count)}</span>
                        {Number(log.productivity_score) > 0 && (
                          <Badge variant="outline" className={`text-[10px] font-mono ${productivityTone(log.productivity_score)}`}>
                            {log.productivity_score}%
                          </Badge>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default WorkSessionPage;
