/**
 * NIYANTRAN EMPLOYEE MONITORING V2
 * Reusable Button Component
 */

import React from 'react';

const VARIANTS = {
  primary: 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm shadow-indigo-500/20 active:translate-y-px',
  secondary: 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 active:translate-y-px',
  outline: 'bg-transparent hover:bg-slate-800 text-slate-300 border border-slate-700 active:translate-y-px',
  danger: 'bg-rose-600 hover:bg-rose-500 text-white shadow-sm shadow-rose-500/20 active:translate-y-px',
  ghost: 'bg-transparent hover:bg-slate-800 text-slate-400 hover:text-slate-200',
  success: 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm shadow-emerald-500/20 active:translate-y-px',
};

const SIZES = {
  sm: 'px-2.5 py-1 text-xs',
  md: 'px-3.5 py-2 text-sm',
  lg: 'px-4.5 py-2.5 text-base',
};

export const Button = ({
  children,
  variant = 'secondary',
  size = 'md',
  className = '',
  disabled = false,
  icon: Icon = null,
  ...props
}) => {
  const variantClass = VARIANTS[variant] || VARIANTS.secondary;
  const sizeClass = SIZES[size] || SIZES.md;

  return (
    <button
      className={`inline-flex items-center justify-center gap-2 font-medium rounded-lg transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none ${variantClass} ${sizeClass} ${className}`}
      disabled={disabled}
      {...props}
    >
      {Icon && <Icon className="w-4 h-4 shrink-0" />}
      {children}
    </button>
  );
};

export default Button;
