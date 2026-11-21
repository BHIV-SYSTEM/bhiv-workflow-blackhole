import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  LineChart,
  Line,
  Area,
  AreaChart,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Badge } from '../ui/badge';
import { 
  TrendingUp, 
  TrendingDown, 
  BarChart3, 
  LineChart as LineChartIcon,
  PieChart as PieChartIcon
} from 'lucide-react';
import { formatDate } from '../../lib/dateFormat';

const AttendanceChart = ({ data }) => {
  const [activeChart, setActiveChart] = useState('bar');

  if (!data || data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Attendance Trends</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-64 text-gray-500">
            No data available
          </div>
        </CardContent>
      </Card>
    );
  }

  // Process data for charts
  const chartData = data.map(item => ({
    date: formatDate(item.date),
    present: item.presentCount || 0,
    absent: item.absentCount || 0,
    total: item.totalEmployees || 0,
    attendanceRate: item.attendanceRate || 0,
    avgHours: item.avgHours || 0
  }));

  // Colors for different chart elements
  const colors = {
    present: '#10b981', // green
    absent: '#ef4444',  // red
    rate: '#3b82f6',    // blue
    hours: '#f59e0b',   // orange
    gradient: {
      present: ['#10b981', '#059669'],
      absent: ['#ef4444', '#dc2626'],
      rate: ['#3b82f6', '#2563eb'],
      hours: ['#f59e0b', '#d97706']
    }
  };

  // Custom tooltip component
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white p-4 rounded-lg shadow-lg border border-gray-200"
        >
          <p className="font-medium text-gray-900 mb-2">{label}</p>
          {payload.map((entry, index) => (
            <div key={index} className="flex items-center gap-2 text-sm">
              <div 
                className="w-3 h-3 rounded-full" 
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-gray-600">{entry.name}:</span>
              <span className="font-medium">{entry.value}</span>
            </div>
          ))}
        </motion.div>
      );
    }
    return null;
  };

  // Calculate summary statistics
  const totalPresent = chartData.reduce((sum, item) => sum + item.present, 0);
  const totalAbsent = chartData.reduce((sum, item) => sum + item.absent, 0);
  const avgAttendanceRate = chartData.reduce((sum, item) => sum + item.attendanceRate, 0) / chartData.length;
  const trend = chartData.length > 1 ? 
    chartData[chartData.length - 1].attendanceRate - chartData[0].attendanceRate : 0;

  // Pie chart data
  const pieData = [
    { name: 'Present', value: totalPresent, color: colors.present },
    { name: 'Absent', value: totalAbsent, color: colors.absent }
  ];

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-blue-600" />
            Attendance Trends
          </CardTitle>
          
          {/* Summary Stats */}
          <div className="flex items-center gap-3">
            <Badge 
              variant="outline" 
              className={`${trend >= 0 ? 'text-green-600 border-green-200' : 'text-red-600 border-red-200'}`}
            >
              {trend >= 0 ? <TrendingUp className="w-3 h-3 mr-1" /> : <TrendingDown className="w-3 h-3 mr-1" />}
              {Math.abs(trend).toFixed(1)}%
            </Badge>
            <Badge variant="outline" className="text-blue-600 border-blue-200">
              Avg: {avgAttendanceRate.toFixed(1)}%
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <Tabs value={activeChart} onValueChange={setActiveChart} className="space-y-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="bar" className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              Bar Chart
            </TabsTrigger>
            <TabsTrigger value="line" className="flex items-center gap-2">
              <LineChartIcon className="w-4 h-4" />
              Line Chart
            </TabsTrigger>
            <TabsTrigger value="area" className="flex items-center gap-2">
              <PieChartIcon className="w-4 h-4" />
              Area Chart
            </TabsTrigger>
          </TabsList>

          <TabsContent value="bar" className="space-y-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="h-80"
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis 
                    dataKey="date" 
                    stroke="#6b7280"
                    fontSize={12}
                    tickLine={false}
                  />
                  <YAxis 
                    stroke="#6b7280"
                    fontSize={12}
                    tickLine={false}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar 
                    dataKey="present" 
                    name="Present"
                    fill="url(#presentGradient)"
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar 
                    dataKey="absent" 
                    name="Absent"
                    fill="url(#absentGradient)"
                    radius={[4, 4, 0, 0]}
                  />
                  <defs>
                    <linearGradient id="presentGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={colors.gradient.present[0]} />
                      <stop offset="100%" stopColor={colors.gradient.present[1]} />
                    </linearGradient>
                    <linearGradient id="absentGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={colors.gradient.absent[0]} />
                      <stop offset="100%" stopColor={colors.gradient.absent[1]} />
                    </linearGradient>
                  </defs>
                </BarChart>
              </ResponsiveContainer>
            </motion.div>
          </TabsContent>

          <TabsContent value="line" className="space-y-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="h-80"
            >
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis 
                    dataKey="date" 
                    stroke="#6b7280"
                    fontSize={12}
                    tickLine={false}
                  />
                  <YAxis 
                    stroke="#6b7280"
                    fontSize={12}
                    tickLine={false}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Line 
                    type="monotone" 
                    dataKey="attendanceRate" 
                    name="Attendance Rate (%)"
                    stroke={colors.rate}
                    strokeWidth={3}
                    dot={{ fill: colors.rate, strokeWidth: 2, r: 4 }}
                    activeDot={{ r: 6, stroke: colors.rate, strokeWidth: 2 }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="avgHours" 
                    name="Avg Hours"
                    stroke={colors.hours}
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    dot={{ fill: colors.hours, strokeWidth: 2, r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </motion.div>
          </TabsContent>

          <TabsContent value="area" className="space-y-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="h-80"
            >
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis 
                    dataKey="date" 
                    stroke="#6b7280"
                    fontSize={12}
                    tickLine={false}
                  />
                  <YAxis 
                    stroke="#6b7280"
                    fontSize={12}
                    tickLine={false}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Area 
                    type="monotone" 
                    dataKey="present" 
                    name="Present"
                    stackId="1"
                    stroke={colors.present}
                    fill="url(#presentAreaGradient)"
                  />
                  <Area 
                    type="monotone" 
                    dataKey="absent" 
                    name="Absent"
                    stackId="1"
                    stroke={colors.absent}
                    fill="url(#absentAreaGradient)"
                  />
                  <defs>
                    <linearGradient id="presentAreaGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={colors.present} stopOpacity={0.8} />
                      <stop offset="100%" stopColor={colors.present} stopOpacity={0.1} />
                    </linearGradient>
                    <linearGradient id="absentAreaGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={colors.absent} stopOpacity={0.8} />
                      <stop offset="100%" stopColor={colors.absent} stopOpacity={0.1} />
                    </linearGradient>
                  </defs>
                </AreaChart>
              </ResponsiveContainer>
            </motion.div>
          </TabsContent>
        </Tabs>

        {/* Mini Pie Chart */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3 }}
          className="mt-6 p-4 bg-gray-50 rounded-lg"
        >
          <h4 className="text-sm font-medium text-gray-700 mb-3">Overall Distribution</h4>
          <div className="flex items-center gap-6">
            <div className="w-24 h-24">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={20}
                    outerRadius={40}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
            
            <div className="flex-1 space-y-2">
              {pieData.map((entry, index) => (
                <div key={entry.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div 
                      className="w-3 h-3 rounded-full" 
                      style={{ backgroundColor: entry.color }}
                    />
                    <span className="text-sm text-gray-600">{entry.name}</span>
                  </div>
                  <span className="text-sm font-medium">{entry.value}</span>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </CardContent>
    </Card>
  );
};

export default AttendanceChart;
