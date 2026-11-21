/**
 * NIYANTRAN EMPLOYEE MONITORING V2
 * Analytics — TRINETRA AI Non-Invasive Insights Page
 */

import React, { useState } from 'react';
import Card, { CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import {
  Sparkles,
  ShieldCheck,
  Zap,
  AlertTriangle,
  HeartPulse,
  BrainCircuit,
  Info,
} from 'lucide-react';

export const TrinetraAiPage = () => {
  const [insights] = useState([]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-100 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-indigo-400" />
            <span>TRINETRA AI — Cognitive Insights</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Non-invasive behavioral anomaly detection and burnout prevention models
          </p>
        </div>
        <Badge variant="purple" className="py-1 px-3">
          Non-Invasive Representation
        </Badge>
      </div>

      {/* Non-Invasive Guarantee Banner */}
      <div className="p-4 rounded-xl border border-indigo-500/30 bg-indigo-950/20 text-xs text-slate-300 space-y-2">
        <div className="flex items-center gap-2 font-semibold text-indigo-300">
          <BrainCircuit className="w-4 h-4 text-indigo-400 shrink-0" />
          <span>TRINETRA Architectural Privacy Safeguard</span>
        </div>
        <p className="text-slate-400 text-xs leading-relaxed">
          Unlike legacy implementations that analyzed raw screen captures or OCR text, TRINETRA V2 operates exclusively on mathematical distributions of 60-second telemetry counts (input frequency, process category transitions, and hardware idle intervals). No video, audio, keystroke text, or private document contents are processed by AI models.
        </p>
      </div>

      {/* Insights Cards Grid */}
      {insights.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-slate-500 text-xs">
            No cognitive insights or anomaly patterns flagged for the active telemetry streams.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {insights.map((insight) => (
            <Card key={insight.id} className="flex flex-col justify-between">
              <CardHeader className="space-y-3">
                <div className="flex items-center justify-between">
                  <Badge
                    variant={
                      insight.trend === 'positive'
                        ? 'success'
                        : insight.trend === 'warning'
                        ? 'warning'
                        : 'info'
                    }
                  >
                    {insight.category.replace('_', ' ')}
                  </Badge>
                  <span className="text-[11px] font-mono text-slate-400">
                    Confidence: {Math.round(insight.confidence * 100)}%
                  </span>
                </div>
                <CardTitle className="text-sm font-bold text-slate-100">
                  {insight.headline}
                </CardTitle>
                <CardDescription className="text-xs text-slate-300">
                  {insight.description}
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-3 pt-0">
                <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
                  <span className="text-[10px] uppercase font-bold text-indigo-400 block tracking-wider">
                    Recommendation
                  </span>
                  <p className="text-xs text-slate-300">{insight.recommendation}</p>
                </div>

                <div className="flex items-center gap-1.5 text-[10px] text-emerald-400 font-mono">
                  <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                  <span>{insight.privacyNote}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default TrinetraAiPage;
