/**
 * NIYANTRAN EMPLOYEE MONITORING V2
 * Legacy V1 Agent Conflict Warning Banner
 */

import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import Button from '../ui/Button.jsx';

export const ConflictWarningBanner = ({ onRefresh, className = '' }) => {
  return (
    <div
      className={`p-4 rounded-xl border border-amber-500/40 bg-amber-950/30 text-amber-200 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${className}`}
    >
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-amber-500/20 text-amber-400 shrink-0">
          <AlertTriangle className="w-5 h-5" />
        </div>
        <div>
          <div className="font-semibold text-amber-100 text-sm">
            Legacy V1 Monitoring Agent Detected
          </div>
          <div className="text-amber-300/80 mt-0.5">
            A background V1 agent process was detected running. To prevent double telemetry logging, please terminate the legacy agent.
          </div>
        </div>
      </div>
      {onRefresh && (
        <Button
          variant="outline"
          size="sm"
          className="border-amber-500/40 text-amber-200 hover:bg-amber-500/20 shrink-0"
          onClick={onRefresh}
          icon={RefreshCw}
        >
          Re-Check Status
        </Button>
      )}
    </div>
  );
};

export default ConflictWarningBanner;
