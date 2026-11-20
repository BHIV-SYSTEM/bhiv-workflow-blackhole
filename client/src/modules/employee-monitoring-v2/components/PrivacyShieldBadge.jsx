/**
 * NIYANTRAN EMPLOYEE MONITORING V2
 * Privacy Shield Badge Component
 *
 * Visually confirms active privacy guarantees:
 * - Zero raw keystroke / sentence capture
 * - Zero screenshot / screen scraping
 * - Zero clipboard / filesystem inspection
 */

import React from 'react';
import { ShieldCheck, EyeOff, Lock } from 'lucide-react';

export const PrivacyShieldBadge = ({ compact = false, className = '' }) => {
  if (compact) {
    return (
      <div
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 ${className}`}
        title="Privacy First: No keystroke text capture or visual screenshots"
      >
        <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
        <span>Privacy Shield Active</span>
      </div>
    );
  }

  return (
    <div
      className={`rounded-lg border border-emerald-500/20 bg-emerald-950/20 p-4 text-emerald-200 text-sm ${className}`}
    >
      <div className="flex items-center gap-2 mb-2 font-semibold text-emerald-400">
        <ShieldCheck className="w-5 h-5" />
        <span>Employee Privacy-First Architecture</span>
      </div>
      <ul className="space-y-1 text-xs text-emerald-300/80">
        <li className="flex items-center gap-1.5">
          <EyeOff className="w-3.5 h-3.5 text-emerald-400" />
          <span>Zero screen recording or display scraping</span>
        </li>
        <li className="flex items-center gap-1.5">
          <Lock className="w-3.5 h-3.5 text-emerald-400" />
          <span>Zero raw keystroke or typed sentence logging</span>
        </li>
        <li className="flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span>Activity telemetry aggregated into 60-second summary counts</span>
        </li>
      </ul>
    </div>
  );
};

export default PrivacyShieldBadge;
