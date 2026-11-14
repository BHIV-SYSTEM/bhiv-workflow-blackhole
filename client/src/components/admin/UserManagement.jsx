"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card"
import { Button } from "../ui/button"
import { Badge } from "../ui/badge"
import { Input } from "../ui/input"
import { Label } from "../ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu"
import { 
  Users, 
  UserCheck, 
  UserX, 
  Search, 
  MoreHorizontal, 
  Eye, 
  EyeOff,
  Edit, 
  Trash,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Loader2,
  UserCog,
  Building2,
  Mail,
  Calendar
} from 'lucide-react'
import { useToast } from "../../hooks/use-toast"
import { api } from "../../lib/api"
import { format } from "date-fns"
import { formatEmployeeId } from "../../lib/employeeId"

export function UserManagement() {
  const { toast } = useToast()
  const [users, setUsers] = useState([])
  const [filteredUsers, setFilteredUsers] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedUsers, setSelectedUsers] = useState([])
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  const [actionType, setActionType] = useState("") // "exit" or "reactivate"
  const [isUpdating, setIsUpdating] = useState(false)
  const [activeTab, setActiveTab] = useState("active")
  const [singleUserAction, setSingleUserAction] = useState(null) // { userId, stillExist, userName }
  
  // View and Edit states
  const [viewingUser, setViewingUser] = useState(null)
  const [editingUser, setEditingUser] = useState(null)
  const [showViewDialog, setShowViewDialog] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  
  // Delete user states
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [userToDelete, setUserToDelete] = useState(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // Fetch all users including exited ones
  useEffect(() => {
    fetchUsers()
  }, [])

  // Filter users based on search query and active tab
  useEffect(() => {
    let filtered = users

    // Filter by status based on active tab
    if (activeTab === "active") {
      filtered = filtered.filter(user => user.stillExist === 1)
    } else if (activeTab === "exited") {
      filtered = filtered.filter(user => user.stillExist === 0)
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(user => {
        const empId = (user.employeeId || formatEmployeeId(user.email) || "").toLowerCase()
        return (
          user.name.toLowerCase().includes(query) ||
          user.email.toLowerCase().includes(query) ||
          user.role.toLowerCase().includes(query) ||
          user.department?.name?.toLowerCase().includes(query) ||
          empId.includes(query)
        )
      })
    }

    setFilteredUsers(filtered)
  }, [users, searchQuery, activeTab])

  const fetchUsers = async () => {
    try {
      setIsLoading(true)
      const data = await api.admin.getAllUsers()
      setUsers(data)
    } catch (error) {
      console.error("Error fetching users:", error)
      toast({
        title: "Error",
        description: "Failed to load users",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleUserSelect = (userId, checked) => {
    if (checked) {
      setSelectedUsers(prev => [...prev, userId])
    } else {
      setSelectedUsers(prev => prev.filter(id => id !== userId))
    }
  }

  const handleSelectAll = (checked) => {
    if (checked) {
      setSelectedUsers(filteredUsers.map(user => user._id))
    } else {
      setSelectedUsers([])
    }
  }

  const handleBulkAction = (action) => {
    if (selectedUsers.length === 0) {
      toast({
        title: "No users selected",
        description: "Please select users to perform this action",
        variant: "destructive",
      })
      return
    }

    setActionType(action)
    setShowConfirmDialog(true)
  }

  const confirmBulkAction = async () => {
    try {
      setIsUpdating(true)
      const stillExist = actionType === "reactivate" ? 1 : 0

      // Update each selected user
      const promises = selectedUsers.map(userId =>
        api.admin.updateUserStatus(userId, stillExist)
      )

      await Promise.all(promises)

      // Update local state
      setUsers(prev => prev.map(user => 
        selectedUsers.includes(user._id) 
          ? { ...user, stillExist }
          : user
      ))

      setSelectedUsers([])
      setShowConfirmDialog(false)
      setSingleUserAction(null)

      toast({
        title: "Success",
        description: `${selectedUsers.length} user(s) ${actionType === "reactivate" ? "reactivated" : "marked as exited"} successfully`,
      })
    } catch (error) {
      console.error("Error updating users:", error)
      toast({
        title: "Error",
        description: "Failed to update user status",
        variant: "destructive",
      })
    } finally {
      setIsUpdating(false)
    }
  }

  const handleConfirmAction = () => {
    if (singleUserAction) {
      confirmSingleUserAction()
    } else {
      confirmBulkAction()
    }
  }

  const handleSingleUserAction = (userId, stillExist, userName) => {
    // Show confirmation dialog first
    setSingleUserAction({ userId, stillExist, userName })
    setActionType(stillExist === 1 ? "reactivate" : "exit")
    setShowConfirmDialog(true)
  }

  const confirmSingleUserAction = async () => {
    if (!singleUserAction) return

    try {
      setIsUpdating(true)
      await api.admin.updateUserStatus(singleUserAction.userId, singleUserAction.stillExist)
      
      // Update local state
      setUsers(prev => prev.map(user => 
        user._id === singleUserAction.userId 
          ? { ...user, stillExist: singleUserAction.stillExist } 
          : user
      ))

      setShowConfirmDialog(false)
      setSingleUserAction(null)

      toast({
        title: "Success",
        description: `User ${singleUserAction.stillExist === 1 ? "reactivated" : "marked as exited"} successfully`,
      })
    } catch (error) {
      console.error("Error updating user:", error)
      toast({
        title: "Error",
        description: "Failed to update user status",
        variant: "destructive",
      })
    } finally {
      setIsUpdating(false)
    }
  }

  // Delete user handler
  const handleDeleteUser = (user) => {
    setUserToDelete(user)
    setShowDeleteDialog(true)
  }

  const confirmDeleteUser = async () => {
    if (!userToDelete) return

    try {
      setIsDeleting(true)
      await api.admin.deleteUser(userToDelete._id)
      
      // Remove user from local state
      setUsers(prev => prev.filter(user => user._id !== userToDelete._id))
      
      setShowDeleteDialog(false)
      setUserToDelete(null)

      toast({
        title: "Success",
        description: `User "${userToDelete.name}" has been permanently deleted`,
      })
    } catch (error) {
      console.error("Error deleting user:", error)
      const errorMessage = error.message || "Failed to delete user"
      toast({
        title: "Error",
        description: errorMessage.includes("assigned tasks") 
          ? "Cannot delete user with assigned tasks. Consider marking as exited instead."
          : errorMessage,
        variant: "destructive",
      })
    } finally {
      setIsDeleting(false)
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
      setIsUpdating(true)
      const userToUpdate = { ...editingUser }
      if (!userToUpdate.password) {
        delete userToUpdate.password
      }

      await api.admin.updateUser(editingUser._id, userToUpdate)
      
      // Update local state
      setUsers(prev => prev.map(user => 
        user._id === editingUser._id ? editingUser : user
      ))

      setShowEditDialog(false)
      setEditingUser(null)
      setShowPassword(false)

      toast({
        title: "Success",
        description: "User updated successfully",
      })

      fetchUsers()
    } catch (error) {
      console.error("Error updating user:", error)
      toast({
        title: "Error",
        description: error.response?.data?.error || "Failed to update user",
        variant: "destructive",
      })
    } finally {
      setIsUpdating(false)
    }
  }

  const getStatusBadge = (stillExist) => {
    if (stillExist === 1) {
      return (
        <Badge className="bg-green-100 text-green-800">
          <UserCheck className="h-3 w-3 mr-1" />
          Active
        </Badge>
      )
    } else {
      return (
        <Badge className="bg-red-100 text-red-800">
          <UserX className="h-3 w-3 mr-1" />
          Exited
        </Badge>
      )
    }
  }

  const activeUsers = users.filter(user => user.stillExist === 1)
  const exitedUsers = users.filter(user => user.stillExist === 0)

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>User Management</CardTitle>
          <CardDescription>Manage user status and access</CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center items-center py-10">
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p>Loading users...</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            User Management
          </CardTitle>
          <CardDescription>
            Manage user status and access. Mark employees as exited when they leave the company.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            {/* Search */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                placeholder="Search users by name, email, role, or department..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Bulk Actions */}
            {selectedUsers.length > 0 && (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleBulkAction("exit")}
                  className="text-red-600 hover:text-red-700"
                >
                  <UserX className="h-4 w-4 mr-2" />
                  Mark as Exited ({selectedUsers.length})
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleBulkAction("reactivate")}
                  className="text-green-600 hover:text-green-700"
                >
                  <UserCheck className="h-4 w-4 mr-2" />
                  Reactivate ({selectedUsers.length})
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Statistics */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{users.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Users</CardTitle>
            <UserCheck className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{activeUsers.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Exited Users</CardTitle>
            <UserX className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{exitedUsers.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Users Table */}
      <Card>
        <CardHeader>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="p-1 border border-border/40">
              <TabsTrigger 
                value="active" 
                className="data-[state=active]:bg-emerald-600 data-[state=active]:text-white dark:data-[state=active]:bg-emerald-500 dark:data-[state=active]:text-zinc-950 font-semibold transition-colors"
              >
                Active Users ({activeUsers.length})
              </TabsTrigger>
              <TabsTrigger 
                value="exited" 
                className="data-[state=active]:bg-red-600 data-[state=active]:text-white dark:data-[state=active]:bg-red-500 dark:data-[state=active]:text-zinc-950 font-semibold transition-colors"
              >
                Exited Users ({exitedUsers.length})
              </TabsTrigger>
              <TabsTrigger 
                value="all" 
                className="data-[state=active]:bg-blue-600 data-[state=active]:text-white dark:data-[state=active]:bg-blue-500 dark:data-[state=active]:text-zinc-950 font-semibold transition-colors"
              >
                All Users ({users.length})
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent>
          {filteredUsers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="mx-auto h-8 w-8 text-muted-foreground/60 mb-2" />
              <p>No users found matching your criteria.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <input
                        type="checkbox"
                        checked={selectedUsers.length === filteredUsers.length && filteredUsers.length > 0}
                        onChange={(e) => handleSelectAll(e.target.checked)}
                        className="rounded border-gray-300"
                      />
                    </TableHead>
                    <TableHead>Employee ID</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Joined</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.map((user) => (
                    <TableRow key={user._id}>
                      <TableCell>
                        <input
                          type="checkbox"
                          checked={selectedUsers.includes(user._id)}
                          onChange={(e) => handleUserSelect(user._id, e.target.checked)}
                          className="rounded border-gray-300"
                        />
                      </TableCell>
                      <TableCell className="font-mono font-bold text-xs text-primary whitespace-nowrap">
                        {user.employeeId || formatEmployeeId(user.email)}
                      </TableCell>
                      <TableCell className="font-medium">{user.name}</TableCell>
                      <TableCell>{user.email}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{user.role}</Badge>
                      </TableCell>
                      <TableCell>{user.department?.name || "No Department"}</TableCell>
                      <TableCell>{getStatusBadge(user.stillExist)}</TableCell>
                      <TableCell>{format(new Date(user.createdAt), "MMM d, yyyy")}</TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0">
                              <span className="sr-only">Open menu</span>
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                            <DropdownMenuItem 
                              onClick={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                console.log('View Details clicked for:', user.name)
                                setViewingUser(user)
                                setShowViewDialog(true)
                              }}
                              className="cursor-pointer"
                            >
                              <Eye className="mr-2 h-4 w-4" />
                              View Details
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                console.log('Edit User clicked for:', user.name)
                                setEditingUser(user)
                                setShowEditDialog(true)
                                setShowPassword(false)
                              }}
                              className="cursor-pointer"
                            >
                              <Edit className="mr-2 h-4 w-4" />
                              Edit User
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {user.stillExist === 1 ? (
                              <DropdownMenuItem
                                className="text-red-600 cursor-pointer"
                                onClick={(e) => {
                                  e.preventDefault()
                                  e.stopPropagation()
                                  handleSingleUserAction(user._id, 0, user.name)
                                }}
                              >
                                <UserX className="mr-2 h-4 w-4" />
                                Mark as Exited
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem
                                className="text-green-600 cursor-pointer"
                                onClick={(e) => {
                                  e.preventDefault()
                                  e.stopPropagation()
                                  handleSingleUserAction(user._id, 1, user.name)
                                }}
                              >
                                <UserCheck className="mr-2 h-4 w-4" />
                                Reactivate User
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-red-600 bg-red-50 hover:bg-red-100 hover:text-red-700 dark:bg-red-950/50 dark:hover:bg-red-900/50 cursor-pointer font-semibold"
                              onClick={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                handleDeleteUser(user)
                              }}
                            >
                              <Trash className="mr-2 h-4 w-4" />
                              Delete User Permanently
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Confirmation Dialog */}
      <Dialog open={showConfirmDialog} onOpenChange={(open) => {
        setShowConfirmDialog(open)
        if (!open) {
          setSingleUserAction(null)
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Confirm Action
            </DialogTitle>
            <DialogDescription>
              {singleUserAction ? (
                <>
                  Are you sure you want to {actionType === "reactivate" ? "reactivate" : "mark as exited"} <strong>{singleUserAction.userName}</strong>?
                  {actionType === "reactivate" && (
                    <div className="mt-2 p-3 bg-green-50 border border-green-200 rounded-md">
                      <p className="text-sm text-green-800">
                        <strong>Note:</strong> This user will regain access to the system and will appear in active user lists.
                      </p>
                    </div>
                  )}
                  {actionType === "exit" && (
                    <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-md">
                      <p className="text-sm text-amber-800">
                        <strong>Note:</strong> This user will no longer appear in most lists and won't be able to access the system.
                        They can be reactivated later if needed.
                      </p>
                    </div>
                  )}
                </>
              ) : (
                <>
              Are you sure you want to {actionType === "reactivate" ? "reactivate" : "mark as exited"} {selectedUsers.length} user(s)?
              {actionType === "exit" && (
                <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-md">
                  <p className="text-sm text-amber-800">
                    <strong>Note:</strong> Exited users will no longer appear in most lists and won't be able to access the system.
                    They can be reactivated later if needed.
                  </p>
                </div>
                  )}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowConfirmDialog(false)
                setSingleUserAction(null)
              }}
              disabled={isUpdating}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmAction}
              disabled={isUpdating}
              className={actionType === "reactivate" ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"}
            >
              {isUpdating ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : actionType === "reactivate" ? (
                <CheckCircle className="mr-2 h-4 w-4" />
              ) : (
                <XCircle className="mr-2 h-4 w-4" />
              )}
              {singleUserAction 
                ? (actionType === "reactivate" ? "Reactivate User" : "Mark as Exited")
                : (actionType === "reactivate" ? "Reactivate Users" : "Mark as Exited")
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Details Dialog */}
      <Dialog open={showViewDialog} onOpenChange={setShowViewDialog}>
        <DialogContent className="sm:max-w-[650px] border-l-4 border-l-purple-600 dark:border-l-purple-400 shadow-2xl">
          <DialogHeader className="pb-5 border-b border-purple-500/20 bg-purple-500/10 -mx-6 -mt-6 px-6 pt-6 mb-4 rounded-t-lg">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-full bg-purple-600 shadow-md">
                <Eye className="h-5 w-5 text-white" />
              </div>
              <div>
                <DialogTitle className="text-2xl font-heading font-bold text-foreground">
                  User Details
                </DialogTitle>
                <DialogDescription className="text-sm sm:text-base mt-0.5 text-muted-foreground">
                  Complete information about this user
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          
          {viewingUser && (
            <div className="space-y-6 py-4">
              {/* User Header Card */}
              <div className="p-5 rounded-xl bg-purple-500/10 border border-purple-500/25 shadow-sm">
                <div className="flex items-center gap-4">
                  <div className="h-14 w-14 rounded-full bg-purple-600 flex items-center justify-center text-xl font-bold text-white shadow-md ring-2 ring-purple-500/30">
                    {viewingUser.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-xl font-bold text-foreground truncate">{viewingUser.name}</h3>
                    <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1 truncate">
                      <Mail className="h-3.5 w-3.5 shrink-0" />
                      {viewingUser.email}
                    </p>
                  </div>
                  {getStatusBadge(viewingUser.stillExist)}
                </div>
              </div>

              {/* Information Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Role Card */}
                <div className="p-4 rounded-xl border border-blue-500/25 bg-blue-500/10">
                  <Label className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider flex items-center gap-1">
                    <UserCog className="h-4 w-4" />
                    Role
                  </Label>
                  <div className="mt-3">
                    <Badge variant="outline" className="text-sm font-bold border-blue-500/35 text-blue-700 dark:text-blue-300 bg-background/70 px-3 py-1">
                      {viewingUser.role}
                    </Badge>
                  </div>
                </div>

                {/* Department Card */}
                <div className="p-4 rounded-xl border border-emerald-500/25 bg-emerald-500/10">
                  <Label className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-1">
                    <Building2 className="h-4 w-4" />
                    Department
                  </Label>
                  <div className="mt-3">
                    <span className="text-sm font-bold text-emerald-700 dark:text-emerald-300">
                      {viewingUser.department?.name || "No Department"}
                    </span>
                  </div>
                </div>

                {/* Joined Date Card */}
                <div className="p-4 rounded-xl border border-amber-500/25 bg-amber-500/10 sm:col-span-2">
                  <Label className="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider flex items-center gap-1">
                    <Calendar className="h-4 w-4" />
                    Joined Date
                  </Label>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold text-amber-700 dark:text-amber-300">
                      {format(new Date(viewingUser.createdAt), "MMMM d, yyyy")}
                    </span>
                    <span className="text-xs font-semibold text-amber-700 dark:text-amber-300 bg-amber-500/15 px-2 py-1 rounded">
                      {format(new Date(viewingUser.createdAt), "EEEE")}
                    </span>
                  </div>
                </div>
              </div>

              {/* Additional Info */}
              <div className="p-4 rounded-xl bg-muted/40 border border-border/60">
                <div className="flex justify-between items-center gap-2">
                  <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">User ID</span>
                  <code className="text-xs font-mono bg-background px-3 py-1.5 rounded-lg border border-border/70 text-foreground font-semibold">
                    {viewingUser._id}
                  </code>
                </div>
              </div>
            </div>
          )}
          
          <DialogFooter className="pt-5 border-t border-border/60 gap-2 bg-muted/30 -mx-6 -mb-6 px-6 pb-6 mt-6 rounded-b-lg">
            <Button 
              variant="outline" 
              onClick={() => setShowViewDialog(false)}
              className="rounded-xl font-semibold"
            >
              Close
            </Button>
            <Button 
              onClick={() => {
                setShowViewDialog(false)
                setEditingUser(viewingUser)
                setShowEditDialog(true)
                setShowPassword(false)
              }}
              className="gradient-primary text-primary-foreground shadow-sm font-semibold rounded-xl"
            >
              <Edit className="mr-2 h-4 w-4" />
              Edit User
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="sm:max-w-[550px] border-l-4 border-l-primary shadow-2xl">
          <DialogHeader className="pb-5 border-b border-primary/20 bg-primary/10 -mx-6 -mt-6 px-6 pt-6 mb-4 rounded-t-lg">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-full bg-primary text-primary-foreground shadow-md">
                <Edit className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-2xl font-heading font-bold text-foreground">
                  Edit User
                </DialogTitle>
                <DialogDescription className="text-sm sm:text-base mt-0.5 text-muted-foreground">
                  Make changes to the user details
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          
          {editingUser && (
            <div className="grid gap-5 py-4">
              {/* Full Name */}
              <div className="space-y-2">
                <Label htmlFor="edit-name" className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <UserCog className="h-4 w-4 text-primary" />
                  Full Name
                </Label>
                <Input
                  id="edit-name"
                  value={editingUser.name}
                  onChange={(e) => setEditingUser({ ...editingUser, name: e.target.value })}
                  className="bg-background border-border/70 h-11 font-medium text-foreground rounded-xl"
                  placeholder="Enter full name"
                />
              </div>

              {/* Email */}
              <div className="space-y-2">
                <Label htmlFor="edit-email" className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Mail className="h-4 w-4 text-primary" />
                  Email Address
                </Label>
                <Input
                  id="edit-email"
                  type="email"
                  value={editingUser.email}
                  onChange={(e) => setEditingUser({ ...editingUser, email: e.target.value })}
                  className="bg-background border-border/70 h-11 font-medium text-foreground rounded-xl"
                  placeholder="Enter email address"
                />
              </div>

              {/* Password */}
              <div className="space-y-2">
                <Label htmlFor="edit-password" className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <svg className="h-4 w-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  Password
                  <span className="text-xs text-muted-foreground font-normal bg-muted px-2 py-0.5 rounded">(optional)</span>
                </Label>
                <div className="relative">
                  <Input
                    id="edit-password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter new password"
                    value={editingUser.password || ""}
                    onChange={(e) => setEditingUser({ ...editingUser, password: e.target.value })}
                    className="bg-background border-border/70 pr-10 h-11 font-medium text-foreground rounded-xl"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary transition-colors p-1 hover:bg-muted rounded"
                    tabIndex={-1}
                  >
                    {showPassword ? (
                      <EyeOff className="h-5 w-5" />
                    ) : (
                      <Eye className="h-5 w-5" />
                    )}
                  </button>
                </div>
              </div>

              {/* Role */}
              <div className="space-y-2">
                <Label htmlFor="edit-role" className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <UserCog className="h-4 w-4 text-primary" />
                  Role
                </Label>
                <Select
                  value={editingUser.role}
                  onValueChange={(value) => setEditingUser({ ...editingUser, role: value })}
                >
                  <SelectTrigger id="edit-role" className="bg-background border-border/70 h-11 font-medium rounded-xl">
                    <SelectValue placeholder="Select a role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Admin">
                      <div className="flex items-center gap-2 font-medium">
                        <div className="h-2.5 w-2.5 rounded-full bg-red-500"></div>
                        Admin
                      </div>
                    </SelectItem>
                    <SelectItem value="Manager">
                      <div className="flex items-center gap-2 font-medium">
                        <div className="h-2.5 w-2.5 rounded-full bg-blue-500"></div>
                        Manager
                      </div>
                    </SelectItem>
                    <SelectItem value="User">
                      <div className="flex items-center gap-2 font-medium">
                        <div className="h-2.5 w-2.5 rounded-full bg-green-500"></div>
                        User
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Info Alert */}
              <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/25">
                <p className="text-sm text-blue-700 dark:text-blue-300 flex items-center gap-2 font-medium">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                  Changes will be saved immediately and the user will be notified.
                </p>
              </div>
            </div>
          )}
          
          <DialogFooter className="pt-5 border-t border-border/60 gap-2 bg-muted/30 -mx-6 -mb-6 px-6 pb-6 mt-6 rounded-b-lg">
            <Button
              variant="outline"
              onClick={() => {
                setShowEditDialog(false)
                setEditingUser(null)
                setShowPassword(false)
              }}
              disabled={isUpdating}
              className="rounded-xl font-semibold"
            >
              Cancel
            </Button>
            <Button 
              onClick={handleUpdateUser} 
              disabled={isUpdating}
              className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 dark:from-blue-500 dark:to-blue-600 dark:hover:from-blue-600 dark:hover:to-blue-700 min-w-[140px] shadow-lg font-semibold"
            >
              {isUpdating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Save Changes
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete User Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={(open) => {
        setShowDeleteDialog(open)
        if (!open) {
          setUserToDelete(null)
        }
      }}>
        <DialogContent className="sm:max-w-[450px] border-l-4 border-l-red-600">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Trash className="h-5 w-5" />
              Delete User Permanently
            </DialogTitle>
            <DialogDescription className="text-base pt-2">
              {userToDelete && (
                <div className="space-y-4">
                  <p>
                    Are you sure you want to <span className="font-semibold text-red-600">permanently delete</span> the user <strong>"{userToDelete.name}"</strong>?
                  </p>
                  <div className="p-3 bg-red-50 border border-red-200 rounded-md dark:bg-red-950/30 dark:border-red-800">
                    <p className="text-sm text-red-800 dark:text-red-300">
                      <strong>⚠️ Warning:</strong> This action cannot be undone. The user and all their associated data will be permanently removed from the system.
                    </p>
                  </div>
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-md dark:bg-amber-950/30 dark:border-amber-800">
                    <p className="text-sm text-amber-800 dark:text-amber-300">
                      <strong>Tip:</strong> If you want to keep user history, consider using "Mark as Exited" instead.
                    </p>
                  </div>
                </div>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 pt-4">
            <Button
              variant="outline"
              onClick={() => {
                setShowDeleteDialog(false)
                setUserToDelete(null)
              }}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDeleteUser}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash className="mr-2 h-4 w-4" />
                  Delete Permanently
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}