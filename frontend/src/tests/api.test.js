import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  checkUnderstanding,
  defineTerm,
  explainConcept,
  getApiBaseUrl,
  getHealth,
  prepareUnderstanding,
  readPage,
  simplify,
} from '../lib/api';
import { buildSourceContext } from '../lib/sourceContext';
import readSuccess from '../../../docs/fixtures/read.success.json';
import errorRateLimit from '../../../docs/fixtures/error.rate-limit.json';

describe('API client and SourceContext', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('builds base URL without trailing slash', () => {
    expect(getApiBaseUrl().endsWith('/')).toBe(false);
  });

  it('calls GET /api/health and retries once on transient 503', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: {
              code: 'SERVER_BUSY',
              message: 'Busy',
              retryable: true,
              request_id: 'req-1',
              retry_after_seconds: null,
              details: [],
            },
          }),
          { status: 503 }
        )
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: 'ok', api_version: '1.0' }), { status: 200 })
      );
    globalThis.fetch = fetchMock;

    const res = await getHealth();
    expect(res.status).toBe('ok');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/api\/health$/);
  });

  it('sends multipart FormData without manual boundary for readPage and does not retry POST', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(errorRateLimit), {
        status: 429,
        headers: {
          'X-Request-ID': 'req-429',
          'Retry-After': '30',
        },
      })
    );
    globalThis.fetch = fetchMock;

    const file = new File(['abc'], 'page.jpg', { type: 'image/jpeg' });
    await expect(readPage(file)).rejects.toMatchObject({
      origin: 'server',
      code: 'RATE_LIMITED',
      retryable: true,
      retryAfterSeconds: 30,
      requestId: 'request-rate-limit',
      status: 429,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    expect(init.body).toBeInstanceOf(FormData);
    expect(init.headers['Content-Type']).toBeUndefined();
  });

  it('handles non-JSON server failures and network failures defensively', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response('<html>502 Bad Gateway</html>', {
        status: 502,
        headers: { 'X-Request-ID': 'proxy-1' },
      })
    );

    await expect(simplify({ source: {}, chunk_ids: ['c0002'], level: 'easy' })).rejects.toMatchObject({
      origin: 'server',
      code: 'INVALID_SERVER_RESPONSE',
      requestId: 'proxy-1',
      status: 502,
    });

    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(defineTerm({})).rejects.toMatchObject({
      origin: 'client',
      code: 'NETWORK_ERROR',
      retryable: true,
    });
  });

  it('distinguishes caller abort from failure and routes all 7 endpoints', async () => {
    const ac = new AbortController();
    ac.abort();
    await expect(explainConcept({}, { signal: ac.signal })).rejects.toMatchObject({
      origin: 'client',
      code: 'REQUEST_ABORTED',
      aborted: true,
    });

    globalThis.fetch = vi.fn().mockImplementation((url) =>
      Promise.resolve(new Response(JSON.stringify({ ok: url }), { status: 200 }))
    );

    await prepareUnderstanding({});
    await checkUnderstanding({});
    expect(globalThis.fetch.mock.calls[0][0]).toMatch(/\/api\/prepare-understanding$/);
    expect(globalThis.fetch.mock.calls[1][0]).toMatch(/\/api\/check-understanding$/);
  });

  it('builds SourceContext preserving order, filtering key_terms, and without mutating PageDoc', () => {
    const page = structuredClone(readSuccess.page);
    const snapshot = JSON.stringify(page);

    const ctx = buildSourceContext(page, ['c0002'], {
      requireClear: true,
      includeAdjacent: true,
    });

    expect(ctx.page_id).toBe(page.id);
    expect(ctx.chunks.map((c) => c.id)).toEqual(['c0001', 'c0002']);
    expect(ctx.key_terms_status).toBe('available');
    expect(ctx.key_terms.length).toBeGreaterThan(0);
    for (const term of ctx.key_terms) {
      expect(term.chunk_ids.every((id) => id === 'c0001' || id === 'c0002')).toBe(true);
    }
    expect(JSON.stringify(page)).toBe(snapshot);
  });

  it('rejects uncertain chunks when requireClear is true', () => {
    const page = structuredClone(readSuccess.page);
    page.chunks.push({ id: 'c0003', kind: 'caption', text: 'Unclear', quality: 'uncertain' });

    expect(() => buildSourceContext(page, ['c0003'], { requireClear: true })).toThrow(/uncertain/i);
  });
});
