

// "use client"

// import { useState, useEffect } from "react"
// import { useParams, useNavigate } from "react-router-dom"
// import axios from "axios"
// import { useToast } from "../hooks/use-toast"
// import { useAuth } from "../context/auth-context"
// import {
//   Calendar,
//   Clock,
//   AlertTriangle,
//   CheckCircle,
//   ArrowLeft,
//   FileText,
//   Github,
//   Link2,
//   ExternalLink,
//   Users,
//   BarChart3,
//   FileCode,
//   Layers,
// } from "lucide-react"
// import { Button } from "../components/ui/button"
// import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "../components/ui/card"
// import { Badge } from "../components/ui/badge"
// import { Progress } from "../components/ui/progress"
// import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs"
// import { Avatar, AvatarFallback, AvatarImage } from "../components/ui/avatar"
// import { TaskSubmissionDialog } from "../components/tasks/task-submission-dialog"
// import { Skeleton } from "../components/ui/skeleton"
// import { API_URL } from "@/lib/api"

// function TaskDetails() {
//   const { id } = useParams()
//   const navigate = useNavigate()
//   const { toast } = useToast()
//   const { user } = useAuth()
//   const [task, setTask] = useState(null)
//   const [isLoading, setIsLoading] = useState(true)
//   const [isSubmissionDialogOpen, setIsSubmissionDialogOpen] = useState(false)
//   const [submission, setSubmission] = useState(null)

//   useEffect(() => {
//     const fetchTaskDetails = async () => {
//       try {
//         setIsLoading(true)
//         const token = localStorage.getItem("WorkflowToken")
//         const taskResponse = await axios.get(`${API_URL}/tasks/${id}`, {
//           headers: { "x-auth-token": token },
//         })
//         setTask(taskResponse.data)

//         try {
//           const submissionResponse = await axios.get(`${API_URL}/submissions/task/${id}`, {
//             headers: { "x-auth-token": token },
//           })
//           if (submissionResponse.data) {
//             setSubmission(submissionResponse.data)
//           }
//         } catch (error) {
//           console.log("No submission found for this task")
//         }
//       } catch (error) {
//         console.error("Error fetching task details:", error)
//         toast({
//           title: "Error",
//           description: "Failed to load task details",
//           variant: "destructive",
//         })
//       } finally {
//         setIsLoading(false)
//       }
//     }

//     if (id) {
//       fetchTaskDetails()
//     }
//   }, [id, toast])

//   const getStatusColor = (status) => {
//     switch (status) {
//       case "Completed":
//         return "bg-green-500/10 text-green-500 hover:bg-green-500/20"
//       case "In Progress":
//         return "bg-blue-500/10 text-blue-500 hover:bg-blue-500/20"
//       case "Pending":
//         return "bg-amber-500/10 text-amber-500 hover:bg-amber-500/20"
//       default:
//         return "bg-gray-500/10 text-gray-500 hover:bg-gray-500/20"
//     }
//   }

//   const getPriorityColor = (priority) => {
//     switch (priority) {
//       case "High":
//         return "bg-red-500/10 text-red-500 hover:bg-red-500/20"
//       case "Medium":
//         return "bg-amber-500/10 text-amber-500 hover:bg-amber-500/20"
//       case "Low":
//         return "bg-green-500/10 text-green-500 hover:bg-green-500/20"
//       default:
//         return "bg-gray-500/10 text-gray-500 hover:bg-gray-500/20"
//     }
//   }

//   const getDaysRemaining = (dueDate) => {
//     const today = new Date()
//     const due = new Date(dueDate)
//     const diffTime = due - today
//     const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
//     return diffDays
//   }

//   const getDueDateStatus = (dueDate) => {
//     const daysRemaining = getDaysRemaining(dueDate)

//     if (daysRemaining < 0) {
//       return { text: "Overdue", color: "text-red-500" }
//     } else if (daysRemaining === 0) {
//       return { text: "Due today", color: "text-amber-500" }
//     } else if (daysRemaining <= 2) {
//       return { text: `Due in ${daysRemaining} day${daysRemaining === 1 ? "" : "s"}`, color: "text-amber-500" }
//     } else {
//       return { text: `Due in ${daysRemaining} days`, color: "text-green-500" }
//     }
//   }

//   const getDocumentDetails = (documentLink, fileType) => {
//     if (!documentLink) return [{ url: null, fileName: null, fileType: null, isImage: false }]

//     // Handle concatenated URLs or multiple document links
//     const links = documentLink.split(/\s+/).filter(link => link && link.match(/^https?:\/\//))
//     const documents = []

//     const fileTypeMap = {
//       "application/pdf": "PDF Document",
//       "application/msword": "Word Document",
//       "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "Word Document",
//       "image/png": "PNG Image",
//       "image/jpeg": "JPEG Image",
//       "text/plain": "Text Document",
//       "text/html": "HTML Document",
//     }

//     // Handle Document: <url> (<filename>) format from older version
//     const docMatch = documentLink.match(/^Document: (.+?) \((.+)\)$/)
//     if (docMatch) {
//       const url = docMatch[1]
//       const fileName = docMatch[2] || url.split("/").pop() || "Document"
//       const mimeType = fileType || ""
//       const displayFileType = fileTypeMap[mimeType] || "Document"
//       const isPDF = mimeType === "application/pdf"
//       const isImage = mimeType.startsWith("image/") || false
//       const displayUrl = isPDF ? `${url}?_a=BAE6pY0` : url
//       return [{ url: displayUrl, fileName, fileType: displayFileType, isImage }]
//     }

//     // Handle single or multiple raw URLs
//     for (const link of links) {
//       const fileName = link.split("/").pop() || "Document"
//       const url = link
//       const mimeType = fileType || ""
//       const displayFileType = fileTypeMap[mimeType] || "Document"
//       const isPDF = mimeType === "application/pdf"
//       const isImage = mimeType.startsWith("image/") || false
//       const displayUrl = isPDF ? `${url}?_a=BAE6pY0` : url
//       documents.push({ url: displayUrl, fileName, fileType: displayFileType, isImage })
//     }

//     return documents.length > 0 ? documents : [{ url: null, fileName: null, fileType: null, isImage: false }]
//   }

//   const handleSubmitTask = async (submissionData) => {
//     try {
//       const token = localStorage.getItem("WorkflowToken")
//       if (!token) {
//         toast({
//           title: "Authentication Error",
//           description: "User token is missing. Please log in again.",
//           variant: "destructive",
//         })
//         return
//       }

