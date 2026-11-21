/**
 * NIYANTRAN EMPLOYEE MONITORING V2
 * Operations — Explainable Activity Alerts & Human Review Page
 * 
 * Features F7, F8, F9:
 * - Tri-state severity tiers (White, Yellow, Red)
 * - Deterministic Rule IDs, threshold values, and observed values
 * - Two-way employee explanation submission
 * - Admin verdict review and resolution with ZERO automated penalties
 */

import React, { useState, useEffect } from 'react';
import Card, { CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import Modal from '../../components/ui/Modal.jsx';
import SearchInput from '../../components/ui/SearchInput.jsx';
import monitoringV2Api from '../../services/monitoringV2Api.js';
import {
  BellRing,
  AlertTriangle,
  Info,
  CheckCircle2,
  XCircle,
  ShieldCheck,
  MessageSquare,
  Gavel,
  RefreshCw,
  Clock,
  User,
  SlidersHorizontal,
  ChevronRight,
  ShieldAlert,
  Send,
  Check
} from 'lucide-react';

export const AlertsPage = () => {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filterTier, setFilterTier] = useState('ALL');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals state
  const [activeAlertForExplain, setActiveAlertForExplain] = useState(null);
  const [explanationText, setExplanationText] = useState('');
  const [submittingExplain, setSubmittingExplain] = useState(false);

  const [activeAlertForResolve, setActiveAlertForResolve] = useState(null);
  const [resolveVerdict, setResolveVerdict] = useState('acknowledged');
  const [resolveNotes, setResolveNotes] = useState('');
  const [submittingResolve, setSubmittingResolve] = useState(false);

  const fetchAlerts = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await monitoringV2Api.getAlerts();
      const raw = res?.data;
      const list = Array.isArray(raw) ? raw : (raw?.alerts || []);
      setAlerts(list);
    } catch (err) {
      console.error('[AlertsPage] Failed to fetch alerts:', err);
      setError('Failed to fetch alerts from live telemetry engine. Check network or permissions.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAlerts();
  }, []);

  const handleOpenExplain = (alert) => {
    setActiveAlertForExplain(alert);
    setExplanationText(alert.employee_explanation || '');
  };

  const handleCloseExplain = () => {
    setActiveAlertForExplain(null);
    setExplanationText('');
  };

  const handleSubmitExplanation = async () => {
    if (!activeAlertForExplain || !explanationText.trim()) return;
    setSubmittingExplain(true);
    try {
      const res = await monitoringV2Api.explainAlert(activeAlertForExplain._id || activeAlertForExplain.id, explanationText.trim());
      const updatedAlert = res?.data?.alert;
      setAlerts((prev) =>
        prev.map((a) => {
          const aid = a._id || a.id;
          const targetId = activeAlertForExplain._id || activeAlertForExplain.id;
          if (aid === targetId) {
            return {
              ...a,
              employee_explanation: explanationText.trim(),
              explained_at: new Date().toISOString(),
              explanation_status: 'pending_review',
              status: 'EXPLAINED'
            };
          }
          return a;
        })
      );
      handleCloseExplain();
    } catch (err) {
      console.error('[AlertsPage] Submit explanation error:', err);
      alert('Failed to submit explanation: ' + (err.response?.data?.error || err.message));
    } finally {
      setSubmittingExplain(false);
    }
  };

  const handleOpenResolve = (alert) => {
    setActiveAlertForResolve(alert);
    setResolveVerdict(alert.admin_verdict || 'cleared');
    setResolveNotes(alert.resolution_notes || '');
  };

  const handleCloseResolve = () => {
    setActiveAlertForResolve(null);
    setResolveNotes('');
  };

  const handleSubmitResolve = async () => {
    if (!activeAlertForResolve) return;
    setSubmittingResolve(true);
    try {
      await monitoringV2Api.resolveAlert(
        activeAlertForResolve._id || activeAlertForResolve.id,
        resolveVerdict,
        resolveNotes.trim()
      );
      setAlerts((prev) =>
        prev.map((a) => {
          const aid = a._id || a.id;
          const targetId = activeAlertForResolve._id || activeAlertForResolve.id;
          if (aid === targetId) {
            return {
              ...a,
              admin_verdict: resolveVerdict,
              resolution_notes: resolveNotes.trim(),
              status: 'RESOLVED',
              explanation_status: resolveVerdict === 'cleared' ? 'accepted' : (a.explanation_status === 'pending_review' ? 'rejected' : a.explanation_status),
              resolved_at: new Date().toISOString()
            };
          }
          return a;
        })
      );
      handleCloseResolve();
    } catch (err) {
      console.error('[AlertsPage] Resolve error:', err);
      alert('Failed to resolve alert: ' + (err.response?.data?.error || err.message));
    } finally {
      setSubmittingResolve(false);
    }
  };

  const handleDismiss = async (alertId) => {
    try {
      await monitoringV2Api.dismissAlert(alertId, 'Dismissed from dashboard');
      setAlerts((prev) =>
        prev.map((a) => ((a._id || a.id) === alertId ? { ...a, status: 'DISMISSED' } : a))
      );
    } catch (err) {
      console.error('[AlertsPage] Dismiss error:', err);
      // Fallback update
      setAlerts((prev) => prev.filter((a) => (a._id || a.id) !== alertId));
    }
  };

  // Filter pipeline
  const filteredAlerts = alerts.filter((alert) => {
    // Tier filter
    const alertTier = (alert.tier || (alert.severity === 'critical' || alert.severity === 'high' ? 'RED' : alert.severity === 'low' ? 'WHITE' : 'YELLOW')).toUpperCase();
    if (filterTier !== 'ALL' && alertTier !== filterTier) return false;

    // Status filter
    const alertStatus = (alert.status || 'ACTIVE').toUpperCase();
    if (filterStatus !== 'ALL') {
      if (filterStatus === 'OPEN' && !(alertStatus === 'ACTIVE' || alertStatus === 'EXPLAINED')) return false;
      if (filterStatus !== 'OPEN' && alertStatus !== filterStatus) return false;
    }

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const title = (alert.title || '').toLowerCase();
      const desc = (alert.description || '').toLowerCase();
      const rule = (alert.rule_id || '').toLowerCase();
      const emp = (alert.employee?.name || alert.employee?.email || '').toLowerCase();
      if (!title.includes(q) && !desc.includes(q) && !rule.includes(q) && !emp.includes(q)) {
        return false;
      }
    }

    return true;
  });

  const getTierBadge = (tier, severity) => {
    const t = (tier || (severity === 'critical' || severity === 'high' ? 'RED' : severity === 'low' ? 'WHITE' : 'YELLOW')).toUpperCase();
    if (t === 'RED') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold border bg-rose-500/10 text-rose-400 border-rose-500/30">
          <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
          RED · Human Review
        </span>
      );
    }
    if (t === 'WHITE') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold border bg-slate-800 text-slate-200 border-slate-700">
          <span className="w-2 h-2 rounded-full bg-slate-300" />
          WHITE · Normal
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold border bg-amber-500/10 text-amber-400 border-amber-500/30">
        <span className="w-2 h-2 rounded-full bg-amber-400" />
        YELLOW · Attention
      </span>
    );
  };

  const getExplanationStatusBadge = (status) => {
    switch (status) {
      case 'accepted':
        return <Badge variant="success">Explanation Accepted</Badge>;
      case 'pending_review':
        return <Badge variant="warning">Explanation Pending Review</Badge>;
      case 'rejected':
        return <Badge variant="danger">Explanation Rejected</Badge>;
      default:
        return <Badge variant="neutral">Explanation Not Submitted</Badge>;
    }
  };

  const getStatusBadge = (status) => {
    const s = String(status || 'ACTIVE').toUpperCase();
    if (s === 'ACTIVE') return <Badge variant="warning">ACTIVE</Badge>;
    if (s === 'EXPLAINED') return <Badge variant="purple">EXPLAINED</Badge>;
    if (s === 'RESOLVED') return <Badge variant="success">RESOLVED</Badge>;
    return <Badge variant="neutral">{s}</Badge>;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-100 flex items-center gap-2">
            <BellRing className="w-5 h-5 text-indigo-400" />
            <span>Explainable Activity Alerts & Human Review</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Deterministic tri-state alert engine (F7) with employee explanation workflow (F8) and human-in-the-loop review (F9).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchAlerts}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Badge variant={filteredAlerts.length > 0 ? 'warning' : 'success'}>
            {filteredAlerts.length} Incidents Shown
          </Badge>
        </div>
      </div>

      {/* Zero Invasive Surveillance & Penalty Guarantee Banner */}
      <Card className="bg-emerald-950/20 border-emerald-500/30">
        <CardContent className="p-4 flex items-center gap-3">
          <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
          <div className="text-xs text-slate-300">
            <span className="font-semibold text-emerald-300">Privacy & Due Process Guarantee: </span>
            Zero raw keystroke logs, zero screenshot recordings, and zero URL tracking. Alerts are evaluated deterministically against disclosed thresholds. Zero automated penalties — all verdicts require human review.
          </div>
        </CardContent>
      </Card>

      {/* Filters Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-slate-900/60 p-3 rounded-xl border border-slate-800">
        <div className="w-full md:w-72">
          <SearchInput
            placeholder="Search by rule, title, or employee..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-400 flex items-center gap-1">
            <SlidersHorizontal className="w-3.5 h-3.5" /> Tier:
          </span>
          {['ALL', 'WHITE', 'YELLOW', 'RED'].map((tier) => (
            <button
              key={tier}
              onClick={() => setFilterTier(tier)}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                filterTier === tier
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-700'
              }`}
            >
              {tier}
            </button>
          ))}

          <span className="text-xs text-slate-400 ml-2">Status:</span>
          {['ALL', 'ACTIVE', 'EXPLAINED', 'RESOLVED'].map((status) => (
            <button
              key={status}
              onClick={() => setFilterStatus(status)}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                filterStatus === status
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-700'
              }`}
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      {/* Error state */}
      {error && (
        <Card className="border-rose-500/40 bg-rose-500/10">
          <CardContent className="p-4 text-xs text-rose-300 flex items-center justify-between">
            <span>{error}</span>
            <Button size="sm" variant="outline" onClick={fetchAlerts}>Retry</Button>
          </CardContent>
        </Card>
      )}

      {/* Alerts List */}
      <div className="space-y-4">
        {loading ? (
          <Card>
            <CardContent className="p-12 text-center text-slate-400 space-y-3">
              <RefreshCw className="w-7 h-7 text-indigo-400 mx-auto animate-spin" />
              <p className="text-xs">Evaluating deterministic activity alert stream...</p>
            </CardContent>
          </Card>
        ) : filteredAlerts.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center text-slate-400 space-y-2">
              <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
              <h4 className="font-semibold text-slate-200">No matching activity alerts</h4>
              <p className="text-xs">No active telemetry thresholds have been exceeded for the selected filter.</p>
            </CardContent>
          </Card>
        ) : (
          filteredAlerts.map((alert) => {
            const aid = alert._id || alert.id;
            const tier = alert.tier || (alert.severity === 'critical' || alert.severity === 'high' ? 'RED' : alert.severity === 'low' ? 'WHITE' : 'YELLOW');
            const ruleId = alert.rule_id || (alert.data && alert.data.trinetra_rule) || 'RULE-ATTENTION-001';
            const threshold = alert.threshold_value || (alert.data && alert.data.still_minutes ? `${alert.data.still_minutes}m` : 'Policy configured');
            const observed = alert.observed_value || (alert.data && alert.data.idle_duration ? `${Math.round(alert.data.idle_duration / 60)}m` : 'Detected crossing');
            const empName = alert.employee?.name || (typeof alert.employee === 'string' ? alert.employee : 'Assigned Employee');

            return (
              <Card
                key={aid}
                className={`border-l-4 transition-all ${
                  tier === 'RED'
                    ? 'border-l-rose-500 bg-slate-900/90'
                    : tier === 'WHITE'
                    ? 'border-l-slate-400 bg-slate-900/80'
                    : 'border-l-amber-500 bg-slate-900/85'
                }`}
              >
                <CardContent className="p-5 space-y-4">
                  {/* Top Header Row */}
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      {getTierBadge(tier, alert.severity)}
                      <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-800 text-indigo-300 border border-slate-700">
                        {ruleId}
                      </span>
                      {getStatusBadge(alert.status)}
                      {getExplanationStatusBadge(alert.explanation_status)}
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-slate-500" />
                      {alert.timestamp ? new Date(alert.timestamp).toLocaleString() : 'Recent'}
                    </div>
                  </div>

                  {/* Body Content */}
                  <div>
                    <h4 className="text-base font-semibold text-slate-100 flex items-center gap-2">
                      {alert.title}
                    </h4>
                    <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                      {alert.description}
                    </p>
                  </div>

                  {/* Deterministic Evidence Table (Explainability Contract) */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 p-3 rounded-xl bg-slate-950/60 border border-slate-800 text-xs">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Employee</span>
                      <p className="font-semibold text-slate-200 mt-0.5 flex items-center gap-1">
                        <User className="w-3 h-3 text-slate-400" />
                        {empName}
                      </p>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Policy Threshold</span>
                      <p className="font-mono font-semibold text-amber-300 mt-0.5">
                        {String(threshold)}
                      </p>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Observed Value</span>
                      <p className="font-mono font-semibold text-rose-300 mt-0.5">
                        {String(observed)}
                      </p>
                    </div>
                  </div>

                  {/* Employee Explanation Callout if present */}
                  {alert.employee_explanation && (
                    <div className="p-3 rounded-xl bg-indigo-950/30 border border-indigo-500/20 text-xs space-y-1">
                      <div className="flex items-center justify-between text-indigo-300 font-semibold text-[11px]">
                        <span className="flex items-center gap-1.5">
                          <MessageSquare className="w-3.5 h-3.5" />
                          Employee Submitted Statement
                        </span>
                        {alert.explained_at && (
                          <span className="font-mono text-[10px] text-indigo-400/80">
                            {new Date(alert.explained_at).toLocaleString()}
                          </span>
                        )}
                      </div>
                      <p className="text-slate-200 italic pl-5 border-l-2 border-indigo-500/40">
                        "{alert.employee_explanation}"
                      </p>
                    </div>
                  )}

                  {/* Admin Verdict Resolution Callout if present */}
                  {alert.admin_verdict && (
                    <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-1">
                      <div className="flex items-center justify-between text-slate-400 font-semibold text-[11px]">
                        <span className="flex items-center gap-1.5 text-emerald-400">
                          <Gavel className="w-3.5 h-3.5" />
                          Human Admin Verdict: <span className="uppercase font-bold">{alert.admin_verdict}</span>
                        </span>
                        {alert.resolved_at && (
                          <span className="font-mono text-[10px] text-slate-500">
                            {new Date(alert.resolved_at).toLocaleString()}
                          </span>
                        )}
                      </div>
                      {alert.resolution_notes && (
                        <p className="text-slate-300 text-xs pl-5 border-l-2 border-slate-700">
                          {alert.resolution_notes}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex flex-wrap items-center justify-end gap-2 pt-1 border-t border-slate-800/60">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleOpenExplain(alert)}
                      className="text-xs flex items-center gap-1.5"
                    >
                      <MessageSquare className="w-3.5 h-3.5 text-indigo-400" />
                      {alert.employee_explanation ? 'Edit Explanation' : 'Submit Explanation'}
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleOpenResolve(alert)}
                      className="text-xs flex items-center gap-1.5 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10"
                    >
                      <Gavel className="w-3.5 h-3.5" />
                      Review & Resolve
                    </Button>

                    {alert.status !== 'DISMISSED' && alert.status !== 'RESOLVED' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDismiss(aid)}
                        className="text-xs text-slate-400 hover:text-slate-200"
                      >
                        Dismiss
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* Employee Explanation Modal */}
      <Modal
        isOpen={Boolean(activeAlertForExplain)}
        onClose={handleCloseExplain}
        title="Submit Employee Explanation"
        description="Explain the context behind this activity flag. Your explanation will be reviewed by human administrators before any verdict is reached."
      >
        <div className="space-y-4">
          <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-xs space-y-1">
            <div className="font-semibold text-slate-200">{activeAlertForExplain?.title}</div>
            <div className="text-slate-400">{activeAlertForExplain?.description}</div>
            <div className="font-mono text-[11px] text-indigo-400 pt-1">
              Rule: {activeAlertForExplain?.rule_id || 'RULE-ATTENTION-001'}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">
              Your Explanation / Justification <span className="text-rose-400">*</span>
            </label>
            <textarea
              rows={4}
              value={explanationText}
              onChange={(e) => setExplanationText(e.target.value)}
              placeholder="e.g. In an unscheduled engineering design whiteboarding session with the architecture team; away from workstation keyboard."
              className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-xs text-slate-200 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <span className="text-[11px] text-slate-500">
              Providing clear work context helps administrators verify legitimate offline or auxiliary tasks.
            </span>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
            <Button variant="ghost" size="sm" onClick={handleCloseExplain} disabled={submittingExplain}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSubmitExplanation}
              disabled={submittingExplain || !explanationText.trim()}
              className="flex items-center gap-1.5"
            >
              <Send className="w-3.5 h-3.5" />
              {submittingExplain ? 'Submitting...' : 'Submit Explanation'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Admin Review & Resolution Modal */}
      <Modal
        isOpen={Boolean(activeAlertForResolve)}
        onClose={handleCloseResolve}
        title="Admin Review & Incident Verdict"
        description="Select a final verdict and provide resolution rationale. Zero automated karma penalties will be dispatched."
      >
        <div className="space-y-4">
          <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-xs space-y-1">
            <div className="font-semibold text-slate-200">{activeAlertForResolve?.title}</div>
            <div className="text-slate-400">{activeAlertForResolve?.description}</div>
            {activeAlertForResolve?.employee_explanation && (
              <div className="mt-2 pt-2 border-t border-slate-800/80">
                <span className="font-semibold text-indigo-400">Employee Explanation:</span>
                <p className="italic text-slate-300 mt-0.5">"{activeAlertForResolve.employee_explanation}"</p>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-300">
              Administrative Verdict <span className="text-rose-400">*</span>
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { value: 'cleared', label: 'Cleared', color: 'border-emerald-500 bg-emerald-500/10 text-emerald-400' },
                { value: 'acknowledged', label: 'Acknowledged', color: 'border-amber-500 bg-amber-500/10 text-amber-400' },
                { value: 'escalated', label: 'Escalated', color: 'border-rose-500 bg-rose-500/10 text-rose-400' },
              ].map((v) => (
                <button
                  key={v.value}
                  type="button"
                  onClick={() => setResolveVerdict(v.value)}
                  className={`p-2.5 rounded-xl border text-xs font-semibold text-center cursor-pointer transition-all ${
                    resolveVerdict === v.value
                      ? `${v.color} shadow-sm ring-1 ring-indigo-500`
                      : 'border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                  }`}
                >
                  {v.label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-slate-500">
              {resolveVerdict === 'cleared'
                ? 'Activity explanation accepted as legitimate work context; alert is closed cleanly.'
                : resolveVerdict === 'acknowledged'
                ? 'Flag noted for operational awareness and 1-on-1 coaching; no punitive measures.'
                : 'Escalated for team lead or HR human consultation. No automated restrictions applied.'}
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">
              Resolution Notes & Rationale
            </label>
            <textarea
              rows={3}
              value={resolveNotes}
              onChange={(e) => setResolveNotes(e.target.value)}
              placeholder="e.g. Confirmed with tech lead that offline whiteboarding took place from 2 PM to 3 PM."
              className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-xs text-slate-200 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          {/* Privacy & Zero-Penalty Notice */}
          <div className="p-3 rounded-lg bg-emerald-950/30 border border-emerald-500/20 text-[11px] text-emerald-300/90 flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>Human-in-the-loop guarantee: Resolving this incident dispatches zero automated karma penalties or restrictions.</span>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
            <Button variant="ghost" size="sm" onClick={handleCloseResolve} disabled={submittingResolve}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSubmitResolve}
              disabled={submittingResolve}
              className="flex items-center gap-1.5"
            >
              <Gavel className="w-3.5 h-3.5" />
              {submittingResolve ? 'Resolving...' : 'Confirm Verdict'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default AlertsPage;
