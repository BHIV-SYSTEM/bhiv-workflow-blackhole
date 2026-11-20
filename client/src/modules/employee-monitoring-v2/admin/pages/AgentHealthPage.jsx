/**
 * NIYANTRAN EMPLOYEE MONITORING V2
 * Operations — Agent & Device Health Page
 */

import React, { useState } from 'react';
import Card, { CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card.jsx';
import Table, { TableHeader, TableBody, TableRow, TableHead, TableCell } from '../../components/ui/Table.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import MockDataService from '../../services/mockDataService.js';
import { Cpu, Laptop, ShieldCheck, CheckCircle2, AlertOctagon } from 'lucide-react';

export const AgentHealthPage = () => {
  const [devices, setDevices] = useState(MockDataService.getDevices());
  const [revokedId, setRevokedId] = useState(null);

  const handleRevoke = (id) => {
    setRevokedId(id);
    setTimeout(() => {
      setDevices((prev) =>
        prev.map((d) => (d.id === id ? { ...d, status: 'REVOKED', leaseExpiresInSeconds: 0 } : d))
      );
      setRevokedId(null);
    }, 600);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-100 flex items-center gap-2">
            <Cpu className="w-5 h-5 text-indigo-400" />
            <span>Agent & Device Fleet Health</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Cryptographic device enrollment, heartbeat status, and autonomous 90s lease tracking
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Registered Fleet Devices</CardTitle>
          <CardDescription>
            Workstations running Niyantran Employee Agent v2.0.0
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow hover={false}>
                <TableHead>Employee</TableHead>
                <TableHead>Platform / OS</TableHead>
                <TableHead>Agent Version</TableHead>
                <TableHead>Lease Status</TableHead>
                <TableHead>Lease Timer</TableHead>
                <TableHead>HMAC Auth</TableHead>
                <TableHead>Hardware Fingerprint</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {devices.map((device) => (
                <TableRow key={device.id}>
                  <TableCell className="font-semibold text-slate-200">
                    {device.employeeName}
                  </TableCell>
                  <TableCell className="text-slate-300">
                    <div className="flex items-center gap-1.5 text-xs">
                      <Laptop className="w-3.5 h-3.5 text-slate-400" />
                      <span>{device.platform}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="font-mono text-xs text-indigo-400">
                      {device.agentVersion}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        device.status === 'ACTIVE_LEASE'
                          ? 'success'
                          : device.status === 'CONFLICT_PAUSED'
                          ? 'warning'
                          : 'danger'
                      }
                    >
                      {device.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {device.leaseExpiresInSeconds > 0 ? (
                      <span className="text-emerald-400">{device.leaseExpiresInSeconds}s active</span>
                    ) : (
                      <span className="text-slate-500">Expired</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400 font-mono">
                      <ShieldCheck className="w-3.5 h-3.5" /> SHA256
                    </span>
                  </TableCell>
                  <TableCell className="font-mono text-[11px] text-slate-500 truncate max-w-[120px]">
                    {device.hardwareFingerprint}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleRevoke(device.id)}
                      disabled={device.status === 'REVOKED' || revokedId === device.id}
                      className="text-rose-400 border-rose-500/30 hover:bg-rose-500/10 text-xs"
                    >
                      {revokedId === device.id ? 'Revoking...' : 'Revoke'}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default AgentHealthPage;
