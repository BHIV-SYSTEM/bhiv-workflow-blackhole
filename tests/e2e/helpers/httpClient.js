/**
 * Niyantran Employee Monitoring V2 — E2E HTTP REST Client
 * Built on Node 24 native fetch with automatic dual auth headers,
 * JSON/binary parsing, configurable timeouts, and error handling.
 */

const config = require('../config');

class HttpClient {
  /**
   * @param {string} [baseUrl] Default base URL for requests (defaults to config.backendUrl)
   * @param {Object} [defaultHeaders] Additional default headers
   */
  constructor(baseUrl = config.backendUrl, defaultHeaders = {}) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.defaultHeaders = {
      'Accept': 'application/json',
      ...defaultHeaders
    };
    this.authToken = null;
  }

  /**
   * Set the default JWT authentication token for all subsequent requests.
   * Attaches both `x-auth-token` and `Authorization: Bearer <token>` headers.
   * @param {string|null} token
   * @returns {HttpClient}
   */
  setAuthToken(token) {
    this.authToken = token || null;
    return this;
  }

  /**
   * Clear the default JWT authentication token.
   * @returns {HttpClient}
   */
  clearAuthToken() {
    this.authToken = null;
    return this;
  }

  /**
   * Build the complete request URL with optional query parameters.
   * @param {string} path Path or absolute URL
   * @param {Object} [query] Query parameters object
   * @returns {string}
   */
  resolveUrl(path, query = null) {
    let resolvedUrl;
    if (path.startsWith('http://') || path.startsWith('https://')) {
      resolvedUrl = new URL(path);
    } else {
      const cleanPath = path.startsWith('/') ? path : `/${path}`;
      resolvedUrl = new URL(`${this.baseUrl}${cleanPath}`);
    }

    if (query && typeof query === 'object') {
      for (const [key, val] of Object.entries(query)) {
        if (val !== undefined && val !== null) {
          resolvedUrl.searchParams.append(key, String(val));
        }
      }
    }

    return resolvedUrl.toString();
  }

  /**
   * Execute an HTTP request using Node 24 native fetch.
   * @param {string} method HTTP method (GET, POST, PUT, DELETE, PATCH, etc.)
   * @param {string} path Endpoint path or full URL
   * @param {any} [body] Request body (object, string, Buffer)
   * @param {Object} [options] Request options (headers, query, token, timeout, responseType, throwOnError)
   * @returns {Promise<{ status: number, ok: boolean, headers: Object, data: any, rawText: string, buffer: Buffer|null, durationMs: number }>}
   */
  async request(method, path, body = null, options = {}) {
    const url = this.resolveUrl(path, options.query || options.params);
    const headers = { ...this.defaultHeaders, ...(options.headers || {}) };

    // Resolve auth token
    const token = options.token !== undefined ? options.token : this.authToken;
    if (token) {
      if (!headers['x-auth-token']) {
        headers['x-auth-token'] = token;
      }
      if (!headers['Authorization'] && !headers['authorization']) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    }

    // Body preparation & Content-Type detection
    let reqBody = body;
    if (body !== null && body !== undefined && method !== 'GET' && method !== 'HEAD') {
      if (typeof body === 'object' && !(body instanceof Buffer) && !(body instanceof Uint8Array)) {
        if (!headers['Content-Type'] && !headers['content-type']) {
          headers['Content-Type'] = 'application/json';
        }
        reqBody = JSON.stringify(body);
      }
    } else if (method === 'GET' || method === 'HEAD') {
      reqBody = undefined;
    }

    const timeoutMs = options.timeout || config.timeouts.defaultTimeout;
    const signal = AbortSignal.timeout(timeoutMs);

    const startTime = Date.now();
    let response;
    try {
      response = await fetch(url, {
        method: method.toUpperCase(),
        headers,
        body: reqBody,
        signal
      });
    } catch (err) {
      const durationMs = Date.now() - startTime;
      const error = new Error(`HTTP ${method} ${url} failed after ${durationMs}ms: ${err.message}`);
      error.cause = err;
      error.url = url;
      error.method = method;
      error.durationMs = durationMs;
      throw error;
    }

    const durationMs = Date.now() - startTime;
    const status = response.status;
    const ok = response.ok;

    // Convert Headers to plain object
    const resHeaders = {};
    for (const [k, v] of response.headers.entries()) {
      resHeaders[k.toLowerCase()] = v;
    }

    let data = null;
    let rawText = '';
    let buffer = null;

    if (options.responseType === 'arrayBuffer' || options.responseType === 'buffer') {
      const arrayBuffer = await response.arrayBuffer();
      buffer = Buffer.from(arrayBuffer);
      data = buffer;
    } else {
      rawText = await response.text();
      const contentType = resHeaders['content-type'] || '';
      if (rawText && (contentType.includes('application/json') || rawText.trim().startsWith('{') || rawText.trim().startsWith('['))) {
        try {
          data = JSON.parse(rawText);
        } catch {
          data = null;
        }
      } else {
        data = rawText;
      }
    }

    const result = {
      status,
      statusText: response.statusText,
      ok,
      headers: resHeaders,
      data,
      rawText,
      buffer,
      durationMs,
      url
    };

    if (options.throwOnError && !ok) {
      const errMsg = typeof data === 'object' && data?.error ? data.error : (typeof data === 'object' && data?.message ? data.message : rawText);
      const httpError = new Error(`HTTP ${status} ${response.statusText} on ${method} ${url}: ${errMsg}`);
      httpError.response = result;
      httpError.status = status;
      throw httpError;
    }

    return result;
  }

  /**
   * Perform GET request.
   * @param {string} path
   * @param {Object} [options]
   */
  async get(path, options = {}) {
    return this.request('GET', path, null, options);
  }

  /**
   * Perform POST request.
   * @param {string} path
   * @param {any} [body]
   * @param {Object} [options]
   */
  async post(path, body = null, options = {}) {
    return this.request('POST', path, body, options);
  }

  /**
   * Perform PUT request.
   * @param {string} path
   * @param {any} [body]
   * @param {Object} [options]
   */
  async put(path, body = null, options = {}) {
    return this.request('PUT', path, body, options);
  }

  /**
   * Perform PATCH request.
   * @param {string} path
   * @param {any} [body]
   * @param {Object} [options]
   */
  async patch(path, body = null, options = {}) {
    return this.request('PATCH', path, body, options);
  }

  /**
   * Perform DELETE request.
   * @param {string} path
   * @param {Object} [options]
   */
  async delete(path, options = {}) {
    return this.request('DELETE', path, null, options);
  }
}

// Factory function
function createHttpClient(baseUrl = config.backendUrl, defaultHeaders = {}) {
  return new HttpClient(baseUrl, defaultHeaders);
}

// Singleton instance pointing to backend
const httpClient = new HttpClient(config.backendUrl);

module.exports = {
  HttpClient,
  createHttpClient,
  httpClient
};
