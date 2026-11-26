/**
 * V1 employee-agent status page (legacy route compatibility).
 * Workday device handover lives on the employee dashboard.
 */

import React from 'react';
import { useAgentDetection } from '../hooks/useAgentDetection.js';
import { Monitor, RefreshCw } from 'lucide-react';

export const MiniWindowPage = () => {
  const { isAgentRunning, agentStatus, isChecking, checkAgent, openMiniWindow } = useAgentDetection();

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Monitor className="h-5 w-5" /> Desktop Agent
          </h1>
          <p className="text-sm text-muted-foreground">
            The V1 Niyantran Workflow Agent is the only supported desktop agent.
          </p>
        </div>
        <button
          type="button"
          onClick={checkAgent}
          disabled={isChecking}
          className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
        >
          <RefreshCw className={`h-4 w-4 ${isChecking ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      <div className="rounded-lg border p-4 text-sm">
        <p>
          Status:{' '}
          <strong className={isAgentRunning ? 'text-emerald-600' : 'text-amber-600'}>
            {isAgentRunning ? 'Running' : 'Not running'}
          </strong>
        </p>
        {agentStatus?.version && <p>Version: {agentStatus.version}</p>}
        {isAgentRunning ? (
          <p className="mt-2 text-muted-foreground">
            Use the Switch Device card on your dashboard to hand today&apos;s workday between this laptop and your phone.
          </p>
        ) : (
          <button type="button" onClick={openMiniWindow} className="mt-3 rounded-md bg-primary px-3 py-2 text-primary-foreground">
            Open Agent
          </button>
        )}
      </div>
    </div>
  );
};

export default MiniWindowPage;
