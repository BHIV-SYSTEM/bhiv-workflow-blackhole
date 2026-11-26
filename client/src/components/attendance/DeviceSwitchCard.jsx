import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { AlertTriangle, ArrowLeftRight, CheckCircle2, Laptop, Smartphone, Monitor, RefreshCw } from 'lucide-react'
import api from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { useAuth } from '@/context/auth-context'

/**
 * Switch Device (V1)
 *
 * Shows which device owns the employee's open workday and lets them hand the
 * day over between Laptop/PC (V1 desktop agent) and Mobile Phone (no agent).
 * Moving a workday to the desktop requires the Niyantran Workflow Agent to be
 * installed, open and signed in for the account.
 */
export default function DeviceSwitchCard({ userId: userIdProp, className = '' }) {
  const { user } = useAuth()
  const { toast } = useToast()
  const userId = userIdProp || user?.id || user?._id

  const [state, setState] = useState(null)
  const [loading, setLoading] = useState(true)
  const [switching, setSwitching] = useState(null)

  const isMobileDevice = /Mobile|Android|iPhone|iPad/i.test(
    typeof navigator !== 'undefined' ? navigator.userAgent : ''
  )

  const load = useCallback(async () => {
    if (!userId) return
    try {
      const res = await api.deviceSession.get(userId)
      setState(res || null)
    } catch {
      // Non-fatal: the card simply shows an unavailable state until the API responds
      setState(null)
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    load()
    const id = setInterval(load, 20000)
    const onVisible = () => {
      if (document.visibilityState === 'visible') load()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [load])

  const currentDeviceType = state?.activeDevice?.deviceType || null
  const agentOnline = Boolean(state?.agent?.online)
  const dayActive = Boolean(state?.dayActive)

  const handleSwitch = async (targetDeviceType) => {
    if (!userId) return
    setSwitching(targetDeviceType)
    try {
      const res = await api.deviceSession.switchDevice(userId, targetDeviceType, {
        deviceType: isMobileDevice ? 'Mobile' : 'Desktop',
        deviceId: null
      })
      setState(res || null)
      toast({
        title: 'Device switched',
        description:
          res?.message ||
          (targetDeviceType === 'Desktop'
            ? 'This workday is now running on your laptop/PC agent.'
            : 'This workday is now running on your mobile phone.')
      })
    } catch (err) {
      const data = err?.data || err?.response?.data || {}
      toast({
        title: data.code === 'AGENT_REQUIRED' ? 'Agent required' : 'Switch failed',
        description:
          data.error ||
          err?.message ||
          'Could not switch device. Open the desktop agent and sign in, then retry.',
        variant: 'destructive'
      })
      load()
    } finally {
      setSwitching(null)
    }
  }

  if (loading && !state) {
    return (
      <Card className={`flex flex-col neo-card shadow-lg border-l-4 border-l-primary ${className}`}>
        <CardHeader className="border-b bg-gradient-to-r from-primary/5 to-transparent">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/15 border border-primary/30 flex items-center justify-center text-primary shrink-0">
              <ArrowLeftRight className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base">Switch Device</CardTitle>
              <CardDescription>
                Move today&apos;s workday between this phone and your laptop/PC.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-5 flex-1">
          <p className="text-sm text-muted-foreground">Checking your work device…</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={`flex flex-col neo-card shadow-lg border-l-4 border-l-primary ${className}`}>
      <CardHeader className="border-b bg-gradient-to-r from-primary/5 to-transparent">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="h-10 w-10 rounded-xl bg-primary/15 border border-primary/30 flex items-center justify-center text-primary shrink-0">
              <ArrowLeftRight className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <CardTitle className="text-base">Switch Device</CardTitle>
              <CardDescription className="mt-0.5">
                Move today&apos;s workday between this phone and your laptop/PC.
              </CardDescription>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={load}
            disabled={loading}
            title="Refresh device state"
            className="shrink-0"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col justify-between gap-4 pt-5">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {currentDeviceType ? (
              <Badge className="bg-primary/10 text-primary border border-primary/30 flex items-center gap-1.5">
                {currentDeviceType === 'Desktop' ? <Monitor className="h-3.5 w-3.5 shrink-0" /> : <Smartphone className="h-3.5 w-3.5 shrink-0" />}
                {state.activeDevice?.label || (currentDeviceType === 'Desktop' ? 'Laptop / PC' : 'Mobile Phone')}
              </Badge>
            ) : dayActive ? (
              <Badge className="bg-primary/10 text-primary border border-primary/30">
                Active workday
              </Badge>
            ) : (
              <Badge variant="outline">No active workday</Badge>
            )}

            <Badge
              variant="outline"
              className={
                agentOnline
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                  : 'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400'
              }
            >
              {agentOnline ? <CheckCircle2 className="h-3.5 w-3.5 mr-1 shrink-0" /> : <AlertTriangle className="h-3.5 w-3.5 mr-1 shrink-0" />}
              {agentOnline ? 'Desktop agent online' : state?.agent?.installed ? 'Desktop agent offline' : 'Desktop agent not installed'}
            </Badge>

            <Badge variant="outline" className="border-border/60">
              This device: {isMobileDevice ? 'Mobile' : 'Laptop / PC'}
            </Badge>
          </div>

          {!dayActive ? (
            <p className="text-sm text-muted-foreground leading-relaxed">
              Start your day first. On a laptop/PC the Niyantran Workflow Agent must be installed and signed in;
              on a phone you can start without the agent, then switch to your laptop/PC later.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Button
                variant={currentDeviceType === 'Mobile' ? 'secondary' : 'outline'}
                disabled={currentDeviceType === 'Mobile' || switching !== null}
                onClick={() => handleSwitch('Mobile')}
                className="w-full min-w-0 h-auto min-h-11 px-3.5 py-2.5 justify-center whitespace-normal text-center leading-tight"
              >
                <Smartphone className="h-4 w-4 shrink-0" />
                <span>{currentDeviceType === 'Mobile' ? 'On Mobile Phone' : 'Switch to Mobile'}</span>
              </Button>

              <Button
                variant={currentDeviceType === 'Desktop' ? 'secondary' : 'default'}
                disabled={currentDeviceType === 'Desktop' || switching !== null}
                onClick={() => handleSwitch('Desktop')}
                className="w-full min-w-0 h-auto min-h-11 px-3.5 py-2.5 justify-center whitespace-normal text-center leading-tight"
              >
                <Laptop className="h-4 w-4 shrink-0" />
                <span>{currentDeviceType === 'Desktop' ? 'On Laptop / PC' : 'Switch to Laptop / PC'}</span>
              </Button>
            </div>
          )}

          {dayActive && currentDeviceType !== 'Desktop' && !agentOnline && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <div className="space-y-1">
                <p className="font-semibold">Desktop agent not available</p>
                <p>
                  {state?.agent?.installed
                    ? 'Open the Niyantran Workflow Agent and sign in before switching this workday to your laptop/PC.'
                    : 'Install the Niyantran Workflow Agent and sign in before switching this workday to your laptop/PC.'}
                </p>
                <button
                  type="button"
                  onClick={() => { window.location.href = 'niyantran://open'; }}
                  className="underline hover:no-underline font-medium"
                >
                  Open Agent
                </button>
              </div>
            </div>
          )}
        </div>

        {Array.isArray(state?.history) && state.history.length > 0 && (
          <div className="rounded-xl border border-border/50 bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
            <p className="font-semibold text-foreground/80">Today&apos;s device activity</p>
            {state.history.slice(-3).map((entry, index) => (
              <p key={`${entry.switchedAt || 'entry'}-${index}`} className="flex items-center justify-between gap-2">
                <span>{entry.from ? `${entry.from} → ${entry.to}` : `Started on ${entry.to}`}</span>
                {entry.switchedAt && (
                  <span className="font-mono text-[11px]">{new Date(entry.switchedAt).toLocaleTimeString()}</span>
                )}
              </p>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
