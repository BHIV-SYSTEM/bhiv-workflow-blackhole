import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertTriangle,
  Trash2,
  Database,
  Calendar,
  Clock,
  Activity,
  Camera,
  Bell,
  FileText,
  RefreshCw,
  Shield,
  CheckCircle,
  XCircle,
  Download,
  BarChart3
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Alert, AlertDescription } from '../ui/alert';
import { Progress } from '../ui/progress';
import { Badge } from '../ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
import { useAuth } from '../../context/auth-context';
import api from '../../lib/api';
import { formatDate } from '../../lib/dateFormat';
import { toast } from 'react-hot-toast';

const AttendanceDataManagement = () => {
  const { user } = useAuth();
  const [dataStats, setDataStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [confirmationText, setConfirmationText] = useState('');
  const [dateRange, setDateRange] = useState({ startDate: '', endDate: '' });
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [operationType, setOperationType] = useState(''); // 'all' or 'date-range'
  const [isDeleting, setIsDeleting] = useState(false);

  // Check if user is admin
  const isAdmin = user?.role === 'Admin';

  useEffect(() => {
    if (isAdmin) {
      fetchDataStats();
    }
  }, [isAdmin]);

  const fetchDataStats = async () => {
    try {
      setLoading(true);
      const response = await api.get('/attendance-data/stats');
      setDataStats(response);
    } catch (error) {
      console.error('Error fetching data stats:', error);
      toast.error('Failed to fetch attendance data statistics');
    } finally {
      setLoading(false);
    }
  };

  const handleClearAllData = async () => {
    if (confirmationText !== 'DELETE_ALL_ATTENDANCE_DATA') {
      toast.error('Please enter the correct confirmation code');
      return;
    }

    try {
      setIsDeleting(true);
      const response = await api.delete('/attendance-data/clear-all', {
        confirmationCode: confirmationText
      });

      if (response.success) {
        toast.success(`Successfully deleted ${response.totalRecordsDeleted} attendance records!`);
        setShowConfirmDialog(false);
        setConfirmationText('');
        await fetchDataStats(); // Refresh stats
      }
    } catch (error) {
      console.error('Error clearing attendance data:', error);
      toast.error(error.response?.data?.error || 'Failed to clear attendance data');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleClearByDateRange = async () => {
    if (confirmationText !== 'DELETE_ATTENDANCE_DATA_BY_DATE') {
      toast.error('Please enter the correct confirmation code');
      return;
    }

    if (!dateRange.startDate || !dateRange.endDate) {
      toast.error('Please select both start and end dates');
      return;
    }

    try {
      setIsDeleting(true);
      const response = await api.delete('/attendance-data/clear-by-date', {
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        confirmationCode: confirmationText
      });

      if (response.success) {
        toast.success(`Successfully deleted ${response.totalRecordsDeleted} records from the specified date range!`);
        setShowConfirmDialog(false);
        setConfirmationText('');
        setDateRange({ startDate: '', endDate: '' });
        await fetchDataStats(); // Refresh stats
      }
    } catch (error) {
      console.error('Error clearing attendance data by date:', error);
      toast.error(error.response?.data?.error || 'Failed to clear attendance data');
    } finally {
      setIsDeleting(false);
    }
  };

  const openConfirmDialog = (type) => {
    setOperationType(type);
    setShowConfirmDialog(true);
    setConfirmationText('');
  };

  const getDataIcon = (key) => {
    const iconMap = {
      attendance: Database,
      dailyAttendance: Calendar,
      salaryAttendance: BarChart3,
      workSessions: Clock,
      employeeActivity: Activity,
      screenCaptures: Camera,
      monitoringAlerts: Bell,
      attendanceFeedback: FileText
    };
    return iconMap[key] || Database;
  };

  const getDataLabel = (key) => {
    const labelMap = {
      attendance: 'Basic Attendance',
      dailyAttendance: 'Daily Attendance',
      salaryAttendance: 'Salary Attendance',
      workSessions: 'Work Sessions',
      employeeActivity: 'Employee Activity',
      screenCaptures: 'Screen Captures',
      monitoringAlerts: 'Monitoring Alerts',
      attendanceFeedback: 'Attendance Feedback'
    };
    return labelMap[key] || key;
  };

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 via-orange-50 to-yellow-50 flex items-center justify-center p-6">
        <Card className="max-w-md mx-auto">
          <CardContent className="p-8 text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Shield className="w-8 h-8 text-red-600" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">Access Denied</h3>
            <p className="text-gray-600 mb-4">
              Only administrators can access the attendance data management tools.
            </p>
            <Button variant="outline" onClick={() => window.history.back()}>
              Go Back
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-red-50 to-orange-50 p-6">
      <div className="max-w-6xl mx-auto space-y-8">
        
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center"
        >
          <div className="flex items-center justify-center mb-4">
            <div className="p-3 bg-red-100 rounded-full mr-4">
              <AlertTriangle className="w-8 h-8 text-red-600" />
            </div>
            <div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-red-600 via-orange-600 to-yellow-600 bg-clip-text text-transparent">
                Attendance Data Management
              </h1>
              <p className="text-gray-600 text-lg">Dangerous Operations - Admin Only</p>
            </div>
          </div>
        </motion.div>

        {/* Warning Banner */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
        >
          <Alert className="border-red-200 bg-red-50">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            <AlertDescription className="text-red-800">
              <strong>⚠️ CRITICAL WARNING:</strong> The operations on this page will permanently delete attendance data from the database. 
              This action cannot be undone. Please ensure you have proper backups before proceeding.
            </AlertDescription>
          </Alert>
        </motion.div>

        {/* Data Statistics */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-2xl">Current Attendance Data Statistics</CardTitle>
                <CardDescription>Overview of all attendance-related data in the database</CardDescription>
              </div>
              <Button
                variant="outline"
                onClick={fetchDataStats}
                disabled={loading}
                className="flex items-center space-x-2"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </Button>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="flex items-center space-x-3">
                    <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                    <span className="text-gray-600">Loading statistics...</span>
                  </div>
                </div>
              ) : dataStats ? (
                <div className="space-y-6">
                  {/* Total Summary */}
                  <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg p-6 border border-blue-200">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-xl font-bold text-gray-900">Total Records</h3>
                        <p className="text-gray-600">All attendance-related data</p>
                      </div>
                      <div className="text-right">
                        <div className="text-3xl font-bold text-blue-600">
                          {dataStats.totalRecords.toLocaleString()}
                        </div>
                        <div className="text-sm text-gray-500">records</div>
                      </div>
                    </div>
                  </div>

                  {/* Breakdown Grid */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {Object.entries(dataStats.breakdown || {}).map(([key, count]) => {
                      const IconComponent = getDataIcon(key);
                      return (
                        <motion.div
                          key={key}
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: 0.1 * Object.keys(dataStats.breakdown).indexOf(key) }}
                          className="bg-white rounded-lg p-4 border border-gray-200 hover:shadow-md transition-shadow"
                        >
                          <div className="flex items-center space-x-3">
                            <div className="p-2 bg-gray-100 rounded-lg">
                              <IconComponent className="w-5 h-5 text-gray-600" />
                            </div>
                            <div>
                              <div className="text-lg font-bold text-gray-900">{count.toLocaleString()}</div>
                              <div className="text-xs text-gray-500">{getDataLabel(key)}</div>
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>

                  {/* Date Range Info */}
                  {dataStats.dateRange && (
                    <div className="bg-gray-50 rounded-lg p-4 border">
                      <h4 className="font-semibold text-gray-900 mb-2">Data Date Range</h4>
                      <div className="text-sm text-gray-600">
                        <p>Oldest Record: {dataStats.dateRange.oldest ? formatDate(dataStats.dateRange.oldest) : 'N/A'}</p>
                        <p>Newest Record: {dataStats.dateRange.newest ? formatDate(dataStats.dateRange.newest) : 'N/A'}</p>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  Failed to load data statistics
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Action Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          
          {/* Clear All Data */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
          >
            <Card className="border-red-200 bg-red-50">
              <CardHeader>
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-red-100 rounded-lg">
                    <Trash2 className="w-6 h-6 text-red-600" />
                  </div>
                  <div>
                    <CardTitle className="text-red-900">Clear All Attendance Data</CardTitle>
                    <CardDescription className="text-red-700">
                      Permanently delete ALL attendance-related records from the database
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-red-100 rounded-lg p-4">
                  <h4 className="font-semibold text-red-900 mb-2">⚠️ This will delete:</h4>
                  <ul className="text-sm text-red-800 space-y-1">
                    <li>• All attendance records</li>
                    <li>• All work sessions</li>
                    <li>• All monitoring data</li>
                    <li>• All salary calculations</li>
                    <li>• All related feedback</li>
                  </ul>
                </div>
                
                <Button
                  variant="destructive"
                  onClick={() => openConfirmDialog('all')}
                  disabled={!dataStats || dataStats.totalRecords === 0}
                  className="w-full"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete All Attendance Data
                </Button>
              </CardContent>
            </Card>
          </motion.div>

          {/* Clear by Date Range */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.4 }}
          >
            <Card className="border-orange-200 bg-orange-50">
              <CardHeader>
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-orange-100 rounded-lg">
                    <Calendar className="w-6 h-6 text-orange-600" />
                  </div>
                  <div>
                    <CardTitle className="text-orange-900">Clear Data by Date Range</CardTitle>
                    <CardDescription className="text-orange-700">
                      Delete attendance data within a specific date range
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="startDate" className="text-orange-900">Start Date</Label>
                    <Input
                      id="startDate"
                      type="date"
                      value={dateRange.startDate}
                      onChange={(e) => setDateRange(prev => ({ ...prev, startDate: e.target.value }))}
                      className="border-orange-200"
                    />
                  </div>
                  <div>
                    <Label htmlFor="endDate" className="text-orange-900">End Date</Label>
                    <Input
                      id="endDate"
                      type="date"
                      value={dateRange.endDate}
                      onChange={(e) => setDateRange(prev => ({ ...prev, endDate: e.target.value }))}
                      className="border-orange-200"
                    />
                  </div>
                </div>

                <div className="bg-orange-100 rounded-lg p-4">
                  <p className="text-sm text-orange-800">
                    ⚠️ This will permanently delete all attendance-related data within the selected date range.
                  </p>
                </div>
                
                <Button
                  variant="destructive"
                  onClick={() => openConfirmDialog('date-range')}
                  disabled={!dateRange.startDate || !dateRange.endDate}
                  className="w-full bg-orange-600 hover:bg-orange-700"
                >
                  <Calendar className="w-4 h-4 mr-2" />
                  Delete by Date Range
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* Confirmation Dialog */}
        <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center space-x-2 text-red-600">
                <AlertTriangle className="w-6 h-6" />
                <span>Confirm Dangerous Operation</span>
              </DialogTitle>
              <DialogDescription className="text-red-700">
                This action is irreversible and will permanently delete data from the database.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-6">
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <h4 className="font-semibold text-red-900 mb-2">⚠️ FINAL WARNING</h4>
                <p className="text-red-800 text-sm">
                  {operationType === 'all' 
                    ? `You are about to delete ALL ${dataStats?.totalRecords || 0} attendance records from the database.`
                    : `You are about to delete all attendance data from ${dateRange.startDate} to ${dateRange.endDate}.`
                  }
                </p>
                <p className="text-red-800 text-sm mt-2 font-medium">
                  This action cannot be undone!
                </p>
              </div>

              <div>
                <Label className="text-gray-900 font-medium">
                  Type the confirmation code to proceed:
                </Label>
                <div className="mt-2">
                  <code className="block text-sm bg-gray-100 p-2 rounded border mb-2">
                    {operationType === 'all' ? 'DELETE_ALL_ATTENDANCE_DATA' : 'DELETE_ATTENDANCE_DATA_BY_DATE'}
                  </code>
                  <Input
                    value={confirmationText}
                    onChange={(e) => setConfirmationText(e.target.value)}
                    placeholder="Enter the confirmation code above"
                    className="font-mono"
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-3">
                <Button
                  variant="outline"
                  onClick={() => setShowConfirmDialog(false)}
                  disabled={isDeleting}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={operationType === 'all' ? handleClearAllData : handleClearByDateRange}
                  disabled={isDeleting || confirmationText !== (operationType === 'all' ? 'DELETE_ALL_ATTENDANCE_DATA' : 'DELETE_ATTENDANCE_DATA_BY_DATE')}
                >
                  {isDeleting ? (
                    <div className="flex items-center space-x-2">
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Deleting...</span>
                    </div>
                  ) : (
                    <div className="flex items-center space-x-2">
                      <Trash2 className="w-4 h-4" />
                      <span>Confirm Delete</span>
                    </div>
                  )}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

      </div>
    </div>
  );
};

export default AttendanceDataManagement;