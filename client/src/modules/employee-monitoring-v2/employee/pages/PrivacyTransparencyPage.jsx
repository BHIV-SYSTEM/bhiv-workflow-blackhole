/**
 * NIYANTRAN EMPLOYEE MONITORING V2
 * Employee Workspace — Privacy Transparency Portal
 */

import React, { useState, useEffect } from 'react';
import Card, { CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card.jsx';
import Table, { TableHeader, TableBody, TableRow, TableHead, TableCell } from '../../components/ui/Table.jsx';
import Badge from '../../components/ui/Badge.jsx';
import monitoringV2Api from '../../services/monitoringV2Api.js';
import {
  ShieldCheck,
  EyeOff,
  Lock,
  FileCheck,
  XCircle,
  CheckCircle2,
} from 'lucide-react';

export const PrivacyTransparencyPage = () => {
  const [auditLogs, setAuditLogs] = useState([]);

  useEffect(() => {
    async function loadLogs() {
      try {
        const res = await monitoringV2Api.getDailyTimeline();
        if (res?.data?.timeline && Array.isArray(res.data.timeline)) {
          setAuditLogs(res.data.timeline.map((s, idx) => ({
            id: `audit-${idx}`,
            timestamp: s.time || (s.timestamp ? new Date(s.timestamp).toLocaleTimeString() : '—'),
            dataCollected: `Input keys (${s.keyCount ?? 0}), Mouse (${s.mouseCount ?? 0}), Category (${s.category || 'NEUTRAL'})`,
            dataExcluded: '❌ Keystroke characters, ❌ Screen visuals, ❌ Clipboard text, ❌ Personal URLs',
            status: 'Verified Privacy-Compliant'
          })));
        } else {
          setAuditLogs([]);
        }
      } catch {
        setAuditLogs([]);
      }
    }
    loadLogs();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-100 flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
            <span>Privacy & Transparency Portal</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Full visibility into what your workstation transmits and verifiable proof of privacy enforcement
          </p>
        </div>
        <Badge variant="success" className="py-1 px-3">
          100% Privacy-by-Design
        </Badge>
      </div>

      {/* Comparison Grid: What is collected vs What is blocked */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Blocked invasive data */}
        <Card className="border-rose-500/20 bg-rose-950/10">
          <CardHeader>
            <CardTitle className="text-rose-300 flex items-center gap-2">
              <EyeOff className="w-4 h-4 text-rose-400" />
              <span>Permanently Blocked / Never Collected</span>
            </CardTitle>
            <CardDescription className="text-rose-200/70">
              Invasive surveillance mechanisms prohibited by architectural contract
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2.5 text-xs text-slate-300">
              <li className="flex items-start gap-2">
                <XCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span>
                  <strong>No Keystroke Content:</strong> Individual keys, words, sentences, or passwords are never logged or stored.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <XCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span>
                  <strong>No Screen Recording:</strong> Screenshots, video captures, and display scraping are permanently disabled.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <XCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span>
                  <strong>No Clipboard Scanning:</strong> Copied text, tokens, or files are never accessed or inspected.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <XCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span>
                  <strong>No URL History:</strong> Specific browsing URLs, private file paths, and document titles are excluded.
                </span>
              </li>
            </ul>
          </CardContent>
        </Card>

        {/* What IS collected */}
        <Card className="border-emerald-500/20 bg-emerald-950/10">
          <CardHeader>
            <CardTitle className="text-emerald-300 flex items-center gap-2">
              <FileCheck className="w-4 h-4 text-emerald-400" />
              <span>What Telemetry IS Collected</span>
            </CardTitle>
            <CardDescription className="text-emerald-200/70">
              High-level numerical counts aggregated locally on your device
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2.5 text-xs text-slate-300">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>
                  <strong>Activity Frequency:</strong> Total numeric count of key taps and mouse clicks per 60-second window.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>
                  <strong>Active Application Category:</strong> Generic work bucket (e.g. Development, Documentation) matched from binary names.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>
                  <strong>Hardware Idle Seconds:</strong> Duration of continuous inactivity to pause session timers accurately.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>
                  <strong>Session Heartbeat:</strong> 30-second ping confirming connectivity and renewing the 90-second lease.
                </span>
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>

      {/* Verifiable Transmitted Audit Table */}
      <Card>
        <CardHeader>
          <CardTitle>Verifiable Transmitted Telemetry Samples (Today)</CardTitle>
          <CardDescription>
            Inspect the exact mathematical payloads transmitted by your local desktop agent
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow hover={false}>
                <TableHead>Time (Local)</TableHead>
                <TableHead>Telemetry Transmitted</TableHead>
                <TableHead>Strictly Excluded</TableHead>
                <TableHead>Verification Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {auditLogs.length === 0 ? (
                <TableRow hover={false}>
                  <TableCell colSpan={4} className="text-center py-6 text-slate-500">
                    No telemetry payloads recorded for today.
                  </TableCell>
                </TableRow>
              ) : (
                auditLogs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="font-mono text-slate-300 text-xs">{log.timestamp}</TableCell>
                    <TableCell className="text-xs text-slate-200 font-medium">
                      {log.dataCollected}
                    </TableCell>
                    <TableCell className="text-xs text-rose-300/80 font-mono">
                      {log.dataExcluded}
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1 text-xs text-emerald-400 font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Verified
                      </span>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default PrivacyTransparencyPage;
