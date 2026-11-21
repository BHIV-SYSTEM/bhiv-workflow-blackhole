/**
 * Niyantran Employee Monitoring V2 — E2E Socket.io Client Helper
 * Real-time event listener, room subscription, and promise-based event assertions
 * using socket.io-client from client/node_modules/socket.io-client.
 */

const path = require('node:path');
const config = require('../config');

// Resolve socket.io-client from client subsystem
let ioClient;
try {
  const socketModule = require(path.resolve(config.paths.client, 'node_modules/socket.io-client'));
  ioClient = socketModule.io || socketModule;
} catch {
  try {
    const socketModule = require('socket.io-client');
    ioClient = socketModule.io || socketModule;
  } catch (err) {
    throw new Error(`Unable to resolve socket.io-client from ${config.paths.client}/node_modules/socket.io-client: ${err.message}`);
  }
}

class SocketClient {
  /**
   * @param {Object} [options]
   * @param {string} [options.url] Socket server URL (default config.backendUrl)
   * @param {string} [options.token] Optional JWT token for authentication
   * @param {string} [options.path] Socket path (default '/socket.io')
   * @param {boolean} [options.autoConnect] Connect immediately on construction (default false)
   */
  constructor(options = {}) {
    this.url = options.url || config.backendUrl;
    this.token = options.token || null;
    this.path = options.path || '/socket.io';
    this.socket = null;
    this.connected = false;

    if (options.autoConnect) {
      this.connect();
    }
  }

  /**
   * Establish connection to Socket.io server.
   * @param {number} [timeoutMs] Connection timeout in ms
   * @returns {Promise<SocketClient>}
   */
  async connect(timeoutMs = config.timeouts.socketTimeout) {
    if (this.socket && this.socket.connected) {
      return this;
    }

    const socketOptions = {
      path: this.path,
      transports: ['websocket', 'polling'],
      reconnection: false,
      timeout: timeoutMs
    };

    if (this.token) {
      socketOptions.auth = { token: this.token };
      socketOptions.extraHeaders = {
        'x-auth-token': this.token,
        'Authorization': `Bearer ${this.token}`
      };
    }

    this.socket = ioClient(this.url, socketOptions);

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.socket) {
          this.socket.disconnect();
        }
        reject(new Error(`Socket connection to ${this.url} timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.socket.on('connect', () => {
        clearTimeout(timer);
        this.connected = true;
        resolve(this);
      });

      this.socket.on('connect_error', (err) => {
        clearTimeout(timer);
        this.connected = false;
        reject(new Error(`Socket connection error to ${this.url}: ${err.message}`));
      });

      this.socket.on('disconnect', () => {
        this.connected = false;
      });
    });
  }

  /**
   * Join a specific room (e.g., 'user_<id>' or 'admin_room').
   * @param {string} roomName
   */
  joinRoom(roomName) {
    if (!this.socket) {
      throw new Error('Socket not initialized. Call connect() first.');
    }
    this.socket.emit('join', roomName);
    this.socket.emit('join_room', roomName);
    return this;
  }

  /**
   * Emit an event to the server.
   * @param {string} eventName
   * @param {any} data
   */
  emit(eventName, data) {
    if (!this.socket) {
      throw new Error('Socket not initialized. Call connect() first.');
    }
    this.socket.emit(eventName, data);
    return this;
  }

  /**
   * Wait for a specific event to be received by the client.
   * @param {string} eventName Event to wait for
   * @param {number} [timeoutMs] Timeout in ms (defaults to config.timeouts.socketTimeout)
   * @param {Function} [predicate] Optional filter function `(payload) => boolean`
   * @returns {Promise<any>} Resolves with payload when received
   */
  waitForEvent(eventName, timeoutMs = config.timeouts.socketTimeout, predicate = null) {
    if (!this.socket) {
      return Promise.reject(new Error('Socket not initialized. Call connect() first.'));
    }

    return new Promise((resolve, reject) => {
      let timer = null;

      const handler = (payload) => {
        if (!predicate || predicate(payload)) {
          clearTimeout(timer);
          this.socket.off(eventName, handler);
          resolve(payload);
        }
      };

      timer = setTimeout(() => {
        this.socket.off(eventName, handler);
        reject(new Error(`Timed out waiting for socket event '${eventName}' after ${timeoutMs}ms`));
      }, timeoutMs);

      this.socket.on(eventName, handler);
    });
  }

  /**
   * Collect all occurrences of an event during a given time window.
   * @param {string} eventName
   * @param {number} [durationMs=2000]
   * @returns {Promise<any[]>}
   */
  async collectEvents(eventName, durationMs = 2000) {
    if (!this.socket) {
      throw new Error('Socket not initialized. Call connect() first.');
    }

    const collected = [];
    const handler = (payload) => {
      collected.push(payload);
    };

    this.socket.on(eventName, handler);

    await new Promise((res) => setTimeout(res, durationMs));
    this.socket.off(eventName, handler);
    return collected;
  }

  /**
   * Disconnect cleanly.
   */
  disconnect() {
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }
    this.connected = false;
  }

  /**
   * Return true if connected.
   */
  isConnected() {
    return Boolean(this.socket && this.socket.connected);
  }
}

// Factory function
function createSocketClient(options = {}) {
  return new SocketClient(options);
}

module.exports = {
  SocketClient,
  createSocketClient
};