//       const config = {
//         headers: {
//           "x-auth-token": token,
//           "Content-Type": "multipart/form-data",
//         },
//       }

//       const storedUser = JSON.parse(localStorage.getItem("WorkflowUser"))
//       if (!storedUser || !storedUser.id) {
//         toast({
//           title: "User Error",
//           description: "User information is missing. Please log in again.",
//           variant: "destructive",
//         })
//         return
//       }

//       submissionData.append("task", id)

//       if (submission) {
//         await axios.put(`${API_URL}/submissions/${submission._id}`, submissionData, config)

//         toast({
//           title: "Success",
//           description: "Your submission has been updated",
//         })
//       } else {
//         const response = await axios.post(`${API_URL}/submissions`, submissionData, config)

//         setSubmission(response.data)

//         toast({
//           title: "Success",
//           description: "Your task has been submitted successfully",
//         })
//       }

//       const submissionResponse = await axios.get(`${API_URL}/submissions/task/${id}`, {
//         headers: { "x-auth-token": token },
//       })
//       setSubmission(submissionResponse.data)

//       setIsSubmissionDialogOpen(false)
//     } catch (error) {
//       console.error("Error submitting task:", error)
//       toast({
//         title: "Error",
//         description: error?.response?.data?.error || "Failed to submit task",
//         variant: "destructive",
//       })
//     }
//   }

//   if (isLoading) {
//     return (
//       <div className="space-y-6 p-4 md:p-6">
//         <div className="flex items-center gap-2">
//           <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
//             <ArrowLeft className="h-5 w-5" />
//           </Button>
//           <Skeleton className="h-8 w-64" />
//         </div>
//         <div className="grid gap-6 md:grid-cols-3">
//           <Skeleton className="h-[300px] md:col-span-2" />
//           <Skeleton className="h-[300px]" />
//         </div>
//         <Skeleton className="h-[200px]" />
//       </div>
//     )
//   }

//   if (!task) {
//     return (
//       <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
//         <AlertTriangle className="h-12 w-12 text-amber-500" />
//         <h2 className="text-2xl font-bold">Task Not Found</h2>
//         <p className="text-muted-foreground">
//           The task you're looking for doesn't exist or you don't have permission to view it.
//         </p>
//         <Button onClick={() => navigate(-1)}>Go Back</Button>
//       </div>
//     )
//   }

//   const dueDateStatus = getDueDateStatus(task.dueDate)
//   const storedUser = JSON.parse(localStorage.getItem("WorkflowUser"))
//   const isAssignedToCurrentUser = storedUser?.id === task.assignee?._id
//   const documents = getDocumentDetails(task.notes, task.fileType)

//   return (
//     <div className="space-y-6 p-4 md:p-6">
//       <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
//         <div className="flex items-center gap-2">
//           <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="h-9 w-9">
//             <ArrowLeft className="h-5 w-5" />
//           </Button>
//           <h1 className="text-2xl font-bold tracking-tight">{task.title}</h1>
//         </div>
//         <div className="flex items-center gap-2">
//           <Badge className={getStatusColor(task.status)}>{task.status}</Badge>
//           <Badge className={getPriorityColor(task.priority)}>{task.priority}</Badge>
//           {task.department && (
//             <Badge variant="outline" className="border-[1px] border-muted-foreground/20">
//               {task.department.name}
//             </Badge>
//           )}
//         </div>
//       </div>

