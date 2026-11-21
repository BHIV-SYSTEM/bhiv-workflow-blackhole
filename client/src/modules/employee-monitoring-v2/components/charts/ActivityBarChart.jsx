/**
 * NIYANTRAN EMPLOYEE MONITORING V2
 * Minimal Responsive SVG Activity Bar Chart
 */

import React from 'react';

export const ActivityBarChart = ({ data = [], height = 180 }) => {
  if (!data || data.length === 0) return null;

  const maxValue = Math.max(...data.map((d) => (d.active || 0) + (d.idle || 0)), 40);

  return (
    <div className="w-full space-y-2">
      <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
        <span className="font-medium">Hourly Telemetry Distribution</span>
        <div className="flex items-center gap-4 text-[11px]">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-indigo-500 inline-block" /> Active
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-amber-500/80 inline-block" /> Idle
          </span>
        </div>
      </div>

      <div className="w-full flex items-end gap-2 pt-4 px-2" style={{ height: `${height}px` }}>
        {data.map((item, idx) => {
          const activeHeight = ((item.active || 0) / maxValue) * (height - 30);
          const idleHeight = ((item.idle || 0) / maxValue) * (height - 30);

          return (
            <div key={idx} className="flex-1 flex flex-col items-center gap-1 h-full justify-end group">
              {/* Tooltip on hover */}
              <div className="text-[10px] text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity mb-1 whitespace-nowrap">
                {item.active}a / {item.idle}i
              </div>

              {/* Stacked bar */}
              <div className="w-full max-w-[28px] rounded-t-sm flex flex-col justify-end overflow-hidden bg-slate-800/40">
                <div
                  style={{ height: `${idleHeight}px` }}
                  className="w-full bg-amber-500/80 transition-all hover:brightness-110"
                  title={`Idle: ${item.idle}`}
                />
                <div
                  style={{ height: `${activeHeight}px` }}
                  className="w-full bg-indigo-500 transition-all hover:brightness-110"
                  title={`Active: ${item.active}`}
                />
              </div>

              {/* X-axis label */}
              <span className="text-[10px] text-slate-500 group-hover:text-slate-300 font-mono mt-1">
                {item.time}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ActivityBarChart;
