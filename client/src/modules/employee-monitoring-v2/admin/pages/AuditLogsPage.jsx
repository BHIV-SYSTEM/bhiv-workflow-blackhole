/**
 * NIYANTRAN EMPLOYEE MONITORING V2
 * Administration — Device & Session Audit Logs Page
 */

import React, { useState, useEffect } from 'react';
import Card, { CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card.jsx';
import Table, { TableHeader, TableBody, TableRow, TableHead, TableCell } from '../../components/ui/Table.jsx';
import Badge from '../../components/ui/Badge.jsx';
import monitoringV2Api from '../../services/monitoringV2Api.js';
import SearchInput from '../../components/ui/SearchInput.jsx';
import { FileText, Shield, Clock } from 'lucide-react';

export const AuditLogsPage = () => {
  const [search, setSearch] = useState('');
  const [allLogs, setAllLogs] = useState([]);

  useEffect(() => {
    async function loadLogs() {
      try {
        const res = await monitoringV2Api.getAuditLogs();
        if (res?.data?.logs && Array.isArray(res.data.logs)) {
          setAllLogs(res.data.logs);
        } else {
          setAllLogs([]);
        }
      } catch {
        setAllLogs([]);
      }
    }
    loadLogs();
  }, []);

  const filtered = allLogs.filter(
    (l) =>
      l.action.toLowerCase().includes(search.toLowerCase()) ||
      l.target.toLowerCase().includes(search.toLowerCase()) ||
      l.details.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-100 flex items-center gap-2">
            <FileText className="w-5 h-5 text-indigo-400" />
            <span>Immutable Device & Session Audit Logs</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Verifiable cryptographic audit trail of all device handoffs, lease renewals, and policy changes
          </p>
        </div>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Filter audit events..."
          className="w-full sm:w-64"
        />
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow hover={false}>
                <TableHead>Timestamp (UTC)</TableHead>
                <TableHead>Event Type</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Target Resource</TableHead>
                <TableHead>Audit Log Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="font-mono text-[11px] text-slate-400 whitespace-nowrap">
                    {new Date(log.timestamp).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <Badge variant="purple" className="font-mono text-[10px]">
                      {log.action}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-medium text-xs text-slate-300 font-mono">
                    {log.actor}
                  </TableCell>
                  <TableCell className="text-xs text-indigo-300 font-semibold">
                    {log.target}
                  </TableCell>
                  <TableCell className="text-xs text-slate-400 leading-relaxed">
                    {log.details}
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

export default AuditLogsPage;
