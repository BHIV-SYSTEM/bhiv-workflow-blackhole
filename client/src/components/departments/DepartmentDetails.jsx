import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Progress } from "../ui/progress";
import { 
  Users, 
  CheckCircle, 
  Clock, 
  AlertCircle, 
  Target, 
  TrendingUp,
  Calendar,
  MapPin,
  ArrowLeft,
  RefreshCw,
  Loader2
} from "lucide-react";
import { getDeptColor } from "@/lib/departmentUtils";
import { useToast } from "../../hooks/use-toast";
import { api } from "../../lib/api";
import { format } from "date-fns";

export function DepartmentDetails({ department, onBack }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [departmentData, setDepartmentData] = useState({
    users: [],
    tasks: [],
    aims: [],
    stats: {}
  });

  const fetchDepartmentDetails = useCallback(async () => {
    try {
      setLoading(true);
      
      // Get department ID (handle both _id and id)
      const departmentId = department._id || department.id;
      if (!departmentId) {
        throw new Error("Department ID is missing");
      }

      console.log("Fetching details for department:", departmentId, department);
      
      // Fetch department users
      const usersResponse = await api.users.getUsers();
      const departmentUsers = usersResponse.filter(user => 
        user.department && (user.department._id === departmentId || user.department.id === departmentId)
      );

      // Fetch department tasks
      const tasksResponse = await api.departments.getDepartmentTasks(departmentId);
      
      // Fetch department aims - using the with-progress endpoint
      let aimsResponse = { success: true, data: [] };
      try {
        const aimsData = await api.aims.getAimsWithProgress({
          department: departmentId,
          date: new Date().toISOString().split('T')[0] // Format as YYYY-MM-DD
        });
        aimsResponse = aimsData.success ? aimsData : { success: true, data: Array.isArray(aimsData) ? aimsData : [] };
      } catch (aimsError) {
        console.warn("Could not fetch aims for department:", aimsError);
        // Continue without aims data
        aimsResponse = { success: false, data: [] };
      }

      // Calculate department statistics
      const stats = calculateDepartmentStats(departmentUsers, tasksResponse, aimsResponse.data);

      setDepartmentData({
        users: departmentUsers,
        tasks: tasksResponse,
        aims: aimsResponse.data,
        stats
      });

    } catch (error) {
      console.error("Error fetching department details:", error);
      toast({
        title: "Error",
        description: "Failed to load department details",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [department, toast]);

  useEffect(() => {
    if (department) {
      fetchDepartmentDetails();
    }
  }, [department, fetchDepartmentDetails]);

  const calculateDepartmentStats = (users, tasks, aims) => {
    const totalUsers = users.length;
    const totalTasks = Array.isArray(tasks) ? tasks.length : 0;
    const totalAims = Array.isArray(aims) ? aims.length : 0;
    
    // Task statistics
    const completedTasks = Array.isArray(tasks) ? tasks.filter(task => task.status === 'Completed').length : 0;
    const inProgressTasks = Array.isArray(tasks) ? tasks.filter(task => task.status === 'In Progress').length : 0;
    const pendingTasks = Array.isArray(tasks) ? tasks.filter(task => task.status === 'Pending').length : 0;
    
    // Aim statistics
    const completedAims = Array.isArray(aims) ? aims.filter(aim => aim.completionStatus === 'Completed').length : 0;
    const pendingAims = Array.isArray(aims) ? aims.filter(aim => aim.isPending).length : 0;
    const aimsWithProgress = Array.isArray(aims) ? aims.filter(aim => !aim.isPending).length : 0;
    
    // Attendance statistics (from aims data)
    const presentUsers = Array.isArray(aims) ? aims.filter(aim => 
      aim.workSessionInfo && aim.workSessionInfo.startDayTime
    ).length : 0;
    
    return {
      totalUsers,
      totalTasks,
      totalAims,
      completedTasks,
      inProgressTasks,
      pendingTasks,
      completedAims,
      pendingAims,
      aimsWithProgress,
      presentUsers,
      taskCompletionRate: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
      aimCompletionRate: totalAims > 0 ? Math.round((completedAims / totalAims) * 100) : 0,
      attendanceRate: totalUsers > 0 ? Math.round((presentUsers / totalUsers) * 100) : 0
    };
  };

  const getStatusColor = (status) => {
    switch (status) {
      case "Completed":
        return "bg-green-500/10 text-green-500";
      case "In Progress":
        return "bg-blue-500/10 text-blue-500";
      case "Pending":
        return "bg-amber-500/10 text-amber-500";
      default:
        return "bg-gray-500/10 text-gray-500";
    }
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case "High":
        return "bg-red-500/10 text-red-500";
      case "Medium":
        return "bg-amber-500/10 text-amber-500";
      case "Low":
        return "bg-green-500/10 text-green-500";
      default:
        return "bg-gray-500/10 text-gray-500";
    }
  };

  const getLocationColor = (location) => {
    switch (location) {
      case 'WFH':
      case 'Home':
        return 'bg-blue-100 text-blue-800';
      case 'Remote':
        return 'bg-purple-100 text-purple-800';
      default:
        return 'bg-green-100 text-green-800';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Card className="border-2 rounded-xl shadow-lg p-8">
          <div className="flex flex-col items-center gap-3">
            <div className="h-12 w-12 rounded-lg bg-green-500/10 flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-green-600" />
            </div>
            <p className="font-semibold text-foreground">Loading department details...</p>
            <p className="text-sm text-muted-foreground">Please wait</p>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={onBack}
              className="border-2 rounded-xl hover:border-primary/50"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                {(() => {
                  const deptColorInfo = getDeptColor(department.color);
                  return (
                    <div 
                      className={`w-6 h-6 rounded-md shadow-lg ${deptColorInfo.bgClass}`} 
                      style={deptColorInfo.style}
                    />
                  );
                })()}
              </div>
              <div>
                <h1 className="text-3xl font-bold tracking-tight">{department.name}</h1>
                <p className="text-muted-foreground">
                  {department.description || "Department overview and management"}
                </p>
              </div>
            </div>
          </div>
          <Button 
            variant="outline" 
            onClick={fetchDepartmentDetails}
            className="border-2 rounded-xl hover:border-green-500/50 hover:bg-green-50"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="border-2 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-[1.02]">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-semibold">Team Members</CardTitle>
            <div className="h-9 w-9 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <Users className="h-5 w-5 text-blue-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{departmentData.stats.totalUsers}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {departmentData.stats.presentUsers} present today ({departmentData.stats.attendanceRate}%)
            </p>
          </CardContent>
        </Card>

        <Card className="border-2 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-[1.02]">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-semibold">Tasks</CardTitle>
            <div className="h-9 w-9 rounded-lg bg-green-500/10 flex items-center justify-center">
              <CheckCircle className="h-5 w-5 text-green-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{departmentData.stats.totalTasks}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {departmentData.stats.completedTasks} completed ({departmentData.stats.taskCompletionRate}%)
            </p>
          </CardContent>
        </Card>

        <Card className="border-2 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-[1.02]">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-semibold">Daily Aims</CardTitle>
            <div className="h-9 w-9 rounded-lg bg-purple-500/10 flex items-center justify-center">
              <Target className="h-5 w-5 text-purple-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{departmentData.stats.totalAims}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {departmentData.stats.completedAims} completed ({departmentData.stats.aimCompletionRate}%)
            </p>
          </CardContent>
        </Card>

        <Card className="border-2 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-[1.02]">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-semibold">Progress</CardTitle>
            <div className="h-9 w-9 rounded-lg bg-orange-500/10 flex items-center justify-center">
              <TrendingUp className="h-5 w-5 text-orange-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{departmentData.stats.aimsWithProgress}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Aims with progress updates
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Tabs */}
      <Tabs defaultValue="users" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-3 mx-auto border-2 rounded-xl p-1 bg-muted/20">
          <TabsTrigger 
            value="users"
            className="rounded-lg data-[state=active]:bg-green-500 data-[state=active]:text-white transition-all"
          >
            Team Members
          </TabsTrigger>
          <TabsTrigger 
            value="tasks"
            className="rounded-lg data-[state=active]:bg-green-500 data-[state=active]:text-white transition-all"
          >
            Tasks
          </TabsTrigger>
          <TabsTrigger 
            value="aims"
            className="rounded-lg data-[state=active]:bg-green-500 data-[state=active]:text-white transition-all"
          >
            Daily Aims
          </TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="mt-6">
          <Card className="border-2 rounded-xl shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-blue-600" />
                Team Members ({departmentData.users.length})
              </CardTitle>
              <CardDescription>All members in this department</CardDescription>
            </CardHeader>
            <CardContent>
              {departmentData.users.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <div className="h-12 w-12 rounded-lg bg-muted/20 flex items-center justify-center mx-auto mb-3">
                    <Users className="h-6 w-6 text-muted-foreground/60" />
                  </div>
                  <p className="font-medium">No team members found in this department.</p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-lg border-2">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/20 hover:bg-muted/20">
                        <TableHead className="font-semibold">Name</TableHead>
                        <TableHead className="font-semibold">Email</TableHead>
                        <TableHead className="font-semibold">Role</TableHead>
                        <TableHead className="font-semibold">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {departmentData.users.map((user, idx) => {
                        const userAim = departmentData.aims.find(aim => aim.user && aim.user._id === user._id);
                        const isPresent = userAim && userAim.workSessionInfo && userAim.workSessionInfo.startDayTime;
                        
                        return (
                          <TableRow 
                            key={user._id}
                            className={`hover:bg-muted/10 transition-colors ${idx % 2 === 0 ? 'bg-background' : 'bg-muted/5'}`}
                          >
                            <TableCell className="font-medium">{user.name}</TableCell>
                            <TableCell className="text-muted-foreground">{user.email}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="rounded-lg">{user.role}</Badge>
                            </TableCell>
                            <TableCell>
                              <Badge className={isPresent ? "bg-green-100 text-green-800 border-green-200 rounded-lg" : "bg-gray-100 text-gray-800 border-gray-200 rounded-lg"}>
                                {isPresent ? "Present" : "Absent"}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tasks" className="mt-6">
          <Card className="border-2 rounded-xl shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-600" />
                Department Tasks ({departmentData.tasks.length})
              </CardTitle>
              <CardDescription>All tasks assigned to this department</CardDescription>
            </CardHeader>
            <CardContent>
              {departmentData.tasks.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <div className="h-12 w-12 rounded-lg bg-muted/20 flex items-center justify-center mx-auto mb-3">
                    <CheckCircle className="h-6 w-6 text-muted-foreground/60" />
                  </div>
                  <p className="font-medium">No tasks found for this department.</p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-lg border-2">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/20 hover:bg-muted/20">
                        <TableHead className="font-semibold">Title</TableHead>
                        <TableHead className="font-semibold">Assignee</TableHead>
                        <TableHead className="font-semibold">Status</TableHead>
                        <TableHead className="font-semibold">Priority</TableHead>
                        <TableHead className="font-semibold">Progress</TableHead>
                        <TableHead className="font-semibold">Due Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {departmentData.tasks.map((task, idx) => (
                        <TableRow 
                          key={task._id}
                          className={`hover:bg-muted/10 transition-colors ${idx % 2 === 0 ? 'bg-background' : 'bg-muted/5'}`}
                        >
                          <TableCell className="font-medium">{task.title}</TableCell>
                          <TableCell className="text-muted-foreground">{task.assignee?.name || "Unassigned"}</TableCell>
                          <TableCell>
                            <Badge className={`${getStatusColor(task.status)} rounded-lg`}>{task.status}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge className={`${getPriorityColor(task.priority)} rounded-lg`}>{task.priority}</Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Progress value={task.progress || 0} className="w-16 h-2" />
                              <span className="text-xs font-medium">{task.progress || 0}%</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {task.dueDate ? format(new Date(task.dueDate), "MMM d, yyyy") : "No date"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="aims" className="mt-6">
          <Card className="border-2 rounded-xl shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-5 w-5 text-purple-600" />
                Today's Aims ({departmentData.aims.length})
              </CardTitle>
              <CardDescription>Daily objectives set by team members</CardDescription>
            </CardHeader>
            <CardContent>
              {departmentData.aims.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <div className="h-12 w-12 rounded-lg bg-muted/20 flex items-center justify-center mx-auto mb-3">
                    <Target className="h-6 w-6 text-muted-foreground/60" />
                  </div>
                  <p className="font-medium">No aims set for today in this department.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {departmentData.aims.map((aim) => (
                    <div key={aim._id} className="border-2 rounded-xl p-4 shadow-md hover:shadow-lg transition-all duration-300 bg-gradient-to-br from-white to-gray-50/50 dark:from-gray-900 dark:to-gray-800/50">
                      {/* Header */}
                      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-gray-900 dark:text-gray-100">
                            {aim.user?.name || "Unknown User"}
                          </span>
                          
                          {/* Work Location Tag */}
                          <span className={`px-2.5 py-1 text-xs font-medium rounded-lg flex items-center gap-1 ${
                            getLocationColor(aim.workSessionInfo?.workLocationTag || aim.workLocation)
                          }`}>
                            <MapPin className="h-3 w-3" />
                            {aim.workSessionInfo?.workLocationTag || aim.workLocation || 'Office'}
                          </span>
                          
                          {/* Progress Percentage */}
                          {aim.progressPercentage > 0 && (
                            <span className="px-2.5 py-1 text-xs font-medium bg-purple-100 text-purple-800 rounded-lg">
                              {aim.progressPercentage}% Progress
                            </span>
                          )}
                          
                          {/* Status */}
                          <Badge className={`rounded-lg ${aim.isPending ? "bg-orange-100 text-orange-800 border-orange-200" : "bg-green-100 text-green-800 border-green-200"}`}>
                            {aim.isPending ? "Pending Progress" : aim.completionStatus}
                          </Badge>
                        </div>
                        
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Calendar className="h-3.5 w-3.5" />
                          <span className="font-medium">Set at {format(new Date(aim.createdAt), "h:mm a")}</span>
                        </div>
                      </div>

                      {/* Aim Content */}
                      <div className="mb-3">
                        <p className="text-sm text-foreground/90 whitespace-pre-line leading-relaxed">
                          {aim.aims}
                        </p>
                      </div>

                      {/* Progress Information */}
                      {aim.progressEntries && aim.progressEntries.length > 0 ? (
                        <div className="mt-3 p-3 bg-muted/30 rounded-lg border-2">
                          <h4 className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1">
                            <TrendingUp className="h-3.5 w-3.5 text-green-600" />
                            Progress Updates ({aim.progressEntries.length})
                          </h4>
                          {aim.progressEntries.slice(0, 2).map((entry) => (
                            <div key={entry._id} className="mb-2 text-xs">
                              {entry.notes && (
                                <div className="text-muted-foreground mb-1">
                                  <span className="font-semibold">Notes:</span> {entry.notes}
                                </div>
                              )}
                              {entry.achievements && (
                                <div className="text-green-700 dark:text-green-400">
                                  <span className="font-semibold">Achievements:</span> {entry.achievements}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="mt-3 p-3 bg-orange-50 dark:bg-orange-950/20 rounded-lg border-2 border-orange-200 dark:border-orange-800">
                          <p className="text-xs font-medium text-orange-600 dark:text-orange-400">No progress updates yet</p>
                        </div>
                      )}

                      {/* Work Session Info */}
                      {aim.workSessionInfo && aim.workSessionInfo.startDayTime && (
                        <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg border-2 border-blue-200 dark:border-blue-800">
                          <h4 className="text-xs font-semibold text-blue-700 dark:text-blue-400 mb-1">Work Session</h4>
                          <div className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                            Started: {format(new Date(aim.workSessionInfo.startDayTime), "h:mm a")}
                            {aim.workSessionInfo.totalHoursWorked > 0 && (
                              <span className="ml-2">• {aim.workSessionInfo.totalHoursWorked}h worked</span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}