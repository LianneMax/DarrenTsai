/**
 * Tests for netlify/functions/rates.mts.
 *
 * These numbers are decision-shaped: a visitor compares loan options against
 * them and a licensed loan officer's name is on the page. So the bar is not
 * "does it fetch" but "can it ever display a wrong number". Every test below is
 * about the failure path preferring an openly-stale rate over a confident bad
 * one.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import handler from '../netlify/functions/rates.mts';
import refresher from '../netlify/functions/refresh-rates.mts';

// The Blobs store, faked. The real one needs a Netlify deploy context; what
// matters here is the contract between the reader and the refresher, which is
// "the reader never calls FRED once something has been stored".
let store: Record<string, unknown> = {};
vi.mock('@netlify/blobs', () => ({
  getStore: vi.fn(() => ({
    get: async (key: string) => store[key] ?? null,
    setJSON: async (key: string, value: unknown) => { store[key] = value; },
  })),
}));

const ctx = {} as never;
const req = () => new Request('https://realdarrentsai.com/api/rates');

/** A FRED observations response for one series. */
function fredOk(value: string, date = '2026-09-18') {
  return new Response(JSON.stringify({ observations: [{ date, value }] }), { status: 200 });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  store = {};
  vi.stubGlobal('Netlify', { env: { get: (k: string) => (k === 'FRED_API_KEY' ? 'test-key' : undefined) } });
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

/** Answers per FRED series id, so the two parallel calls stay distinguishable. */
function mockFred(per: Record<string, Response | Error>) {
  fetchMock = vi.fn(async (url: string | URL | Request) => {
    const u = String(url);
    for (const [series, res] of Object.entries(per)) {
      if (u.includes(series)) {
        if (res instanceof Error) throw res;
        return res;
      }
    }
    throw new Error(`unexpected fetch: ${u}`);
  });
  vi.stubGlobal('fetch', fetchMock);
}

describe('the happy path', () => {
  it('returns both rates and the observation date', async () => {
    mockFred({ MORTGAGE30US: fredOk('6.35'), MORTGAGE15US: fredOk('5.62') });
    const res = await handler(req(), ctx);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      rate30: 6.35,
      rate15: 5.62,
      asOf: '2026-09-18',
    });
  });

  it('labels what the numbers actually are, so a caption cannot invent a source', async () => {
    mockFred({ MORTGAGE30US: fredOk('6.35'), MORTGAGE15US: fredOk('5.62') });
    const body = await (await handler(req(), ctx)).json();
    expect(body.source).toBe('Freddie Mac PMMS via FRED, weekly average');
  });

  it('keeps the API key server-side: it is in the FRED call, never in the response', async () => {
    mockFred({ MORTGAGE30US: fredOk('6.35'), MORTGAGE15US: fredOk('5.62') });
    const res = await handler(req(), ctx);
    const text = await res.text();
    expect(text).not.toContain('test-key');
    expect(String(fetchMock.mock.calls[0][0])).toContain('api_key=test-key');
  });

  it('is cached at the CDN, so one origin call serves every visitor', async () => {
    mockFred({ MORTGAGE30US: fredOk('6.35'), MORTGAGE15US: fredOk('5.62') });
    const res = await handler(req(), ctx);
    // PMMS is weekly, so a 6h window is already fresher than the data.
    expect(res.headers.get('cache-control')).toContain('max-age=21600');
    expect(res.headers.get('cache-control')).toContain('stale-while-revalidate=604800');
    expect(res.headers.get('netlify-cdn-cache-control')).toContain('max-age=21600');
  });

  it('asks FRED for only the newest observation of each series', async () => {
    mockFred({ MORTGAGE30US: fredOk('6.35'), MORTGAGE15US: fredOk('5.62') });
    await handler(req(), ctx);
    for (const call of fetchMock.mock.calls) {
      expect(String(call[0])).toContain('limit=1');
      expect(String(call[0])).toContain('sort_order=desc');
    }
  });
});

