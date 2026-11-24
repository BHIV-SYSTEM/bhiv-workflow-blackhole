/**
 * NIYANTRAN EMPLOYEE MONITORING V2
 * RoleGuard Security Component (Frontend Presentation Boundary)
 *
 * Enforces role isolation: Regular employees cannot access Admin routes.
 */

import React from 'react';
import { useMonitoringV2Context } from '../../context/MonitoringV2Context.jsx';
import Button from '../ui/Button.jsx';
import { ShieldAlert, ArrowLeft } from 'lucide-react';

export const RoleGuard = ({ children, requiredRole = 'Admin' }) => {
  const { simulatedRole, setActiveTab } = useMonitoringV2Context();

  const isAuthorized =
    requiredRole === 'Employee'
      ? true
      : simulatedRole === 'Admin' || simulatedRole === 'SuperAdmin' || simulatedRole === 'Manager';

  if (!isAuthorized) {
    return (
      <div className="min-h-[500px] flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center space-y-4 p-8 rounded-2xl border border-rose-500/20 bg-slate-900/90 shadow-2xl backdrop-blur-md">
          <div className="w-12 h-12 mx-auto rounded-full bg-rose-500/10 text-rose-400 flex items-center justify-center border border-rose-500/20">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-100">Access Restricted</h3>
            <p className="text-xs text-rose-300 font-medium mt-0.5">HTTP 403 — Insufficient Role Scope</p>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Your simulated role is <span className="font-semibold text-slate-200">Employee</span>.
            Under V2 architectural governance, employees have zero access to administrative team telemetry, fleet devices, or peer activity metrics.
          </p>
          <div className="pt-2 flex flex-col sm:flex-row gap-2 justify-center">
            <Button
              variant="primary"
              size="sm"
              icon={ArrowLeft}
              onClick={() => setActiveTab('work-session')}
            >
              Go to Employee Workspace
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return children;
};

export default RoleGuard;
