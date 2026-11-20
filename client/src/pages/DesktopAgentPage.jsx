import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Download,
  Monitor,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  ExternalLink,
  Copy,
  Check,
  Play,
  Smartphone,
  Laptop,
  Terminal,
  HelpCircle,
  FileCode,
  Lock,
  EyeOff,
  Cpu,
  Layers,
  ArrowRight
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { downloadAgentInstaller, getInstallerInfo } from '@/modules/employee-monitoring-v2/services/installerDownload';
import { API_URL } from '@/lib/api';

const AGENT_LOOPBACK_URL = 'http://127.0.0.1:48120';

export default function DesktopAgentPage() {
  const navigate = useNavigate();

  // Agent detection state
  const [isAgentRunning, setIsAgentRunning] = useState(false);
  const [agentData, setAgentData] = useState(null);
  const [isChecking, setIsChecking] = useState(true);
  const [lastChecked, setLastChecked] = useState(null);

  // Installer info
  const [installerMeta, setInstallerMeta] = useState(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState('');
  const [downloadError, setDownloadError] = useState('');

  // Pairing code state
  const [enrollmentCode, setEnrollmentCode] = useState('');
  const [codeExpiresAt, setCodeExpiresAt] = useState(null);
  const [isGeneratingCode, setIsGeneratingCode] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  // Session state
  const [isStartingSession, setIsStartingSession] = useState(false);
  const [sessionSuccess, setSessionSuccess] = useState('');

  // Check agent health on mount
  useEffect(() => {
    checkAgentHealth();
    loadInstallerInfo();
  }, []);

  const checkAgentHealth = async () => {
    setIsChecking(true);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      const res = await fetch(`${AGENT_LOOPBACK_URL}/status`, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        setIsAgentRunning(true);
        setAgentData(data);
      } else {
        setIsAgentRunning(false);
        setAgentData(null);
      }
    } catch {
      setIsAgentRunning(false);
      setAgentData(null);
    } finally {
      setIsChecking(false);
      setLastChecked(new Date().toLocaleTimeString());
    }
  };

  const loadInstallerInfo = async () => {
    const info = await getInstallerInfo();
    if (info) setInstallerMeta(info);
  };

  const handleDownload = async (format = 'exe') => {
    setIsDownloading(true);
    setDownloadError('');
    setDownloadSuccess('');
    try {
      const result = await downloadAgentInstaller(format);
      setDownloadSuccess(`Downloaded ${result.fileName} (${(result.size / 1024).toFixed(1)} KB) successfully!`);
    } catch (err) {
      console.error('Download error:', err);
      setDownloadError(err.message || 'Download failed. Please ensure you are logged in.');
    } finally {
      setIsDownloading(false);
    }
  };

  const handleGenerateEnrollmentCode = async () => {
    setIsGeneratingCode(true);
    setCopiedCode(false);
    try {
      const token = localStorage.getItem('WorkflowToken') || localStorage.getItem('token');
      const res = await fetch(`${API_URL}/monitoring-v2/devices/enrollment-code`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { Authorization: `Bearer ${token}`, 'x-auth-token': token }),
        },
      });
      const data = await res.json();
      if (res.ok && data.code) {
        setEnrollmentCode(data.code);
        setCodeExpiresAt(data.expiresAt);
      } else {
        alert(data.error || 'Failed to generate enrollment code');
      }
    } catch (err) {
      alert('Network error: ' + err.message);
    } finally {
      setIsGeneratingCode(false);
    }
  };

  const handleCopyCode = () => {
    if (!enrollmentCode) return;
    navigator.clipboard.writeText(enrollmentCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 3000);
  };

  const handleStartSession = async () => {
    setIsStartingSession(true);
    setSessionSuccess('');
    try {
      const token = localStorage.getItem('WorkflowToken') || localStorage.getItem('token');
      const res = await fetch(`${API_URL}/monitoring-v2/sessions/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { Authorization: `Bearer ${token}`, 'x-auth-token': token }),
        },
        body: JSON.stringify({
          mode: 'LAPTOP_PC',
          taskId: 'DESKTOP-SESSION',
        }),
      });
      const data = await res.json();
      if (res.ok && data.sessionId) {
        setSessionSuccess(`Session active! ID: ${data.sessionId}`);
        setTimeout(() => navigate('/monitoring-v2/employee'), 1500);
      } else {
        alert(data.error || 'Failed to start session');
      }
    } catch (err) {
      alert('Error starting session: ' + err.message);
    } finally {
      setIsStartingSession(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 space-y-8 max-w-7xl mx-auto">
      {/* Hero Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-6">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center text-purple-400">
              <Monitor className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                Niyantran Desktop Agent Hub
                <Badge variant="outline" className="border-purple-500/40 text-purple-300 text-xs">
                  Windows v2.0
                </Badge>
              </h1>
              <p className="text-sm text-slate-400">
                Lightweight, privacy-preserving desktop telemetry and foreground application tracking for Windows.
              </p>
            </div>
          </div>
        </div>

        {/* Real-time Connection Status Indicator */}
        <div className="flex items-center gap-3">
          <div
            id="agent-connection-status-badge"
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full border text-xs font-semibold ${
              isChecking
                ? 'bg-slate-800 border-slate-700 text-slate-400'
                : isAgentRunning
                ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300'
                : 'bg-amber-950/60 border-amber-500/40 text-amber-300'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                isChecking ? 'bg-slate-400 animate-pulse' : isAgentRunning ? 'bg-emerald-400' : 'bg-amber-400'
              }`}
            />
            {isChecking
              ? 'Checking Loopback (48120)...'
              : isAgentRunning
              ? 'Agent Connected & Healthy'
              : 'Agent Not Connected'}
            {lastChecked && <span className="text-[10px] opacity-75 font-normal ml-1">({lastChecked})</span>}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={checkAgentHealth}
            disabled={isChecking}
            className="border-slate-700 text-slate-300 hover:bg-slate-800"
            title="Re-check loopback connection"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1 ${isChecking ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Main Action Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* CARD 1: PERMANENT DOWNLOAD AGENT (Primary User Request) */}
        <Card className="lg:col-span-2 border-slate-800 bg-slate-900/60 backdrop-blur shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-purple-500/5 rounded-full blur-3xl pointer-events-none" />

          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg text-white flex items-center gap-2">
                <Download className="w-5 h-5 text-purple-400" />
                Download Agent for Windows
              </CardTitle>
              <Badge className="bg-purple-600/30 text-purple-200 border-purple-500/30">Official Build</Badge>
            </div>
            <CardDescription className="text-slate-400 text-sm">
              The desktop agent runs locally in the background on your workstation. It is permanently available for download below anytime you need to set up a new laptop or reinstall.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            {/* Primary Download Buttons */}
            <div className="flex flex-wrap items-center gap-3">
              <Button
                id="btn-download-agent-exe"
                size="lg"
                onClick={() => handleDownload('exe')}
                disabled={isDownloading}
                className="bg-purple-600 hover:bg-purple-500 text-white font-semibold text-sm px-5 shadow-lg shadow-purple-600/20"
              >
                <Download className="w-4 h-4 mr-2" />
                {isDownloading ? 'Downloading Installer...' : 'Download Agent for Windows (.exe)'}
              </Button>

              <Button
                id="btn-download-agent-zip"
                variant="outline"
                size="lg"
                onClick={() => handleDownload('zip')}
                disabled={isDownloading}
                className="border-slate-700 hover:bg-slate-800 text-slate-300 text-sm"
              >
                Download Archive (.zip)
              </Button>

              <a
                href={`${AGENT_LOOPBACK_URL}/mini`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center text-xs text-purple-400 hover:text-purple-300 underline font-medium ml-2"
              >
                <ExternalLink className="w-3.5 h-3.5 mr-1" />
                Open Mini Window in New Tab
              </a>
            </div>

            {/* Download Status Toast / Messages */}
            {downloadSuccess && (
              <div className="p-3 rounded-lg bg-emerald-950/60 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                <span>{downloadSuccess} Check your browser Downloads folder.</span>
              </div>
            )}
            {downloadError && (
              <div className="p-3 rounded-lg bg-rose-950/60 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{downloadError}</span>
              </div>
            )}

            {/* Package Metadata Info */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80 text-xs">
              <div>
                <span className="text-slate-500 block">Package Version</span>
                <span className="font-semibold text-slate-200">v{installerMeta?.version || '2.0.0'}</span>
              </div>
              <div>
                <span className="text-slate-500 block">File Size</span>
                <span className="font-semibold text-slate-200">
                  {installerMeta?.fileSize ? `${(installerMeta.fileSize / 1024).toFixed(1)} KB` : '55.8 KB'}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">Target Architecture</span>
                <span className="font-semibold text-slate-200">win32-x64 (Windows 10/11)</span>
              </div>
              <div>
                <span className="text-slate-500 block">Silent Install Flag</span>
                <code className="text-purple-300 font-mono">/S</code>
              </div>
            </div>

            {/* SHA-256 Hash */}
            {installerMeta?.sha256 && (
              <div className="text-[11px] text-slate-500 flex items-center gap-1.5 truncate">
                <Lock className="w-3 h-3 text-slate-400 shrink-0" />
                <span className="text-slate-400 font-medium">SHA-256:</span>
                <span className="font-mono text-slate-400 truncate">{installerMeta.sha256}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* CARD 2: REAL-TIME AGENT STATUS & DIAGNOSTICS */}
        <Card className="border-slate-800 bg-slate-900/60 backdrop-blur shadow-xl">
          <CardHeader>
            <CardTitle className="text-lg text-white flex items-center gap-2">
              <Cpu className="w-5 h-5 text-purple-400" />
              Agent Installation Status
            </CardTitle>
            <CardDescription className="text-slate-400 text-xs">
              Monitors local loopback daemon on <code className="text-slate-300">127.0.0.1:48120</code>
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4 text-xs">
            {isAgentRunning && agentData ? (
              <div className="space-y-3">
                <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/30 space-y-1.5">
                  <div className="flex items-center justify-between text-emerald-300 font-semibold">
                    <span className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      Agent Active & Healthy
                    </span>
                    <Badge variant="outline" className="border-emerald-500/30 text-emerald-300 text-[10px]">
                      v{agentData.agentVersion || '2.0.0'}
                    </Badge>
                  </div>
                  <p className="text-emerald-400/80 text-[11px]">
                    Workstation is communicating with local loopback daemon.
                  </p>
                </div>

                <div className="space-y-2 text-slate-400">
                  <div className="flex justify-between py-1 border-b border-slate-800">
                    <span>Device ID:</span>
                    <span className="font-mono text-slate-200 truncate max-w-[170px]" title={agentData.deviceId}>
                      {agentData.deviceId || 'Enrolled'}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800">
                    <span>Current Mode:</span>
                    <span className="text-slate-200 font-medium">{agentData.currentMode || 'LAPTOP_PC'}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800">
                    <span>Session State:</span>
                    <span className="text-slate-200 font-medium">{agentData.sessionState || 'IDLE_WAITING_AUTH'}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800">
                    <span>Hostname:</span>
                    <span className="text-slate-200 font-medium">{agentData.hostname || 'Local PC'}</span>
                  </div>
                </div>

                <div className="pt-2 flex flex-col gap-2">
                  <Button
                    size="sm"
                    onClick={() => navigate('/monitoring-v2/employee')}
                    className="w-full bg-slate-800 hover:bg-slate-700 text-white text-xs"
                  >
                    Go to Work Session Workspace
                    <ArrowRight className="w-3.5 h-3.5 ml-1" />
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="p-3.5 rounded-xl bg-amber-950/40 border border-amber-500/30 space-y-2">
                  <div className="flex items-center gap-2 text-amber-300 font-semibold">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                    Agent Not Detected
                  </div>
                  <p className="text-amber-200/80 text-[11px] leading-relaxed">
                    The background daemon is not running on port 48120. Download and install the agent above to activate Windows foreground tracking.
                  </p>
                </div>

                <div className="space-y-1.5 text-slate-400 text-[11px]">
                  <div className="font-semibold text-slate-300">Why is this needed?</div>
                  <p>
                    The agent monitors active window application names during your sessions so that your focus score and productivity can be tracked accurately.
                  </p>
                </div>

                <Button
                  size="sm"
                  onClick={() => handleDownload('exe')}
                  className="w-full bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold"
                >
                  <Download className="w-3.5 h-3.5 mr-1" />
                  Download Installer Now
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* SECOND ROW: Device Pairing & Quick Controls */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* CARD 3: DEVICE PAIRING (6-Digit Enrollment) */}
        <Card className="border-slate-800 bg-slate-900/60 backdrop-blur shadow-xl">
          <CardHeader>
            <CardTitle className="text-lg text-white flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-purple-400" />
              Pair This Workstation
            </CardTitle>
            <CardDescription className="text-slate-400 text-xs">
              Generates a one-time cryptographic enrollment code to securely pair your laptop with your corporate identity.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <Button
                id="btn-generate-enrollment-code"
                onClick={handleGenerateEnrollmentCode}
                disabled={isGeneratingCode}
                className="bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold"
              >
                {isGeneratingCode ? 'Generating...' : 'Generate 6-Digit Pairing Code'}
              </Button>

              {enrollmentCode && (
                <div className="flex items-center gap-2">
                  <div className="px-3.5 py-1.5 rounded-lg bg-slate-950 border border-purple-500/40 text-purple-300 font-mono text-base font-bold tracking-widest">
                    {enrollmentCode}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCopyCode}
                    className="border-slate-700 hover:bg-slate-800 text-slate-300 text-xs"
                  >
                    {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </Button>
                </div>
              )}
            </div>

            {enrollmentCode && (
              <div className="text-[11px] text-slate-400 space-y-1">
                <p>
                  To pair using the command line: <code className="text-purple-300 font-mono">npm run agent:pair {enrollmentCode}</code>
                </p>
                {codeExpiresAt && (
                  <p className="text-amber-400/80">
                    Expires at: {new Date(codeExpiresAt).toLocaleTimeString()}
                  </p>
                )}
                <p className="text-slate-500">
                  Credentials are automatically vaulted inside Windows Data Protection API (DPAPI).
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* CARD 4: WORK SESSION & MINI WINDOW CONTROLS */}
        <Card className="border-slate-800 bg-slate-900/60 backdrop-blur shadow-xl">
          <CardHeader>
            <CardTitle className="text-lg text-white flex items-center gap-2">
              <Layers className="w-5 h-5 text-purple-400" />
              Session Controls & Mini Window
            </CardTitle>
            <CardDescription className="text-slate-400 text-xs">
              Start an authorized work session or open the native Mini Desktop Window.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <Button
                id="btn-start-work-session"
                onClick={handleStartSession}
                disabled={isStartingSession}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs"
              >
                <Play className="w-3.5 h-3.5 mr-1" />
                {isStartingSession ? 'Starting Session...' : 'Start Work Session'}
              </Button>

              <Button
                variant="outline"
                onClick={() => navigate('/monitoring-v2/employee')}
                className="border-slate-700 hover:bg-slate-800 text-slate-300 text-xs font-semibold"
              >
                Open Full Workspace
              </Button>

              <a
                href={`${AGENT_LOOPBACK_URL}/mini`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center text-xs text-purple-400 hover:text-purple-300 underline font-medium"
              >
                <ExternalLink className="w-3.5 h-3.5 mr-1" />
                Open Mini Window (Port 48120)
              </a>
            </div>

            {sessionSuccess && (
              <div className="p-2.5 rounded-lg bg-emerald-950/60 border border-emerald-500/30 text-emerald-300 text-xs">
                {sessionSuccess} Redirecting to workspace...
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* THIRD ROW: Step-by-Step Installation Instructions */}
      <Card className="border-slate-800 bg-slate-900/40 shadow-xl">
        <CardHeader>
          <CardTitle className="text-base text-white flex items-center gap-2">
            <Terminal className="w-4 h-4 text-purple-400" />
            Step-by-Step Installation & Setup Instructions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
            <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1.5">
              <div className="w-6 h-6 rounded-full bg-purple-600/30 text-purple-300 font-bold flex items-center justify-center text-xs">
                1
              </div>
              <div className="font-semibold text-white">Download Installer</div>
              <p className="text-slate-400 text-[11px]">
                Click "Download Agent for Windows (.exe)" above to save <code className="text-purple-300">NiyantranMonitoringAgentV2-Setup.exe</code>.
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1.5">
              <div className="w-6 h-6 rounded-full bg-purple-600/30 text-purple-300 font-bold flex items-center justify-center text-xs">
                2
              </div>
              <div className="font-semibold text-white">Run Setup</div>
              <p className="text-slate-400 text-[11px]">
                Double click the setup file to install interactively, or run silently from terminal: <code className="text-purple-300">NiyantranMonitoringAgentV2-Setup.exe /S</code>.
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1.5">
              <div className="w-6 h-6 rounded-full bg-purple-600/30 text-purple-300 font-bold flex items-center justify-center text-xs">
                3
              </div>
              <div className="font-semibold text-white">Tray & Mini Window</div>
              <p className="text-slate-400 text-[11px]">
                The agent starts automatically in your Windows system tray. Double-click the shield tray icon or click "Open Mini Window" anytime.
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1.5">
              <div className="w-6 h-6 rounded-full bg-purple-600/30 text-purple-300 font-bold flex items-center justify-center text-xs">
                4
              </div>
              <div className="font-semibold text-white">Pair & Track</div>
              <p className="text-slate-400 text-[11px]">
                Click "Generate 6-Digit Pairing Code" to link your laptop. Once paired, click "Start Work Session" to track your workday.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* FOURTH ROW: Troubleshooting & Connection Help */}
      <Card className="border-slate-800 bg-slate-900/40 shadow-xl">
        <CardHeader>
          <CardTitle className="text-base text-white flex items-center gap-2">
            <HelpCircle className="w-4 h-4 text-purple-400" />
            Troubleshooting & Frequently Asked Questions
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-xs text-slate-300">
          <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80 space-y-1">
            <div className="font-semibold text-purple-300">Q: Why does the status show "Agent Not Connected"?</div>
            <p className="text-slate-400 text-[11px]">
              The agent loopback service communicates strictly over <code className="text-slate-200">http://127.0.0.1:48120</code>. If not running, ensure you have launched <code className="text-slate-200">NiyantranWin32Helper.exe</code> or run <code className="text-slate-200">node src/daemon.js</code> from the <code className="text-slate-200">employee-agent-v2</code> directory.
            </p>
          </div>

          <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80 space-y-1">
            <div className="font-semibold text-purple-300">Q: Can I use Phone / Mobile Mode instead?</div>
            <p className="text-slate-400 text-[11px]">
              Yes! If you are on an unmanaged personal device or mobile device where you cannot install desktop software, open the Work Session page and switch to <strong>Phone Mode</strong> for lightweight, browser-based activity tracking.
            </p>
          </div>

          <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80 space-y-1">
            <div className="font-semibold text-purple-300">Q: What data does the agent collect from my computer?</div>
            <p className="text-slate-400 text-[11px]">
              Under our strict Privacy Charter: <strong>Zero screenshots, zero keystroke text, zero window titles, and zero browser URLs</strong>. The agent only calculates aggregate active vs idle minutes and process categories (e.g. Development vs Communication).
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
