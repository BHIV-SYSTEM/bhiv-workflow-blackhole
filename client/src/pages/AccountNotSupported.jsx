"use client"

import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { ShieldAlert, LogOut, Mail, AlertCircle, ArrowLeft, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AuthLayoutShell } from "../components/auth/AuthLayoutShell"
import { useAuth } from "../context/auth-context"

export default function AccountNotSupported() {
  const navigate = useNavigate()
  const { praveshBlocked, clearPraveshBlocked } = useAuth()
  const [submitting, setSubmitting] = useState(false)

  let info = praveshBlocked
  if (!info && typeof window !== "undefined") {
    try {
      const saved = sessionStorage.getItem("niyantran_pravesh_blocked")
      if (saved) info = JSON.parse(saved)
    } catch (_) {}
  }

  const blockedEmail = info?.email || null
  const reason =
    info?.error ||
    "This account is not allowed or not supported on Niyantran. Please use an authorized BHIV / Blackhole account created for Niyantran."

  const handleUseAnotherAccount = async () => {
    setSubmitting(true)
    try {
      await clearPraveshBlocked()
    } finally {
      setSubmitting(false)
      navigate("/login", { replace: true })
    }
  }

  return (
    <AuthLayoutShell maxWidth="max-w-md">
      <Card className="w-full relative overflow-hidden rounded-2xl border border-destructive/30 dark:border-red-500/20 bg-card/90 backdrop-blur-xl shadow-[0_24px_60px_-15px_rgba(15,23,42,0.18)] dark:shadow-[0_24px_60px_-15px_rgba(0,0,0,0.65)]">
        <div className="h-1 w-full bg-destructive" />

        <CardHeader className="space-y-2 text-center pt-8 pb-5 px-6 sm:px-8">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-destructive/15 border border-destructive/30 flex items-center justify-center mb-2">
            <ShieldAlert className="w-7 h-7 text-destructive" />
          </div>

          <CardTitle className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            Account Not Allowed or Not Supported
          </CardTitle>
          <CardDescription className="text-muted-foreground text-sm">
            This account cannot access Niyantran via Pravesh SSO.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4 px-6 sm:px-8">
          {blockedEmail && (
            <div className="flex items-center gap-2.5 rounded-xl border border-border/80 bg-muted/40 px-3.5 py-2.5 text-sm">
              <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="truncate font-medium text-foreground">{blockedEmail}</span>
            </div>
          )}

          <Alert
            variant="destructive"
            className="border-destructive/40 bg-destructive/10 text-destructive rounded-xl"
          >
            <AlertCircle className="h-4 w-4 shrink-0" />
            <AlertDescription className="text-xs sm:text-sm font-medium text-destructive leading-relaxed">
              {reason}
            </AlertDescription>
          </Alert>

          <p className="text-xs text-muted-foreground leading-relaxed text-center">
            Only accounts created for Niyantran with a supported email format (e.g.{" "}
            <span className="font-mono text-foreground/80">blackholeinfiverse90@gmail.com</span> or{" "}
            <span className="font-mono text-foreground/80">BHIVMSSU0030@outlook.com</span>) are
            allowed to sign in. Contact your administrator if you believe this is a mistake.
          </p>
        </CardContent>

        <CardFooter className="flex flex-col gap-3 px-6 sm:px-8 pb-8 pt-2">
          <Button
            type="button"
            onClick={handleUseAnotherAccount}
            disabled={submitting}
            className="w-full h-11 rounded-xl font-semibold gradient-primary text-primary-foreground shadow-glow-primary hover:opacity-95 transition-all"
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                <span>Signing out...</span>
              </>
            ) : (
              <>
                <LogOut className="mr-2 h-4 w-4" />
                <span>Sign in with Another Account</span>
              </>
            )}
          </Button>

          <Button
            type="button"
            variant="outline"
            onClick={handleUseAnotherAccount}
            disabled={submitting}
            className="w-full h-10 rounded-xl"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            <span>Back to Niyantran Login</span>
          </Button>
        </CardFooter>
      </Card>
    </AuthLayoutShell>
  )
}

