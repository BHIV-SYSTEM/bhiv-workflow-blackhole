/**
 * NIYANTRAN EMPLOYEE MONITORING V2
 * Administration — Bulk Operations & Pilot Enrollment Page
 */

import React, { useState, useEffect } from 'react';
import Card, { CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card.jsx';
import Table, { TableHeader, TableBody, TableRow, TableHead, TableCell } from '../../components/ui/Table.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import monitoringV2Api from '../../services/monitoringV2Api.js';
import { Layers, UserCheck, Shield, CheckCircle2 } from 'lucide-react';

export const BulkOperationsPage = () => {
  const [team, setTeam] = useState([]);
  const [successNotice, setSuccessNotice] = useState(null);

  useEffect(() => {
    async function loadTeam() {
      try {
        const res = await monitoringV2Api.getLiveTeam();
        if (res?.data?.team && Array.isArray(res.data.team)) {
          setTeam(res.data.team.map(m => ({
            id: m.sessionId || m.employeeId,
            name: m.employeeName,
            avatar: (m.employeeName || 'U').split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase(),
            department: m.department,
            role: m.role || 'Software Engineer',
            employmentStatus: 'ACTIVE',
            isPilotUser: true
          })));
        } else {
          setTeam([]);
        }
      } catch {
        setTeam([]);
      }
    }
    loadTeam();
  }, []);

  const togglePilot = (empId) => {
    setTeam((prev) =>
      prev.map((emp) =>
        emp.id === empId ? { ...emp, isPilotUser: !emp.isPilotUser } : emp
      )
    );
    setSuccessNotice(`Pilot status toggled for employee ${empId}`);
    setTimeout(() => setSuccessNotice(null), 2000);
  };

  const handleEnrollAll = () => {
    setTeam((prev) => prev.map((emp) => ({ ...emp, isPilotUser: true })));
    setSuccessNotice('Enrolled all eligible active department employees into V2 Pilot Cohort.');
    setTimeout(() => setSuccessNotice(null), 2500);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-100 flex items-center gap-2">
            <Layers className="w-5 h-5 text-indigo-400" />
            <span>Bulk Operations & Pilot Cohort Enrollment</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Safely control employee enrollment into the V2 Pilot without disrupting V1 production monitoring
          </p>
        </div>
        <Button variant="primary" size="sm" icon={UserCheck} onClick={handleEnrollAll}>
          Enroll All in Pilot
        </Button>
      </div>

      {successNotice && (
        <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{successNotice}</span>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Employee Pilot Cohort Registry</CardTitle>
          <CardDescription>
            Only enrolled pilot users can receive V2 session authorization when feature flags are active
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow hover={false}>
                <TableHead>Employee</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Employment</TableHead>
                <TableHead>V2 Pilot Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {team.length === 0 ? (
                <TableRow hover={false}>
                  <TableCell colSpan={5} className="text-center py-6 text-slate-500">
                    No active team members available for pilot enrollment.
                  </TableCell>
                </TableRow>
              ) : (
                team.map((emp) => (
                <TableRow key={emp.id}>
                  <TableCell className="font-semibold text-slate-200">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-indigo-600/30 text-indigo-300 text-[10px] font-bold flex items-center justify-center">
                        {emp.avatar}
                      </div>
                      <span>{emp.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-slate-400">{emp.department}</TableCell>
                  <TableCell>
                    <Badge variant={emp.employmentStatus === 'ACTIVE' ? 'success' : 'neutral'}>
                      {emp.employmentStatus}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {emp.isPilotUser ? (
                      <Badge variant="purple">Pilot Enrolled</Badge>
                    ) : (
                      <Badge variant="neutral">V1 Standard Only</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant={emp.isPilotUser ? 'outline' : 'secondary'}
                      size="sm"
                      onClick={() => togglePilot(emp.id)}
                      className="text-xs"
                    >
                      {emp.isPilotUser ? 'Remove from Pilot' : 'Add to Pilot'}
                    </Button>
                  </TableCell>
                </TableRow>
              )))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default BulkOperationsPage;
