
// "use client"

// import { useState, useEffect } from "react"
// import { Link } from "react-router-dom"

// import { Button } from "../components/ui/button"
// import { Input } from "../components/ui/input"
// import { Label } from "../components/ui/label"
// import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "../components/ui/card"
// import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select"
// import { Loader2, Mail } from "lucide-react"
// import { api } from "../lib/api"
// import { Alert, AlertDescription, AlertTitle } from "../components/ui/alert"
// import { useAuth } from "@/context/auth-context"

// export default function Register() {
//   const [formData, setFormData] = useState({
//     name: "",
//     email: "",
//     password: "",
//     confirmPassword: "",
//     department: "",
//     role: "User",
//   })

//   const [errors, setErrors] = useState({})
//   const [departments, setDepartments] = useState([])
//   const [success, setSuccess] = useState(false)
//   const { register, actionLoading: loading } = useAuth()

//   useEffect(() => {
//     const fetchDepartments = async () => {
//       try {
//         const data = await api.departments.getDepartments()
//         setDepartments(data)
//         if (data.length > 0 && !formData.department) {
//           setFormData((prev) => ({ ...prev, department: data[0].id }))
//         }
//       } catch (err) {
//         console.error("Error fetching departments:", err)
//       }
//     }

//     fetchDepartments()
//   }, [])

//   const handleChange = (e) => {
//     const { name, value } = e.target
//     setFormData({ ...formData, [name]: value })
//     if (errors[name]) setErrors({ ...errors, [name]: "" })
//   }

//   const handleDepartmentChange = (value) => {
//     setFormData({ ...formData, department: value })
//     if (errors.department) setErrors({ ...errors, department: "" })
//   }

//   const handleRoleChange = (value) => {
//     setFormData({ ...formData, role: value })
//     if (errors.role) setErrors({ ...errors, role: "" })

//     // Clear department if role is Admin/Manager
//     if (value === "Admin" || value === "Manager") {
//       setFormData((prev) => ({ ...prev, department: "" }))
//     } else if (departments.length > 0) {
//       setFormData((prev) => ({ ...prev, department: departments[0].id }))
//     }
//   }

//   const validateForm = () => {
//     const newErrors = {}

//     if (!formData.name.trim()) newErrors.name = "Name is required"
//     if (!formData.email) {
//       newErrors.email = "Email is required"
//     } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
//       newErrors.email = "Email is invalid"
//     }

//     if (!formData.password) {
//       newErrors.password = "Password is required"
//     } else if (formData.password.length < 3) {
//       newErrors.password = "Password must be at least 3 characters"
//     }

//     if (formData.password !== formData.confirmPassword) {
//       newErrors.confirmPassword = "Passwords do not match"
//     }

//     if (formData.role === "User" && !formData.department) newErrors.department = "Please select a department"

//     if (!formData.role) newErrors.role = "Please select a role"

//     setErrors(newErrors)
//     return Object.keys(newErrors).length === 0
//   }

//   const handleSubmit = async (e) => {
//     e.preventDefault()
//     if (validateForm()) {
//       const { confirmPassword, ...registerData } = formData
//       try {
//         await register(registerData)
//         setSuccess(true)
//       } catch (error) {
//         console.error("Registration error:", error)
//       }
//     }
//   }

//   const getRoleDescription = (role) => {
//     switch (role) {
//       case "Admin":
//         return "Access the organization dashboard, assign tasks, review progress, and generate reports."
//       case "Manager":
//         return "Manage department tasks, review team progress, and generate department reports."
//       case "User":
//         return "Receive tasks from admins and update your progress on a daily basis."
//       default:
//         return ""
//     }
//   }

//   return (
//     <div className="h-screen flex items-center justify-center overflow-y-auto bg-gray-50 dark:bg-gray-900 px-4 py-8 auth-container">
//       <Card className="w-full max-w-lg shadow-lg mx-auto">
//         <CardHeader className="space-y-1">
//           <CardTitle className="text-2xl font-bold text-center">Create an account</CardTitle>
//           <CardDescription className="text-center">Enter your information to create an account</CardDescription>
//         </CardHeader>
//         <form onSubmit={handleSubmit}>
//           <CardContent className="space-y-6">
//             {success && (
//               <Alert className="bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-900">
//                 <Mail className="h-4 w-4" />
//                 <AlertTitle>Registration successful!</AlertTitle>
//                 <AlertDescription>
//                   A welcome email has been sent to {formData.email} with details about your role and responsibilities.
//                 </AlertDescription>
//               </Alert>
//             )}

