/**
 * NIYANTRAN EMPLOYEE MONITORING V2
 * Minimal SVG Category Distribution Donut Chart
 */

import React from 'react';

export const CategoryDonut = ({ categories = [], size = 160, strokeWidth = 24 }) => {
  const total = categories.reduce((sum, c) => sum + c.percentage, 0) || 100;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  let accumulatedPercent = 0;

  return (
    <div className="flex flex-col sm:flex-row items-center gap-6 justify-center p-2">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="rotate-[-90deg]">
          {categories.map((cat, idx) => {
            const strokeDasharray = `${(cat.percentage / total) * circumference} ${circumference}`;
            const strokeDashoffset = -((accumulatedPercent / total) * circumference);
            accumulatedPercent += cat.percentage;

            return (
              <circle
                key={idx}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="transparent"
                stroke={cat.color}
                strokeWidth={strokeWidth}
                strokeDasharray={strokeDasharray}
                strokeDashoffset={strokeDashoffset}
                className="transition-all duration-500 hover:opacity-80"
              />
            );
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-xl font-bold text-slate-100">100%</span>
          <span className="text-[10px] text-slate-400 uppercase tracking-wider">Categorized</span>
        </div>
      </div>

      <div className="space-y-1.5 w-full max-w-[220px]">
        {categories.map((cat, idx) => (
          <div key={idx} className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
              <span className="text-slate-300 truncate">{cat.name}</span>
            </div>
            <span className="font-mono text-slate-400 font-medium">{cat.percentage}%</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default CategoryDonut;