//       <div className="grid gap-6 md:grid-cols-3">
//         <Card className="md:col-span-2">
//           <CardHeader>
//             <CardTitle>Task Details</CardTitle>
//             <CardDescription>Complete information about this task</CardDescription>
//           </CardHeader>
//           <CardContent className="space-y-6">
//             <Tabs defaultValue="description">
//               <TabsList className="grid w-full grid-cols-3">
//                 <TabsTrigger value="description">Description</TabsTrigger>
//                 <TabsTrigger value="dependencies">Dependencies</TabsTrigger>
//                 <TabsTrigger value="submission">Submission</TabsTrigger>
//               </TabsList>
//               <TabsContent value="description" className="space-y-4 pt-4">
//                 <div className="prose max-w-none dark:prose-invert">
//                   <p className="whitespace-pre-line">{task.description}</p>
//                 </div>
//                 {documents[0].url && (
//                   <div className="space-y-2">
//                     {documents.map((doc, index) => (
//                       <div key={index} className="flex items-center gap-2 text-sm">
//                         <FileText className="h-4 w-4 text-muted-foreground" />
//                         <a
//                           href={doc.url}
//                           target={doc.isImage ? "_self" : "_blank"}
//                           rel="noopener noreferrer"
//                           className="text-blue-500 hover:underline"
//                         >
//                           {doc.fileName} ({doc.fileType})
//                         </a>
//                       </div>
//                     ))}
//                   </div>
//                 )}
//               </TabsContent>
//               <TabsContent value="dependencies" className="pt-4">
//                 {task.dependencies && task.dependencies.length > 0 ? (
//                   <div className="space-y-4">
//                     <h3 className="text-sm font-medium">This task depends on:</h3>
//                     {task.dependencies.map((dependency) => (
//                       <Card key={dependency._id} className="overflow-hidden">
//                         <CardHeader className="p-4">
//                           <CardTitle className="text-base">{dependency.title}</CardTitle>
//                         </CardHeader>
//                         <CardContent className="p-4 pt-0">
//                           <div className="flex items-center justify-between">
//                             <Badge className={getStatusColor(dependency.status)}>{dependency.status}</Badge>
//                             <Button variant="ghost" size="sm" onClick={() => navigate(`/tasks/${dependency._id}`)}>
//                               View Task
//                             </Button>
//                           </div>
//                         </CardContent>
//                       </Card>
//                     ))}
//                   </div>
//                 ) : (
//                   <div className="flex flex-col items-center justify-center py-8 text-center">
//                     <Layers className="h-12 w-12 text-muted-foreground/60 mb-2" />
//                     <p className="text-muted-foreground">This task has no dependencies</p>
//                   </div>
//                 )}
//               </TabsContent>
//               <TabsContent value="submission" className="pt-4">
//                 {submission ? (
//                   <div className="space-y-4">
//                     <div className="flex items-center justify-between">
//                       <h3 className="text-sm font-medium">Submission Details</h3>
//                       {isAssignedToCurrentUser && (
//                         <Button variant="outline" size="sm" onClick={() => setIsSubmissionDialogOpen(true)}>
//                           Edit Submission
//                         </Button>
//                       )}
//                     </div>
//                     <Card>
//                       <CardContent className="p-4 space-y-4">
//                         {submission.githubLink && (
//                           <div className="flex items-center gap-2 text-sm">
//                             <Github className="h-4 w-4" />
//                             <a
//                               href={submission.githubLink}
//                               target="_blank"
//                               rel="noopener noreferrer"
//                               className="text-blue-500 hover:underline flex items-center gap-1"
//                             >
//                               {submission.githubLink}
//                               <ExternalLink className="h-3 w-3" />
//                             </a>
//                           </div>
//                         )}
//                         {submission.additionalLinks && (
//                           <div className="flex items-center gap-2 text-sm">
//                             <Link2 className="h-4 w-4" />
//                             <a
//                               href={submission.additionalLinks}
//                               target="_blank"
//                               rel="noopener noreferrer"
//                               className="text-blue-500 hover:underline flex items-center gap-1"
//                             >
//                               {submission.additionalLinks}
//                               <ExternalLink className="h-3 w-3" />
//                             </a>
//                           </div>
//                         )}
//                         {submission.documentLink && (
//                           <div className="flex items-center gap-2 text-sm">
//                             <FileText className="h-4 w-4" />
//                             <a
//                               href={getDocumentDetails(submission.documentLink, submission.fileType)[0].url}
//                               target={getDocumentDetails(submission.documentLink, submission.fileType)[0].isImage ? "_self" : "_blank"}
//                               rel="noopener noreferrer"
//                               className="text-blue-500 hover:underline flex items-center gap-1"
//                             >
//                               {getDocumentDetails(submission.documentLink, submission.fileType)[0].fileName} ({getDocumentDetails(submission.documentLink, submission.fileType)[0].fileType})
//                               <ExternalLink className="h-3 w-3" />
//                             </a>
//                           </div>
//                         )}
//                         {submission.notes && (
//                           <div className="pt-2">
//                             <h4 className="text-sm font-medium mb-1">Notes:</h4>
//                             <p className="text-sm text-muted-foreground whitespace-pre-line">{submission.notes}</p>
//                           </div>
//                         )}
//                         <div className="flex items-center justify-between text-xs text-muted-foreground pt-2">
//                           <span>Submitted on {new Date(submission.createdAt).toLocaleDateString()}</span>
//                           {submission.updatedAt !== submission.createdAt && (
//                             <span>Updated on {new Date(submission.updatedAt).toLocaleDateString()}</span>
//                           )}
//                         </div>
//                       </CardContent>
//                     </Card>
//                     {submission.feedback && (
//                       <Card>
//                         <CardContent className="p-4">
//                           <h4 className="text-sm font-medium mb-2">Review Feedback</h4>
//                           <p className="text-sm text-muted-foreground whitespace-pre-line">{submission.feedback}</p>
//                           <div className="mt-2">
//                             <Badge className={submission.status === "Approved" ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500"}>
//                               {submission.status}
//                             </Badge>
//                           </div>
//                         </CardContent>
//                       </Card>
//                     )}
//                   </div>
//                 ) : (
//                   <div className="flex flex-col items-center justify-center py-8 text-center">
//                     <FileCode className="h-12 w-12 text-muted-foreground/60 mb-2" />
//                     <p className="text-muted-foreground mb-4">No submission yet</p>
//                     {isAssignedToCurrentUser && (
//                       <Button onClick={() => setIsSubmissionDialogOpen(true)}>Submit Task</Button>
//                     )}
//                   </div>
//                 )}
//               </TabsContent>
//             </Tabs>
//           </CardContent>
//           <CardFooter className="flex justify-between border-t px-6 py-4">
//             <div className="flex items-center gap-2">
//               <Clock className="h-4 w-4 text-muted-foreground" />
//               <span className="text-sm text-muted-foreground">
//                 Created on {new Date(task.createdAt).toLocaleDateString()}
//               </span>
//             </div>
//             {isAssignedToCurrentUser && !submission && (
//               <Button onClick={() => setIsSubmissionDialogOpen(true)}>Submit Task</Button>
//             )}
//           </CardFooter>
//         </Card>

//         <div className="space-y-6">
//           <Card>
//             <CardHeader>
//               <CardTitle>Task Progress</CardTitle>
//             </CardHeader>
//             <CardContent className="space-y-4">
//               <div>
//                 <div className="flex items-center justify-between mb-2">
//                   <span className="text-sm font-medium">{task.progress}%</span>
//                   <span className={`text-sm ${dueDateStatus.color}`}>{dueDateStatus.text}</span>
//                 </div>
//                 <Progress value={task.progress} className="h-2" />
//               </div>
//               <div className="space-y-2 text-sm">
//                 <div className="flex items-center gap-2">
//                   <Calendar className="h-4 w-4 text-muted-foreground" />
//                   <span>
//                     Due: {new Date(task.dueDate).toLocaleDateString()}
//                   </span>
//                 </div>
//                 <div className="flex items-center gap-2">
//                   <Users className="h-4 w-4 text-muted-foreground" />
//                   <span>
//                     Assignee: {task.assignee?.name || "Unassigned"}
//                   </span>
//                 </div>
//               </div>
//             </CardContent>
//           </Card>

//           <Card>
//             <CardHeader>
//               <CardTitle>Task Metadata</CardTitle>
//             </CardHeader>
//             <CardContent className="space-y-4">
//               <div className="flex items-center gap-2">
//                 <BarChart3 className="h-4 w-4 text-muted-foreground" />
//                 <span className="text-sm">
//                   Priority: {task.priority}
//                 </span>
//               </div>
//               <div className="flex items-center gap-2">
//                 <Layers className="h-4 w-4 text-muted-foreground" />
//                 <span className="text-sm">
//                   Department: {task.department?.name || "None"}
//                 </span>
//               </div>
//               <div className="flex items-center gap-2">
//                 <Clock className="h-4 w-4 text-muted-foreground" />
//                 <span className="text-sm">
//                   Updated: {new Date(task.updatedAt).toLocaleDateString()}
//                 </span>
//               </div>
//             </CardContent>
//           </Card>

