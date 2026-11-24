/**
 * NIYANTRAN EMPLOYEE MONITORING V2
 * Employee Workspace — My Devices Page
 */

import React, { useState } from 'react';
import { useMonitoringV2Context } from '../../context/MonitoringV2Context.jsx';
import Card, { CardContent } from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import Badge from '../../components/ui/Badge.jsx';
import { Laptop, Smartphone, ArrowRightLeft, ShieldCheck, Key, Copy, Check, Download } from 'lucide-react';
import { monitoringV2Api } from '../../services/monitoringV2Api.js';
import { downloadAgentInstaller } from '../../services/installerDownload.js';

export const DeviceManagementPage = () => {
  const { personalDevices, setIsDeviceSwitcherOpen, employeeSession } = useMonitoringV2Context();
  const [pairingCode, setPairingCode] = useState(null);
  const [codeExpiresAt, setCodeExpiresAt] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleGenerateCode = async () => {
    setIsGenerating(true);
    try {
      const res = await monitoringV2Api.generateEnrollmentCode();
      if (res.data?.code) {
        setPairingCode(res.data.code);
        setCodeExpiresAt(res.data.expiresAt);
      } else {
        setPairingCode(null);
        setCodeExpiresAt(null);
      }
    } catch (err) {
      console.error('Failed to generate enrollment code:', err);
      setPairingCode(null);
      setCodeExpiresAt(null);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopyCode = () => {
    if (pairingCode) {
      navigator.clipboard?.writeText(pairingCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

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
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            icon={Download}
            onClick={() => downloadAgentInstaller('exe')}
            className="border-purple-500/40 text-purple-300 hover:bg-purple-500/10"
          >
            Download Agent (.exe)
          </Button>
          <Button
            variant="outline"
            size="sm"
            icon={Key}
            loading={isGenerating}
            onClick={handleGenerateCode}
          >
            Pair New Device
          </Button>
          <Button
            variant="primary"
            size="sm"
            icon={ArrowRightLeft}
            onClick={() => setIsDeviceSwitcherOpen(true)}
          >
            Switch Active Device
          </Button>
        </div>
      </div>

      {/* One-Time Pairing Code Modal / Card */}
      {pairingCode && (
        <Card className="border-indigo-500/50 bg-indigo-950/20">
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-indigo-300 font-semibold text-sm">
                <Key className="w-4 h-4 text-indigo-400" />
                <span>One-Time Device Enrollment Code</span>
              </div>
              <Badge variant="indigo">
                {codeExpiresAt ? `Expires at ${new Date(codeExpiresAt).toLocaleTimeString()}` : 'Valid for 10 minutes'}
              </Badge>
            </div>
            <p className="text-xs text-slate-300">
              Enter this 6-digit code into your Niyantran Windows Desktop Agent or run <code className="text-indigo-300 font-mono">npm run agent:pair {pairingCode}</code>. This code binds your workstation securely to your account.
            </p>
            <div className="flex items-center gap-3 pt-1">
              <div className="px-4 py-2 bg-slate-900 border border-indigo-500/40 rounded-xl font-mono text-2xl font-bold tracking-widest text-indigo-200">
                {pairingCode}
              </div>
              <Button
                variant="outline"
                size="sm"
                icon={copied ? Check : Copy}
                onClick={handleCopyCode}
              >
                {copied ? 'Copied' : 'Copy Code'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

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
