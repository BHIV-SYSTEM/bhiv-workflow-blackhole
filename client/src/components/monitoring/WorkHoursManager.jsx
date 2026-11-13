import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { 
  Clock, 
  Play, 
  Pause, 
  Square, 
  Timer,
  Calendar,
  CheckCircle,
  AlertCircle,
  AlertTriangle,
  FileText,
  ArrowRight
} from 'lucide-react';
import { format, differenceInMinutes, startOfDay, isSameDay } from 'date-fns';
import { api } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '../../context/auth-context';
import EnhancedStartDayDialog from '../attendance/EnhancedStartDayDialog';
import { DayEndReportDialog } from './DayEndReportDialog';

export function WorkHoursManager({ employee }) {
  const navigate = useNavigate();
  const [workSession, setWorkSession] = useState(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [loading, setLoading] = useState(false);
  const [showStartDayDialog, setShowStartDayDialog] = useState(false);
  const [frozenProgress, setFrozenProgress] = useState(null); // freeze UI time when paused
  const [clientBreakMinutes, setClientBreakMinutes] = useState(0); // extra break tracking when backend has no session
  const [lastCheckedDate, setLastCheckedDate] = useState(null); // track date for midnight reset
  const [spamWarning, setSpamWarning] = useState(null); // warning for unended days
  const [showDayEndReport, setShowDayEndReport] = useState(false);
  const [dayEndReportData, setDayEndReportData] = useState(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [endDayAlert, setEndDayAlert] = useState(null);
  const { toast } = useToast();
  const { user } = useAuth();

  // Use current user if no employee prop is provided (for user dashboard)
  const currentEmployee = employee || user;

  const fetchDayEndReport = async () => {
    const empId = currentEmployee?._id || currentEmployee?.id;
    if (!empId) return;
    try {
      setLoadingReport(true);
      setShowDayEndReport(true);
      const summary = await api.get(`/users/${empId}/daily-summary`);
      setDayEndReportData(summary);
    } catch (err) {
      console.error('Failed to load day-end performance summary:', err);
    } finally {
      setLoadingReport(false);
    }
  };

  /**
   * Handle midnight reset - work session resets at 12 AM
   * Hours from unended sessions go to spam (pending admin validation)
   * MUST be defined before the useEffect that references it
   */
  const handleMidnightReset = useCallback(() => {
    if (!workSession || workSession.status === 'completed') {
      return;
    }

    console.log('🕛 Midnight reset triggered for unended work session');
    
    // Calculate hours worked until midnight
    const startTime = new Date(workSession.startTime);
    const midnight = startOfDay(new Date());
    const hoursWorked = differenceInMinutes(midnight, startTime) / 60;
    
    // Show warning about spam hours
    setSpamWarning({
      hoursWorked: Math.round(hoursWorked * 100) / 100,
      date: format(startTime, 'MMM dd, yyyy'),
      message: `Your ${Math.round(hoursWorked * 100) / 100}h work session was auto-ended at midnight. These hours are pending admin review (max 8h can be validated).`
    });
    
    toast({
      title: "⚠️ Work Session Auto-Ended",
      description: `Your session from ${format(startTime, 'MMM dd')} was auto-ended at midnight. ${Math.round(hoursWorked * 100) / 100}h sent to admin for review.`,
      variant: "destructive"
    });
    
    // Clear local state
    setWorkSession(null);
    setFrozenProgress(null);
    setClientBreakMinutes(0);
    
    // Clear localStorage
    try {
      const employeeId = currentEmployee?._id || currentEmployee?.id;
      if (employeeId) {
        const pauseStateKey = `workHoursPauseState_${employeeId}`;
        const breakKey = `workHoursClientBreak_${employeeId}_${new Date().toISOString().slice(0, 10)}`;
        localStorage.removeItem(pauseStateKey);
        localStorage.removeItem(breakKey);
      }
    } catch (e) {
      console.warn('Failed to clear work hours storage', e);
    }
  }, [workSession, currentEmployee, toast]);

  // Update current time every second and check for midnight reset
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setCurrentTime(now);
      
      // Check if we crossed midnight (date changed)
      if (lastCheckedDate && !isSameDay(now, lastCheckedDate)) {
        console.log('🕛 Midnight detected - resetting work session');
        handleMidnightReset();
      }
      setLastCheckedDate(now);
    }, 1000);
    
    // Initialize lastCheckedDate
    if (!lastCheckedDate) {
      setLastCheckedDate(new Date());
    }
    
    return () => clearInterval(timer);
  }, [lastCheckedDate, handleMidnightReset]);

  // Fetch current work session
  useEffect(() => {
    if (currentEmployee) {
      fetchWorkSession();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentEmployee]);

  // Load any client-side break minutes (for attendance-only days) and pause state
  useEffect(() => {
    if (!currentEmployee) return;

    const dateKey = new Date().toISOString().slice(0, 10);
    const breakKey = `workHoursClientBreak_${currentEmployee._id || currentEmployee.id}_${dateKey}`;

    try {
      const storedBreak = localStorage.getItem(breakKey);
      if (storedBreak) {
        const parsed = parseInt(storedBreak, 10);
        if (!isNaN(parsed) && parsed >= 0) {
          setClientBreakMinutes(parsed);
        }
      }
    } catch (e) {
      console.warn('Failed to load client break minutes', e);
    }

    // We still restore pause UI state in the next effect when workSession is available
  }, [currentEmployee]);

  // Restore pause state from localStorage after refresh so time stays frozen until user resumes
  useEffect(() => {
    if (!currentEmployee || !workSession) return;

    try {
      const key = `workHoursPauseState_${currentEmployee._id || currentEmployee.id}`;
      const raw = localStorage.getItem(key);
      if (!raw) return;

      const stored = JSON.parse(raw);
      if (!stored || !stored.paused) return;

      // Apply stored paused status and frozen progress
      setWorkSession(prev => prev ? { ...prev, status: 'paused' } : prev);
      if (stored.frozenProgress) {
        setFrozenProgress(stored.frozenProgress);
      }
    } catch (e) {
      console.warn('Failed to restore work hours pause state', e);
    }
  }, [currentEmployee, workSession]);

  const fetchWorkSession = async () => {
    try {
      // First check the monitoring system
      const monitoringResponse = await api.get(
        `/monitoring/work-session/${currentEmployee._id || currentEmployee.id}`
      );
      
      if (monitoringResponse) {
        setWorkSession(monitoringResponse);
        return;
      }
    } catch {
      console.log('No monitoring session found, checking attendance system...');
    }

    try {
      // If no monitoring session, check attendance system
      const attendanceResponse = await api.get(
        `/attendance/verify/${currentEmployee._id || currentEmployee.id}`
      );
      
      if (attendanceResponse.success && attendanceResponse.data) {
        const attendance = attendanceResponse.data;
        
        // If day is started in attendance but no monitoring session, create a mock session
        if (attendance.startDayTime && !attendance.endDayTime) {
          const mockSession = {
            status: 'active',
            startTime: attendance.startDayTime,
            targetHours: 8,
            workLocation: attendance.workPattern === 'Remote' ? 'Home' : 'Office'
          };
          setWorkSession(mockSession);
        } else if (attendance.endDayTime) {
          const mockSession = {
            status: 'completed',
            startTime: attendance.startDayTime,
            endTime: attendance.endDayTime,
            targetHours: 8,
            workLocation: attendance.workPattern === 'Remote' ? 'Home' : 'Office'
          };
          setWorkSession(mockSession);
        } else {
          setWorkSession(null);
        }
      } else {
        setWorkSession(null);
      }
    } catch (error) {
      console.error('Error fetching attendance data:', error);
      setWorkSession(null);
    }
  };

  const handleStartWorkDayClick = () => {
    // Show the location popup dialog instead of directly starting
    setShowStartDayDialog(true);
  };

  const onStartDaySuccess = async (data) => {
    // After successful location validation, try to start the monitoring work session
    setLoading(true);
    try {
      // Try to start monitoring session
      const response = await api.post(
        `/monitoring/work-session/start`,
        {
          employeeId: currentEmployee._id || currentEmployee.id,
          startTime: new Date(),
          targetHours: 8, // Default 8-hour work day
          workLocation: data.workLocationType || 'Office'
        }
      );
      
      setWorkSession(response);
    } catch (error) {
      console.log('Monitoring session start failed, using attendance data:', error);
      // If monitoring session fails, create a mock session from attendance data
      const mockSession = {
        status: 'active',
        startTime: new Date(),
        targetHours: 8,
        workLocation: data.workLocationType || 'Office'
      };
      setWorkSession(mockSession);
    }

    toast({
      title: "Work Day Started",
      description: `Your work day has begun${data.workLocationType === 'Home' ? ' from home' : ' from office'}!`,
    });
    
    setShowStartDayDialog(false);
    
    // Refresh the work session to get the latest data
    setTimeout(() => {
      fetchWorkSession();
    }, 1000);
    
    setLoading(false);
  };

  const pauseWorkDay = async () => {
    setLoading(true);
    try {
      console.log('Attempting to pause work day for employee:', currentEmployee._id || currentEmployee.id);
      // Freeze current progress for UI so time appears stopped immediately
      const currentProgress = getWorkProgress();
      setFrozenProgress(currentProgress);

      // Persist pause state so it survives refresh
      try {
        const pauseKey = `workHoursPauseState_${currentEmployee._id || currentEmployee.id}`;
        localStorage.setItem(
          pauseKey,
          JSON.stringify({
            paused: true,
            frozenProgress: currentProgress,
            pausedAt: new Date().toISOString(),
          })
        );
      } catch (e) {
        console.warn('Failed to persist work hours pause state', e);
      }
      
      await api.post(
        `/monitoring/work-session/pause`,
        { employeeId: currentEmployee._id || currentEmployee.id }
      );
      
      console.log('Pause successful, updating local session state...');
      
      // Optimistically update local session so UI changes immediately
      setWorkSession(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          status: 'paused',
          pausedAt: new Date().toISOString(),
        };
      });

      toast({
        title: "⏸️ Work Day Paused",
        description: "Your work session has been paused.",
      });
    } catch (error) {
      console.error('Error pausing work day:', error);
      const errorData = error.response?.data || error;
      toast({
        title: "❌ Error",
        description: errorData?.error || errorData?.message || "Failed to pause work day.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const resumeWorkDay = async () => {
    setLoading(true);
    try {
      console.log('Attempting to resume work day for employee:', currentEmployee._id || currentEmployee.id);
      
      await api.post(
        `/monitoring/work-session/resume`,
        { employeeId: currentEmployee._id || currentEmployee.id }
      );
      
      console.log('Resume successful, updating local session state...');

      // Un-freeze progress so it starts updating again
      setFrozenProgress(null);

      // Clear persisted pause state
      try {
        const employeeId = currentEmployee._id || currentEmployee.id;
        const pauseKey = `workHoursPauseState_${employeeId}`;
        const dateKey = new Date().toISOString().slice(0, 10);
        const breakKey = `workHoursClientBreak_${employeeId}_${dateKey}`;

        // Before clearing, read pausedAt to calculate extra break minutes
        const rawPause = localStorage.getItem(pauseKey);
        if (rawPause) {
          const parsed = JSON.parse(rawPause);
          if (parsed?.paused && parsed.pausedAt) {
            const pausedAt = new Date(parsed.pausedAt);
            const now = new Date();
            const extra = Math.max(differenceInMinutes(now, pausedAt), 0);
            if (extra > 0) {
              setClientBreakMinutes(prev => {
                const updated = prev + extra;
                try {
                  localStorage.setItem(breakKey, String(updated));
                } catch (e) {
                  console.warn('Failed to persist client break minutes', e);
                }
                return updated;
              });
            }
          }
        }

        // Now clear pause marker
        localStorage.removeItem(pauseKey);
      } catch (e) {
        console.warn('Failed to clear work hours pause state', e);
      }

      // Optimistically update local session so UI changes immediately.
      setWorkSession(prev => {
        if (!prev) return prev;

        return {
          ...prev,
          status: 'active',
          pausedAt: null,
          resumedAt: new Date().toISOString(),
        };
      });

      toast({
        title: "▶️ Work Day Resumed",
        description: "Your work session has been resumed.",
      });
    } catch (error) {
      console.error('Error resuming work day:', error);
      const errorData = error.response?.data || error;
      toast({
        title: "❌ Error",
        description: errorData?.error || errorData?.message || "Failed to resume work day.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const endWorkDay = async () => {
    setLoading(true);
    try {
      console.log('Attempting to end work day for employee:', currentEmployee._id || currentEmployee.id);
      
      // First try to end monitoring work session
      const response = await api.post(
        `/monitoring/work-session/end`,
        { employeeId: currentEmployee._id || currentEmployee.id }
      );
      
      console.log('Monitoring end day response:', response);
      
      if (response && (response.success || response.data?.success)) {
        setWorkSession(null);
        try {
          const empId = currentEmployee._id || currentEmployee.id;
          localStorage.removeItem(`workHoursPauseState_${empId}`);
        } catch (e) {}
        toast({
          title: "✅ Work Day Ended",
          description: response.message || response.data?.message || "Your work session has been completed.",
        });
        
        // Immediately fetch and display the Day-End Performance Report dialog
        fetchDayEndReport();

        // Force refresh
        setTimeout(() => {
          fetchWorkSession();
        }, 500);
        
        setLoading(false);
        return;
      }
    } catch (error) {
      const errorData = error.response?.data || error;
      const errorMessage = errorData?.error || errorData?.message || error.message || '';

      // If progress is not set, stop immediately and ask user to log progress
      if (errorData?.code === 'PROGRESS_NOT_SET' || errorMessage.includes('PROGRESS_NOT_SET') || errorMessage.includes('daily progress')) {
        setLoading(false);
        setEndDayAlert({
          title: "Daily Progress Update Required",
          message: "Please submit your daily progress (notes, achievements, or blockers) in the Progress tab before ending your work day.",
          actionLabel: "Go to Progress Tab",
          actionPath: "/progress"
        });
        toast({
          title: "❌ Progress Update Required",
          description: "Please update your daily progress in the Progress tab before ending your work day.",
          variant: "destructive"
        });
        return;
      }

      console.log('Monitoring session end failed, trying attendance system...', error);
      
      // If no monitoring session found (check for various error messages), try to end via attendance system
      const noSessionErrors = [
        'SESSION_NOT_FOUND',
        'NO_ACTIVE_SESSION', 
        'No active work session found',
        'No monitoring session found'
      ];
      
      const shouldTryAttendance = 
        noSessionErrors.some(msg => 
          errorData?.code === msg || 
          errorMessage.includes(msg) || 
          errorMessage.includes('No active')
        ) || !workSession?.startTime;
      
      if (shouldTryAttendance) {
        try {
          console.log('Trying attendance end day...');
          
          const attendanceResponse = await api.post(
            `/attendance/end-day/${currentEmployee._id || currentEmployee.id}`,
            {} // Empty body, location will be handled by the backend if needed
          );
          
          console.log('Attendance end day response:', attendanceResponse);
          
          if (attendanceResponse && (attendanceResponse.success || attendanceResponse.data?.success)) {
            setWorkSession(null);
            try {
              const empId = currentEmployee._id || currentEmployee.id;
              localStorage.removeItem(`workHoursPauseState_${empId}`);
            } catch (e) {}
            toast({
              title: "✅ Work Day Ended",
              description: attendanceResponse.message || attendanceResponse.data?.message || "Your work day has been completed.",
            });
            
            // Immediately fetch and display the Day-End Performance Report dialog
            fetchDayEndReport();

            // Force refresh
            setTimeout(() => {
              fetchWorkSession();
            }, 500);
            
            setLoading(false);
            return;
          }
        } catch (attendanceError) {
          console.error('Attendance end day error:', attendanceError);
          
          const attendanceErrorData = attendanceError.response?.data || attendanceError;
          const attendanceErrorMessage = attendanceErrorData?.error || attendanceErrorData?.message || attendanceError.message || '';
          
          setLoading(false);
          
          // Check for progress not set error (by code OR message content)
          if (attendanceErrorData?.code === 'PROGRESS_NOT_SET' || 
              attendanceErrorMessage.includes('set your daily progress') ||
              attendanceErrorMessage.includes('PROGRESS_NOT_SET')) {
            setEndDayAlert({
              title: "Daily Progress Update Required",
              message: "Please submit your daily progress (notes, achievements, or blockers) in the Progress tab before ending your work day.",
              actionLabel: "Go to Progress Tab",
              actionPath: "/progress"
            });
            toast({
              title: "❌ Progress Required",
              description: "Please set your daily progress before ending your work day.",
              variant: "destructive"
            });
          } else if (attendanceErrorData?.code === 'AIM_NOT_COMPLETED') {
            console.log('Aim details from backend:', attendanceErrorData.aim);
            setEndDayAlert({
              title: "Daily Aim Not Completed",
              message: `Please update or complete your daily aim before ending your work day. Current status: ${attendanceErrorData.aim?.completionStatus || 'Pending'}`,
              actionLabel: "Go to Set Aims",
              actionPath: "/aims"
            });
            toast({
              title: "❌ Aim Not Completed",
              description: `Please complete your daily aim before ending your work day. Current status: ${attendanceErrorData.aim?.completionStatus || 'Unknown'}`,
              variant: "destructive"
            });
          } else if (attendanceErrorData?.code === 'AIM_COMMENT_MISSING') {
            setEndDayAlert({
              title: "Completion Comment Required",
              message: "Please add a completion comment for your daily aim before ending your work day.",
              actionLabel: "Go to Set Aims",
              actionPath: "/aims"
            });
            toast({
              title: "❌ Completion Comment Required",
              description: "Please add a completion comment for your aim.",
              variant: "destructive"
            });
          } else {
            const errDesc = attendanceErrorData?.error || attendanceErrorData?.message || "Failed to end work day.";
            setEndDayAlert({
              title: "Unable to End Work Day",
              message: errDesc,
            });
            toast({
              title: "❌ Error",
              description: errDesc,
              variant: "destructive"
            });
          }
          return;
        }
      }
      
      setLoading(false);
      
      // Handle other monitoring system errors
      if (errorData?.code === 'PROGRESS_NOT_SET') {
        setEndDayAlert({
          title: "Daily Progress Update Required",
          message: "Please submit your daily progress in the Progress tab before ending your work session.",
          actionLabel: "Go to Progress Tab",
          actionPath: "/progress"
        });
        toast({
          title: "❌ Progress Required",
          description: "Please set your daily progress before ending your work session.",
          variant: "destructive"
        });
      } else if (errorData?.code === 'NO_ACTIVE_SESSION') {
        // Already ended
        setWorkSession(null);
        toast({
          title: "ℹ️ No Active Session",
          description: "Your work day has already ended or was not started.",
        });
        setTimeout(() => {
          fetchWorkSession();
        }, 500);
      } else {
        const errDesc = errorData?.error || errorData?.message || "Failed to end work day. Check console for details.";
        setEndDayAlert({
          title: "Unable to End Work Day",
          message: errDesc,
        });
        toast({
          title: "❌ Error",
          description: errDesc,
          variant: "destructive"
        });
      }
    } finally {
      setLoading(false);
    }
  };

  // Calculate work progress
  const getWorkProgress = () => {
    // If currently paused and we have a frozen snapshot, return it so UI time doesn't move
    if (workSession && workSession.status === 'paused' && frozenProgress) {
      return frozenProgress;
    }

    if (!workSession || !workSession.startTime) {
      return { hours: 0, minutes: 0, percentage: 0 };
    }
    
    const startTime = new Date(workSession.startTime);
    // For completed sessions, stop at endTime; otherwise use current time
    const referenceTime =
      workSession.status === 'completed' && workSession.endTime
        ? new Date(workSession.endTime)
        : currentTime;

    // Total minutes from start until now / end
    let totalMinutes = Math.max(differenceInMinutes(referenceTime, startTime), 0);

    // Break minutes: backend-tracked + client-tracked (for attendance-only days)
    let breakMinutes = (workSession.totalBreakTime || 0) + (clientBreakMinutes || 0);

    // If currently paused and we have a backend pausedAt, also subtract the ongoing paused duration
    if (workSession.status === 'paused' && workSession.pausedAt) {
      const pausedAt = new Date(workSession.pausedAt);
      const currentPause = Math.max(differenceInMinutes(currentTime, pausedAt), 0);
      breakMinutes += currentPause;
    }

    const activeMinutes = Math.max(totalMinutes - breakMinutes, 0);
    const totalHours = activeMinutes / 60;
    const targetHours = workSession.targetHours || 8;
    const percentage = Math.min((totalHours / targetHours) * 100, 100);
    
    return {
      hours: Math.floor(activeMinutes / 60),
      minutes: activeMinutes % 60,
      percentage,
      remaining: Math.max(targetHours - totalHours, 0),
    };
  };

  const progress = getWorkProgress();
  // Be defensive: some sessions may not have a status field yet, treat them as active
  const effectiveStatus = workSession?.status || 'active';
  const isWorkDayActive = !!workSession && effectiveStatus === 'active';
  const isWorkDayPaused = !!workSession && effectiveStatus === 'paused';
  const isWorkDayCompleted = !!workSession && effectiveStatus === 'completed';

  // Unified handler so the same button can pause or resume based on current status
  const togglePauseResume = async () => {
    if (!workSession || loading) return;

    if (isWorkDayPaused) {
      await resumeWorkDay();
    } else if (isWorkDayActive) {
      await pauseWorkDay();
    }
  };

  return (
    <Card className="neo-card border-primary/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Timer className="h-5 w-5 text-primary" />
          Work Hours Manager
          {isWorkDayActive && (
            <Badge variant="default" className="ml-auto animate-pulse">
              Active
            </Badge>
          )}
          {isWorkDayPaused && (
            <Badge variant="secondary" className="ml-auto">
              Paused
            </Badge>
          )}
          {isWorkDayCompleted && (
            <Badge variant="outline" className="ml-auto">
              Completed
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Current Time */}
        <div className="text-center">
          <p className="text-2xl font-mono font-bold text-foreground">
            {format(currentTime, 'HH:mm:ss')}
          </p>
          <p className="text-sm text-muted-foreground">
            {format(currentTime, 'EEEE, MMMM do, yyyy')}
          </p>
        </div>

        {/* Work Progress */}
        {workSession && (
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium">Total Hours Worked</span>
              <span className="text-sm font-semibold text-foreground">
                {progress.hours}h {progress.minutes}m
              </span>
            </div>
          </div>
        )}

        {/* Spam Warning - for unended sessions */}
        {spamWarning && (
          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 space-y-2">
            <div className="flex items-center gap-2 text-yellow-600">
              <AlertTriangle className="h-4 w-4" />
              <span className="text-sm font-medium">Hours Pending Review</span>
            </div>
            <p className="text-xs text-muted-foreground">
              {spamWarning.message}
            </p>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setSpamWarning(null)}
              className="text-xs"
            >
              Dismiss
            </Button>
          </div>
        )}

        {/* Midnight Warning when session is active late at night */}
        {workSession && !isWorkDayCompleted && currentTime.getHours() >= 23 && (
          <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-3">
            <div className="flex items-center gap-2 text-orange-600">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm font-medium">End Day Reminder</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Please end your day before midnight! Unended sessions are auto-closed at 12 AM and hours go to spam (max 8h can be approved by admin).
            </p>
          </div>
        )}

        {/* Control Buttons */}
        <div className="flex gap-2">
          {!workSession && (
            <Button 
              onClick={handleStartWorkDayClick} 
              disabled={loading}
              className="flex-1"
            >
              <Play className="h-4 w-4 mr-2" />
              Start Work Day
            </Button>
          )}
          
          {/* Show Pause/Resume + End while there is an ongoing session (active or paused) */}
          {workSession && !isWorkDayCompleted && (
            <>
              <Button 
                onClick={togglePauseResume} 
                disabled={loading}
                variant={isWorkDayPaused ? "default" : "outline"}
                className="flex-1"
              >
                {isWorkDayPaused ? (
                  <>
                    <Play className="h-4 w-4 mr-2" />
                    Resume
                  </>
                ) : (
                  <>
                <Pause className="h-4 w-4 mr-2" />
                Pause
            </>
          )}
              </Button>
              <Button 
                onClick={endWorkDay} 
                disabled={loading}
                variant="destructive"
                className="flex-1"
              >
                <Square className="h-4 w-4 mr-2" />
                End Day
              </Button>
            </>
          )}
          
          {isWorkDayCompleted && (
            <div className="flex flex-col sm:flex-row gap-2 w-full">
              <Button 
                onClick={fetchDayEndReport} 
                variant="outline"
                className="flex-1 border-primary/40 hover:bg-primary/10 text-primary font-medium flex items-center justify-center gap-1.5"
              >
                <FileText className="h-4 w-4" />
                View Day-End Report
              </Button>
              <Button 
                onClick={handleStartWorkDayClick} 
                disabled={loading}
                className="flex-1"
              >
                <Play className="h-4 w-4 mr-2" />
                Start New Day
              </Button>
            </div>
          )}
        </div>

        {/* Work Session Info */}
        {workSession && (
          <div className="text-xs text-muted-foreground space-y-1">
            <p>Started: {format(new Date(workSession.startTime), 'HH:mm')}</p>
            {workSession.endTime && (
              <p>Ended: {format(new Date(workSession.endTime), 'HH:mm')}</p>
            )}
          </div>
        )}
      </CardContent>

      {/* Enhanced Start Day Dialog with Location Popup */}
      <EnhancedStartDayDialog
        isOpen={showStartDayDialog}
        onClose={() => setShowStartDayDialog(false)}
        onStartDay={onStartDaySuccess}
        user={currentEmployee}
      />

      {/* Day-End Performance & Output Report Dialog */}
      <DayEndReportDialog
        isOpen={showDayEndReport}
        onClose={() => setShowDayEndReport(false)}
        reportData={dayEndReportData}
        isLoading={loadingReport}
      />

      {/* End-Day Validation / Blocking Alert Dialog */}
      <Dialog open={!!endDayAlert} onOpenChange={(open) => !open && setEndDayAlert(null)}>
        <DialogContent className="w-[95vw] max-w-md border border-border bg-card text-card-foreground shadow-2xl rounded-2xl p-6">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-1">
              <div className="h-10 w-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-500 shrink-0">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <DialogTitle className="text-lg font-bold text-foreground">
                {endDayAlert?.title || "Action Required"}
              </DialogTitle>
            </div>
            <DialogDescription className="text-sm text-muted-foreground pt-1 leading-relaxed">
              {endDayAlert?.message}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="pt-4 flex flex-col sm:flex-row gap-2 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => setEndDayAlert(null)}
              className="w-full sm:w-auto"
            >
              Close
            </Button>
            {endDayAlert?.actionPath && (
              <Button
                type="button"
                onClick={() => {
                  const target = endDayAlert.actionPath;
                  setEndDayAlert(null);
                  navigate(target);
                }}
                className="w-full sm:w-auto flex items-center justify-center gap-1.5 font-semibold"
              >
                {endDayAlert.actionLabel || "Continue"}
                <ArrowRight className="h-4 w-4" />
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
