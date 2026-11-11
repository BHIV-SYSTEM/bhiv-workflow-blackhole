"use client"

import { useState, useEffect, useMemo } from "react"
import axios from "axios"
import { useAuth } from "@/context/auth-context"
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Building2, Users, Plus, Trash2, RefreshCw, Search, Edit, UserPlus, UserCog, KeyRound, Eye, EyeOff, Target, AlertCircle, BarChart3 } from "lucide-react"
import AdminChatbot from "@/components/admin/admin-chatbot"
import LiveAttendanceAdminPanel from "@/components/admin/LiveAttendanceAdminPanel"
import SetAimsPanel from "@/components/admin/SetAimsPanel"
import OverdueTasks from "@/components/admin/OverdueTasks"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { useToast } from "../hooks/use-toast"
import { API_URL } from "@/lib/api"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts"

// Configure axios with base URL
const api = axios.create({
  baseURL: `${API_URL}`,
})

const colorOptions = [
  { value: "bg-blue-500", label: "Blue" },
  { value: "bg-green-500", label: "Green" },
  { value: "bg-red-500", label: "Red" },
  { value: "bg-yellow-500", label: "Yellow" },
  { value: "bg-purple-500", label: "Purple" },
  { value: "bg-cyan-500", label: "Cyan" },
  { value: "bg-indigo-500", label: "Indigo" },
  { value: "bg-teal-500", label: "Teal" },
  { value: "bg-orange-500", label: "Orange" },
  { value: "bg-emerald-500", label: "Emerald" },
]

const roleOptions = [
  { value: "Admin", label: "Admin" },
  { value: "Manager", label: "Manager" },
  { value: "User", label: "User" },
  { value: "Tester", label: "Tester" },
]

