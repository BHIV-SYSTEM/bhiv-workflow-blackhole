import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  AlertTriangle,
  Calendar,
  Clock,
  MessageSquare,
  RefreshCw,
  Users,
  CheckCircle2,
} from 'lucide-react';
import { API_URL } from '@/lib/api';

function formatShortDate(val) {
  if (!val) return '-';
  const d = new Date(val);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatDateTime(val) {
  if (!val) return '-';
  const d = new Date(val);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatClock(val) {
  if (!val) return '-';
  const d = new Date(val);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

export function MissedProgressReasonsPanel({
  selectedEmployeeId = '',
  searchQuery = '',
  departmentFilter = 'all',
  statusTab = 'all',
}) {
  const [records, setRecords] = useState([]);
  const [summary, setSummary] = useState({
    totalReasons: 0,
    uniqueEmployees: 0,
    submittedToday: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const fetchReasons = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('WorkflowToken') || localStorage.getItem('token');
      const selectedBranch = localStorage.getItem('selectedBranch') || localStorage.getItem('branch');

      const params = new URLSearchParams();
      if (selectedEmployeeId) params.set('employeeId', selectedEmployeeId);
      if (departmentFilter && departmentFilter !== 'all') params.set('department', departmentFilter);
      if (statusTab && statusTab !== 'all') params.set('statusTab', statusTab);
      if (searchQuery && searchQuery.trim()) params.set('search', searchQuery.trim());
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);

      const response = await axios.get(
        `${API_URL}/attendance/missed-progress-reasons?${params.toString()}`,
        {
          headers: {
            'x-auth-token': token,
            Authorization: `Bearer ${token}`,
            ...(selectedBranch && selectedBranch !== 'all' ? { 'x-branch': selectedBranch } : {}),
          },
        }
      );

      if (response.data?.success) {
        setRecords(response.data.records || []);
        setSummary(
          response.data.summary || {
            totalReasons: (response.data.records || []).length,
            uniqueEmployees: 0,
            submittedToday: 0,
          }
        );
      } else {
        setRecords([]);
      }
    } catch (err) {
      console.error('Failed to fetch missed progress reasons:', err);
      setError(err.response?.data?.error || 'Could not load missed progress reasons');
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, [selectedEmployeeId, departmentFilter, statusTab, searchQuery, startDate, endDate]);

  useEffect(() => {
    fetchReasons();
  }, [fetchReasons]);

  return (
    <div className="space-y-6">
      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-amber-500/30 bg-card">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Total Explanations</p>
              <p className="text-2xl font-extrabold text-amber-500 mt-1">{summary.totalReasons}</p>
            </div>
            <div className="h-10 w-10 rounded-xl bg-amber-500/15 flex items-center justify-center text-amber-500">
              <MessageSquare className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-blue-500/30 bg-card">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Submitted Today</p>
              <p className="text-2xl font-extrabold text-blue-500 mt-1">{summary.submittedToday}</p>
            </div>
            <div className="h-10 w-10 rounded-xl bg-blue-500/15 flex items-center justify-center text-blue-500">
              <Calendar className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-emerald-500/30 bg-card">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Unique Employees</p>
              <p className="text-2xl font-extrabold text-emerald-500 mt-1">{summary.uniqueEmployees}</p>
            </div>
            <div className="h-10 w-10 rounded-xl bg-emerald-500/15 flex items-center justify-center text-emerald-500">
              <Users className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main List Card */}
      <Card className="border-border shadow-sm">
        <CardHeader className="pb-4 border-b border-border/60 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <CardTitle className="text-lg font-bold flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Missed Daily Progress Reasons
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Explanations submitted by employees on Start Day when their previous workday&apos;s daily progress was not updated
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">From:</span>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="h-9 w-36 text-xs"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">To:</span>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="h-9 w-36 text-xs"
              />
            </div>
            {(startDate || endDate) && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setStartDate('');
                  setEndDate('');
                }}
                className="h-9 text-xs"
              >
                Clear
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={fetchReasons}
              disabled={loading}
              className="h-9 text-xs flex items-center gap-1.5"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </CardHeader>

        <CardContent className="pt-5">
          {error && (
            <div className="p-4 rounded-xl border border-rose-500/40 bg-rose-500/10 text-rose-400 text-xs mb-4">
              {error}
            </div>
          )}

          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2 text-muted-foreground text-sm">
              <div className="h-7 w-7 rounded-full border-2 border-primary border-t-transparent animate-spin" />
              <span>Loading missed progress explanations...</span>
            </div>
          ) : records.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <CheckCircle2 className="h-10 w-10 text-emerald-500/70 mx-auto" />
              <p className="font-semibold text-sm text-foreground">No Missed Progress Reasons Found</p>
              <p className="text-xs text-muted-foreground max-w-md mx-auto">
                No employees have submitted a missed-progress Start Day explanation matching the current filters.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {records.map((rec) => (
                <div
                  key={`${rec.userId}_${rec.missedWorkDateKey}_${rec.id}`}
                  className="p-4 rounded-xl border border-border bg-muted/20 hover:bg-muted/35 transition-colors space-y-3"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center font-bold text-amber-500 text-sm shrink-0">
                        {rec.name ? rec.name.charAt(0).toUpperCase() : 'E'}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-sm text-foreground">{rec.name}</span>
                          {rec.employeeId && (
                            <Badge variant="outline" className="text-[10px] font-mono">
                              {rec.employeeId}
                            </Badge>
                          )}
                          <Badge variant="secondary" className="text-[10px]">
                            {rec.departmentName}
                          </Badge>
                          {rec.stillExist === 0 && (
                            <Badge variant="outline" className="text-[10px] text-rose-400 border-rose-500/30">
                              Exited
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">{rec.email}</p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <Badge className="bg-amber-500/15 text-amber-500 border border-amber-500/30 font-semibold">
                        <Calendar className="h-3 w-3 mr-1" />
                        Missed Date: {formatShortDate(rec.missedWorkDate)}
                      </Badge>
                      {(rec.startDayTime || rec.hoursWorked > 0) && (
                        <Badge variant="outline" className="text-[11px] font-medium">
                          <Clock className="h-3 w-3 mr-1" />
                          {rec.startDayTime ? formatClock(rec.startDayTime) : '?'} –{' '}
                          {rec.endDayTime ? formatClock(rec.endDayTime) : 'Open'}
                          {rec.hoursWorked > 0 ? ` (${rec.hoursWorked.toFixed(1)}h)` : ''}
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div className="p-3.5 rounded-lg border-l-4 border-l-amber-500 bg-background/70 border border-border/60">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-500 mb-1">
                      Reason Provided on Start Day
                    </p>
                    <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                      {rec.reason}
                    </p>
                  </div>

                  <div className="flex items-center justify-end text-[11px] text-muted-foreground">
                    <span>Submitted at: {formatDateTime(rec.submittedAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

