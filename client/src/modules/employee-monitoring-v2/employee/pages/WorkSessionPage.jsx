import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../../../context/auth-context';
import api from '../../../../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '../../../../components/ui/card';
import { Badge } from '../../../../components/ui/badge';
import { Button } from '../../../../components/ui/button';
import AgentStatusCard from '../../../../components/attendance/AgentStatusCard';
import DeviceSwitchCard from '../../../../components/attendance/DeviceSwitchCard';
import {
  Activity,
  Clock,
  Globe,
  Keyboard,
  Laptop,
  MousePointer,
  RefreshCw,
  Smartphone,
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

  const workdayLabel = workday.dayStarted && !workday.dayEndedToday
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-border/60">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-primary/10 text-primary border border-primary/20">
            <Laptop className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Work Session</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Your agent, today&apos;s handover, and your personal activity review.
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh <span className="text-[10px] text-muted-foreground font-mono ml-1">({lastRefresh})</span>
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-6">
          <AgentStatusCard />

          <Card className="neo-card shadow-lg">
            <CardHeader className="border-b">
              <CardTitle className="text-base">Today&apos;s Workday</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-5">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-muted-foreground">Status</span>
                <Badge variant={workday.dayStarted && !workday.dayEndedToday ? 'default' : 'outline'}>
                  {workdayLabel}
                </Badge>
              </div>
              {workday.startTime && (
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-muted-foreground">Started at</span>
                  <span>{new Date(workday.startTime).toLocaleString()}</span>
                </div>
              )}
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-muted-foreground">Active device</span>
                <span className="flex items-center gap-1.5">
                  {workday.activeDevice?.deviceType === 'Mobile'
                    ? <Smartphone className="h-3.5 w-3.5 text-muted-foreground" />
                    : <Laptop className="h-3.5 w-3.5 text-muted-foreground" />}
                  {activeDeviceLabel}
                </span>
              </div>
              <p className="text-xs text-muted-foreground pt-1">
                A laptop/PC workday requires the signed-in V1 agent. You can start your day on a phone without it.
              </p>
            </CardContent>
          </Card>
        </div>

        <DeviceSwitchCard userId={userId} />
      </div>

      {/* ── Personal day-in-review (own data only) ─────────────────────── */}
      <div className="pb-2">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
            <TrendingUp className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold tracking-tight">Your Day in Review</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              What you worked on today — only you can see this.
            </p>
          </div>
        </div>
      </div>

      {summaryError && (
        <p className="text-xs text-amber-600 dark:text-amber-400">{summaryError}</p>
      )}

      {!summary && !summaryError && (
        <p className="text-sm text-muted-foreground">Loading your activity…</p>
      )}

      {summary && !hasData && (
        <Card className="neo-card shadow-lg">
          <CardContent className="py-8 text-center space-y-1.5">
            <Activity className="h-6 w-6 mx-auto text-muted-foreground" />
            <p className="text-sm font-medium">No activity recorded yet today</p>
            <p className="text-xs text-muted-foreground">
              Start your workday with the desktop agent signed in — your keystrokes, mouse
              movement and visited sites will appear here.
            </p>
          </CardContent>
        </Card>
      )}

      {hasData && (
        <div className="space-y-6">
          {/* Headline metrics */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="neo-card shadow-lg">
              <CardContent className="pt-5 space-y-1">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Keyboard className="h-3.5 w-3.5" /> Keystrokes
                </div>
                <div className="text-2xl font-bold">{fmtInt(summary.totalKeystrokes)}</div>
                <p className="text-[11px] text-muted-foreground">{fmtInt(summary.totalLogs)} telemetry samples</p>
              </CardContent>
            </Card>
            <Card className="neo-card shadow-lg">
              <CardContent className="pt-5 space-y-1">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <MousePointer className="h-3.5 w-3.5" /> Mouse movement
                </div>
                <div className="text-2xl font-bold">{fmtInt(summary.totalMouseEvents)}</div>
                <p className="text-[11px] text-muted-foreground">
                  avg activity {summary.totalMouseActivity || 0}/100
                </p>
              </CardContent>
            </Card>
            <Card className="neo-card shadow-lg">
              <CardContent className="pt-5 space-y-1">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <TrendingUp className="h-3.5 w-3.5" /> Productivity
                </div>
                <div className={`text-2xl font-bold ${productivityTone(summary.avgProductivityScore)}`}>
                  {summary.avgProductivityScore || 0}%
                </div>
                <p className="text-[11px] text-muted-foreground">{summary.productivityEfficiency || 'No Activity'}</p>
              </CardContent>
            </Card>
            <Card className="neo-card shadow-lg">
              <CardContent className="pt-5 space-y-1">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" /> Active time
                </div>
                <div className="text-2xl font-bold">{summary.activeHours || '0h 0m'}</div>
                <p className="text-[11px] text-muted-foreground">idle {summary.idleTime || '0m'}</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Hour-by-hour activity */}
            <Card className="neo-card shadow-lg">
              <CardHeader className="border-b">
                <CardTitle className="text-base flex items-center gap-2">
                  <Activity className="h-4 w-4 text-primary" /> Activity by Hour
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-5">
                {hourly.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No hourly data yet.</p>
                ) : (
                  <div className="flex items-end gap-1.5 h-36">
                    {hourly.map((h) => {
                      const activity = (h.keystrokes || 0) + (h.mouseEvents || 0);
                      const heightPct = Math.max(4, Math.round((activity / peakActivity) * 100));
                      const tone = h.avgProductivity >= 50
                        ? 'bg-emerald-500'
                        : h.avgProductivity >= 30
                          ? 'bg-amber-500'
                          : 'bg-rose-400';
                      return (
                        <div key={h.hour} className="flex-1 flex flex-col items-center justify-end h-full gap-1"
                          title={`${h.label} — ${fmtInt(h.keystrokes)} keys, ${fmtInt(h.mouseEvents)} mouse, ${h.avgProductivity}% productive`}>
                          <span className="text-[9px] text-muted-foreground">{activity > 0 ? h.avgProductivity : ''}</span>
                          <div className={`w-full rounded-t ${tone}`} style={{ height: `${heightPct}%` }} />
                          <span className="text-[9px] text-muted-foreground">{h.label}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
                <div className="flex items-center gap-3 pt-3 text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> ≥50% productive</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" /> 30–49%</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-400" /> &lt;30%</span>
                </div>
              </CardContent>
            </Card>

            {/* Websites & apps visited */}
            <Card className="neo-card shadow-lg">
              <CardHeader className="border-b">
                <CardTitle className="text-base flex items-center gap-2">
                  <Globe className="h-4 w-4 text-primary" /> Websites &amp; Apps You Visited
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                {websiteVisits.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No website data yet today.</p>
                ) : (
                  <ul className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                    {websiteVisits.map((v, i) => (
                      <li key={`${v.startedAt}-${i}`}
                        className="flex items-center justify-between gap-3 text-xs rounded-lg border border-border/40 px-2.5 py-1.5">
                        <div className="min-w-0">
                          <p className="font-medium truncate">{v.label}</p>
                          {v.url && <p className="text-[10px] text-muted-foreground truncate">{v.url}</p>}
                        </div>
                        <div className="text-right shrink-0 text-muted-foreground">
                          <span className="font-mono">{fmtTime(v.startedAt)} – {fmtTime(v.endedAt)}</span>
                          <span className="block text-[10px]">{fmtDuration(v.seconds)}</span>
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
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="h-4 w-4 text-primary" /> Recent Activity
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              {recentLogs.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing recorded yet.</p>
              ) : (
                <ul className="space-y-1.5">
                  {recentLogs.map((log, i) => (
                    <li key={log._id || i}
                      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs border-b border-border/30 pb-1.5">
                      <span className="font-mono text-muted-foreground w-16 shrink-0">
                        {fmtTime(log.timestamp)}
                      </span>
                      <span className="flex-1 min-w-0 truncate font-medium">
                        {log.active_application?.name || 'Workspace'}
                        {log.active_application?.title && (
                          <span className="text-muted-foreground font-normal"> — {log.active_application.title}</span>
                        )}
                      </span>
                      <span className="flex items-center gap-3 text-muted-foreground shrink-0">
                        <span className="flex items-center gap-1"><Keyboard className="h-3 w-3" /> {fmtInt(log.keystroke_count)}</span>
                        <span className="flex items-center gap-1"><MousePointer className="h-3 w-3" /> {fmtInt(log.mouse_event_count)}</span>
                        {Number(log.productivity_score) > 0 && (
                          <span className={productivityTone(log.productivity_score)}>{log.productivity_score}%</span>
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
