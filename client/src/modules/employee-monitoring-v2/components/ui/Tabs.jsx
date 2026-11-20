/**
 * NIYANTRAN EMPLOYEE MONITORING V2
 * Clean Segmented Control Tabs Component
 */

import React from 'react';

export const Tabs = ({ options = [], activeValue, onChange, className = '' }) => {
  return (
    <div className={`inline-flex items-center rounded-lg bg-slate-900 border border-slate-800 p-1 text-xs font-medium text-slate-400 ${className}`}>
      {options.map((opt) => {
        const isSelected = activeValue === opt.value;
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={`px-3 py-1.5 rounded-md transition-all cursor-pointer ${
              isSelected
                ? 'bg-slate-800 text-slate-100 shadow-sm font-semibold'
                : 'hover:text-slate-200 hover:bg-slate-800/40'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
};

export default Tabs;
