/**
 * NIYANTRAN EMPLOYEE MONITORING V2
 * Analytics — Daily & Monthly Trends Page
 */

import React, { useState } from 'react';
import Card, { CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card.jsx';
import Tabs from '../../components/ui/Tabs.jsx';
import Table, { TableHeader, TableBody, TableRow, TableHead, TableCell } from '../../components/ui/Table.jsx';
import ActivityBarChart from '../../components/charts/ActivityBarChart.jsx';
import MockDataService from '../../services/mockDataService.js';
import MetricCard from '../../components/ui/MetricCard.jsx';
import { Calendar, Clock, TrendingUp, BarChart2 } from 'lucide-react';

const PERIOD_OPTIONS = [
  { label: 'Today (Hourly)', value: 'today' },
  { label: 'Past 7 Days', value: '7d' },
  { label: 'Past 30 Days', value: '30d' },
];

export const DailyMonthlyPage = () => {
  const [period, setPeriod] = useState('today');
  const trends = MockDataService.getDailyTrends();

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-100">
            Daily & Monthly Analytics
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Aggregated focus versus idle ratios across departments over time
          </p>
        </div>
        <Tabs options={PERIOD_OPTIONS} activeValue={period} onChange={setPeriod} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard
          title="Average Daily Focus"
          value="6h 45m"
          subtext="Per active employee"
          trend="up"
          trendLabel="+12m vs last week"
          icon={Clock}
        />
        <MetricCard
          title="Average Hardware Idle"
          value="48m"
          subtext="Continuous inactivity"
          trend="down"
          trendLabel="-8m vs last week"
          icon={TrendingUp}
        />
        <MetricCard
          title="Fleet Active Ratio"
          value="87.4%"
          subtext="During core work hours"
          icon={BarChart2}
        />
        <MetricCard
          title="Attendance Alignment"
          value="98.2%"
          subtext="Sessions within shift window"
          icon={Calendar}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Focused Hours vs Hardware Idle Trends</CardTitle>
          <CardDescription>
            Telemetry aggregated into 60-second activity counts; no invasive keystrokes or screenshots recorded
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ActivityBarChart data={trends} height={220} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Department Productivity Summary</CardTitle>
          <CardDescription>
            Summary breakdown by department for selected period
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow hover={false}>
                <TableHead>Department</TableHead>
                <TableHead>Active Agents</TableHead>
                <TableHead>Avg Focused Hours</TableHead>
                <TableHead>Avg Idle Time</TableHead>
                <TableHead>Primary Category</TableHead>
                <TableHead>Productivity Ratio</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="font-semibold text-slate-200">Engineering</TableCell>
                <TableCell>18 Workstations</TableCell>
                <TableCell>7h 12m</TableCell>
                <TableCell>38m</TableCell>
                <TableCell className="text-indigo-400 font-mono">DEVELOPMENT (82%)</TableCell>
                <TableCell className="text-emerald-400 font-semibold font-mono">91.8%</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-semibold text-slate-200">Product & Design</TableCell>
                <TableCell>12 Workstations</TableCell>
                <TableCell>6h 50m</TableCell>
                <TableCell>52m</TableCell>
                <TableCell className="text-emerald-400 font-mono">DOCUMENTATION (65%)</TableCell>
                <TableCell className="text-emerald-400 font-semibold font-mono">88.5%</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-semibold text-slate-200">Customer Operations</TableCell>
                <TableCell>10 Workstations / PWA</TableCell>
                <TableCell>6h 25m</TableCell>
                <TableCell>1h 05m</TableCell>
                <TableCell className="text-amber-400 font-mono">SUPPORT (78%)</TableCell>
                <TableCell className="text-slate-300 font-semibold font-mono">85.4%</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default DailyMonthlyPage;
