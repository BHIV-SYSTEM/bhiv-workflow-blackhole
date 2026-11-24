/**
 * NIYANTRAN EMPLOYEE MONITORING V2
 * Administration — Monitoring Policies Page
 */

import React, { useState } from 'react';
import Card, { CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import { ShieldAlert, Lock, CheckCircle2 } from 'lucide-react';

export const PoliciesPage = () => {
  const [idleThreshold, setIdleThreshold] = useState('300');
  const [leaseTimeout, setLeaseTimeout] = useState('90');
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-100 flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-indigo-400" />
            <span>Monitoring Policies & Thresholds</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Configure system-wide telemetry rules, idle detection timers, and lease parameters
          </p>
        </div>
        <Button variant="primary" size="sm" onClick={handleSave}>
          {saved ? 'Saved!' : 'Save Policy Changes'}
        </Button>
      </div>

      {saved && (
        <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>Policies successfully updated in configuration state.</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Timing parameters */}
        <Card>
          <CardHeader>
            <CardTitle>Session Timing & Thresholds</CardTitle>
            <CardDescription>
              Governance timers enforced by both desktop agent and backend ingestion
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Hardware Idle Threshold (Seconds)
              </label>
              <input
                type="number"
                value={idleThreshold}
                onChange={(e) => setIdleThreshold(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Workstation is marked 'Idle' after this duration of continuous zero keyboard/mouse events.
              </p>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Autonomous Lease Timeout (Seconds)
              </label>
              <input
                type="number"
                value={leaseTimeout}
                onChange={(e) => setLeaseTimeout(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                60s base lease + 30s network grace period. Agent automatically expires offline sessions.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Immutable Privacy Standards */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-emerald-400" />
              <span>Immutable Privacy Invariants</span>
            </CardTitle>
            <CardDescription>
              Hard-locked architectural constraints that cannot be modified by any policy
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between text-xs">
              <span className="text-slate-300">Raw Keystroke / Text Capture</span>
              <Badge variant="danger">Permanently Prohibited</Badge>
            </div>
            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between text-xs">
              <span className="text-slate-300">Visual Screen Capture / OCR</span>
              <Badge variant="danger">Permanently Prohibited</Badge>
            </div>
            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between text-xs">
              <span className="text-slate-300">Clipboard / File System Scanning</span>
              <Badge variant="danger">Permanently Prohibited</Badge>
            </div>
            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between text-xs">
              <span className="text-slate-300">Numeric 60s Count Aggregation</span>
              <Badge variant="success">Enforced by Contract</Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default PoliciesPage;
