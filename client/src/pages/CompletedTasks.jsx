

"use client"

import { useState, useEffect, useRef, useMemo, useCallback } from "react"
import axios from "axios"
import { useNavigate } from "react-router-dom"
import { useToast } from "../hooks/use-toast"
import { Check, Clock, Filter, Github, Link2, Loader2, ThumbsDown, ThumbsUp, Search, AlertTriangle, ExternalLink, CheckCircle, XCircle, HelpCircle, FileText, RefreshCw, Sparkles, Cpu } from 'lucide-react'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "../components/ui/card"
import { Input } from "../components/ui/input"
import { Button } from "../components/ui/button"
import { Badge } from "../components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "../components/ui/avatar"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select"
import { Label } from "../components/ui/label"
import { Textarea } from "../components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs"
import { CompletedTasksStats } from "../components/dashboard/CompletedTasksStats"
import ParikshakReviewCard from "../components/submissions/ParikshakReviewCard"
import ParikshakModal from "../components/submissions/ParikshakModal"
import { API_URL } from "@/lib/api"
import { formatDate, formatDateTime } from "@/lib/dateFormat"
import { useAuth } from "../context/auth-context"
import { useTheme } from "../components/theme-provider"
import { getDeptColor } from "@/lib/departmentUtils"

const CompletedTasks = () => {
  const navigate = useNavigate()
  const { toast } = useToast()
  const { user: authUser } = useAuth()
  const { theme } = useTheme()
  const isDark = theme === "dark" || theme === "universe"
  const isAdmin = authUser?.role === "Admin" || authUser?.role === "Manager"
  const [tasks, setTasks] = useState([])
  const [departments, setDepartments] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [isPageLoading, setIsPageLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [selectedDepartment, setSelectedDepartment] = useState("all")
  const [selectedSubmission, setSelectedSubmission] = useState(null)
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false)
  const [reviewData, setReviewData] = useState({
    status: "Approved",
    feedback: "",
  })
  const [viewMode, setViewMode] = useState("grid")
  const [submissionFilter, setSubmissionFilter] = useState("all")
  const [showStats, setShowStats] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalTasks, setTotalTasks] = useState(0)
  const LIMIT = 20
  const abortRef = useRef(null)
  const departmentsLoadedRef = useRef(false)
  const initialLoadDoneRef = useRef(false)

  // Parikshak Modal & Evaluation States
  const [parikshakModalOpen, setParikshakModalOpen] = useState(false)
  const [isEvaluating, setIsEvaluating] = useState(false)
  const [parikshakData, setParikshakData] = useState(null)
  const [evaluatingSubmission, setEvaluatingSubmission] = useState(null)
  const [parikshakStatus, setParikshakStatus] = useState("checking") // 'checking' | 'online' | 'offline'

  const checkParikshakStatus = useCallback(async () => {
    try {
      const token = localStorage.getItem("WorkflowToken")
      const res = await axios.get(`${API_URL}/submissions/parikshak-status`, {
        headers: { "x-auth-token": token }
      })
      if (res.data?.status === "ONLINE") {
        setParikshakStatus("online")
      } else {
        setParikshakStatus("offline")
      }
    } catch (err) {
      setParikshakStatus("offline")
    }
  }, [])

  useEffect(() => {
    checkParikshakStatus()
  }, [checkParikshakStatus])

  const handleRunParikshak = async (submission) => {
    if (!submission) return
    setEvaluatingSubmission(submission)
    setParikshakModalOpen(true)
    setIsEvaluating(true)
    setParikshakData(null)

    try {
      const token = localStorage.getItem("WorkflowToken")
      const res = await axios.post(
        `${API_URL}/submissions/${submission._id}/evaluate-parikshak`,
        {},
        { headers: { "x-auth-token": token } }
      )
      setParikshakData(res.data)
    } catch (err) {
      console.error("Error evaluating submission via Parikshak:", err)
      toast({
        title: "Parikshak Evaluation Error",
        description: err.response?.data?.error || "Failed to run Parikshak evaluation engine.",
        variant: "destructive",
      })
    } finally {
      setIsEvaluating(false)
    }
  }

  const handleApproveAndAssignNext = async ({ evaluationData, customNextTask }) => {
    try {
      const token = localStorage.getItem("WorkflowToken")
      const subId = evaluationData?.submissionId || evaluatingSubmission?._id
      if (!subId) return

      await axios.post(
        `${API_URL}/submissions/${subId}/approve-and-assign-next`,
        {
          status: "Approved",
          feedback: evaluationData?.doneWell || "Approved via Parikshak",
          aiReviewDetails: evaluationData,
          nextTask: customNextTask
        },
        { headers: { "x-auth-token": token } }
      )

      toast({
        title: "Submission Approved & Task Assigned! 🎉",
        description: `Submission approved and next task "${customNextTask?.title || 'Next Task'}" assigned successfully.`,
      })

      setParikshakModalOpen(false)
      fetchData(page, debouncedSearch, selectedDepartment, submissionFilter)
    } catch (err) {
      console.error("Error confirming Parikshak approval:", err)
      toast({
        title: "Approval Error",
        description: err.response?.data?.error || "Failed to confirm approval and assign next task.",
        variant: "destructive",
      })
    }
  }

  // Debounce search input — avoid filtering on every keystroke
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm), 300)
    return () => clearTimeout(timer)
  }, [searchTerm])

  // Fetch departments once on mount only
  useEffect(() => {
    const token = localStorage.getItem("WorkflowToken")
    axios.get(`${API_URL}/departments`, { headers: { "x-auth-token": token } })
      .then((res) => {
        if (res.data.success && res.data.data) setDepartments(res.data.data)
        else if (Array.isArray(res.data)) setDepartments(res.data)
        departmentsLoadedRef.current = true
      })
      .catch(() => {})
  }, [])

  // Re-fetch from page 1 whenever any filter changes (also runs on mount)
  useEffect(() => {
    setPage(1)
    fetchData(1, debouncedSearch, selectedDepartment, submissionFilter)
  }, [debouncedSearch, selectedDepartment, submissionFilter])

  const fetchData = useCallback(async (pageNum = 1, search = debouncedSearch, dept = selectedDepartment, subStatus = submissionFilter) => {
    // Cancel any in-flight request
    if (abortRef.current) abortRef.current.abort()
    const controller = new AbortController()
    abortRef.current = controller

    const isInitialLoad = !initialLoadDoneRef.current
    if (isInitialLoad) setIsLoading(true)
    else setIsPageLoading(true)

    try {
      const token = localStorage.getItem("WorkflowToken")
      const headers = { "x-auth-token": token }
      const signal = controller.signal

      const params = new URLSearchParams({
        status: subStatus === "rejected"
          ? "Completed,Submitted for Review,Closed,In Progress"
          : "Completed,Submitted for Review,Closed",
        page: pageNum,
        limit: LIMIT,
      })
      if (search) params.set("search", search)
      if (dept && dept !== "all") params.set("department", dept)
      if (subStatus && subStatus !== "all") params.set("submissionStatus", subStatus)

      const tasksRes = await axios.get(`${API_URL}/tasks?${params}`, { headers, signal })

      const tasksData = tasksRes.data.tasks ?? tasksRes.data
      setTasks(Array.isArray(tasksData) ? tasksData : [])
      if (tasksRes.data.pages !== undefined) {
        setTotalPages(tasksRes.data.pages)
        setTotalTasks(tasksRes.data.total)
      }

      setPage(pageNum)
    } catch (error) {
      if (axios.isCancel(error) || error.name === "CanceledError") return
      console.error("Error fetching data:", error)
      toast({ title: "Error", description: "Failed to load data", variant: "destructive" })
    } finally {
      setIsLoading(false)
      setIsPageLoading(false)
      initialLoadDoneRef.current = true
    }
  }, [debouncedSearch, selectedDepartment, submissionFilter])


