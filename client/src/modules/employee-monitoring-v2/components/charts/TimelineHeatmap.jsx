/**
 * NIYANTRAN EMPLOYEE MONITORING V2
 * 60-Second Telemetry Timeline Heatmap Component
 */

import React from 'react';

const CATEGORY_COLORS = {
  DEVELOPMENT: 'bg-indigo-500',
  DOCUMENTATION: 'bg-emerald-500',
  COMMUNICATION: 'bg-sky-500',
  SUPPORT: 'bg-amber-500',
  NEUTRAL: 'bg-slate-700',
};

export const TimelineHeatmap = ({ timeline = [] }) => {
  if (!timeline || timeline.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span className="font-medium">Aggregated 5-Minute Bucket Timeline</span>
        <div className="flex items-center gap-3 text-[11px]">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded bg-indigo-500" /> Dev
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded bg-sky-500" /> Comm
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded bg-emerald-500" /> Docs
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded bg-slate-700" /> Neutral / Idle
          </span>
        </div>
      </div>

      <div className="grid grid-cols-5 md:grid-cols-10 gap-2 p-3 rounded-lg border border-slate-800 bg-slate-900/40">
        {timeline.map((bucket, index) => {
          const colorClass = CATEGORY_COLORS[bucket.category] || 'bg-slate-700';
          const activePercent = Math.round((bucket.activeSeconds / (bucket.activeSeconds + bucket.idleSeconds)) * 100);

          return (
            <div
              key={index}
              className="flex flex-col items-center gap-1 p-2 rounded-md bg-slate-800/40 border border-slate-700/30 hover:border-slate-600 transition-all cursor-pointer group"
              title={`${bucket.time} | Active: ${bucket.activeSeconds}s, Idle: ${bucket.idleSeconds}s | Keys: ${bucket.keyCount}, Clicks: ${bucket.mouseCount}`}
            >
              <span className="text-[10px] text-slate-400 font-mono">{bucket.time}</span>
              <div className="w-full h-8 rounded bg-slate-900 flex items-end overflow-hidden">
                <div
                  className={`w-full ${colorClass} opacity-85 group-hover:opacity-100 transition-all`}
                  style={{ height: `${activePercent}%` }}
                />
              </div>
              <span className="text-[9px] text-slate-400 font-mono">{activePercent}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default TimelineHeatmap;
