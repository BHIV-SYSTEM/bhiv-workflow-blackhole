/**
 * NIYANTRAN EMPLOYEE MONITORING V2
 * Operations — Production Overview Page
 */

import React from 'react';
import Card, { CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card.jsx';
import MetricCard from '../../components/ui/MetricCard.jsx';
import Badge from '../../components/ui/Badge.jsx';
import { Activity, Server, Zap, ShieldCheck, CheckCircle2 } from 'lucide-react';

export const ProductionOverviewPage = () => {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-100 flex items-center gap-2">
            <Activity className="w-5 h-5 text-indigo-400" />
            <span>Production Overview & Telemetry Ingestion</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Backend ingestion throughput, Redis buffer health, and API error rates
          </p>
        </div>
        <Badge variant="success">All Services Operational</Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard
          title="Telemetry Ingest Rate"
          value="1.2 req/s"
          subtext="60s aggregate batches"
          icon={Zap}
        />
        <MetricCard
          title="Ingestion Error Rate"
          value="0.00%"
          subtext="Zero rejected batches"
          icon={CheckCircle2}
        />
        <MetricCard
          title="Average Ingest Latency"
          value="18ms"
          subtext="HMAC verify + mongo append"
          icon={Server}
        />
        <MetricCard
          title="Privacy Assertion Pass"
          value="100%"
          subtext="Zero screen/text payloads"
          icon={ShieldCheck}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Architecture Status & Circuit Breakers</CardTitle>
          <CardDescription>
            Autonomous safeguards protecting backend performance and employee privacy
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/40 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-200">Rate Limiter (Max 12 req/min)</span>
                <Badge variant="success">Nominal</Badge>
              </div>
              <p className="text-xs text-slate-400">
                Guarantees desktop agents cannot flood ingestion with excessive telemetry samples.
              </p>
            </div>

            <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/40 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-200">Emergency Telemetry Halt</span>
                <Badge variant="neutral">Disarmed (Normal)</Badge>
              </div>
              <p className="text-xs text-slate-400">
                Instant circuit breaker: can halt all V2 processing in &lt;1 second via environment switch.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ProductionOverviewPage;
