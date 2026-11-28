import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { dayScore, dayScoreStyle } from '@/lib/dayProductivity';
import {
  Activity,
  Clock,
  Mouse,
  Keyboard,
  Globe,
  Camera,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  Eye
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import axios from 'axios';
import { API_URL, getAuthToken } from '@/lib/api';


export function MonitoringDashboard({ employee, monitoringStatus }) {
  const [activityData, setActivityData] = useState([]);
  const [dailyMetrics, setDailyMetrics] = useState(null);
  const [recentAlerts, setRecentAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const controllerRef = useRef(null);

  useEffect(() => {
    if (!employee) return undefined;
    const controller = new AbortController();
    controllerRef.current = controller;

    fetchDashboardData(controller.signal);
    // Real-time updates every 10 seconds (stale requests are aborted first)
    const interval = setInterval(() => fetchDashboardData(controller.signal, true), 10000);
    return () => {
      controller.abort();
      clearInterval(interval);
    };
  }, [employee, reloadKey]);

  const fetchDashboardData = useCallback(async (signal, silent = false) => {
    if (!employee?._id && !employee?.employeeId) return;
    const empId = employee._id || employee.employeeId;
    if (!silent) setLoading(true);
    try {
      // Same IST calendar day the backend uses for the daily summary
      const istNow = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
      const today = istNow.toISOString().slice(0, 10);

      // Fetch today's activity data
      const activityResponse = await axios.get(
        `${API_URL}/monitoring/employees/${empId}/activity?date=${today}`,
        {
          headers: { Authorization: `Bearer ${getAuthToken()}` },
          signal,
          timeout: 20000
        }
      );

      // Fetch recent alerts
      const alertsResponse = await axios.get(
        `${API_URL}/monitoring/alerts?employeeId=${empId}&limit=5`,
        {
          headers: { Authorization: `Bearer ${getAuthToken()}` },
          signal,
          timeout: 20000
        }
      );

      // Process activity data for charts
      const processedData = processActivityData(
        activityResponse.data.activities,
        activityResponse.data.summary?.dayProductivity?.hourly
      );
      setActivityData(processedData);

      // Calculate daily metrics (prefer unified backend summary when available)
      const metrics = calculateDailyMetrics(activityResponse.data.activities, activityResponse.data.summary);
      setDailyMetrics(metrics);

      setRecentAlerts(alertsResponse.data.alerts || []);
      setLoadError(null);
      setLoading(false);
    } catch (error) {
      if (signal?.aborted || error.code === 'ERR_CANCELED') return;
      console.error('Error fetching dashboard data:', error);
      setLoadError(
        error.response?.data?.error
        || 'Could not load this dashboard. Please try again.'
      );
      setLoading(false);
    }
  }, [employee]);

  const processActivityData = (activities, canonicalHourly = null) => {
    if (!activities || activities.length === 0) return [];

    // Group activities by hour
    const hourlyData = {};
    activities.forEach(activity => {
      const hour = new Date(activity.timestamp).getHours();
      if (!hourlyData[hour]) {
        hourlyData[hour] = {
          hour: `${hour}:00`,
          keystroke_count: 0,
          mouse_activity_score: 0,
          mouse_samples: 0,
          productivity_score: 0,
          idle_duration: 0,
          count: 0
        };
      }
      
      hourlyData[hour].keystroke_count += (activity.keystroke_count || 0);
      hourlyData[hour].mouse_activity_score += (activity.mouse_activity_score || 0);
      if ((activity.mouse_activity_score || 0) > 0) {
        hourlyData[hour].mouse_samples++;
      }
      hourlyData[hour].productivity_score += (activity.productivity_score || 0);
      hourlyData[hour].idle_duration += (activity.idle_duration || 0);
      hourlyData[hour].count++;
    });

    // Calculate averages and return sorted data. The productivity line uses
    // the canonical day-score points so the chart ends on the KPI percentage.
    const canonicalByHour = Array.isArray(canonicalHourly)
      ? new Map(canonicalHourly.map((h) => [Number(h.hour), h.score]))
      : null;

    return Object.values(hourlyData)
      .map(data => ({
        ...data,
        mouse_activity_score: data.mouse_samples > 0 ? Math.round(data.mouse_activity_score / data.mouse_samples) : 0,
        productivity_score: canonicalByHour
          ? (canonicalByHour.get(parseInt(data.hour)) ?? 0)
          : Math.round(data.productivity_score / data.count),
        idle_duration: Math.round(data.idle_duration / data.count)
      }))
      .sort((a, b) => parseInt(a.hour) - parseInt(b.hour));
  };

  const calculateDailyMetrics = (activities, summary = null) => {
    if (summary) {
      return {
        totalKeystroke: summary.totalKeystrokes || 0,
        avgMouseActivity: summary.mouseActivity || 0,
        avgProductivityScore: summary.dayProductivity?.score ?? summary.productivityScore ?? 0,
        dayProductivity: summary.dayProductivity || null,
        totalIdleTime: Math.round((summary.idleSeconds || 0) / 60),
        activeHours: Math.round(((summary.activeSeconds || 0) / 3600) * 100) / 100,
        totalActivities: summary.logCount || (activities?.length || 0)
      };
    }

    if (!activities || activities.length === 0) {
      return {
        totalKeystroke: 0,
        avgMouseActivity: 0,
        avgProductivityScore: 0,
        totalIdleTime: 0,
        activeHours: 0,
        totalActivities: 0
      };
    }

    const totalKeystroke = activities.reduce((sum, a) => sum + (a.keystroke_count || 0), 0);
    const activeMouseEntries = activities.filter(a => (a.mouse_activity_score || 0) > 0);
    const avgMouseActivity = activeMouseEntries.length > 0
      ? activeMouseEntries.reduce((sum, a) => sum + (a.mouse_activity_score || 0), 0) / activeMouseEntries.length
      : 0;
    const avgProductivityScore = activities.reduce((sum, a) => sum + (a.productivity_score || 0), 0) / activities.length;
    const totalIdleTime = activities.reduce((sum, a) => sum + Math.min(Number(a.interval_seconds || 30), Math.max(0, Number(a.idle_duration || 0))), 0);
    
    // Calculate active hours from interval spans minus idle
    const totalSpanSec = activities.reduce((sum, a) => sum + Math.min(60, Math.max(1, Number(a.interval_seconds || 30))), 0);
    const activeHours = Math.max(0, totalSpanSec - totalIdleTime) / 3600;

    return {
      totalKeystroke,
      avgMouseActivity: Math.round(avgMouseActivity),
      avgProductivityScore: Math.round(avgProductivityScore),
      totalIdleTime: Math.round(totalIdleTime / 60), // Convert to minutes
      activeHours: Math.round(activeHours * 100) / 100,
      totalActivities: activities.length
    };
  };

  const getActivityStatus = () => {
    if (monitoringStatus?.activity) {
      if (monitoringStatus.activity.isIdle) {
        return { status: 'Idle', color: 'text-yellow-500' };
      } else if (monitoringStatus.activity.active) {
        return { status: 'Active', color: 'text-green-500' };
      } else {
        return { status: 'Inactive', color: 'text-red-500' };
      }
    }
    if (monitoringStatus?.isActive || employee?.stillExist === 1) {
      return { status: 'Active', color: 'text-green-500' };
    }
    return { status: 'Inactive', color: 'text-red-500' };
  };

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[...Array(8)].map((_, i) => (
          <Card key={i} className="neo-card animate-pulse">
            <CardContent className="p-6">
              <div className="h-4 bg-muted rounded w-3/4 mb-2"></div>
              <div className="h-8 bg-muted rounded w-1/2"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const activityStatus = getActivityStatus();
  const currentDayStyle = dayScoreStyle(dailyMetrics);

  return (
    <div className="space-y-6">
      {loadError && (
        <div className="p-3 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-300 text-sm flex items-center justify-between gap-3">
          <span>{loadError}</span>
          <Button variant="outline" size="sm" onClick={() => setReloadKey((k) => k + 1)}>
            Try Again
          </Button>
        </div>
      )}
      {/* Real-Time Activity Display */}
      <Card className="neo-card border-primary/30 bg-gradient-to-r from-primary/5 to-accent/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary animate-pulse" />
            Real-Time Activity Monitor
            <Badge variant="outline" className="ml-auto">
              Live
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">Current Application</p>
              <p className="text-lg font-semibold text-foreground">
                {monitoringStatus.activity?.currentApplication?.name || 'No application detected'}
              </p>
              <p className="text-xs text-muted-foreground">
                {monitoringStatus.activity?.currentApplication?.title || 'No window title'}
              </p>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">Current Website/URL</p>
              <p className="text-sm text-foreground truncate">
                {monitoringStatus.activity?.currentApplication?.url || 'No URL detected'}
              </p>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${
                  monitoringStatus.activity?.isIdle ? 'bg-orange-500' : 'bg-green-500'
                }`} />
                <span className="text-xs text-muted-foreground">
                  {monitoringStatus.activity?.isIdle ? 'Idle' : 'Active'}
                </span>
              </div>
              {/* Platform compatibility indicator */}
              {typeof window !== 'undefined' && !navigator.userAgent.includes('Windows') && (
                <div className="flex items-center gap-2 mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded-md">
                  <div className="w-2 h-2 rounded-full bg-yellow-500" />
                  <span className="text-xs text-yellow-700">
                    Browser monitoring requires Windows platform
                  </span>
                </div>
              )}
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">Session Info</p>
              <p className="text-sm text-foreground">
                Duration: {Math.floor((monitoringStatus.activity?.sessionDuration || 0) / 60)}m
              </p>
              <p className="text-xs text-muted-foreground">
                Last activity: {monitoringStatus.activity?.timeSinceLastActivity || 0}s ago
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Real-time Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="neo-card border-primary/20">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Current Status</p>
                <p className={`text-2xl font-bold ${activityStatus.color}`}>
                  {activityStatus.status}
                </p>
              </div>
              <Activity className={`h-8 w-8 ${activityStatus.color}`} />
            </div>
          </CardContent>
        </Card>

        <Card className="neo-card border-accent/20">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Productivity Score</p>
                <p className={`text-2xl font-bold flex items-center gap-1.5 ${currentDayStyle.text}`}>
                  {dayScore(dailyMetrics)}%
                  <span className={`h-2.5 w-2.5 rounded-full ${currentDayStyle.dot}`} />
                  <span className="text-xs font-semibold">{currentDayStyle.label}</span>
                </p>
              </div>
              <TrendingUp className="h-8 w-8 text-accent" />
            </div>
          </CardContent>
        </Card>

        <Card className="neo-card border-green-500/20">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Active Hours</p>
                <p className="text-2xl font-bold text-green-500">
                  {dailyMetrics?.activeHours || 0}h
                </p>
              </div>
              <Clock className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card className="neo-card border-yellow-500/20">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Idle Time</p>
                <p className="text-2xl font-bold text-yellow-500">
                  {dailyMetrics?.totalIdleTime || 0}m
                </p>
              </div>
              <Clock className="h-8 w-8 text-yellow-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Activity Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="neo-card border-border/50">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Keystrokes Today</p>
                <p className="text-3xl font-bold text-foreground">
                  {dailyMetrics?.totalKeystroke?.toLocaleString() || 0}
                </p>
              </div>
              <Keyboard className="h-8 w-8 text-primary" />
            </div>
            <Progress value={Math.min((dailyMetrics?.totalKeystroke || 0) / 5000 * 100, 100)} className="h-2" />
            <p className="text-xs text-muted-foreground mt-2">Target: 5,000 keystrokes</p>
          </CardContent>
        </Card>

        <Card className="neo-card border-border/50">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Mouse Activity</p>
                <p className="text-3xl font-bold text-foreground">
                  {dailyMetrics?.avgMouseActivity || 0}%
                </p>
              </div>
              <Mouse className="h-8 w-8 text-accent" />
            </div>
            <Progress value={dailyMetrics?.avgMouseActivity || 0} className="h-2" />
            <p className="text-xs text-muted-foreground mt-2">Average activity level</p>
          </CardContent>
        </Card>

        <Card className="neo-card border-border/50">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Current Activity</p>
                <p className="text-lg font-semibold text-foreground truncate">
                  {monitoringStatus.activity?.currentApplication?.name || (employee?.stillExist === 1 ? 'Active Workspace' : 'System Offline')}
                </p>
              </div>
              <Globe className="h-8 w-8 text-primary" />
            </div>
            {monitoringStatus.activity?.currentApplication?.url && (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground truncate">
                  {monitoringStatus.activity.currentApplication.url}
                </p>
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${
                    monitoringStatus.activity?.isIdle ? 'bg-orange-500' : 'bg-green-500'
                  }`} />
                  <span className="text-xs text-muted-foreground">
                    {monitoringStatus.activity?.isIdle ? 'Idle' : 'Active'}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    • Last activity: {monitoringStatus.activity?.timeSinceLastActivity || 0}s ago
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Activity Chart */}
      <Card className="neo-card border-border/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            Today's Activity Timeline
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={activityData}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="hour" />
                <YAxis />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px'
                  }}
                />
                <Area 
                  type="monotone" 
                  dataKey="productivity_score" 
                  stroke="hsl(var(--primary))" 
                  fill="hsl(var(--primary))" 
                  fillOpacity={0.3}
                  name="Productivity Score"
                />
                <Area 
                  type="monotone" 
                  dataKey="mouse_activity_score" 
                  stroke="hsl(var(--accent))" 
                  fill="hsl(var(--accent))" 
                  fillOpacity={0.3}
                  name="Mouse Activity"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Recent Alerts */}
      <Card className="neo-card border-border/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
            Recent Alerts
          </CardTitle>
        </CardHeader>
        <CardContent>
          {recentAlerts.length > 0 ? (
            <div className="space-y-3">
              {recentAlerts.map((alert) => (
                <div key={alert._id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <div className="flex items-center gap-3">
                    <AlertTriangle className={`h-4 w-4 ${
                      alert.severity === 'high' ? 'text-red-500' :
                      alert.severity === 'medium' ? 'text-yellow-500' : 'text-blue-500'
                    }`} />
                    <div>
                      <p className="font-medium text-foreground">{alert.title}</p>
                      <p className="text-sm text-muted-foreground">{alert.description}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <Badge variant={alert.status === 'active' ? 'destructive' : 'secondary'}>
                      {alert.status}
                    </Badge>
                    <p className="text-xs text-muted-foreground mt-1">
                      {new Date(alert.timestamp).toLocaleTimeString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-2" />
              <p className="text-muted-foreground">No recent alerts</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
