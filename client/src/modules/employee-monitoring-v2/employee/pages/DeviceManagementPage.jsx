/**
 * NIYANTRAN EMPLOYEE MONITORING V2
 * Employee Workspace — My Devices Page
 */

import React from 'react';
import { useMonitoringV2Context } from '../../context/MonitoringV2Context.jsx';
import Card, { CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import Badge from '../../components/ui/Badge.jsx';
import { Laptop, Smartphone, ArrowRightLeft, ShieldCheck, CheckCircle2 } from 'lucide-react';

export const DeviceManagementPage = () => {
  const { personalDevices, setIsDeviceSwitcherOpen, employeeSession } = useMonitoringV2Context();

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-100">
            Registered Work Devices
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Manage your authorized desktop and mobile devices under single active session ownership
          </p>
        </div>
        <Button
          variant="primary"
          size="sm"
          icon={ArrowRightLeft}
          onClick={() => setIsDeviceSwitcherOpen(true)}
        >
          Switch Active Device
        </Button>
      </div>

      {/* Governance Explainer */}
      <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/40 text-xs text-slate-400 space-y-1.5">
        <div className="flex items-center gap-2 font-semibold text-slate-200">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>Single Active Lease Rule</span>
        </div>
        <p className="leading-relaxed">
          Niyantran Employee Monitoring V2 guarantees that an employee can have at most one active telemetry lease at any given time.
          Switching devices releases the session lease on your prior device and transfers it to the new one, preventing duplicate tracking.
          Attendance clock-in records are never affected.
        </p>
      </div>

      {/* Devices List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {personalDevices.map((dev) => {
          const isCurrent =
            (dev.type === 'laptop_pc' && employeeSession.currentDeviceMode === 'LAPTOP_PC') ||
            (dev.type === 'phone' && employeeSession.currentDeviceMode === 'PHONE');

          return (
            <Card
              key={dev.id}
              className={isCurrent ? 'border-indigo-500/40 bg-indigo-950/10' : ''}
            >
              <CardContent className="p-5 space-y-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-slate-800 text-indigo-400 border border-slate-700">
                      {dev.type === 'phone' ? (
                        <Smartphone className="w-5 h-5" />
                      ) : (
                        <Laptop className="w-5 h-5" />
                      )}
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-slate-100">{dev.name}</h4>
                      <p className="text-xs text-slate-400">{dev.platform}</p>
                    </div>
                  </div>

                  {isCurrent ? (
                    <Badge variant="success">Active Lease</Badge>
                  ) : (
                    <Badge variant="neutral">Standby</Badge>
                  )}
                </div>

                <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs">
                  <span className="text-slate-500 font-mono text-[11px] flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> HMAC Verified
                  </span>
                  <span className="text-slate-400">{dev.lastActive}</span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export default DeviceManagementPage;
