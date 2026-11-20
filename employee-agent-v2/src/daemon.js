/**
 * NIYANTRAN EMPLOYEE MONITORING V2
 * Desktop Agent Daemon Service
 * 
 * Runs as a persistent background service:
 * - Initializes Windows DPAPI vault credentials
 * - Launches native Win32 system tray
 * - Serves local loopback API on http://127.0.0.1:48120
 * - Serves Mini Desktop Window at http://127.0.0.1:48120/mini
 */

import { NiyantranMonitoringAgentV2 } from './agent.js';
import { AGENT_CONFIG } from './config.js';

const agent = new NiyantranMonitoringAgentV2({
  localServerPort: 48120,
  enableLocalServer: true,
  apiBaseUrl: process.env.API_BASE_URL || AGENT_CONFIG.API_BASE_URL,
});

async function main() {
  console.log('[Agent Daemon] Starting Niyantran Monitoring Agent V2 Daemon...');
  const init = await agent.initialize();
  console.log('[Agent Daemon] Initialized with state:', init.state);
  console.log('[Agent Daemon] Loopback server listening at http://127.0.0.1:48120');

  // Prevent process from exiting
  process.on('SIGINT', async () => {
    console.log('[Agent Daemon] Stopping agent daemon...');
    agent.shutdown();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('[Agent Daemon] Startup error:', err);
  process.exit(1);
});
