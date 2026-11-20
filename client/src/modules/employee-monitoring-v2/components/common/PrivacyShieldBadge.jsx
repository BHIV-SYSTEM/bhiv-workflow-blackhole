/**
 * NIYANTRAN EMPLOYEE MONITORING V2
 * Privacy Shield Verification Badge
 */

import React from 'react';
import { ShieldCheck } from 'lucide-react';

export const PrivacyShieldBadge = ({ compact = false, className = '' }) => {
  if (compact) {
    return (
      <div
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-medium ${className}`}
      >
        <ShieldCheck className="w-3.5 h-3.5" />
        <span>Privacy-Protected (Zero OCR / No Keystrokes)</span>
      </div>
    );
  }

  return (
    <div
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 text-xs ${className}`}
    >
      <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
      <div>
        <span className="font-semibold text-slate-100">100% Privacy Enforced:</span>{' '}
        <span className="text-slate-300">Anonymized 60s Telemetry • Zero Screen Capture</span>
      </div>
    </div>
  );
};

export default PrivacyShieldBadge;
