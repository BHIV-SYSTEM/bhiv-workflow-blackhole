import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/auth-context';
import { toast } from './use-toast';
import api from '../lib/api';

export const useAttendance = (options = {}) => {
  const { user } = useAuth();
  const [attendanceData, setAttendanceData] = useState([]);
  const [liveAttendance, setLiveAttendance] = useState([]);
  const [attendanceStats, setAttendanceStats] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [todayAttendance, setTodayAttendance] = useState(null);

  // Fetch user attendance data
  const fetchAttendanceData = useCallback(async (userId = user?.id, options = {}) => {
    if (!userId) return;

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (options.startDate) params.append('startDate', options.startDate);
      if (options.endDate) params.append('endDate', options.endDate);
      if (options.page) params.append('page', options.page);
      if (options.limit) params.append('limit', options.limit);

      const response = await api.get(`/attendance/user/${userId}?${params}`);
      
      if (response.data.success) {
        setAttendanceData(response.data.data.records);
        return response.data.data;
      } else {
        throw new Error(response.data.error || 'Failed to fetch attendance data');
      }
    } catch (err) {
      const errorMessage = err.response?.data?.error || err.message || 'Failed to fetch attendance data';
      setError(errorMessage);
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive"
      });
      return null;
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  // Fetch live attendance data
  const fetchLiveAttendance = useCallback(async () => {
    if (!user) return;

    try {
      setLoading(true);
      setError(null);

      const response = await api.get('/attendance/live', {
        params: {
          date: options.date || new Date().toISOString().split('T')[0],
          department: options.department,
          status: options.status
        }
      });

      if (response.data.success) {
        setLiveAttendance(response.data.data.attendance || []);
        setAttendanceStats(response.data.data.stats || null);
      } else {
        throw new Error(response.data.error || 'Failed to fetch live attendance data');
      }
    } catch (err) {
      const errorMessage = err.response?.data?.error || err.message || 'Failed to fetch live attendance data';
      setError(errorMessage);
      console.error('Fetch live attendance error:', err);
    } finally {
      setLoading(false);
    }
  }, [user, options.date, options.department, options.status]);

  // Upload biometric data
  const uploadBiometricData = useCallback(async (file) => {
    if (!user || user.role !== 'Admin') {
      return { success: false, error: 'Admin access required' };
    }

    try {
      setLoading(true);

      const formData = new FormData();
      formData.append('file', file);

      const response = await api.post('/attendance/upload-biometric', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });

      if (response.data.success) {
        toast({
          title: "Upload Successful",
          description: `Processed ${response.data.summary?.processed || 0} attendance records`,
          variant: "success"
        });

        // Refresh live data
        await fetchLiveAttendance();

        return { success: true, data: response.data };
      } else {
        throw new Error(response.data.error || 'Upload failed');
      }
    } catch (err) {
      const errorMessage = err.response?.data?.error || err.message || 'Upload failed';

      toast({
        title: "Upload Failed",
        description: errorMessage,
        variant: "destructive"
      });

      return { success: false, error: errorMessage };
    } finally {
      setLoading(false);
    }
  }, [user, fetchLiveAttendance]);

  // Refresh live data
  const refreshLiveData = useCallback(() => {
    fetchLiveAttendance();
  }, [fetchLiveAttendance]);

  // Fetch attendance analytics
  const fetchAnalytics = useCallback(async (options = {}) => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (options.startDate) params.append('startDate', options.startDate);
      if (options.endDate) params.append('endDate', options.endDate);
      if (options.userId) params.append('userId', options.userId);
      if (options.department) params.append('department', options.department);

      const response = await api.get(`/attendance/analytics?${params}`);
      
      if (response.data.success) {
        setAnalytics(response.data.data);
        return response.data.data;
      } else {
        throw new Error(response.data.error || 'Failed to fetch analytics');
      }
    } catch (err) {
      const errorMessage = err.response?.data?.error || err.message || 'Failed to fetch analytics';
      setError(errorMessage);
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive"
      });
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  // Start day with geolocation
  const startDay = useCallback(async (locationData) => {
    if (!user?.id) {
      toast({
        title: "Error",
        description: "User not authenticated",
        variant: "destructive"
      });
      return false;
    }

    setLoading(true);

    try {
      const response = await api.attendance.startDay(user.id, locationData);
      
      if (response.success) {
        toast({
          title: "Day Started",
          description: response.message,
          variant: "default"
        });
        
        // Refresh today's attendance
        await fetchTodayAttendance();
        return true;
      } else {
        throw new Error(response.error || 'Failed to start day');
      }
    } catch (err) {
      const errorMessage = err.response?.data?.error || err.message || 'Failed to start day';
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive"
      });
      return false;
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  // End day
  const endDay = useCallback(async (locationData = {}) => {
    if (!user?.id) {
      toast({
        title: "Error",
        description: "User not authenticated",
        variant: "destructive"
      });
      return false;
    }

    setLoading(true);

    try {
      const response = await api.post(`/attendance/end-day/${user.id}`, locationData);
      
      if (response.success) {
        toast({
          title: "Day Ended",
          description: `Day ended successfully. Hours worked: ${response.hoursWorked}`,
          variant: "default"
        });
        
        // Refresh today's attendance
        await fetchTodayAttendance();
        return true;
      } else {
        throw new Error(response.error || 'Failed to end day');
      }
    } catch (err) {
      const errorMessage = err.response?.data?.error || err.message || 'Failed to end day';
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive"
      });
      return false;
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  // Verify attendance for a specific date
  const verifyAttendance = useCallback(async (userId = user?.id, date = new Date()) => {
    if (!userId) return null;

    try {
      const dateStr = date.toISOString().split('T')[0];
      const response = await api.attendance.verify(userId, dateStr);
      
      if (response.success) {
        return response.data;
      } else {
        throw new Error(response.error || 'Failed to verify attendance');
      }
    } catch (err) {
      console.error('Verify attendance error:', err);
      return null;
    }
  }, [user?.id]);

  // Fetch today's attendance
  const fetchTodayAttendance = useCallback(async () => {
    if (!user?.id) return null;

    try {
      const today = new Date();
      const dateStr = today.toISOString().split('T')[0];
      const response = await api.attendance.verify(user.id, dateStr);

      if (response.success) {
        setTodayAttendance(response.data);
        return response.data;
      } else {
        throw new Error(response.error || 'Failed to fetch today\'s attendance');
      }
    } catch (err) {
      console.error('Fetch today attendance error:', err);
      setTodayAttendance(null);
      return null;
    }
  }, [user?.id]);

  // Upload Excel file
  const uploadExcelFile = useCallback(async (file, onProgress = null) => {
    if (!file) {
      toast({
        title: "Error",
        description: "No file selected",
        variant: "destructive"
      });
      return false;
    }

    setLoading(true);

    try {
      const formData = new FormData();
      formData.append('excelFile', file);

      const response = await api.post('/attendance/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        },
        onUploadProgress: (progressEvent) => {
          if (onProgress) {
            const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            onProgress(percentCompleted);
          }
        }
      });

      if (response.data.success) {
        toast({
          title: "Upload Successful",
          description: `Processed ${response.data.summary.processed} records`,
          variant: "default"
        });
        
        // Refresh analytics after upload
        await fetchAnalytics();
        return response.data;
      } else {
        throw new Error(response.data.error || 'Failed to upload file');
      }
    } catch (err) {
      const errorMessage = err.response?.data?.error || err.message || 'Failed to upload file';
      toast({
        title: "Upload Failed",
        description: errorMessage,
        variant: "destructive"
      });
      return false;
    } finally {
      setLoading(false);
    }
  }, [fetchAnalytics]);

  // Calculate attendance statistics
  const calculateStats = useCallback((data = attendanceData) => {
    if (!data || data.length === 0) {
      return {
        totalDays: 0,
        presentDays: 0,
        absentDays: 0,
        attendanceRate: 0,
        verificationRate: 0,
        avgHoursPerDay: 0,
        totalHours: 0
      };
    }

    const totalDays = data.length;
    const presentDays = data.filter(d => d.isPresent).length;
    const verifiedDays = data.filter(d => d.isVerified).length;
    const totalHours = data.reduce((sum, d) => sum + (d.hoursWorked || 0), 0);

    return {
      totalDays,
      presentDays,
      absentDays: totalDays - presentDays,
      attendanceRate: totalDays > 0 ? Math.round((presentDays / totalDays) * 100) : 0,
      verificationRate: totalDays > 0 ? Math.round((verifiedDays / totalDays) * 100) : 0,
      avgHoursPerDay: presentDays > 0 ? Math.round((totalHours / presentDays) * 100) / 100 : 0,
      totalHours: Math.round(totalHours * 100) / 100
    };
  }, [attendanceData]);

  // Get attendance status for today
  const getTodayStatus = useCallback(() => {
    if (!todayAttendance) {
      return {
        status: 'not_started',
        message: 'Day not started',
        canStart: true,
        canEnd: false,
        color: 'gray'
      };
    }

    if (todayAttendance.isLeave) {
      return {
        status: 'on_leave',
        message: `On ${todayAttendance.leaveType} leave`,
        canStart: false,
        canEnd: false,
        color: 'purple'
      };
    }

    if (todayAttendance.startDayTime && !todayAttendance.endDayTime) {
      return {
        status: 'in_progress',
        message: 'Day in progress',
        canStart: false,
        canEnd: true,
        color: 'blue',
        startTime: todayAttendance.startDayTime
      };
    }

    if (todayAttendance.startDayTime && todayAttendance.endDayTime) {
      return {
        status: 'completed',
        message: 'Day completed',
        canStart: false,
        canEnd: false,
        color: 'green',
        startTime: todayAttendance.startDayTime,
        endTime: todayAttendance.endDayTime,
        hoursWorked: todayAttendance.hoursWorked
      };
    }

    return {
      status: 'unknown',
      message: 'Status unknown',
      canStart: true,
      canEnd: false,
      color: 'gray'
    };
  }, [todayAttendance]);

  // Auto-fetch today's attendance on mount
  useEffect(() => {
    if (user?.id) {
      fetchTodayAttendance();
    }
  }, [user?.id]); // Remove fetchTodayAttendance from dependencies

  return {
    // State
    attendanceData,
    liveAttendance,
    attendanceStats,
    analytics,
    loading,
    error,
    todayAttendance,

    // Actions
    fetchAttendanceData,
    fetchLiveAttendance,
    fetchAnalytics,
    startDay,
    endDay,
    verifyAttendance,
    fetchTodayAttendance,
    uploadExcelFile,
    uploadBiometricData,
    refreshLiveData,

    // Computed values
    stats: calculateStats(),
    todayStatus: getTodayStatus(),

    // Utilities
    calculateStats
  };
};

