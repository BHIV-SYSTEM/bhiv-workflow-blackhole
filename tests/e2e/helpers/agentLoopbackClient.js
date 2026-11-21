/**
 * Niyantran Employee Monitoring V2 — E2E Desktop Agent Loopback Client
 * Communicates with the native Desktop Agent daemon strictly bound to 127.0.0.1:48120
 * for health probes, mini-window UI checks, and session lifecycle control.
 */

const config = require('../config');

class AgentLoopbackClient {
  /**
   * @param {string} [baseUrl] Base URL of the desktop agent daemon (default config.loopbackUrl)
   */
  constructor(baseUrl = config.loopbackUrl) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  /**
   * Perform an HTTP request to the local daemon.
   * @private
   */
  async _request(method, endpoint, body = null, timeoutMs = config.timeouts.shortTimeout) {
    const url = `${this.baseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
    const headers = { 'Accept': 'application/json, text/html, */*' };
    let reqBody = undefined;

    if (body !== null && method !== 'GET') {
      headers['Content-Type'] = 'application/json';
      reqBody = JSON.stringify(body);
    }

    const signal = AbortSignal.timeout(timeoutMs);
    try {
      const response = await fetch(url, {
        method,
        headers,
        body: reqBody,
        signal
      });

      const contentType = response.headers.get('content-type') || '';
      let data;
      if (contentType.includes('application/json')) {
        data = await response.json();
      } else {
        data = await response.text();
      }

      return {
        status: response.status,
        ok: response.ok,
        data,
        headers: Object.fromEntries(response.headers.entries())
      };
    } catch (err) {
      return {
        status: 0,
        ok: false,
        error: err.message,
        data: null
      };
    }
  }

  /**
   * Check if the desktop agent daemon is healthy and running.
   * @param {number} [timeoutMs=1500]
   * @returns {Promise<boolean>}
   */
  async isHealthy(timeoutMs = 1500) {
    const res = await this._request('GET', '/status', null, timeoutMs);
    if (res.ok) return true;
    const healthRes = await this._request('GET', '/health', null, timeoutMs);
    return healthRes.ok;
  }

  /**
   * Retrieve daemon status, agent version, device metadata, and active session state.
   * `GET /status` (or fallback `GET /health`)
   * @returns {Promise<{ ok: boolean, status: number, data: Object }>}
   */
  async getStatus() {
    const res = await this._request('GET', '/status');
    if (res.ok) return res;
    return this._request('GET', '/health');
  }

  /**
   * Fetch the standalone employee mini-window HTML page.
   * `GET /mini`
   * @returns {Promise<{ ok: boolean, status: number, data: string }>}
   */
  async getMini() {
    return this._request('GET', '/mini');
  }

  /**
   * Start a monitoring session via local daemon.
   * `POST /session/start`
   * @param {Object} payload
   * @param {string} payload.sessionId
   * @param {string} [payload.employeeId]
   */
  async startSession(payload) {
    return this._request('POST', '/session/start', payload);
  }

  /**
   * Pause the active monitoring session (e.g. employee break).
   * `POST /session/pause`
   * @param {Object} [payload]
   * @param {string} [payload.reason]
   */
  async pauseSession(payload = { reason: 'Break' }) {
    return this._request('POST', '/session/pause', payload);
  }

  /**
   * Resume the active monitoring session.
   * `POST /session/resume`
   */
  async resumeSession() {
    return this._request('POST', '/session/resume', {});
  }

  /**
   * End the monitoring session, halt metrics collection, and trigger final flush.
   * `POST /session/end`
   */
  async endSession() {
    return this._request('POST', '/session/end', {});
  }

  /**
   * Foreground or open the desktop agent mini window.
   * `POST /open`
   */
  async openAgent() {
    return this._request('POST', '/open', {});
  }
}

// Factory function
function createAgentLoopbackClient(baseUrl = config.loopbackUrl) {
  return new AgentLoopbackClient(baseUrl);
}

// Singleton instance
const agentLoopbackClient = new AgentLoopbackClient(config.loopbackUrl);

module.exports = {
  AgentLoopbackClient,
  createAgentLoopbackClient,
  agentLoopbackClient
};