const [isReviewing, setIsReviewing] = useState(false)

  const handleReviewSubmission = async () => {
    if (!selectedSubmission) return

    try {
      setIsReviewing(true)
      const token = localStorage.getItem("WorkflowToken")
      const reviewerId = JSON.parse(localStorage.getItem("WorkflowUser")).id

      if (!reviewerId) throw new Error("Reviewer ID not found")

      const updatedReviewData = {
        status: reviewData.status,
        feedback: reviewData.feedback,
        reviewedBy: typeof reviewerId === "string" ? reviewerId : reviewerId.id,
      }

      await axios.put(
        `${API_URL}/submissions/${selectedSubmission._id}/review`,
        updatedReviewData,
        { headers: { "x-auth-token": token } }
      )

      toast({
        title: "Success",
        description: `Submission ${reviewData.status.toLowerCase()} successfully`,
      })

      setReviewDialogOpen(false)
      setReviewData({ status: "Approved", feedback: "" })
      fetchData(page, debouncedSearch, selectedDepartment, submissionFilter)
    } catch (error) {
      console.error("Error reviewing submission:", error)
      toast({
        title: "Error",
        description: "Failed to review submission",
        variant: "destructive",
      })
    } finally {
      setIsReviewing(false)
    }
  }

  const getSubmissionForTask = useCallback((task) => task.submission ?? null, [])

  const getSubmissionStatusBadge = (status) => {
    switch (status) {
      case "Approved":
        return (
          <Badge className="bg-green-100 text-green-800 hover:bg-green-200 dark:bg-green-900/50 dark:text-green-300 dark:hover:bg-green-900/70 flex items-center gap-1">
            <CheckCircle className="h-3 w-3" /> Approved
          </Badge>
        )
      case "Rejected":
        return (
          <Badge className="bg-red-100 text-red-800 hover:bg-red-200 dark:bg-red-900/50 dark:text-red-300 dark:hover:bg-red-900/70 flex items-center gap-1">
            <XCircle className="h-3 w-3" /> Rejected
          </Badge>
        )
      default:
        return (
          <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-200 dark:bg-amber-900/50 dark:text-amber-300 dark:hover:bg-amber-900/70 flex items-center gap-1">
            <HelpCircle className="h-3 w-3" /> Pending Review
          </Badge>
        )
    }
  }

  const getDocumentDetails = (documentLink, fileType) => {
    if (!documentLink) return { url: null, fileName: null, fileType: null }
    const fileName = documentLink.split("/").pop() || "Document"
    const url = documentLink
    const fileTypeMap = {
      "application/pdf": "PDF Document",
      "application/msword": "Word Document",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "Word Document",
      "image/png": "PNG Image",
      "image/jpeg": "JPEG Image",
    }
    const displayFileType = fileTypeMap[fileType] || "Document"
    const isPDF = fileType === "application/pdf"
    const isImage = fileType.startsWith("image/")
    const displayUrl = isPDF ? `${url}?_a=BAE6pY0` : url
    return { url: displayUrl, fileName, fileType: displayFileType, isImage }
  }

  // Filters are server-side — tasks is already the filtered+paginated result
  const filteredTasks = tasks

  // Memoize document details for the selected submission in the dialog
  const selectedDocumentDetails = useMemo(() => {
    if (!selectedSubmission?.documentLink) return null
    return getDocumentDetails(selectedSubmission.documentLink, selectedSubmission.fileType)
  }, [selectedSubmission])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[80vh]">
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p>Loading completed tasks...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background p-6">
      {/* ========== CLEAN HEADER WITH PARIKSHAK STATUS INDICATOR ========== */}
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-green-500/10 flex items-center justify-center">
            <CheckCircle className="h-5 w-5 text-green-500" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Completed Tasks</h1>
            <p className="text-muted-foreground text-xs sm:text-sm">
              Review and manage task submissions
            </p>
          </div>
        </div>

        {/* Parikshak AI Live Status Badge Indicator */}
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-2xl border border-border/60 bg-card/90 text-card-foreground shadow-sm shrink-0 self-start sm:self-auto transition-colors">
          <div className="p-2 rounded-xl border border-indigo-500/30 bg-indigo-500/15 text-indigo-500">
            <Cpu className="h-4 w-4 animate-pulse" />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">
                Parikshak AI Engine
              </span>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              {parikshakStatus === "online" ? (
                <Badge className="text-[11px] font-black tracking-wide flex items-center gap-1.5 px-2 py-0.5 bg-emerald-500/15 text-emerald-500 border border-emerald-500/30">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping"></span>
                  ONLINE
                </Badge>
              ) : parikshakStatus === "offline" ? (
                <Badge variant="outline" className={`text-[11px] font-black tracking-wide flex items-center gap-1.5 px-2 py-0.5 ${
                  isDark 
                    ? 'bg-rose-500/15 text-rose-300 border-rose-500/40' 
                    : 'bg-rose-100 text-rose-800 border-rose-300'
                }`}>
                  <span className="h-2 w-2 rounded-full bg-rose-500"></span>
                  OFFLINE (Manual Mode)
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[11px] font-medium flex items-center gap-1 px-2 py-0.5 bg-amber-500/15 text-amber-500 border-amber-500/30">
                  <Loader2 className="h-3 w-3 animate-spin text-amber-500" />
                  Checking...
                </Badge>
              )}
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={checkParikshakStatus}
            className="h-7 w-7 ml-1 rounded-lg transition-colors text-muted-foreground hover:text-foreground hover:bg-muted"
            title="Re-check Parikshak AI Engine status"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* ========== ACTION BUTTONS ========== */}
      <div className="flex flex-wrap gap-2 mb-6">
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => fetchData(page, debouncedSearch, selectedDepartment, submissionFilter)}
          disabled={isPageLoading}
          className="h-9 hover:bg-green-50 hover:border-green-300 transition-colors"
        >
          {isPageLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Clock className="mr-2 h-4 w-4" />} Refresh
        </Button>
        <Button 
          variant="outline" 
          size="sm" 
          className="h-9 hover:bg-green-50 hover:border-green-300 transition-colors"
          onClick={() => setShowStats(!showStats)}
        >
          {showStats ? "Hide Stats" : "Show Stats"}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-9 hover:bg-green-50 hover:border-green-300 transition-colors">
              <Filter className="mr-2 h-4 w-4" /> View
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setViewMode("grid")}>Grid View</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setViewMode("list")}>List View</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {showStats && (
        <div className="mb-6">
         <CompletedTasksStats departments={departments} />

        </div>
      )}

      {/* ========== FILTERS SECTION ========== */}
      <Card className="mb-6 border-l-4 border-l-green-500 overflow-hidden">
        <CardHeader className="bg-gradient-to-r from-green-500/5 to-transparent pb-3">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-green-500/10 flex items-center justify-center">
              <Filter className="h-4 w-4 text-green-500" />
            </div>
            <CardTitle className="text-base">Filters</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 pt-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search tasks or assignees..."
                className="pl-8"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <Select value={selectedDepartment} onValueChange={setSelectedDepartment}>
              <SelectTrigger className="w-full md:w-[200px]">
                <SelectValue placeholder="Filter by department" />
              </SelectTrigger>
              <SelectContent className="max-h-[250px] overflow-y-auto">
                <SelectItem value="all">All Departments</SelectItem>
                {Array.isArray(departments) && departments.map((department) => {
                  const deptColorInfo = getDeptColor(department.color)
                  return (
                    <SelectItem key={department._id} value={department._id}>
                      <div className="flex items-center">
                        <div className={`w-3 h-3 rounded-full mr-2 ${deptColorInfo.bgClass}`} style={deptColorInfo.style}></div>
                        {department.name}
                      </div>
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>
            <Select value={submissionFilter} onValueChange={setSubmissionFilter}>
              <SelectTrigger className="w-full md:w-[200px]">
                <SelectValue placeholder="Filter by submission" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Submissions</SelectItem>
                <SelectItem value="pending">Pending Review</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="noSubmission">No Submission</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* ========== TABS SECTION ========== */}
      <Tabs defaultValue="tasks" className="w-full">
        <TabsList className="h-auto p-0 bg-transparent flex gap-1 mb-6">
          <TabsTrigger 
            value="tasks" 
            className="flex items-center gap-2 py-2 px-4 rounded-lg border-2 border-muted data-[state=active]:bg-green-500 data-[state=active]:border-green-500 data-[state=active]:text-white hover:bg-green-50 hover:border-green-300 transition-all duration-200"
          >
            <Check className="h-4 w-4" />
            <span>Tasks</span>
          </TabsTrigger>
          <TabsTrigger 
            value="submissions" 
            className="flex items-center gap-2 py-2 px-4 rounded-lg border-2 border-muted data-[state=active]:bg-green-500 data-[state=active]:border-green-500 data-[state=active]:text-white hover:bg-green-50 hover:border-green-300 transition-all duration-200"
          >
            <Github className="h-4 w-4" />
            <span>Submissions</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="tasks" className="mt-0">
          {filteredTasks.length === 0 ? (
            <Card className="bg-muted/40">
              <CardContent className="flex flex-col items-center justify-center py-10">
                <div className="rounded-full bg-background p-3 mb-3">
                  <Check className="h-6 w-6 text-muted-foreground" />
                </div>
                <h3 className="text-xl font-semibold mb-1">No completed tasks found</h3>
                <p className="text-muted-foreground text-center max-w-md">
                  There are no completed tasks matching your current filters. Try changing your search criteria or check back later.
                </p>
              </CardContent>
            </Card>
          ) : viewMode === "grid" ? (
            <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 transition-opacity duration-200 ${isPageLoading ? "opacity-40 pointer-events-none" : "opacity-100"}`}>
              {filteredTasks.map((task) => {
                const submission = getSubmissionForTask(task)
                const document = submission ? getDocumentDetails(submission.documentLink, submission.fileType) : null
                return (
                  <Card
                    key={task._id}
                    className="overflow-hidden transition-all hover:shadow-lg hover:border-green-500/50 dark:hover:shadow-green-500/10 border-l-4 border-l-green-500 group flex flex-col justify-between h-full"
                  >
                    {/* ========== CARD HEADER ========== */}
                    <CardHeader className="pb-3 bg-gradient-to-r from-green-500/5 to-transparent flex-shrink-0">
                      <div className="flex justify-between items-start gap-3 mb-2">
                        <div className="flex-1 min-w-0">
                          <CardTitle className="text-base font-semibold line-clamp-2 group-hover:text-green-600 dark:group-hover:text-green-400 transition-colors">
                            {task.title}
                          </CardTitle>
                          <CardDescription className="line-clamp-2 mt-1.5 text-xs">
                            {task.description}
                          </CardDescription>
                        </div>
                        {submission && (
                          <div className="flex-shrink-0 flex flex-col gap-1 items-end">
                            {getSubmissionStatusBadge(submission.status)}
                            {submission.resubmittedAt && (
                              <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-200 dark:bg-blue-900/50 dark:text-blue-300 dark:hover:bg-blue-900/70 flex items-center gap-1 text-xs">
                                <RefreshCw className="h-3 w-3" /> Resubmitted
                              </Badge>
                            )}
                          </div>
                        )}
                      </div>
                      
                      {/* Task Meta Info */}
                      <div className="flex items-center gap-3 pt-2 border-t border-green-500/10">
                        {task.department && (() => {
                          const deptColorInfo = getDeptColor(task.department.color)
                          return (
                            <Badge
                              variant="outline"
                              className="border-none bg-background/50 hover:bg-background flex items-center gap-1.5 text-xs"
                            >
                              <div className={`w-2 h-2 rounded-full ${deptColorInfo.bgClass}`} style={deptColorInfo.style}></div>
                              <span>{task.department.name}</span>
                            </Badge>
                          )
                        })()}
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          <span>{formatDate(task.dueDate)}</span>
                        </div>
                      </div>
                    </CardHeader>

                    {/* ========== CARD CONTENT - SUBMISSION SECTION ========== */}
                    <CardContent className="pb-3 pt-3 flex-1 flex flex-col justify-between">
                      {submission ? (
                        <div className="space-y-3 flex-1 flex flex-col justify-between">
                          <div>
                            <div className="flex items-center gap-2 mb-2">
                              <div className="h-6 w-6 rounded-md bg-green-500/10 flex items-center justify-center flex-shrink-0">
                                <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                              </div>
                              <h4 className="text-sm font-medium text-green-600 dark:text-green-400">
                                Submission Details
                              </h4>
                            </div>
                            
                            <div className="bg-muted/30 rounded-lg p-3 space-y-2.5 border border-muted">
                              {submission.githubLink && (
                                <div className="flex items-start gap-2.5">
                                  <div className="mt-0.5 flex-shrink-0">
                                    <Github className="h-4 w-4 text-muted-foreground" />
                                  </div>
                                  <a
                                    href={submission.githubLink}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-sm text-blue-600 dark:text-blue-400 hover:underline truncate flex items-center gap-1 flex-1 min-w-0"
                                  >
                                    <span className="truncate">{submission.githubLink.replace(/^https?:\/\/(www\.)?github\.com\//, '')}</span>
                                    <ExternalLink className="h-3 w-3 flex-shrink-0" />
                                  </a>
                                </div>
                              )}
                              {submission.additionalLinks && (
                                <div className="flex items-start gap-2.5">
                                  <div className="mt-0.5 flex-shrink-0">
                                    <Link2 className="h-4 w-4 text-muted-foreground" />
                                  </div>
                                  <a
                                    href={submission.additionalLinks}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-sm text-blue-600 dark:text-blue-400 hover:underline truncate flex items-center gap-1 flex-1 min-w-0"
                                  >
                                    <span className="truncate">{new URL(submission.additionalLinks).hostname}</span>
                                    <ExternalLink className="h-3 w-3 flex-shrink-0" />
                                  </a>
                                </div>
                              )}
                              {document?.url && (
                                <div className="flex items-start gap-2.5">
                                  <div className="mt-0.5 flex-shrink-0">
                                    <FileText className="h-4 w-4 text-muted-foreground" />
                                  </div>
                                  <a
                                    href={document.url}
                                    target={document.isImage ? "_self" : "_blank"}
                                    rel="noopener noreferrer"
                                    className="text-sm text-blue-600 dark:text-blue-400 hover:underline truncate flex items-center gap-1 flex-1 min-w-0"
                                  >
                                    <span className="truncate">{document.fileName} ({document.fileType})</span>
                                    <ExternalLink className="h-3 w-3 flex-shrink-0" />
                                  </a>
                                </div>
                              )}
                              {submission.notes && (
                                <div className="pt-1 border-t border-muted">
                                  <p className="text-xs font-medium text-muted-foreground mb-1.5">Notes:</p>
                                  <p className="text-sm line-clamp-3 text-foreground/80">{submission.notes}</p>
                                </div>
                              )}
                            </div>
                          </div>
                          
                          {/* AI Review Card or Pending Badge */}
                          {submission.aiReviewDetails ? (
                            <ParikshakReviewCard submission={submission} />
                          ) : (
                            <div className="mt-3 p-3 bg-indigo-50/50 dark:bg-indigo-950/20 rounded-xl border border-dashed border-indigo-200 dark:border-indigo-800/50 flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 text-xs text-indigo-700 dark:text-indigo-300 font-medium">
                                <Sparkles className="h-4 w-4 text-indigo-500 animate-pulse shrink-0" />
                                <span>Ready for Parikshak AI Review</span>
                              </div>
                              <Badge variant="outline" className="text-[10px] bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 border-indigo-300 dark:border-indigo-700">
                                Pending AI Check
                              </Badge>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center py-6 text-muted-foreground bg-muted/20 rounded-lg border border-dashed border-muted">
                          <HelpCircle className="h-8 w-8 mb-2 opacity-50" />
                          <p className="text-sm font-medium">No submission yet</p>
                          <p className="text-xs mt-1">Awaiting employee submission</p>
                        </div>
                      )}
                    </CardContent>

                    {/* ========== CARD FOOTER - ACTIONS ========== */}
                    <CardFooter className="flex flex-wrap items-center justify-between gap-2 border-t bg-muted/20 p-3 mt-auto">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        {task.assignee ? (
                          <div className="flex items-center gap-1.5 min-w-0">
                            <Avatar className="h-6 w-6 ring-1 ring-green-500/20 shrink-0">
                              <AvatarImage src={task.assignee.avatar || "/placeholder.svg"} />
                              <AvatarFallback className="text-[10px] bg-green-500/10 text-green-600 dark:text-green-400 font-medium">
                                {task.assignee.name
                                  .split(" ")
                                  .map((n) => n[0])
                                  .join("")}
                              </AvatarFallback>
                            </Avatar>
                            <span className="text-xs font-medium truncate max-w-[100px] sm:max-w-[120px]">{task.assignee.name}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground italic truncate">Unassigned</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {submission && (
                          <Button
                            size="sm"
                            className="h-7 px-2.5 text-xs bg-indigo-600 hover:bg-indigo-700 text-white shrink-0 flex items-center gap-1 font-medium shadow-sm"
                            onClick={() => handleRunParikshak(submission)}
                          >
                            <Sparkles className="h-3.5 w-3.5 text-indigo-200" />
                            Parikshak
                          </Button>
                        )}
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={() => navigate(`/tasks/${task._id}`)} 
                          className="h-7 px-2.5 text-xs hover:bg-green-50 hover:border-green-300 dark:hover:bg-green-950/20"
                        >
                          View
                        </Button>
                        {submission && isAdmin && (
                          <Button
                            size="sm"
                            className="h-7 px-2.5 text-xs bg-green-500 hover:bg-green-600 text-white shrink-0"
                            onClick={() => {
                              setSelectedSubmission(submission)
                              setReviewData({ status: submission.status || "Approved", feedback: submission.feedback || "" })
                              setReviewDialogOpen(true)
                            }}
                          >
                            {submission.status === "Pending" ? "Review" : "Re-review"}
                          </Button>
                        )}
                      </div>
                    </CardFooter>
                  </Card>
                )
              })}
            </div>
          ) : (
            <Card className={`transition-opacity duration-200 ${isPageLoading ? "opacity-40 pointer-events-none" : "opacity-100"}`}>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-4 font-medium">Task</th>
                        <th className="text-left p-4 font-medium">Assignee</th>
                        <th className="text-left p-4 font-medium">Department</th>
                        <th className="text-left p-4 font-medium">Submission</th>
                        <th className="text-left p-4 font-medium">Status</th>
                        <th className="text-right p-4 font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTasks.map((task) => {
                        const submission = getSubmissionForTask(task)
                        const document = submission ? getDocumentDetails(submission.documentLink, submission.fileType) : null
                        return (
                          <tr key={task._id} className="border-b hover:bg-muted/50">
                            <td className="p-4">
                              <div className="font-medium">{task.title}</div>
                              <div className="text-sm text-muted-foreground">
                                Due: {formatDate(task.dueDate)}
                              </div>
                            </td>
                            <td className="p-4">
                              {task.assignee ? (
                                <div className="flex items-center gap-2">
                                  <Avatar className="h-6 w-6">
                                    <AvatarImage src={task.assignee.avatar || "/placeholder.svg"} />
                                    <AvatarFallback className="text-xs">
                                      {task.assignee.name
                                        .split(" ")
                                        .map((n) => n[0])
                                        .join("")}
                                    </AvatarFallback>
                                  </Avatar>
                                  <span>{task.assignee.name}</span>
                                </div>
                              ) : (
                                <span className="text-muted-foreground">Unassigned</span>
                              )}
                            </td>
                            <td className="p-4">
                              {task.department ? (() => {
                                const deptColorInfo = getDeptColor(task.department.color)
                                return (
                                  <div className="flex items-center gap-2">
                                    <div className={`w-3 h-3 rounded-full ${deptColorInfo.bgClass}`} style={deptColorInfo.style}></div>
                                    <span>{task.department.name}</span>
                                  </div>
                                )
                              })() : (
                                <span className="text-muted-foreground">None</span>
                              )}
                            </td>
                            <td className="p-4">
                              {submission ? (
                                <div className="space-y-2">
                                  {submission.githubLink && (
                                    <div className="flex items-center gap-2">
                                      <Github className="h-4 w-4" />
                                      <a
                                        href={submission.githubLink}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-blue-600 dark:text-blue-400 hover:underline truncate max-w-[200px] flex items-center gap-1"
                                      >
                                        {submission.githubLink.replace(/^https?:\/\/(www\.)?github\.com\//, '')}
                                        <ExternalLink className="h-3 w-3" />
                                      </a>
                                    </div>
                                  )}
                                  {document?.url && (
                                    <div className="flex items-center gap-2">
                                      <FileText className="h-4 w-4" />
                                      <a
                                        href={document.url}
                                        target={document.isImage ? "_self" : "_blank"}
                                        rel="noopener noreferrer"
                                        className="text-blue-600 dark:text-blue-400 hover:underline truncate max-w-[200px] flex items-center gap-1"
                                      >
                                        {document.fileName} ({document.fileType})
                                        <ExternalLink className="h-3 w-3" />
                                      </a>
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <span className="text-muted-foreground">No submission</span>
                              )}
                            </td>
                            <td className="p-4">
                              {submission ? (
                                <div className="flex flex-col gap-1">
                                  {getSubmissionStatusBadge(submission.status)}
                                  {submission.resubmittedAt && (
                                    <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-200 dark:bg-blue-900/50 dark:text-blue-300 text-xs flex items-center gap-1 w-fit">
                                      <RefreshCw className="h-3 w-3" /> Resubmitted
                                    </Badge>
                                  )}
                                </div>
                              ) : <span>—</span>}
                            </td>
                            <td className="p-4 text-right">
                              <div className="flex justify-end gap-2">
                                {submission && (
                                  <Button
                                    size="sm"
                                    className="h-8 bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-1 text-xs"
                                    onClick={() => handleRunParikshak(submission)}
                                  >
                                    <Sparkles className="h-3.5 w-3.5 text-indigo-200" />
                                    Parikshak
                                  </Button>
                                )}
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => navigate(`/tasks/${task._id}`)}
                                  className="h-8"
                                >
                                  View
                                </Button>
                                {submission && isAdmin && (
                                  <Button
                                    size="sm"
                                    className="h-8"
                                    onClick={() => {
                                      setSelectedSubmission(submission)
                                      setReviewData({ status: submission.status || "Approved", feedback: submission.feedback || "" })
                                      setReviewDialogOpen(true)
                                    }}
                                  >
                                    {submission.status === "Pending" ? "Review" : "Re-review"}
                                  </Button>
                                )}
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
          {totalPages > 1 && (
  <div className="flex items-center justify-between mt-6">
    <p className="text-sm text-muted-foreground">
      Page {page} of {totalPages} — {totalTasks} total tasks
    </p>
    <div className="flex gap-2">
      <Button variant="outline" size="sm" onClick={() => fetchData(page - 1, debouncedSearch, selectedDepartment, submissionFilter)} disabled={page <= 1 || isPageLoading}>
        {isPageLoading ? <><Loader2 className="h-4 w-4 animate-spin mr-1" />Previous</> : "Previous"}
      </Button>
      <Button variant="outline" size="sm" onClick={() => fetchData(page + 1, debouncedSearch, selectedDepartment, submissionFilter)} disabled={page >= totalPages || isPageLoading}>
        {isPageLoading ? <><Loader2 className="h-4 w-4 animate-spin mr-1" />Next</> : "Next"}
      </Button>
    </div>
  </div>
)}
        </TabsContent>
        
           
        <TabsContent value="submissions" className="mt-0">
          <Card>
            <CardHeader>
              <CardTitle>Task Submissions</CardTitle>
              <CardDescription>All submissions for completed tasks</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-4 font-medium">Task</th>
                      <th className="text-left p-4 font-medium">Submitted By</th>
                      <th className="text-left p-4 font-medium">Submission Details</th>
                      <th className="text-left p-4 font-medium">Submitted On</th>
                      <th className="text-left p-4 font-medium">Status</th>
                      <th className="text-right p-4 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tasks
                      .filter((task) => task.submission)
                      .map((task) => {
                        const submission = task.submission
                        const document = getDocumentDetails(submission.documentLink, submission.fileType)
                        return (
                          <tr key={task._id} className="border-b hover:bg-muted/50">
                            <td className="p-4">
                              <div className="font-medium">{task.title}</div>
                            </td>
                            <td className="p-4">
                              {task.assignee ? (
                                <div className="flex items-center gap-2">
                                  <Avatar className="h-6 w-6">
                                    <AvatarImage src={task.assignee.avatar || "/placeholder.svg"} />
                                    <AvatarFallback className="text-xs">
                                      {task.assignee.name.split(" ").map((n) => n[0]).join("")}
                                    </AvatarFallback>
                                  </Avatar>
                                  <span>{task.assignee.name}</span>
                                </div>
                              ) : (
                                <span className="text-muted-foreground">Unknown User</span>
                              )}
                            </td>
                            <td className="p-4">
                              <div className="space-y-2">
                                {submission.githubLink && (
                                  <div className="flex items-center gap-2">
                                    <Github className="h-4 w-4" />
                                    <a
                                      href={submission.githubLink}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-blue-600 dark:text-blue-400 hover:underline truncate max-w-[200px] flex items-center gap-1"
                                    >
                                      {submission.githubLink.replace(/^https?:\/\/(www\.)?github\.com\//, '')}
                                      <ExternalLink className="h-3 w-3" />
                                    </a>
                                  </div>
                                )}
                                {document?.url && (
                                  <div className="flex items-center gap-2">
                                    <FileText className="h-4 w-4" />
                                    <a
                                      href={document.url}
                                      target={document.isImage ? "_self" : "_blank"}
                                      rel="noopener noreferrer"
                                      className="text-blue-600 dark:text-blue-400 hover:underline truncate max-w-[200px] flex items-center gap-1"
                                    >
                                      {document.fileName} ({document.fileType})
                                      <ExternalLink className="h-3 w-3" />
                                    </a>
                                  </div>
                                )}
                                {submission.notes && (
                                  <div className="pt-1 text-sm">
                                    <p className="text-xs font-medium text-muted-foreground">Notes:</p>
                                    <p className="line-clamp-2">{submission.notes}</p>
                                  </div>
                                )}
                              </div>
                            </td>
                            <td className="p-4">
                              {formatDate(submission.createdAt)}
                              {submission.resubmittedAt && (
                                <div className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                                  Resubmitted: {formatDate(submission.resubmittedAt)}
                                </div>
                              )}
                            </td>
                            <td className="p-4">
                              <div className="flex flex-col gap-1">
                                {getSubmissionStatusBadge(submission.status)}
                                {submission.resubmittedAt && (
                                  <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-200 dark:bg-blue-900/50 dark:text-blue-300 text-xs flex items-center gap-1 w-fit">
                                    <RefreshCw className="h-3 w-3" /> Resubmitted
                                  </Badge>
                                )}
                              </div>
                            </td>
                            <td className="p-4 text-right">
                              <div className="flex justify-end gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => navigate(`/tasks/${task._id}`)}
                                  className="h-8"
                                >
                                  View Task
                                </Button>
                                {isAdmin && (
                                  <Button
                                    size="sm"
                                    className="h-8"
                                    onClick={() => {
                                      setSelectedSubmission(submission)
                                      setReviewData({ status: submission.status || "Approved", feedback: submission.feedback || "" })
                                      setReviewDialogOpen(true)
                                    }}
                                  >
                                    {submission.status === "Pending" ? "Review" : "Re-review"}
                                  </Button>
                                )}
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
        <DialogContent className="sm:max-w-[700px] max-h-[92vh] overflow-hidden bg-card text-card-foreground border border-border/70 rounded-2xl shadow-2xl p-0">
          {/* Hidden title for accessibility */}
          <DialogTitle className="sr-only">
            {selectedSubmission?.status === "Pending" ? "Review Task Submission" : "Re-review Task Submission"}
          </DialogTitle>

          {/* Scrollable Content Area */}
          <div className="px-6 sm:px-7 pt-6 pb-6 overflow-y-auto max-h-[calc(92vh-120px)] scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
            {selectedSubmission && (
              <div className="grid gap-6">
                {/* Task Information */}
                <div className="grid gap-2.5">
                  <Label className="text-sm font-bold text-foreground flex items-center gap-1.5">
                    <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse"></div>
                    Task Information
                  </Label>
                  <div className="relative overflow-hidden bg-muted/40 border border-border/60 rounded-2xl p-5 transition-all duration-200 hover:border-primary/40">
                    <div className="relative">
                      <h4 className="font-bold text-lg text-foreground mb-2 tracking-tight">{selectedSubmission.task?.title}</h4>
                      <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3">
                        {selectedSubmission.task?.description}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Submission Details */}
                <div className="grid gap-2.5">
                  <Label className="text-sm font-bold text-foreground flex items-center gap-1.5">
                    <div className="h-1.5 w-1.5 rounded-full bg-secondary animate-pulse"></div>
                    Submission Details
                  </Label>
                  <div className="relative overflow-hidden bg-muted/40 border border-border/60 rounded-2xl p-5 space-y-3">
                    {selectedSubmission.githubLink && (
                      <div className="relative overflow-hidden flex flex-wrap items-start gap-2.5 p-3.5 bg-card/80 rounded-xl border border-border/60 transition-all duration-200 hover:border-primary/40 group">
                        <Github className="h-4 w-4 text-foreground flex-shrink-0 mt-0.5 transition-transform duration-200 group-hover:scale-110" />
                        <a
                          href={selectedSubmission.githubLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline flex items-center gap-1.5 flex-1 min-w-0 break-all text-sm font-semibold transition-colors"
                        >
                          <span className="truncate">{selectedSubmission.githubLink}</span>
                          <ExternalLink className="h-3.5 w-3.5 flex-shrink-0" />
                        </a>
                      </div>
                    )}
                    {selectedSubmission.additionalLinks && (
                      <div className="relative overflow-hidden flex flex-wrap items-start gap-2.5 p-3.5 bg-muted/40 rounded-xl border border-border/60 transition-all duration-200 hover:border-secondary/40 hover:shadow-sm group">
                        <Link2 className="h-4 w-4 text-foreground flex-shrink-0 mt-0.5 transition-transform duration-200 group-hover:scale-110" />
                        <a
                          href={selectedSubmission.additionalLinks}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline flex items-center gap-1.5 flex-1 min-w-0 break-all text-sm font-semibold transition-colors"
                        >
                          <span className="truncate">{selectedSubmission.additionalLinks}</span>
                          <ExternalLink className="h-3.5 w-3.5 flex-shrink-0" />
                        </a>
                      </div>
                    )}
                    {selectedDocumentDetails?.url && (
                      <div className="relative overflow-hidden flex flex-wrap items-start gap-2.5 p-3.5 bg-muted/40 rounded-xl border border-border/60 transition-all duration-200 hover:border-accent/40 hover:shadow-sm group">
                        <FileText className="h-4 w-4 text-foreground flex-shrink-0 mt-0.5 transition-transform duration-200 group-hover:scale-110" />
                        <a
                          href={selectedDocumentDetails.url}
                          target={selectedDocumentDetails.isImage ? "_self" : "_blank"}
                          rel="noopener noreferrer"
                          className="text-primary hover:underline flex items-center gap-1.5 flex-1 min-w-0 break-all text-sm font-semibold transition-colors"
                        >
                          <span className="truncate">
                            {selectedDocumentDetails.fileName} 
                            ({selectedDocumentDetails.fileType})
                          </span>
                          <ExternalLink className="h-3.5 w-3.5 flex-shrink-0" />
                        </a>
                      </div>
                    )}
                    {selectedSubmission.notes && (
                      <div className="relative overflow-hidden bg-accent/15 border border-accent/40 rounded-2xl p-4 mt-3 transition-all duration-200">
                        <div className="flex items-center gap-2 mb-2">
                          <svg className="h-4 w-4 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                          </svg>
                          <h4 className="text-sm font-bold text-foreground">Notes from Submitter:</h4>
                        </div>
                        <p className="text-sm text-foreground/90 whitespace-pre-line leading-relaxed">{selectedSubmission.notes}</p>
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-sm text-muted-foreground pt-3 mt-2 border-t border-border/60">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">Submitted on {formatDateTime(selectedSubmission.createdAt)}</span>
                    </div>
                  </div>
                </div>

                {/* Review History */}
                {selectedSubmission.reviewHistory && selectedSubmission.reviewHistory.length > 0 && (
                  <div className="grid gap-2.5">
                    <Label className="text-sm font-bold text-foreground flex items-center gap-1.5">
                      <div className="h-1.5 w-1.5 rounded-full bg-info animate-pulse"></div>
                      Review History
                    </Label>
                    <div className="space-y-2.5">
                      {selectedSubmission.reviewHistory.map((review, index) => (
                        <div key={index} className="relative overflow-hidden bg-muted/40 border border-border/60 rounded-2xl p-4 transition-all duration-200 hover:border-info/40 group">
                          <div className="relative">
                            <div className="flex justify-between items-center mb-2.5">
                              <span className="font-bold text-foreground text-base">{review.status}</span>
                              <span className="text-xs text-muted-foreground flex items-center gap-1.5 bg-background/70 px-2.5 py-1 rounded-lg border border-border/50">
                                <Clock className="h-3.5 w-3.5" />
                                {formatDateTime(review.reviewedAt)}
                              </span>
                            </div>
                            <p className="text-sm text-foreground/90 mb-1">
                              <span className="font-semibold">Reviewer:</span> {review.reviewedBy?.name || "Unknown"}
                            </p>
                            {review.feedback && (
                              <p className="text-sm text-foreground/90 mt-2 pt-2 border-t border-border/50">
                                <span className="font-semibold">Feedback:</span> {review.feedback}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Review Decision */}
                <div className="grid gap-2.5">
                  <Label htmlFor="review-status" className="text-sm font-bold text-foreground flex items-center gap-1.5">
                    <div className="h-1.5 w-1.5 rounded-full bg-success animate-pulse"></div>
                    Review Decision <span className="text-destructive ml-0.5">*</span>
                  </Label>
                  <div className="flex gap-3 flex-col sm:flex-row">
                    <Button
                      type="button"
                      variant={reviewData.status === "Approved" ? "default" : "outline"}
                      className={
                        reviewData.status === "Approved"
                          ? "flex-1 h-12 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-md transition-all duration-200 font-bold text-sm sm:text-base"
                          : "flex-1 h-12 rounded-xl border border-emerald-500/40 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/15 transition-all duration-200 font-bold text-sm sm:text-base"
                      }
                      onClick={() => setReviewData({ ...reviewData, status: "Approved" })}
                    >
                      <ThumbsUp className="mr-2 h-4 w-4" /> Approve Submission
                    </Button>
                    <Button
                      type="button"
                      variant={reviewData.status === "Rejected" ? "default" : "outline"}
                      className={
                        reviewData.status === "Rejected"
                          ? "flex-1 h-12 rounded-xl bg-destructive hover:bg-destructive/90 text-destructive-foreground shadow-md transition-all duration-200 font-bold text-sm sm:text-base"
                          : "flex-1 h-12 rounded-xl border border-destructive/40 bg-destructive/5 text-destructive hover:bg-destructive/15 transition-all duration-200 font-bold text-sm sm:text-base"
                      }
                      onClick={() => setReviewData({ ...reviewData, status: "Rejected" })}
                    >
                      <ThumbsDown className="mr-2 h-4 w-4" /> Reject Submission
                    </Button>
                  </div>
                </div>

                {/* Feedback */}
                <div className="grid gap-2.5">
                  <Label htmlFor="feedback" className="text-sm font-bold text-foreground flex items-center gap-1.5">
                    <div className="h-1.5 w-1.5 rounded-full bg-warning animate-pulse"></div>
                    Feedback (Optional)
                  </Label>
                  <Textarea
                    id="feedback"
                    placeholder="Provide detailed feedback to help the submitter improve..."
                    value={reviewData.feedback}
                    onChange={(e) => setReviewData({ ...reviewData, feedback: e.target.value })}
                    rows={4}
                    className="px-4 py-3 bg-muted/40 border border-border/70 focus:border-warning/60 rounded-xl resize-none transition-all duration-200 text-sm sm:text-base placeholder:text-muted-foreground text-foreground"
                  />
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="relative px-6 py-4 border-t border-border/60 bg-muted/30">
            <div className="relative flex items-center gap-3 w-full sm:w-auto sm:ml-auto">
              <Button 
                variant="outline" 
                onClick={() => setReviewDialogOpen(false)} 
                className="flex-1 sm:flex-none h-11 px-5 rounded-xl font-semibold"
              >
                <svg className="h-4 w-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
                Cancel
              </Button>
              <Button 
                onClick={handleReviewSubmission} 
                disabled={isReviewing} 
                className="flex-1 sm:flex-none h-12 px-8 rounded-xl bg-gradient-to-r from-primary via-primary to-primary/90 hover:from-primary/90 hover:via-primary hover:to-primary text-primary-foreground shadow-xl shadow-primary/40 hover:shadow-2xl hover:shadow-primary/50 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-xl font-bold text-base backdrop-blur-lg"
              >
                {isReviewing ? (
                  <span className="flex items-center gap-2.5">
                    <div className="h-4 w-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin"></div>
                    Processing...
                  </span>
                ) : (
                  <span className="flex items-center gap-2.5">
                    <CheckCircle className="h-5 w-5" />
                    Submit Review
                  </span>
                )}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Parikshak Evaluation & Next Task Confirmation Modal */}
      <ParikshakModal
        isOpen={parikshakModalOpen}
        onClose={() => setParikshakModalOpen(false)}
        loading={isEvaluating}
        evaluationData={parikshakData}
        onApproveAndAssign={handleApproveAndAssignNext}
        onReject={() => {
          setParikshakModalOpen(false);
          if (evaluatingSubmission) {
            setSelectedSubmission(evaluatingSubmission);
            setReviewData({ status: "Rejected", feedback: parikshakData?.missingWork || "Submission requires revisions." });
            setReviewDialogOpen(true);
          }
        }}
      />
    </div>
  )
}

export default CompletedTasks
