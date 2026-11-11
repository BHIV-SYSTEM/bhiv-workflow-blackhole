import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import {
  Activity,
  AlertTriangle,
  Camera,
  CheckCircle2,
  Clock,
  Download,
  Eye,
  Gauge,
  Globe,
  Keyboard,
  Loader2,
  MousePointer,
  RefreshCw,
  Save,
  Settings2,
  ShieldCheck,
  XCircle
} from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { API_URL } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/context/auth-context';

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function authHeaders() {
  const token = localStorage.getItem('WorkflowToken') || localStorage.getItem('token');
  const branch = localStorage.getItem('selectedBranch') || localStorage.getItem('branch');
  return {
    'x-auth-token': token,
    Authorization: `Bearer ${token}`,
    ...(branch && branch !== 'all' ? { 'x-branch': branch } : {})
  };
}

function todayString() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60000).toISOString().split('T')[0];
}

function formatMinutes(minutes) {
  const value = Number(minutes) || 0;
  const hours = Math.floor(value / 60);
  const mins = Math.round(value % 60);
  return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
}

function formatTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatLastSeen(ageSeconds) {
  if (ageSeconds === null || ageSeconds === undefined) return 'no telemetry';
  if (ageSeconds < 5) return 'just now';
  if (ageSeconds < 60) return `${ageSeconds}s ago`;
  const mins = Math.floor(ageSeconds / 60);
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m ago`;
}

const CATEGORY_COLORS = {
  FOCUS: 'bg-emerald-500',
  DOCUMENTATION: 'bg-teal-500',
  COMMUNICATION: 'bg-blue-500',
  SUPPORT: 'bg-cyan-500',
  DISTRACTION: 'bg-rose-500',
  NEUTRAL: 'bg-slate-500',
  SYSTEM: 'bg-zinc-600'
};

const CATEGORY_LABELS = {
  FOCUS: 'Focus',
  DOCUMENTATION: 'Documentation',
  COMMUNICATION: 'Communication',
  SUPPORT: 'Support',
  DISTRACTION: 'Distraction',
  NEUTRAL: 'Neutral',
  SYSTEM: 'System'
};

const STATUS_STYLES = {
  active: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  idle: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  away: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  offline: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
  monitoring_paused: 'bg-rose-500/15 text-rose-400 border-rose-500/30'
};

const STATUS_DOTS = {
  active: 'bg-emerald-400 animate-pulse',
  idle: 'bg-amber-400',
  away: 'bg-orange-400',
  offline: 'bg-zinc-500',
  monitoring_paused: 'bg-rose-400'
};

function initialsOf(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function intensityPercent(rate) {
  return Math.min(100, Math.round((Number(rate) || 0) / 6));
}

const VERIFICATION_STYLES = {
  verified: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  evidence_missing: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
  pending_review: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  overdue: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  in_progress: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30'
};

/**
 * Screenshots are served behind auth, so an <img src> cannot fetch them.
 * Load as a blob with headers and hand the browser an object URL instead.
 */
function AuthedImage({ screenshotId, alt, onClick }) {
  const [url, setUrl] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let objectUrl = null;

    setUrl(null);
    setFailed(false);

    axios
      .get(`${API_URL}/trinetra/screenshots/${screenshotId}`, {
        headers: authHeaders(),
        responseType: 'blob',
        timeout: 30000
      })
      .then((response) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(response.data);
        setUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [screenshotId]);

  if (failed) {
    return (
      <div className="h-32 w-full rounded-lg bg-muted/40 flex items-center justify-center text-[10px] text-muted-foreground">
        unavailable
      </div>
    );
  }

  if (!url) {
    return <Skeleton className="h-32 w-full rounded-lg" />;
  }

  return (
    <button type="button" onClick={onClick} className="block w-full overflow-hidden rounded-lg group">
      <img
        src={url}
        alt={alt}
        className="h-32 w-full object-cover transition-transform group-hover:scale-105"
        loading="lazy"
      />
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Console                                                             */
/* ------------------------------------------------------------------ */

export function TrinetraConsole() {
  const { toast } = useToast();
  const { user: currentUser } = useAuth();
  // Policy edits, rule runs, alert triage and exports are Admin-only;
  // Managers get a read-only view of the same data.
  const canManage = currentUser?.role === 'Admin';

  const [range, setRange] = useState('daily');
  const [date, setDate] = useState(todayString);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [activeTab, setActiveTab] = useState('live');

  const [status, setStatus] = useState(null);
  const [live, setLive] = useState({ employees: [], summary: null });
  const [productivity, setProductivity] = useState({ employees: [], team: null });
  const [verification, setVerification] = useState({ employees: [], summary: null });
  const [alerts, setAlerts] = useState([]);
  const [screenshots, setScreenshots] = useState([]);
  const [timeline, setTimeline] = useState({ segments: [], idle_clusters: [], summary: null });
  const [config, setConfig] = useState(null);

  const [loading, setLoading] = useState({ live: true, productivity: true, verification: false, alerts: false });
  const [savingConfig, setSavingConfig] = useState(false);
  const [previewScreenshot, setPreviewScreenshot] = useState(null);
  const liveTimer = useRef(null);

  const notifyError = useCallback(
    (message) => {
      toast({ title: 'TRINETRA', description: message, variant: 'destructive' });
    },
    [toast]
  );

  const fetchStatus = useCallback(async () => {
    try {
      const response = await axios.get(`${API_URL}/trinetra/status`, { headers: authHeaders() });
      setStatus(response.data);
    } catch (error) {
      // Status is informational; a failure here should not blank the console.
    }
  }, []);

  const fetchLive = useCallback(
    async (silent = false) => {
      if (!silent) setLoading((prev) => ({ ...prev, live: true }));
      try {
        const response = await axios.get(`${API_URL}/trinetra/telemetry/live`, {
          headers: authHeaders(),
          params: selectedEmployeeId ? { employeeId: selectedEmployeeId } : {}
        });
        setLive({ employees: response.data.employees || [], summary: response.data.summary || null });
      } catch (error) {
        notifyError(error.response?.data?.error || 'Failed to load live telemetry');
      } finally {
        if (!silent) setLoading((prev) => ({ ...prev, live: false }));
      }
    },
    [notifyError, selectedEmployeeId]
  );

  const fetchProductivity = useCallback(async () => {
    setLoading((prev) => ({ ...prev, productivity: true }));
    try {
      const response = await axios.get(`${API_URL}/trinetra/productivity/summary`, {
        headers: authHeaders(),
        params: { range, date }
      });
      setProductivity({ employees: response.data.employees || [], team: response.data.team || null });
    } catch (error) {
      notifyError(error.response?.data?.error || 'Failed to load productivity summary');
    } finally {
      setLoading((prev) => ({ ...prev, productivity: false }));
    }
  }, [date, notifyError, range]);

  const fetchVerification = useCallback(async () => {
    setLoading((prev) => ({ ...prev, verification: true }));
    try {
      const response = await axios.get(`${API_URL}/trinetra/verification/matrix`, {
        headers: authHeaders(),
        params: { range, date }
      });
      setVerification({ employees: response.data.employees || [], summary: response.data.summary || null });
    } catch (error) {
      notifyError(error.response?.data?.error || 'Failed to load verification matrix');
    } finally {
      setLoading((prev) => ({ ...prev, verification: false }));
    }
  }, [date, notifyError, range]);

  const fetchAlerts = useCallback(async () => {
    setLoading((prev) => ({ ...prev, alerts: true }));
    try {
      const response = await axios.get(`${API_URL}/trinetra/alerts`, {
        headers: authHeaders(),
        params: { date, status: 'open' }
      });
      setAlerts(response.data.alerts || []);
    } catch (error) {
      notifyError(error.response?.data?.error || 'Failed to load alerts');
    } finally {
      setLoading((prev) => ({ ...prev, alerts: false }));
    }
  }, [date, notifyError]);

  const fetchVisual = useCallback(async () => {
    if (!selectedEmployeeId) return;
    try {
      const [shots, tl] = await Promise.all([
        axios.get(`${API_URL}/trinetra/screenshots`, {
          headers: authHeaders(),
          params: { employeeId: selectedEmployeeId, date, type: 'periodic', limit: 60 }
        }),
        axios.get(`${API_URL}/trinetra/timeline/${selectedEmployeeId}`, {
          headers: authHeaders(),
          params: { date }
        })
      ]);
      setScreenshots(shots.data.screenshots || []);
      setTimeline({
        segments: tl.data.segments || [],
        idle_clusters: tl.data.idle_clusters || [],
        summary: tl.data.summary || null
      });
    } catch (error) {
      notifyError(error.response?.data?.error || 'Failed to load visual timeline');
    }
  }, [date, notifyError, selectedEmployeeId]);

  const fetchConfig = useCallback(async () => {
    try {
      const response = await axios.get(`${API_URL}/trinetra/config`, { headers: authHeaders() });
      setConfig(response.data.config);
    } catch (error) {
      notifyError('Failed to load TRINETRA configuration');
    }
  }, [notifyError]);

  /* ------------------------------ effects ------------------------------ */

  useEffect(() => {
    fetchStatus();
    fetchProductivity();
    fetchConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchLive();
    // Must match the telemetry cadence (5 s) so the grid shows a fresh sample
    // per tick instead of stepping over three of them at a time.
    liveTimer.current = setInterval(() => {
      fetchLive(true);
      fetchStatus();
    }, 5000);
    return () => {
      if (liveTimer.current) clearInterval(liveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchLive]);

  useEffect(() => {
    if (activeTab === 'verification' && verification.employees.length === 0) {
      fetchVerification();
    }
    if (activeTab === 'alerts') {
      fetchAlerts();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  useEffect(() => {
    fetchProductivity();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, date]);

  useEffect(() => {
    if (activeTab === 'visual') {
      fetchVisual();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEmployeeId, date, activeTab]);

  /* ------------------------------ actions ------------------------------ */

  const handleAlertAction = async (alertId, action) => {
    try {
      await axios.put(`${API_URL}/trinetra/alerts/${alertId}/${action}`, {}, { headers: authHeaders() });
      toast({ title: 'TRINETRA', description: `Alert ${action === 'resolve' ? 'resolved' : 'acknowledged'}` });
      fetchAlerts();
      fetchStatus();
    } catch (error) {
      notifyError(error.response?.data?.error || 'Failed to update alert');
    }
  };

  const handleEvaluateAlerts = async () => {
    try {
      const response = await axios.post(`${API_URL}/trinetra/alerts/evaluate`, {}, { headers: authHeaders() });
      const created = response.data?.result?.created ?? 0;
      toast({ title: 'TRINETRA', description: `Rule sweep complete — ${created} new alert(s)` });
      fetchAlerts();
      fetchStatus();
    } catch (error) {
      notifyError(error.response?.data?.error || 'Failed to run alert rules');
    }
  };

  const handleExport = async () => {
    try {
      const response = await axios.get(`${API_URL}/trinetra/report/export`, {
        headers: authHeaders(),
        params: { range, date },
        responseType: 'blob'
      });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = `trinetra_${range}_${date}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      notifyError('Failed to export report');
    }
  };

  const updateConfigField = (section, field, value) => {
    setConfig((prev) => ({
      ...prev,
      [section]: { ...(prev?.[section] || {}), [field]: value }
    }));
  };

  const handleSaveConfig = async () => {
    if (!config) return;
    setSavingConfig(true);
    try {
      const response = await axios.put(
        `${API_URL}/trinetra/config`,
        {
          screenshot: config.screenshot,
          scoring: config.scoring,
          alerts: config.alerts
        },
        { headers: authHeaders() }
      );
      setConfig(response.data.config);
      toast({ title: 'TRINETRA', description: 'Configuration saved' });
      fetchStatus();
    } catch (error) {
      notifyError(error.response?.data?.error || 'Failed to save configuration');
    } finally {
      setSavingConfig(false);
    }
  };

  /* ------------------------------ derived ------------------------------ */

  const employeeOptions = useMemo(() => {
    // Prefer the unfiltered productivity roster — live.employees narrows to the
    // current selection, which would strand the dropdown on a single person.
    const source = productivity.employees.length > 0 ? productivity.employees : live.employees;
    const options = source.map((employee) => ({
      id: employee.employee_id,
      name: employee.name,
      email: employee.email
    }));
    // Admin-role users are excluded from team rosters by design; always offer
    // the signed-in user's own telemetry so they can watch their own feed.
    if (currentUser && !options.some((option) => option.id === currentUser.id)) {
      options.unshift({ id: currentUser.id, name: `${currentUser.name} (you)`, email: currentUser.email });
    }
    return options;
  }, [live.employees, productivity.employees, currentUser]);

  const team = productivity.team;

  const timelineTotal = useMemo(
    () => timeline.segments.reduce((sum, segment) => sum + (segment.seconds || 0), 0),
    [timeline.segments]
  );

  return (
    <div className="space-y-5">
      {/* -------------------------- Status strip -------------------------- */}
      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
        <CardContent className="p-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-primary/15 flex items-center justify-center">
                <Eye className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-extrabold tracking-tight">TRINETRA AI — Every Activity. Every Task. Complete Visibility.</p>
                <p className="text-xs text-muted-foreground">
                  Coverage {status?.telemetry?.coverage_percent ?? '—'}% ·{' '}
                  {status?.telemetry?.employees_reporting_last_hour ?? 0} reporting in the last hour ·{' '}
                  capture mode {status?.screenshots?.mode ?? '—'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className="text-[10px]">
                config: {status?.config?.source ?? '—'}
              </Badge>
              <Badge variant="outline" className="text-[10px]">
                snapshots today: {status?.screenshots?.captured_today ?? 0}
              </Badge>
              <Badge variant="outline" className="text-[10px]">
                open alerts: {status?.alerts?.open ?? 0}
              </Badge>
              <Badge variant="outline" className="text-[10px]">
                sweep: {status?.alerts?.scheduler?.running ? 'running' : 'stopped'}
              </Badge>
            </div>
          </div>

          <div className="mt-4 flex flex-col sm:flex-row sm:items-end gap-3">
            <div className="w-full sm:w-40">
              <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Range</Label>
              <Select value={range} onValueChange={setRange}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="w-full sm:w-44">
              <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Date</Label>
              <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="h-9 text-xs" />
            </div>

            <div className="flex-1" />

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-9 text-xs font-semibold"
                onClick={() => {
                  fetchStatus();
                  fetchLive();
                  fetchProductivity();
                  if (activeTab === 'alerts') fetchAlerts();
                  if (activeTab === 'verification') fetchVerification();
                  if (activeTab === 'visual') fetchVisual();
                }}
              >
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                Refresh
              </Button>
              {canManage && (
                <Button variant="outline" size="sm" className="h-9 text-xs font-semibold" onClick={handleExport}>
                  <Download className="h-3.5 w-3.5 mr-1.5" />
                  Export CSV
                </Button>
              )}
            </div>
          </div>

          {team && (
            <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="rounded-xl border border-border bg-card p-3">
                <p className="text-[10px] uppercase text-muted-foreground font-bold">Team score</p>
                <p className="text-xl font-extrabold">{team.average_score ?? '—'}</p>
              </div>
              <div className="rounded-xl border border-border bg-card p-3">
                <p className="text-[10px] uppercase text-muted-foreground font-bold">Active time</p>
                <p className="text-xl font-extrabold">{formatMinutes(team.active_minutes)}</p>
              </div>
              <div className="rounded-xl border border-border bg-card p-3">
                <p className="text-[10px] uppercase text-muted-foreground font-bold">Idle time</p>
                <p className="text-xl font-extrabold">{formatMinutes(team.idle_minutes)}</p>
              </div>
              <div className="rounded-xl border border-border bg-card p-3">
                <p className="text-[10px] uppercase text-muted-foreground font-bold">Scored / total</p>
                <p className="text-xl font-extrabold">
                  {team.scored}/{team.employees}
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="h-auto p-1.5 bg-zinc-950/90 border border-zinc-800 flex flex-wrap gap-1.5 rounded-2xl">
          <TabsTrigger value="live" className="text-xs font-bold">
            <Activity className="h-3.5 w-3.5 mr-1.5" /> Eye 1 · Live
          </TabsTrigger>
          <TabsTrigger value="visual" className="text-xs font-bold">
            <Camera className="h-3.5 w-3.5 mr-1.5" /> Eye 2 · Visual
          </TabsTrigger>
          <TabsTrigger value="verification" className="text-xs font-bold">
            <ShieldCheck className="h-3.5 w-3.5 mr-1.5" /> Eye 3 · Deliverables
          </TabsTrigger>
          <TabsTrigger value="alerts" className="text-xs font-bold">
            <AlertTriangle className="h-3.5 w-3.5 mr-1.5" /> Alerts
          </TabsTrigger>
          <TabsTrigger value="settings" className="text-xs font-bold">
            <Settings2 className="h-3.5 w-3.5 mr-1.5" /> Policy
          </TabsTrigger>
        </TabsList>

        {/* ---------------------------- EYE 1 ---------------------------- */}
        <TabsContent value="live" className="mt-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-end gap-3">
            <div className="w-full sm:w-72">
              <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Candidate</Label>
              <Select
                value={selectedEmployeeId || 'all'}
                onValueChange={(value) => setSelectedEmployeeId(value === 'all' ? '' : value)}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="All candidates" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All candidates</SelectItem>
                  {employeeOptions.map((employee) => (
                    <SelectItem key={employee.id} value={employee.id}>
                      {employee.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {selectedEmployeeId
                ? 'Filtering live telemetry for the selected candidate.'
                : 'Showing everyone with telemetry today.'}
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[
              { label: 'Active', value: live.summary?.active ?? 0, tone: 'text-emerald-400' },
              { label: 'Idle', value: live.summary?.idle ?? 0, tone: 'text-amber-400' },
              { label: 'Away', value: live.summary?.away ?? 0, tone: 'text-orange-400' },
              { label: 'Offline', value: live.summary?.offline ?? 0, tone: 'text-zinc-400' },
              { label: 'Total', value: live.summary?.total ?? 0, tone: 'text-foreground' }
            ].map((item) => (
              <div key={item.label} className="rounded-xl border border-border bg-card p-3">
                <p className="text-[10px] uppercase text-muted-foreground font-bold">{item.label}</p>
                <p className={`text-2xl font-extrabold ${item.tone}`}>{item.value}</p>
              </div>
            ))}
          </div>

          {loading.live ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {[0, 1, 2, 3, 4, 5].map((key) => (
                <Skeleton key={key} className="h-28 rounded-xl" />
              ))}
            </div>
          ) : live.employees.length === 0 ? (
            <Card className="p-10 text-center text-sm text-muted-foreground">
              No employees reporting yet. Agent telemetry appears here as soon as a workday starts.
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {live.employees.map((employee) => (
                <Card key={employee.employee_id} className="p-4 space-y-2.5 hover:border-primary/40 transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="relative shrink-0">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full border border-primary/30 bg-primary/15 text-[11px] font-extrabold text-primary">
                          {initialsOf(employee.name)}
                        </div>
                        <span
                          className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-card ${
                            STATUS_DOTS[employee.status] || 'bg-zinc-500'
                          }`}
                        />
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-sm truncate">{employee.name}</p>
                        <p className="text-[11px] text-muted-foreground truncate">
                          {employee.department || employee.email}
                        </p>
                      </div>
                    </div>
                    <Badge variant="outline" className={`text-[10px] capitalize ${STATUS_STYLES[employee.status] || ''}`}>
                      {employee.status.replace('_', ' ')}
                    </Badge>
                  </div>

                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <Globe className="h-3 w-3" />
                    <span className="truncate">{employee.active_app || 'No application data'}</span>
                    {employee.active_category && (
                      <Badge variant="outline" className="text-[9px] py-0">
                        {CATEGORY_LABELS[employee.active_category] || employee.active_category}
                      </Badge>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-lg border border-border bg-muted/40 px-2 py-1.5">
                      <p className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide text-muted-foreground">
                        <Keyboard className="h-3 w-3" /> Keystrokes
                      </p>
                      <p className="font-extrabold leading-tight">
                        {(employee.keystrokes_today ?? 0).toLocaleString()}
                        <span className="ml-1 text-[10px] font-semibold text-muted-foreground">
                          {employee.keystrokes_per_min ?? 0}/min
                        </span>
                      </p>
                      <Progress value={intensityPercent(employee.keystrokes_per_min)} className="h-1 mt-1" />
                    </div>
                    <div className="rounded-lg border border-border bg-muted/40 px-2 py-1.5">
                      <p className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide text-muted-foreground">
                        <MousePointer className="h-3 w-3" /> Cursor moves
                      </p>
                      <p className="font-extrabold leading-tight">
                        {(employee.mouse_events_today ?? 0).toLocaleString()}
                        <span className="ml-1 text-[10px] font-semibold text-muted-foreground">
                          {employee.mouse_per_min ?? 0}/min
                        </span>
                      </p>
                      <Progress value={intensityPercent(employee.mouse_per_min)} className="h-1 mt-1" />
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {employee.day_active ? `since ${formatTime(employee.day_started_at)}` : 'no open day'}
                    </span>
                    <span>{employee.samples_today} samples</span>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Camera className="h-3 w-3" />
                      {employee.captures_today} snapshots
                    </span>
                    <span className="flex items-center gap-1">
                      <Gauge className="h-3 w-3" />
                      {employee.idle_seconds != null ? `${employee.idle_seconds}s idle` : '—'}
                    </span>
                  </div>

                  <div
                    className={`flex items-center justify-between rounded-lg border px-2 py-1.5 text-[11px] font-semibold ${
                      employee.stale
                        ? 'border-amber-500/30 bg-amber-500/10 text-amber-400'
                        : 'border-border bg-muted/30 text-muted-foreground'
                    }`}
                  >
                    <span className="flex items-center gap-1.5">
                      <Activity className="h-3 w-3" />
                      Last activity
                    </span>
                    <span>
                      {formatLastSeen(employee.last_activity_age_seconds)}
                      {employee.stale ? ' · stale' : ''}
                    </span>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ---------------------------- EYE 2 ---------------------------- */}
        <TabsContent value="visual" className="mt-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-end gap-3">
            <div className="w-full sm:w-72">
              <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Employee</Label>
              <Select value={selectedEmployeeId} onValueChange={setSelectedEmployeeId}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Select employee" />
                </SelectTrigger>
                <SelectContent>
                  {employeeOptions.map((employee) => (
                    <SelectItem key={employee.id} value={employee.id}>
                      {employee.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {!selectedEmployeeId ? (
            <Card className="p-10 text-center text-sm text-muted-foreground">
              Select an employee to inspect their workday timeline and periodic snapshots.
            </Card>
          ) : (
            <>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-bold flex items-center justify-between">
                    <span>Workday timeline</span>
                    <span className="text-[11px] font-medium text-muted-foreground">
                      {formatMinutes(timeline.summary?.active_minutes)} active ·{' '}
                      {formatMinutes(timeline.summary?.idle_minutes)} idle
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {timeline.segments.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No activity recorded for this date.</p>
                  ) : (
                    <>
                      <div className="flex h-6 w-full overflow-hidden rounded-md border border-border">
                        {timeline.segments.map((segment, index) => (
                          <div
                            key={`${segment.start}-${index}`}
                            className={`${segment.idle ? 'bg-zinc-700' : CATEGORY_COLORS[segment.category] || 'bg-slate-500'} h-full`}
                            style={{ width: `${(segment.seconds / Math.max(timelineTotal, 1)) * 100}%` }}
                            title={`${segment.label} · ${formatMinutes(segment.minutes)} · ${formatTime(segment.start)}`}
                          />
                        ))}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                          <span key={key} className="flex items-center gap-1 text-[10px] text-muted-foreground">
                            <span className={`h-2 w-2 rounded-full ${CATEGORY_COLORS[key]}`} />
                            {label}
                          </span>
                        ))}
                        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <span className="h-2 w-2 rounded-full bg-zinc-700" /> Idle
                        </span>
                      </div>
                      {timeline.idle_clusters.length > 0 && (
                        <div className="text-[11px] text-muted-foreground">
                          Breaks: {timeline.idle_clusters.map((cluster) => formatMinutes(cluster.minutes)).join(' · ')}
                        </div>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-bold">
                    Periodic snapshots · {screenshots.length} captured
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {screenshots.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      No periodic captures for this date. Enable <strong>periodic</strong> or <strong>both</strong> capture
                      mode in Policy, then let the agent run during an active workday.
                    </p>
                  ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
                      {screenshots.map((shot) => (
                        <div key={shot.id} className="space-y-1">
                          <AuthedImage
                            screenshotId={shot.id}
                            alt={`${shot.app || 'screen'} at ${formatTime(shot.timestamp)}`}
                            onClick={() => setPreviewScreenshot(shot.id)}
                          />
                          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                            <span>{formatTime(shot.timestamp)}</span>
                            <span className="truncate max-w-[60%]">{shot.app || '—'}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {previewScreenshot && (
                <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setPreviewScreenshot(null)}>
                  <div className="max-w-5xl w-full" onClick={(event) => event.stopPropagation()}>
                    <AuthedImage screenshotId={previewScreenshot} alt="Screenshot preview" />
                    <Button variant="outline" size="sm" className="mt-3" onClick={() => setPreviewScreenshot(null)}>
                      Close
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </TabsContent>

        {/* ---------------------------- EYE 3 ---------------------------- */}
        <TabsContent value="verification" className="mt-5 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-xl border border-border bg-card p-3">
              <p className="text-[10px] uppercase text-muted-foreground font-bold">Tasks</p>
              <p className="text-2xl font-extrabold">{verification.summary?.tasks ?? 0}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-3">
              <p className="text-[10px] uppercase text-muted-foreground font-bold">Verified</p>
              <p className="text-2xl font-extrabold text-emerald-400">{verification.summary?.verified ?? 0}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-3">
              <p className="text-[10px] uppercase text-muted-foreground font-bold">Evidence missing</p>
              <p className="text-2xl font-extrabold text-rose-400">{verification.summary?.evidence_missing ?? 0}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-3">
              <p className="text-[10px] uppercase text-muted-foreground font-bold">Overdue</p>
              <p className="text-2xl font-extrabold text-orange-400">{verification.summary?.overdue ?? 0}</p>
            </div>
          </div>

          {loading.verification ? (
            <Skeleton className="h-40 rounded-xl" />
          ) : verification.employees.length === 0 ? (
            <Card className="p-10 text-center text-sm text-muted-foreground">No task activity in this window.</Card>
          ) : (
            <div className="space-y-3">
              {verification.employees.map((employee) => (
                <Card key={employee.employee_id}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-bold flex items-center justify-between gap-3">
                      <span className="truncate">{employee.name}</span>
                      <span className="text-[11px] font-medium text-muted-foreground shrink-0">
                        {employee.tasks.length} tasks · {formatMinutes(employee.tracked_minutes)} tracked
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {employee.tasks.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No tasks moved in this window.</p>
                    ) : (
                      employee.tasks.map((task) => (
                        <div
                          key={task.task_object_id}
                          className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-lg border border-border/60 bg-muted/20 p-2.5"
                        >
                          <div className="min-w-0 space-y-1">
                            <p className="text-xs font-semibold truncate">{task.title}</p>
                            <div className="flex items-center gap-2 text-[10px] text-muted-foreground flex-wrap">
                              <span>{task.task_id}</span>
                              <span>· {task.status}</span>
                              <span>· tracked {formatMinutes(task.tracked_minutes)}</span>
                              {task.due_date && <span>· due {new Date(task.due_date).toLocaleDateString()}</span>}
                              {typeof task.review_score === 'number' && <span>· review {task.review_score}</span>}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <Badge variant="outline" className="text-[9px]">
                              {task.evidence_count} evidence
                            </Badge>
                            {task.on_time === false && (
                              <Badge variant="outline" className="text-[9px] text-amber-400 border-amber-500/30">
                                late
                              </Badge>
                            )}
                            <Badge
                              variant="outline"
                              className={`text-[9px] ${VERIFICATION_STYLES[task.verification] || ''}`}
                            >
                              {task.verification.replace('_', ' ')}
                            </Badge>
                          </div>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ---------------------------- ALERTS ---------------------------- */}
        <TabsContent value="alerts" className="mt-5 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {alerts.length} open alert(s) · rules run automatically every{' '}
              {status?.alerts?.scheduler?.interval_minutes ?? 15} minutes
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={fetchAlerts}>
                <RefreshCw className="h-3 w-3 mr-1" /> Refresh
              </Button>
              {canManage && (
                <Button size="sm" className="h-8 text-xs" onClick={handleEvaluateAlerts}>
                  Run rules now
                </Button>
              )}
            </div>
          </div>

          {loading.alerts ? (
            <Skeleton className="h-32 rounded-xl" />
          ) : alerts.length === 0 ? (
            <Card className="p-10 text-center text-sm text-muted-foreground">
              No open alerts. Pending tasks, delays and inactivity will surface here automatically.
            </Card>
          ) : (
            <div className="space-y-2">
              {alerts.map((alert) => (
                <Card key={alert.id} className="p-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge
                          variant="outline"
                          className={`text-[9px] ${
                            alert.severity === 'high' || alert.severity === 'critical'
                              ? 'text-rose-400 border-rose-500/30'
                              : 'text-amber-400 border-amber-500/30'
                          }`}
                        >
                          {alert.severity}
                        </Badge>
                        <p className="text-xs font-bold">{alert.title}</p>
                        <span className="text-[10px] text-muted-foreground">{alert.employee?.name}</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground">{alert.description}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {alert.rule} · {formatTime(alert.timestamp)} · {alert.status}
                      </p>
                    </div>
                    {canManage && (
                      <div className="flex gap-2 shrink-0">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-[11px]"
                          onClick={() => handleAlertAction(alert.id, 'acknowledge')}
                          disabled={alert.status !== 'active'}
                        >
                          <CheckCircle2 className="h-3 w-3 mr-1" /> Ack
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-[11px]"
                          onClick={() => handleAlertAction(alert.id, 'resolve')}
                        >
                          <XCircle className="h-3 w-3 mr-1" /> Resolve
                        </Button>
                      </div>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ---------------------------- POLICY ---------------------------- */}
        <TabsContent value="settings" className="mt-5 space-y-4">
          {!config ? (
            <Skeleton className="h-64 rounded-xl" />
          ) : (
            <>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-bold flex items-center justify-between">
                    <span>Capture policy</span>
                    <Badge variant="outline" className="text-[10px]">
                      source: {config.source}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <Label className="text-[10px] uppercase text-muted-foreground">Mode</Label>
                    <Select
                      value={config.screenshot.mode}
                      onValueChange={(value) => updateConfigField('screenshot', 'mode', value)}
                    >
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="intelligent">Intelligent (violations only)</SelectItem>
                        <SelectItem value="periodic">Periodic only</SelectItem>
                        <SelectItem value="both">Both</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-[10px] uppercase text-muted-foreground">Interval (minutes)</Label>
                    <Input
                      type="number"
                      min={1}
                      max={240}
                      className="h-9 text-xs"
                      value={config.screenshot.interval_minutes}
                      onChange={(event) =>
                        updateConfigField('screenshot', 'interval_minutes', Number(event.target.value))
                      }
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-[10px] uppercase text-muted-foreground">Max captures / hour</Label>
                    <Input
                      type="number"
                      min={1}
                      max={60}
                      className="h-9 text-xs"
                      value={config.screenshot.max_per_hour}
                      onChange={(event) => updateConfigField('screenshot', 'max_per_hour', Number(event.target.value))}
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-[10px] uppercase text-muted-foreground">Dedupe distance (0-64)</Label>
                    <Input
                      type="number"
                      min={0}
                      max={64}
                      className="h-9 text-xs"
                      value={config.screenshot.dedupe_distance}
                      onChange={(event) =>
                        updateConfigField('screenshot', 'dedupe_distance', Number(event.target.value))
                      }
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-[10px] uppercase text-muted-foreground">Retention (days)</Label>
                    <Input
                      type="number"
                      min={1}
                      max={365}
                      className="h-9 text-xs"
                      value={config.screenshot.retention_days}
                      onChange={(event) =>
                        updateConfigField('screenshot', 'retention_days', Number(event.target.value))
                      }
                    />
                  </div>

                  <div className="flex items-center justify-between rounded-lg border border-border p-3">
                    <div>
                      <p className="text-xs font-semibold">Capture while idle</p>
                      <p className="text-[10px] text-muted-foreground">Skip away-from-desk screenshots when off</p>
                    </div>
                    <Switch
                      checked={config.screenshot.capture_when_idle}
                      onCheckedChange={(checked) => updateConfigField('screenshot', 'capture_when_idle', checked)}
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-bold">Scoring weights</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="space-y-1">
                    <Label className="text-[10px] uppercase text-muted-foreground">Focus</Label>
                    <Input
                      type="number"
                      step="0.05"
                      min={0}
                      max={1}
                      className="h-9 text-xs"
                      value={config.scoring.focus_weight}
                      onChange={(event) => updateConfigField('scoring', 'focus_weight', Number(event.target.value))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] uppercase text-muted-foreground">Intensity</Label>
                    <Input
                      type="number"
                      step="0.05"
                      min={0}
                      max={1}
                      className="h-9 text-xs"
                      value={config.scoring.intensity_weight}
                      onChange={(event) => updateConfigField('scoring', 'intensity_weight', Number(event.target.value))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] uppercase text-muted-foreground">Deliverable</Label>
                    <Input
                      type="number"
                      step="0.05"
                      min={0}
                      max={1}
                      className="h-9 text-xs"
                      value={config.scoring.deliverable_weight}
                      onChange={(event) =>
                        updateConfigField('scoring', 'deliverable_weight', Number(event.target.value))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] uppercase text-muted-foreground">Target keys/min</Label>
                    <Input
                      type="number"
                      min={1}
                      max={600}
                      className="h-9 text-xs"
                      value={config.scoring.target_keystrokes_per_minute}
                      onChange={(event) =>
                        updateConfigField('scoring', 'target_keystrokes_per_minute', Number(event.target.value))
                      }
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-bold">Alert thresholds</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-5 gap-4">
                  <div className="space-y-1">
                    <Label className="text-[10px] uppercase text-muted-foreground">Stalled task (h)</Label>
                    <Input
                      type="number"
                      min={1}
                      max={168}
                      className="h-9 text-xs"
                      value={config.alerts.stalled_task_hours}
                      onChange={(event) => updateConfigField('alerts', 'stalled_task_hours', Number(event.target.value))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] uppercase text-muted-foreground">Inactivity (min)</Label>
                    <Input
                      type="number"
                      min={5}
                      max={240}
                      className="h-9 text-xs"
                      value={config.alerts.inactivity_minutes}
                      onChange={(event) => updateConfigField('alerts', 'inactivity_minutes', Number(event.target.value))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] uppercase text-muted-foreground">Low focus (%)</Label>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      className="h-9 text-xs"
                      value={config.alerts.low_focus_percent}
                      onChange={(event) => updateConfigField('alerts', 'low_focus_percent', Number(event.target.value))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] uppercase text-muted-foreground">Cooldown (min)</Label>
                    <Input
                      type="number"
                      min={5}
                      max={1440}
                      className="h-9 text-xs"
                      value={config.alerts.cooldown_minutes}
                      onChange={(event) => updateConfigField('alerts', 'cooldown_minutes', Number(event.target.value))}
                    />
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-border p-3">
                    <div>
                      <p className="text-xs font-semibold">Alerts on</p>
                      <p className="text-[10px] text-muted-foreground">Automated rule sweep</p>
                    </div>
                    <Switch
                      checked={config.alerts.enabled}
                      onCheckedChange={(checked) => updateConfigField('alerts', 'enabled', checked)}
                    />
                  </div>
                </CardContent>
              </Card>

              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] text-muted-foreground">
                  Weights are normalised across whichever factors exist; employees without enough telemetry are reported
                  as <strong>insufficient data</strong> instead of being scored.
                </p>
                <Button size="sm" className="h-9 text-xs font-semibold" onClick={handleSaveConfig} disabled={savingConfig || !canManage}>
                  {savingConfig ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
                  {canManage ? 'Save policy' : 'Admin only'}
                </Button>
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default TrinetraConsole;
