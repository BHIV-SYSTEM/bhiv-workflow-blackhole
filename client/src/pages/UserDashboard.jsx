"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card"
import { Button } from "../components/ui/button"
import { getTaskStatusBadgeClass, getTaskStatusLabel } from "../lib/taskStatus"
import {
  Loader2,
  CheckCircle,
  Clock,
  AlertCircle,
  Calendar,
  ThumbsUp,
  ThumbsDown,
  RefreshCw,
  Github,
  ExternalLink,
  Bell,
  ChevronLeft,
  ChevronRight,
  Bot,
  ArrowRight,
  Target,
  TrendingUp,
  Activity,
  CheckCircle2,
  Zap,
  Sparkles,
  ListTodo,
  Send,
} from "lucide-react"
import { useNavigate } from "react-router-dom"
import { useToast } from "../hooks/use-toast"
import { useAuth } from "../context/auth-context"
import { Badge } from "../components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table"
import { Progress } from "../components/ui/progress"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog"
import { Textarea } from "../components/ui/textarea"
import { Alert, AlertDescription, AlertTitle } from "../components/ui/alert"
import { SubmissionFeedbackCard } from "../components/dashboard/SubmissionFeedbackCard"
import { DashboardProvider } from "../context/DashboardContext" // New import
import { api } from "@/lib/api"
import { formatDate, formatTime } from "@/lib/dateFormat"
import { WorkHoursManager } from "../components/monitoring/WorkHoursManager"
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts'

