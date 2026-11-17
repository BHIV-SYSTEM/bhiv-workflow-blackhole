/**
 * NIYANTRAN EMPLOYEE MONITORING V2
 * Operations — Alerts & Incident Management Page
 */

import React, { useState } from 'react';
import Card, { CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import MockDataService from '../../services/mockDataService.js';
import {
  BellRing,
  AlertTriangle,
  Info,
  CheckCircle2,
  XCircle,
  ShieldAlert,
} from 'lucide-react';

export const AlertsPage = () => {
  const [alerts, setAlerts] = useState(MockDataService.getAlerts());

  const handleDismiss = (id) => {
    const updated = MockDataService.dismissAlert(id);
    setAlerts(updated);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-100 flex items-center gap-2">
            <BellRing className="w-5 h-5 text-indigo-400" />
            <span>Alerts & Incident Queue</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Operational anomalies, legacy V1 conflicts, and device heartbeat timeouts
          </p>
        </div>
        <Badge variant={alerts.length > 0 ? 'warning' : 'success'}>
          {alerts.length} Active Incidents
        </Badge>
      </div>

      <div className="space-y-3">
        {alerts.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center text-slate-400 space-y-2">
              <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
              <h4 className="font-semibold text-slate-200">All alerts resolved</h4>
              <p className="text-xs">No active conflicts or lease dropouts in the fleet.</p>
            </CardContent>
          </Card>
        ) : (
          alerts.map((alert) => (
            <Card
              key={alert.id}
              className={`border-l-4 ${
                alert.severity === 'critical'
                  ? 'border-l-rose-500'
                  : alert.severity === 'warning'
                  ? 'border-l-amber-500'
                  : 'border-l-sky-500'
              }`}
            >
              <CardContent className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5">
                    {alert.severity === 'critical' ? (
                      <XCircle className="w-5 h-5 text-rose-400" />
                    ) : alert.severity === 'warning' ? (
                      <AlertTriangle className="w-5 h-5 text-amber-400" />
                    ) : (
                      <Info className="w-5 h-5 text-sky-400" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-semibold text-slate-100">{alert.title}</h4>
                      <Badge
                        variant={
                          alert.severity === 'critical'
                            ? 'danger'
                            : alert.severity === 'warning'
                            ? 'warning'
                            : 'info'
                        }
                        className="text-[10px] uppercase font-mono"
                      >
                        {alert.type}
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                      {alert.message}
                    </p>
                    <span className="text-[10px] text-slate-500 font-mono mt-1 block">
                      Occurred {alert.timestamp}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDismiss(alert.id)}
                    className="text-xs"
                  >
                    Acknowledge
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
};

export default AlertsPage;
