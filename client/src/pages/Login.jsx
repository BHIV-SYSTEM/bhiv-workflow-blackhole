"use client"

import { useEffect, useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2, Eye, EyeOff, Lock, Mail, Sparkles, AlertCircle, ArrowRight } from "lucide-react"
import { useAuth } from "../context/auth-context"
import { AuthLayoutShell } from "../components/auth/AuthLayoutShell"

export default function Login() {
  const [searchParams] = useSearchParams()
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  })
  const [errors, setErrors] = useState({})
  const [authError, setAuthError] = useState("")
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const { login } = useAuth()

  useEffect(() => {
    const queryError = searchParams.get("error")
    if (queryError) {
      setAuthError(queryError)
    }
  }, [searchParams])

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))

    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: "" }))
    }
    if (authError) {
      setAuthError("")
    }
  }

  const validateForm = () => {
    const newErrors = {}

    if (!formData.email) {
      newErrors.email = "Email is required"
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = "Email is invalid"
    }

    if (!formData.password) {
      newErrors.password = "Password is required"
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setAuthError("")

    if (validateForm()) {
      setLoading(true)

      try {
        await login(formData)
      } catch (error) {
        const message =
          error?.response?.data?.message ||
          error?.response?.data?.error ||
          "Invalid email or password"
        setAuthError(message)
        setErrors((prev) => ({ ...prev, password: message }))
      } finally {
        setLoading(false)
      }
    }
  }

  return (
    <AuthLayoutShell maxWidth="max-w-md">
      <Card className="w-full relative overflow-hidden rounded-2xl border border-border/80 dark:border-white/10 bg-card/90 backdrop-blur-xl shadow-[0_24px_60px_-15px_rgba(15,23,42,0.14)] dark:shadow-[0_24px_60px_-15px_rgba(0,0,0,0.65)]">
        {/* Subtle top accent hairline */}
        <div className="h-1 w-full gradient-primary" />

        <CardHeader className="space-y-2 text-center pt-8 pb-5 px-6 sm:px-8">
          <div className="mx-auto w-14 h-14 gradient-primary rounded-2xl flex items-center justify-center mb-2 shadow-glow-primary relative">
            <Lock className="w-7 h-7 text-primary-foreground relative z-10" />
          </div>

          <CardTitle className="text-3xl font-bold tracking-tight text-foreground">
            Welcome Back
          </CardTitle>
          <CardDescription className="text-muted-foreground text-sm flex items-center justify-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-primary" />
            <span>Sign in to access your Infiverse workspace</span>
          </CardDescription>
        </CardHeader>

        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-5 px-6 sm:px-8">
            {authError && (
              <Alert
                variant="destructive"
                className="border-destructive/40 bg-destructive/10 text-destructive animate-fade-in rounded-xl"
              >
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-xs sm:text-sm font-medium text-destructive">
                  {authError}
                </AlertDescription>
              </Alert>
            )}

            {/* Email Field */}
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium text-foreground">
                Email Address
              </Label>
              <div className="relative">
                <Mail className="w-4 h-4 text-muted-foreground absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@blackholeinfiverse.com"
                  value={formData.email}
                  onChange={handleChange}
                  disabled={loading}
                  className={`pl-10 pr-4 h-11 rounded-xl bg-background/70 border-border/90 hover:border-primary/50 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20 transition-all duration-200 ${
                    errors.email
                      ? "border-destructive focus-visible:border-destructive focus-visible:ring-destructive/20"
                      : ""
                  }`}
                />
              </div>
              {errors.email && (
                <p className="text-xs text-destructive flex items-center gap-1.5 font-medium">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{errors.email}</span>
                </p>
              )}
            </div>

            {/* Password Field */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-sm font-medium text-foreground">
                  Password
                </Label>
                <Link
                  to="/forgot-password"
                  className="text-xs sm:text-sm text-primary hover:text-primary/80 transition-colors duration-200 font-medium"
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-muted-foreground absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  value={formData.password}
                  onChange={handleChange}
                  disabled={loading}
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
                  disabled={loading}
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
          </CardContent>

          <CardFooter className="flex flex-col space-y-5 px-6 sm:px-8 pt-6 pb-8">
            <Button
              type="submit"
              className="w-full h-11 relative overflow-hidden group gradient-primary hover:brightness-110 hover:scale-[1.01] active:scale-[0.99] hover:shadow-glow-primary transition-all duration-200 text-primary-foreground font-semibold text-sm sm:text-base rounded-xl"
              disabled={loading}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent translate-x-[-200%] group-hover:translate-x-[200%] transition-transform duration-700" />
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Signing In...
                </>
              ) : (
                <>
                  <span>Sign In</span>
                  <ArrowRight className="ml-2 h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                </>
              )}
            </Button>

            <div className="w-full pt-4 border-t border-border/60 text-center">
              <p className="text-sm text-muted-foreground">
                Don&apos;t have an account?{" "}
                <Link
                  to="/register"
                  className="text-primary hover:text-primary/80 font-semibold underline-offset-4 hover:underline transition-colors"
                >
                  Create one now
                </Link>
              </p>
            </div>
          </CardFooter>
        </form>
      </Card>
    </AuthLayoutShell>
  )
}