//             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
//               <div className="space-y-2">
//                 <Label htmlFor="name">Full Name</Label>
//                 <Input
//                   id="name"
//                   name="name"
//                   placeholder="John Doe"
//                   value={formData.name}
//                   onChange={handleChange}
//                   disabled={loading || success}
//                   className={errors.name ? "border-red-500" : ""}
//                 />
//                 {errors.name && <p className="text-sm text-red-500">{errors.name}</p>}
//               </div>

//               <div className="space-y-2">
//                 <Label htmlFor="email">Email</Label>
//                 <Input
//                   id="email"
//                   name="email"
//                   type="email"
//                   placeholder="name@example.com"
//                   value={formData.email}
//                   onChange={handleChange}
//                   disabled={loading || success}
//                   className={errors.email ? "border-red-500" : ""}
//                 />
//                 {errors.email && <p className="text-sm text-red-500">{errors.email}</p>}
//               </div>
//             </div>

//             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
//               <div className="space-y-2">
//                 <Label htmlFor="password">Password</Label>
//                 <Input
//                   id="password"
//                   name="password"
//                   type="password"
//                   placeholder="••••••••"
//                   value={formData.password}
//                   onChange={handleChange}
//                   disabled={loading || success}
//                   className={errors.password ? "border-red-500" : ""}
//                 />
//                 {errors.password && <p className="text-sm text-red-500">{errors.password}</p>}
//               </div>

//               <div className="space-y-2">
//                 <Label htmlFor="confirmPassword">Confirm Password</Label>
//                 <Input
//                   id="confirmPassword"
//                   name="confirmPassword"
//                   type="password"
//                   placeholder="••••••••"
//                   value={formData.confirmPassword}
//                   onChange={handleChange}
//                   disabled={loading || success}
//                   className={errors.confirmPassword ? "border-red-500" : ""}
//                 />
//                 {errors.confirmPassword && <p className="text-sm text-red-500">{errors.confirmPassword}</p>}
//               </div>
//             </div>

//             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
//               <div className="space-y-2">
//                 <Label htmlFor="role">Role</Label>
//                 <Select value={formData.role} onValueChange={handleRoleChange} disabled={loading || success}>
//                   <SelectTrigger
//                     className={`bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm focus:ring-2 focus:ring-primary focus:border-primary transition-colors ${errors.role ? "border-red-500" : ""}`}
//                   >
//                     <SelectValue placeholder="Select a role" />
//                   </SelectTrigger>
//                   <SelectContent className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-md shadow-lg max-h-60 overflow-y-auto">
//                     <SelectItem
//                       value="Admin"
//                       className="hover:bg-gray-100 dark:hover:bg-gray-700 focus:bg-gray-100 dark:focus:bg-gray-700 transition-colors"
//                     >
//                       Admin
//                     </SelectItem>
//                     <SelectItem
//                       value="Manager"
//                       className="hover:bg-gray-100 dark:hover:bg-gray-700 focus:bg-gray-100 dark:focus:bg-gray-700 transition-colors"
//                     >
//                       Manager
//                     </SelectItem>
//                     <SelectItem
//                       value="User"
//                       className="hover:bg-gray-100 dark:hover:bg-gray-700 focus:bg-gray-100 dark:focus:bg-gray-700 transition-colors"
//                     >
//                       User
//                     </SelectItem>
//                   </SelectContent>
//                 </Select>
//                 {errors.role && <p className="text-sm text-red-500">{errors.role}</p>}
//                 {formData.role && (
//                   <p className="text-xs text-muted-foreground mt-1">{getRoleDescription(formData.role)}</p>
//                 )}
//               </div>

