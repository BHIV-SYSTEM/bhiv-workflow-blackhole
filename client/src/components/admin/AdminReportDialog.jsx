"use client"

import { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog"
import { Button } from "../ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card"
import { Badge } from "../ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs"
import { 
  Loader2, 
  FileText, 
  Users, 
  Target, 
  Building2, 
  CheckCircle, 
  Clock, 
  AlertCircle,
  Calendar as CalendarIcon,
  TrendingUp,
  UserCheck,
  UserX,
  ChevronLeft,
  ChevronRight,
  Download
} from "lucide-react"
import { api } from "../../lib/api"
import { useToast } from "../../hooks/use-toast"
import { format, addDays, subDays } from "date-fns"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table"
import { CreateTaskDialog } from "../tasks/create-task-dialog"
import { Calendar } from "../ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover"
import { formatEmployeeId } from "../../lib/employeeId"

export function AdminReportDialog({ open, onOpenChange }) {
  const { toast } = useToast()
  const [dateFilter, setDateFilter] = useState("custom")
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [reportData, setReportData] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isCreateTaskOpen, setIsCreateTaskOpen] = useState(false)
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(null)
  const [currentTime, setCurrentTime] = useState(new Date())
  const [isCalendarOpen, setIsCalendarOpen] = useState(false)

  const getDateRange = () => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    
    switch (dateFilter) {
      case "today":
        return format(today, "yyyy-MM-dd")
      case "yesterday":
        const yesterday = new Date(today)
        yesterday.setDate(yesterday.getDate() - 1)
        return format(yesterday, "yyyy-MM-dd")
      case "weekly":
        const weekStart = new Date(today)
        weekStart.setDate(today.getDate() - today.getDay())
        return format(weekStart, "yyyy-MM-dd")
      case "lifetime":
        return null // No date filter for lifetime
      case "custom":
        return format(selectedDate, "yyyy-MM-dd")
      default:
        return format(today, "yyyy-MM-dd")
    }
  }

  // Navigate to previous date
  const handlePreviousDate = () => {
    setSelectedDate(prev => subDays(prev, 1))
    setDateFilter("custom")
  }

  // Navigate to next date
  const handleNextDate = () => {
    const tomorrow = addDays(selectedDate, 1)
    const today = new Date()
    today.setHours(23, 59, 59, 999)
    if (tomorrow <= today) {
      setSelectedDate(tomorrow)
      setDateFilter("custom")
    }
  }

  // Handle date selection from calendar
  const handleDateSelect = (date) => {
    if (date) {
      setSelectedDate(date)
      setDateFilter("custom")
      setIsCalendarOpen(false)
    }
  }

  // Handle quick filter selection
  const handleQuickFilter = (filter) => {
    setDateFilter(filter)
    if (filter === "today") {
      setSelectedDate(new Date())
    } else if (filter === "yesterday") {
      setSelectedDate(subDays(new Date(), 1))
    }
  }

  const fetchReport = async () => {
    try {
      setIsLoading(true)
      const dateStr = getDateRange()
      console.log("Fetching report with:", { dateStr, dateFilter })
      const data = await api.dashboard.getAdminReport(dateStr, dateFilter)
      console.log("Report data received:", data)
      if (!data) {
        throw new Error("No data received from server")
      }
      setReportData(data)
    } catch (error) {
      console.error("Error fetching report:", error)
      toast({
        title: "Error",
        description: error.message || "Failed to load report data",
        variant: "destructive",
      })
      setReportData(null)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (open) {
      fetchReport()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, dateFilter, selectedDate])

  // Update current time every second for real-time hours calculation
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date())
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  const formatTime = (dateString) => {
    if (!dateString) return "N/A"
    return format(new Date(dateString), "h:mm a")
  }

  const formatHours = (hours) => {
    if (!hours) return "0h"
    const h = Math.floor(hours)
    const m = Math.round((hours - h) * 60)
    return m > 0 ? `${h}h ${m}m` : `${h}h`
  }

  // Calculate real-time hours from start time
  const calculateRealTimeHours = (startTime) => {
    if (!startTime) return 0
    const start = new Date(startTime)
    const end = currentTime
    const hours = Math.max(0, (end - start) / (1000 * 60 * 60))
    return hours
  }

  // Get total hours - real-time for today if day is active, otherwise overall
  const getTotalHours = (user) => {
    // Only show real-time for "today" filter and if day hasn't ended
    const today = new Date()
    const isToday = format(selectedDate, "yyyy-MM-dd") === format(today, "yyyy-MM-dd")
    if (isToday && !user.endDayTime) {
      return calculateRealTimeHours(user.startDayTime)
    }
    // Otherwise show the stored total hours
    return user.totalHoursWorked || 0
  }

  const getFilterLabel = () => {
    switch (dateFilter) {
      case "today":
        return format(new Date(), "MMMM d, yyyy")
      case "yesterday":
        const yesterday = new Date()
        yesterday.setDate(yesterday.getDate() - 1)
        return format(yesterday, "MMMM d, yyyy")
      case "weekly":
        return "This Week"
      case "lifetime":
        return "All Time"
      case "custom":
        return format(selectedDate, "MMMM d, yyyy")
      default:
        return format(selectedDate, "MMMM d, yyyy")
    }
  }

  // Download report as CSV
  const downloadCSV = () => {
    if (!reportData) return

    let csvContent = "data:text/csv;charset=utf-8,"
    
    // Dashboard Stats
    csvContent += "ADMIN DASHBOARD REPORT\n"
    csvContent += `Report Date,${getFilterLabel()}\n`
    csvContent += `Generated At,${format(new Date(), "PPpp")}\n\n`
    
    csvContent += "DASHBOARD STATISTICS\n"
    csvContent += "Metric,Value\n"
    csvContent += `Total Tasks,${reportData.dashboardStats?.totalTasks || 0}\n`
    csvContent += `Completed Tasks,${reportData.dashboardStats?.completedTasks || 0}\n`
    csvContent += `In Progress Tasks,${reportData.dashboardStats?.inProgressTasks || 0}\n`
    csvContent += `Pending Tasks,${reportData.dashboardStats?.pendingTasks || 0}\n`
    csvContent += `Total Users,${reportData.dashboardStats?.totalUsers || 0}\n`
    csvContent += `Total Departments,${reportData.dashboardStats?.totalDepartments || 0}\n\n`
    
    // Department Task Counts
    csvContent += "DEPARTMENT-WISE TASK COUNT\n"
    csvContent += "Department,Total Tasks,Completed,In Progress,Pending\n"
    reportData.departmentTaskCounts?.forEach(dept => {
      csvContent += `${dept.name},${dept.totalTasks},${dept.completedTasks},${dept.inProgressTasks},${dept.pendingTasks}\n`
    })
    csvContent += "\n"
    
    // Present Users (Users with Start Day)
    csvContent += "PRESENT USERS\n"
    csvContent += "Employee ID,Name,Email,Start Time,End Time,Hours Worked,Work Location\n"
    reportData.usersWithStartDay?.forEach(user => {
      const hours = formatHours(getTotalHours(user))
      const empId = user.employeeId || formatEmployeeId(user.userEmail)
      csvContent += `${empId},${user.userName},${user.userEmail},${user.startDayTime ? formatTime(user.startDayTime) : "N/A"},${user.endDayTime ? formatTime(user.endDayTime) : "Active"},${hours},${user.workLocationType || "N/A"}\n`
    })
    csvContent += "\n"
    
    // Absent Users
    const presentUserIds = new Set(reportData.usersWithStartDay?.map(u => u.userId) || [])
    const absentUsers = reportData.usersWithAims?.filter(u => !presentUserIds.has(u.userId)) || []
    csvContent += "ABSENT USERS\n"
    csvContent += "Employee ID,Name,Email,Role,Department\n"
    absentUsers.forEach(user => {
      const empId = user.employeeId || formatEmployeeId(user.email)
      csvContent += `${empId},${user.name},${user.email},${user.role},${user.department}\n`
    })
    csvContent += "\n"
    
    // Zero Task Employees
    csvContent += "EMPLOYEES WITH ZERO TASKS\n"
    csvContent += "Employee ID,Name,Email,Role,Department\n"
    reportData.zeroTaskEmployees?.forEach(emp => {
      const empId = emp.employeeId || formatEmployeeId(emp.email)
      csvContent += `${empId},${emp.name},${emp.email},${emp.role},${emp.department}\n`
    })
    csvContent += "\n"
    
    // Progress Updates
    csvContent += "PROGRESS UPDATES\n"
    csvContent += "Employee ID,User,Email,Task,Progress %,Notes,Time\n"
    reportData.userProgressUpdates?.forEach(progress => {
      const empId = progress.employeeId || formatEmployeeId(progress.userEmail)
      const notes = progress.notes ? progress.notes.replace(/,/g, ";").replace(/\n/g, " ") : ""
      csvContent += `${empId},${progress.userName},${progress.userEmail},${progress.taskTitle},${progress.progressPercentage}%,"${notes}",${format(new Date(progress.createdAt), "h:mm a")}\n`
    })
    
    // Create download link
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement("a")
    link.setAttribute("href", encodedUri)
    link.setAttribute("download", `admin_report_${format(selectedDate, "yyyy-MM-dd")}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    
    toast({
      title: "Report Downloaded",
      description: "CSV report has been downloaded successfully",
    })
  }

  // Download report as PDF (using print functionality)
  const downloadPDF = () => {
    if (!reportData) return

    // Create a printable version of the report
    const printWindow = window.open("", "_blank")
    
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Admin Report - ${getFilterLabel()}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; color: #333; }
          h1 { color: #1a1a1a; border-bottom: 2px solid #3b82f6; padding-bottom: 10px; }
          h2 { color: #374151; margin-top: 30px; border-bottom: 1px solid #e5e7eb; padding-bottom: 5px; }
          table { width: 100%; border-collapse: collapse; margin: 15px 0; }
          th, td { border: 1px solid #e5e7eb; padding: 10px; text-align: left; }
          th { background: #f3f4f6; font-weight: 600; }
          tr:nth-child(even) { background: #f9fafb; }
          .stats-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin: 20px 0; }
          .stat-card { background: #f3f4f6; padding: 15px; border-radius: 8px; text-align: center; }
          .stat-value { font-size: 24px; font-weight: bold; color: #3b82f6; }
          .stat-label { color: #6b7280; font-size: 14px; }
          .badge { display: inline-block; padding: 3px 8px; border-radius: 4px; font-size: 12px; }
          .badge-green { background: #dcfce7; color: #166534; }
          .badge-red { background: #fee2e2; color: #991b1b; }
          .badge-orange { background: #ffedd5; color: #9a3412; }
          .badge-blue { background: #dbeafe; color: #1e40af; }
          .meta { color: #6b7280; font-size: 14px; margin-bottom: 20px; }
          @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
        </style>
      </head>
      <body>
        <h1>Admin Dashboard Report</h1>
        <p class="meta">Report Date: ${getFilterLabel()} | Generated: ${format(new Date(), "PPpp")}</p>
        
        <h2>Dashboard Statistics</h2>
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-value">${reportData.dashboardStats?.totalTasks || 0}</div>
            <div class="stat-label">Total Tasks</div>
          </div>
          <div class="stat-card">
            <div class="stat-value" style="color: #22c55e;">${reportData.dashboardStats?.completedTasks || 0}</div>
            <div class="stat-label">Completed</div>
          </div>
          <div class="stat-card">
            <div class="stat-value" style="color: #f97316;">${reportData.dashboardStats?.inProgressTasks || 0}</div>
            <div class="stat-label">In Progress</div>
          </div>
          <div class="stat-card">
            <div class="stat-value" style="color: #ef4444;">${reportData.dashboardStats?.pendingTasks || 0}</div>
            <div class="stat-label">Pending</div>
          </div>
          <div class="stat-card">
            <div class="stat-value" style="color: #8b5cf6;">${reportData.dashboardStats?.totalUsers || 0}</div>
            <div class="stat-label">Total Users</div>
          </div>
          <div class="stat-card">
            <div class="stat-value" style="color: #6366f1;">${reportData.dashboardStats?.totalDepartments || 0}</div>
            <div class="stat-label">Departments</div>
          </div>
        </div>
        
        <h2>Department-wise Task Count</h2>
        <table>
          <thead>
            <tr>
              <th>Department</th>
              <th>Total Tasks</th>
              <th>Completed</th>
              <th>In Progress</th>
              <th>Pending</th>
            </tr>
          </thead>
          <tbody>
            ${reportData.departmentTaskCounts?.map(dept => `
              <tr>
                <td>${dept.name}</td>
                <td>${dept.totalTasks}</td>
                <td><span class="badge badge-green">${dept.completedTasks}</span></td>
                <td><span class="badge badge-orange">${dept.inProgressTasks}</span></td>
                <td><span class="badge badge-red">${dept.pendingTasks}</span></td>
              </tr>
            `).join("") || ""}
          </tbody>
        </table>
        
        <h2>Present Users (${reportData.usersWithStartDay?.length || 0})</h2>
        <table>
          <thead>
            <tr>
              <th>Employee ID</th>
              <th>Name</th>
              <th>Email</th>
              <th>Start Time</th>
              <th>End Time</th>
              <th>Hours Worked</th>
              <th>Work Location</th>
            </tr>
          </thead>
          <tbody>
            ${reportData.usersWithStartDay?.map(user => `
              <tr>
                <td><strong>${user.employeeId || formatEmployeeId(user.userEmail)}</strong></td>
                <td>${user.userName}</td>
                <td>${user.userEmail}</td>
                <td>${user.startDayTime ? formatTime(user.startDayTime) : "N/A"}</td>
                <td>${user.endDayTime ? formatTime(user.endDayTime) : "Active"}</td>
                <td>${formatHours(getTotalHours(user))}</td>
                <td><span class="badge badge-blue">${user.workLocationType === "Home" || user.workLocationType === "Remote" ? "WFH" : "Office"}</span></td>
              </tr>
            `).join("") || "<tr><td colspan='7'>No users present</td></tr>"}
          </tbody>
        </table>
        
        <h2>Absent Users (${((reportData.dashboardStats?.totalUsers || 0) - (reportData.usersWithStartDay?.length || 0))})</h2>
        <table>
          <thead>
            <tr>
              <th>Employee ID</th>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Department</th>
            </tr>
          </thead>
          <tbody>
            ${(() => {
              const presentIds = new Set(reportData.usersWithStartDay?.map(u => u.userId) || [])
              const absent = reportData.usersWithAims?.filter(u => !presentIds.has(u.userId)) || []
              return absent.length > 0 
                ? absent.map(user => `
                    <tr>
                      <td><strong>${user.employeeId || formatEmployeeId(user.email)}</strong></td>
                      <td>${user.name}</td>
                      <td>${user.email}</td>
                      <td>${user.role}</td>
                      <td>${user.department}</td>
                    </tr>
                  `).join("")
                : "<tr><td colspan='5'>All users present</td></tr>"
            })()}
          </tbody>
        </table>
        
        <h2>Employees with Zero Tasks (${reportData.zeroTaskEmployees?.length || 0})</h2>
        <table>
          <thead>
            <tr>
              <th>Employee ID</th>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Department</th>
            </tr>
          </thead>
          <tbody>
            ${reportData.zeroTaskEmployees?.length > 0 
              ? reportData.zeroTaskEmployees.map(emp => `
                  <tr>
                    <td><strong>${emp.employeeId || formatEmployeeId(emp.email)}</strong></td>
                    <td>${emp.name}</td>
                    <td>${emp.email}</td>
                    <td>${emp.role}</td>
                    <td>${emp.department}</td>
                  </tr>
                `).join("")
              : "<tr><td colspan='5'>All employees have tasks</td></tr>"
            }
          </tbody>
        </table>
        
        <h2>Progress Updates (${reportData.userProgressUpdates?.length || 0})</h2>
        <table>
          <thead>
            <tr>
              <th>Employee ID</th>
              <th>User</th>
              <th>Task</th>
              <th>Progress</th>
              <th>Notes</th>
              <th>Time</th>
            </tr>
          </thead>
          <tbody>
            ${reportData.userProgressUpdates?.length > 0
              ? reportData.userProgressUpdates.map(progress => `
                  <tr>
                    <td><strong>${progress.employeeId || formatEmployeeId(progress.userEmail)}</strong></td>
                    <td>${progress.userName}</td>
                    <td>${progress.taskTitle}</td>
                    <td>${progress.progressPercentage}%</td>
                    <td>${progress.notes || "-"}</td>
                    <td>${format(new Date(progress.createdAt), "h:mm a")}</td>
                  </tr>
                `).join("")
              : "<tr><td colspan='6'>No progress updates</td></tr>"
            }
          </tbody>
        </table>
        
        <script>
          window.onload = function() {
            window.print();
          }
        </script>
      </body>
      </html>
    `
    
    printWindow.document.write(htmlContent)
    printWindow.document.close()
    
    toast({
      title: "PDF Report",
      description: "Print dialog opened. Save as PDF to download.",
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        className="max-w-[95vw] lg:max-w-7xl max-h-[95vh] overflow-hidden border border-border/70 bg-card/95 backdrop-blur-xl rounded-2xl shadow-2xl p-0"
      >
        <div className="flex flex-col h-[95vh]">
          <DialogHeader 
            className="sticky top-0 z-10 border-b border-border/70 bg-card/95 backdrop-blur-xl px-4 sm:px-6 pt-5 pb-4"
          >
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <DialogTitle className="text-xl sm:text-2xl font-bold text-foreground tracking-tight">
                    Admin Dashboard Report
                  </DialogTitle>
                  <DialogDescription className="mt-1 text-muted-foreground">
                    Comprehensive report for <span className="font-semibold text-primary">{getFilterLabel()}</span>
                  </DialogDescription>
                </div>
              </div>
              
              {/* Date Navigation & Filter Buttons */}
              <div className="flex flex-col gap-3 p-3 sm:p-4 rounded-xl border border-border/70 bg-muted/40 backdrop-blur-sm">
                {/* Date Picker with Navigation */}
                <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handlePreviousDate}
                    className="bg-background/70 border-border/70 text-foreground hover:bg-muted transition-all duration-200"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </Button>
                  
                  <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full sm:w-64 justify-center bg-primary/10 border-primary/30 hover:bg-primary/15 hover:border-primary/50 text-foreground font-semibold text-sm sm:text-base transition-all duration-200"
                      >
                        <CalendarIcon className="mr-2 sm:mr-3 h-4 w-4 sm:h-5 sm:w-5 text-primary shrink-0" />
                        <span className="truncate">{format(selectedDate, "EEEE, MMMM d, yyyy")}</span>
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 bg-popover border-border/70" align="center">
                      <Calendar
                        mode="single"
                        selected={selectedDate}
                        onSelect={handleDateSelect}
                        disabled={(date) => date > new Date()}
                        initialFocus
                        className="rounded-md bg-popover text-popover-foreground"
                      />
                    </PopoverContent>
                  </Popover>
                  
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleNextDate}
                    disabled={format(selectedDate, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd")}
                    className="bg-background/70 border-border/70 text-foreground hover:bg-muted transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </Button>
                  
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={fetchReport}
                    disabled={isLoading}
                    className="bg-background/70 border-border/70 text-foreground hover:bg-muted font-medium px-4 py-2 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Loading...
                      </>
                    ) : (
                      <>
                        <FileText className="mr-2 h-4 w-4" />
                        Refresh
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </DialogHeader>
          
          <div 
            className="flex-1 overflow-y-auto px-4 sm:px-6 pb-4 bg-background/40 custom-scrollbar"
          >

            {isLoading ? (
              <div className="flex items-center justify-center py-20">
                <div className="flex flex-col items-center gap-4">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <p className="text-muted-foreground">Loading report data...</p>
                </div>
              </div>
            ) : reportData ? (
              <div className="space-y-6 pt-6">
                {/* Main Dashboard Stats */}
                <Card className="border border-border/70 bg-card shadow-sm rounded-xl overflow-hidden">
                  <CardHeader className="border-b border-border/70 bg-muted/40">
                    <CardTitle className="flex items-center gap-2 text-foreground">
                      <div className="p-2 rounded-lg bg-primary/15 text-primary">
                        <TrendingUp className="h-5 w-5" />
                      </div>
                      Main Dashboard Statistics
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-6">
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
                      <div className="text-center p-4 sm:p-5 rounded-xl border border-blue-500/20 bg-blue-500/10 shadow-sm hover:shadow-md transition-all">
                        <div className="text-2xl sm:text-3xl font-bold text-blue-500 dark:text-blue-400 tabular-nums mb-1">{reportData.dashboardStats.totalTasks}</div>
                        <div className="text-xs sm:text-sm font-medium text-muted-foreground">Total Tasks</div>
                      </div>
                      <div className="text-center p-4 sm:p-5 rounded-xl border border-emerald-500/20 bg-emerald-500/10 shadow-sm hover:shadow-md transition-all">
                        <div className="text-2xl sm:text-3xl font-bold text-emerald-500 dark:text-emerald-400 tabular-nums mb-1">{reportData.dashboardStats.completedTasks}</div>
                        <div className="text-xs sm:text-sm font-medium text-muted-foreground">Completed</div>
                      </div>
                      <div className="text-center p-4 sm:p-5 rounded-xl border border-amber-500/20 bg-amber-500/10 shadow-sm hover:shadow-md transition-all">
                        <div className="text-2xl sm:text-3xl font-bold text-amber-500 dark:text-amber-400 tabular-nums mb-1">{reportData.dashboardStats.inProgressTasks}</div>
                        <div className="text-xs sm:text-sm font-medium text-muted-foreground">In Progress</div>
                      </div>
                      <div className="text-center p-4 sm:p-5 rounded-xl border border-red-500/20 bg-red-500/10 shadow-sm hover:shadow-md transition-all">
                        <div className="text-2xl sm:text-3xl font-bold text-red-500 dark:text-red-400 tabular-nums mb-1">{reportData.dashboardStats.pendingTasks}</div>
                        <div className="text-xs sm:text-sm font-medium text-muted-foreground">Pending</div>
                      </div>
                      <div className="text-center p-4 sm:p-5 rounded-xl border border-purple-500/20 bg-purple-500/10 shadow-sm hover:shadow-md transition-all">
                        <div className="text-2xl sm:text-3xl font-bold text-purple-500 dark:text-purple-400 tabular-nums mb-1">{reportData.dashboardStats.totalUsers}</div>
                        <div className="text-xs sm:text-sm font-medium text-muted-foreground">Total Users</div>
                      </div>
                      <div className="text-center p-4 sm:p-5 rounded-xl border border-indigo-500/20 bg-indigo-500/10 shadow-sm hover:shadow-md transition-all">
                        <div className="text-2xl sm:text-3xl font-bold text-indigo-500 dark:text-indigo-400 tabular-nums mb-1">{reportData.dashboardStats.totalDepartments}</div>
                        <div className="text-xs sm:text-sm font-medium text-muted-foreground">Departments</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Tabs defaultValue="departments" className="w-full">
                  <TabsList className="grid w-full grid-cols-2 sm:grid-cols-3 md:grid-cols-6 h-auto gap-1 border border-border/70 bg-muted/40 rounded-xl p-1">
                    <TabsTrigger 
                      value="departments"
                      className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-muted-foreground hover:text-foreground text-xs md:text-sm py-2"
                    >
                      Departments
                    </TabsTrigger>
                    <TabsTrigger 
                      value="user-info"
                      className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-muted-foreground hover:text-foreground text-xs md:text-sm py-2"
                    >
                      User Info
                    </TabsTrigger>
                    <TabsTrigger 
                      value="present"
                      className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-muted-foreground hover:text-foreground text-xs md:text-sm py-2"
                    >
                      Present
                    </TabsTrigger>
                    <TabsTrigger 
                      value="absent"
                      className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-muted-foreground hover:text-foreground text-xs md:text-sm py-2"
                    >
                      Absent
                    </TabsTrigger>
                    <TabsTrigger 
                      value="zero-tasks"
                      className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-muted-foreground hover:text-foreground text-xs md:text-sm py-2"
                    >
                      Zero Tasks
                    </TabsTrigger>
                    <TabsTrigger 
                      value="progress"
                      className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-muted-foreground hover:text-foreground text-xs md:text-sm py-2"
                    >
                      Progress
                    </TabsTrigger>
                  </TabsList>

                  {/* Department-wise Task Count */}
                  <TabsContent value="departments" className="space-y-4 mt-4">
                    <Card className="border border-border/70 bg-card shadow-sm rounded-xl overflow-hidden">
                      <CardHeader className="border-b border-border/70 bg-muted/40">
                        <CardTitle className="flex items-center gap-2 text-foreground">
                          <div className="p-2 rounded-lg bg-primary/15 text-primary">
                            <Building2 className="h-5 w-5" />
                          </div>
                          Department-wise Task Count
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="pt-6">
                        <div className="overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow className="border-b border-border/70 bg-muted/40 hover:bg-muted/40">
                                <TableHead className="text-foreground font-semibold">Department</TableHead>
                                <TableHead className="text-foreground font-semibold">Total Tasks</TableHead>
                                <TableHead className="text-foreground font-semibold">Completed</TableHead>
                                <TableHead className="text-foreground font-semibold">In Progress</TableHead>
                                <TableHead className="text-foreground font-semibold">Pending</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {reportData.departmentTaskCounts.map((dept) => (
                                <TableRow 
                                  key={dept.id} 
                                  className="border-b border-border/50 hover:bg-muted/30 transition-colors"
                                >
                                  <TableCell className="font-medium text-foreground">{dept.name}</TableCell>
                                  <TableCell className="text-muted-foreground tabular-nums">{dept.totalTasks}</TableCell>
                                  <TableCell>
                                    <Badge 
                                      variant="outline" 
                                      className="bg-emerald-500/15 text-emerald-500 dark:text-emerald-400 border-emerald-500/30 tabular-nums"
                                    >
                                      {dept.completedTasks}
                                    </Badge>
                                  </TableCell>
                                  <TableCell>
                                    <Badge 
                                      variant="outline" 
                                      className="bg-amber-500/15 text-amber-500 dark:text-amber-400 border-amber-500/30 tabular-nums"
                                    >
                                      {dept.inProgressTasks}
                                    </Badge>
                                  </TableCell>
                                  <TableCell>
                                    <Badge 
                                      variant="outline" 
                                      className="bg-red-500/15 text-red-500 dark:text-red-400 border-red-500/30 tabular-nums"
                                    >
                                      {dept.pendingTasks}
                                    </Badge>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </CardContent>
                    </Card>
                  </TabsContent>

                  {/* User Info - Only users who started day */}
                  <TabsContent value="user-info" className="space-y-4 mt-4">
                    <Card className="border border-border/70 bg-card shadow-sm rounded-xl overflow-hidden">
                      <CardHeader className="border-b border-border/70 bg-muted/40">
                        <CardTitle className="flex items-center gap-2 text-foreground">
                          <div className="p-2 rounded-lg bg-primary/15 text-primary">
                            <Users className="h-5 w-5" />
                          </div>
                          User Info ({reportData.usersWithStartDay?.length || 0} users started day)
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="pt-6">
                        {reportData.usersWithStartDay && reportData.usersWithStartDay.length > 0 ? (
                          <div className="overflow-x-auto">
                            <Table>
                              <TableHeader>
                                <TableRow className="border-b border-border/70 bg-muted/40 hover:bg-muted/40">
                                  <TableHead className="text-foreground font-semibold">Employee ID</TableHead>
                                  <TableHead className="text-foreground font-semibold">Name</TableHead>
                                  <TableHead className="text-foreground font-semibold">Aims</TableHead>
                                  <TableHead className="text-foreground font-semibold">Start Time</TableHead>
                                  <TableHead className="text-foreground font-semibold">End Time</TableHead>
                                  <TableHead className="text-foreground font-semibold">Hours</TableHead>
                                  <TableHead className="text-foreground font-semibold">Status</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {reportData.usersWithStartDay.map((user) => {
                                  // Find aim for this user
                                  const userAim = reportData.usersWithAims?.find(u => u.userId === user.userId)?.aim
                                  return (
                                    <TableRow 
                                      key={user.userId} 
                                      className="border-b border-border/50 hover:bg-muted/30 transition-colors"
                                    >
                                      <TableCell className="font-mono font-bold text-xs text-primary whitespace-nowrap">
                                        {user.employeeId || formatEmployeeId(user.userEmail)}
                                      </TableCell>
                                      <TableCell className="font-medium text-foreground">{user.userName}</TableCell>
                                      <TableCell>
                                        <div className="max-w-xs">
                                          <p className="text-sm text-muted-foreground">
                                            {userAim?.aims || user.aims || "No aims set"}
                                          </p>
                                        </div>
                                      </TableCell>
                                      <TableCell>
                                        <div className="flex items-center gap-1 text-emerald-500 dark:text-emerald-400 tabular-nums">
                                          <Clock className="h-3 w-3" />
                                          {user.startDayTime ? formatTime(user.startDayTime) : "N/A"}
                                        </div>
                                      </TableCell>
                                      <TableCell>
                                        <div className="flex items-center gap-1 text-red-500 dark:text-red-400 tabular-nums">
                                          <Clock className="h-3 w-3" />
                                          {user.endDayTime ? formatTime(user.endDayTime) : "Active"}
                                        </div>
                                      </TableCell>
                                      <TableCell className="font-semibold text-foreground tabular-nums">
                                        {formatHours(getTotalHours(user))}
                                      </TableCell>
                                      <TableCell>
                                        <Badge
                                          variant="outline"
                                          className={
                                            user.workLocationType === "Home" || user.workLocationType === "Remote"
                                              ? "bg-blue-500/15 text-blue-500 dark:text-blue-400 border-blue-500/30"
                                              : "bg-purple-500/15 text-purple-500 dark:text-purple-400 border-purple-500/30"
                                          }
                                        >
                                          {user.workLocationType === "Home" || user.workLocationType === "Remote" ? "WFH" : "Office"}
                                        </Badge>
                                      </TableCell>
                                    </TableRow>
                                  )
                                })}
                              </TableBody>
                            </Table>
                          </div>
                        ) : (
                          <div className="text-center py-8">
                            <UserX className="h-12 w-12 mx-auto mb-4 text-muted-foreground/60" />
                            <p className="text-muted-foreground">No users started their day on this date</p>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </TabsContent>

                  {/* Present Users */}
                  <TabsContent value="present" className="space-y-4 mt-4">
                    <Card className="border border-border/70 bg-card shadow-sm rounded-xl overflow-hidden">
                      <CardHeader className="border-b border-border/70 bg-muted/40">
                        <CardTitle className="flex items-center gap-2 text-foreground">
                          <div className="p-2 rounded-lg bg-emerald-500/15 text-emerald-500 dark:text-emerald-400">
                            <UserCheck className="h-5 w-5" />
                          </div>
                          Present Users ({reportData.usersWithStartDay?.length || 0} users)
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="pt-6">
                        {reportData.usersWithStartDay && reportData.usersWithStartDay.length > 0 ? (
                          <div className="overflow-x-auto">
                            <Table>
                              <TableHeader>
                                <TableRow className="border-b border-border/70 bg-muted/40 hover:bg-muted/40">
                                  <TableHead className="text-foreground font-semibold">Employee ID</TableHead>
                                  <TableHead className="text-foreground font-semibold">Name</TableHead>
                                  <TableHead className="text-foreground font-semibold">Email</TableHead>
                                  <TableHead className="text-foreground font-semibold">Start Time</TableHead>
                                  <TableHead className="text-foreground font-semibold">WFH/Office</TableHead>
                                  <TableHead className="text-foreground font-semibold">Status</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {reportData.usersWithStartDay.map((user) => (
                                  <TableRow 
                                    key={user.userId} 
                                    className="border-b border-border/50 hover:bg-muted/30 transition-colors"
                                  >
                                    <TableCell className="font-mono font-bold text-xs text-primary whitespace-nowrap">
                                      {user.employeeId || formatEmployeeId(user.userEmail)}
                                    </TableCell>
                                    <TableCell className="font-medium text-foreground">{user.userName}</TableCell>
                                    <TableCell className="text-muted-foreground">{user.userEmail}</TableCell>
                                    <TableCell>
                                      <div className="flex items-center gap-1 text-emerald-500 dark:text-emerald-400 tabular-nums">
                                        <Clock className="h-3 w-3" />
                                        {user.startDayTime ? formatTime(user.startDayTime) : "N/A"}
                                      </div>
                                    </TableCell>
                                    <TableCell>
                                      <Badge
                                        variant="outline"
                                        className={
                                          user.workLocationType === "Home" || user.workLocationType === "Remote"
                                            ? "bg-blue-500/15 text-blue-500 dark:text-blue-400 border-blue-500/30"
                                            : "bg-purple-500/15 text-purple-500 dark:text-purple-400 border-purple-500/30"
                                        }
                                      >
                                        {user.workLocationType === "Home" || user.workLocationType === "Remote" ? "WFH" : "Office"}
                                      </Badge>
                                    </TableCell>
                                    <TableCell>
                                      <Badge
                                        variant="outline"
                                        className="bg-emerald-500/15 text-emerald-500 dark:text-emerald-400 border-emerald-500/30"
                                      >
                                        Present
                                      </Badge>
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        ) : (
                          <div className="text-center py-8">
                            <UserX className="h-12 w-12 mx-auto mb-4 text-muted-foreground/60" />
                            <p className="text-muted-foreground">No users present on this date</p>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </TabsContent>

                  {/* Absent Users */}
                  <TabsContent value="absent" className="space-y-4 mt-4">
                    <Card className="border border-border/70 bg-card shadow-sm rounded-xl overflow-hidden">
                      <CardHeader className="border-b border-border/70 bg-muted/40">
                        <CardTitle className="flex items-center gap-2 text-foreground">
                          <div className="p-2 rounded-lg bg-red-500/15 text-red-500 dark:text-red-400">
                            <UserX className="h-5 w-5" />
                          </div>
                          Absent Users ({(reportData.dashboardStats?.totalUsers || 0) - (reportData.usersWithStartDay?.length || 0)} users)
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="pt-6">
                        {(() => {
                          // Get all users who did NOT start their day (absent users)
                          const presentUserIds = new Set(reportData.usersWithStartDay?.map(u => u.userId) || [])
                          const absentUsers = reportData.usersWithAims?.filter(u => !presentUserIds.has(u.userId)) || []
                          
                          if (absentUsers.length > 0) {
                            return (
                              <div className="overflow-x-auto">
                                <Table>
                                  <TableHeader>
                                    <TableRow className="border-b border-border/70 bg-muted/40 hover:bg-muted/40">
                                      <TableHead className="text-foreground font-semibold">Employee ID</TableHead>
                                      <TableHead className="text-foreground font-semibold">Name</TableHead>
                                      <TableHead className="text-foreground font-semibold">Email</TableHead>
                                      <TableHead className="text-foreground font-semibold">Role</TableHead>
                                      <TableHead className="text-foreground font-semibold">Department</TableHead>
                                      <TableHead className="text-foreground font-semibold">Status</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {absentUsers.map((user) => (
                                      <TableRow 
                                        key={user.userId} 
                                        className="border-b border-border/50 hover:bg-muted/30 transition-colors"
                                      >
                                        <TableCell className="font-mono font-bold text-xs text-primary whitespace-nowrap">
                                          {user.employeeId || formatEmployeeId(user.email)}
                                        </TableCell>
                                        <TableCell className="font-medium text-foreground">{user.name}</TableCell>
                                        <TableCell className="text-muted-foreground">{user.email}</TableCell>
                                        <TableCell>
                                          <Badge 
                                            variant="outline" 
                                            className="bg-muted/60 text-foreground border-border/70"
                                          >
                                            {user.role}
                                          </Badge>
                                        </TableCell>
                                        <TableCell className="text-muted-foreground">{user.department}</TableCell>
                                        <TableCell>
                                          <Badge
                                            variant="outline"
                                            className="bg-red-500/15 text-red-500 dark:text-red-400 border-red-500/30"
                                          >
                                            Absent
                                          </Badge>
                                        </TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              </div>
                            )
                          } else {
                            return (
                              <div className="text-center py-8">
                                <CheckCircle className="h-12 w-12 mx-auto mb-4 text-emerald-500 dark:text-emerald-400" />
                                <p className="text-muted-foreground">All users are present today!</p>
                              </div>
                            )
                          }
                        })()}
                      </CardContent>
                    </Card>
                  </TabsContent>

                  {/* Zero Task Employees */}
                  <TabsContent value="zero-tasks" className="space-y-4 mt-4">
                    <Card className="border border-border/70 bg-card shadow-sm rounded-xl overflow-hidden">
                      <CardHeader className="border-b border-border/70 bg-muted/40">
                        <CardTitle className="flex items-center gap-2 text-foreground">
                          <div className="p-2 rounded-lg bg-primary/15 text-primary">
                            <AlertCircle className="h-5 w-5" />
                          </div>
                          Employees with 0 Tasks ({reportData.zeroTaskEmployees.length} employees)
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="pt-6">
                        {reportData.zeroTaskEmployees.length > 0 ? (
                          <div className="overflow-x-auto">
                            <Table>
                              <TableHeader>
                                <TableRow className="border-b border-border/70 bg-muted/40 hover:bg-muted/40">
                                  <TableHead className="text-foreground font-semibold">Employee ID</TableHead>
                                  <TableHead className="text-foreground font-semibold">Name</TableHead>
                                  <TableHead className="text-foreground font-semibold">Email</TableHead>
                                  <TableHead className="text-foreground font-semibold">Role</TableHead>
                                  <TableHead className="text-foreground font-semibold">Department</TableHead>
                                  <TableHead className="text-foreground font-semibold">Action</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {reportData.zeroTaskEmployees.map((emp) => (
                                  <TableRow 
                                    key={emp.userId} 
                                    className="border-b border-border/50 hover:bg-muted/30 transition-colors"
                                  >
                                    <TableCell className="font-mono font-bold text-xs text-primary whitespace-nowrap">
                                      {emp.employeeId || formatEmployeeId(emp.email)}
                                    </TableCell>
                                    <TableCell className="font-medium text-foreground">{emp.name}</TableCell>
                                    <TableCell className="text-muted-foreground">{emp.email}</TableCell>
                                    <TableCell>
                                      <Badge 
                                        variant="outline" 
                                        className="bg-muted/60 text-foreground border-border/70"
                                      >
                                        {emp.role}
                                      </Badge>
                                    </TableCell>
                                    <TableCell className="text-muted-foreground">{emp.department}</TableCell>
                                    <TableCell>
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => {
                                          setSelectedEmployeeId(emp.userId)
                                          setIsCreateTaskOpen(true)
                                        }}
                                        className="bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600 shadow-sm"
                                      >
                                        Assign Task
                                      </Button>
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        ) : (
                          <div className="text-center py-8">
                            <CheckCircle className="h-12 w-12 mx-auto mb-4 text-emerald-500 dark:text-emerald-400" />
                            <p className="text-muted-foreground">All employees have tasks assigned!</p>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </TabsContent>

                  {/* User Progress Updates */}
                  <TabsContent value="progress" className="space-y-4 mt-4">
                    <Card className="border border-border/70 bg-card shadow-sm rounded-xl overflow-hidden">
                      <CardHeader className="border-b border-border/70 bg-muted/40">
                        <CardTitle className="flex items-center gap-2 text-foreground">
                          <div className="p-2 rounded-lg bg-primary/15 text-primary">
                            <TrendingUp className="h-5 w-5" />
                          </div>
                          User Progress Updates ({reportData.userProgressUpdates.length} updates)
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="pt-6">
                        {reportData.userProgressUpdates.length > 0 ? (
                          <div className="space-y-4">
                            {reportData.userProgressUpdates.map((progress) => (
                              <Card 
                                key={progress.id} 
                                className="border border-border/70 border-l-4 border-l-primary bg-muted/30"
                              >
                                <CardContent className="pt-4">
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="flex-1 min-w-0">
                                      <div className="flex flex-wrap items-center gap-2 mb-2">
                                        <span className="font-semibold text-foreground">{progress.userName}</span>
                                        <Badge 
                                          variant="outline" 
                                          className="text-primary border-primary/30 font-mono font-bold text-xs"
                                        >
                                          {progress.employeeId || formatEmployeeId(progress.userEmail)}
                                        </Badge>
                                        <Badge 
                                          variant="outline" 
                                          className="bg-muted/60 text-muted-foreground border-border/70"
                                        >
                                          {progress.userEmail}
                                        </Badge>
                                      </div>
                                      <p className="text-sm text-muted-foreground mb-2">
                                        Task: <span className="font-medium text-foreground">{progress.taskTitle}</span>
                                      </p>
                                      <div className="flex items-center gap-4 mb-2">
                                        <div className="flex items-center gap-2">
                                          <span className="text-sm font-medium text-muted-foreground">Progress:</span>
                                          <div className="w-32 rounded-full h-2 bg-muted overflow-hidden">
                                            <div
                                              className="bg-gradient-to-r from-primary to-accent h-2 rounded-full"
                                              style={{ width: `${progress.progressPercentage}%` }}
                                            />
                                          </div>
                                          <span className="text-sm text-foreground tabular-nums">{progress.progressPercentage}%</span>
                                        </div>
                                      </div>
                                      {progress.notes && (
                                        <p className="text-sm mt-2 text-muted-foreground">
                                          <strong className="text-foreground">Notes:</strong> {progress.notes}
                                        </p>
                                      )}
                                      {Array.isArray(progress.achievements) && progress.achievements.length > 0 && (
                                        <div className="mt-2">
                                          <strong className="text-sm text-foreground">Achievements:</strong>
                                          <ul className="list-disc list-inside text-sm text-muted-foreground mt-1">
                                            {progress.achievements.map((ach, idx) => (
                                              <li key={idx}>{ach}</li>
                                            ))}
                                          </ul>
                                        </div>
                                      )}
                                    </div>
                                    <div className="text-xs text-muted-foreground shrink-0 tabular-nums">
                                      {format(new Date(progress.createdAt), "h:mm a")}
                                    </div>
                                  </div>
                                </CardContent>
                              </Card>
                            ))}
                          </div>
                        ) : (
                          <div className="text-center py-8">
                            <Clock className="h-12 w-12 mx-auto mb-4 text-muted-foreground/60" />
                            <p className="text-muted-foreground">No progress updates for this date</p>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </TabsContent>
              </Tabs>
            </div>
          ) : (
            <div className="text-center py-20">
              <p className="text-muted-foreground">No data available</p>
            </div>
          )}
          </div>
          
          <DialogFooter className="sticky bottom-0 z-10 border-t border-border/70 bg-card/95 backdrop-blur-xl px-4 sm:px-6 py-4 mt-auto">
            <div className="flex flex-wrap gap-3 w-full justify-between items-center">
              <div className="flex flex-wrap gap-2">
                <Button 
                  variant="outline" 
                  onClick={downloadCSV}
                  disabled={!reportData || isLoading}
                  className="bg-emerald-500/15 border-emerald-500/30 text-emerald-500 dark:text-emerald-400 hover:bg-emerald-500/25"
                >
                  <Download className="mr-2 h-4 w-4" />
                  Download CSV
                </Button>
                <Button 
                  variant="outline" 
                  onClick={downloadPDF}
                  disabled={!reportData || isLoading}
                  className="bg-blue-500/15 border-blue-500/30 text-blue-500 dark:text-blue-400 hover:bg-blue-500/25"
                >
                  <Download className="mr-2 h-4 w-4" />
                  Download PDF
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button 
                  variant="outline" 
                  onClick={() => onOpenChange(false)}
                  className="bg-background/70 border-border/70 text-foreground hover:bg-muted"
                >
                  Close
                </Button>
                <Button 
                  onClick={fetchReport} 
                  disabled={isLoading}
                  className="bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Refreshing...
                    </>
                  ) : (
                    "Refresh Data"
                  )}
                </Button>
              </div>
            </div>
          </DialogFooter>
        </div>
      </DialogContent>
      
      {/* Create Task Dialog */}
      <CreateTaskDialog 
        open={isCreateTaskOpen} 
        onOpenChange={(open) => {
          setIsCreateTaskOpen(open)
          if (!open) {
            setSelectedEmployeeId(null)
          }
        }}
        defaultAssignee={selectedEmployeeId}
      />
    </Dialog>
  )
}

