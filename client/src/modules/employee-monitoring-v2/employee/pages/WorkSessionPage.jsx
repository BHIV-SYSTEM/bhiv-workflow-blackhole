/**
 * NIYANTRAN EMPLOYEE MONITORING V2
 * Employee Workspace — Main Work Session Page
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../../../lib/api';
import { useMonitoringV2Context } from '../../context/MonitoringV2Context.jsx';
import { useAgentDetection } from '../../hooks/useAgentDetection.js';
import { downloadAgentInstaller } from '../../services/installerDownload.js';
import monitoringV2Api from '../../services/monitoringV2Api.js';
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
  Download,
  ExternalLink,
  AlertTriangle,
  Activity,
  Layers,
  Monitor,
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

  const {
    isAgentRunning,
    agentStatus,
    isChecking,
    checkAgent,
    openMiniWindow,
  } = useAgentDetection();

  const [pauseModalOpen, setPauseModalOpen] = useState(false);
  const [pauseReason, setPauseReason] = useState('Lunch Break');
  const [actionNotice, setActionNotice] = useState(null);
  const navigate = useNavigate();
  const [isDownloadingAgent, setIsDownloadingAgent] = useState(false);

  // Workday Attendance Synchronization (Milestone 3 - F10, F11, F12)
  const [workdayAttendance, setWorkdayAttendance] = useState({
    dayStarted: false,
    dayEndedToday: false,
    startTime: null,
    monitoringConsent: false,
    monitoringStatus: 'Disconnected / Not Monitored'
  });

  const fetchWorkdayStatus = useCallback(async () => {
    try {
      const res = await api.get('/attendance/status');
      if (res) {
        setWorkdayAttendance({
          dayStarted: res.dayStarted ?? false,
          dayEndedToday: res.dayEndedToday ?? false,
          startTime: res.startTime ?? null,
          monitoringConsent: res.monitoringConsent ?? false,
          monitoringStatus: res.monitoringStatus ?? 'Disconnected / Not Monitored'
        });
      }
    } catch {
      // Non-fatal
    }
  }, []);

  useEffect(() => {
    fetchWorkdayStatus();
    const handleAttendanceChange = () => fetchWorkdayStatus();
    window.addEventListener('attendance-updated', handleAttendanceChange);
    window.addEventListener('monitoring-session-state', handleAttendanceChange);
    return () => {
      window.removeEventListener('attendance-updated', handleAttendanceChange);
      window.removeEventListener('monitoring-session-state', handleAttendanceChange);
    };
  }, [fetchWorkdayStatus]);

  // 60-Second Renewable Lease Countdown
  const [remainingLeaseSeconds, setRemainingLeaseSeconds] = useState(0);

  useEffect(() => {
    if (!employeeSession.leaseExpiresAt || employeeSession.status !== 'ACTIVE') {
      setRemainingLeaseSeconds(0);
      return;
    }

    const updateCountdown = () => {
      const expires = new Date(employeeSession.leaseExpiresAt).getTime();
      const diff = Math.max(0, Math.floor((expires - Date.now()) / 1000));
      setRemainingLeaseSeconds(diff);
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [employeeSession.leaseExpiresAt, employeeSession.status]);

  const handleDownloadAgent = async (format = 'exe') => {
    setIsDownloadingAgent(true);
    try {
      const result = await downloadAgentInstaller(format);
      setActionNotice(`Downloaded ${result.fileName} successfully!`);
      setTimeout(() => setActionNotice(null), 4000);
    } catch (err) {
      console.error('Download error:', err);
      alert(err.message || 'Download failed');
    } finally {
      setIsDownloadingAgent(false);
    }
  };

  const [timeline, setTimeline] = useState([]);

  useEffect(() => {
    let isMounted = true;
    const fetchTimeline = async () => {
      try {
        const res = await monitoringV2Api.getDailyTimeline();
        if (isMounted && res?.data?.timeline) {
          setTimeline(res.data.timeline);
        }
      } catch {
        if (isMounted) setTimeline([]);
      }
    };
    fetchTimeline();
    return () => {
      isMounted = false;
    };
  }, [employeeSession.sessionId, employeeSession.status]);
  const isActive = employeeSession.status === 'ACTIVE';
  const isPaused = employeeSession.status === 'PAUSED';
  const isLaptopMode = employeeSession.currentDeviceMode === 'LAPTOP_PC';

  const onStart = async () => {
    const deviceId = agentStatus?.deviceId && agentStatus.deviceId !== 'UNPAIRED'
      ? agentStatus.deviceId
      : employeeSession.activeDevice?.id;
    await handleStartSession(employeeSession.currentDeviceMode, deviceId);
    setActionNotice('Work session started. Desktop telemetry activated.');
    setTimeout(() => setActionNotice(null), 3000);
  };

  const onConfirmPause = async () => {
    await handlePauseSession(pauseReason);
    setPauseModalOpen(false);
    setActionNotice(`Session paused for: ${pauseReason}`);
    setTimeout(() => setActionNotice(null), 3000);
  };

  const onResume = async () => {
    await handleResumeSession();
    setActionNotice('Work session resumed.');
    setTimeout(() => setActionNotice(null), 3000);
  };

  const onEnd = async () => {
    await handleEndSession();
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
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            icon={Layers}
            onClick={openMiniWindow}
            className="text-indigo-400 border-indigo-500/30 hover:bg-indigo-500/10 text-xs"
          >
            Mini Desktop Window
          </Button>
          <PrivacyShieldBadge compact />
        </div>
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

      {/* Permanent Desktop Agent Toolbar (Always Visible Regardless of Agent Status) */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl border border-slate-800 bg-slate-900/60 text-xs shadow-sm">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-purple-600/20 border border-purple-500/30 flex items-center justify-center text-purple-400">
            <Monitor className="w-4 h-4" />
          </div>
          <div>
            <span className="font-semibold text-slate-200 mr-2">Windows Desktop Agent</span>
            <Badge
              variant="outline"
              className={`text-[10px] ${
                isAgentRunning
                  ? 'border-emerald-500/40 text-emerald-300 bg-emerald-950/40'
                  : 'border-amber-500/40 text-amber-300 bg-amber-950/40'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full mr-1.5 inline-block ${isAgentRunning ? 'bg-emerald-400' : 'bg-amber-400'}`} />
              {isChecking ? 'Checking...' : isAgentRunning ? 'Connected (Port 48120)' : 'Offline'}
            </Badge>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            id="btn-worksession-download-agent"
            size="sm"
            onClick={() => handleDownloadAgent('exe')}
            disabled={isDownloadingAgent}
            className="bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs h-8"
          >
            <Download className="w-3.5 h-3.5 mr-1.5" />
            {isDownloadingAgent ? 'Downloading...' : 'Download Agent (.exe)'}
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => handleDownloadAgent('zip')}
            disabled={isDownloadingAgent}
            className="border-slate-700 hover:bg-slate-800 text-slate-300 text-xs h-8"
          >
            Download (.zip)
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/desktop-agent')}
            className="border-purple-500/30 hover:bg-purple-500/10 text-purple-300 text-xs h-8"
          >
            Agent Hub & Instructions
          </Button>

          {isAgentRunning && (
            <a
              href="http://127.0.0.1:48120/mini"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center text-xs text-purple-400 hover:text-purple-300 underline font-medium ml-1"
            >
              <ExternalLink className="w-3.5 h-3.5 mr-1" />
              Open Mini Window
            </a>
          )}
        </div>
      </div>

      {/* Desktop Agent Required Notice (if PC mode and agent offline) */}
      {isLaptopMode && !isAgentRunning && !isChecking && (
        <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-200 space-y-3">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-amber-200">
                Niyantran Desktop Agent Required for PC Monitoring
              </h3>
              <p className="text-xs text-amber-300/80">
                To track foreground application metrics and verify session leases, the privacy-preserving Niyantran V2 Desktop Agent must be running on this workstation (port 48120).
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 pl-8">
            <Button
              size="sm"
              onClick={() => handleDownloadAgent('exe')}
              disabled={isDownloadingAgent}
              className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs"
            >
              <Download className="w-3.5 h-3.5 mr-1.5" />
              <span>Download Agent Installer (.exe)</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleDownloadAgent('zip')}
              disabled={isDownloadingAgent}
              className="border-amber-500/40 text-amber-300 hover:bg-amber-500/10 font-semibold text-xs"
            >
              <span>Download (.zip)</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={checkAgent}
              className="text-xs border-amber-500/40 text-amber-300 hover:bg-amber-500/10"
            >
              <RefreshCw className="w-3.5 h-3.5 mr-1" />
              Re-check Agent
            </Button>
            <button
              type="button"
              onClick={() => setIsDeviceSwitcherOpen(true)}
              className="text-xs text-amber-300 underline hover:text-amber-200 ml-2 font-medium cursor-pointer"
            >
              Or switch to Phone mode
            </button>
          </div>
        </div>
      )}

      {/* Attendance Not Started Warning (Milestone 3 - F10, F11) */}
      {!workdayAttendance.dayStarted && (
        <div className="p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-200 text-xs flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>Workday attendance is not started. Please punch in on the Attendance Dashboard to record official hours.</span>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => navigate('/start-day')}
            className="border-amber-500/40 text-amber-300 hover:bg-amber-500/10 text-xs whitespace-nowrap"
          >
            Go to Start Day
          </Button>
        </div>
      )}

      {/* Primary Session Card */}
      <Card className="border-indigo-500/20 bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950/20">
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            {/* Status & Timer */}
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2.5">
                {/* Unified Workday Status Badge */}
                <Badge
                  variant={workdayAttendance.dayStarted ? 'default' : 'neutral'}
                  className={`text-xs px-2.5 py-1 ${
                    workdayAttendance.dayStarted 
                      ? 'border-emerald-500/40 text-emerald-300 bg-emerald-950/40' 
                      : 'border-slate-700 text-slate-400 bg-slate-900/60'
                  }`}
                >
                  {workdayAttendance.dayStarted ? 'Workday Active' : 'Workday Not Started'}
                </Badge>

                {/* Monitoring Session State Badge */}
                <Badge
                  variant={isActive && isAgentRunning && remainingLeaseSeconds > 0 ? 'success' : isPaused ? 'warning' : 'neutral'}
                  className="text-xs px-3 py-1 font-semibold"
                >
                  <span className="w-2 h-2 rounded-full bg-current animate-pulse inline-block" />
                  <span>
                    {workdayAttendance.dayStarted && (!isAgentRunning || remainingLeaseSeconds === 0)
                      ? 'Disconnected / Not Monitored'
                      : `SESSION ${employeeSession.status}`}
                  </span>
                </Badge>

                {/* 60-Second Renewable Lease Countdown */}
                {isActive && (
                  <Badge
                    variant="default"
                    className={`font-mono text-xs px-2.5 py-1 ${
                      remainingLeaseSeconds > 15
                        ? 'border-emerald-500/40 text-emerald-300 bg-emerald-950/40'
                        : remainingLeaseSeconds > 0
                        ? 'border-amber-500/40 text-amber-300 bg-amber-950/40 animate-pulse'
                        : 'border-rose-500/40 text-rose-300 bg-rose-950/40'
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full mr-1.5 inline-block ${
                      remainingLeaseSeconds > 15 ? 'bg-emerald-400' : remainingLeaseSeconds > 0 ? 'bg-amber-400' : 'bg-rose-400'
                    }`} />
                    {remainingLeaseSeconds > 0 ? `Lease: ${remainingLeaseSeconds}s remaining (Renewable)` : 'Lease Expired'}
                  </Badge>
                )}

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
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Agent Connectivity
            </span>
            <button
              type="button"
              onClick={checkAgent}
              className="text-slate-500 hover:text-slate-300 p-0.5 rounded cursor-pointer"
              title="Refresh Agent Status"
            >
              <RefreshCw className={`w-3 h-3 ${isChecking ? 'animate-spin' : ''}`} />
            </button>
          </div>
          {isAgentRunning ? (
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
                <CheckCircle2 className="w-4 h-4" />
                <span>Agent v{agentStatus?.agentVersion || '2.0.0'} Connected</span>
              </div>
              <p className="text-[11px] text-slate-400">
                Active App: <span className="text-slate-200 font-medium">{agentStatus?.currentApp || 'Desktop'}</span> ({agentStatus?.currentCategory || 'NEUTRAL'})
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs font-semibold text-amber-400">
                <AlertTriangle className="w-4 h-4" />
                <span>Agent Offline (Port 48120)</span>
              </div>
              <p className="text-[11px] text-slate-500">Launch desktop agent to sync live metrics</p>
            </div>
          )}
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
            Switch Device Mode
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
          <p className="text-[11px] text-slate-500">Aggregates only (60s Win32 duration counts)</p>
        </div>
      </div>

      {/* Today's Activity Timeline */}
      <Card>
        <CardHeader>
          <CardTitle>Your Activity Timeline Today</CardTitle>
          <CardDescription>
            Transparent view of your personal activity aggregates
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
                    ? 'border-indigo-500 bg-indigo-500/10 text-indigo-300'
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