describe('it never returns a number it is unsure about', () => {
  it('refuses FRED\'s "." placeholder rather than rendering NaN%', async () => {
    mockFred({ MORTGAGE30US: fredOk('.'), MORTGAGE15US: fredOk('5.62') });
    const res = await handler(req(), ctx);
    expect(res.status).toBe(502);
  });

  it.each(['0', '0.2', '30', '45.5', 'abc'])(
    'refuses an implausible or unparseable 30-year rate: %s',
    async (value) => {
      mockFred({ MORTGAGE30US: fredOk(value), MORTGAGE15US: fredOk('5.62') });
      expect((await handler(req(), ctx)).status).toBe(502);
    },
  );

  /**
   * The accept side of the same bounds. Without these the guard is only tested
   * from one direction, so widening it to nonsense, or narrowing it until it
   * rejects a real rate, both pass. A rejected real rate is the worse failure:
   * it shows every visitor the static fallback indefinitely and looks like
   * nothing is wrong.
   */
  it.each(['0.51', '3.25', '6.35', '18', '29.99'])(
    'accepts a rate inside the plausible band: %s',
    async (value) => {
      store = {};
      mockFred({ MORTGAGE30US: fredOk(value), MORTGAGE15US: fredOk('5.62') });
      const res = await handler(req(), ctx);
      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toMatchObject({ rate30: Number(value) });
    },
  );

  it.each(['0.5', '30'])('refuses the exact boundary value %s', async (value) => {
    // The bounds are exclusive on purpose: a literal 0.5% or 30% 30-year is a
    // format change at FRED, not a mortgage rate.
    mockFred({ MORTGAGE30US: fredOk(value), MORTGAGE15US: fredOk('5.62') });
    expect((await handler(req(), ctx)).status).toBe(502);
  });

  it('refuses a negative rate rather than rendering it', async () => {
    mockFred({ MORTGAGE30US: fredOk('-6.35'), MORTGAGE15US: fredOk('5.62') });
    expect((await handler(req(), ctx)).status).toBe(502);
  });

  it('does not store a 15-year rate it would refuse to serve', async () => {
    // A bad 15-year is survivable, but it must be dropped, not passed through:
    // the client renders whatever number arrives.
    mockFred({ MORTGAGE30US: fredOk('6.35'), MORTGAGE15US: fredOk('99') });
    const body = await (await handler(req(), ctx)).json();
    expect(body.rate30).toBe(6.35);
    expect(body.rate15).toBeNull();
  });

  it('serves the 30-year alone when only the 15-year is missing', async () => {
    // The 30-year drives every headline number; the client keeps its own
    // 15-year fallback and the caption still says the rates are current.
    mockFred({ MORTGAGE30US: fredOk('6.35'), MORTGAGE15US: fredOk('.') });
    const res = await handler(req(), ctx);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ rate30: 6.35, rate15: null });
  });

  it('reports 502 when FRED errors, so the client keeps its static rates', async () => {
    mockFred({ MORTGAGE30US: new Response('nope', { status: 500 }), MORTGAGE15US: fredOk('5.62') });
    expect((await handler(req(), ctx)).status).toBe(502);
  });

  it('reports 502 when the FRED call throws or times out', async () => {
    mockFred({
      MORTGAGE30US: Object.assign(new Error('timed out'), { name: 'TimeoutError' }),
      MORTGAGE15US: fredOk('5.62'),
    });
    expect((await handler(req(), ctx)).status).toBe(502);
  });

  it('does not let a failure be cached', async () => {
    mockFred({ MORTGAGE30US: new Response('nope', { status: 500 }), MORTGAGE15US: fredOk('5.62') });
    const res = await handler(req(), ctx);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('says 503, not 500, when the key is simply not configured', async () => {
    vi.stubGlobal('Netlify', { env: { get: () => undefined } });
    mockFred({});
    const res = await handler(req(), ctx);
    expect(res.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled(); // no point calling FRED without a key
  });
});

/**
 * The store is the whole point of the design.
 *
 * FRED's time-to-first-byte was measured at 1.6s to 11.2s across five
 * consecutive calls, and Netlify kills a synchronous function at 10s. Fetching
 * per request would therefore fail more often than it succeeded. The scheduled
 * refresher absorbs that; the reader must never inherit it.
 */
describe('the reader does not wait on FRED once rates are stored', () => {
  // fetchedAt must be recent: a stale value is refreshed on read now, by design.
  const STORED = { rate30: 6.95, rate15: 6.26, asOf: '2026-09-17', fetchedAt: new Date().toISOString() };

  it('serves the stored rates without calling FRED at all', async () => {
    store.pmms = STORED;
    mockFred({}); // any call would throw "unexpected fetch"
    const res = await handler(req(), ctx);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ rate30: 6.95, rate15: 6.26, asOf: '2026-09-17' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps serving them while FRED is down, which is the point', async () => {
    store.pmms = STORED;
    mockFred({ MORTGAGE30US: new Error('ECONNRESET') });
    expect((await handler(req(), ctx)).status).toBe(200);
  });

  it('does not leak the internal fetchedAt bookkeeping to the client', async () => {
    store.pmms = STORED;
    mockFred({});
    const body = await (await handler(req(), ctx)).json();
    expect(body).not.toHaveProperty('fetchedAt');
  });

  it('falls back to fetching once on a cold store, so a new deploy is not blank', async () => {
    mockFred({ MORTGAGE30US: fredOk('6.35'), MORTGAGE15US: fredOk('5.62') });
    expect((await handler(req(), ctx)).status).toBe(200);
    expect(fetchMock).toHaveBeenCalled();
    // And that fetch populated the store, so the next reader does not repeat it.
    expect(store.pmms).toMatchObject({ rate30: 6.35 });
  });
});

describe('the scheduled refresher', () => {
  it('stores what it fetched, with the time it was fetched', async () => {
    mockFred({ MORTGAGE30US: fredOk('6.95', '2026-09-17'), MORTGAGE15US: fredOk('6.26', '2026-09-17') });
    await refresher();
    expect(store.pmms).toMatchObject({ rate30: 6.95, rate15: 6.26, asOf: '2026-09-17' });
    expect(typeof (store.pmms as { fetchedAt: string }).fetchedAt).toBe('string');
  });

  it('leaves the previous rates alone when a run fails', async () => {
    const previous = { rate30: 6.95, rate15: 6.26, asOf: '2026-09-17', fetchedAt: new Date().toISOString() };
    store.pmms = previous;
    mockFred({ MORTGAGE30US: new Error('timed out'), MORTGAGE15US: new Error('timed out') });
    await refresher();
    expect(store.pmms).toBe(previous); // untouched, not cleared
  });

  it('does not overwrite good rates with an implausible one', async () => {
    const previous = { rate30: 6.95, rate15: 6.26, asOf: '2026-09-17', fetchedAt: new Date().toISOString() };
    store.pmms = previous;
    mockFred({ MORTGAGE30US: fredOk('0'), MORTGAGE15US: fredOk('6.26') });
    await refresher();
    expect(store.pmms).toBe(previous);
  });

  it('does nothing, loudly, when the key is missing', async () => {
    vi.stubGlobal('Netlify', { env: { get: () => undefined } });
    mockFred({});
    await refresher();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(store.pmms).toBeUndefined();
  });

  it('runs often enough that a missed weekly release is not possible', async () => {
    // PMMS publishes Thursdays. Hourly is about attempts, not freshness: single
    // FRED calls fail often, and a failed run is a no-op.
    const src = readFileSync(resolve(__dirname, '../netlify/functions/refresh-rates.mts'), 'utf8');
    expect(src).toContain('schedule: "0 * * * *"');
  });
});

describe('a broken store degrades to slow, never to down', () => {
  it('still serves rates it fetched when the store will not accept the write', async () => {
    // What an unconfigured Netlify Blobs looks like: both get and set throw.
    const boom = new Error('The environment has not been configured to use Netlify Blobs');
    const getStore = (await import('@netlify/blobs')).getStore as unknown as ReturnType<typeof vi.fn>;
    vi.mocked(getStore).mockReturnValueOnce({
      get: async () => { throw boom; },
      setJSON: async () => { throw boom; },
    } as never).mockReturnValueOnce({
      get: async () => { throw boom; },
      setJSON: async () => { throw boom; },
    } as never);

    mockFred({ MORTGAGE30US: fredOk('6.35'), MORTGAGE15US: fredOk('5.62') });
    const res = await handler(req(), ctx);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ rate30: 6.35 });
  });
});

