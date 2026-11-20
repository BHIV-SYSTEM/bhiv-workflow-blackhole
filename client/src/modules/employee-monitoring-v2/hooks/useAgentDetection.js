/**
 * NIYANTRAN EMPLOYEE MONITORING V2
 * Windows Desktop Agent Detection & Health Hook
 *
 * Detects presence of native Desktop Agent running on local loopback (127.0.0.1:48120).
 * Queries /status to verify DPAPI encryption, live Win32 tracking, and lease health.
 */

import { useState, useEffect, useCallback, useRef } from 'react';

const LOCAL_AGENT_URL = 'http://127.0.0.1:48120';
const POLL_INTERVAL_MS = 4000;

export function useAgentDetection() {
  const [isAgentRunning, setIsAgentRunning] = useState(false);
  const [agentStatus, setAgentStatus] = useState(null);
  const [isChecking, setIsChecking] = useState(true);
  const [lastChecked, setLastChecked] = useState(null);
  const [error, setError] = useState(null);

  const isMounted = useRef(true);

  const checkAgent = useCallback(async () => {
    setIsChecking(true);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1500);

    try {
      const response = await fetch(`${LOCAL_AGENT_URL}/status`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        if (isMounted.current) {
          setIsAgentRunning(true);
          setAgentStatus(data);
          setError(null);
          setLastChecked(new Date());
        }
      } else {
        if (isMounted.current) {
          setIsAgentRunning(false);
          setAgentStatus(null);
          setError(`HTTP_${response.status}`);
          setLastChecked(new Date());
        }
      }
    } catch (err) {
      clearTimeout(timeoutId);
      if (isMounted.current) {
        setIsAgentRunning(false);
        setAgentStatus(null);
        setError(err.name === 'AbortError' ? 'AGENT_TIMEOUT' : 'AGENT_OFFLINE');
        setLastChecked(new Date());
      }
    } finally {
      if (isMounted.current) {
        setIsChecking(false);
      }
    }
  }, []);

  useEffect(() => {
    isMounted.current = true;
    checkAgent();

    const interval = setInterval(checkAgent, POLL_INTERVAL_MS);
    return () => {
      isMounted.current = false;
      clearInterval(interval);
    };
  }, [checkAgent]);

  const openMiniWindow = useCallback(() => {
    const width = 420;
    const height = 580;
    const left = window.screen.width - width - 40;
    const top = 60;
    const features = `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=no,status=no`;

    // Try loopback mini window first, fallback to web mini-window
    try {
      const miniWin = window.open(`${LOCAL_AGENT_URL}/mini`, 'NiyantranMini', features);
      if (!miniWin || miniWin.closed || typeof miniWin.closed === 'undefined') {
        window.open('/monitoring-v2/mini-window', 'NiyantranMini', features);
      }
    } catch {
      window.open('/monitoring-v2/mini-window', 'NiyantranMini', features);
    }
  }, []);

  return {
    isAgentRunning,
    agentStatus,
    isChecking,
    lastChecked,
    error,
    checkAgent,
    openMiniWindow,
  };
}

export default useAgentDetection;
