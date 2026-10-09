/**
 * The rate limit on /api/lead (security pass, 10 Oct).
 *
 * Two promises to keep: a flood from one address is refused before it can write
 * a row, enrol a contact, send a confirmation email or a rescue email; and the
 * limiter can never cost a real visitor their lead by failing itself. Every
 * Blobs failure, and a slow answer, lets the post through.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

let store: Record<string, unknown> = {};
let mode: 'ok' | 'throw' | 'slow' = 'ok';
vi.mock('@netlify/blobs', () => ({
  getStore: vi.fn(() => ({
    get: async (key: string) => {
      if (mode === 'throw') throw new Error('blobs down');
      if (mode === 'slow') await new Promise((r) => setTimeout(r, 5000));
      return store[key] ?? null;
    },
    setJSON: async (key: string, value: unknown) => { store[key] = value; },
  })),
}));

import handler, { nextCount, withinRateLimit, LEAD_LIMIT, LEAD_WINDOW_MS, RATE_LIMIT_MESSAGE } from '../netlify/functions/lead.mts';

const UPSTREAM = 'https://script.google.com/macros/s/TEST/exec';
let urls: string[] = [];

beforeEach(() => {
  store = {};
  mode = 'ok';
  urls = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request) => {
    urls.push(String(url));
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  }));
  vi.stubGlobal('Netlify', {
    env: { get: (k: string) => ({ APPS_SCRIPT_WEBHOOK_URL: UPSTREAM, RESEND_API_KEY: 're_test' })[k] },
  });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const post = () => new Request('https://realdarrentsai.com/api/lead', {
  method: 'POST',
  headers: { 'content-type': 'application/json', origin: 'https://realdarrentsai.com' },
  body: JSON.stringify({ firstName: 'Jane', email: 'jane@gmail.com', phone: '7145550100', source: 'dscr' }),
});

describe('the window', () => {
  it('counts within fifteen minutes and starts again after', () => {
    const a = nextCount(null, 1000);
    expect(a).toEqual({ count: 1, windowStart: 1000 });
    expect(nextCount(a, 2000)).toEqual({ count: 2, windowStart: 1000 });
    expect(nextCount({ count: 50, windowStart: 1000 }, 1000 + LEAD_WINDOW_MS)).toEqual({ count: 1, windowStart: 1000 + LEAD_WINDOW_MS });
  });
});

describe('one address', () => {
  it(`is let through ${LEAD_LIMIT} times, then refused`, async () => {
    for (let i = 0; i < LEAD_LIMIT; i++) expect(await withinRateLimit('203.0.113.7')).toBe(true);
    expect(await withinRateLimit('203.0.113.7')).toBe(false);
    expect(await withinRateLimit('198.51.100.2')).toBe(true); // another address is unaffected
  });

  it('is stored hashed, never as the address itself', async () => {
    await withinRateLimit('203.0.113.7');
    expect(Object.keys(store).join(' ')).not.toContain('203.0.113.7');
  });
});

describe('fails open', () => {
  it('when Blobs throws', async () => {
    mode = 'throw';
    expect(await withinRateLimit('203.0.113.7')).toBe(true);
  });

  it('when Blobs is slower than the budget', async () => {
    mode = 'slow';
    const started = Date.now();
    expect(await withinRateLimit('203.0.113.7')).toBe(true);
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it('when Netlify gives no address', async () => {
    expect(await withinRateLimit(undefined)).toBe(true);
  });
});

describe('the endpoint', () => {
  const ctx = { ip: '203.0.113.9' } as never;

  it('forwards posts under the limit', async () => {
    const res = await handler(post(), ctx);
    expect(res.status).toBe(200);
    expect(urls).toContain(UPSTREAM);
  });

  it('refuses the one over it with a message the page shows, and forwards nothing, rescue email included', async () => {
    for (let i = 0; i < LEAD_LIMIT; i++) await handler(post(), ctx);
    urls = [];
    const res = await handler(post(), ctx);
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ field: 'rate', message: RATE_LIMIT_MESSAGE });
    expect(urls).toEqual([]);
  });
});
