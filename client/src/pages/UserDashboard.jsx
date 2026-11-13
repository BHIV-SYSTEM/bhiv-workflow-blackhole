"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card"
import { Button } from "../components/ui/button"
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

  const getStatusColor = (status) => {
    switch (status) {
      case "Completed":
        return "bg-green-500/10 text-green-500 hover:bg-green-500/20 dark:bg-green-500/20 dark:text-green-400 dark:hover:bg-green-500/30"
      case "In Progress":
        return "bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 dark:bg-blue-500/20 dark:text-blue-400 dark:hover:bg-blue-500/30"
      case "Pending":
        return "bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 dark:bg-amber-500/20 dark:text-amber-400 dark:hover:bg-amber-500/30"
      default:
        return "bg-gray-500/10 text-gray-500 hover:bg-gray-500/20 dark:bg-gray-500/20 dark:text-gray-400 dark:hover:bg-gray-500/30"
    }
  }

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
        <div className="relative overflow-hidden rounded-lg p-6">
          <div className="relative flex items-center justify-between">
            <div className="space-y-1">
              <h1 className="text-4xl font-bold tracking-tight text-foreground">
                My Dashboard
              </h1>
              <p className="text-muted-foreground text-lg">
                Welcome back, <span className="font-semibold text-foreground">{user?.name || "User"}</span>! 👋 Here's your task overview.
              </p>
            </div>
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                onClick={fetchUserDashboardData}
                className="relative overflow-hidden group hover:border-primary/50 transition-all"
              >
                <RefreshCw className="mr-2 h-4 w-4 group-hover:rotate-180 transition-transform duration-500" />
                Refresh
              </Button>
            </div>
          </div>
        </div>

        {hasNewReviews && (
          <Alert className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
            <Bell className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <AlertTitle className="text-blue-800 dark:text-blue-300">New submission reviews</AlertTitle>
            <AlertDescription className="text-blue-700 dark:text-blue-400">
              You have {recentReviews.length} recently reviewed submission{recentReviews.length !== 1 ? "s" : ""}. Check
              the "My Submissions" tab for details.
              <Button
                variant="link"
                className="text-blue-700 dark:text-blue-400 p-0 h-auto font-normal ml-2"
                onClick={markReviewsAsSeen}
              >
                Mark as read
              </Button>
            </AlertDescription>
          </Alert>
        )}



        {/* Enhanced Stats Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {/* My Tasks Stat */}
          <div className="relative overflow-hidden group hover:shadow-lg transition-all duration-300 border-l-4 border-l-blue-500 rounded-lg border bg-card text-card-foreground shadow-sm">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
            <div className="flex flex-row items-center justify-between space-y-0 p-6 pb-2">
              <h3 className="text-sm font-medium text-muted-foreground">My Tasks</h3>
              <div className="h-10 w-10 rounded-full bg-blue-500/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Clock className="h-5 w-5 text-blue-500" />
              </div>
            </div>
            <div className="p-6 pt-0">
              <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">{userStats.totalTasks}</div>
              <p className="text-xs text-muted-foreground mt-1">Total assigned tasks</p>
            </div>
          </div>

          {/* Completed Stat */}
          <div className="relative overflow-hidden group hover:shadow-lg transition-all duration-300 border-l-4 border-l-green-500 rounded-lg border bg-card text-card-foreground shadow-sm">
            <div className="absolute inset-0 bg-gradient-to-br from-green-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
            <div className="flex flex-row items-center justify-between space-y-0 p-6 pb-2">
              <h3 className="text-sm font-medium text-muted-foreground">Completed</h3>
              <div className="h-10 w-10 rounded-full bg-green-500/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                <CheckCircle className="h-5 w-5 text-green-500" />
              </div>
            </div>
            <div className="p-6 pt-0">
              <div className="text-3xl font-bold text-green-600 dark:text-green-400">{userStats.completedTasks}</div>
              <p className="text-xs text-muted-foreground mt-1">{userStats.completionRate}% completion rate</p>
            </div>
          </div>

          {/* In Progress Stat */}
          <div className="relative overflow-hidden group hover:shadow-lg transition-all duration-300 border-l-4 border-l-amber-500 rounded-lg border bg-card text-card-foreground shadow-sm">
            <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
            <div className="flex flex-row items-center justify-between space-y-0 p-6 pb-2">
              <h3 className="text-sm font-medium text-muted-foreground">In Progress</h3>
              <div className="h-10 w-10 rounded-full bg-amber-500/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Clock className="h-5 w-5 text-amber-500" />
              </div>
            </div>
            <div className="p-6 pt-0">
              <div className="text-3xl font-bold text-amber-600 dark:text-amber-400">{userStats.inProgressTasks}</div>
              <p className="text-xs text-muted-foreground mt-1">Tasks currently in progress</p>
            </div>
          </div>

          {/* Pending Stat */}
          <div className="relative overflow-hidden group hover:shadow-lg transition-all duration-300 border-l-4 border-l-red-500 rounded-lg border bg-card text-card-foreground shadow-sm">
            <div className="absolute inset-0 bg-gradient-to-br from-red-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
            <div className="flex flex-row items-center justify-between space-y-0 p-6 pb-2">
              <h3 className="text-sm font-medium text-muted-foreground">Pending</h3>
              <div className="h-10 w-10 rounded-full bg-red-500/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                <AlertCircle className="h-5 w-5 text-red-500" />
              </div>
            </div>
            <div className="p-6 pt-0">
              <div className="text-3xl font-bold text-red-600 dark:text-red-400">{userStats.pendingTasks}</div>
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
                    {userStats.upcomingDeadlines.map((task) => (
                      <div
                        key={task.id}
                        className="flex items-center justify-between p-3 rounded-md bg-muted/50 cursor-pointer hover:bg-muted"
                        onClick={() => navigate(`/tasks/${task.id}`)}
                      >
                        <div>
                          <p className="font-medium text-sm">{task.title}</p>
                          <p className="text-xs text-muted-foreground">
                            Due: {formatDate(task.dueDate)}
                          </p>
                        </div>
                        <Badge className={getPriorityColor(task.priority)}>{task.priority}</Badge>
                      </div>
                    ))}
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
          <TabsList className="grid w-full max-w-2xl grid-cols-2 mx-auto h-auto items-stretch p-1.5 gap-2 rounded-xl bg-card/90 border border-border shadow-md">
            <TabsTrigger 
              value="tasks" 
              className="flex items-center justify-center gap-2 w-full data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md transition-all duration-200 font-semibold text-sm sm:text-base py-2.5 px-4 rounded-lg"
            >
              📋 My Tasks
            </TabsTrigger>
            <TabsTrigger 
              value="submissions" 
              className="relative flex items-center justify-center gap-2 w-full data-[state=active]:bg-accent data-[state=active]:text-accent-foreground data-[state=active]:shadow-md transition-all duration-200 font-semibold text-sm sm:text-base py-2.5 px-4 rounded-lg"
            >
              📤 My Submissions
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
                                    <Badge className={getStatusColor(task.status)}>{task.status}</Badge>
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
          <DialogContent className="sm:max-w-[700px] h-[85vh] flex flex-col bg-white dark:bg-gray-950 p-0">
            <DialogHeader className="flex-shrink-0 border-b pb-4 bg-gradient-to-r from-blue-50 via-indigo-50 to-purple-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-900 px-6 pt-6 border-gray-200 dark:border-gray-800">
              <div className="flex items-start justify-between">
                <div className="space-y-1 flex-1">
                  <DialogTitle className="text-2xl font-bold flex items-center gap-2 text-gray-900 dark:text-white">
                    <div className="h-10 w-10 rounded-lg bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center ring-1 ring-blue-200 dark:ring-blue-800">
                      <Github className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    Submission Details
                  </DialogTitle>
                  <DialogDescription className="text-base text-gray-600 dark:text-gray-400">
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
              <div className="flex-1 overflow-y-auto min-h-0 px-6 py-6 space-y-5 scroll-smooth scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-700 scrollbar-track-transparent hover:scrollbar-thumb-gray-400 dark:hover:scrollbar-thumb-gray-600">
                {/* Submission Info Card */}
                <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-lg border border-gray-200 dark:border-gray-800 shadow-sm">
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-2 text-sm">
                      <div className="h-8 w-8 rounded-lg bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center">
                        <Calendar className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                      </div>
                      <div>
                        <span className="font-medium text-gray-600 dark:text-gray-400 text-xs">Submitted on</span>
                        <p className="text-gray-900 dark:text-white font-semibold">
                          {formatDate(selectedSubmission.createdAt)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <div className="h-8 w-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center">
                        <Clock className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                      </div>
                      <div>
                        <span className="font-medium text-gray-600 dark:text-gray-400 text-xs">Time</span>
                        <p className="text-gray-900 dark:text-white font-semibold">
                          {formatTime(selectedSubmission.createdAt)}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* GitHub Repository */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="h-7 w-7 rounded-lg bg-green-100 dark:bg-green-900/40 flex items-center justify-center ring-1 ring-green-300 dark:ring-green-800">
                      <Github className="h-4 w-4 text-green-700 dark:text-green-400" />
                    </div>
                    <p className="font-semibold text-sm text-gray-900 dark:text-white">GitHub Repository</p>
                  </div>
                  <div className="group relative overflow-hidden rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/30 p-4 hover:shadow-lg transition-all hover:border-green-300 dark:hover:border-green-700">
                    <div className="flex items-center gap-3">
                      <Github className="h-5 w-5 text-green-700 dark:text-green-400 flex-shrink-0" />
                      <a
                        href={selectedSubmission.githubLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-700 dark:text-blue-300 hover:text-blue-800 dark:hover:text-blue-200 hover:underline flex items-center gap-2 font-medium break-all transition-colors"
                      >
                        <span className="flex-1">{selectedSubmission.githubLink}</span>
                        <ExternalLink className="h-4 w-4 flex-shrink-0 opacity-70 group-hover:opacity-100 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
                      </a>
                    </div>
                  </div>
                </div>

                {/* Additional Links */}
                {selectedSubmission.additionalLinks && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="h-7 w-7 rounded-lg bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center ring-1 ring-blue-300 dark:ring-blue-800">
                        <ExternalLink className="h-4 w-4 text-blue-700 dark:text-blue-400" />
                      </div>
                      <p className="font-semibold text-sm text-gray-900 dark:text-white">Additional Resources</p>
                    </div>
                    <div className="group relative overflow-hidden rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 p-4 hover:shadow-lg transition-all hover:border-blue-300 dark:hover:border-blue-700">
                      <div className="flex items-center gap-3">
                        <ExternalLink className="h-5 w-5 text-blue-700 dark:text-blue-400 flex-shrink-0" />
                        <a
                          href={selectedSubmission.additionalLinks}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-700 dark:text-blue-300 hover:text-blue-800 dark:hover:text-blue-200 hover:underline flex items-center gap-2 font-medium break-all transition-colors"
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
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="h-7 w-7 rounded-lg bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center ring-1 ring-amber-300 dark:ring-amber-800">
                        <AlertCircle className="h-4 w-4 text-amber-700 dark:text-amber-400" />
                      </div>
                      <p className="font-semibold text-sm text-gray-900 dark:text-white">Your Notes</p>
                    </div>
                    <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-4 shadow-sm">
                      <p className="text-sm whitespace-pre-line leading-relaxed text-gray-800 dark:text-gray-200">{selectedSubmission.notes}</p>
                    </div>
                  </div>
                )}

                {/* AI Score */}
                {selectedSubmission.parikshakReview?.score != null && selectedSubmission.status !== "Pending" && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="h-7 w-7 rounded-lg bg-purple-100 dark:bg-purple-900/40 flex items-center justify-center ring-1 ring-purple-300 dark:ring-purple-800">
                        <Bot className="h-4 w-4 text-purple-700 dark:text-purple-400" />
                      </div>
                      <p className="font-semibold text-sm text-gray-900 dark:text-white">AI Review Score</p>
                    </div>
                    <div className="rounded-lg border border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-950/30 p-4 shadow-sm space-y-3">
                      <div className="flex items-center justify-between">
                        <span className={`text-3xl font-bold ${
                          selectedSubmission.parikshakReview.score >= 85 ? "text-green-600 dark:text-green-400"
                          : selectedSubmission.parikshakReview.score >= 60 ? "text-amber-600 dark:text-amber-400"
                          : "text-red-600 dark:text-red-400"
                        }`}>
                          {selectedSubmission.parikshakReview.score}<span className="text-base font-normal text-gray-500">/100</span>
                        </span>
                        <span className={`text-xs font-bold px-2 py-1 rounded-full ${
                          selectedSubmission.parikshakReview.status === "PASS" ? "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300"
                          : selectedSubmission.parikshakReview.status === "PARTIAL" ? "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300"
                          : "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300"
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
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="h-7 w-7 rounded-lg bg-purple-100 dark:bg-purple-900/40 flex items-center justify-center ring-1 ring-purple-300 dark:ring-purple-800">
                        <Bot className="h-4 w-4 text-purple-700 dark:text-purple-400" />
                      </div>
                      <p className="font-semibold text-sm text-gray-900 dark:text-white">AI Review Comments</p>
                    </div>
                    <div className="rounded-lg border border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-950/30 p-4 shadow-sm">
                      <p className="text-sm whitespace-pre-line leading-relaxed text-gray-800 dark:text-gray-200">
                        {selectedSubmission.parikshakReview.review}
                      </p>
                    </div>
                  </div>
                )}

                {/* Reviewer Feedback / Pending Status (only if distinct from AI review) */}
                {selectedSubmission.feedback && selectedSubmission.feedback !== selectedSubmission.parikshakReview?.review && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <div className={`h-7 w-7 rounded-lg flex items-center justify-center ring-1 ${
                        selectedSubmission.status === "Approved"
                          ? "bg-green-100 dark:bg-green-900/40 ring-green-300 dark:ring-green-800"
                          : selectedSubmission.status === "Pending"
                          ? "bg-amber-100 dark:bg-amber-900/40 ring-amber-300 dark:ring-amber-800"
                          : "bg-red-100 dark:bg-red-900/40 ring-red-300 dark:ring-red-800"
                      }`}>
                        {selectedSubmission.status === "Approved" ? (
                          <ThumbsUp className="h-4 w-4 text-green-700 dark:text-green-400" />
                        ) : selectedSubmission.status === "Pending" ? (
                          <Clock className="h-4 w-4 text-amber-700 dark:text-amber-400" />
                        ) : (
                          <ThumbsDown className="h-4 w-4 text-red-700 dark:text-red-400" />
                        )}
                      </div>
                      <p className="font-semibold text-sm text-gray-900 dark:text-white">
                        {selectedSubmission.status === "Pending" ? "Review Status" : "Reviewer Feedback"}
                      </p>
                    </div>
                    <div className={`rounded-lg border p-4 shadow-md ${
                      selectedSubmission.status === "Approved"
                        ? "bg-green-50 dark:bg-green-950/30 border-green-300 dark:border-green-800"
                        : selectedSubmission.status === "Pending"
                        ? "bg-amber-50 dark:bg-amber-950/30 border-amber-300 dark:border-amber-800"
                        : "bg-red-50 dark:bg-red-950/30 border-red-300 dark:border-red-800"
                    }`}>
                      <p className="text-sm whitespace-pre-line leading-relaxed text-gray-800 dark:text-gray-200">
                        {selectedSubmission.feedback || (selectedSubmission.status === "Pending" ? "Awaiting review by an administrator." : "No feedback provided.")}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

            <DialogFooter className="flex-shrink-0 border-t border-gray-200 dark:border-gray-800 pt-4 gap-2 sm:gap-2 bg-gray-50 dark:bg-gray-900 px-6 pb-6">
              <Button 
                variant="outline" 
                onClick={() => setIsSubmissionDetailsOpen(false)}
                className="flex-1 sm:flex-none hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-900 dark:text-white border-gray-300 dark:border-gray-700"
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
                  className="flex-1 sm:flex-none hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:text-blue-700 dark:hover:text-blue-300 border-blue-300 dark:border-blue-700 text-gray-900 dark:text-white"
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
                  className="flex-1 sm:flex-none bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500 text-white shadow-md hover:shadow-lg transition-all"
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