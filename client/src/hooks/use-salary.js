import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/auth-context';
import { toast } from './use-toast';
import api from '../lib/api';
import { formatEmployeeId } from '../lib/employeeId';

export const useSalary = () => {
  const { user } = useAuth();
  const [salaryData, setSalaryData] = useState(null);
  const [salaryCards, setSalaryCards] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Fetch user salary data
  const fetchSalaryData = useCallback(async (userId = user?.id) => {
    if (!userId) return null;

    setLoading(true);
    setError(null);

    try {
      const response = await api.get(`/salary/user/${userId}`);
      
      if (response.data.success) {
        setSalaryData(response.data.data);
        return response.data.data;
      } else {
        throw new Error(response.data.error || 'Failed to fetch salary data');
      }
    } catch (err) {
      const errorMessage = err.response?.data?.error || err.message || 'Failed to fetch salary data';
      setError(errorMessage);
      
      // Don't show toast for 404 errors (no salary record)
      if (err.response?.status !== 404) {
        toast({
          title: "Error",
          description: errorMessage,
          variant: "destructive"
        });
      }
      return null;
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  // Calculate monthly salary
  const calculateMonthlySalary = useCallback(async (userId = user?.id, options = {}) => {
    if (!userId) return null;

    setLoading(true);

    try {
      const params = new URLSearchParams();
      if (options.month) params.append('month', options.month);
      if (options.year) params.append('year', options.year);
      if (options.workingDays) params.append('workingDays', options.workingDays);

      const response = await api.get(`/salary/calculate/${userId}?${params}`);
      
      if (response.data.success) {
        return response.data.data;
      } else {
        throw new Error(response.data.error || 'Failed to calculate salary');
      }
    } catch (err) {
      const errorMessage = err.response?.data?.error || err.message || 'Failed to calculate salary';
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

  // Set salary information (admin only)
  const setSalaryInfo = useCallback(async (userId, salaryInfo) => {
    setLoading(true);

    try {
      const response = await api.post(`/salary/set/${userId}`, salaryInfo);
      
      if (response.data.success) {
        toast({
          title: "Success",
          description: "Salary information updated successfully",
          variant: "default"
        });
        
        // Refresh salary data if it's for current user
        if (userId === user?.id) {
          await fetchSalaryData(userId);
        }
        
        return response.data.data;
      } else {
        throw new Error(response.data.error || 'Failed to set salary information');
      }
    } catch (err) {
      const errorMessage = err.response?.data?.error || err.message || 'Failed to set salary information';
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
  }, [user?.id, fetchSalaryData]);

  // Add salary adjustment (admin only)
  const addSalaryAdjustment = useCallback(async (userId, adjustment) => {
    setLoading(true);

    try {
      const response = await api.put(`/salary/adjust/${userId}`, adjustment);
      
      if (response.data.success) {
        toast({
          title: "Success",
          description: "Salary adjustment added successfully",
          variant: "default"
        });
        
        // Refresh salary data if it's for current user
        if (userId === user?.id) {
          await fetchSalaryData(userId);
        }
        
        return response.data.data;
      } else {
        throw new Error(response.data.error || 'Failed to add salary adjustment');
      }
    } catch (err) {
      const errorMessage = err.response?.data?.error || err.message || 'Failed to add salary adjustment';
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
  }, [user?.id, fetchSalaryData]);

  // Fetch all salary cards (admin only)
  const fetchAllSalaryCards = useCallback(async (options = {}) => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (options.month) params.append('month', options.month);
      if (options.year) params.append('year', options.year);
      if (options.workingDays) params.append('workingDays', options.workingDays);
      if (options.department) params.append('department', options.department);
      if (options.tag) params.append('tag', options.tag);

      const response = await api.get(`/salary/calculate/all?${params}`);
      
      if (response.data.success) {
        setSalaryCards(response.data.data.salaryCards);
        return response.data.data;
      } else {
        throw new Error(response.data.error || 'Failed to fetch salary cards');
      }
    } catch (err) {
      const errorMessage = err.response?.data?.error || err.message || 'Failed to fetch salary cards';
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

  // Fetch salary analytics (admin only)
  const fetchSalaryAnalytics = useCallback(async (options = {}) => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (options.department) params.append('department', options.department);
      if (options.year) params.append('year', options.year);

      const response = await api.get(`/salary/analytics?${params}`);
      
      if (response.data.success) {
        setAnalytics(response.data.data);
        return response.data.data;
      } else {
        throw new Error(response.data.error || 'Failed to fetch salary analytics');
      }
    } catch (err) {
      const errorMessage = err.response?.data?.error || err.message || 'Failed to fetch salary analytics';
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

  // Set working days configuration (admin only)
  const setWorkingDays = useCallback(async (config) => {
    setLoading(true);

    try {
      const response = await api.post('/salary/working-days', config);
      
      if (response.data.success) {
        toast({
          title: "Success",
          description: "Working days configuration updated",
          variant: "default"
        });
        return response.data.data;
      } else {
        throw new Error(response.data.error || 'Failed to set working days');
      }
    } catch (err) {
      const errorMessage = err.response?.data?.error || err.message || 'Failed to set working days';
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

  // Format currency
  const formatCurrency = useCallback((amount, currency = 'USD') => {
    if (typeof amount !== 'number') return 'N/A';
    
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  }, []);

  // Calculate salary breakdown
  const calculateSalaryBreakdown = useCallback((salaryData, attendanceData = null) => {
    if (!salaryData) return null;

    const breakdown = {
      baseSalary: salaryData.baseSalary || 0,
      allowances: salaryData.totalAllowances || 0,
      deductions: salaryData.totalDeductions || 0,
      grossSalary: salaryData.grossSalary || 0,
      netSalary: salaryData.netSalary || 0,
      currency: salaryData.currency || 'USD'
    };

    // Add current month calculation if available
    if (salaryData.currentMonth) {
      breakdown.currentMonth = {
        ...salaryData.currentMonth,
        formatted: {
          basePay: formatCurrency(salaryData.currentMonth.basePay, breakdown.currency),
          grossPay: formatCurrency(salaryData.currentMonth.grossPay, breakdown.currency),
          netPay: formatCurrency(salaryData.currentMonth.netPay, breakdown.currency),
          allowances: formatCurrency(salaryData.currentMonth.allowances, breakdown.currency),
          deductions: formatCurrency(salaryData.currentMonth.deductions || 0, breakdown.currency)
        }
      };
    }

    return breakdown;
  }, [formatCurrency]);

  // Get salary status
  const getSalaryStatus = useCallback(() => {
    if (!salaryData) {
      return {
        status: 'not_configured',
        message: 'Salary not configured',
        color: 'gray'
      };
    }

    if (salaryData.probationPeriod && !salaryData.probationPeriod.isCompleted) {
      return {
        status: 'probation',
        message: 'On probation period',
        color: 'yellow',
        endDate: salaryData.probationPeriod.endDate
      };
    }

    return {
      status: 'active',
      message: 'Active salary record',
      color: 'green'
    };
  }, [salaryData]);

  // Auto-fetch salary data on mount
  useEffect(() => {
    if (user?.id) {
      fetchSalaryData();
    }
  }, [user?.id, fetchSalaryData]);

  return {
    // State
    salaryData,
    salaryCards,
    analytics,
    loading,
    error,

    // Actions
    fetchSalaryData,
    calculateMonthlySalary,
    setSalaryInfo,
    addSalaryAdjustment,
    fetchAllSalaryCards,
    fetchSalaryAnalytics,
    setWorkingDays,

    // Computed values
    salaryBreakdown: calculateSalaryBreakdown(salaryData),
    salaryStatus: getSalaryStatus(),

    // Utilities
    formatCurrency,
    calculateSalaryBreakdown
  };
};

// Hook for salary management with real-time updates
export const useSalaryManagement = (options = {}) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({
    department: options.department || '',
    tag: options.tag || '',
    month: options.month || new Date().getMonth() + 1,
    year: options.year || new Date().getFullYear(),
    workingDays: options.workingDays || 22
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await api.get('/salary/calculate/all', {
        params: filters
      });
      
      if (response.data.success) {
        setData(response.data.data);
        return response.data.data;
      } else {
        throw new Error(response.data.error || 'Failed to fetch salary data');
      }
    } catch (err) {
      const errorMessage = err.response?.data?.error || err.message || 'Failed to fetch salary data';
      setError(errorMessage);
      return null;
    } finally {
      setLoading(false);
    }
  }, [filters]);

  // Update filters
  const updateFilters = useCallback((newFilters) => {
    setFilters(prev => ({ ...prev, ...newFilters }));
  }, []);

  // Export salary data
  const exportSalaryData = useCallback((format = 'csv') => {
    if (!data || !data.salaryCards) return;

    const csvData = data.salaryCards.map(card => ({
      'Employee ID': card.user.employeeId || formatEmployeeId(card.user.email) || card.user.id,
      'Employee Name': card.user.name,
      'Tag': card.user.tag,
      'Base Salary': card.salary.base,
      'Calculated Salary': card.salary.calculated.netPay,
      'Working Days': card.attendance.workingDays,
      'Attended Days': card.attendance.attendedDays,
      'Attendance Rate': `${card.attendance.attendanceRate}%`,
      'Currency': card.salary.currency,
      'Pay Grade': card.salary.payGrade
    }));

    if (format === 'csv') {
      const csv = [
        Object.keys(csvData[0]).join(','),
        ...csvData.map(row => Object.values(row).join(','))
      ].join('\n');

      const blob = new Blob([csv], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `salary-report-${filters.month}-${filters.year}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
    }
  }, [data, filters]);

  // Initial fetch
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    data,
    loading,
    error,
    filters,
    updateFilters,
    refresh: fetchData,
    exportSalaryData
  };
};
