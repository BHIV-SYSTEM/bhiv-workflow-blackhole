"use client"

import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { Card, CardContent } from "../components/ui/card"
import { Button } from "../components/ui/button"
import { Badge } from "../components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs"
import { Progress } from "../components/ui/progress"
import { Input } from "../components/ui/input"
import { getTaskStatusBadgeClass, getTaskStatusLabel, isTaskClosedOrCompleted } from "../lib/taskStatus"
import {
  Loader2,
  CheckCircle,
  Clock,
  Calendar,
  Github,
  ExternalLink,
  FileText,
  Search,
  RefreshCw,
  Eye,
  ListTodo,
  CheckSquare,
  Timer,
  MessageSquarePlus,
  ShieldAlert,
  ShieldCheck,
  Lock,
  PlayCircle,
  AlertTriangle,
  MessageSquare,
} from "lucide-react"
import { useToast } from "../hooks/use-toast"
import { useAuth } from "../context/auth-context"
import { API_URL } from "@/lib/api"
import { formatDate } from "@/lib/dateFormat"
import axios from "axios"
import { TaskSubmissionDialog } from "../components/tasks/task-submission-dialog"
import { TaskIntakeDialog } from "../components/tasks/TaskIntakeDialog"

function MyTasks() {
  const navigate = useNavigate()
  const { toast } = useToast()
  useAuth()
  const [tasks, setTasks] = useState([])
  const [submissions, setSubmissions] = useState({})
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedTask, setSelectedTask] = useState(null)
  const [isSubmissionDialogOpen, setIsSubmissionDialogOpen] = useState(false)
  const [isIntakeOpen, setIsIntakeOpen] = useState(false)
  const [actionLoadingId, setActionLoadingId] = useState(null)

  useEffect(() => {
    fetchMyTasks()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fetchMyTasks = async () => {
    const storedUser = JSON.parse(localStorage.getItem("WorkflowUser"))
    if (!storedUser?.id) {
      console.error("User ID is undefined")
      setIsLoading(false)
      return
    }

    try {
      setIsLoading(true)
      const token = localStorage.getItem("WorkflowToken")

      // Fetch user's tasks
      const tasksResponse = await axios.get(`${API_URL}/users/${storedUser.id}/tasks`, {
        headers: { "x-auth-token": token },
      })

      const userTasks = tasksResponse.data || []
      setTasks(userTasks)

      // Fetch submissions for each task
      const submissionsMap = {}
      for (const task of userTasks) {
        try {
          const submissionResponse = await axios.get(`${API_URL}/submissions/task/${task._id}`, {
            headers: { "x-auth-token": token },
          })
          if (submissionResponse.data) {
            submissionsMap[task._id] = submissionResponse.data
          }
        } catch {
          // No submission for this task
        }
      }
      setSubmissions(submissionsMap)
    } catch (error) {
      console.error("Error fetching tasks:", error)
      toast({
        title: "Error",
        description: "Failed to load your tasks",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const getStatusColor = (status) => `${getTaskStatusBadgeClass(status)} border`

  const getPriorityColor = (priority) => {
    switch (priority) {
      case "High":
      case "Urgent":
        return "bg-red-500/10 text-red-500 border-red-500/20"
      case "Medium":
        return "bg-amber-500/10 text-amber-500 border-amber-500/20"
      case "Low":
        return "bg-green-500/10 text-green-500 border-green-500/20"
      default:
        return "bg-gray-500/10 text-gray-500 border-gray-500/20"
    }
  }

  const getDaysRemaining = (dueDate) => {
    if (!dueDate) return 0
    const today = new Date()
    const due = new Date(dueDate)
    const diffTime = due - today
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    return diffDays
  }

  const handleStartExecution = async (task) => {
    try {
      setActionLoadingId(task._id)
      const token = localStorage.getItem("WorkflowToken")
      await axios.put(
        `${API_URL}/tasks/${task._id}`,
        { status: "In Progress" },
        { headers: { "x-auth-token": token } }
      )
      toast({
        title: "Execution Started",
        description: `Task '${task.title}' is now In Progress. Execution Gate unlocked.`,
      })
      fetchMyTasks()
    } catch (error) {
      console.error("Error starting execution:", error)
      const msg = error.response?.data?.message || error.response?.data?.error || "Failed to start execution"
      toast({
        title: "Execution Gate Locked",
        description: msg,
        variant: "destructive",
      })
    } finally {
      setActionLoadingId(null)
    }
  }

  const handleMarkComplete = async (task) => {
    try {
      setActionLoadingId(task._id)
      const token = localStorage.getItem("WorkflowToken")
      await axios.put(
        `${API_URL}/tasks/${task._id}`,
        { status: "Completed", progress: 100 },
        { headers: { "x-auth-token": token } }
      )
      toast({
        title: "Task Completed",
        description: `Task '${task.title}' has been marked as Completed.`,
      })
      fetchMyTasks()
    } catch (error) {
      console.error("Error completing task:", error)
      const msg = error.response?.data?.message || error.response?.data?.error || "Failed to mark task complete"
      toast({
        title: "Update Failed",
        description: msg,
        variant: "destructive",
      })
    } finally {
      setActionLoadingId(null)
    }
  }

  const handleSubmitTask = async (submissionData) => {
    try {
      const token = localStorage.getItem("WorkflowToken")
      const config = {
        headers: {
          "x-auth-token": token,
          "Content-Type": "multipart/form-data",
        },
      }

      submissionData.append("task", selectedTask._id)

      const existingSubmission = submissions[selectedTask._id]
      
      if (existingSubmission) {
        await axios.put(`${API_URL}/submissions/${existingSubmission._id}`, submissionData, config)
        toast({
          title: "Success",
          description: "Your submission has been updated and resubmitted to Parikshak / Lead for review",
        })
      } else {
        await axios.post(`${API_URL}/submissions`, submissionData, config)
        toast({
          title: "Success",
          description: "Your task has been submitted for review. Parikshak review initiated.",
        })
      }

      setIsSubmissionDialogOpen(false)
      fetchMyTasks()
    } catch (error) {
      console.error("Error submitting task:", error)
      toast({
        title: "Error",
        description: error?.response?.data?.error || "Failed to submit task",
        variant: "destructive",
      })
    }
  }

  const openSubmissionDialog = (task) => {
    setSelectedTask(task)
    setIsSubmissionDialogOpen(true)
  }

  // Filter tasks based on active tab
  const isValidationTask = (task) =>
    task.status === "Pending Validation" || task.status === "Returned" || task.status === "Submitted"

  const isClosedTask = (task) => isTaskClosedOrCompleted(task)

  const isReviewTask = (task) => {
    const sub = submissions[task._id]
    return (
      !isClosedTask(task) &&
      !isValidationTask(task) &&
      (task.status === "Submitted for Review" || (Boolean(sub) && sub.status !== "Rejected"))
    )
  }

  const isApprovedTask = (task) =>
    !isClosedTask(task) &&
    !isReviewTask(task) &&
    (task.status === "Approved" || task.status === "Pending")

  const isInProgressTask = (task) =>
    !isClosedTask(task) &&
    !isReviewTask(task) &&
    task.status === "In Progress"

  const filteredTasks = tasks.filter((task) => {
    const matchesSearch =
      task.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      task.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      task.task_id?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      task.originatingPerson?.toLowerCase().includes(searchQuery.toLowerCase())

    if (!matchesSearch) return false

    switch (activeTab) {
      case "validation":
        return isValidationTask(task)
      case "approved":
        return isApprovedTask(task)
      case "inprogress":
        return isInProgressTask(task)
      case "submitted":
        return isReviewTask(task)
      case "completed":
        return isClosedTask(task)
      default:
        return true
    }
  })

  // Stats
  const stats = {
    total: tasks.length,
    validation: tasks.filter(isValidationTask).length,
    approved: tasks.filter(isApprovedTask).length,
    inProgress: tasks.filter(isInProgressTask).length,
    submitted: tasks.filter(isReviewTask).length,
    completed: tasks.filter(isClosedTask).length,
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-8 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-5 sm:p-6 rounded-2xl bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border border-primary/20 shadow-sm">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-heading font-bold tracking-tight text-foreground">
              My Tasks
            </h1>
            <Badge variant="outline" className="border-primary/30 text-primary bg-primary/10 text-xs">
              Intake & Execution Gate
            </Badge>
          </div>
          <p className="text-muted-foreground mt-1 text-sm">
            Register assigned WhatsApp/Lead instructions, await authorization, execute, and submit for Parikshak review.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            onClick={() => setIsIntakeOpen(true)}
            className="gradient-primary text-primary-foreground font-medium rounded-xl px-4 py-2 shadow-glow-primary transition-all duration-200 gap-2 hover:opacity-95"
          >
            <MessageSquarePlus className="h-4 w-4" />
            Register Task Intake
          </Button>
          <Button
            onClick={fetchMyTasks}
            variant="outline"
            size="sm"
            className="group border border-border/70 hover:border-primary/40 hover:bg-primary/5 transition-all duration-200 rounded-xl px-4 py-2 h-10"
          >
            <RefreshCw className="h-4 w-4 mr-2 group-hover:rotate-180 transition-transform duration-500" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
        <Card
          interactive
          className={`border transition-all duration-200 ${
            activeTab === "all" ? "border-primary bg-primary/10 shadow-sm" : "border-border/60 hover:border-primary/40"
          }`}
          onClick={() => setActiveTab("all")}
        >
          <CardContent className="p-3.5">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-primary/10">
                <ListTodo className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-xl font-bold tabular-nums text-foreground">{stats.total}</p>
                <p className="text-[11px] text-muted-foreground font-medium">All Tasks</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card
          interactive
          className={`border transition-all duration-200 ${
            activeTab === "validation" ? "border-amber-500 bg-amber-500/10 shadow-sm" : "border-border/60 hover:border-amber-500/40"
          }`}
          onClick={() => setActiveTab("validation")}
        >
          <CardContent className="p-3.5">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-amber-500/10">
                <Lock className="h-4 w-4 text-amber-500" />
              </div>
              <div>
                <p className="text-xl font-bold tabular-nums text-amber-500">{stats.validation}</p>
                <p className="text-[11px] text-muted-foreground font-medium">Gate Pending</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card
          interactive
          className={`border transition-all duration-200 ${
            activeTab === "approved" ? "border-cyan-500 bg-cyan-500/10 shadow-sm" : "border-border/60 hover:border-cyan-500/40"
          }`}
          onClick={() => setActiveTab("approved")}
        >
          <CardContent className="p-3.5">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-cyan-500/10">
                <ShieldCheck className="h-4 w-4 text-cyan-500" />
              </div>
              <div>
                <p className="text-xl font-bold tabular-nums text-cyan-500">{stats.approved}</p>
                <p className="text-[11px] text-muted-foreground font-medium">Approved</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card
          interactive
          className={`border transition-all duration-200 ${
            activeTab === "inprogress" ? "border-blue-500 bg-blue-500/10 shadow-sm" : "border-border/60 hover:border-blue-500/40"
          }`}
          onClick={() => setActiveTab("inprogress")}
        >
          <CardContent className="p-3.5">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <Timer className="h-4 w-4 text-blue-500" />
              </div>
              <div>
                <p className="text-xl font-bold tabular-nums text-blue-500">{stats.inProgress}</p>
                <p className="text-[11px] text-muted-foreground font-medium">In Progress</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card
          interactive
          className={`border transition-all duration-200 ${
            activeTab === "submitted" ? "border-purple-500 bg-purple-500/10 shadow-sm" : "border-border/60 hover:border-purple-500/40"
          }`}
          onClick={() => setActiveTab("submitted")}
        >
          <CardContent className="p-3.5">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-purple-500/10">
                <CheckSquare className="h-4 w-4 text-purple-500" />
              </div>
              <div>
                <p className="text-xl font-bold tabular-nums text-purple-500">{stats.submitted}</p>
                <p className="text-[11px] text-muted-foreground font-medium">Review</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card
          interactive
          className={`border transition-all duration-200 ${
            activeTab === "completed" ? "border-emerald-500 bg-emerald-500/10 shadow-sm" : "border-border/60 hover:border-emerald-500/40"
          }`}
          onClick={() => setActiveTab("completed")}
        >
          <CardContent className="p-3.5">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-emerald-500/10">
                <CheckCircle className="h-4 w-4 text-emerald-500" />
              </div>
              <div>
                <p className="text-xl font-bold tabular-nums text-emerald-500">{stats.completed}</p>
                <p className="text-[11px] text-muted-foreground font-medium">Completed</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by task ID, title, originator (e.g. WhatsApp, T-WHT-...)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-11 h-11 rounded-xl border border-border/70 hover:border-primary/40 focus:border-primary transition-all duration-200 bg-card/70"
          />
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex w-full overflow-x-auto no-scrollbar sm:grid sm:grid-cols-6 h-auto sm:h-11 p-1 gap-1 bg-muted/50 border border-border/50 rounded-xl text-xs">
          <TabsTrigger value="all" className="rounded-lg font-medium shrink-0 px-3 py-2">All ({stats.total})</TabsTrigger>
          <TabsTrigger value="validation" className="rounded-lg font-medium text-amber-500 shrink-0 px-3 py-2">Gate Pending ({stats.validation})</TabsTrigger>
          <TabsTrigger value="approved" className="rounded-lg font-medium text-cyan-500 shrink-0 px-3 py-2">Approved ({stats.approved})</TabsTrigger>
          <TabsTrigger value="inprogress" className="rounded-lg font-medium text-blue-500 shrink-0 px-3 py-2">In Progress ({stats.inProgress})</TabsTrigger>
          <TabsTrigger value="submitted" className="rounded-lg font-medium text-purple-500 shrink-0 px-3 py-2">Review ({stats.submitted})</TabsTrigger>
          <TabsTrigger value="completed" className="rounded-lg font-medium text-emerald-500 shrink-0 px-3 py-2">Completed ({stats.completed})</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-6">
          {filteredTasks.length === 0 ? (
            <Card className="border-2 border-dashed border-muted-foreground/20">
              <CardContent className="flex flex-col items-center justify-center py-16">
                <div className="p-4 rounded-full bg-muted/50 mb-4">
                  <ListTodo className="h-12 w-12 text-muted-foreground/50" />
                </div>
                <p className="text-lg font-medium text-muted-foreground">No tasks found</p>
                <p className="text-sm text-muted-foreground/70 mt-1">Tasks matching your filter will appear here</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {filteredTasks.map((task) => {
                const submission = submissions[task._id]
                const daysRemaining = getDaysRemaining(task.dueDate)
                const isValidationPending = task.status === "Pending Validation" || task.status === "Submitted"
                const isReturned = task.status === "Returned"
                const isApproved = task.status === "Approved"
                const isPending = task.status === "Pending"
                const isClosed = isClosedTask(task)
                const isReview = isReviewTask(task)
                const isInProgress = isInProgressTask(task)

                return (
                  <Card
                    key={task._id}
                    className="group hover:shadow-lg hover:shadow-primary/5 transition-all duration-200 border border-border/70 hover:border-primary/35 rounded-2xl overflow-hidden"
                  >
                    <CardContent className="p-5 sm:p-6">
                      <div className="flex flex-col lg:flex-row lg:items-start gap-5">
                        {/* Task Info */}
                        <div className="flex-1 space-y-3 min-w-0">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                                {task.task_id && (
                                  <Badge variant="outline" className="font-mono text-xs border-primary/30 text-primary bg-primary/5">
                                    {task.task_id}
                                  </Badge>
                                )}
                                {task.sourceType && (
                                  <Badge variant="secondary" className="text-[11px] font-normal gap-1">
                                    <MessageSquare className="h-3 w-3 text-primary" />
                                    {task.sourceType}
                                    {task.originatingPerson && ` by ${task.originatingPerson}`}
                                  </Badge>
                                )}
                              </div>
                              <h3 className="font-semibold text-base sm:text-lg text-foreground">{task.title}</h3>
                              <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                                {task.description}
                              </p>
                            </div>
                            <div className="flex flex-wrap gap-1.5 flex-shrink-0">
                              <Badge className={getStatusColor(task.status)}>{getTaskStatusLabel(task.status)}</Badge>
                              <Badge className={getPriorityColor(task.priority)}>{task.priority}</Badge>
                            </div>
                          </div>

                          {/* Gate Status Banners */}
                          {isValidationPending && (
                            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between gap-3 text-xs text-amber-700 dark:text-amber-300">
                              <div className="flex items-center gap-2">
                                <Lock className="h-4 w-4 text-amber-500 shrink-0" />
                                <span>
                                  <strong>Authorisation Gate Active:</strong> Task is pending review by Project Lead. Execution is blocked until approved.
                                </span>
                              </div>
                              <Badge variant="outline" className="border-amber-500/40 text-amber-600 dark:text-amber-300 bg-amber-500/10 text-[10px] shrink-0">
                                Gate Locked
                              </Badge>
                            </div>
                          )}

                          {isReturned && (
                            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-2.5 text-xs text-rose-700 dark:text-rose-300">
                              <AlertTriangle className="h-4 w-4 text-rose-500 shrink-0 mt-0.5" />
                              <div>
                                <strong>Task Returned by Lead:</strong> {task.returnedFeedback || "Clarification needed before authorization."}
                              </div>
                            </div>
                          )}

                          {(isApproved || isPending) && (
                            <div className="p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-between gap-3 text-xs text-cyan-700 dark:text-cyan-300">
                              <div className="flex items-center gap-2">
                                <ShieldCheck className="h-4 w-4 text-cyan-500 shrink-0" />
                                <span>
                                  <strong>{isApproved ? "Gate Passed:" : "Task Assigned:"}</strong> {isApproved ? "Task authorized by Lead. You can now start execution." : "Task assigned and ready to execute. Click Start Execution to begin."}
                                </span>
                              </div>
                              <Badge variant="outline" className="border-cyan-500/40 text-cyan-600 dark:text-cyan-300 bg-cyan-500/10 text-[10px] shrink-0">
                                Ready to Execute
                              </Badge>
                            </div>
                          )}

                          {/* Progress */}
                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-muted-foreground text-xs">Progress</span>
                              <span className="font-medium text-xs">{task.progress || 0}%</span>
                            </div>
                            <Progress value={task.progress || 0} className="h-2" />
                          </div>

                          {/* Meta Info */}
                          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                            {task.dueDate && (
                              <div className="flex items-center gap-1">
                                <Calendar className="h-3.5 w-3.5" />
                                <span>Due: {formatDate(task.dueDate)}</span>
                                {daysRemaining <= 2 && daysRemaining >= 0 && (
                                  <Badge variant="destructive" className="ml-1 text-[10px]">
                                    {daysRemaining === 0 ? "Due Today" : `${daysRemaining}d left`}
                                  </Badge>
                                )}
                                {daysRemaining < 0 && (
                                  <Badge variant="destructive" className="ml-1 text-[10px]">Overdue</Badge>
                                )}
                              </div>
                            )}
                            {task.department && (
                              <div className="flex items-center gap-1">
                                <span>Dept: {task.department.name}</span>
                              </div>
                            )}
                            {task.sourceReference && (
                              <div className="flex items-center gap-1 text-muted-foreground">
                                <span>Ref: {task.sourceReference}</span>
                              </div>
                            )}
                          </div>

                          {/* Submission Info */}
                          {submission && (
                            <div className="mt-3 p-3 bg-gradient-to-r from-emerald-500/10 via-emerald-500/5 to-transparent rounded-xl border border-emerald-500/20">
                              <div className="flex items-center gap-2 mb-2">
                                <div className="p-1 rounded-md bg-emerald-500/20">
                                  <CheckSquare className="h-3.5 w-3.5 text-emerald-400" />
                                </div>
                                <span className="text-xs font-semibold text-emerald-400">Parikshak Review Packet Submitted</span>
                                {submission.status && (
                                  <Badge className={`ml-auto text-[10px] ${
                                    submission.status === "Approved"
                                      ? "bg-emerald-600 text-white"
                                      : submission.status === "Rejected"
                                      ? "bg-red-600 text-white"
                                      : "bg-amber-600 text-white"
                                  }`}>
                                    {submission.status}
                                  </Badge>
                                )}
                              </div>
                              <div className="flex flex-wrap gap-2 text-xs">
                                {submission.githubLink && (
                                  <a
                                    href={submission.githubLink}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-1 px-2.5 py-1 rounded bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-colors"
                                  >
                                    <Github className="h-3 w-3" />
                                    Repository / PR
                                    <ExternalLink className="h-2.5 w-2.5" />
                                  </a>
                                )}
                              </div>
                              {submission.feedback && (
                                <div className="mt-2 p-2 bg-background/80 rounded border text-xs">
                                  <span className="font-semibold text-foreground">Review Outcome: </span>
                                  <span className="text-muted-foreground">{submission.feedback}</span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Actions column */}
                        <div className="flex flex-wrap lg:flex-col gap-2 lg:w-48 shrink-0">
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1 lg:w-full h-9 rounded-xl border-border/70 hover:border-primary/50 text-xs font-medium"
                            onClick={() => navigate(`/tasks/${task._id}`)}
                          >
                            <Eye className="h-3.5 w-3.5 mr-1.5" />
                            View Details
                          </Button>

                          {/* State-dependent Execution Gate actions */}
                          {isValidationPending && (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled
                              className="flex-1 h-9 rounded-xl border-amber-500/30 bg-amber-500/5 text-amber-400 cursor-not-allowed opacity-80 font-medium text-xs"
                              title="Authorisation Gate: Awaiting Lead approval"
                            >
                              <Lock className="h-3.5 w-3.5 mr-1.5 text-amber-400" />
                              Gate Locked
                            </Button>
                          )}

                          {isReturned && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => navigate(`/tasks/${task._id}`)}
                              className="flex-1 h-9 rounded-xl border-rose-500/30 bg-rose-500/5 text-rose-400 font-medium text-xs hover:bg-rose-500/10"
                            >
                              <AlertTriangle className="h-3.5 w-3.5 mr-1.5 text-rose-400" />
                              See Lead Feedback
                            </Button>
                          )}

                          {(isApproved || isPending) && (
                            <Button
                              size="sm"
                              disabled={actionLoadingId === task._id}
                              className="flex-1 h-9 rounded-xl font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-md text-xs gap-1.5"
                              onClick={() => handleStartExecution(task)}
                            >
                              {actionLoadingId === task._id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <PlayCircle className="h-3.5 w-3.5" />
                              )}
                              Start Execution
                            </Button>
                          )}

                          {isInProgress && (
                            <div className="flex flex-wrap lg:flex-col gap-2 w-full">
                              <Button
                                size="sm"
                                className="flex-1 lg:w-full h-9 rounded-xl font-semibold bg-blue-600 hover:bg-blue-500 text-white shadow-sm text-xs gap-1.5"
                                onClick={() => openSubmissionDialog(task)}
                              >
                                <CheckSquare className="h-3.5 w-3.5" />
                                {submission?.status === "Rejected" ? "Resubmit Work" : "Submit Work"}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={actionLoadingId === task._id}
                                className="flex-1 lg:w-full h-9 rounded-xl font-semibold border-emerald-500/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 text-xs gap-1.5"
                                onClick={() => handleMarkComplete(task)}
                              >
                                {actionLoadingId === task._id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <CheckCircle className="h-3.5 w-3.5" />
                                )}
                                Mark Complete
                              </Button>
                            </div>
                          )}

                          {isReview && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="flex-1 h-9 rounded-xl border-purple-500/40 text-purple-400 hover:bg-purple-500/10 text-xs gap-1.5"
                              onClick={() => openSubmissionDialog(task)}
                            >
                              <RefreshCw className="h-3.5 w-3.5" />
                              Update Submission
                            </Button>
                          )}

                          {isClosed && (
                            <>
                              <Badge className="h-9 px-3 flex items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold text-xs gap-1">
                                <CheckCircle className="h-3.5 w-3.5" />
                                {task.status === "Closed" || submission?.status === "Approved" ? "Completed & Verified" : "Completed"}
                              </Badge>
                              {submission && submission.status === "Pending" && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="flex-1 h-9 rounded-xl border-purple-500/40 text-purple-400 hover:bg-purple-500/10 text-xs gap-1.5"
                                  onClick={() => openSubmissionDialog(task)}
                                >
                                  <RefreshCw className="h-3.5 w-3.5" />
                                  Update Submission
                                </Button>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Task Intake Dialog */}
      <TaskIntakeDialog
        open={isIntakeOpen}
        onOpenChange={setIsIntakeOpen}
        onTaskRegistered={fetchMyTasks}
      />

      {/* Submission Dialog */}
      {selectedTask && (
        <TaskSubmissionDialog
          open={isSubmissionDialogOpen}
          onOpenChange={setIsSubmissionDialogOpen}
          onSubmit={handleSubmitTask}
          existingSubmission={submissions[selectedTask._id]}
        />
      )}
    </div>
  )
}

export default MyTasks
