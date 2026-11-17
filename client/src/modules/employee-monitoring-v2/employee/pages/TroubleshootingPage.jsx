/**
 * NIYANTRAN EMPLOYEE MONITORING V2
 * Employee Workspace — Troubleshooting & Diagnostics Page
 */

import React, { useState } from 'react';
import { useMonitoringV2Context } from '../../context/MonitoringV2Context.jsx';
import Card, { CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import Badge from '../../components/ui/Badge.jsx';
import {
  HelpCircle,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Wifi,
  Laptop,
  Info,
} from 'lucide-react';

export const TroubleshootingPage = () => {
  const { conflictDetected, setConflictDetected } = useMonitoringV2Context();
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionResult, setConnectionResult] = useState(null);
  const [testingConflict, setTestingConflict] = useState(false);
  const [conflictResult, setConflictResult] = useState(null);

  const runConnectivityCheck = () => {
    setTestingConnection(true);
    setConnectionResult(null);
    setTimeout(() => {
      setTestingConnection(false);
      setConnectionResult({
        success: true,
        latencyMs: 24,
        message: 'Connected to Niyantran V2 Backend API (Demo Loopback).',
      });
    }, 700);
  };

  const runConflictCheck = () => {
    setTestingConflict(true);
    setConflictResult(null);
    setTimeout(() => {
      setTestingConflict(false);
      if (conflictDetected) {
        setConflictResult({
          hasConflict: true,
          message: 'Legacy V1 monitoring agent process detected on workstation.',
        });
      } else {
        setConflictResult({
          hasConflict: false,
          message: 'No legacy V1 monitoring conflicts found. Workstation is ready.',
        });
      }
    }, 600);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-100 flex items-center gap-2">
            <HelpCircle className="w-5 h-5 text-indigo-400" />
            <span>Agent Diagnostics & Troubleshooting</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Self-serve checks for connectivity, legacy agent conflicts, and desktop telemetry health
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Diagnostic Action 1: Connectivity Check */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wifi className="w-4 h-4 text-indigo-400" />
              <span>Backend Connectivity Test</span>
            </CardTitle>
            <CardDescription>
              Verifies communication between your local agent and the V2 ingestion endpoints
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              variant="secondary"
              size="sm"
              icon={RefreshCw}
              onClick={runConnectivityCheck}
              disabled={testingConnection}
            >
              {testingConnection ? 'Pinging Ingestion API...' : 'Run Connectivity Check'}
            </Button>

            {connectionResult && (
              <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-300 space-y-1">
                <div className="flex items-center gap-1.5 font-semibold">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Connection Verified ({connectionResult.latencyMs}ms)</span>
                </div>
                <p className="text-[11px] text-slate-400">{connectionResult.message}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Diagnostic Action 2: V1 Conflict Check */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Laptop className="w-4 h-4 text-indigo-400" />
              <span>V1 Agent Conflict Diagnostic</span>
            </CardTitle>
            <CardDescription>
              Scans running processes for legacy Niyantran Employee Agent instances
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                icon={RefreshCw}
                onClick={runConflictCheck}
                disabled={testingConflict}
              >
                {testingConflict ? 'Scanning Processes...' : 'Check V1 Conflict'}
              </Button>

              {/* Toggle conflict state for testing */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConflictDetected(!conflictDetected)}
                className="text-[11px]"
              >
                {conflictDetected ? 'Clear Simulated Conflict' : 'Simulate Conflict'}
              </Button>
            </div>

            {conflictResult && (
              <div
                className={`p-3 rounded-lg border text-xs space-y-1 ${
                  conflictResult.hasConflict
                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                    : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
                }`}
              >
                <div className="flex items-center gap-1.5 font-semibold">
                  {conflictResult.hasConflict ? (
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  )}
                  <span>
                    {conflictResult.hasConflict
                      ? 'Coexistence Conflict Active'
                      : 'Conflict Scan Clean'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">{conflictResult.message}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Manual Handoff FAQ Card */}
      <Card>
        <CardHeader>
          <CardTitle>Safe Manual Handoff Instructions</CardTitle>
          <CardDescription>
            Steps to follow if the legacy V1 monitoring agent is currently running on your PC
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-xs text-slate-300">
          <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
            <span className="font-semibold text-slate-200 block">Why does V2 pause when V1 is active?</span>
            <p className="text-slate-400 text-xs leading-relaxed">
              To prevent duplicate activity metrics and eliminate system resource conflicts, V2 never runs simultaneously with V1. In accordance with zero-interference architecture, V2 never terminates V1 automatically.
            </p>
          </div>

          <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
            <span className="font-semibold text-slate-200 block">How to transition:</span>
            <ol className="list-decimal list-inside space-y-1 text-slate-400 text-xs">
              <li>Right-click the legacy Niyantran agent icon in your Windows notification tray.</li>
              <li>Select <strong>Exit</strong> or close the legacy agent window.</li>
              <li>Return to this page and click <strong>Check V1 Conflict</strong> above to verify clear status.</li>
            </ol>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default TroubleshootingPage;
