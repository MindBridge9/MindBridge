import { validateResponse } from './validateResponse';
const DEFAULT_BASE_URL = 'http://127.0.0.1:8000';

const DEADLINES_MS = {
  health: 5000,
  read: 90000,
  text: 45000,
};

export function getApiBaseUrl() {
  const configured =
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL) ||
    DEFAULT_BASE_URL;
  return String(configured).replace(/\/+$/, '');
}

export function createNormalizedError({
  origin = 'client',
  code = 'INTERNAL_ERROR',
  message = 'Something went wrong. Please try again.',
  retryable = false,
  requestId = null,
  retryAfterSeconds = null,
  details = [],
  status = null,
  aborted = false,
} = {}) {
  return {
    origin,
    code,
    message,
    retryable,
    requestId,
    retryAfterSeconds,
    details,
    status,
    aborted,
  };
}

function parseRetryAfter(headerValue) {
  if (!headerValue) return null;
  const trimmed = String(headerValue).trim();
  if (/^\d+$/.test(trimmed)) {
    const parsed = Number.parseInt(trimmed, 10);
    return parsed > 0 ? parsed : null;
  }
  const retryAt = Date.parse(trimmed);
  if (Number.isFinite(retryAt)) return Math.max(0, Math.ceil((retryAt - Date.now()) / 1000));
  return null;
}

async function parseErrorResponse(response) {
  const headerRequestId = response.headers?.get?.('X-Request-ID') || null;
  const headerRetryAfter = parseRetryAfter(response.headers?.get?.('Retry-After'));

  let body = null;
  try {
    const text = await response.text();
    if (text) {
      body = JSON.parse(text);
    }
  } catch {
    body = null;
  }

  if (body && typeof body === 'object' && body.error && typeof body.error === 'object') {
    const err = body.error;
    return createNormalizedError({
      origin: 'server',
      code: typeof err.code === 'string' ? err.code : 'INTERNAL_ERROR',
      message:
        typeof err.message === 'string' && err.message.trim()
          ? err.message
          : 'The server returned an error.',
      retryable: typeof err.retryable === 'boolean' ? err.retryable : response.status >= 500,
      requestId: err.request_id || headerRequestId,
      retryAfterSeconds:
        typeof err.retry_after_seconds === 'number'
          ? err.retry_after_seconds
          : headerRetryAfter,
      details: Array.isArray(err.details) ? err.details : [],
      status: response.status,
      aborted: false,
    });
  }

  return createNormalizedError({
    origin: 'server',
    code: response.status === 404 ? 'NOT_FOUND' : 'INVALID_SERVER_RESPONSE',
    message:
      response.status >= 500
        ? 'The server encountered an unexpected problem. Please try again.'
        : `Request failed with status ${response.status}.`,
    retryable: response.status >= 500,
    requestId: headerRequestId,
    retryAfterSeconds: headerRetryAfter,
    details: [],
    status: response.status,
    aborted: false,
  });
}

async function requestJsonOrMultipart(
  path,
  { method = 'GET', body = undefined, headers = {}, timeoutMs = DEADLINES_MS.text, signal } = {}
) {
  const controller = new AbortController();
  let timedOut = false;
  let callerAborted = false;

  const onCallerAbort = () => {
    callerAborted = true;
    controller.abort();
  };

  if (signal) {
    if (signal.aborted) {
      throw createNormalizedError({
        origin: 'client',
        code: 'REQUEST_ABORTED',
        message: 'Request cancelled.',
        retryable: false,
        aborted: true,
      });
    }
    signal.addEventListener('abort', onCallerAbort, { once: true });
  }

  const timerId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(`${getApiBaseUrl()}${path}`, {
      method,
      headers,
      body,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw await parseErrorResponse(response);
    }

    const text = await response.text();
    try {
      const data = JSON.parse(text);
      const kind = { '/api/health': 'HealthResponse', '/api/read': 'ReadResult', '/api/simplify': 'SimplificationResult', '/api/define': 'GlossaryEntry', '/api/explain': 'ConceptExplanation', '/api/prepare-understanding': 'LearningPlan', '/api/check-understanding': 'EvaluationResult' }[path];
      return validateResponse(kind, data, typeof body === 'string' ? JSON.parse(body) : null);
    } catch (err) {
      if (err?.code) throw err;
      throw createNormalizedError({
        origin: 'server',
        code: 'INVALID_SERVER_RESPONSE',
        message: 'The server returned an unreadable response.',
        retryable: true,
        requestId: response.headers?.get?.('X-Request-ID') || null,
        status: response.status,
      });
    }
  } catch (err) {
    if (err && typeof err === 'object' && 'origin' in err && 'code' in err) {
      throw err;
    }
    if (callerAborted) {
      throw createNormalizedError({
        origin: 'client',
        code: 'REQUEST_ABORTED',
        message: 'Request cancelled.',
        retryable: false,
        aborted: true,
      });
    }
    if (timedOut || (err && err.name === 'AbortError')) {
      throw createNormalizedError({
        origin: 'client',
        code: 'AI_TIMEOUT',
        message: 'The request took too long and timed out. Your work is safe—please try again.',
        retryable: true,
      });
    }
    throw createNormalizedError({
      origin: 'client',
      code: 'NETWORK_ERROR',
      message: 'Could not reach the MindBridge server. Check your connection and try again.',
      retryable: true,
    });
  } finally {
    clearTimeout(timerId);
    if (signal) {
      signal.removeEventListener('abort', onCallerAbort);
    }
  }
}

export async function getHealth({ signal } = {}) {
  try {
    return await requestJsonOrMultipart('/api/health', {
      method: 'GET',
      timeoutMs: DEADLINES_MS.health,
      signal,
    });
  } catch (err) {
    if (err?.aborted) throw err;
    // Health checks may retry once on transient failure (API_CONTRACT.md)
    if (err?.retryable) {
      return requestJsonOrMultipart('/api/health', {
        method: 'GET',
        timeoutMs: DEADLINES_MS.health,
        signal,
      });
    }
    throw err;
  }
}

export async function readPage(file, { signal } = {}) {
  const formData = new FormData();
  formData.append('image', file);
  // Do not set Content-Type manually for multipart/form-data
  return requestJsonOrMultipart('/api/read', {
    method: 'POST',
    body: formData,
    timeoutMs: DEADLINES_MS.read,
    signal,
  });
}

function postJson(path, payload, { signal } = {}) {
  return requestJsonOrMultipart(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    timeoutMs: DEADLINES_MS.text,
    signal,
  });
}

export function simplify(request, { signal } = {}) {
  return postJson('/api/simplify', request, { signal });
}

export function defineTerm(request, { signal } = {}) {
  return postJson('/api/define', request, { signal });
}

export function explainConcept(request, { signal } = {}) {
  return postJson('/api/explain', request, { signal });
}

export function prepareUnderstanding(request, { signal } = {}) {
  return postJson('/api/prepare-understanding', request, { signal });
}

export function checkUnderstanding(request, { signal } = {}) {
  return postJson('/api/check-understanding', request, { signal });
}