/**
 * Staleness. This is the bug that reached production: the reader only fetched
 * when the store was EMPTY, so once anything was stored it was served forever
 * and nothing but the scheduled refresher could ever correct it. FRED published
 * 2026-09-24 and the site went on answering 2026-09-17.
 */
describe('a stale store corrects itself', () => {
  const FRESH = { rate30: 7.03, rate15: 6.42, asOf: '2026-09-24', fetchedAt: new Date().toISOString() };
  const OLD = { rate30: 6.95, rate15: 6.26, asOf: '2026-09-17', fetchedAt: new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString() };

  it('refreshes what it holds once that is old, without waiting for the schedule', async () => {
    store.pmms = OLD;
    mockFred({ MORTGAGE30US: fredOk('7.03', '2026-09-24'), MORTGAGE15US: fredOk('6.42', '2026-09-24') });
    const body = await (await handler(req(), ctx)).json();
    expect(body).toMatchObject({ rate30: 7.03, rate15: 6.42, asOf: '2026-09-24' });
    expect(store.pmms).toMatchObject({ asOf: '2026-09-24' }); // and it stuck
  });

  it('still serves the old rates when that refresh fails, rather than nothing', async () => {
    store.pmms = OLD;
    mockFred({ MORTGAGE30US: new Error('timed out'), MORTGAGE15US: new Error('timed out') });
    const res = await handler(req(), ctx);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ rate30: 6.95, asOf: '2026-09-17' });
  });

  it('does not call FRED at all while the stored value is fresh', async () => {
    store.pmms = FRESH;
    mockFred({});
    const res = await handler(req(), ctx);
    expect(res.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('treats an unparseable fetchedAt as stale rather than trusting it', async () => {
    store.pmms = { ...OLD, fetchedAt: 'not a date' };
    mockFred({ MORTGAGE30US: fredOk('7.03', '2026-09-24'), MORTGAGE15US: fredOk('6.42', '2026-09-24') });
    await handler(req(), ctx);
    expect(fetchMock).toHaveBeenCalled();
  });

  it('serves stale rates rather than 503 when the key goes missing', async () => {
    store.pmms = OLD;
    vi.stubGlobal('Netlify', { env: { get: () => undefined } });
    mockFred({});
    const res = await handler(req(), ctx);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ rate30: 6.95 });
  });
});
