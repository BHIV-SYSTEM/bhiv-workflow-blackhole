/**
 * NIYANTRAN EMPLOYEE MONITORING V2
 * Employee Workspace — Main Work Session Page
 */

import React, { useState } from 'react';
import { useMonitoringV2Context } from '../../context/MonitoringV2Context.jsx';
import MockDataService from '../../services/mockDataService.js';
import Card, { CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Modal from '../../components/ui/Modal.jsx';
import TimelineHeatmap from '../../components/charts/TimelineHeatmap.jsx';
import PrivacyShieldBadge from '../../components/common/PrivacyShieldBadge.jsx';
import ConflictWarningBanner from '../../components/common/ConflictWarningBanner.jsx';
import {
  Play,
  Pause,
  Square,
  Clock,
  Laptop,
  Smartphone,
  ShieldCheck,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';

export const WorkSessionPage = () => {
  const {
    employeeSession,
    handleStartSession,
    handlePauseSession,
    handleResumeSession,
    handleEndSession,
    setIsDeviceSwitcherOpen,
    conflictDetected,
    setConflictDetected,
  } = useMonitoringV2Context();

  const [pauseModalOpen, setPauseModalOpen] = useState(false);
  const [pauseReason, setPauseReason] = useState('Lunch Break');
  const [actionNotice, setActionNotice] = useState(null);

  const timeline = MockDataService.getPersonalTimeline();
  const isActive = employeeSession.status === 'ACTIVE';
  const isPaused = employeeSession.status === 'PAUSED';

  const onStart = () => {
    handleStartSession(employeeSession.currentDeviceMode);
    setActionNotice('Work session started (local demo state). Desktop telemetry activated.');
    setTimeout(() => setActionNotice(null), 3000);
  };

  const onConfirmPause = () => {
    handlePauseSession(pauseReason);
    setPauseModalOpen(false);
    setActionNotice(`Session paused for: ${pauseReason}`);
    setTimeout(() => setActionNotice(null), 3000);
  };

  const onResume = () => {
    handleResumeSession();
    setActionNotice('Work session resumed.');
    setTimeout(() => setActionNotice(null), 3000);
  };

  const onEnd = () => {
    handleEndSession();
    setActionNotice('Work session ended for today.');
    setTimeout(() => setActionNotice(null), 3000);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Notice */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-100">
            Work Session Control
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Transparent session management for your active workstation
          </p>
        </div>
        <PrivacyShieldBadge compact />
      </div>

      {actionNotice && (
        <div className="p-3 rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-indigo-400" />
          <span>{actionNotice}</span>
        </div>
      )}

      {conflictDetected && (
        <ConflictWarningBanner onRefresh={() => setConflictDetected(false)} />
      )}

      {/* Primary Session Card */}
      <Card className="border-indigo-500/20 bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950/20">
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            {/* Status & Timer */}
            <div className="space-y-2">
              <div className="flex items-center gap-2.5">
                <Badge
                  variant={isActive ? 'success' : isPaused ? 'warning' : 'neutral'}
                  className="text-xs px-3 py-1 font-semibold"
                >
                  <span className="w-2 h-2 rounded-full bg-current animate-pulse inline-block" />
                  <span>SESSION {employeeSession.status}</span>
                </Badge>
                {employeeSession.pauseReason && (
                  <span className="text-xs text-amber-300">
                    ({employeeSession.pauseReason})
                  </span>
                )}
              </div>

              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-extrabold tracking-tight text-slate-100 font-mono">
                  {Math.floor(employeeSession.totalActiveMinutes / 60)}h{' '}
                  {employeeSession.totalActiveMinutes % 60}m
                </span>
                <span className="text-xs text-slate-400">active focused today</span>
              </div>

              <p className="text-xs text-slate-400">
                Started at <span className="text-slate-200 font-mono">{employeeSession.startTime}</span> • Active Device:{' '}
                <span className="text-indigo-400 font-semibold">{employeeSession.activeDevice?.name}</span>
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center gap-3">
              {!isActive && !isPaused && (
                <Button
                  variant="primary"
                  size="md"
                  icon={Play}
                  onClick={onStart}
                  className="bg-emerald-600 hover:bg-emerald-500"
                >
                  Start Work
                </Button>
              )}

              {isActive && (
                <>
                  <Button
                    variant="outline"
                    size="md"
                    icon={Pause}
                    onClick={() => setPauseModalOpen(true)}
                  >
                    Pause Work
                  </Button>
                  <Button
                    variant="danger"
                    size="md"
                    icon={Square}
                    onClick={onEnd}
                  >
                    End Work
                  </Button>
                </>
              )}

              {isPaused && (
                <>
                  <Button
                    variant="primary"
                    size="md"
                    icon={Play}
                    onClick={onResume}
                    className="bg-emerald-600 hover:bg-emerald-500"
                  >
                    Resume Work
                  </Button>
                  <Button
                    variant="danger"
                    size="md"
                    icon={Square}
                    onClick={onEnd}
                  >
                    End Work
                  </Button>
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Device & Agent Status Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/40 space-y-1">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Agent Connectivity
          </span>
          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
            <CheckCircle2 className="w-4 h-4" />
            <span>Agent v2.0.0 Connected</span>
          </div>
          <p className="text-[11px] text-slate-500">Local loopback telemetry sync active</p>
        </div>

        <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/40 space-y-1">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Current Device Mode
          </span>
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
            {employeeSession.currentDeviceMode === 'PHONE' ? (
              <Smartphone className="w-4 h-4 text-sky-400" />
            ) : (
              <Laptop className="w-4 h-4 text-indigo-400" />
            )}
            <span>{employeeSession.currentDeviceMode === 'PHONE' ? 'Phone (Mobile PWA)' : 'Laptop / PC'}</span>
          </div>
          <button
            type="button"
            onClick={() => setIsDeviceSwitcherOpen(true)}
            className="text-[11px] text-indigo-400 hover:text-indigo-300 underline font-medium cursor-pointer"
          >
            Switch Device
          </button>
        </div>

        <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/40 space-y-1">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Privacy Shield
          </span>
          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
            <ShieldCheck className="w-4 h-4" />
            <span>Screen & Text Capture Blocked</span>
          </div>
          <p className="text-[11px] text-slate-500">Aggregates only (60s counts)</p>
        </div>
      </div>

      {/* Today's Activity Timeline */}
      <Card>
        <CardHeader>
          <CardTitle>Your Activity Timeline Today</CardTitle>
          <CardDescription>
            Transparent view of your personal 5-minute activity aggregates
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TimelineHeatmap timeline={timeline} />
        </CardContent>
      </Card>

      {/* Pause Reason Modal */}
      <Modal
        isOpen={pauseModalOpen}
        onClose={() => setPauseModalOpen(false)}
        title="Pause Work Session"
        description="Select a reason for taking a break (up to 60 minutes allocated daily)"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setPauseModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={onConfirmPause}>
              Confirm Pause
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <label className="text-xs font-semibold text-slate-300 block">Pause Reason:</label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {['Lunch Break', 'Short Rest / Coffee', 'Personal / Errands'].map((reason) => (
              <button
                key={reason}
                type="button"
                onClick={() => setPauseReason(reason)}
                className={`p-2.5 rounded-lg border text-xs text-left font-medium transition-all cursor-pointer ${
                  pauseReason === reason
                    ? 'border-indigo-500 bg-indigo-500/15 text-indigo-200'
                    : 'border-slate-800 bg-slate-900 text-slate-400 hover:border-slate-700'
                }`}
              >
                {reason}
              </button>
            ))}
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default WorkSessionPage;
