/**
 * V1 employee-agent detection (legacy compatibility wrapper).
 *
 * The single detection implementation lives in src/hooks/useAgentConnection.js.
 * No V2 loopback (48120) is contacted anywhere in the app.
 */

import { useAgentConnection } from '../../../../hooks/useAgentConnection';

export function useAgentDetection() {
  const agent = useAgentConnection();

  return {
    isAgentRunning: agent.isAgentConnected,
    agentStatus: {
      status: agent.isAgentConnected ? 'ok' : 'offline',
      version: agent.version,
      lastSeen: agent.lastSeen,
    },
    isChecking: agent.isChecking,
    lastChecked: agent.lastChecked,
    error: agent.isAgentConnected ? null : 'AGENT_NOT_CONNECTED',
    checkAgent: agent.checkAgent,
    openMiniWindow: agent.openAgent,
  };
}

export default useAgentDetection;