//               {/* <div className="space-y-2">
//                 <Label htmlFor="department">Department</Label>
//                 <Select
//                   value={formData.department}
//                   onValueChange={handleDepartmentChange}
//                   disabled={loading || success || formData.role !== "User"}
//                 >
//                   <SelectTrigger
//                     className={`bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm focus:ring-2 focus:ring-primary focus:border-primary transition-colors ${errors.department ? "border-red-500" : ""}`}
//                   >
//                     <SelectValue placeholder="Select a department" />
//                   </SelectTrigger>
//                   <SelectContent className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-md shadow-lg max-h-60 overflow-y-auto">
//                     {departments.map((dept) => (
//                       <SelectItem
//                         key={dept.id}
//                         value={dept.id}
//                         className="hover:bg-gray-100 dark:hover:bg-gray-700 focus:bg-gray-100 dark:focus:bg-gray-700 transition-colors"
//                       >
//                         {dept.name}
//                       </SelectItem>
//                     ))}
//                   </SelectContent>
//                 </Select>
//                 {errors.department && <p className="text-sm text-red-500">{errors.department}</p>}
//                 {formData.role === "User" && (
//                   <p className="text-xs text-muted-foreground mt-1">
//                     You'll receive tasks from this department's manager.
//                   </p>
//                 )}
//               </div> */}
//               <div className="space-y-2">
//                 <Label htmlFor="department">Department</Label>
//                 <Select
//                   value={formData.department}
//                   onValueChange={handleDepartmentChange}
//                   disabled={loading || formData.role !== "User"}
//                 >
//                   <SelectTrigger
//                     className={`bg-white border border-gray-300 rounded-md shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors ${errors.department ? "border-red-500" : ""}`}
//                   >
//                     <SelectValue placeholder="Select a department" />
//                   </SelectTrigger>
//                   <SelectContent className="bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
//                     {departments.map((dept) => (
//                       <SelectItem
//                         key={dept._id}
//                         value={dept._id}
//                         className="hover:bg-gray-100 focus:bg-gray-100 transition-colors"
//                       >
//                         {dept.name}
//                       </SelectItem>
//                     ))}
//                   </SelectContent>
//                 </Select>
//                 {errors.department && (
//                   <p className="text-sm text-red-500">{errors.department}</p>
//                 )}
//                 {formData.role === "User" && (
//                   <p className="text-xs text-muted-foreground mt-1">
//                     You'll receive tasks from this department's manager.
//                   </p>
//                 )}
//               </div>
//             </div>
//           </CardContent>
//           <CardFooter className="flex flex-col space-y-4">
//             {!success && (
//               <Button type="submit" className="w-full" disabled={loading}>
//                 {loading ? (
//                   <>
//                     <Loader2 className="mr-2 h-4 w-4 animate-spin" />
//                     Creating account...
//                   </>
//                 ) : (
//                   "Register"
//                 )}
//               </Button>
//             )}
//             {success && (
//               <Button asChild className="w-full">
//                 <Link to="/login">Continue to Login</Link>
//               </Button>
//             )}
//             <p className="text-center text-sm">
//               Already have an account?{" "}
//               <Link to="/login" className="text-primary hover:underline">
//                 Login
//               </Link>
//             </p>
//           </CardFooter>
//         </form>
//       </Card>
//     </div>
//   )
// }


"use client"

import { useEffect, useState } from "react"
import { Link } from "react-router-dom"

import { Button } from "../components/ui/button"
import { Input } from "../components/ui/input"
import { Label } from "../components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "../components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select"
import { Loader2, Mail, UserPlus, Eye, EyeOff, Sparkles, Lock, User, Briefcase, Building2, AlertCircle, CheckCircle2, ArrowRight } from "lucide-react"
import { api } from "../lib/api"
import { Alert, AlertDescription, AlertTitle } from "../components/ui/alert"
import { useAuth } from "@/context/auth-context"
import { isValidOrgEmail } from "@/lib/orgEmail"
import { AuthLayoutShell } from "../components/auth/AuthLayoutShell"