const AdminDashboard = () => {
  // NOTE: auth-context does not expose a `token` field — use getToken(),
  // otherwise `token` is undefined, no auth header is ever set, and every
  // request fails with 401 "No token, authorization denied".
  const { user: currentUser, getToken } = useAuth()
  const { toast } = useToast()
  const [users, setUsers] = useState([])
  const [departments, setDepartments] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  // NOTE: this MUST destructure both value and setter — `const [setActiveTab]`
  // captured the state VALUE ("departments" string), which was then passed to
  // Radix <Tabs onValueChange>, crashing the page ("_a.call is not a function").
  const [activeTab, setActiveTab] = useState("departments")
  
  // Check if user is Admin or Manager
  const isAdminOrManager = currentUser && (currentUser.role === "Admin" || currentUser.role === "Manager")
  
  // Debug: Log user role
  useEffect(() => {
    console.log('Current User:', currentUser)
    console.log('Is Admin or Manager:', isAdminOrManager)
  }, [currentUser, isAdminOrManager])

  // Department form state
  const [newDepartment, setNewDepartment] = useState({
    name: "",
    description: "",
    color: "bg-blue-500",
    lead: "",
  })

  // User form state
  const [newUser, setNewUser] = useState({
    name: "",
    email: "",
    password: "",
    role: "User",
    department: "",
  })

  // Edit states
  const [editingDepartment, setEditingDepartment] = useState(null)
  const [editingUser, setEditingUser] = useState(null)
  const [showDepartmentDialog, setShowDepartmentDialog] = useState(false)
  const [showUserDialog, setShowUserDialog] = useState(false)
  const [viewingUser, setViewingUser] = useState(null)
  const [showViewUserDialog, setShowViewUserDialog] = useState(false)
  
  // Password management states
  const [showPasswordDialog, setShowPasswordDialog] = useState(false)
  const [selectedUserForPassword, setSelectedUserForPassword] = useState(null)
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [passwordSearchTerm, setPasswordSearchTerm] = useState("")
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [showOverdueTasksDialog, setShowOverdueTasksDialog] = useState(false)
  const [testedTaskRows, setTestedTaskRows] = useState([])

  // Set auth header for all requests. This effect is declared before the
  // fetch effect below, so the header is in place before the first API call.
  useEffect(() => {
    const authToken = getToken()
    if (authToken) {
      api.defaults.headers.common["Authorization"] = `Bearer ${authToken}`
    }
  }, [getToken])

  useEffect(() => {
    Promise.all([fetchUsers(), fetchDepartments(), fetchTestedTasksFeed()])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fetchTestedTasksFeed = async () => {
    try {
      const response = await api.get("/tester/tested-tasks-feed")
      setTestedTaskRows(Array.isArray(response.data) ? response.data : [])
    } catch (err) {
      console.error("Error fetching tested tasks feed:", err)
      setTestedTaskRows([])
    }
  }

  const fetchUsers = async () => {
    try {
      setIsLoading(true)
      const response = await api.get("/admin/users")
      setUsers(response.data)
    } catch (err) {
      console.error("Error fetching users:", err)
      toast({
        title: "Error",
        description: err.response?.data?.error || "Failed to fetch users",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const fetchDepartments = async () => {
    try {
      setIsLoading(true)
      const response = await api.get("/admin/departments")
      setDepartments(response.data)
    } catch (err) {
      console.error("Error fetching departments:", err)
      toast({
        title: "Error",
        description: err.response?.data?.error || "Failed to fetch departments",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleAddDepartment = async () => {
    if (!newDepartment.name) {
      toast({
        title: "Validation Error",
        description: "Department name is required",
        variant: "destructive",
      })
      return
    }

    try {
      setIsLoading(true)
      await api.post("/admin/departments", newDepartment)

      // Reset form and refresh departments
      setNewDepartment({
        name: "",
        description: "",
        color: "bg-blue-500",
        lead: "",
      })

      toast({
        title: "Success",
        description: "Department added successfully",
      })

      fetchDepartments()
    } catch (err) {
      console.error("Error adding department:", err)
      toast({
        title: "Error",
        description: err.response?.data?.error || "Failed to add department",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleUpdateDepartment = async () => {
    if (!editingDepartment || !editingDepartment.name) {
      toast({
        title: "Validation Error",
        description: "Department name is required",
        variant: "destructive",
      })
      return
    }

    try {
      setIsLoading(true)
      await api.put(`/admin/departments/${editingDepartment._id}`, editingDepartment)

      setShowDepartmentDialog(false)
      setEditingDepartment(null)

      toast({
        title: "Success",
        description: "Department updated successfully",
      })

      fetchDepartments()
    } catch (err) {
      console.error("Error updating department:", err)
      toast({
        title: "Error",
        description: err.response?.data?.error || "Failed to update department",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleDeleteDepartment = async (id) => {
    try {
      setIsLoading(true)
      await api.delete(`/admin/departments/${id}`)

      toast({
        title: "Success",
        description: "Department deleted successfully",
      })
      fetchDepartments()
    } catch (err) {
      console.error("Error deleting department:", err)
      toast({
        title: "Error",
        description: err.response?.data?.error || "Failed to delete department",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleAddUser = async () => {
    if (!newUser.name || !newUser.email || !newUser.password) {
      toast({
        title: "Validation Error",
        description: "Name, email and password are required",
        variant: "destructive",
      })
      return
    }

    try {
      setIsLoading(true)
      await api.post("/admin/users", newUser)

      // Reset form and refresh users
      setNewUser({
        name: "",
        email: "",
        password: "",
        role: "User",
        department: "",
      })

      toast({
        title: "Success",
        description: "User added successfully",
      })

      fetchUsers()
    } catch (err) {
      console.error("Error adding user:", err)
      toast({
        title: "Error",
        description: err.response?.data?.error || "Failed to add user",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleUpdateUser = async () => {
    if (!editingUser || !editingUser.name || !editingUser.email) {
      toast({
        title: "Validation Error",
        description: "Name and email are required",
        variant: "destructive",
      })
      return
    }

    try {
      setIsLoading(true)
      // Create a copy without password if it's empty (don't update password)
      const userToUpdate = { ...editingUser }
      if (!userToUpdate.password) {
        delete userToUpdate.password
      }

      await api.put(`/admin/users/${editingUser._id}`, userToUpdate)

      setShowUserDialog(false)
      setEditingUser(null)

      toast({
        title: "Success",
        description: "User updated successfully",
      })

      fetchUsers()
    } catch (err) {
      console.error("Error updating user:", err)
      toast({
        title: "Error",
        description: err.response?.data?.error || "Failed to update user",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleDeleteUser = async (id) => {
    try {
      setIsLoading(true)
      await api.delete(`/admin/users/${id}`)

      toast({
        title: "Success",
        description: "User deleted successfully",
      })
      fetchUsers()
    } catch (err) {
      console.error("Error deleting user:", err)
      toast({
        title: "Error",
        description: err.response?.data?.error || "Failed to delete user",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleChangePassword = async () => {
    if (!selectedUserForPassword) {
      toast({
        title: "Error",
        description: "No user selected",
        variant: "destructive",
      })
      return
    }

    if (!newPassword || !confirmPassword) {
      toast({
        title: "Validation Error",
        description: "Please enter and confirm the new password",
        variant: "destructive",
      })
      return
    }

    if (newPassword.length < 6) {
      toast({
        title: "Validation Error",
        description: "Password must be at least 6 characters",
        variant: "destructive",
      })
      return
    }

    if (newPassword !== confirmPassword) {
      toast({
        title: "Validation Error",
        description: "Passwords do not match",
        variant: "destructive",
      })
      return
    }

    try {
      setIsLoading(true)
      await api.put(`/admin/users/${selectedUserForPassword._id}`, {
        password: newPassword
      })

      setShowPasswordDialog(false)
      setSelectedUserForPassword(null)
      setNewPassword("")
      setConfirmPassword("")
      setShowNewPassword(false)
      setShowConfirmPassword(false)

      toast({
        title: "Success",
        description: `Password updated successfully for ${selectedUserForPassword.name}`,
      })
    } catch (err) {
      console.error("Error changing password:", err)
      toast({
        title: "Error",
        description: err.response?.data?.error || "Failed to change password",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const filteredDepartments = departments.filter((department) =>
    department.name.toLowerCase().includes(searchTerm.toLowerCase()),
  )

  const filteredUsers = users.filter(
    (user) =>
      user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email.toLowerCase().includes(searchTerm.toLowerCase()),
  )

  const getRoleBadge = (role) => {
    switch (role) {
      case "Admin":
        return (
          <Badge className="bg-purple-100 text-purple-800 hover:bg-purple-200 dark:bg-purple-900 dark:text-purple-300">
            Admin
          </Badge>
        )
      case "Manager":
        return (
          <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-200 dark:bg-blue-900 dark:text-blue-300">
            Manager
          </Badge>
        )
      case "User":
        return (
          <Badge className="bg-green-100 text-green-800 hover:bg-green-200 dark:bg-green-900 dark:text-green-300">
            User
          </Badge>
        )
      default:
        return <Badge>{role}</Badge>
    }
  }

  const getInitials = (name) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .substring(0, 2)
  }

  const getDepartmentById = (id) => {
    return departments.find((dept) => dept._id === id)
  }

  const getUsersInDepartment = (departmentId) => {
    return users.filter((user) => user.department === departmentId)
  }

  const getDepartmentLead = (leadId) => {
    return users.find((user) => user._id === leadId)
  }

  const testingStageChartData = useMemo(() => {
    const stageCounts = testedTaskRows.reduce((acc, row) => {
      const stage = row?.stage || "Unknown"
      acc[stage] = (acc[stage] || 0) + 1
      return acc
    }, {})

    const orderedStages = ["Waiting Tester", "Tester Approved", "Unknown"]
    const knownRows = orderedStages
      .filter((stage) => stageCounts[stage])
      .map((stage) => ({ stage, count: stageCounts[stage] }))

    const otherRows = Object.entries(stageCounts)
      .filter(([stage]) => !orderedStages.includes(stage))
      .map(([stage, count]) => ({ stage, count }))

    return [...knownRows, ...otherRows]
  }, [testedTaskRows])

  const stageBarColors = {
    "Waiting Tester": "#f59e0b",
    "Tester Approved": "#22c55e",
    Unknown: "#6b7280",
  }

  return (
    <>
      {/* Admin Chatbot */}
      <AdminChatbot />
      
      <div className="space-y-6">
        {/* Premium Page Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-heading font-bold tracking-tight text-foreground">Admin Dashboard</h1>
          <p className="text-muted-foreground mt-1">Manage departments and users</p>
        </div>
        <div className="flex gap-3 flex-wrap items-center">
          {/* Button 1 */}
          <Button
            variant="outline"
            onClick={() => {
              fetchUsers()
              fetchDepartments()
              fetchTestedTasksFeed()
            }}
            className="border-border hover:bg-primary/5 hover:text-primary transition-all duration-300"
          >
            <RefreshCw className="mr-2 h-4 w-4" /> Refresh Data
          </Button>
          
          {/* Button 5 - Overdue Tasks (Red Button) - Visible for Admin/Manager */}
          <Button
            onClick={() => {
              console.log('Overdue Tasks button clicked')
              setShowOverdueTasksDialog(true)
            }}
            className="bg-red-500 hover:bg-red-600 text-white shadow-lg hover:shadow-xl transition-all duration-300"
            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <AlertCircle className="h-4 w-4" /> 
            <span>Overdue Tasks</span>
          </Button>
        </div>
      </div>

      {/* Premium Overview Card */}
      <Card className="mb-8 border-l-4 border-transparent hover:border-primary bg-gradient-to-br from-card to-card/50 shadow-xl hover:shadow-2xl hover:-translate-y-1 transition-all duration-300">
        <CardHeader className="pb-4">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <CardTitle className="text-2xl font-heading font-bold tracking-tight">Dashboard Overview</CardTitle>
              <CardDescription className="text-muted-foreground mt-1">Key metrics at a glance</CardDescription>
            </div>
            <div className="relative w-full md:w-64">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 w-full"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="pb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Premium KPI Card 1 - Departments */}
            <Card className="group relative overflow-hidden border-l-4 border-l-transparent hover:border-l-primary bg-gradient-to-br from-primary/5 via-card to-card shadow-xl hover:shadow-glow-primary transition-all duration-300 cursor-pointer hover:scale-105">
              {/* Animated background gradient */}
              <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
              
              <CardContent className="pt-6 relative z-10">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex-1">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Total Departments</p>
                    <p className="text-4xl font-heading font-extrabold bg-gradient-to-br from-primary to-primary/70 bg-clip-text text-transparent">
                      {departments.length}
                    </p>
                    <div className="mt-2 flex items-center gap-1 text-xs text-success">
                      <span className="inline-flex items-center">
                        <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                        </svg>
                        Active
                      </span>
                    </div>
                  </div>
                  <div className="w-14 h-14 rounded-2xl gradient-primary flex items-center justify-center shadow-lg shadow-glow-primary group-hover:scale-110 group-hover:rotate-12 transition-all duration-300">
                    <Building2 className="h-7 w-7 text-primary-foreground" />
                  </div>
                </div>
                
                {/* Progress indicator */}
                <div className="w-full h-1 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-primary to-primary/50 rounded-full animate-pulse-slow" style={{width: '70%'}}></div>
                </div>
              </CardContent>
            </Card>

            {/* Premium KPI Card 2 - Users */}
            <Card className="group relative overflow-hidden border-l-4 border-l-transparent hover:border-l-secondary bg-gradient-to-br from-secondary/5 via-card to-card shadow-xl hover:shadow-glow-secondary transition-all duration-300 cursor-pointer hover:scale-105">
              {/* Animated background gradient */}
              <div className="absolute inset-0 bg-gradient-to-br from-secondary/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
              
              <CardContent className="pt-6 relative z-10">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex-1">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Total Users</p>
                    <p className="text-4xl font-heading font-extrabold bg-gradient-to-br from-secondary to-secondary/70 bg-clip-text text-transparent">
                      {users.length}
                    </p>
                    <div className="mt-2 flex items-center gap-1 text-xs text-info">
                      <span className="inline-flex items-center">
                        <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                        </svg>
                        Registered
                      </span>
                    </div>
                  </div>
                  <div className="w-14 h-14 rounded-2xl gradient-secondary flex items-center justify-center shadow-lg shadow-glow-secondary group-hover:scale-110 group-hover:rotate-12 transition-all duration-300">
                    <Users className="h-7 w-7 text-secondary-foreground" />
                  </div>
                </div>
                
                {/* Progress indicator */}
                <div className="w-full h-1 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-secondary to-secondary/50 rounded-full animate-pulse-slow" style={{width: '85%'}}></div>
                </div>
              </CardContent>
            </Card>

            {/* Premium KPI Card 3 - Managers */}
            <Card className="group relative overflow-hidden border-l-4 border-l-transparent hover:border-l-accent bg-gradient-to-br from-accent/5 via-card to-card shadow-xl hover:shadow-glow-accent transition-all duration-300 cursor-pointer hover:scale-105">
              {/* Animated background gradient */}
              <div className="absolute inset-0 bg-gradient-to-br from-accent/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
              
              <CardContent className="pt-6 relative z-10">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex-1">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Managers</p>
                    <p className="text-4xl font-heading font-extrabold bg-gradient-to-br from-accent to-accent/70 bg-clip-text text-transparent">
                      {users.filter((user) => user.role === "Manager").length}
                    </p>
                    <div className="mt-2 flex items-center gap-1 text-xs text-warning">
                      <span className="inline-flex items-center">
                        <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                        </svg>
                        Leading
                      </span>
                    </div>
                  </div>
                  <div className="w-14 h-14 rounded-2xl gradient-accent flex items-center justify-center shadow-lg shadow-glow-accent group-hover:scale-110 group-hover:rotate-12 transition-all duration-300">
                    <UserCog className="h-7 w-7 text-accent-foreground" />
                  </div>
                </div>
                
                {/* Progress indicator */}
                <div className="w-full h-1 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-accent to-accent/50 rounded-full animate-pulse-slow" style={{width: '60%'}}></div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="mt-6 border border-border/60 bg-card/80 shadow-md">
            <CardHeader>
              <CardTitle className="text-lg font-semibold flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-primary" />
                Testing Pipeline
              </CardTitle>
              <CardDescription>
                Stage-wise distribution of tasks in testing workflow
              </CardDescription>
            </CardHeader>
            <CardContent>
              {testingStageChartData.length > 0 ? (
                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={testingStageChartData} margin={{ top: 10, right: 24, left: 8, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="stage" tick={{ fontSize: 12 }} interval={0} angle={-10} dy={8} />
                      <YAxis allowDecimals={false} />
                      <Tooltip
                        formatter={(value) => [value, "Tasks"]}
                        contentStyle={{
                          backgroundColor: "hsl(var(--background))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "8px",
                        }}
                      />
                      <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                        {testingStageChartData.map((entry) => (
                          <Cell key={entry.stage} fill={stageBarColors[entry.stage] || "#3b82f6"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground py-10 text-center">
                  No testing tasks available yet.
                </div>
              )}
            </CardContent>
          </Card>
        </CardContent>
      </Card>

      {/* Premium Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className={`w-full mx-auto ${isAdminOrManager ? 'max-w-6xl grid-cols-5' : 'max-w-md grid-cols-2'} grid bg-muted/50 p-1 rounded-lg`}>
          <TabsTrigger value="departments" className="text-sm font-medium rounded-md data-[state=active]:gradient-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-lg transition-all duration-300">
            <Building2 className="mr-2 h-4 w-4" /> Departments
          </TabsTrigger>
          <TabsTrigger value="users" className="text-sm font-medium rounded-md data-[state=active]:gradient-secondary data-[state=active]:text-secondary-foreground data-[state=active]:shadow-lg transition-all duration-300">
            <Users className="mr-2 h-4 w-4" /> Users
          </TabsTrigger>
          {isAdminOrManager && (
            <>
              <TabsTrigger value="set-aims" className="text-sm font-medium rounded-md data-[state=active]:bg-purple-500 data-[state=active]:text-white data-[state=active]:shadow-lg transition-all duration-300">
                <Target className="mr-2 h-4 w-4" /> Set Aims
              </TabsTrigger>
              <TabsTrigger value="passwords" className="text-sm font-medium rounded-md data-[state=active]:bg-amber-500 data-[state=active]:text-white data-[state=active]:shadow-lg transition-all duration-300">
                <KeyRound className="mr-2 h-4 w-4" /> Passwords
              </TabsTrigger>
              <TabsTrigger value="live-attendance" className="text-sm font-medium rounded-md data-[state=active]:bg-green-500 data-[state=active]:text-white data-[state=active]:shadow-lg transition-all duration-300">
                🔴 Live Attendance
              </TabsTrigger>
            </>
          )}
        </TabsList>

        <TabsContent value="departments" className="mt-6 space-y-6">
          {/* Premium Add Department Card */}
          <Card className="border-l-4 border-transparent hover:border-primary bg-gradient-to-br from-card to-card/50 shadow-xl hover:shadow-2xl hover:-translate-y-1 transition-all duration-300">
            <CardHeader>
              <CardTitle className="text-2xl font-heading font-bold tracking-tight">Add New Department</CardTitle>
              <CardDescription className="text-muted-foreground mt-1">Create a new department in the system</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-foreground">Department Name</Label>
                  <Input
                    type="text"
                    placeholder="Enter department name"
                    value={newDepartment.name}
                    onChange={(e) => setNewDepartment({ ...newDepartment, name: e.target.value })}
                    className="w-full"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-foreground">Color</Label>
                  <Select
                    value={newDepartment.color}
                    onValueChange={(value) => setNewDepartment({ ...newDepartment, color: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a color" />
                    </SelectTrigger>
                    <SelectContent>
                      {colorOptions.map((color) => (
                        <SelectItem key={color.value} value={color.value}>
                          <div className="flex items-center">
                            <div className={`w-4 h-4 rounded-full mr-2 ${color.value}`}></div>
                            {color.label}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label className="text-sm font-semibold text-foreground">Description</Label>
                  <Textarea
                    placeholder="Enter department description"
                    value={newDepartment.description}
                    onChange={(e) => setNewDepartment({ ...newDepartment, description: e.target.value })}
                    className="w-full"
                    rows={3}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-foreground">Department Lead</Label>
                  <Select
                    value={newDepartment.lead}
                    onValueChange={(value) => setNewDepartment({ ...newDepartment, lead: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a lead (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      {users
                        .filter((user) => user.role === "Manager" || user.role === "Admin")
                        .map((user) => (
                          <SelectItem key={user._id} value={user._id}>
                            {user.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
            <CardFooter>
              <Button
                onClick={handleAddDepartment}
                disabled={isLoading || !newDepartment.name}
                className="gradient-primary text-primary-foreground shadow-glow-primary hover:shadow-lg hover:scale-105 transition-all duration-300"
              >
                <Plus className="mr-2 h-4 w-4" /> Add Department
              </Button>
            </CardFooter>
          </Card>

          {/* Premium Manage Departments Section */}
          <div className="mt-8">
            <h3 className="text-2xl font-heading font-bold tracking-tight text-foreground mb-4">Manage Departments</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredDepartments.map((department) => {
                const departmentLead = getDepartmentLead(department.lead)
                const membersCount = getUsersInDepartment(department._id).length

                return (
                  <Card
                    key={department._id}
                    className="border-l-4 border-transparent hover:border-primary bg-gradient-to-br from-card to-card/50 shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all duration-300"
                  >
                        <CardHeader className="pb-2">
                          <div className="flex justify-between items-center">
                            <CardTitle className="text-lg text-slate-800 dark:text-slate-100 flex items-center">
                              <div className={`w-3 h-3 rounded-full mr-2 ${department.color}`}></div>
                              {department.name}
                            </CardTitle>
                          </div>
                          {department.description && (
                            <CardDescription className="mt-2 line-clamp-2">{department.description}</CardDescription>
                          )}
                        </CardHeader>
                        <CardContent className="pb-4">
                          <div className="grid grid-cols-2 gap-4 mb-4">
                            <div className="bg-slate-50 dark:bg-slate-700/50 p-3 rounded-lg">
                              <p className="text-xs text-slate-500 dark:text-slate-400">Lead</p>
                              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 flex items-center">
                                <UserCog className="inline h-4 w-4 mr-1 text-blue-500" />
                                {departmentLead ? departmentLead.name : "Not assigned"}
                              </p>
                            </div>
                            <div className="bg-slate-50 dark:bg-slate-700/50 p-3 rounded-lg">
                              <p className="text-xs text-slate-500 dark:text-slate-400">Members</p>
                              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 flex items-center">
                                <Users className="inline h-4 w-4 mr-1 text-emerald-500" />
                                {membersCount}
                              </p>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setEditingDepartment(department)
                                setShowDepartmentDialog(true)
                              }}
                              className="flex-1 border-blue-200 text-blue-700 hover:bg-blue-50 dark:border-blue-800 dark:text-blue-400 dark:hover:bg-blue-900/30"
                            >
                              <Edit className="mr-1 h-4 w-4" /> Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleDeleteDepartment(department._id)}
                              className="flex-1 border-red-200 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/30"
                            >
                              <Trash2 className="mr-1 h-4 w-4" /> Delete
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="users" className="mt-0">
              <Card className="border-none shadow-lg bg-white dark:bg-slate-800">
                <CardHeader>
                  <CardTitle className="text-xl text-slate-800 dark:text-slate-100">Add New User</CardTitle>
                  <CardDescription>Create a new user in the system</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-slate-500 dark:text-slate-400">Full Name</Label>
                      <Input
                        type="text"
                        placeholder="Enter full name"
                        value={newUser.name}
                        onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                        className="w-full"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-slate-500 dark:text-slate-400">Email</Label>
                      <Input
                        type="email"
                        placeholder="Enter email address"
                        value={newUser.email}
                        onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                        className="w-full"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-slate-500 dark:text-slate-400">Password</Label>
                      <Input
                        type="password"
                        placeholder="Enter password"
                        value={newUser.password}
                        onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                        className="w-full"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-slate-500 dark:text-slate-400">Role</Label>
                      <Select value={newUser.role} onValueChange={(value) => setNewUser({ ...newUser, role: value })}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a role" />
                        </SelectTrigger>
                        <SelectContent>
                          {roleOptions.map((role) => (
                            <SelectItem key={role.value} value={role.value}>
                              {role.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label className="text-sm font-medium text-slate-500 dark:text-slate-400">Department</Label>
                      <Select
                        value={newUser.department}
                        onValueChange={(value) => setNewUser({ ...newUser, department: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select a department (optional)" />
                        </SelectTrigger>
                        <SelectContent>
                          {departments.map((department) => (
                            <SelectItem key={department._id} value={department._id}>
                              <div className="flex items-center">
                                <div className={`w-3 h-3 rounded-full mr-2 ${department.color}`}></div>
                                {department.name}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {/* <Select
  value={newUser.department}
  onValueChange={(value) => setNewUser({ ...newUser, department: value })}
>
  <SelectTrigger>
    <SelectValue placeholder="Select a department (optional)" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="ui-ux">
      <div className="flex items-center">
        <div className="w-3 h-3 rounded-full mr-2 bg-blue-500"></div>
        UI/UX
      </div>
    </SelectItem>
    <SelectItem value="marketing">
      <div className="flex items-center">
        <div className="w-3 h-3 rounded-full mr-2 bg-green-500"></div>
        Marketing
      </div>
    </SelectItem>
    <SelectItem value="sales">
      <div className="flex items-center">
        <div className="w-3 h-3 rounded-full mr-2 bg-yellow-500"></div>
        Sales
      </div>
    </SelectItem>
    <SelectItem value="testing">
      <div className="flex items-center">
        <div className="w-3 h-3 rounded-full mr-2 bg-red-500"></div>
        Testing
      </div>
    </SelectItem>
    <SelectItem value="development">
      <div className="flex items-center">
        <div className="w-3 h-3 rounded-full mr-2 bg-purple-500"></div>
        Development
      </div>
    </SelectItem>
    <SelectItem value="research">
      <div className="flex items-center">
        <div className="w-3 h-3 rounded-full mr-2 bg-teal-500"></div>
        Research
      </div>
    </SelectItem>
  </SelectContent>
</Select> */}

                    </div>
                  </div>
                </CardContent>
                <CardFooter>
                  <Button
                    onClick={handleAddUser}
                    disabled={isLoading || !newUser.name || !newUser.email || !newUser.password}
                    className="bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800"
                  >
                    <UserPlus className="mr-2 h-4 w-4" /> Add User
                  </Button>
                </CardFooter>
              </Card>

              <div className="mt-8">
                <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-4">Manage Users</h3>
                <Card className="border-none shadow-lg bg-white dark:bg-slate-800">
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[50px]">User</TableHead>
                          <TableHead>Name</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead className="w-[100px]">Role</TableHead>
                          <TableHead className="w-[150px]">Department</TableHead>
                          <TableHead className="text-right w-[280px]">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredUsers.map((user) => {
                          const userDepartment = getDepartmentById(user.department)

                          return (
                            <TableRow key={user._id}>
                              <TableCell>
                                <Avatar className="h-8 w-8 bg-slate-100 dark:bg-slate-700">
                                  {user.avatar ? (
                                    <AvatarImage src={user.avatar || "/placeholder.svg"} alt={user.name} />
                                  ) : (
                                    <AvatarFallback className="text-xs">{getInitials(user.name)}</AvatarFallback>
                                  )}
                                </Avatar>
                              </TableCell>
                              <TableCell className="font-medium">{user.name}</TableCell>
                              <TableCell>{user.email}</TableCell>
                              <TableCell>{getRoleBadge(user.role)}</TableCell>
                              <TableCell>
                                {userDepartment ? (
                                  <div className="flex items-center">
                                    <div className={`w-3 h-3 rounded-full mr-2 ${userDepartment.color}`}></div>
                                    {userDepartment.name}
                                  </div>
                                ) : (
                                  <span className="text-slate-400">Not assigned</span>
                                )}
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-2" style={{ pointerEvents: 'auto' }}>
                                  {/* View Details Button */}
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={(e) => {
                                      e.preventDefault()
                                      e.stopPropagation()
                                      console.log('View clicked for user:', user.name)
                                      setViewingUser(user)
                                      setShowViewUserDialog(true)
                                    }}
                                    className="cursor-pointer border-2 border-purple-400 text-purple-700 hover:bg-purple-100 dark:border-purple-600 dark:text-purple-400 dark:hover:bg-purple-900/50 transition-all duration-200 font-semibold"
                                    style={{ pointerEvents: 'auto' }}
                                  >
                                    <Eye className="h-4 w-4 mr-1" />
                                    View
                                  </Button>

                                  {/* Edit Button */}
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={(e) => {
                                      e.preventDefault()
                                      e.stopPropagation()
                                      console.log('Edit clicked for user:', user.name)
                                      setEditingUser(user)
                                      setShowUserDialog(true)
                                    }}
                                    className="cursor-pointer border-2 border-blue-400 text-blue-700 hover:bg-blue-100 dark:border-blue-600 dark:text-blue-400 dark:hover:bg-blue-900/50 transition-all duration-200 font-semibold"
                                    style={{ pointerEvents: 'auto' }}
                                  >
                                    <Edit className="h-4 w-4 mr-1" />
                                    Edit
                                  </Button>
                                  
                                  {/* Delete Button */}
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={(e) => {
                                      e.preventDefault()
                                      e.stopPropagation()
                                      console.log('Delete clicked for user:', user.name)
                                      if (window.confirm(`Are you sure you want to delete ${user.name}?`)) {
                                        handleDeleteUser(user._id)
                                      }
                                    }}
                                    className="cursor-pointer border-2 border-red-400 text-red-700 hover:bg-red-100 dark:border-red-600 dark:text-red-400 dark:hover:bg-red-900/50 transition-all duration-200 font-semibold"
                                    style={{ pointerEvents: 'auto' }}
                                  >
                                    <Trash2 className="h-4 w-4 mr-1" />
                                    Delete
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {isAdminOrManager && (
              <TabsContent value="passwords" className="mt-6">
                <Card className="border-l-4 border-l-amber-500 shadow-xl">
                  <CardHeader className="bg-gradient-to-r from-amber-500/5 to-transparent">
                    <div className="flex justify-between items-center">
                      <div>
                        <CardTitle className="text-2xl font-heading font-bold tracking-tight flex items-center gap-2">
                          <KeyRound className="h-6 w-6 text-amber-500" />
                          Password Management
                        </CardTitle>
                        <CardDescription className="mt-2">Search and change employee passwords (Admin/Manager Only)</CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                <CardContent className="pt-6">
                  {/* Search Bar */}
                  <div className="relative mb-6">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search employees by name or email..."
                      value={passwordSearchTerm}
                      onChange={(e) => setPasswordSearchTerm(e.target.value)}
                      className="pl-9 w-full"
                    />
                  </div>

                  {/* Employee List */}
                  <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2">
                    {users
                      .filter(
                        (user) =>
                          user.name.toLowerCase().includes(passwordSearchTerm.toLowerCase()) ||
                          user.email.toLowerCase().includes(passwordSearchTerm.toLowerCase())
                      )
                      .map((user) => {
                        const userDepartment = getDepartmentById(user.department)
                        return (
                          <Card
                            key={user._id}
                            className="border-l-4 border-l-amber-200 hover:border-l-amber-500 hover:shadow-md transition-all duration-200"
                          >
                            <CardContent className="p-4">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                  <Avatar className="h-12 w-12">
                                    {user.avatar ? (
                                      <AvatarImage src={user.avatar} alt={user.name} />
                                    ) : (
                                      <AvatarFallback className="bg-amber-100 text-amber-700 font-semibold">
                                        {getInitials(user.name)}
                                      </AvatarFallback>
                                    )}
                                  </Avatar>
                                  <div>
                                    <p className="font-semibold text-lg">{user.name}</p>
                                    <p className="text-sm text-muted-foreground">{user.email}</p>
                                    <div className="flex items-center gap-2 mt-1">
                                      {getRoleBadge(user.role)}
                                      {userDepartment && (
                                        <Badge variant="outline" className="text-xs">
                                          <div className={`w-2 h-2 rounded-full mr-1 ${userDepartment.color}`}></div>
                                          {userDepartment.name}
                                        </Badge>
                                      )}
                                    </div>
                                  </div>
                                </div>
                                <Button
                                  onClick={() => {
                                    setSelectedUserForPassword(user)
                                    setShowPasswordDialog(true)
                                  }}
                                  className="bg-amber-500 hover:bg-amber-600 text-white"
                                >
                                  <KeyRound className="mr-2 h-4 w-4" />
                                  Change Password
                                </Button>
                              </div>
                            </CardContent>
                          </Card>
                        )
                      })}
                    
                    {users.filter(
                      (user) =>
                        user.name.toLowerCase().includes(passwordSearchTerm.toLowerCase()) ||
                        user.email.toLowerCase().includes(passwordSearchTerm.toLowerCase())
                    ).length === 0 && (
                      <div className="text-center py-8 text-muted-foreground">
                        <Users className="h-12 w-12 mx-auto mb-2 opacity-50" />
                        <p>No employees found matching "{passwordSearchTerm}"</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
            )}

            {isAdminOrManager && (
              <TabsContent value="set-aims" className="mt-6">
                <SetAimsPanel />
              </TabsContent>
            )}

            {isAdminOrManager && (
              <TabsContent value="live-attendance" className="mt-6">
                <LiveAttendanceAdminPanel />
              </TabsContent>
            )}
          </Tabs>

      {/* Overdue Tasks Dialog */}
      {isAdminOrManager && (
        <OverdueTasks 
          open={showOverdueTasksDialog} 
          onOpenChange={setShowOverdueTasksDialog} 
        />
      )}

      {/* Change Password Dialog with Show/Hide Password (Admin/Manager Only) */}
      {isAdminOrManager && (
      <Dialog open={showPasswordDialog} onOpenChange={setShowPasswordDialog}>
        <DialogContent className="sm:max-w-[500px] border-l-4 border-l-amber-500 bg-gradient-to-br from-amber-50 to-white dark:from-gray-800 dark:to-gray-900">
          <DialogHeader className="pb-4 border-b border-amber-100 dark:border-amber-900">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-lg">
                <KeyRound className="h-6 w-6 text-white" />
              </div>
              <div>
                <DialogTitle className="text-2xl font-bold bg-gradient-to-r from-amber-600 to-amber-800 dark:from-amber-400 dark:to-amber-600 bg-clip-text text-transparent">
                  Update Password
                </DialogTitle>
                <DialogDescription className="text-gray-600 dark:text-gray-400 mt-1">
                  {selectedUserForPassword && (
                    <>
                      Change password for <strong className="text-gray-900 dark:text-gray-100">{selectedUserForPassword.name}</strong>
                    </>
                  )}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          
          <div className="grid gap-6 py-6">
            {/* New Password Field */}
            <div className="space-y-2">
              <Label htmlFor="new-password" className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-amber-500"></div>
                New Password
              </Label>
              <div className="relative group">
                <Input
                  id="new-password"
                  type={showNewPassword ? "text" : "password"}
                  placeholder="Enter new password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="pr-12 h-12 border-2 border-gray-200 dark:border-gray-700 focus:border-amber-500 dark:focus:border-amber-500 bg-white dark:bg-gray-800 transition-all duration-200"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-1 top-1 h-10 w-10 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-all duration-200"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                >
                  {showNewPassword ? (
                    <EyeOff className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                  ) : (
                    <Eye className="h-5 w-5 text-gray-400 hover:text-amber-600 dark:text-gray-500 dark:hover:text-amber-400 transition-colors" />
                  )}
                </Button>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <div className={`w-1.5 h-1.5 rounded-full ${newPassword.length >= 6 ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`}></div>
                <p className={`${newPassword.length >= 6 ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'}`}>
                  Must be at least 6 characters
                </p>
              </div>
            </div>

            {/* Confirm Password Field */}
            <div className="space-y-2">
              <Label htmlFor="confirm-password" className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-amber-500"></div>
                Confirm New Password
              </Label>
              <div className="relative group">
                <Input
                  id="confirm-password"
                  type={showConfirmPassword ? "text" : "password"}
                  placeholder="Re-enter new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="pr-12 h-12 border-2 border-gray-200 dark:border-gray-700 focus:border-amber-500 dark:focus:border-amber-500 bg-white dark:bg-gray-800 transition-all duration-200"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-1 top-1 h-10 w-10 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-all duration-200"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                >
                  {showConfirmPassword ? (
                    <EyeOff className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                  ) : (
                    <Eye className="h-5 w-5 text-gray-400 hover:text-amber-600 dark:text-gray-500 dark:hover:text-amber-400 transition-colors" />
                  )}
                </Button>
              </div>
              {confirmPassword && (
                <div className="flex items-center gap-2 text-xs">
                  <div className={`w-1.5 h-1.5 rounded-full ${newPassword === confirmPassword && confirmPassword.length >= 6 ? 'bg-green-500' : 'bg-red-500'}`}></div>
                  <p className={`${newPassword === confirmPassword && confirmPassword.length >= 6 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                    {newPassword === confirmPassword && confirmPassword.length >= 6 ? 'Passwords match!' : 'Passwords must match'}
                  </p>
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="pt-4 border-t border-amber-100 dark:border-amber-900 gap-3">
            <Button
              variant="outline"
              onClick={() => {
                setShowPasswordDialog(false)
                setSelectedUserForPassword(null)
                setNewPassword("")
                setConfirmPassword("")
                setShowNewPassword(false)
                setShowConfirmPassword(false)
              }}
              className="border-2 border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 h-11 px-6"
            >
              Cancel
            </Button>
            <Button
              onClick={handleChangePassword}
              disabled={isLoading || !newPassword || !confirmPassword || newPassword !== confirmPassword || newPassword.length < 6}
              className="bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white shadow-lg hover:shadow-xl transition-all duration-200 h-11 px-6 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2"></div>
                  Updating...
                </>
              ) : (
                <>
                  <KeyRound className="mr-2 h-4 w-4" />
                  Update Password
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      )}

      {/* Edit Department Dialog */}
      <Dialog open={showDepartmentDialog} onOpenChange={setShowDepartmentDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Edit Department</DialogTitle>
            <DialogDescription>Make changes to the department details.</DialogDescription>
          </DialogHeader>
          {editingDepartment && (
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit-dept-name">Department Name</Label>
                <Input
                  id="edit-dept-name"
                  value={editingDepartment.name}
                  onChange={(e) => setEditingDepartment({ ...editingDepartment, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-dept-color">Color</Label>
                <Select
                  value={editingDepartment.color}
                  onValueChange={(value) => setEditingDepartment({ ...editingDepartment, color: value })}
                >
                  <SelectTrigger id="edit-dept-color">
                    <SelectValue placeholder="Select a color" />
                  </SelectTrigger>
                  <SelectContent>
                    {colorOptions.map((color) => (
                      <SelectItem key={color.value} value={color.value}>
                        <div className="flex items-center">
                          <div className={`w-4 h-4 rounded-full mr-2 ${color.value}`}></div>
                          {color.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-dept-desc">Description</Label>
                <Textarea
                  id="edit-dept-desc"
                  value={editingDepartment.description}
                  onChange={(e) => setEditingDepartment({ ...editingDepartment, description: e.target.value })}
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-dept-lead">Department Lead</Label>
                <Select
                  value={editingDepartment.lead}
                  onValueChange={(value) => setEditingDepartment({ ...editingDepartment, lead: value })}
                >
                  <SelectTrigger id="edit-dept-lead">
                    <SelectValue placeholder="Select a lead (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    {users
                      .filter((user) => user.role === "Manager" || user.role === "Admin")
                      .map((user) => (
                        <SelectItem key={user._id} value={user._id}>
                          {user.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDepartmentDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateDepartment}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View User Details Dialog */}
      <Dialog open={showViewUserDialog} onOpenChange={setShowViewUserDialog}>
        <DialogContent className="sm:max-w-[600px] border-l-4 border-l-purple-500">
          <DialogHeader className="pb-4 border-b border-purple-100 dark:border-purple-900">
            <div className="flex items-center gap-3">
              <Avatar className="h-16 w-16 border-4 border-purple-100 dark:border-purple-900">
                {viewingUser?.avatar ? (
                  <AvatarImage src={viewingUser.avatar} alt={viewingUser.name} />
                ) : (
                  <AvatarFallback className="bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300 text-xl font-bold">
                    {viewingUser && getInitials(viewingUser.name)}
                  </AvatarFallback>
                )}
              </Avatar>
              <div>
                <DialogTitle className="text-2xl font-bold">{viewingUser?.name}</DialogTitle>
                <DialogDescription className="text-base mt-1">{viewingUser?.email}</DialogDescription>
              </div>
            </div>
          </DialogHeader>
          
          {viewingUser && (
            <div className="grid gap-6 py-4">
              {/* User Information Grid */}
              <div className="grid grid-cols-2 gap-4">
                {/* Role */}
                <div className="space-y-2 p-4 bg-purple-50 dark:bg-purple-950/20 rounded-lg border border-purple-200 dark:border-purple-800">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Role</Label>
                  <div className="flex items-center gap-2">
                    <UserCog className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                    {getRoleBadge(viewingUser.role)}
                  </div>
                </div>

                {/* Department */}
                <div className="space-y-2 p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-800">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Department</Label>
                  <div>
                    {getDepartmentById(viewingUser.department) ? (
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                        <div className="flex items-center">
                          <div className={`w-3 h-3 rounded-full mr-2 ${getDepartmentById(viewingUser.department).color}`}></div>
                          <span className="font-semibold">{getDepartmentById(viewingUser.department).name}</span>
                        </div>
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-sm">Not assigned</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Full Information */}
              <div className="space-y-4 p-4 bg-gray-50 dark:bg-gray-900/30 rounded-lg border">
                <div className="grid grid-cols-1 gap-3">
                  <div className="flex justify-between py-2 border-b border-gray-200 dark:border-gray-700">
                    <span className="text-sm font-medium text-muted-foreground">User ID</span>
                    <span className="text-sm font-mono bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">{viewingUser._id}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-gray-200 dark:border-gray-700">
                    <span className="text-sm font-medium text-muted-foreground">Email Address</span>
                    <span className="text-sm font-medium">{viewingUser.email}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-gray-200 dark:border-gray-700">
                    <span className="text-sm font-medium text-muted-foreground">Full Name</span>
                    <span className="text-sm font-medium">{viewingUser.name}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-gray-200 dark:border-gray-700">
                    <span className="text-sm font-medium text-muted-foreground">Role</span>
                    <span className="text-sm font-medium">{viewingUser.role}</span>
                  </div>
                  <div className="flex justify-between py-2">
                    <span className="text-sm font-medium text-muted-foreground">Department</span>
                    <span className="text-sm font-medium">
                      {getDepartmentById(viewingUser.department)?.name || "Not assigned"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="flex gap-2 pt-2">
                <Button
                  onClick={() => {
                    setShowViewUserDialog(false)
                    setEditingUser(viewingUser)
                    setShowUserDialog(true)
                  }}
                  className="flex-1 bg-blue-600 hover:bg-blue-700"
                >
                  <Edit className="mr-2 h-4 w-4" />
                  Edit User
                </Button>
                {isAdminOrManager && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowViewUserDialog(false)
                      setSelectedUserForPassword(viewingUser)
                      setShowPasswordDialog(true)
                    }}
                    className="flex-1 border-amber-500 text-amber-700 hover:bg-amber-50 dark:border-amber-600 dark:text-amber-400 dark:hover:bg-amber-900/30"
                  >
                    <KeyRound className="mr-2 h-4 w-4" />
                    Change Password
                  </Button>
                )}
              </div>
            </div>
          )}

          <DialogFooter className="pt-4 border-t">
            <Button
              variant="outline"
              onClick={() => {
                setShowViewUserDialog(false)
                setViewingUser(null)
              }}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={showUserDialog} onOpenChange={setShowUserDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>Make changes to the user details.</DialogDescription>
          </DialogHeader>
          {editingUser && (
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit-user-name">Full Name</Label>
                <Input
                  id="edit-user-name"
                  value={editingUser.name}
                  onChange={(e) => setEditingUser({ ...editingUser, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-user-email">Email</Label>
                <Input
                  id="edit-user-email"
                  type="email"
                  value={editingUser.email}
                  onChange={(e) => setEditingUser({ ...editingUser, email: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-user-password">Password</Label>
                <Input
                  id="edit-user-password"
                  type="password"
                  placeholder="Leave blank to keep current password"
                  value={editingUser.password || ""}
                  onChange={(e) => setEditingUser({ ...editingUser, password: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-user-role">Role</Label>
                <Select
                  value={editingUser.role}
                  onValueChange={(value) => setEditingUser({ ...editingUser, role: value })}
                >
                  <SelectTrigger id="edit-user-role">
                    <SelectValue placeholder="Select a role" />
                  </SelectTrigger>
                  <SelectContent>
                    {roleOptions.map((role) => (
                      <SelectItem key={role.value} value={role.value}>
                        {role.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-user-dept">Department</Label>
                <Select
                  value={editingUser.department || "none"}
                  onValueChange={(value) =>
                    setEditingUser({ ...editingUser, department: value === "none" ? null : value })
                  }
                >
                  <SelectTrigger id="edit-user-dept">
                    <SelectValue placeholder="Select a department (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {departments.map((department) => (
                      <SelectItem key={department._id} value={department._id}>
                        <div className="flex items-center">
                          <div className={`w-3 h-3 rounded-full mr-2 ${department.color}`}></div>
                          {department.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUserDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateUser}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </>
  )
}

export default AdminDashboard
