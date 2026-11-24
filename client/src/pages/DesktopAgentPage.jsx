/**
 * NIYANTRAN EMPLOYEE MONITORING V2
 * Desktop Agent Download Page
 * Provides a permanent, visible entry for employees to download the Windows Desktop Agent.
 */

import React, { useState } from 'react';
import { downloadAgentInstaller, openInstaller } from '../services/agentInstallerDownload.js';
import { Button } from '../modules/employee-monitoring-v2/components/ui/Button.jsx';
import { Download } from 'lucide-react';
import PrivacyShieldBadge from '../modules/employee-monitoring-v2/components/common/PrivacyShieldBadge.jsx';
import { Card, CardHeader, CardTitle, CardContent } from '../modules/employee-monitoring-v2/components/ui/Card.jsx';

export const DesktopAgentPage = () => {
  const [status, setStatus] = useState(null); // null | 'downloading' | 'success' | 'error'
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
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <Download className="w-5 h-5" />
            Desktop Agent Download
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Download the Niyantran Windows Desktop Agent. The installer is signed, privacy‑enforced, and will register the secure telemetry protocol on your machine.
          </p>
          <div className="flex items-center gap-4">
            <Button
              variant="primary"
              size="md"
              icon={Download}
              onClick={handleDownload}
              disabled={status === 'downloading'}
            >
              {status === 'downloading' ? 'Downloading…' : 'Download Agent (.exe)'}
            </Button>
            {status === 'success' && (
              <span className="text-sm text-emerald-400">✅ Download started</span>
            )}
            {status === 'error' && (
              <span className="text-sm text-rose-400">❌ Download failed – check console</span>
            )}
          </div>
          <div className="mt-4">
            {/* Privacy badge – reinforces the 100% privacy guarantee */}
            <PrivacyShieldBadge />
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default DesktopAgentPage;
