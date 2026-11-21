import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../../../context/auth-context';
import api, { API_URL } from '../../../../lib/api';
import axios from 'axios';
import Card, { CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import Badge from '../../components/ui/Badge.jsx';
import {
  Play, Pause, Square, Clock, Laptop, ShieldCheck, CheckCircle2,
  RefreshCw, Activity, Monitor,
} from 'lucide-react';

export const WorkSessionPage = () => {
  const { user } = useAuth();
  const [workday, setWorkday] = useState({ dayStarted: false, dayEndedToday: false, startTime: null });
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(new Date().toLocaleTimeString());

  const userId = user?._id || user?.id;

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/attendance/status');
      if (res) {
        setWorkday({
          dayStarted: res.dayStarted ?? false,
          dayEndedToday: res.dayEndedToday ?? false,
          startTime: res.startTime ?? null,
        });
      }
    } catch (e) {
      console.error('attendance status failed', e);
    }
    if (userId) {
      try {
        const r = await axios.get(`${API_URL}/agent/activity/summary/${userId}`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('WorkflowToken') || localStorage.getItem('token')}` },
        });
        setSummary(r.data?.summary || null);
      } catch (e) {
        console.error('activity summary failed', e);
      }
    }
    setLastRefresh(new Date().toLocaleTimeString());
    setLoading(false);
  }, [userId]);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);
  useEffect(() => {
    const t = setInterval(fetchStatus, 30000);
    return () => clearInterval(t);
  }, [fetchStatus]);

  const agentConnected = !!summary && (summary.totalLogs > 0 || summary.totalKeystrokes > 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-border/60">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-primary/10 text-primary border border-primary/20">
              <Laptop className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-foreground">Work Session</h1>
              <p className="text-xs text-muted-foreground mt-0.5">Your activity from the Niyantran Desktop Agent</p>
            </div>
          </div>
        </div>
        <Button variant="outline" size="sm" icon={RefreshCw} onClick={fetchStatus} disabled={loading}>
          <span>Refresh</span>
          <span className="text-[10px] text-muted-foreground font-mono">({lastRefresh})</span>
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Workday</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{workday.dayStarted ? 'Active' : 'Not started'}</div>
            {workday.startTime && <div className="text-xs text-muted-foreground mt-1">Started at {workday.startTime}</div>}
            {workday.dayEndedToday && <div className="text-xs text-muted-foreground mt-1">Day ended</div>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Agent Status</CardTitle></CardHeader>
          <CardContent>
            <Badge variant={agentConnected ? 'success' : 'neutral'} className="text-xs">
              {agentConnected ? 'Connected' : 'Waiting for data'}
            </Badge>
            <div className="text-xs text-muted-foreground mt-2">
              {agentConnected ? 'Desktop agent is sending telemetry.' : 'Launch the desktop agent to sync live metrics.'}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Today&apos;s Activity</CardTitle></CardHeader>
          <CardContent>
            <div className="text-sm space-y-1">
              <div>Logs: <strong>{summary?.totalLogs ?? 0}</strong></div>
              <div>Keystrokes: <strong>{summary?.totalKeystrokes ?? 0}</strong></div>
              <div>Avg productivity: <strong>{summary?.avgProductivityScore ?? 0}</strong></div>
            </div>
          </CardContent>
        </Card>
      </div>

      {summary?.recentLogs?.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Recent Activity</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {summary.recentLogs.map((log, i) => (
              <div key={i} className="flex items-center justify-between text-xs border-b border-border/40 pb-1">
                <span className="text-muted-foreground">{log.active_application?.name || 'Unknown'}</span>
                <span>{log.keystroke_count || 0} keys</span>
                <span className="text-muted-foreground">{log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : ''}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default WorkSessionPage;
