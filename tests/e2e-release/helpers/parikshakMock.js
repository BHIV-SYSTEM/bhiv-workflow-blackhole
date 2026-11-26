import http from 'node:http';

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw.trim()) {
        resolve({ raw: '', json: null });
        return;
      }
      try {
        resolve({ raw, json: JSON.parse(raw) });
      } catch {
        resolve({ raw, json: null });
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

/**
 * Starts a local HTTP mock server implementing Parikshak's review, knowledge,
 * health, and test control endpoints on 127.0.0.1:<port>.
 */
export async function startParikshakMock(port = 0) {
  const state = {
    reviewMode: 'PASS',
    statusOverride: null,
    failReason: 'Needs fixes',
    requests: [],
  };

  const server = http.createServer(async (req, res) => {
    try {
      const parsedUrl = new URL(req.url || '/', 'http://127.0.0.1');
      const pathname = parsedUrl.pathname;
      const method = (req.method || 'GET').toUpperCase();

      // Control endpoints (not recorded in state.requests)
      if (method === 'GET' && pathname === '/__mock/requests') {
        const filterPath = parsedUrl.searchParams.get('path');
        const items = filterPath
          ? state.requests.filter((r) => r.path === filterPath || r.path.includes(filterPath))
          : state.requests;
        sendJson(res, 200, { count: items.length, requests: items });
        return;
      }

      if (method === 'POST' && pathname === '/__mock/reset') {
        state.requests = [];
        state.reviewMode = 'PASS';
        state.statusOverride = null;
        state.failReason = 'Needs fixes';
        sendJson(res, 200, { ok: true, mode: { reviewMode: state.reviewMode } });
        return;
      }

      if (method === 'POST' && pathname === '/__mock/mode') {
        const { json } = await readJsonBody(req);
        const body = json || {};
        if (body.reviewMode === 'PASS' || body.reviewMode === 'FAIL') {
          state.reviewMode = body.reviewMode;
        }
        if ('statusOverride' in body) {
          state.statusOverride = body.statusOverride ?? null;
        }
        if (typeof body.failReason === 'string' && body.failReason.length > 0) {
          state.failReason = body.failReason;
        }
        sendJson(res, 200, {
          ok: true,
          mode: {
            reviewMode: state.reviewMode,
            statusOverride: state.statusOverride,
            failReason: state.failReason,
          },
        });
        return;
      }

      // Parikshak service endpoints
      if (method === 'GET' && pathname === '/health') {
        sendJson(res, 200, { status: 'healthy' });
        return;
      }

      if (method === 'POST' && pathname === '/parikshak/review') {
        const { json, raw } = await readJsonBody(req);
        state.requests.push({
          method,
          path: pathname,
          headers: req.headers,
          body: json ?? raw,
          timestamp: new Date().toISOString(),
        });

        if (typeof state.statusOverride === 'number') {
          sendJson(res, state.statusOverride, {
            status: 'ERROR',
            result: 'ERROR',
            error: state.failReason || 'Mock status override',
          });
          return;
        }

        const isPass = state.reviewMode !== 'FAIL';
        const effectiveStatus =
          typeof state.statusOverride === 'string' && state.statusOverride
            ? state.statusOverride
            : isPass
              ? 'PASS'
              : 'FAIL';

        if (isPass) {
          sendJson(res, 200, {
            status: effectiveStatus,
            result: effectiveStatus,
            score: 90,
            review: 'Looks good',
            review_details: {
              done_well: 'Complete',
              missing_work: 'None',
              recommendations: 'Proceed',
              readiness: 'Production Ready',
            },
            next_task: 'Phase 2: Follow-up',
          });
        } else {
          sendJson(res, 200, {
            status: effectiveStatus,
            result: effectiveStatus,
            score: 35,
            review: state.failReason || 'Needs fixes',
            reason: state.failReason || 'Needs fixes',
            failure_reasons: [state.failReason || 'Missing tests'],
            improvement_hints: ['Add unit tests'],
            preflight_diagnostics: { repo_accessible: true },
            review_details: {
              done_well: 'Structure OK',
              missing_work: state.failReason || 'Tests missing',
              recommendations: 'Add tests',
              readiness: 'Requires Revisions',
            },
          });
        }
        return;
      }

      if (method === 'POST' && pathname === '/api/v1/knowledge/ingest') {
        const { json, raw } = await readJsonBody(req);
        state.requests.push({
          method,
          path: pathname,
          headers: req.headers,
          body: json ?? raw,
          timestamp: new Date().toISOString(),
        });
        sendJson(res, 200, { status: 'SUCCESS', message: 'Ingested' });
        return;
      }

      if (method === 'POST' && pathname === '/api/v1/knowledge/withdraw') {
        const { json, raw } = await readJsonBody(req);
        state.requests.push({
          method,
          path: pathname,
          headers: req.headers,
          body: json ?? raw,
          timestamp: new Date().toISOString(),
        });
        sendJson(res, 200, { status: 'SUCCESS', message: 'Withdrawn' });
        return;
      }

      if (method === 'GET' && pathname === '/api/v1/knowledge/products') {
        sendJson(res, 404, { error: 'Not found' });
        return;
      }

      sendJson(res, 404, { error: 'Not found' });
    } catch (err) {
      sendJson(res, 500, { error: err?.message || 'Mock server error' });
    }
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve());
  });

  const addr = server.address();
  const actualPort = typeof addr === 'object' && addr ? addr.port : port;
  const baseUrl = `http://127.0.0.1:${actualPort}`;

  let stopped = false;

  return {
    server,
    port: actualPort,
    url: baseUrl,
    getState() {
      return state;
    },
    async stop() {
      if (stopped) return;
      stopped = true;
      await new Promise((resolve) => {
        server.close(() => resolve());
      });
    },
  };
}
