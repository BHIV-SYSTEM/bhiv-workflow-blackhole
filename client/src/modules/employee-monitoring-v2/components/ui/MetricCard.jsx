/**
 * NIYANTRAN EMPLOYEE MONITORING V2
 * KPI Metric Card Component
 */

import React from 'react';
import Card, { CardContent } from './Card.jsx';

export const MetricCard = ({
  title,
  value,
  subtext,
  icon: Icon,
  badge = null,
  trend = null,
  trendLabel = null,
  className = '',
}) => {
  return (
    <Card className={`overflow-hidden ${className}`}>
      <CardContent className="p-5">
        <div className="flex items-center justify-between text-slate-400 mb-2">
          <span className="text-xs font-medium uppercase tracking-wider">{title}</span>
          <div className="flex items-center gap-2">
            {badge && <div>{badge}</div>}
            {Icon && (
              <div className="p-2 rounded-lg bg-slate-800/80 text-indigo-400 border border-slate-700/50">
                <Icon className="w-4 h-4" />
              </div>
            )}
          </div>
        </div>
        <div className="text-2xl font-bold tracking-tight text-slate-100">{value}</div>
        {(subtext || trend) && (
          <div className="mt-2 flex items-center gap-2 text-xs text-slate-400">
            {trend && (
              <span
                className={`font-semibold ${
                  trend === 'up'
                    ? 'text-emerald-400'
                    : trend === 'down'
                    ? 'text-rose-400'
                    : 'text-slate-400'
                }`}
              >
                {trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→'} {trendLabel}
              </span>
            )}
            {subtext && <span className="text-slate-500">{subtext}</span>}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default MetricCard;
