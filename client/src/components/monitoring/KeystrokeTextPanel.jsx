import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Keyboard,
  RefreshCw,
  ShieldCheck,
  AlertTriangle,
  Zap,
  MinusCircle,
  Type
} from 'lucide-react';
import axios from 'axios';
import { API_URL } from '@/lib/api';

const CLASSIFICATION_META = {
  valuable: {
    label: 'Valuable',
    badge: 'bg-emerald-600 text-white',
    icon: ShieldCheck,
    hint: 'Real sentences typed at a human pace'
  },
  low_value: {
    label: 'Low Value',
    badge: 'bg-amber-600 text-white',
    icon: MinusCircle,
    hint: 'Some readable content, weak structure'
  },
  key_mashing: {
    label: 'Key Mashing',
    badge: 'bg-rose-600 text-white',
    icon: AlertTriangle,
    hint: 'Random/rapid keys — likely inflating counters'
  },
  insufficient: {
    label: 'Too Short',
    badge: 'bg-zinc-700 text-zinc-300',
    icon: Zap,
    hint: 'Not enough text to judge'
  }
};

const QUALITY_FILTERS = [
  { value: '', label: 'All' },
  { value: 'valuable', label: 'Valuable' },
  { value: 'low_value', label: 'Low Value' },
  { value: 'key_mashing', label: 'Key Mashing' }
];

/**
 * Admin view of reconstructed typed text for one employee.
 * Every segment shows the server's quality verdict so real writing
 * can be told apart from keystrokes performed just to hit a target.
 */
export function KeystrokeTextPanel({ employeeId, date }) {
  const [segments, setSegments] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('');

  // Silent keeps the spinner hidden so auto-refreshes don't interrupt
  // the admin mid-view (manual Refresh still shows loading state).
  const fetchSegments = useCallback(async ({ silent = false } = {}) => {
    if (!employeeId) return;
    if (!silent) setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('WorkflowToken') || localStorage.getItem('token');
      const params = new URLSearchParams({ limit: '200' });
      if (date) params.set('date', date);
      if (filter) params.set('classification', filter);

      const response = await axios.get(
        `${API_URL}/monitoring/employees/${employeeId}/keystrokes?${params.toString()}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setSegments(response.data.segments || []);
      setSummary(response.data.summary || null);
    } catch (err) {
      console.error('Error fetching keystroke text:', err);
      setError(err.response?.data?.error || 'Failed to load typed text');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [employeeId, date, filter]);

  useEffect(() => {
    fetchSegments();
  }, [fetchSegments]);

  // Live update: keystrokes typed within the last minute must show up
  // without the admin hitting Refresh — poll quietly every 30s.
  useEffect(() => {
    const timer = setInterval(() => {
      fetchSegments({ silent: true });
    }, 30000);
    return () => clearInterval(timer);
  }, [fetchSegments]);

  const metaFor = (classification) =>
    CLASSIFICATION_META[classification] || CLASSIFICATION_META.insufficient;

  return (
    <Card className="bg-zinc-900/80 border-zinc-800">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
          <Type className="h-4 w-4 text-emerald-400" />
          Typed Text Activity
        </CardTitle>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => fetchSegments()}
          disabled={loading}
          className="text-zinc-400 hover:text-white"
        >
          <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Quality summary strip */}
        {summary && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="rounded-xl bg-zinc-950 border border-zinc-800 p-2.5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                Valuable
              </p>
              <p className="text-lg font-extrabold text-white">{summary.valuable || 0}</p>
            </div>
            <div className="rounded-xl bg-zinc-950 border border-zinc-800 p-2.5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-amber-400">
                Low Value
              </p>
              <p className="text-lg font-extrabold text-white">{summary.low_value || 0}</p>
            </div>
            <div className="rounded-xl bg-zinc-950 border border-zinc-800 p-2.5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-rose-400">
                Key Mashing
              </p>
              <p className="text-lg font-extrabold text-white">{summary.key_mashing || 0}</p>
            </div>
            <div className="rounded-xl bg-zinc-950 border border-zinc-800 p-2.5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                Avg Speed
              </p>
              <p className="text-lg font-extrabold text-white">
                {summary.avgWpm || 0} <span className="text-xs font-bold text-zinc-500">WPM</span>
              </p>
            </div>
          </div>
        )}

        {/* Filter chips */}
        <div className="flex flex-wrap gap-1.5">
          {QUALITY_FILTERS.map((f) => (
            <button
              key={f.value || 'all'}
              onClick={() => setFilter(f.value)}
              className={`px-2.5 py-1 rounded-full text-[11px] font-bold border transition-colors ${
                filter === f.value
                  ? 'bg-emerald-600 text-white border-emerald-500'
                  : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:text-white'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {error && (
          <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg p-2">
            {error}
          </p>
        )}

        {/* Segment feed */}
        <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
          {loading && segments.length === 0 ? (
            <p className="text-xs text-zinc-400 text-center py-6">Loading typed text…</p>
          ) : segments.length === 0 ? (
            <div className="text-center py-8">
              <Keyboard className="h-8 w-8 text-zinc-700 mx-auto mb-2" />
              <p className="text-xs text-zinc-400">
                No typed text recorded{date ? ' for this date' : ' yet'}.
              </p>
              <p className="text-[10px] text-zinc-600 mt-1">
                Requires the desktop agent with keystroke capture active.
              </p>
            </div>
          ) : (
            segments.map((seg, index) => {
              const meta = metaFor(seg.quality?.classification);
              const Icon = meta.icon;
              const text = seg.text || '';
              const displayText = text.trim().length > 0
                ? text
                : `(${seg.capture?.key_count || 0} keys, no readable text)`;

              return (
                <div
                  key={`${seg.timestamp}-${index}`}
                  className="rounded-xl bg-zinc-950 border border-zinc-800 p-3"
                >
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge className={`${meta.badge} text-[10px] font-bold flex items-center gap-1`}>
                        <Icon className="h-3 w-3" />
                        {meta.label}
                      </Badge>
                      <span className="text-[10px] font-semibold text-zinc-500">
                        {seg.wpm ? `${seg.wpm} WPM` : ''}
                        {seg.capture?.key_count ? ` • ${seg.capture.key_count} keys` : ''}
                        {seg.quality?.score != null && seg.quality.score > 0
                          ? ` • score ${seg.quality.score}`
                          : ''}
                      </span>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-[10px] font-bold text-zinc-300 truncate max-w-[140px]">
                        {seg.application_name || 'Unknown app'}
                      </p>
                      <p className="text-[10px] text-zinc-600">
                        {seg.timestamp ? new Date(seg.timestamp).toLocaleTimeString() : ''}
                      </p>
                    </div>
                  </div>

                  <p className="text-xs text-zinc-200 whitespace-pre-wrap break-words leading-relaxed bg-zinc-900/70 rounded-lg p-2 border border-zinc-800/70">
                    {displayText}
                  </p>

                  {seg.window_title && (
                    <p className="text-[10px] text-zinc-600 mt-1.5 truncate">
                      Window: {seg.window_title}
                    </p>
                  )}

                  {seg.quality?.reasons?.length > 0 && (
                    <p className="text-[10px] text-zinc-500 mt-1 italic">
                      {seg.quality.reasons.join(' • ')}
                    </p>
                  )}
                </div>
              );
            })
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default KeystrokeTextPanel;
