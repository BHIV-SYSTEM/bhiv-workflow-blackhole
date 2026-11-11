"use client"

import { useState, useEffect, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table"
import { Badge } from "../ui/badge"
import { Button } from "../ui/button"
import { Input } from "../ui/input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu"
import { MoreHorizontal, Eye, Edit, Trash, Loader2, Search, X } from 'lucide-react'
import { TaskDetailsDialog } from "./task-details-dialog"
import { useToast } from "../../hooks/use-toast"
import { api } from "../../lib/api"
import { formatDate } from "../../lib/dateFormat"
import { formatEmployeeId } from "../../lib/employeeId"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../ui/dialog"
import { Label } from "../ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select"
import { Textarea } from "../ui/textarea"
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

function EditTaskDialog({ task, open, onOpenChange }) {
  // const { toast } = useToast()
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    status: "Pending",
    priority: "Medium",
    dueDate: "",
  })
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Update formData when task prop changes
  useEffect(() => {
    if (task) {
      setFormData({
        title: task.title || "",
        description: task.description || "",
        status: task.status || "Pending",
        priority: task.priority || "Medium",
        dueDate: task.dueDate ? new Date(task.dueDate).toISOString().split("T")[0] : "",
      })
    }
  }, [task])

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleSelectChange = (name, value) => {
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setIsSubmitting(true);
      await api.tasks.updateTask(task._id, {
        ...formData,
        dueDate: formData.dueDate ? new Date(formData.dueDate).toISOString() : null,
      });
      toast.success("Task updated successfully");
      onOpenChange(false);
    } catch (error) {
      console.error("Error updating task:", error);
      toast.error(error.message || "Failed to update task");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[525px] bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-800 shadow-2xl rounded-2xl p-6">
        <DialogHeader className="space-y-1">
          <DialogTitle className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Edit className="h-5 w-5 text-blue-500" />
            Edit Task
          </DialogTitle>
          <DialogDescription className="text-sm text-slate-500 dark:text-slate-400">
            Update task details, status, priority, and due date.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-3">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title" className="text-sm font-semibold text-slate-900 dark:text-slate-100">Title</Label>
              <Input
                id="title"
                name="title"
                value={formData.title}
                onChange={handleChange}
                required
                className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500 rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description" className="text-sm font-semibold text-slate-900 dark:text-slate-100">Description</Label>
              <Textarea
                id="description"
                name="description"
                value={formData.description}
                onChange={handleChange}
                className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500 min-h-[90px] rounded-xl"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="status" className="text-sm font-semibold text-slate-900 dark:text-slate-100">Status</Label>
                <Select
                  value={formData.status}
                  onValueChange={(value) => handleSelectChange("status", value)}
                >
                  <SelectTrigger className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl shadow-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="z-[70] bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-800 rounded-xl">
                    <SelectItem value="Pending">Pending</SelectItem>
                    <SelectItem value="In Progress">In Progress</SelectItem>
                    <SelectItem value="Completed">Completed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="priority" className="text-sm font-semibold text-slate-900 dark:text-slate-100">Priority</Label>
                <Select
                  value={formData.priority}
                  onValueChange={(value) => handleSelectChange("priority", value)}
                >
                  <SelectTrigger className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl shadow-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="z-[70] bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-800 rounded-xl">
                    <SelectItem value="Low">Low</SelectItem>
                    <SelectItem value="Medium">Medium</SelectItem>
                    <SelectItem value="High">High</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="dueDate" className="text-sm font-semibold text-slate-900 dark:text-slate-100">Due Date</Label>
              <Input
                id="dueDate"
                name="dueDate"
                type="date"
                value={formData.dueDate}
                onChange={handleChange}
                className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500 rounded-xl"
              />
            </div>
          </div>
          <DialogFooter className="pt-4 gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="rounded-xl border border-slate-200 dark:border-slate-700 font-semibold">
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting} className="bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-semibold">
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function TasksList({ filters, newTask }) {
  const { toast } = useToast()
  const [tasks, setTasks] = useState([])
  const [total, setTotal] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedTask, setSelectedTask] = useState(null)
  const [isDetailsOpen, setIsDetailsOpen] = useState(false)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const LIMIT = 100

  const fetchTasks = async (page = 1) => {
    try {
      setIsLoading(true)
      const params = { page, limit: LIMIT }
      if (filters.status?.length === 1) params.status = filters.status[0]
      if (filters.department?.length === 1) params.department = filters.department[0]
      if (filters.priority && filters.priority !== 'all') params.priority = filters.priority
      const data = await api.tasks.getTasks(params)
      setTasks(data.tasks ?? [])
      setTotal(data.total ?? 0)
      setTotalPages(data.pages ?? 1)
      setCurrentPage(page)
      setError(null)
    } catch (err) {
      setError(err.message || "Failed to load tasks")
      toast({ title: "Error", description: err.message || "Failed to load tasks", variant: "destructive" })
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { fetchTasks(1) }, [])

  // Reset to page 1 when filters change
  useEffect(() => { fetchTasks(1) }, [filters.status, filters.department, filters.priority])

  // Prepend newly created task without refetching
  useEffect(() => {
    if (newTask) {
      setTasks(prev => prev.some(t => t._id === newTask._id) ? prev : [newTask, ...prev])
      setTotal(prev => prev + 1)
    }
  }, [newTask])

  // Handle socket events for real-time updates
  useEffect(() => {
    const handleTaskUpdated = (e) => {
      const updated = e.detail
      setTasks(prev => prev.map(t => t._id === updated._id ? updated : t))
    }
    const handleTaskDeleted = (e) => {
      const deleted = e.detail
      setTasks(prev => prev.filter(t => t._id !== (deleted._id ?? deleted)))
      setTotal(prev => Math.max(0, prev - 1))
    }
    window.addEventListener('task-updated', handleTaskUpdated)
    window.addEventListener('task-deleted', handleTaskDeleted)
    return () => {
      window.removeEventListener('task-updated', handleTaskUpdated)
      window.removeEventListener('task-deleted', handleTaskDeleted)
    }
  }, [])

  // Client-side search only (filters are server-side via refetch)
  const filteredTasks = useMemo(() => {
    if (!searchQuery.trim()) return tasks
    const query = searchQuery.toLowerCase().trim()
    return tasks.filter(t =>
      t.title?.toLowerCase().includes(query) ||
      t.assignee?.name?.toLowerCase().includes(query) ||
      t.department?.name?.toLowerCase().includes(query) ||
      t.description?.toLowerCase().includes(query)
    )
  }, [tasks, searchQuery])

  const getStatusColor = (status) => {
    switch (status) {
      case "Completed":
        return "bg-green-500/10 text-green-500 hover:bg-green-500/20"
      case "In Progress":
        return "bg-blue-500/10 text-blue-500 hover:bg-blue-500/20"
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

  const handleViewTask = (task) => {
    setSelectedTask(task)
    setIsDetailsOpen(true)
  }

  const handleEditTask = (task) => {
    setSelectedTask(task)
    setIsEditOpen(true)
  }

  const handleDeleteTask = async (taskId) => {
    if (confirm("Are you sure you want to delete this task?")) {
      try {
        setIsDeleting(true);
        await api.tasks.deleteTask(taskId);
        setTasks(prev => prev.filter(t => t._id !== taskId));
        setTotal(prev => Math.max(0, prev - 1))
        toast.success("Task deleted successfully");
      } catch (error) {
        console.error("Error deleting task:", error);
        toast.error(error.message || "Failed to delete task");
      } finally {
        setIsDeleting(false);
      }
    }
  }

  const clearSearch = () => {
    setSearchQuery("")
  }

  // Group filtered tasks by department
  const groupedTasks = filteredTasks.reduce((acc, task) => {
    const deptName = task.department?.name || "Unknown"
    if (!acc[deptName]) {
      acc[deptName] = []
    }
    acc[deptName].push(task)
    return acc
  }, {})

  if (isLoading) {
    return (
      <Card className="border-2 rounded-xl shadow-lg">
        <CardHeader className="border-b bg-muted/30">
          <CardTitle className="text-lg font-semibold">Tasks by Department</CardTitle>
          <CardDescription>View tasks grouped by department</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col justify-center items-center p-12 space-y-4">
            <Loader2 className="h-12 w-12 animate-spin text-green-500" />
            <p className="text-muted-foreground font-medium">Loading tasks...</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card className="border-2 rounded-xl shadow-lg border-red-200">
        <CardHeader className="border-b bg-red-50">
          <CardTitle className="text-lg font-semibold text-red-600">Tasks by Department</CardTitle>
          <CardDescription>View tasks grouped by department</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="p-8 text-center">
            <p className="text-red-600 font-semibold text-lg mb-4">Error loading tasks: {error}</p>
            <Button
              variant="outline"
              className="border-2 border-red-500 text-red-500 hover:bg-red-50 rounded-xl"
              onClick={() => window.location.reload()}
            >
              Try Again
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Search Bar */}
      <Card className="border-2 rounded-xl shadow-lg">
        <CardHeader className="border-b bg-muted/30">
          <CardTitle className="text-lg font-semibold">Search Tasks</CardTitle>
          <CardDescription>Search by task name, assignee, department, or description</CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
            <Input
              placeholder="Search tasks by name, user, department, or description..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-11 pr-10 h-11 rounded-xl border-2 focus-visible:ring-green-500"
            />
            {searchQuery && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearSearch}
                className="absolute right-1 top-1/2 transform -translate-y-1/2 h-8 w-8 p-0 hover:bg-red-100 rounded-lg"
              >
                <X className="h-4 w-4 text-red-500" />
              </Button>
            )}
          </div>
          {searchQuery && (
            <div className="mt-3 text-sm font-medium text-green-600 bg-green-50 p-2 rounded-lg">
              Found {filteredTasks.length} task{filteredTasks.length !== 1 ? 's' : ''} matching "{searchQuery}"
            </div>
          )}
        </CardContent>
      </Card>

      {/* Task count summary */}
      <div className="flex items-center justify-between px-1">
        <p className="text-sm font-medium text-muted-foreground">
          Showing <span className="font-bold text-foreground">
            {(currentPage - 1) * LIMIT + 1}–{Math.min(currentPage * LIMIT, total)}
          </span> of <span className="font-bold text-foreground">{total}</span> tasks
          {searchQuery.trim() && (
            <span className="ml-1 text-amber-600">({filteredTasks.length} matching search)</span>
          )}
        </p>
        <p className="text-sm text-muted-foreground">Page {currentPage} of {totalPages}</p>
      </div>

      {/* Tasks List grouped by department */}
      {Object.keys(groupedTasks).length === 0 ? (
        <Card className="border-2 rounded-xl shadow-lg">
          <CardContent className="text-center py-12 text-muted-foreground">
            {searchQuery ? (
              <div>
                <p className="text-lg font-medium mb-3">No tasks found matching your search.</p>
                <Button variant="outline" onClick={clearSearch} className="border-2 rounded-xl hover:border-green-500">Clear search</Button>
              </div>
            ) : (
              <p className="text-lg font-medium">No tasks found.</p>
            )}
          </CardContent>
        </Card>
      ) : (
        Object.entries(groupedTasks).map(([deptName, deptTasks]) => (
          <Card key={deptName} className="border-2 rounded-xl shadow-lg hover:shadow-xl transition-shadow">
            <CardHeader className="border-b bg-gradient-to-r from-muted/30 to-muted/10">
              <CardTitle className="flex items-center gap-2">
                <span className="text-lg font-semibold">{deptName}</span>
                <Badge className="bg-green-500 text-white hover:bg-green-600 font-semibold">{deptTasks.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-b-2 bg-muted/20 hover:bg-muted/20">
                      <TableHead className="font-semibold text-foreground">Title</TableHead>
                      <TableHead className="font-semibold text-foreground">Assignee</TableHead>
                      <TableHead className="font-semibold text-foreground">Status</TableHead>
                      <TableHead className="font-semibold text-foreground">Priority</TableHead>
                      <TableHead className="font-semibold text-foreground">Due Date</TableHead>
                      <TableHead className="text-right font-semibold text-foreground">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {deptTasks.map((task, index) => (
                      <TableRow
                        key={task._id}
                        className={`hover:bg-muted/50 transition-colors ${index % 2 === 0 ? 'bg-background' : 'bg-muted/10'}`}
                      >
                        <TableCell className="py-4">
                          <div>
                            <div className="font-semibold text-foreground">{task.title}</div>
                            {task.description && (
                              <div className="text-sm text-muted-foreground truncate max-w-xs mt-1">{task.description}</div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="py-4 font-medium">
                          {task.assignee ? (
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span>{task.assignee.name}</span>
                              <Badge variant="outline" className="font-mono text-[10px] text-primary border-primary/20 bg-primary/5 font-bold">
                                {task.assignee.employeeId || formatEmployeeId(task.assignee.email)}
                              </Badge>
                            </div>
                          ) : (
                            <span className="text-muted-foreground italic">Unassigned</span>
                          )}
                        </TableCell>
                        <TableCell className="py-4"><Badge className={`${getStatusColor(task.status)} font-semibold`}>{task.status}</Badge></TableCell>
                        <TableCell className="py-4"><Badge className={`${getPriorityColor(task.priority)} font-semibold`}>{task.priority}</Badge></TableCell>
                        <TableCell className="py-4 font-medium">
                          {task.dueDate ? formatDate(task.dueDate) : <span className="text-muted-foreground italic">No date</span>}
                        </TableCell>
                        <TableCell className="text-right py-4">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" className="h-8 w-8 p-0 rounded-lg hover:bg-muted/80 transition-colors">
                                <span className="sr-only">Open menu</span>
                                <MoreHorizontal className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48 p-1.5 rounded-xl border border-gray-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md shadow-xl z-50">
                              <DropdownMenuLabel className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">Actions</DropdownMenuLabel>
                              <DropdownMenuItem onClick={() => handleViewTask(task)} className="cursor-pointer rounded-lg px-2.5 py-2 text-sm font-medium text-gray-700 dark:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-800/80 focus:bg-gray-100 dark:focus:bg-slate-800/80 transition-colors flex items-center">
                                <Eye className="mr-2.5 h-4 w-4 text-emerald-500 dark:text-emerald-400" />View details
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleEditTask(task)} className="cursor-pointer rounded-lg px-2.5 py-2 text-sm font-medium text-gray-700 dark:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-800/80 focus:bg-gray-100 dark:focus:bg-slate-800/80 transition-colors flex items-center">
                                <Edit className="mr-2.5 h-4 w-4 text-blue-500 dark:text-blue-400" />Edit task
                              </DropdownMenuItem>
                              <DropdownMenuSeparator className="my-1 bg-gray-200 dark:bg-slate-800" />
                              <DropdownMenuItem
                                className="cursor-pointer rounded-lg px-2.5 py-2 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 focus:bg-red-50 dark:focus:bg-red-950/40 transition-colors flex items-center"
                                onClick={() => handleDeleteTask(task._id)}
                                disabled={isDeleting}
                              >
                                <Trash className="mr-2.5 h-4 w-4 text-red-500 dark:text-red-400" />Delete task
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        ))
      )}

      {/* Pagination controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchTasks(1)}
            disabled={currentPage === 1 || isLoading}
            className="rounded-lg border-2"
          >
            «
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchTasks(currentPage - 1)}
            disabled={currentPage === 1 || isLoading}
            className="rounded-lg border-2"
          >
            ‹ Prev
          </Button>

          {/* Page number buttons — show up to 5 around current page */}
          {Array.from({ length: totalPages }, (_, i) => i + 1)
            .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 2)
            .reduce((acc, p, idx, arr) => {
              if (idx > 0 && p - arr[idx - 1] > 1) acc.push('...')
              acc.push(p)
              return acc
            }, [])
            .map((p, idx) =>
              p === '...' ? (
                <span key={`ellipsis-${idx}`} className="px-1 text-muted-foreground">…</span>
              ) : (
                <Button
                  key={p}
                  variant={p === currentPage ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => fetchTasks(p)}
                  disabled={isLoading}
                  className={`rounded-lg border-2 min-w-[36px] ${
                    p === currentPage ? 'bg-green-500 hover:bg-green-600 text-white border-green-500' : ''
                  }`}
                >
                  {p}
                </Button>
              )
            )
          }

          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchTasks(currentPage + 1)}
            disabled={currentPage === totalPages || isLoading}
            className="rounded-lg border-2"
          >
            Next ›
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchTasks(totalPages)}
            disabled={currentPage === totalPages || isLoading}
            className="rounded-lg border-2"
          >
            »
          </Button>
        </div>
      )}
      {selectedTask && (
        <>
          <TaskDetailsDialog
            task={selectedTask}
            open={isDetailsOpen}
            onOpenChange={setIsDetailsOpen}
            onEditTask={() => {
              setIsDetailsOpen(false);
              setIsEditOpen(true);
            }}
          />
          <EditTaskDialog
            task={selectedTask}
            open={isEditOpen}
            onOpenChange={setIsEditOpen}
          />
        </>
      )}
    </div>
  )
}