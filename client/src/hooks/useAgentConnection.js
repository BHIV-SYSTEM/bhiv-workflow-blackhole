import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';

const LOCAL_AGENT_STATUS_URL = 'http://127.0.0.1:48121/status';
const POLL_INTERVAL_MS = 5000;
const LOCAL_TIMEOUT_MS = 1500;

async function readLocalAgent() {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), LOCAL_TIMEOUT_MS);

  try {
    const response = await fetch(LOCAL_AGENT_STATUS_URL, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });

    if (!response.ok) return null;

    const data = await response.json().catch(() => null);
    if (!data || data.status !== 'ok') return null;

    // The V1 agent exposes `loggedIn`. A running-but-logged-out agent must
    // not count as connected, so the download/sign-in actions come back.
    return {
      running: true,
      // Require an explicit signed-in state. A status server can stay up after
      // logout, so anything other than `true` must be treated as disconnected.
      loggedIn: data.loggedIn === true,
      version: data.version || null,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Single source of truth for V1 employee-agent presence in the web app.
 *
 * - Local loopback confirms the agent is running on this laptop and signed in.
 * - Server heartbeat confirms the agent is connected for this account when the
 *   web app is opened from another device.
 */
export function useAgentConnection() {
  const [state, setState] = useState({
    isChecking: true,
    isAgentRunning: false,
    isAgentConnected: false,
    installed: false,
    online: false,
    version: null,
    lastSeen: null,
    lastChecked: null,
  });
  const isMounted = useRef(true);

  const checkAgent = useCallback(async (opts) => {
    const silent = Boolean(opts && opts.silent === true);
    if (!silent && isMounted.current) {
      setState((prev) => ({ ...prev, isChecking: true }));
    }

    const local = await readLocalAgent();

    let remote = null;
    try {
      remote = await api.agent.status();
    } catch {
      // The server check may fail when the user is logged out of the web app.
    }

    const localConnected = Boolean(local && local.loggedIn);
    const remoteOnline = Boolean(remote && remote.online);
    const connected = localConnected || remoteOnline;

    const next = {
      isChecking: false,
      isAgentRunning: Boolean(local),
      isAgentConnected: connected,
      installed: Boolean((remote && remote.installed) || local),
      online: connected,
      version: (remote && remote.version) || (local && local.version) || null,
      lastSeen: (remote && remote.lastSeen) || null,
      lastChecked: new Date(),
    };

    if (isMounted.current) setState(next);
    return next;
  }, []);

  useEffect(() => {
    isMounted.current = true;
    checkAgent();

    const intervalId = setInterval(() => checkAgent({ silent: true }), POLL_INTERVAL_MS);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') checkAgent({ silent: true });
    };

    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      isMounted.current = false;
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [checkAgent]);

  const openAgent = useCallback(() => {
    window.location.href = 'niyantran://open';
  }, []);

  return { ...state, checkAgent, openAgent };
}

export default useAgentConnection;
