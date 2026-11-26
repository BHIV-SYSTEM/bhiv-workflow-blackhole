import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { AlertTriangle, ArrowRight, CheckCircle2, Download, Monitor, RefreshCw } from 'lucide-react'
import { useAgentConnection } from '@/hooks/useAgentConnection'
import { downloadAgentInstaller } from '@/services/agentInstallerDownload'
import { useToast } from '@/hooks/use-toast'

/**
 * V1 employee-agent status and installer actions.
 *
 * Download/Open actions sit on the left side of the card (header area), not
 * at the bottom. The download button disappears as soon as the web app
 * detects a signed-in V1 agent, and comes back after uninstall or agent
 * logout — detection is live, never a one-shot "already downloaded" flag.
 */
export default function AgentStatusCard() {
  const { toast } = useToast()
  const [isDownloading, setIsDownloading] = useState(false)
  const {
    isAgentConnected,
    isAgentRunning,
    installed,
    version,
    isChecking,
    lastSeen,
    lastChecked,
    checkAgent,
    openAgent,
  } = useAgentConnection()

  const handleDownload = async () => {
    setIsDownloading(true)
    try {
      const result = await downloadAgentInstaller('exe')
      toast({
        title: 'Download started',
        description: `Downloading ${result.fileName} — check your browser downloads, install it, then open the agent and sign in.`,
      })
      checkAgent({ silent: true })
    } catch (err) {
      toast({
        title: 'Download failed',
        description: err.message || 'Could not download the desktop agent.',
        variant: 'destructive',
      })
    } finally {
      setIsDownloading(false)
    }
  }

  const statusLabel = isAgentConnected
    ? 'Connected'
    : isAgentRunning
      ? 'Signed out'
      : installed
        ? 'Installed · Offline'
        : 'Not installed'

  return (
    <Card className="neo-card shadow-lg border-l-4 border-l-purple-500">
      <CardHeader className="border-b bg-gradient-to-r from-purple-500/5 to-transparent">
        <div className="flex items-start justify-between gap-3">
          {/* Left side: identity, live status and the download/open actions */}
          <div className="flex items-start gap-3 min-w-0">
            <div className="h-10 w-10 rounded-xl bg-purple-600/15 border border-purple-500/30 flex items-center justify-center text-purple-500 shrink-0">
              <Monitor className="h-5 w-5" />
            </div>
            <div className="min-w-0 space-y-2">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  Niyantran Desktop Agent
                  {version && (
                    <Badge variant="outline" className="text-[10px]">v{version}</Badge>
                  )}
                </CardTitle>
                <CardDescription>
                  Required to start your workday on a laptop/PC. On mobile you can start without it.
                </CardDescription>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant="outline"
                  className={
                    isAgentConnected
                      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                      : 'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400'
                  }
                >
                  {isAgentConnected ? (
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                  ) : (
                    <AlertTriangle className="h-3.5 w-3.5 mr-1" />
                  )}
                  {statusLabel}
                </Badge>
                {lastSeen && !isAgentConnected && (
                  <span className="text-xs text-muted-foreground">
                    Last connected {new Date(lastSeen).toLocaleString()}
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                {!isAgentConnected && !(isChecking && !lastChecked) && (
                  <Button
                    onClick={handleDownload}
                    disabled={isDownloading}
                    className="bg-purple-600 hover:bg-purple-500 text-white"
                  >
                    <Download className="h-4 w-4 mr-1.5" />
                    {isDownloading ? 'Downloading…' : 'Download Agent (.exe)'}
                  </Button>
                )}
                <Button variant="outline" onClick={openAgent}>
                  Open Agent
                  <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
                </Button>
              </div>
            </div>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={checkAgent}
            disabled={isChecking}
            title="Refresh agent status"
            className="shrink-0"
          >
            <RefreshCw className={`h-4 w-4 ${isChecking ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="pt-4">
        {!isAgentConnected && !(isChecking && !lastChecked) && (
          <p className="text-sm text-muted-foreground">
            {isAgentRunning
              ? 'The agent is running but signed out. Open it and sign in with your account.'
              : 'Install the Windows agent, then open it and sign in. This page will update automatically.'}
          </p>
        )}
        {isAgentConnected && (
          <p className="text-sm text-muted-foreground">
            Agent connected — the download button is hidden while it stays signed in. It returns
            automatically if the agent is uninstalled or signs out.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
