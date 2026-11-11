"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog"
import { Button } from "../ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card"
import { Badge } from "../ui/badge"
import { Input } from "../ui/input"
import { Label } from "../ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs"
import { 
  FileText, 
  Users, 
  Building2, 
  Target, 
  Clock, 
  TrendingUp, 
  UserCheck, 
  Calendar,
  Loader2,
  CheckCircle,
  XCircle,
  AlertCircle,
  BarChart3
} from "lucide-react"
import { api } from "../../lib/api"
import { useToast } from "../../hooks/use-toast"
import { format } from "date-fns"
import { formatEmployeeId } from "../../lib/employeeId"

export function AdminReportDialog({ open, onOpenChange }) {
  const { toast } = useToast()
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0])
  const [isLoading, setIsLoading] = useState(false)
  const [reportData, setReportData] = useState(null)

  useEffect(() => {
    if (open) {
      fetchReport()
    }
  }, [open, selectedDate])

  const fetchReport = async () => {
    try {
      setIsLoading(true)
      const data = await api.dashboard.getAdminReport(selectedDate)
      setReportData(data)
    } catch (error) {
      console.error("Error fetching report:", error)
      toast({
        title: "Error",
        description: "Failed to load report data",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleDateChange = (e) => {
    setSelectedDate(e.target.value)
  }

  if (!open) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-7xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-2xl font-bold flex items-center gap-2">
                <FileText className="h-6 w-6" />
                Admin Dashboard Report
              </DialogTitle>
              <DialogDescription className="mt-2">
                Comprehensive overview of all system activities and statistics
              </DialogDescription>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex flex-col gap-1">
                <Label htmlFor="report-date" className="text-xs">Select Date</Label>
                <Input
                  id="report-date"
                  type="date"
                  value={selectedDate}
                  onChange={handleDateChange}
                  className="w-40"
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={fetchReport}
                disabled={isLoading}
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <BarChart3 className="h-4 w-4 mr-2" />
                )}
                Refresh
              </Button>
            </div>
          </div>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-muted-foreground">Loading report data...</p>
            </div>
          </div>
        ) : reportData ? (
          <div className="space-y-6 mt-4">
            {/* Main Dashboard Stats */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  Main Dashboard Statistics
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800">
                    <p className="text-sm text-muted-foreground">Total Tasks</p>
                    <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                      {reportData.dashboardStats.totalTasks}
                    </p>
                  </div>
                  <div className="p-4 rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800">
                    <p className="text-sm text-muted-foreground">Completed</p>
                    <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                      {reportData.dashboardStats.completedTasks}
                    </p>
                  </div>
                  <div className="p-4 rounded-lg bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800">
                    <p className="text-sm text-muted-foreground">In Progress</p>
                    <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                      {reportData.dashboardStats.inProgressTasks}
                    </p>
                  </div>
                  <div className="p-4 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800">
                    <p className="text-sm text-muted-foreground">Pending</p>
                    <p className="text-2xl font-bold text-red-600 dark:text-red-400">
                      {reportData.dashboardStats.pendingTasks}
                    </p>
                  </div>
                  <div className="p-4 rounded-lg bg-purple-50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800">
                    <p className="text-sm text-muted-foreground">Total Users</p>
                    <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                      {reportData.dashboardStats.totalUsers}
                    </p>
                  </div>
                  <div className="p-4 rounded-lg bg-indigo-50 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-800">
                    <p className="text-sm text-muted-foreground">Departments</p>
                    <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
                      {reportData.dashboardStats.totalDepartments}
                    </p>
                  </div>
                  <div className="p-4 rounded-lg bg-cyan-50 dark:bg-cyan-950/20 border border-cyan-200 dark:border-cyan-800">
                    <p className="text-sm text-muted-foreground">Users Started Day</p>
                    <p className="text-2xl font-bold text-cyan-600 dark:text-cyan-400">
                      {reportData.usersWithStartDayCount}
                    </p>
                  </div>
                  <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
                    <p className="text-sm text-muted-foreground">Zero Task Employees</p>
                    <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                      {reportData.zeroTaskEmployees.length}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Tabs defaultValue="departments" className="w-full">
              <TabsList className="grid w-full grid-cols-5">
                <TabsTrigger value="departments">Departments</TabsTrigger>
                <TabsTrigger value="aims">User Aims</TabsTrigger>
                <TabsTrigger value="zero-tasks">Zero Tasks</TabsTrigger>
                <TabsTrigger value="progress">Progress Updates</TabsTrigger>
                <TabsTrigger value="attendance">Start Day</TabsTrigger>
              </TabsList>

              {/* Department-wise Task Count */}
              <TabsContent value="departments" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Building2 className="h-5 w-5" />
                      Department-wise Task Count
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {reportData.departmentTaskCounts.map((dept) => (
                        <div
                          key={dept.id}
                          className="p-4 rounded-lg border-2 bg-card hover:bg-accent/5 transition-colors"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <h3 className="font-semibold text-lg">{dept.name}</h3>
                            <Badge variant="outline" className="text-sm">
                              Total: {dept.totalTasks}
                            </Badge>
                          </div>
                          <div className="grid grid-cols-3 gap-3 mt-3">
                            <div className="text-center p-2 rounded bg-green-50 dark:bg-green-950/20">
                              <p className="text-xs text-muted-foreground">Completed</p>
                              <p className="text-lg font-bold text-green-600 dark:text-green-400">
                                {dept.completedTasks}
                              </p>
                            </div>
                            <div className="text-center p-2 rounded bg-orange-50 dark:bg-orange-950/20">
                              <p className="text-xs text-muted-foreground">In Progress</p>
                              <p className="text-lg font-bold text-orange-600 dark:text-orange-400">
                                {dept.inProgressTasks}
                              </p>
                            </div>
                            <div className="text-center p-2 rounded bg-red-50 dark:bg-red-950/20">
                              <p className="text-xs text-muted-foreground">Pending</p>
                              <p className="text-lg font-bold text-red-600 dark:text-red-400">
                                {dept.pendingTasks}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Users with Aims */}
              <TabsContent value="aims" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Target className="h-5 w-5" />
                      Users with Daily Aims ({reportData.usersWithAims.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3 max-h-[500px] overflow-y-auto">
                      {reportData.usersWithAims.map((user) => (
                        <div
                          key={user.userId}
                          className="p-4 rounded-lg border-2 bg-card hover:bg-accent/5 transition-colors"
                        >
                          <div className="flex items-start justify-between mb-2">
                            <div>
                              <div className="flex items-center gap-2">
                                <h3 className="font-semibold">{user.name}</h3>
                                <Badge variant="outline" className="text-xs font-mono font-bold text-primary">
                                  {user.employeeId || formatEmployeeId(user.email)}
                                </Badge>
                              </div>
                              <p className="text-sm text-muted-foreground">
                                {user.email} • {user.department} • {user.role}
                              </p>
                            </div>
                            {user.aim ? (
                              <Badge
                                className={
                                  user.aim.completionStatus === "Completed"
                                    ? "bg-green-500"
                                    : user.aim.completionStatus === "MVP Achieved"
                                    ? "bg-blue-500"
                                    : "bg-orange-500"
                                }
                              >
                                {user.aim.completionStatus}
                              </Badge>
                            ) : (
                              <Badge variant="outline">No Aim Set</Badge>
                            )}
                          </div>
                          {user.aim && (
                            <div className="mt-3 space-y-2">
                              <p className="text-sm">
                                <span className="font-semibold">Aim:</span> {user.aim.aims}
                              </p>
                              <div className="flex items-center gap-4">
                                <div className="flex items-center gap-2">
                                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                                  <span className="text-sm">
                                    Progress: {user.aim.progressPercentage}%
                                  </span>
                                </div>
                                {user.aim.workSessionInfo?.startDayTime && (
                                  <div className="flex items-center gap-2">
                                    <Clock className="h-4 w-4 text-muted-foreground" />
                                    <span className="text-sm">
                                      Started: {format(new Date(user.aim.workSessionInfo.startDayTime), "HH:mm")}
                                    </span>
                                  </div>
                                )}
                                {user.aim.workSessionInfo?.totalHoursWorked && (
                                  <div className="flex items-center gap-2">
                                    <Clock className="h-4 w-4 text-muted-foreground" />
                                    <span className="text-sm">
                                      Hours: {user.aim.workSessionInfo.totalHoursWorked.toFixed(1)}h
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Zero Task Employees */}
              <TabsContent value="zero-tasks" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <AlertCircle className="h-5 w-5 text-amber-500" />
                      Employees with Zero Tasks ({reportData.zeroTaskEmployees.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {reportData.zeroTaskEmployees.length > 0 ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {reportData.zeroTaskEmployees.map((emp) => (
                          <div
                            key={emp.userId}
                            className="p-4 rounded-lg border-2 border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/20 hover:bg-amber-100 dark:hover:bg-amber-950/30 transition-colors"
                          >
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <h3 className="font-semibold">{emp.name}</h3>
                                <Badge variant="outline" className="text-xs font-mono font-bold text-primary">
                                  {emp.employeeId || formatEmployeeId(emp.email)}
                                </Badge>
                              </div>
                              <Badge variant="destructive">0 Tasks</Badge>
                            </div>
                            <p className="text-sm text-muted-foreground mb-2">
                              {emp.email}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {emp.department} • {emp.role}
                            </p>
                            <p className="text-xs text-amber-700 dark:text-amber-300 mt-2 font-semibold">
                              ⚠️ Ready for task assignment
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        <CheckCircle className="h-12 w-12 mx-auto mb-2 text-green-500" />
                        <p>All employees have tasks assigned!</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Progress Updates */}
              <TabsContent value="progress" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <TrendingUp className="h-5 w-5" />
                      User Progress Updates ({reportData.userProgressUpdates.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {reportData.userProgressUpdates.length > 0 ? (
                      <div className="space-y-3 max-h-[500px] overflow-y-auto">
                        {reportData.userProgressUpdates.map((progress) => (
                          <div
                            key={progress.id}
                            className="p-4 rounded-lg border-2 bg-card hover:bg-accent/5 transition-colors"
                          >
                            <div className="flex items-start justify-between mb-2">
                              <div>
                                <div className="flex items-center gap-2">
                                  <h3 className="font-semibold">{progress.userName}</h3>
                                  <Badge variant="outline" className="text-xs font-mono font-bold text-primary">
                                    {progress.employeeId || formatEmployeeId(progress.userEmail)}
                                  </Badge>
                                </div>
                                <p className="text-sm text-muted-foreground">
                                  {progress.userEmail} • {progress.taskTitle}
                                </p>
                              </div>
                              <Badge variant="outline">
                                {progress.progressPercentage}%
                              </Badge>
                            </div>
                            {progress.notes && (
                              <p className="text-sm mt-2">
                                <span className="font-semibold">Notes:</span> {progress.notes}
                              </p>
                            )}
                            {progress.achievements && (
                              <p className="text-sm mt-1 text-green-600 dark:text-green-400">
                                <span className="font-semibold">Achievements:</span> {progress.achievements}
                              </p>
                            )}
                            {progress.blockers && (
                              <p className="text-sm mt-1 text-red-600 dark:text-red-400">
                                <span className="font-semibold">Blockers:</span> {progress.blockers}
                              </p>
                            )}
                            <p className="text-xs text-muted-foreground mt-2">
                              {format(new Date(progress.createdAt), "MMM d, yyyy HH:mm")}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        <Clock className="h-12 w-12 mx-auto mb-2" />
                        <p>No progress updates for this date</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Users who Started Day */}
              <TabsContent value="attendance" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <UserCheck className="h-5 w-5" />
                      Users Who Started Day ({reportData.usersWithStartDayCount})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {reportData.usersWithStartDay.length > 0 ? (
                      <div className="space-y-3 max-h-[500px] overflow-y-auto">
                        {reportData.usersWithStartDay.map((user, index) => (
                          <div
                            key={user.userId}
                            className="p-4 rounded-lg border-2 bg-card hover:bg-accent/5 transition-colors"
                          >
                            <div className="flex items-start justify-between mb-2">
                              <div>
                                <div className="flex items-center gap-2">
                                  <h3 className="font-semibold">{user.userName}</h3>
                                  <Badge variant="outline" className="text-xs font-mono font-bold text-primary">
                                    {user.employeeId || formatEmployeeId(user.userEmail)}
                                  </Badge>
                                </div>
                                <p className="text-sm text-muted-foreground">
                                  {user.userEmail} • {user.department} • {user.userRole}
                                </p>
                              </div>
                              <Badge
                                className={
                                  user.status === "Present"
                                    ? "bg-green-500"
                                    : user.status === "Late"
                                    ? "bg-orange-500"
                                    : "bg-gray-500"
                                }
                              >
                                {user.status}
                              </Badge>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
                              <div className="p-2 rounded bg-blue-50 dark:bg-blue-950/20">
                                <p className="text-xs text-muted-foreground">Start Time</p>
                                <p className="text-sm font-semibold">
                                  {user.startDayTime
                                    ? format(new Date(user.startDayTime), "HH:mm")
                                    : "N/A"}
                                </p>
                              </div>
                              <div className="p-2 rounded bg-green-50 dark:bg-green-950/20">
                                <p className="text-xs text-muted-foreground">Total Hours</p>
                                <p className="text-sm font-semibold">
                                  {user.totalHoursWorked.toFixed(1)}h
                                </p>
                              </div>
                              <div className="p-2 rounded bg-purple-50 dark:bg-purple-950/20">
                                <p className="text-xs text-muted-foreground">Regular Hours</p>
                                <p className="text-sm font-semibold">
                                  {user.regularHours.toFixed(1)}h
                                </p>
                              </div>
                              <div className="p-2 rounded bg-orange-50 dark:bg-orange-950/20">
                                <p className="text-xs text-muted-foreground">Overtime</p>
                                <p className="text-sm font-semibold">
                                  {user.overtimeHours.toFixed(1)}h
                                </p>
                              </div>
                            </div>
                            <p className="text-xs text-muted-foreground mt-2">
                              Location: {user.workLocationType}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        <Calendar className="h-12 w-12 mx-auto mb-2" />
                        <p>No users started their day on this date</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        ) : (
          <div className="text-center py-20 text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-2" />
            <p>No report data available</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

