/**
 * NIYANTRAN EMPLOYEE MONITORING V2
 * Reusable Badge Component
 */

import React from 'react';

const VARIANTS = {
  default: 'bg-slate-800 text-slate-300 border-slate-700',
  success: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  warning: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  danger: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
  info: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
  purple: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
  neutral: 'bg-slate-900 text-slate-400 border-slate-800',
};

export const Badge = ({ children, variant = 'default', className = '', ...props }) => {
  const variantClass = VARIANTS[variant] || VARIANTS.default;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${variantClass} ${className}`}
      {...props}
    >
      {children}
    </span>
  );
};

export default Badge;