// Hook for attendance analytics with real-time updates
export const useAttendanceAnalytics = (options = {}) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [refreshInterval, setRefreshInterval] = useState(null);

  // Destructure options to avoid dependency issues
  const { startDate, endDate, department } = options;

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      if (department) params.append('department', department);

      const response = await api.get(`/attendance/analytics?${params}`);

      if (response.data.success) {
        setData(response.data.data);
        return response.data.data;
      } else {
        throw new Error(response.data.error || 'Failed to fetch analytics');
      }
    } catch (err) {
      const errorMessage = err.response?.data?.error || err.message || 'Failed to fetch analytics';
      setError(errorMessage);
      return null;
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, department]);

  // Auto-refresh functionality
  const startAutoRefresh = useCallback((interval = 30000) => {
    if (refreshInterval) {
      clearInterval(refreshInterval);
    }
    
    const id = setInterval(fetchData, interval);
    setRefreshInterval(id);
    
    return () => clearInterval(id);
  }, [fetchData, refreshInterval]);

  const stopAutoRefresh = useCallback(() => {
    if (refreshInterval) {
      clearInterval(refreshInterval);
      setRefreshInterval(null);
    }
  }, [refreshInterval]);

  // Initial fetch
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (refreshInterval) {
        clearInterval(refreshInterval);
      }
    };
  }, [refreshInterval]);

  return {
    data,
    loading,
    error,
    refresh: fetchData,
    startAutoRefresh,
    stopAutoRefresh,
    isAutoRefreshing: !!refreshInterval
  };
};
