'use strict';

/**
 * HTTP client used by the main process.
 *
 * All network traffic happens here (not in the renderer) so the desktop app
 * never hits browser CORS rules and the JWT never lives in a web page.
 * No Electron dependency: this module is unit-testable with plain Node.
 */

const DEFAULT_TIMEOUT = 20000;

function normalizeBaseUrl(value) {
  let base = String(value || '').trim();
  if (!base) base = 'http://localhost:5000';
  if (!/^https?:\/\//i.test(base)) base = `http://${base}`;
  try {
    const url = new URL(base);
    return `${url.origin}${url.pathname === '/' ? '' : url.pathname.replace(/\/$/, '')}`;
  } catch (err) {
    return base.replace(/\/+$/, '');
  }
}

function joinUrl(baseUrl, apiPath) {
  const base = normalizeBaseUrl(baseUrl);
  const suffix = String(apiPath || '').startsWith('/') ? apiPath : `/${apiPath}`;
  return `${base}${suffix}`;
}

function buildQuery(query) {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    params.append(key, String(value));
  }
  const str = params.toString();
  return str ? `?${str}` : '';
}

function filenameFromDisposition(value) {
  if (!value) return null;
  const match = /filename="([^"]+)"/.exec(String(value)) || /filename=([^;]+)/.exec(String(value));
  return match ? match[1].trim() : null;
}

/**
 * Parse a fetch Response into a plain result object.
 *
 * With `binary: true` (CSV/XLSX exports, PDF documents) a successful body is
 * returned as base64 so the main process can save it to disk without ever
 * corrupting it through a text round-trip. Error bodies stay JSON.
 */