function UserDashboard() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const { user } = useAuth()
  const [isCreateTaskOpen, setIsCreateTaskOpen] = useState(false)
  const [userStats, setUserStats] = useState({
    totalTasks: 0,
    completedTasks: 0,
    inProgressTasks: 0,
    pendingTasks: 0,
    upcomingDeadlines: [],
    completionRate: 0,
  })
  const [userTasks, setUserTasks] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedTask, setSelectedTask] = useState(null)
  const [isDetailsOpen, setIsDetailsOpen] = useState(false)
  const [submissions, setSubmissions] = useState([])
  const [selectedSubmission, setSelectedSubmission] = useState(null)
  const [isSubmissionDetailsOpen, setIsSubmissionDetailsOpen] = useState(false)
  const [isRevisionDialogOpen, setIsRevisionDialogOpen] = useState(false)
  const [revisionNotes, setRevisionNotes] = useState("")
  const [hasNewReviews, setHasNewReviews] = useState(false)
  const [recentReviews, setRecentReviews] = useState([])
  const [currentPage, setCurrentPage] = useState(0)

  const TASKS_PER_PAGE = 5

  const handleViewTask = (task) => {
    setSelectedTask(task)
    setIsDetailsOpen(true)
  }

  const handleViewSubmission = (submission) => {
    setSelectedSubmission(submission)
    setIsSubmissionDetailsOpen(true)
  }

  const handleSubmitRevision = async () => {
    if (!selectedSubmission || !revisionNotes.trim()) return

    try {
      setIsLoading(true)
      
      console.group("🚀 [FRONTEND LOG] Submitting Task Revision");
      console.log("Task ID:", selectedSubmission.task._id);
      console.log("Task Title:", selectedSubmission.task.title);
      console.log("GitHub Repository:", selectedSubmission.githubLink);
      console.log("Revision Notes:", revisionNotes);
      console.log("Notes Word Count:", (revisionNotes || "").split(/\s+/).filter(Boolean).length);
      console.groupEnd();

      // ✅ FIXED: Use authenticated API method
      await api.post('/submissions', {
        task: selectedSubmission.task._id,
        githubLink: selectedSubmission.githubLink,
        additionalLinks: selectedSubmission.additionalLinks,
        notes: revisionNotes,
        originalSubmission: selectedSubmission._id,
        userId: user.id,
      })

      toast({
        title: "Success",
        description: "Your revision has been submitted successfully",
      })

      setIsRevisionDialogOpen(false)
      fetchUserDashboardData()
    } catch (error) {
      console.error("Error submitting revision:", error)
      toast({
        title: "Error",
        description: "Failed to submit revision",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const markReviewsAsSeen = async () => {
    try {
      const storedUser = JSON.parse(localStorage.getItem("WorkflowUser"))
      if (storedUser?.id && recentReviews.length > 0) {
        const seenIds = JSON.parse(localStorage.getItem(`seen_submission_reviews_${storedUser.id}`) || "[]")
        const updatedSeenIds = Array.from(new Set([...seenIds, ...recentReviews.map((r) => r._id)]))
        localStorage.setItem(`seen_submission_reviews_${storedUser.id}`, JSON.stringify(updatedSeenIds))
      }
      setHasNewReviews(false)
      setRecentReviews([])
    } catch (error) {
      console.error("Error marking reviews as seen:", error)
    }
  }

  const fetchUserDashboardData = async () => {
    const storedUser = JSON.parse(localStorage.getItem("WorkflowUser"))
    if (!storedUser?.id) {
      console.error("User ID is undefined")
      setIsLoading(false)
      return
    }

    try {
      setIsLoading(true)
      
      // ✅ FIXED: Use authenticated API methods instead of direct axios calls
      const [statsResponse, tasksResponse, submissionsResponse] = await Promise.all([
        api.dashboard.getUserStats(storedUser.id),
        api.users.getUserTasks(storedUser.id),
        api.get(`/users/${storedUser.id}/submissions`),
      ])

      console.log('Dashboard data fetched:', {
        stats: statsResponse,
        tasks: tasksResponse?.length || 0,
        submissions: submissionsResponse?.length || 0
      })

      // Filter out orphaned submissions whose task was deleted by admin
      const validSubmissions = (submissionsResponse || []).filter(s => s && s.task && s.task._id);

      const seenReviewIds = JSON.parse(localStorage.getItem(`seen_submission_reviews_${storedUser.id}`) || "[]")

      const recentlyReviewed = validSubmissions.filter((submission) => {
        if (submission.status !== "Pending") {
          const reviewDate = new Date(submission.updatedAt)
          const sevenDaysAgo = new Date()
          sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
          const isRecent = reviewDate > sevenDaysAgo
          const isUnseen = !seenReviewIds.includes(submission._id)
          return isRecent && isUnseen
        }
        return false
      })

      const sortedTasks = (tasksResponse || []).sort((a, b) => {
        return new Date(b.createdAt) - new Date(a.createdAt)
      })

      setUserStats(statsResponse || {
        totalTasks: 0,
        completedTasks: 0,
        inProgressTasks: 0,
        pendingTasks: 0,
        upcomingDeadlines: [],
        completionRate: 0,
      })
      setUserTasks(sortedTasks)
      setSubmissions(validSubmissions)
      setRecentReviews(recentlyReviewed)
      setHasNewReviews(recentlyReviewed.length > 0)
      setCurrentPage(0)
    } catch (error) {
      console.error("Error fetching user dashboard data:", error)
      toast({
        title: "Error",
        description: "Failed to load your dashboard data. Please check your connection and try again.",
        variant: "destructive",
      })
      
      // Set empty states on error
      setUserStats({
        totalTasks: 0,
        completedTasks: 0,
        inProgressTasks: 0,
        pendingTasks: 0,
        upcomingDeadlines: [],
        completionRate: 0,
      })
      setUserTasks([])
      setSubmissions([])
      setRecentReviews([])
      setHasNewReviews(false)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchUserDashboardData()
    const intervalId = setInterval(fetchUserDashboardData, 5 * 60 * 1000)

    // Refresh submissions instantly when Parikshak review completes
    const onReviewComplete = () => fetchUserDashboardData()
    window.addEventListener('parikshak:review-complete', onReviewComplete)

    return () => {
      clearInterval(intervalId)
      window.removeEventListener('parikshak:review-complete', onReviewComplete)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  const getStatusColor = (status) => getTaskStatusBadgeClass(status)

  const getPriorityColor = (priority) => {
    switch (priority) {
      case "High":
        return "bg-red-500/10 text-red-500 hover:bg-red-500/20 dark:bg-red-500/20 dark:text-red-400 dark:hover:bg-red-500/30"
      case "Medium":
        return "bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 dark:bg-amber-500/20 dark:text-amber-400 dark:hover:bg-amber-500/30"
      case "Low":
        return "bg-green-500/10 text-green-500 hover:bg-green-500/20 dark:bg-green-500/20 dark:text-green-400 dark:hover:bg-green-500/30"
      default:
        return "bg-gray-500/10 text-gray-500 hover:bg-gray-500/20 dark:bg-gray-500/20 dark:text-gray-400 dark:hover:bg-gray-500/30"
    }
  }

  const getSubmissionStatusBadge = (status) => {
    switch (status) {
      case "Approved":
        return (
          <Badge className="bg-green-100 text-green-800 hover:bg-green-200 dark:bg-green-900/50 dark:text-green-300 flex items-center gap-1">
            <ThumbsUp className="h-3 w-3" /> Approved
          </Badge>
        )
      case "Rejected":
        return (
          <Badge className="bg-red-100 text-red-800 hover:bg-red-200 dark:bg-red-900/50 dark:text-red-300 flex items-center gap-1">
            <ThumbsDown className="h-3 w-3" /> Rejected
          </Badge>
        )
      default:
        return (
          <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-200 dark:bg-amber-900/50 dark:text-amber-300 flex items-center gap-1">
            <Clock className="h-3 w-3" /> Pending Review
          </Badge>
        )
    }
  }

  const handlePrevPage = () => {
    setCurrentPage((prev) => Math.max(prev - 1, 0))
  }

  const handleNextPage = () => {
    setCurrentPage((prev) => {
      const maxPage = Math.ceil(userTasks.length / TASKS_PER_PAGE) - 1
      return Math.min(prev + 1, maxPage)
    })
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[80vh]">
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p>Loading your dashboard...</p>
        </div>
      </div>
    )
  }

  return (
    <DashboardProvider
      recentReviews={recentReviews}
      hasNewReviews={hasNewReviews}
      markReviewsAsSeen={markReviewsAsSeen}
    >
      <div className="space-y-6 pb-8">
        {/* Enhanced Header Section */}
        <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-card/70 p-5 sm:p-6 shadow-sm">
          <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <h1 className="text-2xl sm:text-3xl font-heading font-bold tracking-tight text-foreground">
                My Dashboard
              </h1>
              <p className="text-muted-foreground text-sm sm:text-base">
                Welcome back, <span className="font-semibold text-foreground">{user?.name || "User"}</span>. Here's your task overview.
              </p>
            </div>
            <div className="flex gap-2 self-start sm:self-auto">
              <Button 
                variant="outline" 
                onClick={fetchUserDashboardData}
                className="relative overflow-hidden group hover:border-primary/50 transition-all rounded-xl"
              >
                <RefreshCw className="mr-2 h-4 w-4 group-hover:rotate-180 transition-transform duration-500" />
                Refresh
              </Button>
            </div>
          </div>
        </div>

        {hasNewReviews && (
          <Alert className="bg-blue-500/10 border-blue-500/30">
            <Bell className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <AlertTitle className="text-blue-700 dark:text-blue-300">New submission reviews</AlertTitle>
            <AlertDescription className="text-blue-700/90 dark:text-blue-300/90">
              You have {recentReviews.length} recently reviewed submission{recentReviews.length !== 1 ? "s" : ""}. Check
              the "My Submissions" tab for details.
              <Button
                variant="link"
                className="text-blue-700 dark:text-blue-300 p-0 h-auto font-semibold ml-2"
                onClick={markReviewsAsSeen}
              >
                Mark as read
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* Enhanced Stats Cards */}
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          {/* My Tasks Stat */}
          <div className="interactive-card relative overflow-hidden group border-l-4 border-l-blue-500 rounded-2xl border border-border/60 bg-card text-card-foreground shadow-sm">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>
            <div className="flex flex-row items-center justify-between space-y-0 p-5 pb-2">
              <h3 className="text-sm font-medium text-muted-foreground">My Tasks</h3>
              <div className="h-10 w-10 rounded-xl bg-blue-500/10 flex items-center justify-center group-hover:scale-105 transition-transform">
                <Clock className="h-5 w-5 text-blue-500" />
              </div>
            </div>
            <div className="p-5 pt-0">
              <div className="text-3xl font-bold tabular-nums text-blue-600 dark:text-blue-400">{userStats.totalTasks}</div>
              <p className="text-xs text-muted-foreground mt-1">Total assigned tasks</p>
            </div>
          </div>

          {/* Completed Stat */}
          <div className="interactive-card relative overflow-hidden group border-l-4 border-l-green-500 rounded-2xl border border-border/60 bg-card text-card-foreground shadow-sm">
            <div className="absolute inset-0 bg-gradient-to-br from-green-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>
            <div className="flex flex-row items-center justify-between space-y-0 p-5 pb-2">
              <h3 className="text-sm font-medium text-muted-foreground">Completed</h3>
              <div className="h-10 w-10 rounded-xl bg-green-500/10 flex items-center justify-center group-hover:scale-105 transition-transform">
                <CheckCircle className="h-5 w-5 text-green-500" />
              </div>
            </div>
            <div className="p-5 pt-0">
              <div className="text-3xl font-bold tabular-nums text-green-600 dark:text-green-400">{userStats.completedTasks}</div>
              <p className="text-xs text-muted-foreground mt-1">{userStats.completionRate}% completion rate</p>
            </div>
          </div>

          {/* In Progress Stat */}
          <div className="interactive-card relative overflow-hidden group border-l-4 border-l-amber-500 rounded-2xl border border-border/60 bg-card text-card-foreground shadow-sm">
            <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>
            <div className="flex flex-row items-center justify-between space-y-0 p-5 pb-2">
              <h3 className="text-sm font-medium text-muted-foreground">In Progress</h3>
              <div className="h-10 w-10 rounded-xl bg-amber-500/10 flex items-center justify-center group-hover:scale-105 transition-transform">
                <Clock className="h-5 w-5 text-amber-500" />
              </div>
            </div>
            <div className="p-5 pt-0">
              <div className="text-3xl font-bold tabular-nums text-amber-600 dark:text-amber-400">{userStats.inProgressTasks}</div>
              <p className="text-xs text-muted-foreground mt-1">Tasks currently in progress</p>
            </div>
          </div>

          {/* Pending Stat */}
          <div className="interactive-card relative overflow-hidden group border-l-4 border-l-red-500 rounded-2xl border border-border/60 bg-card text-card-foreground shadow-sm">
            <div className="absolute inset-0 bg-gradient-to-br from-red-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>
            <div className="flex flex-row items-center justify-between space-y-0 p-5 pb-2">
              <h3 className="text-sm font-medium text-muted-foreground">Pending</h3>
              <div className="h-10 w-10 rounded-xl bg-red-500/10 flex items-center justify-center group-hover:scale-105 transition-transform">
                <AlertCircle className="h-5 w-5 text-red-500" />
              </div>
            </div>
            <div className="p-5 pt-0">
              <div className="text-3xl font-bold tabular-nums text-red-600 dark:text-red-400">{userStats.pendingTasks}</div>
              <p className="text-xs text-muted-foreground mt-1">Tasks waiting to be started</p>
            </div>
          </div>
        </div>

        {/* Combined Work Hours & Progress Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column - Work Hours Manager & Upcoming Deadlines */}
          <div className="space-y-6">
            <WorkHoursManager />
            
            {/* Upcoming Deadlines */}
            <Card className="neo-card shadow-lg">
              <CardHeader className="border-b bg-gradient-to-r from-red-500/5 to-amber-500/5">
                <CardTitle className="text-xl flex items-center gap-2">
                  <div className="h-8 w-8 rounded-lg bg-red-500/10 flex items-center justify-center">
                    <Calendar className="h-4 w-4 text-red-500" />
                  </div>
                  Upcoming Deadlines
                </CardTitle>
                <CardDescription>Tasks due soon</CardDescription>
              </CardHeader>
              <CardContent>
                {userStats.upcomingDeadlines && userStats.upcomingDeadlines.length > 0 ? (
                  <div className="space-y-4">
                    {userStats.upcomingDeadlines.map((task) => {
                      const taskId = task._id || task.id
                      return (
                        <div
                          key={taskId || task.title}
                          className="flex items-center justify-between gap-3 p-3.5 rounded-xl border border-border/50 bg-muted/40 cursor-pointer hover:bg-muted/70 hover:border-primary/35 transition-all"
                          onClick={() => taskId && navigate(`/tasks/${taskId}`)}
                        >
                          <div className="min-w-0">
                            <p className="font-medium text-sm truncate">{task.title}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Due: {formatDate(task.dueDate)}
                            </p>
                          </div>
                          <Badge className={getPriorityColor(task.priority)}>{task.priority}</Badge>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Calendar className="mx-auto h-8 w-8 text-muted-foreground/60 mb-2" />
                    <p>No upcoming deadlines</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right Column - My Progress */}
          <div>
            <Card className="neo-card shadow-lg border-l-4 border-l-primary">
            <CardHeader className="border-b bg-gradient-to-r from-primary/5 to-transparent">
              <CardTitle className="text-xl flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <CheckCircle className="h-4 w-4 text-primary" />
                </div>
                My Progress
              </CardTitle>
              <CardDescription>Your task completion progress</CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              {userStats.totalTasks > 0 ? (
                <>
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={[
                          { 
                            name: 'Tasks', 
                            'Total Tasks': userStats.totalTasks,
                            Completed: userStats.completedTasks,
                            Pending: userStats.pendingTasks
                          }
                        ]}
                        margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                        barGap={8}
                        barCategoryGap="20%"
                      >
                        <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                        <XAxis 
                          dataKey="name" 
                          tick={{ fill: 'hsl(var(--foreground))' }}
                          tickLine={{ stroke: 'hsl(var(--border))' }}
                        />
                        <YAxis 
                          tick={{ fill: 'hsl(var(--foreground))' }}
                          tickLine={{ stroke: 'hsl(var(--border))' }}
                          allowDecimals={false}
                        />
                        <Tooltip 
                          contentStyle={{ 
                            backgroundColor: 'hsl(var(--background))', 
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '8px',
                            padding: '12px'
                          }}
                          labelStyle={{ color: 'hsl(var(--foreground))', fontWeight: 600 }}
                          cursor={{ fill: 'hsl(var(--primary) / 0.1)' }}
                        />
                        <Legend 
                          wrapperStyle={{ paddingTop: '20px' }}
                          iconType="rect"
                        />
                        {/* Blue Bar - Total Tasks */}
                        <Bar 
                          dataKey="Total Tasks" 
                          fill="#3b82f6" 
                          radius={[8, 8, 0, 0]}
                          maxBarSize={80}
                          animationDuration={1000}
                          animationEasing="ease-out"
                        />
                        {/* Green Bar - Completed Tasks */}
                        <Bar 
                          dataKey="Completed" 
                          fill="#22c55e" 
                          radius={[8, 8, 0, 0]}
                          maxBarSize={80}
                          animationDuration={1000}
                          animationEasing="ease-out"
                        />
                        {/* Red Bar - Pending Tasks */}
                        <Bar 
                          dataKey="Pending" 
                          fill="#ef4444" 
                          radius={[8, 8, 0, 0]}
                          maxBarSize={80}
                          animationDuration={1000}
                          animationEasing="ease-out"
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  
                  {/* Task Count Summary */}
                  <div className="grid grid-cols-3 gap-4 mt-6">
                    <div className="text-center p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
                      <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                        {userStats.totalTasks}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">Total Tasks</div>
                    </div>
                    <div className="text-center p-4 rounded-lg bg-green-500/10 border border-green-500/20">
                      <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                        {userStats.completedTasks}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">Completed</div>
                    </div>
                    <div className="text-center p-4 rounded-lg bg-red-500/10 border border-red-500/20">
                      <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                        {userStats.pendingTasks}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">Pending</div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="h-[400px] flex items-center justify-center text-muted-foreground text-sm">
                  No tasks assigned yet
                </div>
              )}
            </CardContent>
          </Card>
          </div>
        </div>

        <Tabs defaultValue="tasks" className="w-full">
          <TabsList className="grid w-full max-w-2xl grid-cols-2 mx-auto h-auto items-stretch p-1.5 gap-2 rounded-2xl bg-card/90 border border-border/60 shadow-sm">
            <TabsTrigger 
              value="tasks" 
              className="flex items-center justify-center gap-2 w-full data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md transition-all duration-200 font-semibold text-sm sm:text-base py-2.5 px-4 rounded-xl"
            >
              <ListTodo className="h-4 w-4" />
              My Tasks
            </TabsTrigger>
            <TabsTrigger 
              value="submissions" 
              className="relative flex items-center justify-center gap-2 w-full data-[state=active]:bg-accent data-[state=active]:text-accent-foreground data-[state=active]:shadow-md transition-all duration-200 font-semibold text-sm sm:text-base py-2.5 px-4 rounded-xl"
            >
              <Send className="h-4 w-4" />
              My Submissions
              {hasNewReviews && (
                <span className="absolute top-2 right-2 flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-500"></span>
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="tasks" className="mt-6 animate-fade-in">
            <Card className="neo-card shadow-lg">
              <CardHeader className="border-b bg-gradient-to-r from-primary/5 to-accent/5">
                <CardTitle className="text-xl flex items-center gap-2">
                  <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Clock className="h-4 w-4 text-primary" />
                  </div>
                  My Tasks
                </CardTitle>
                <CardDescription>View and manage your assigned tasks</CardDescription>
              </CardHeader>
              <CardContent>
                  {userTasks?.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <p>You don't have any tasks assigned yet.</p>
                      <Button variant="outline" className="mt-4" onClick={() => setIsCreateTaskOpen(true)}>
                        Create Your First Task
                      </Button>
                    </div>
                  ) : (
                    <div>
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Title</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead>Priority</TableHead>
                              <TableHead>Due Date</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {userTasks
                              .slice(currentPage * TASKS_PER_PAGE, (currentPage + 1) * TASKS_PER_PAGE)
                              .map((task) => (
                                <TableRow
                                  key={task._id}
                                  className="cursor-pointer hover:bg-muted/50"
                                  onClick={() => navigate(`/tasks/${task._id}`)}
                                >
                                  <TableCell className="font-medium">{task.title}</TableCell>
                                  <TableCell>
                                    <Badge className={getStatusColor(task.status)}>{getTaskStatusLabel(task.status)}</Badge>
                                  </TableCell>
                                  <TableCell>
                                    <Badge className={getPriorityColor(task.priority)}>{task.priority}</Badge>
                                  </TableCell>
                                  <TableCell>
                                    {task.dueDate ? formatDate(task.dueDate) : "No date"}
                                  </TableCell>
                                </TableRow>
                              ))}
                          </TableBody>
                        </Table>
                      </div>
                      {userTasks.length > TASKS_PER_PAGE && (
                        <div className="flex justify-between mt-4">
                          <Button variant="outline" size="sm" onClick={handlePrevPage} disabled={currentPage === 0}>
                            <ChevronLeft className="h-4 w-4 mr-2" />
                            Previous
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleNextPage}
                            disabled={(currentPage + 1) * TASKS_PER_PAGE >= userTasks.length}
                          >
                            Next
                            <ChevronRight className="h-4 w-4 ml-2" />
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
          </TabsContent>

          <TabsContent value="submissions" className="mt-6 animate-fade-in">
            <Card className="neo-card shadow-lg">
              <CardHeader className="border-b bg-gradient-to-r from-accent/5 to-primary/5">
                <CardTitle className="text-xl flex items-center gap-2">
                  <div className="h-8 w-8 rounded-lg bg-accent/10 flex items-center justify-center">
                    <Github className="h-4 w-4 text-accent" />
                  </div>
                  My Submissions
                </CardTitle>
                <CardDescription>Track the status of your task submissions</CardDescription>
              </CardHeader>
              <CardContent>
                {submissions.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Github className="mx-auto h-8 w-8 text-muted-foreground/60 mb-2" />
                    <p>You haven't submitted any tasks yet.</p>
                    <p className="text-sm mt-1">Complete a task and submit it to see it here.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Task</TableHead>
                          <TableHead>Submitted On</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {submissions.map((submission) => (
                          <TableRow key={submission._id} className="hover:bg-muted/50">
                            <TableCell className="font-medium">{submission.task?.title || "Unknown Task"}</TableCell>
                            <TableCell>{formatDate(submission.createdAt)}</TableCell>
                            <TableCell>{getSubmissionStatusBadge(submission.status)}</TableCell>
                            <TableCell>
                              <div className="flex gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleViewSubmission(submission)
                                  }}
                                >
                                  View
                                </Button>
                                {submission.status === "Rejected" && (
                                  <Button
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setSelectedSubmission(submission)
                                      setIsRevisionDialogOpen(true)
                                    }}
                                  >
                                    Submit Revision
                                  </Button>
                                )}
                              </div>
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
        </Tabs>

         <Dialog open={isSubmissionDetailsOpen} onOpenChange={setIsSubmissionDetailsOpen}>
          <DialogContent className="sm:max-w-[700px] h-[85vh] flex flex-col bg-card text-card-foreground border-border/70 p-0 overflow-hidden">
            <DialogHeader className="flex-shrink-0 border-b border-border/60 pb-4 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent px-6 pt-6">
              <div className="flex items-start justify-between">
                <div className="space-y-1 flex-1">
                  <DialogTitle className="text-xl sm:text-2xl font-heading font-bold flex items-center gap-2.5 text-foreground">
                    <div className="h-10 w-10 rounded-xl bg-primary/15 flex items-center justify-center ring-1 ring-primary/25">
                      <Github className="h-5 w-5 text-primary" />
                    </div>
                    Submission Details
                  </DialogTitle>
                  <DialogDescription className="text-sm sm:text-base text-muted-foreground">
                    {selectedSubmission?.task?.title || "Task Submission"}
                  </DialogDescription>
                </div>
                {selectedSubmission && (
                  <div className="ml-4">
                    {getSubmissionStatusBadge(selectedSubmission.status)}
                  </div>
                )}
              </div>
            </DialogHeader>

            {selectedSubmission && (
              <div className="flex-1 overflow-y-auto min-h-0 px-6 py-6 space-y-5 scroll-smooth scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
                {/* Submission Info Card */}
                <div className="bg-muted/40 p-4 rounded-xl border border-border/60">
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-2.5 text-sm">
                      <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Calendar className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <span className="font-medium text-muted-foreground text-xs">Submitted on</span>
                        <p className="text-foreground font-semibold">
                          {formatDate(selectedSubmission.createdAt)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2.5 text-sm">
                      <div className="h-8 w-8 rounded-lg bg-accent/10 flex items-center justify-center">
                        <Clock className="h-4 w-4 text-accent" />
                      </div>
                      <div>
                        <span className="font-medium text-muted-foreground text-xs">Time</span>
                        <p className="text-foreground font-semibold">
                          {formatTime(selectedSubmission.createdAt)}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* GitHub Repository */}
                <div className="space-y-2.5">
                  <div className="flex items-center gap-2">
                    <div className="h-7 w-7 rounded-lg bg-emerald-500/15 flex items-center justify-center ring-1 ring-emerald-500/30">
                      <Github className="h-4 w-4 text-emerald-500" />
                    </div>
                    <p className="font-semibold text-sm text-foreground">GitHub Repository</p>
                  </div>
                  <div className="group relative overflow-hidden rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 hover:shadow-md transition-all hover:border-emerald-500/50">
                    <div className="flex items-center gap-3">
                      <Github className="h-5 w-5 text-emerald-500 flex-shrink-0" />
                      <a
                        href={selectedSubmission.githubLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline flex items-center gap-2 font-medium break-all transition-colors"
                      >
                        <span className="flex-1">{selectedSubmission.githubLink}</span>
                        <ExternalLink className="h-4 w-4 flex-shrink-0 opacity-70 group-hover:opacity-100 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
                      </a>
                    </div>
                  </div>
                </div>

                {/* Additional Links */}
                {selectedSubmission.additionalLinks && (
                  <div className="space-y-2.5">
                    <div className="flex items-center gap-2">
                      <div className="h-7 w-7 rounded-lg bg-blue-500/15 flex items-center justify-center ring-1 ring-blue-500/30">
                        <ExternalLink className="h-4 w-4 text-blue-500" />
                      </div>
                      <p className="font-semibold text-sm text-foreground">Additional Resources</p>
                    </div>
                    <div className="group relative overflow-hidden rounded-xl border border-blue-500/30 bg-blue-500/10 p-4 hover:shadow-md transition-all hover:border-blue-500/50">
                      <div className="flex items-center gap-3">
                        <ExternalLink className="h-5 w-5 text-blue-500 flex-shrink-0" />
                        <a
                          href={selectedSubmission.additionalLinks}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-500 hover:underline flex items-center gap-2 font-medium break-all transition-colors"
                        >
                          <span className="flex-1">{selectedSubmission.additionalLinks}</span>
                          <ExternalLink className="h-4 w-4 flex-shrink-0 opacity-70 group-hover:opacity-100 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
                        </a>
                      </div>
                    </div>
                  </div>
                )}

                {/* Your Notes */}
                {selectedSubmission.notes && (
                  <div className="space-y-2.5">
                    <div className="flex items-center gap-2">
                      <div className="h-7 w-7 rounded-lg bg-amber-500/15 flex items-center justify-center ring-1 ring-amber-500/30">
                        <AlertCircle className="h-4 w-4 text-amber-500" />
                      </div>
                      <p className="font-semibold text-sm text-foreground">Your Notes</p>
                    </div>
                    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
                      <p className="text-sm whitespace-pre-line leading-relaxed text-foreground/90">{selectedSubmission.notes}</p>
                    </div>
                  </div>
                )}

                {/* AI Score */}
                {selectedSubmission.parikshakReview?.score != null && selectedSubmission.status !== "Pending" && (
                  <div className="space-y-2.5">
                    <div className="flex items-center gap-2">
                      <div className="h-7 w-7 rounded-lg bg-purple-500/15 flex items-center justify-center ring-1 ring-purple-500/30">
                        <Bot className="h-4 w-4 text-purple-500" />
                      </div>
                      <p className="font-semibold text-sm text-foreground">AI Review Score</p>
                    </div>
                    <div className="rounded-xl border border-purple-500/30 bg-purple-500/10 p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className={`text-3xl font-bold tabular-nums ${
                          selectedSubmission.parikshakReview.score >= 85 ? "text-emerald-500"
                          : selectedSubmission.parikshakReview.score >= 60 ? "text-amber-500"
                          : "text-destructive"
                        }`}>
                          {selectedSubmission.parikshakReview.score}<span className="text-base font-normal text-muted-foreground">/100</span>
                        </span>
                        <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                          selectedSubmission.parikshakReview.status === "PASS" ? "bg-emerald-500/15 text-emerald-500 border border-emerald-500/30"
                          : selectedSubmission.parikshakReview.status === "PARTIAL" ? "bg-amber-500/15 text-amber-500 border border-amber-500/30"
                          : "bg-destructive/15 text-destructive border border-destructive/30"
                        }`}>
                          {selectedSubmission.parikshakReview.status}
                        </span>
                      </div>
                      <Progress value={selectedSubmission.parikshakReview.score} className="h-2" />
                    </div>
                  </div>
                )}

                {/* AI Review Comments */}
                {selectedSubmission.parikshakReview?.review && selectedSubmission.status !== "Pending" && (
                  <div className="space-y-2.5">
                    <div className="flex items-center gap-2">
                      <div className="h-7 w-7 rounded-lg bg-purple-500/15 flex items-center justify-center ring-1 ring-purple-500/30">
                        <Bot className="h-4 w-4 text-purple-500" />
                      </div>
                      <p className="font-semibold text-sm text-foreground">AI Review Comments</p>
                    </div>
                    <div className="rounded-xl border border-purple-500/30 bg-purple-500/10 p-4">
                      <p className="text-sm whitespace-pre-line leading-relaxed text-foreground/90">
                        {selectedSubmission.parikshakReview.review}
                      </p>
                    </div>
                  </div>
                )}

                {/* Reviewer Feedback / Pending Status (only if distinct from AI review) */}
                {selectedSubmission.feedback && selectedSubmission.feedback !== selectedSubmission.parikshakReview?.review && (
                  <div className="space-y-2.5">
                    <div className="flex items-center gap-2">
                      <div className={`h-7 w-7 rounded-lg flex items-center justify-center ring-1 ${
                        selectedSubmission.status === "Approved"
                          ? "bg-emerald-500/15 ring-emerald-500/30"
                          : selectedSubmission.status === "Pending"
                          ? "bg-amber-500/15 ring-amber-500/30"
                          : "bg-destructive/15 ring-destructive/30"
                      }`}>
                        {selectedSubmission.status === "Approved" ? (
                          <ThumbsUp className="h-4 w-4 text-emerald-500" />
                        ) : selectedSubmission.status === "Pending" ? (
                          <Clock className="h-4 w-4 text-amber-500" />
                        ) : (
                          <ThumbsDown className="h-4 w-4 text-destructive" />
                        )}
                      </div>
                      <p className="font-semibold text-sm text-foreground">
                        {selectedSubmission.status === "Pending" ? "Review Status" : "Reviewer Feedback"}
                      </p>
                    </div>
                    <div className={`rounded-xl border p-4 ${
                      selectedSubmission.status === "Approved"
                        ? "bg-emerald-500/10 border-emerald-500/30"
                        : selectedSubmission.status === "Pending"
                        ? "bg-amber-500/10 border-amber-500/30"
                        : "bg-destructive/10 border-destructive/30"
                    }`}>
                      <p className="text-sm whitespace-pre-line leading-relaxed text-foreground/90">
                        {selectedSubmission.feedback || (selectedSubmission.status === "Pending" ? "Awaiting review by an administrator." : "No feedback provided.")}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

            <DialogFooter className="flex-shrink-0 border-t border-border/60 pt-4 gap-2 bg-muted/30 px-6 pb-6">
              <Button 
                variant="outline" 
                onClick={() => setIsSubmissionDetailsOpen(false)}
                className="flex-1 sm:flex-none rounded-xl"
              >
                Close
              </Button>
              {selectedSubmission?.task && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsSubmissionDetailsOpen(false)
                    navigate(`/tasks/${selectedSubmission.task._id}`)
                  }}
                  className="flex-1 sm:flex-none rounded-xl hover:border-primary/40 hover:text-primary"
                >
                  <Clock className="h-4 w-4 mr-2" />
                  View Task
                </Button>
              )}
              {selectedSubmission?.status === "Rejected" && (
                <Button
                  onClick={() => {
                    setIsSubmissionDetailsOpen(false)
                    setIsRevisionDialogOpen(true)
                  }}
                  className="flex-1 sm:flex-none gradient-primary text-primary-foreground shadow-sm hover:opacity-95 transition-all rounded-xl"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Submit Revision
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={isRevisionDialogOpen} onOpenChange={setIsRevisionDialogOpen}>
          <DialogContent className="sm:max-w-[525px]">
            <DialogHeader>
              <DialogTitle>Submit Revision</DialogTitle>
              <DialogDescription>Update your submission based on the reviewer's feedback</DialogDescription>
            </DialogHeader>

            {selectedSubmission && (
              <div className="space-y-4 py-4">
                {selectedSubmission.feedback && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Reviewer Feedback:</p>
                    <div className="bg-red-50 dark:bg-red-900/20 p-3 rounded">
                      <p className="text-sm whitespace-pre-line">{selectedSubmission.feedback}</p>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <p className="text-sm font-medium">Your Original Submission:</p>
                  <div className="flex items-center gap-2 bg-muted p-2 rounded">
                    <Github className="h-4 w-4" />
                    <a
                      href={selectedSubmission.githubLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                    >
                      {selectedSubmission.githubLink}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium">Revision Notes:</p>
                  <Textarea
                    placeholder="Describe the changes you've made in response to the feedback..."
                    value={revisionNotes}
                    onChange={(e) => setRevisionNotes(e.target.value)}
                    rows={4}
                  />
                </div>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsRevisionDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSubmitRevision} disabled={!revisionNotes.trim() || isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Submitting...
                  </>
                ) : (
                  "Submit Revision"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardProvider>
  )
}

export default UserDashboard