export default function Register() {
  // Get currently selected branch from localStorage, default to blackhole_mumbai
  const selectedBranch = localStorage.getItem('selectedBranch') || 'blackhole_mumbai'

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
    department: "",
    role: "User",
    branch: selectedBranch,
  })

  const [errors, setErrors] = useState({})
  const [authError, setAuthError] = useState("")
  const [departments, setDepartments] = useState([])
  const [branches, setBranches] = useState([])
  const [success, setSuccess] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const { register, actionLoading: loading } = useAuth()

  useEffect(() => {
    const fetchDepartments = async () => {
      try {
        const response = await api.departments.getDepartments()
        const data = response.success ? response.data : response
        const departmentsArray = Array.isArray(data) ? data : []

        setDepartments(departmentsArray)
        if (departmentsArray.length > 0 && !formData.department) {
          setFormData((prev) => ({ ...prev, department: departmentsArray[0]._id }))
        }
      } catch (err) {
        console.error("Error fetching departments:", err)
        setDepartments([])
      }
    }

    const fetchBranches = async () => {
      try {
        const response = await api.branches.getAll()
        const data = response.success ? response.data : response
        const branchesArray = Array.isArray(data) ? data : []
        setBranches(branchesArray)
        if (branchesArray.length > 0 && !formData.branch) {
          setFormData((prev) => ({ ...prev, branch: branchesArray[0].code }))
        }
      } catch (err) {
        console.error("Error fetching branches:", err)
        setBranches([
          { _id: '1', name: 'Blackhole Mumbai', code: 'blackhole_mumbai' }
        ])
      }
    }

    fetchDepartments()
    fetchBranches()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: "" }))
    if (authError) setAuthError("")
  }

  const handleDepartmentChange = (value) => {
    setFormData((prev) => ({ ...prev, department: value }))
    if (errors.department) setErrors((prev) => ({ ...prev, department: "" }))
  }

  const handleBranchChange = (value) => {
    setFormData((prev) => ({ ...prev, branch: value }))
    if (errors.branch) setErrors((prev) => ({ ...prev, branch: "" }))
  }

  const handleRoleChange = (value) => {
    setFormData((prev) => ({
      ...prev,
      role: value,
      department: value !== "User" ? "" : (departments[0]?._id || prev.department),
    }))
    if (errors.role || errors.department) {
      setErrors((prev) => ({ ...prev, role: "", department: "" }))
    }
  }

  const validateForm = () => {
    const newErrors = {}

    if (!formData.name.trim()) newErrors.name = "Name is required"
    if (!formData.email) {
      newErrors.email = "Email is required"
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = "Email is invalid"
    } else if (!isValidOrgEmail(formData.email)) {
      newErrors.email =
        "Use @gmail.com or @outlook.com; name must include bhiv or blackhole (e.g. blackholeinfiverse64@gmail.com)"
    }

    if (!formData.password) {
      newErrors.password = "Password is required"
    } else if (formData.password.length < 3) {
      newErrors.password = "Password must be at least 3 characters"
    }

    if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = "Passwords do not match"
    }

    if (formData.role === "User" && !formData.department) {
      newErrors.department = "Please select a department"
    }

    if (!formData.role) newErrors.role = "Please select a role"
    if (!formData.branch) newErrors.branch = "Please select a branch"

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setAuthError("")

    if (validateForm()) {
      // eslint-disable-next-line no-unused-vars
      const { confirmPassword, ...registerData } = formData
      try {
        await register(registerData)
        setSuccess(true)
      } catch (error) {
        const message =
          error?.response?.data?.message ||
          error?.response?.data?.error ||
          error?.message ||
          "Registration failed. Please check your details and try again."
        setAuthError(message)
      }
    }
  }

  const getRoleDescription = (role) => {
    switch (role) {
      case "Manager":
        return "Manage department tasks, review team progress, and generate department reports."
      case "Tester":
        return "Verify completed tasks, run quality checks, and report evaluation feedback."
      case "User":
        return "Receive tasks from admins and update your progress on a daily basis."
      default:
        return ""
    }
  }

  const passwordsMatch =
    formData.password.length >= 3 &&
    formData.confirmPassword.length > 0 &&
    formData.password === formData.confirmPassword

  return (
    <AuthLayoutShell maxWidth="max-w-2xl">
      <Card className="w-full relative overflow-hidden rounded-2xl border border-border/80 dark:border-white/10 bg-card/90 backdrop-blur-xl shadow-[0_24px_60px_-15px_rgba(15,23,42,0.14)] dark:shadow-[0_24px_60px_-15px_rgba(0,0,0,0.65)]">
        {/* Subtle top accent hairline */}
        <div className="h-1 w-full gradient-primary" />

        <CardHeader className="space-y-2 text-center pt-7 pb-5 px-6 sm:px-8">
          <div className="mx-auto w-14 h-14 gradient-primary rounded-2xl flex items-center justify-center mb-2 shadow-glow-primary relative">
            <UserPlus className="w-7 h-7 text-primary-foreground relative z-10" />
          </div>

          <CardTitle className="text-3xl font-bold tracking-tight text-foreground">
            Create Your Account
          </CardTitle>
          <CardDescription className="text-muted-foreground text-sm flex items-center justify-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-primary" />
            <span>Join Infiverse Workflow & start tracking tasks seamlessly</span>
          </CardDescription>
        </CardHeader>

        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-5 px-6 sm:px-8">
            {success && (
              <Alert className="border-success/40 bg-success/10 text-foreground rounded-xl animate-fade-in">
                <CheckCircle2 className="h-5 w-5 text-success" />
                <AlertTitle className="text-foreground font-semibold">Registration successful!</AlertTitle>
                <AlertDescription className="text-muted-foreground text-xs sm:text-sm">
                  A welcome email has been sent to <span className="font-medium text-foreground">{formData.email}</span> with details about your role and responsibilities.
                </AlertDescription>
              </Alert>
            )}

            {authError && !success && (
              <Alert
                variant="destructive"
                className="border-destructive/40 bg-destructive/10 text-destructive rounded-xl animate-fade-in"
              >
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-xs sm:text-sm font-medium text-destructive">
                  {authError}
                </AlertDescription>
              </Alert>
            )}

            {/* Name and Email Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
              <div className="space-y-2">
                <Label htmlFor="name" className="text-sm font-medium text-foreground">
                  Full Name
                </Label>
                <div className="relative">
                  <User className="w-4 h-4 text-muted-foreground absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <Input
                    id="name"
                    name="name"
                    autoComplete="name"
                    placeholder="John Doe"
                    value={formData.name}
                    onChange={handleChange}
                    disabled={loading || success}
                    className={`pl-10 pr-4 h-11 rounded-xl bg-background/70 border-border/90 hover:border-primary/50 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20 transition-all duration-200 ${
                      errors.name
                        ? "border-destructive focus-visible:border-destructive focus-visible:ring-destructive/20"
                        : ""
                    }`}
                  />
                </div>
                {errors.name && (
                  <p className="text-xs text-destructive flex items-center gap-1.5 font-medium">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{errors.name}</span>
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-medium text-foreground">
                  Organization Email
                </Label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-muted-foreground absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    placeholder="name.bhiv@gmail.com"
                    value={formData.email}
                    onChange={handleChange}
                    disabled={loading || success}
                    className={`pl-10 pr-4 h-11 rounded-xl bg-background/70 border-border/90 hover:border-primary/50 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20 transition-all duration-200 ${
                      errors.email
                        ? "border-destructive focus-visible:border-destructive focus-visible:ring-destructive/20"
                        : ""
                    }`}
                  />
                </div>
                {errors.email && (
                  <p className="text-xs text-destructive flex items-center gap-1.5 font-medium leading-relaxed">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{errors.email}</span>
                  </p>
                )}
              </div>
            </div>

            {/* Password and Confirm Password Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-medium text-foreground">
                  Password
                </Label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-muted-foreground absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    placeholder="Create a password"
                    value={formData.password}
                    onChange={handleChange}
                    disabled={loading || success}
                    className={`pl-10 pr-11 h-11 rounded-xl bg-background/70 border-border/90 hover:border-primary/50 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20 transition-all duration-200 ${
                      errors.password
                        ? "border-destructive focus-visible:border-destructive focus-visible:ring-destructive/20"
                        : ""
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-1 rounded-md"
                    disabled={loading || success}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {errors.password && (
                  <p className="text-xs text-destructive flex items-center gap-1.5 font-medium">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{errors.password}</span>
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword" className="text-sm font-medium text-foreground">
                  Confirm Password
                </Label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-muted-foreground absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <Input
                    id="confirmPassword"
                    name="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    autoComplete="new-password"
                    placeholder="Confirm your password"
                    value={formData.confirmPassword}
                    onChange={handleChange}
                    disabled={loading || success}
                    className={`pl-10 pr-11 h-11 rounded-xl bg-background/70 border-border/90 hover:border-primary/50 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20 transition-all duration-200 ${
                      errors.confirmPassword
                        ? "border-destructive focus-visible:border-destructive focus-visible:ring-destructive/20"
                        : ""
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-1 rounded-md"
                    disabled={loading || success}
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {errors.confirmPassword ? (
                  <p className="text-xs text-destructive flex items-center gap-1.5 font-medium">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{errors.confirmPassword}</span>
                  </p>
                ) : passwordsMatch ? (
                  <p className="text-xs text-success flex items-center gap-1.5 font-medium">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    <span>Passwords match</span>
                  </p>
                ) : null}
              </div>
            </div>

            {/* Role and Department Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
              <div className="space-y-2">
                <Label htmlFor="role" className="text-sm font-medium text-foreground flex items-center gap-1.5">
                  <Briefcase className="w-3.5 h-3.5 text-primary" />
                  <span>Role</span>
                </Label>
                <Select value={formData.role} onValueChange={handleRoleChange} disabled={loading || success}>
                  <SelectTrigger
                    id="role"
                    className={`h-11 rounded-xl bg-background/70 border-border/90 hover:border-primary/50 focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all duration-200 ${
                      errors.role ? "border-destructive" : ""
                    }`}
                  >
                    <SelectValue placeholder="Select a role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="User">User</SelectItem>
                    <SelectItem value="Manager">Manager</SelectItem>
                    <SelectItem value="Tester">Tester</SelectItem>
                  </SelectContent>
                </Select>
                {errors.role && (
                  <p className="text-xs text-destructive flex items-center gap-1.5 font-medium">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{errors.role}</span>
                  </p>
                )}
                {formData.role && (
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {getRoleDescription(formData.role)}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="department" className="text-sm font-medium text-foreground flex items-center gap-1.5">
                  <Briefcase className="w-3.5 h-3.5 text-primary" />
                  <span>Department</span>
                </Label>
                <Select
                  value={formData.department}
                  onValueChange={handleDepartmentChange}
                  disabled={loading || success || formData.role !== "User"}
                >
                  <SelectTrigger
                    id="department"
                    className={`h-11 rounded-xl bg-background/70 border-border/90 hover:border-primary/50 focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all duration-200 ${
                      errors.department ? "border-destructive" : ""
                    }`}
                  >
                    <SelectValue
                      placeholder={
                        formData.role !== "User"
                          ? `Not required for ${formData.role}`
                          : "Select a department"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {departments.length === 0 ? (
                      <div className="px-3 py-2 text-xs text-muted-foreground">
                        No departments available
                      </div>
                    ) : (
                      departments.map((dept) => (
                        <SelectItem key={dept._id} value={dept._id}>
                          {dept.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                {errors.department && (
                  <p className="text-xs text-destructive flex items-center gap-1.5 font-medium">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{errors.department}</span>
                  </p>
                )}
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {formData.role === "User"
                    ? "You'll receive tasks from this department's manager."
                    : `Department assignment is only required for the User role.`}
                </p>
              </div>
            </div>

            {/* Branch Selection */}
            <div className="space-y-2">
              <Label htmlFor="branch" className="text-sm font-medium text-foreground flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-primary" />
                <span>Office Branch</span>
              </Label>
              <Select
                value={formData.branch}
                onValueChange={handleBranchChange}
                disabled={loading || success}
              >
                <SelectTrigger
                  id="branch"
                  className={`h-11 rounded-xl bg-background/70 border-border/90 hover:border-primary/50 focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all duration-200 ${
                    errors.branch ? "border-destructive" : ""
                  }`}
                >
                  <SelectValue placeholder="Select your branch" />
                </SelectTrigger>
                <SelectContent>
                  {branches.map((branch) => (
                    <SelectItem
                      key={branch._id || branch.code}
                      value={branch.code}
                    >
                      {branch.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.branch && (
                <p className="text-xs text-destructive flex items-center gap-1.5 font-medium">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{errors.branch}</span>
                </p>
              )}
              <p className="text-xs text-muted-foreground leading-relaxed">
                Select the office location where you work.
              </p>
            </div>
          </CardContent>

          <CardFooter className="flex flex-col space-y-5 px-6 sm:px-8 pt-6 pb-8">
            {!success ? (
              <Button
                type="submit"
                className="w-full h-11 relative overflow-hidden group gradient-primary hover:brightness-110 hover:scale-[1.01] active:scale-[0.99] hover:shadow-glow-primary transition-all duration-200 text-primary-foreground font-semibold text-sm sm:text-base rounded-xl"
                disabled={loading}
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent translate-x-[-200%] group-hover:translate-x-[200%] transition-transform duration-700" />
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating Account...
                  </>
                ) : (
                  <>
                    <span>Create Account</span>
                    <ArrowRight className="ml-2 h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                  </>
                )}
              </Button>
            ) : (
              <Link to="/login" className="w-full">
                <Button className="w-full h-11 gradient-primary hover:brightness-110 hover:scale-[1.01] active:scale-[0.99] hover:shadow-glow-primary transition-all duration-200 text-primary-foreground font-semibold text-sm sm:text-base rounded-xl">
                  <Lock className="mr-2 h-4 w-4" />
                  Continue to Login
                </Button>
              </Link>
            )}

            <div className="w-full pt-4 border-t border-border/60 text-center">
              <p className="text-sm text-muted-foreground">
                Already registered?{" "}
                <Link
                  to="/login"
                  className="text-primary hover:text-primary/80 font-semibold underline-offset-4 hover:underline transition-colors"
                >
                  Sign in here
                </Link>
              </p>
            </div>
          </CardFooter>
        </form>
      </Card>
    </AuthLayoutShell>
  )
}


