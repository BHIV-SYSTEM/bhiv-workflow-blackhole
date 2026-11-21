/**
 * NIYANTRAN EMPLOYEE MONITORING V2
 * Administration — Settings & Feature Flags Status Page
 */

import React from 'react';
import Card, { CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card.jsx';
import Badge from '../../components/ui/Badge.jsx';
import { useMonitoringV2Context } from '../../context/MonitoringV2Context.jsx';
import { Settings, Shield, Server, Database, CheckCircle2 } from 'lucide-react';

export const SettingsPage = () => {
  const { flags } = useMonitoringV2Context();

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-100 flex items-center gap-2">
            <Settings className="w-5 h-5 text-indigo-400" />
            <span>Settings & Environment Governance</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Review feature flag switches, retention rules, and database isolation parameters
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Feature Flags Status */}
        <Card>
          <CardHeader>
            <CardTitle>Runtime Feature Flags (Production Env)</CardTitle>
            <CardDescription>
              Secure-by-default switches governing V2 availability in production
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between text-xs">
              <div>
                <span className="font-semibold text-slate-200 block">ENABLE_MONITORING_V2</span>
                <span className="text-[11px] text-slate-400">Master backend route & ingestion switch</span>
              </div>
              <Badge variant={flags.ENABLE_MONITORING_V2 ? 'success' : 'neutral'}>
                {flags.ENABLE_MONITORING_V2 ? 'Enabled' : 'Disabled (Default)'}
              </Badge>
            </div>

            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between text-xs">
              <div>
                <span className="font-semibold text-slate-200 block">ENABLE_V2_ADMIN_CONSOLE</span>
                <span className="text-[11px] text-slate-400">Admin UI routes & navigation switch</span>
              </div>
              <Badge variant={flags.ENABLE_V2_ADMIN_CONSOLE ? 'success' : 'neutral'}>
                {flags.ENABLE_V2_ADMIN_CONSOLE ? 'Enabled' : 'Disabled (Default)'}
              </Badge>
            </div>

            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between text-xs">
              <div>
                <span className="font-semibold text-slate-200 block">ENABLE_V2_EMPLOYEE_WORKSPACE</span>
                <span className="text-[11px] text-slate-400">Employee Workspace UI switch</span>
              </div>
              <Badge variant={flags.ENABLE_V2_EMPLOYEE_WORKSPACE ? 'success' : 'neutral'}>
                {flags.ENABLE_V2_EMPLOYEE_WORKSPACE ? 'Enabled' : 'Disabled (Default)'}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Retention & Database Isolation */}
        <Card>
          <CardHeader>
            <CardTitle>Database Retention & Isolation</CardTitle>
            <CardDescription>
              Isolated collection schemas preventing collision with V1 data
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1 text-xs">
              <span className="font-semibold text-slate-200 block">Isolated Collection Namespaces</span>
              <p className="text-[11px] text-slate-400">
                All V2 models write strictly to isolated collections: <code className="text-indigo-400">monitoring_v2_devices</code>, <code className="text-indigo-400">monitoring_v2_sessions</code>, and <code className="text-indigo-400">monitoring_v2_telemetry</code>.
              </p>
            </div>

            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1 text-xs">
              <span className="font-semibold text-slate-200 block">Telemetry Retention Policy</span>
              <p className="text-[11px] text-slate-400">
                Telemetry buckets automatically expire after 90 days via MongoDB TTL index on <code className="text-indigo-400">bucketEnd</code>.
              </p>
            </div>

            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1 text-xs">
              <span className="font-semibold text-slate-200 block">Attendance Decoupling</span>
              <p className="text-[11px] text-slate-400">
                V2 has zero attendance mutation privileges. Workday checks are pure read-only queries.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default SettingsPage;