//           {task.assignee && (
//             <Card>
//               <CardHeader>
//                 <CardTitle>Assignee</CardTitle>
//               </CardHeader>
//               <CardContent>
//                 <div className="flex items-center gap-3">
//                   <Avatar>
//                     <AvatarImage src={task.assignee.avatar || "/placeholder.svg"} />
//                     <AvatarFallback>
//                       {task.assignee.name
//                         .split(" ")
//                         .map((n) => n[0])
//                         .join("")}
//                     </AvatarFallback>
//                   </Avatar>
//                   <div>
//                     <p className="font-medium">{task.assignee.name}</p>
//                     <p className="text-sm text-muted-foreground">{task.assignee.email}</p>
//                   </div>
//                 </div>
//               </CardContent>
//             </Card>
//           )}
//         </div>
//       </div>

//       <TaskSubmissionDialog
//         open={isSubmissionDialogOpen}
//         onOpenChange={setIsSubmissionDialogOpen}
//         onSubmit={handleSubmitTask}
//         existingSubmission={submission}
//       />
//     </div>
//   )
// }

// export default TaskDetails




"use client"

import { useState, useEffect } from "react"
import { useParams, useNavigate } from "react-router-dom"
import axios from "axios"
import { useToast } from "../hooks/use-toast"
import { useAuth } from "../context/auth-context"
import {
  Calendar,
  Clock,
  AlertTriangle,
  CheckCircle,
  ArrowLeft,
  FileText,
  Github,
  Link2,
  ExternalLink,
  Users,
  BarChart3,
  FileCode,
  Layers,
  RefreshCw,
  Lock,
  ShieldCheck,
  ShieldAlert,
  PlayCircle,
  MessageSquare,
  Check,
  XCircle,
} from "lucide-react"
import { Button } from "../components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "../components/ui/card"
import { Badge } from "../components/ui/badge"
import { Progress } from "../components/ui/progress"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs"
import { Avatar, AvatarFallback, AvatarImage } from "../components/ui/avatar"
import { TaskSubmissionDialog } from "../components/tasks/task-submission-dialog"
import { Skeleton } from "../components/ui/skeleton"
import { Textarea } from "../components/ui/textarea"
import { API_URL } from "@/lib/api"
import { formatDate } from "@/lib/dateFormat"

