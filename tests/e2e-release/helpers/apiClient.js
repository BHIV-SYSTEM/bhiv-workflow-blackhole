function normalizeUrl(baseUrl, path) {
  const cleanBase = baseUrl.replace(/\/$/, '');
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${cleanBase}${cleanPath}`;
}

export async function apiRequest(
  baseUrl,
  path,
  { method = 'GET', token = null, body = undefined, headers = {}, timeoutMs = 15000 } = {}
) {
  const url = normalizeUrl(baseUrl, path);
  const reqHeaders = { ...headers };

  if (token) {
    reqHeaders['x-auth-token'] = token;
    if (!reqHeaders.Authorization && !reqHeaders.authorization) {
      reqHeaders.Authorization = `Bearer ${token}`;
    }
  }

  let payload = undefined;
  if (body !== undefined) {
    if (typeof body === 'string' || body instanceof FormData) {
      payload = body;
    } else {
      reqHeaders['Content-Type'] = reqHeaders['Content-Type'] || 'application/json';
      payload = JSON.stringify(body);
    }
  }

  const response = await fetch(url, {
    method,
    headers: reqHeaders,
    body: payload,
    signal: AbortSignal.timeout(timeoutMs),
  });

  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  return {
    status: response.status,
    ok: response.ok,
    headers: Object.fromEntries(response.headers.entries()),
    data,
    text,
  };
}

export async function loginApi(baseUrl, email, password) {
  const res = await apiRequest(baseUrl, '/api/auth/login', {
    method: 'POST',
    body: { email, password },
  });

  return {
    ...res,
    token: res.data?.token || null,
    user: res.data?.user || null,
  };
}

export async function getMockRequests(parikshakUrl, filterPath = '') {
  const query = filterPath ? `?path=${encodeURIComponent(filterPath)}` : '';
  const res = await apiRequest(parikshakUrl, `/__mock/requests${query}`);
  return res.data?.requests || [];
}

export async function resetMock(parikshakUrl) {
  return apiRequest(parikshakUrl, '/__mock/reset', { method: 'POST', body: {} });
}

export async function setMockMode(parikshakUrl, modePayload) {
  return apiRequest(parikshakUrl, '/__mock/mode', {
    method: 'POST',
    body: modePayload,
  });
}
