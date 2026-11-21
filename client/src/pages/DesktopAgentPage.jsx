import React, { useState } from 'react';
import { downloadAgentInstaller, openInstaller } from '../services/agentInstallerDownload.js';
import { Download, CheckCircle2, AlertCircle } from 'lucide-react';

export const DesktopAgentPage = () => {
  const [status, setStatus] = useState(null);
  const [installerUrl, setInstallerUrl] = useState(null);

  const handleDownload = async () => {
    setStatus('downloading');
    try {
      const res = await downloadAgentInstaller('exe');
      setInstallerUrl(res.url);
      setStatus('success');
    } catch (err) {
      console.error('Agent download failed:', err);
      setStatus('error');
    }
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto p-4">
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6 space-y-4">
        <div className="flex items-center gap-2 text-xl font-bold text-white">
          <Download className="w-5 h-5" />
          Desktop Agent Download
        </div>
        <p className="text-sm text-zinc-400">
          Download the Niyantran Windows Desktop Agent. The installer is privacy-enforced and will register the secure telemetry protocol on your machine.
        </p>
        <div className="flex items-center gap-4 flex-wrap">
          <button
            type="button"
            onClick={handleDownload}
            disabled={status === 'downloading'}
            className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-500 disabled:opacity-50"
          >
            {status === 'downloading' ? 'Downloading...' : 'Download Agent (.exe)'}
          </button>
          {status === 'success' && <span className="text-sm text-emerald-400 flex items-center gap-1"><CheckCircle2 className="w-4 h-4" /> Download started</span>}
          {status === 'error' && <span className="text-sm text-rose-400 flex items-center gap-1"><AlertCircle className="w-4 h-4" /> Download failed — check console</span>}
        </div>
        {status === 'success' && installerUrl && (
          <div className="flex items-center gap-3 flex-wrap">
            <button
              type="button"
              onClick={() => openInstaller(installerUrl)}
              className="px-4 py-2 rounded-lg bg-zinc-700 text-white text-sm font-semibold hover:bg-zinc-600"
            >
              Open Installer
            </button>
            <span className="text-xs text-zinc-400">If nothing opens, run the installer from your Downloads folder.</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default DesktopAgentPage;