function TaskDetails() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { toast } = useToast()
  const { user } = useAuth()
  const [task, setTask] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmissionDialogOpen, setIsSubmissionDialogOpen] = useState(false)
  const [submission, setSubmission] = useState(null)
  const [authNotes, setAuthNotes] = useState("")
  const [isAuthorizing, setIsAuthorizing] = useState(false)

  const handleAuthorize = async (action) => {
    try {
      setIsAuthorizing(true)
      const token = localStorage.getItem("WorkflowToken")
      const response = await axios.post(
        `${API_URL}/tasks/${id}/authorize`,
        { action, notes: authNotes },
        { headers: { "x-auth-token": token } }
      )
      toast({
        title: action === "APPROVE" ? "Task Authorized" : "Task Returned",
        description: response.data.message || (action === "APPROVE" ? "Task authorized for execution" : "Task returned to candidate"),
      })
      const taskResponse = await axios.get(`${API_URL}/tasks/${id}`, {
        headers: { "x-auth-token": token },
      })
      setTask(taskResponse.data)
      setAuthNotes("")
    } catch (error) {
      console.error("Authorization error:", error)
      toast({
        title: "Action Failed",
        description: error.response?.data?.error || "Failed to update authorization status",
        variant: "destructive",
      })
    } finally {
      setIsAuthorizing(false)
    }
  }

  const handleStartExecution = async () => {
    try {
      setIsAuthorizing(true)
      const token = localStorage.getItem("WorkflowToken")
      await axios.put(
        `${API_URL}/tasks/${id}`,
        { status: "In Progress" },
        { headers: { "x-auth-token": token } }
      )
      toast({
        title: "Execution Started",
        description: "Task is now In Progress. Execution Gate unlocked.",
      })
      const taskResponse = await axios.get(`${API_URL}/tasks/${id}`, {
        headers: { "x-auth-token": token },
      })
      setTask(taskResponse.data)
    } catch (error) {
      console.error("Error starting execution:", error)
      toast({
        title: "Execution Gate Locked",
        description: error.response?.data?.message || error.response?.data?.error || "Failed to start execution",
        variant: "destructive",
      })
    } finally {
      setIsAuthorizing(false)
    }
  }

  useEffect(() => {
    const fetchTaskDetails = async () => {
      try {
        setIsLoading(true)
        const token = localStorage.getItem("WorkflowToken")
        const taskResponse = await axios.get(`${API_URL}/tasks/${id}`, {
          headers: { "x-auth-token": token },
        })
        setTask(taskResponse.data)

        try {
          const submissionResponse = await axios.get(`${API_URL}/submissions/task/${id}`, {
            headers: { "x-auth-token": token },
          })
          if (submissionResponse.data) {
            setSubmission(submissionResponse.data)
          }
        } catch (error) {
          console.log("No submission found for this task")
        }
      } catch (error) {
        console.error("Error fetching task details:", error)
        toast({
          title: "Error",
          description: "Failed to load task details",
          variant: "destructive",
        })
      } finally {
        setIsLoading(false)
      }
    }

    if (id) {
      fetchTaskDetails()
    }
  }, [id, toast])

  const getStatusColor = (status) => {
    switch (status) {
      case "Pending Validation":
        return "bg-amber-500/10 text-amber-500 border border-amber-500/20"
      case "Approved":
        return "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20"
      case "Returned":
        return "bg-rose-500/10 text-rose-400 border border-rose-500/20"
      case "In Progress":
        return "bg-blue-500/10 text-blue-500 hover:bg-blue-500/20"
      case "Submitted for Review":
        return "bg-purple-500/10 text-purple-400 border border-purple-500/20"
      case "Closed":
      case "Completed":
        return "bg-green-500/10 text-green-500 hover:bg-green-500/20"
      case "Pending":
        return "bg-amber-500/10 text-amber-500 hover:bg-amber-500/20"
      default:
        return "bg-gray-500/10 text-gray-500 hover:bg-gray-500/20"
    }
  }

  const getPriorityColor = (priority) => {
    switch (priority) {
      case "High":
        return "bg-red-500/10 text-red-500 hover:bg-red-500/20"
      case "Medium":
        return "bg-amber-500/10 text-amber-500 hover:bg-amber-500/20"
      case "Low":
        return "bg-green-500/10 text-green-500 hover:bg-green-500/20"
      default:
        return "bg-gray-500/10 text-gray-500 hover:bg-gray-500/20"
    }
  }

  const getDaysRemaining = (dueDate) => {
    const today = new Date()
    const due = new Date(dueDate)
    const diffTime = due - today
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    return diffDays
  }

  const getDueDateStatus = (dueDate) => {
    const daysRemaining = getDaysRemaining(dueDate)

    if (daysRemaining < 0) {
      return { text: "Overdue", color: "text-red-500" }
    } else if (daysRemaining === 0) {
      return { text: "Due today", color: "text-amber-500" }
    } else if (daysRemaining <= 2) {
      return { text: `Due in ${daysRemaining} day${daysRemaining === 1 ? "" : "s"}`, color: "text-amber-500" }
    } else {
      return { text: `Due in ${daysRemaining} days`, color: "text-green-500" }
    }
  }

  const getDocumentDetails = (documentLink, fileType) => {
    if (!documentLink) return [{ url: null, fileName: null, fileType: null, isImage: false }]

    const fileTypeMap = {
      "application/pdf": "PDF Document",
      "application/msword": "Word Document",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "Word Document",
      "image/png": "PNG Image",
      "image/jpeg": "JPEG Image",
      "text/plain": "Text Document",
      "text/html": "HTML Document",
    }

    const rawLinks = documentLink.split(/\s+/).filter(link => link && (link.match(/^https?:\/\//) || link.startsWith("/uploads") || link.startsWith("uploads") || link.startsWith("/api")))
    if (rawLinks.length === 0) {
      return [{ url: null, fileName: null, fileType: null, isImage: false }]
    }

    const documents = []
    for (const rawLink of rawLinks) {
      if (!rawLink || rawLink.trim() === "") continue;
      const isRelative = rawLink.startsWith("/") || rawLink.startsWith("uploads")
      const fullUrl = isRelative 
        ? `${API_URL.replace(/\/api$/, '')}${rawLink.startsWith('/') ? '' : '/'}${rawLink}`
        : rawLink

      let fileName = rawLink.split("?")[0].split("/").pop() || "Task Brief Document.pdf"
      if (!fileName.includes(".") || fileName.length > 50) {
        fileName = "task_brief_specification.pdf"
      }
      const mimeType = fileType || (rawLink.endsWith(".pdf") ? "application/pdf" : "")
      const displayFileType = fileTypeMap[mimeType] || (rawLink.endsWith(".pdf") ? "PDF Document" : "Document")
      const isImage = mimeType.startsWith("image/") || false
      documents.push({ url: fullUrl, fileName, fileType: displayFileType, isImage })
    }

    return documents.length > 0 ? documents : [{ url: null, fileName: null, fileType: null, isImage: false }]
  }

  const handleSubmitTask = async (submissionData) => {
    try {
      const token = localStorage.getItem("WorkflowToken")
      if (!token) {
        toast({
          title: "Authentication Error",
          description: "User token is missing. Please log in again.",
          variant: "destructive",
        })
        return
      }

      const config = {
        headers: {
          "x-auth-token": token,
          "Content-Type": "multipart/form-data",
        },
      }

      const storedUser = JSON.parse(localStorage.getItem("WorkflowUser"))
      if (!storedUser || !storedUser.id) {
        toast({
          title: "User Error",
          description: "User information is missing. Please log in again.",
          variant: "destructive",
        })
        return
      }

      submissionData.append("task", id)

      if (submission) {
        await axios.put(`${API_URL}/submissions/${submission._id}`, submissionData, config)

        toast({
          title: "Success",
          description: "Your submission has been updated and resubmitted to admin for review",
        })
      } else {
        const response = await axios.post(`${API_URL}/submissions`, submissionData, config)

        setSubmission(response.data)

        toast({
          title: "Success",
          description: "Your task has been submitted successfully",
        })
      }

      const submissionResponse = await axios.get(`${API_URL}/submissions/task/${id}`, {
        headers: { "x-auth-token": token },
      })
      setSubmission(submissionResponse.data)

      setIsSubmissionDialogOpen(false)
    } catch (error) {
      console.error("Error submitting task:", error)
      toast({
        title: "Error",
        description: error?.response?.data?.error || "Failed to submit task",
        variant: "destructive",
      })
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6 p-4 md:p-6">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <Skeleton className="h-8 w-64" />
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          <Skeleton className="h-[300px] md:col-span-2" />
          <Skeleton className="h-[300px]" />
        </div>
        <Skeleton className="h-[200px]" />
      </div>
    )
  }

  if (!task) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
        <AlertTriangle className="h-12 w-12 text-amber-500" />
        <h2 className="text-2xl font-bold">Task Not Found</h2>
        <p className="text-muted-foreground">
          The task you're looking for doesn't exist or you don't have permission to view it.
        </p>
        <Button onClick={() => navigate(-1)}>Go Back</Button>
      </div>
    )
  }

  const dueDateStatus = getDueDateStatus(task.dueDate)
  const storedUser = JSON.parse(localStorage.getItem("WorkflowUser"))
  const isAssignedToCurrentUser = (storedUser?.id === task.assignee?._id) || (storedUser?._id === task.assignee?._id)
  const isLeadOrAdmin = storedUser && (
    storedUser.role === "Admin" ||
    storedUser.role === "Manager" ||
    storedUser.role === "Lead" ||
    storedUser.role === "Governor" ||
    storedUser.isAdmin
  )
  const documents = getDocumentDetails(task.notes, task.fileType)
  const displayTitle = task.title || "Task Details";

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="h-9 w-9">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-bold tracking-tight">{displayTitle}</h1>
        </div>
        <div className="flex items-center gap-2">
          {task.task_id && (
            <Badge variant="outline" className="font-mono text-xs border-emerald-500/30 text-emerald-400 bg-emerald-500/5">
              {task.task_id}
            </Badge>
          )}
          <Badge className={getStatusColor(task.status)}>{task.status}</Badge>
          <Badge className={getPriorityColor(task.priority)}>{task.priority}</Badge>
          {task.department && (
            <Badge variant="outline" className="border-[1px] border-muted-foreground/20">
              {task.department.name}
            </Badge>
          )}
        </div>
      </div>

      {/* BHIV Execution Gate Banner */}
      {task.status === "Pending Validation" && (
        <Card className="border-2 border-amber-500/40 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent">
          <CardContent className="p-5 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-400">
                  <Lock className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-amber-300">
                    Execution Gate Locked: Awaiting Lead Authorisation
                  </h3>
                  <p className="text-xs text-amber-200/80">
                    {task.sourceType || "WhatsApp"} task submitted by {task.originatingPerson || "Candidate"}. Work cannot begin until authorized.
                  </p>
                </div>
              </div>
              <Badge variant="outline" className="border-amber-400/50 text-amber-300 bg-amber-500/10 text-xs self-start sm:self-auto">
                Pending Validation Gate
              </Badge>
            </div>

            {isLeadOrAdmin ? (
              <div className="pt-3 border-t border-amber-500/20 space-y-3">
                <div className="text-xs font-medium text-amber-200">
                  Authorised Project Lead Action: Review scope and approve or return for revision.
                </div>
                <Textarea
                  placeholder="Optional approval notes or reason for returning..."
                  value={authNotes}
                  onChange={(e) => setAuthNotes(e.target.value)}
                  className="bg-slate-900/80 border-amber-500/30 text-xs text-slate-100 placeholder:text-slate-500"
                  rows={2}
                />
                <div className="flex items-center gap-3">
                  <Button
                    size="sm"
                    disabled={isAuthorizing}
                    onClick={() => handleAuthorize("APPROVE")}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs gap-1.5 shadow-md shadow-emerald-950/40"
                  >
                    <ShieldCheck className="h-4 w-4" />
                    Authorize Task Execution
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={isAuthorizing}
                    onClick={() => handleAuthorize("RETURN")}
                    className="border-rose-500/40 text-rose-400 hover:bg-rose-500/10 text-xs gap-1.5"
                  >
                    <XCircle className="h-4 w-4" />
                    Return for Clarification
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-xs text-amber-300/70 italic">
                You are assigned to this task. Please wait for an authorized Project Lead or Manager to review and approve your submission before starting work.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {task.status === "Approved" && (
        <Card className="border-2 border-cyan-500/30 bg-gradient-to-r from-cyan-500/10 via-cyan-500/5 to-transparent">
          <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-cyan-500/20 text-cyan-400">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <h4 className="font-semibold text-sm text-cyan-300">
                  Execution Gate Passed: Task Authorized by Lead
                </h4>
                <p className="text-xs text-cyan-200/70">
                  {task.authorizedAt ? `Approved on ${formatDate(task.authorizedAt)}.` : ""} Ready to transition to In Progress.
                </p>
              </div>
            </div>
            {isAssignedToCurrentUser && (
              <Button
                size="sm"
                disabled={isAuthorizing}
                onClick={handleStartExecution}
                className="bg-cyan-600 hover:bg-cyan-500 text-white font-medium text-xs gap-1.5 shadow-md self-start sm:self-auto"
              >
                <PlayCircle className="h-4 w-4" />
                Start Execution (Move to In Progress)
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {task.status === "Returned" && (
        <Card className="border-2 border-rose-500/30 bg-rose-950/20">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-rose-400 shrink-0 mt-0.5" />
            <div className="text-xs text-rose-200">
              <span className="font-semibold text-rose-300">Task Returned for Clarification: </span>
              {task.returnedFeedback || "Please contact your lead or revise the task details."}
            </div>
          </CardContent>
        </Card>
      )}

      {task.status === "Closed" && (
        <Card className="border-2 border-emerald-500/30 bg-emerald-950/20">
          <CardContent className="p-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 text-xs text-emerald-200">
              <CheckCircle className="h-5 w-5 text-emerald-400 shrink-0" />
              <span>
                <strong>Parikshak Review Passed:</strong> Task deliverables verified and task closed in Niyantran.
              </span>
            </div>
            <Badge className="bg-emerald-600 text-white text-xs">
              Closed & Verified
            </Badge>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Task Details</CardTitle>
            <CardDescription>Complete information about this task</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <Tabs defaultValue={task.originalInstruction ? "provenance" : "description"}>
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="description">Description</TabsTrigger>
                <TabsTrigger value="provenance">Provenance & Gate</TabsTrigger>
                <TabsTrigger value="dependencies">Dependencies</TabsTrigger>
                <TabsTrigger value="submission">Submission</TabsTrigger>
              </TabsList>
              <TabsContent value="description" className="space-y-4 pt-4">
                {/* Parikshak PDF Download Banner if URL is detected */}
                {(() => {
                  const desc = task.description || "";
                  const match = desc.match(/\[.*?\]\((http[s]?:\/\/[^\)]+task-pdf[^\)]*)\)/) ||
                                desc.match(/(http[s]?:\/\/[^\s\)]+task-pdf[^\s\)]*)/) ||
                                desc.match(/\[.*?\]\((http[s]?:\/\/[^\)]+\/pdf)\)/) ||
                                desc.match(/(http[s]?:\/\/[^\s\)]+\/pdf)/);
                  const pdfUrl = match ? match[1] : null;

                  if (!pdfUrl) return null;
                  return (
                    <div className="p-4 bg-gradient-to-r from-blue-500/10 via-indigo-500/10 to-blue-500/10 border border-blue-500/30 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-md backdrop-blur-sm">
                      <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-blue-600 rounded-lg text-white shadow">
                          <FileText className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="font-bold text-gray-900 dark:text-white text-sm">Official Parikshak Task PDF Briefing</p>
                          <p className="text-xs text-muted-foreground">Download full task specification, deliverables, and acceptance criteria.</p>
                        </div>
                      </div>
                      <a
                        href={pdfUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs px-4 py-2.5 rounded-lg shadow transition-all hover:scale-105 active:scale-95"
                      >
                        <FileText className="h-4 w-4" /> Download Task PDF
                      </a>
                    </div>
                  );
                })()}

                <div className="prose max-w-none dark:prose-invert">
                  <div className="whitespace-pre-line text-sm leading-relaxed text-gray-800 dark:text-gray-200">
                    {(() => {
                      const rawDesc = task.description || "";
                      const desc = (() => {
                        let lines = rawDesc.split("\n");
                        while (lines.length > 0) {
                          const line = lines[0].trim();
                          const isMetaHeader = /^(?:Task\s*Title|Title|Department|Dept|Assignee(?:\s*Candidate)?|Assign\s*to|Owner|Candidate|Priority|Target\s*Date|Due\s*Date?|Deadline|Overview\s*&\s*Description)\s*[:\n\-]?$/i.test(line) ||
                                               /^(?:Task\s*Title|Title|Department|Dept|Assignee(?:\s*Candidate)?|Assign\s*to|Owner|Candidate|Priority|Target\s*Date|Due\s*Date?|Deadline)\s*:/i.test(line);
                          if (isMetaHeader || line.length === 0) {
                            lines.shift();
                          } else {
                            break;
                          }
                        }
                        let cleanedDesc = lines.join("\n").trim() || rawDesc;
                        return cleanedDesc;
                      })();
                      const parts = [];
                      const linkRegex = /\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g;
                      let lastIdx = 0;
                      let match;

                      while ((match = linkRegex.exec(desc)) !== null) {
                        if (match.index > lastIdx) {
                          parts.push(desc.substring(lastIdx, match.index));
                        }
                        const label = match[1];
                        const url = match[2];
                        parts.push(
                          <a
                            key={match.index}
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 font-bold underline hover:text-blue-800 transition-colors my-1 px-1 py-0.5 bg-blue-50 dark:bg-blue-950/50 rounded"
                          >
                            📄 {label}
                          </a>
                        );
                        lastIdx = match.index + match[0].length;
                      }
                      if (lastIdx < desc.length) {
                        parts.push(desc.substring(lastIdx));
                      }
                      return parts.length > 0 ? parts : desc;
                    })()}
                  </div>
                </div>
                {/* Task Specification & PDF Document Brief */}
                {(documents[0]?.url || task.notes) && (
                  <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
                    <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                      <FileText className="h-4 w-4 text-indigo-500" />
                      Task Specification & Documents
                    </h3>
                    <div className="grid gap-2">
                      {/* Primary PDF Task Brief Card */}
                      <div className="flex items-center justify-between p-3 bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-800/60 rounded-xl">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="p-2 bg-indigo-600 rounded-lg text-white shrink-0">
                            <FileText className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-gray-900 dark:text-gray-100 truncate">
                              {documents[0]?.fileName || `task_brief_${task._id}.pdf`}
                            </p>
                            <p className="text-[10px] text-gray-500 dark:text-gray-400">Official PDF Brief Specification</p>
                          </div>
                        </div>
                        <a
                          href={documents[0]?.url || `${API_URL}/tasks/${task._id}/pdf`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg flex items-center gap-1 shrink-0 transition-colors shadow-xs"
                        >
                          <ExternalLink className="h-3 w-3" />
                          <span>View PDF Brief</span>
                        </a>
                      </div>

                      {/* Additional Distinct Attachments */}
                      {documents.slice(1).filter(d => d.url && d.url !== documents[0]?.url).map((doc, index) => (
                        <div key={index} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="p-2 bg-slate-700 rounded-lg text-white shrink-0">
                              <FileText className="h-4 w-4" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-gray-900 dark:text-gray-100 truncate">{doc.fileName}</p>
                              <p className="text-[10px] text-gray-500 dark:text-gray-400">{doc.fileType}</p>
                            </div>
                          </div>
                          <a
                            href={doc.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-3 py-1.5 bg-slate-700 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg flex items-center gap-1 shrink-0 transition-colors shadow-xs"
                          >
                            <ExternalLink className="h-3 w-3" />
                            <span>View Attachment</span>
                          </a>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Display Links */}
                {task.links && task.links.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-sm font-medium">Links:</h3>
                    {task.links.map((link, index) => (
                      <div key={index} className="flex items-center gap-2 text-sm">
                        <Link2 className="h-4 w-4 text-muted-foreground" />
                        <a
                          href={link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-500 hover:underline"
                        >
                          {link}
                        </a>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
              <TabsContent value="provenance" className="space-y-4 pt-4">
                <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
                        <MessageSquare className="h-4 w-4" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-white">Immutable Provenance & Intake Record</h3>
                        <p className="text-xs text-slate-400">Preserved source instruction, originator, and authorization trail</p>
                      </div>
                    </div>
                    {task.task_id && (
                      <Badge variant="outline" className="font-mono text-xs border-emerald-500/30 text-emerald-400 bg-emerald-500/5">
                        {task.task_id}
                      </Badge>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div className="p-3 rounded-lg bg-slate-950/80 border border-slate-800">
                      <span className="text-slate-500 block mb-0.5">Task Origin</span>
                      <span className="font-semibold text-slate-200">{task.sourceType || "WhatsApp / Direct"}</span>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-950/80 border border-slate-800">
                      <span className="text-slate-500 block mb-0.5">Originating Person</span>
                      <span className="font-semibold text-slate-200">{task.originatingPerson || "Project Lead"}</span>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-950/80 border border-slate-800">
                      <span className="text-slate-500 block mb-0.5">Source Reference</span>
                      <span className="font-semibold text-slate-200">{task.sourceReference || "Direct Directive"}</span>
                    </div>
                  </div>

                  {task.originalInstruction && (
                    <div>
                      <span className="text-xs font-semibold text-slate-300 block mb-1.5">
                        Raw Original Instruction (Verbatim Preserved):
                      </span>
                      <pre className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono text-emerald-300 whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto">
                        {task.originalInstruction}
                      </pre>
                    </div>
                  )}

                  {task.scope && (
                    <div>
                      <span className="text-xs font-semibold text-slate-300 block mb-1">Defined Scope of Work:</span>
                      <p className="text-xs text-slate-300 p-3 rounded-lg bg-slate-950/80 border border-slate-800 leading-relaxed whitespace-pre-wrap">
                        {task.scope}
                      </p>
                    </div>
                  )}

                  {task.acceptanceCriteria && (
                    <div>
                      <span className="text-xs font-semibold text-slate-300 block mb-1">Acceptance Criteria & Parikshak Verification:</span>
                      <p className="text-xs text-slate-300 p-3 rounded-lg bg-slate-950/80 border border-slate-800 leading-relaxed whitespace-pre-wrap">
                        {task.acceptanceCriteria}
                      </p>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 text-xs">
                    {task.authorizedAt && (
                      <div className="p-3 rounded-lg bg-cyan-950/30 border border-cyan-500/20 text-cyan-200">
                        <span className="font-semibold block mb-0.5">Authorisation Audit:</span>
                        Approved on {formatDate(task.authorizedAt)}
                        {task.authorizationNotes && <p className="mt-1 text-slate-300 italic">"{task.authorizationNotes}"</p>}
                      </div>
                    )}
                    {task.executionStartedAt && (
                      <div className="p-3 rounded-lg bg-blue-950/30 border border-blue-500/20 text-blue-200">
                        <span className="font-semibold block mb-0.5">Execution Started:</span>
                        {formatDate(task.executionStartedAt)}
                      </div>
                    )}
                  </div>
                </div>
              </TabsContent>
              <TabsContent value="dependencies" className="pt-4">
                {task.dependencies && task.dependencies.length > 0 ? (
                  <div className="space-y-4">
                    <h3 className="text-sm font-medium">This task depends on:</h3>
                    {task.dependencies.map((dependency) => (
                      <Card key={dependency._id} className="overflow-hidden">
                        <CardHeader className="p-4">
                          <CardTitle className="text-base">{dependency.title}</CardTitle>
                        </CardHeader>
                        <CardContent className="p-4 pt-0">
                          <div className="flex items-center justify-between">
                            <Badge className={getStatusColor(dependency.status)}>{dependency.status}</Badge>
                            <Button variant="ghost" size="sm" onClick={() => navigate(`/tasks/${dependency._id}`)}>
                              View Task
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <Layers className="h-12 w-12 text-muted-foreground/60 mb-2" />
                    <p className="text-muted-foreground">This task has no dependencies</p>
                  </div>
                )}
              </TabsContent>
              <TabsContent value="submission" className="pt-4">
                {submission ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-medium">Submission Details</h3>
                      {isAssignedToCurrentUser && (
                        <Button variant="outline" size="sm" onClick={() => setIsSubmissionDialogOpen(true)}>
                          Edit Submission
                        </Button>
                      )}
                    </div>
                    <Card>
                      <CardContent className="p-4 space-y-4">
                        {submission.githubLink && (
                          <div className="flex items-center gap-2 text-sm">
                            <Github className="h-4 w-4" />
                            <a
                              href={submission.githubLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-500 hover:underline flex items-center gap-1"
                            >
                              {submission.githubLink}
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          </div>
                        )}
                        {submission.additionalLinks && (
                          <div className="flex items-center gap-2 text-sm">
                            <Link2 className="h-4 w-4" />
                            <a
                              href={submission.additionalLinks}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-500 hover:underline flex items-center gap-1"
                            >
                              {submission.additionalLinks}
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          </div>
                        )}
                        {submission.documentLink && (
                          <div className="flex items-center gap-2 text-sm">
                            <FileText className="h-4 w-4" />
                            <a
                              href={getDocumentDetails(submission.documentLink, submission.fileType)[0].url}
                              target={getDocumentDetails(submission.documentLink, submission.fileType)[0].isImage ? "_self" : "_blank"}
                              rel="noopener noreferrer"
                              className="text-blue-500 hover:underline flex items-center gap-1"
                            >
                              {getDocumentDetails(submission.documentLink, submission.fileType)[0].fileName} ({getDocumentDetails(submission.documentLink, submission.fileType)[0].fileType})
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          </div>
                        )}
                        {submission.notes && (
                          <div className="pt-2">
                            <h4 className="text-sm font-medium mb-1">Notes:</h4>
                            <p className="text-sm text-muted-foreground whitespace-pre-line">{submission.notes}</p>
                          </div>
                        )}
                        <div className="flex items-center justify-between text-xs text-muted-foreground pt-2">
                          <span>Submitted on {formatDate(submission.createdAt)}</span>
                          {submission.resubmittedAt && (
                            <Badge className="bg-blue-500/10 text-blue-500 text-xs">
                              <RefreshCw className="h-3 w-3 mr-1" />
                              Resubmitted {formatDate(submission.resubmittedAt)}
                            </Badge>
                          )}
                        </div>
                        {/* Update Task Button */}
                        {isAssignedToCurrentUser && (
                          <div className="pt-4 border-t mt-4">
                            <Button 
                              onClick={() => setIsSubmissionDialogOpen(true)}
                              variant="outline"
                              className="w-full"
                            >
                              <RefreshCw className="h-4 w-4 mr-2" />
                              Update & Resubmit Task
                            </Button>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                    {submission.feedback && (
                      <Card>
                        <CardContent className="p-4">
                          <h4 className="text-sm font-medium mb-2">Review Feedback</h4>
                          <p className="text-sm text-muted-foreground whitespace-pre-line">{submission.feedback}</p>
                          <div className="mt-2">
                            <Badge className={submission.status === "Approved" ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500"}>
                              {submission.status}
                            </Badge>
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <FileCode className="h-12 w-12 text-muted-foreground/60 mb-2" />
                    <p className="text-muted-foreground mb-4">No submission yet</p>
                    {isAssignedToCurrentUser && (
                      <Button onClick={() => setIsSubmissionDialogOpen(true)}>Submit Task</Button>
                    )}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
          <CardFooter className="flex justify-between border-t px-6 py-4">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                Created on {formatDate(task.createdAt)}
              </span>
            </div>
            {isAssignedToCurrentUser && !submission && (
              <Button onClick={() => setIsSubmissionDialogOpen(true)}>Submit Task</Button>
            )}
          </CardFooter>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Task Progress</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">{task.progress}%</span>
                  <span className={`text-sm ${dueDateStatus.color}`}>{dueDateStatus.text}</span>
                </div>
                <Progress value={task.progress} className="h-2" />
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span>
                    Due: {formatDate(task.dueDate)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <span>
                    Assignee: {task.assignee?.name || "Unassigned"}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Task Metadata</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">
                  Priority: {task.priority}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">
                  Department: {task.department?.name || "None"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">
                  Updated: {formatDate(task.updatedAt)}
                </span>
              </div>
            </CardContent>
          </Card>

          {task.assignee && (
            <Card>
              <CardHeader>
                <CardTitle>Assignee</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3">
                  <Avatar>
                    <AvatarImage src={task.assignee.avatar || "/placeholder.svg"} />
                    <AvatarFallback>
                      {task.assignee.name
                        .split(" ")
                        .map((n) => n[0])
                        .join("")}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium">{task.assignee.name}</p>
                    <p className="text-sm text-muted-foreground">{task.assignee.email}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <TaskSubmissionDialog
        open={isSubmissionDialogOpen}
        onOpenChange={setIsSubmissionDialogOpen}
        onSubmit={handleSubmitTask}
        existingSubmission={submission}
      />
    </div>
  )
}

export default TaskDetails