async function parseResponse(response, startedAt, binary) {
  const contentType = response.headers.get('content-type') || '';
  const contentDisposition = response.headers.get('content-disposition') || '';
  const ms = Date.now() - startedAt;
  const cookies = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : (response.headers.get('set-cookie') ? [response.headers.get('set-cookie')] : []);

  if (binary && response.ok) {
    let buffer = Buffer.alloc(0);
    try {
      buffer = Buffer.from(await response.arrayBuffer());
    } catch (err) {
      buffer = Buffer.alloc(0);
    }
    return {
      ok: true,
      status: response.status,
      contentType,
      data: {
        base64: buffer.toString('base64'),
        bytes: buffer.length,
        contentType,
        filename: filenameFromDisposition(contentDisposition)
      },
      ms,
      url: response.url,
      cookies
    };
  }

  let data = null;
  let raw = '';

  try {
    raw = await response.text();
  } catch (err) {
    raw = '';
  }

  if (raw) {
    if (contentType.includes('application/json') || /^[[{]/.test(raw.trim())) {
      try {
        data = JSON.parse(raw);
      } catch (err) {
        data = { message: raw.slice(0, 500) };
      }
    } else {
      data = { message: raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 400) };
    }
  }

  return {
    ok: response.ok,
    status: response.status,
    contentType,
    data,
    ms,
    url: response.url,
    cookies
  };
}

/**
 * Perform a request against the API.
 *
 * @param {object} options
 * @param {string} options.baseUrl        API origin, e.g. http://localhost:5000
 * @param {string} options.path           Path beginning with "/"
 * @param {string} [options.method]       HTTP verb
 * @param {string} [options.token]        JWT, sent as Bearer
 * @param {object} [options.query]        Query string parameters
 * @param {object} [options.body]         JSON body
 * @param {object} [options.form]         Multipart form: { fields, file }
 * @param {boolean} [options.binary]      Return the body as base64 (exports, PDFs)
 * @param {number} [options.timeout]
 */
async function request(options) {
  const {
    baseUrl,
    path: apiPath,
    method = 'GET',
    token,
    query,
    body,
    form,
    binary,
    headers: extraHeaders,
    timeout = DEFAULT_TIMEOUT
  } = options || {};

  const url = `${joinUrl(baseUrl, apiPath)}${buildQuery(query)}`;
  const headers = { Accept: binary ? '*/*' : 'application/json', ...(extraHeaders || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;

  let payload;
  if (form) {
    const formData = new FormData();
    for (const [key, value] of Object.entries(form.fields || {})) {
      if (value === undefined || value === null) continue;
      formData.append(key, String(value));
    }
    if (form.file && form.file.data) {
      const bytes = toBuffer(form.file.data);
      const blob = new Blob([bytes], { type: form.file.type || 'application/octet-stream' });
      formData.append(form.file.field || 'image', blob, form.file.name || 'upload.bin');
    }
    payload = formData;
  } else if (body !== undefined && body !== null) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  const startedAt = Date.now();
  try {
    const response = await fetch(url, {
      method,
      headers,
      body: payload,
      signal: AbortSignal.timeout(timeout)
    });
    const result = await parseResponse(response, startedAt, Boolean(binary));
    return result;
  } catch (err) {
    const ms = Date.now() - startedAt;
    const isTimeout = err && (err.name === 'TimeoutError' || err.name === 'AbortError');
    return {
      ok: false,
      status: 0,
      contentType: '',
      data: null,
      ms,
      url,
      error: isTimeout
        ? `The server did not answer within ${Math.round(timeout / 1000)}s.`
        : friendlyNetworkError(err)
    };
  }
}

function toBuffer(data) {
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof ArrayBuffer) return Buffer.from(data);
  if (ArrayBuffer.isView(data)) return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  if (Array.isArray(data)) return Buffer.from(data);
  if (data && typeof data === 'object' && data.type === 'Buffer' && Array.isArray(data.data)) {
    return Buffer.from(data.data);
  }
  return Buffer.from(String(data || ''));
}

function friendlyNetworkError(err) {
  const code = (err && (err.cause && err.cause.code)) || (err && err.code) || '';
  const message = (err && err.message) || 'Network error';
  if (code === 'ECONNREFUSED') {
    return 'Connection refused — the API server is not running on that address.';
  }
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
    return 'Host not found — check the API address in Settings.';
  }
  if (code === 'CERT_HAS_EXPIRED' || String(message).includes('certificate')) {
    return 'TLS certificate problem — check the API address.';
  }
  if (String(message).includes('fetch failed')) {
    return 'Could not reach the API server. Is it running and reachable? (ERR: ' + (code || 'network') + ')';
  }
  return message;
}

/** Extract a displayable message from an API error payload. */
function errorMessage(result) {
  if (!result) return 'Unknown error';
  if (result.error) return result.error;
  const data = result.data;
  if (data && typeof data === 'object') {
    // Backend validation shape: { code, message, details: [{ path, message }] }
    if (Array.isArray(data.details) && data.details.length) {
      const parts = data.details
        .map((detail) => {
          if (!detail) return '';
          if (typeof detail === 'string') return detail;
          const label = detail.path ? `${detail.path}: ` : '';
          return `${label}${detail.message || ''}`.trim();
        })
        .filter(Boolean);
      if (parts.length) {
        const base = typeof data.message === 'string' && data.message.trim()
          ? data.message.trim()
          : 'Request validation failed';
        return `${base} — ${parts.join(' · ')}`;
      }
    }
    const message = data.message;
    if (typeof message === 'string' && message.trim()) return message;
    if (message && typeof message === 'object') {
      const parts = Object.values(message).filter(Boolean);
      if (parts.length) return parts.join(' · ');
    }
    if (typeof data.error === 'string') return data.error;
  }
  if (result.status === 0) return 'Network error — server unreachable.';
  if (result.status === 401) return 'Session expired — please sign in again.';
  if (result.status === 402) return 'Upgrade required — this feature is not available on your plan.';
  if (result.status === 403) return 'Access denied.';
  if (result.status === 404) return 'Not found.';
  if (result.status === 422) return 'Request validation failed.';
  if (result.status === 429) return 'Too many requests — please wait and try again.';
  if (result.status >= 500) return `Server error (${result.status}).`;
  return `Request failed (${result.status}).`;
}

module.exports = {
  request,
  normalizeBaseUrl,
  joinUrl,
  buildQuery,
  errorMessage,
  toBuffer,
  filenameFromDisposition
};
