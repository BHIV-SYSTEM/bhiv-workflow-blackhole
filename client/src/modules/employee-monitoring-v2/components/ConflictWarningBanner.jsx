/**
 * NIYANTRAN EMPLOYEE MONITORING V2
 * Conflict Warning Banner Component
 *
 * Displays when a legacy V1 agent is actively running.
 * Enforces non-interference: V2 refuses collection and informs user of manual handoff.
 */

import React from 'react';
import { AlertTriangle, Info } from 'lucide-react';

export const ConflictWarningBanner = ({ onRefresh, className = '' }) => {
  return (
    <div
      className={`rounded-lg border border-amber-500/30 bg-amber-950/20 p-4 text-amber-200 text-sm ${className}`}
      role="alert"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-400 mt-0.5 shrink-0" />
        <div className="space-y-2">
          <div className="font-semibold text-amber-300">
            Coexistence Conflict Detected: Legacy V1 Monitoring Agent Running
          </div>
          <p className="text-xs text-amber-200/80 leading-relaxed">
            Niyantran Employee Monitoring V2 has detected that the legacy monitoring agent (V1) is currently running on this workstation.
            To guarantee zero interference and prevent duplicated activity counting, V2 has automatically paused telemetry collection.
          </p>
          <div className="rounded bg-amber-900/40 p-2.5 text-xs text-amber-100 flex items-start gap-2 border border-amber-500/20">
            <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-medium">Manual Safe Handoff: </span>
              To transition this device to V2, right-click the legacy Niyantran agent icon in your system tray and select "Exit", or close the legacy agent window. Once closed, click below to verify.
            </div>
          </div>
          {onRefresh && (
            <button
              onClick={onRefresh}
              className="mt-1 px-3 py-1.5 text-xs font-medium rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/40 transition-colors cursor-pointer"
            >
              Re-check Agent Status
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ConflictWarningBanner;
