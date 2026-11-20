/**
 * NIYANTRAN EMPLOYEE MONITORING V2
 * Employee Mini Desktop Window (React Component)
 *
 * Dedicated floating window for quick desktop status, mode display,
 * active foreground app verification, and session control.
 */

import React, { useState, useEffect } from 'react';
import { useAgentDetection } from '../hooks/useAgentDetection.js';
import monitoringV2Api from '../services/monitoringV2Api.js';
import {
  Play,
  Pause,
  Square,
  ShieldCheck,
  Laptop,
  Smartphone,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Layers,
} from 'lucide-react';

const LOCAL_AGENT_URL = 'http://127.0.0.1:48120';

export const MiniWindowPage = () => {
  const { isAgentRunning, agentStatus, isChecking, checkAgent } = useAgentDetection();

  const [session, setSession] = useState({
    state: 'IDLE_WAITING_AUTH',
    mode: 'LAPTOP_PC',
    sessionId: null,
    startedAt: null,
    activeMinutes: 0,
  });
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [actionLoading, setActionLoading] = useState(false);

  // Sync session state from backend
  const fetchSession = async () => {
    try {
      const res = await monitoringV2Api.getCurrentSession();
      if (res?.data?.session) {
        const s = res.data.session;
        setSession({
          state: s.state,
          mode: s.mode,
          sessionId: s.session_id,
          startedAt: s.started_at,
          activeMinutes: Math.round((s.accumulated_seconds?.active || 0) / 60),
        });
      }
    } catch {
      // Retain previous session state
    }
  };

  useEffect(() => {
    fetchSession();
    const interval = setInterval(fetchSession, 5000);
    return () => clearInterval(interval);
  }, []);

  // Timer tick
  useEffect(() => {
    if (session.state === 'ACTIVE' || agentStatus?.sessionState === 'ACTIVE_MONITORING') {
      const timer = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [session.state, agentStatus?.sessionState]);

  // Action handlers calling loopback agent first, then backend
  const handleAction = async (action) => {
    setActionLoading(true);
    try {
      if (isAgentRunning) {
        await fetch(`${LOCAL_AGENT_URL}/session/${action.toLowerCase()}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: session.sessionId }),
        });
      }

      if (action === 'START') {
        const res = await monitoringV2Api.startSession({ mode: session.mode, deviceId: agentStatus?.deviceId });
        if (res?.data?.sessionId) {
          setSession((prev) => ({ ...prev, sessionId: res.data.sessionId, state: 'ACTIVE' }));
        }
      } else if (action === 'PAUSE' && session.sessionId) {
        await monitoringV2Api.pauseSession(session.sessionId, { reason: 'Mini window pause' });
        setSession((prev) => ({ ...prev, state: 'PAUSED' }));
      } else if (action === 'RESUME' && session.sessionId) {
        await monitoringV2Api.resumeSession(session.sessionId);
        setSession((prev) => ({ ...prev, state: 'ACTIVE' }));
      } else if (action === 'END' && session.sessionId) {
        await monitoringV2Api.endSession(session.sessionId);
        setSession((prev) => ({ ...prev, state: 'COMPLETED' }));
      }
      await checkAgent();
    } catch (err) {
      console.warn('[MiniWindow] Action error:', err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const isMonitoringActive = agentStatus?.sessionState === 'ACTIVE_MONITORING' || session.state === 'ACTIVE';
  const isMonitoringPaused = session.state === 'PAUSED';

  const formatTimer = (totalSec) => {
    const h = String(Math.floor(totalSec / 3600)).padStart(2, '0');
    const m = String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0');
    const s = String(totalSec % 60).padStart(2, '0');
    return `${h}:${m}:${s}`;
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans select-none p-4">
      {/* Mini Window Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-indigo-600 flex items-center justify-center font-bold text-white text-xs">
            N
          </div>
          <div>
            <h1 className="text-xs font-bold tracking-tight text-slate-200">Niyantran V2</h1>
            <p className="text-[10px] text-slate-400">Mini Desktop Monitor</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <span className={`inline-block w-2 h-2 rounded-full ${isAgentRunning ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
          <span className="text-[10px] text-slate-400 font-medium">
            {isAgentRunning ? 'AGENT ONLINE' : 'OFFLINE'}
          </span>
          <button
            type="button"
            onClick={checkAgent}
            className="text-slate-500 hover:text-slate-300 p-1 ml-1 cursor-pointer"
            title="Refresh Status"
          >
            <RefreshCw className={`w-3 h-3 ${isChecking ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Main Body */}
      <div className="py-4 space-y-4 flex-1">
        {/* Timer Card */}
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 text-center space-y-1">
          <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">
            Active Session Time
          </span>
          <div className="text-3xl font-mono font-extrabold text-indigo-400">
            {formatTimer(elapsedSeconds)}
          </div>
          <div className="flex items-center justify-center gap-2 text-[11px] text-slate-400">
            <span className="capitalize font-semibold text-slate-200">
              {isMonitoringActive ? 'Active Monitoring' : isMonitoringPaused ? 'Paused' : 'Waiting for Auth'}
            </span>
            <span>•</span>
            <span className="font-mono text-indigo-300">
              {session.mode === 'PHONE' ? 'Mobile Phone' : 'Windows PC'}
            </span>
          </div>
        </div>

        {/* Live Detected App Card */}
        <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-2">
          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span className="font-medium">Foreground App</span>
            <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 font-semibold border border-indigo-500/20">
              {agentStatus?.currentCategory || 'NEUTRAL'}
            </span>
          </div>
          <div className="text-sm font-semibold text-slate-100 truncate">
            {agentStatus?.currentApp || (isAgentRunning ? 'Desktop / Background' : 'Agent offline')}
          </div>
          <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1 border-t border-slate-800/60">
            <span>Idle Time: {agentStatus?.hardwareIdleSeconds || 0}s</span>
            <span>Device: {agentStatus?.deviceId?.slice(0, 14) || 'DEV-LOCAL'}</span>
          </div>
        </div>

        {/* Privacy Invariant Banner */}
        <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-[11px] flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>Privacy Guaranteed: 0 Screenshots, 0 Key Logs.</span>
        </div>
      </div>

      {/* Footer Controls */}
      <div className="pt-3 border-t border-slate-800 flex items-center gap-2">
        {!isMonitoringActive && !isMonitoringPaused && (
          <button
            type="button"
            disabled={actionLoading}
            onClick={() => handleAction('START')}
            className="flex-1 py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
          >
            <Play className="w-3.5 h-3.5" />
            <span>Start Session</span>
          </button>
        )}

        {isMonitoringActive && (
          <>
            <button
              type="button"
              disabled={actionLoading}
              onClick={() => handleAction('PAUSE')}
              className="flex-1 py-2 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
            >
              <Pause className="w-3.5 h-3.5 text-amber-400" />
              <span>Pause</span>
            </button>
            <button
              type="button"
              disabled={actionLoading}
              onClick={() => handleAction('END')}
              className="py-2 px-3 rounded-lg bg-red-600/20 hover:bg-red-600/30 text-red-300 border border-red-500/30 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
            >
              <Square className="w-3.5 h-3.5 text-red-400" />
              <span>End</span>
            </button>
          </>
        )}

        {isMonitoringPaused && (
          <>
            <button
              type="button"
              disabled={actionLoading}
              onClick={() => handleAction('RESUME')}
              className="flex-1 py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Resume</span>
            </button>
            <button
              type="button"
              disabled={actionLoading}
              onClick={() => handleAction('END')}
              className="py-2 px-3 rounded-lg bg-red-600/20 hover:bg-red-600/30 text-red-300 border border-red-500/30 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
            >
              <Square className="w-3.5 h-3.5 text-red-400" />
              <span>End</span>
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default MiniWindowPage;
