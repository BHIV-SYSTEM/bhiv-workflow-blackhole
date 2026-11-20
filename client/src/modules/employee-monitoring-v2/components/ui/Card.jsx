/**
 * NIYANTRAN EMPLOYEE MONITORING V2
 * Reusable Card Components
 */

import React from 'react';

export const Card = ({ children, className = '', ...props }) => (
  <div
    className={`rounded-xl border border-slate-800 bg-slate-900/60 backdrop-blur-sm shadow-sm transition-colors ${className}`}
    {...props}
  >
    {children}
  </div>
);

export const CardHeader = ({ children, className = '', ...props }) => (
  <div className={`p-5 pb-3 flex flex-col gap-1.5 ${className}`} {...props}>
    {children}
  </div>
);

export const CardTitle = ({ children, className = '', ...props }) => (
  <h3 className={`text-base font-semibold text-slate-100 tracking-tight ${className}`} {...props}>
    {children}
  </h3>
);

export const CardDescription = ({ children, className = '', ...props }) => (
  <p className={`text-xs text-slate-400 leading-relaxed ${className}`} {...props}>
    {children}
  </p>
);

export const CardContent = ({ children, className = '', ...props }) => (
  <div className={`p-5 pt-2 ${className}`} {...props}>
    {children}
  </div>
);

export const CardFooter = ({ children, className = '', ...props }) => (
  <div className={`p-5 pt-0 border-t border-slate-800/60 flex items-center justify-between ${className}`} {...props}>
    {children}
  </div>
);

export default Card;
