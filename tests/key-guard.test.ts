/**
 * Wrong-key guard for the server-to-server email endpoints (4 Nov 2026).
 * Max kept the existing keys, so repeated guessing must be stopped instead:
 * five wrong keys from one address block it for an hour, unchecked.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ records: new Map<string, { value: unknown; etag: string }>(), version: 0, down: false }));
vi.mock('@netlify/blobs', () => ({ getStore: ({ name }: { name: string }) => ({
  get: async (key: string) => { if (state.down) throw Error('unavailable'); return structuredClone(state.records.get(name + '/' + key)?.value ?? null); },
  getWithMetadata: async (key: string) => { if (state.down) throw Error('unavailable'); const r = state.records.get(name + '/' + key); return r ? { data: structuredClone(r.value), etag: r.etag } : null; },
  setJSON: async (key: string, value: unknown, o: { onlyIfNew?: boolean; onlyIfMatch?: string } = {}) => {
    if (state.down) throw Error('unavailable');
    const old = state.records.get(name + '/' + key);
    if ((o.onlyIfNew && old) || (o.onlyIfMatch && old?.etag !== o.onlyIfMatch)) return { modified: false };
    const etag = String(++state.version); state.records.set(name + '/' + key, { value: structuredClone(value), etag }); return { modified: true, etag };
  },
}) }));

import { guardKey, keyMatches, nextFails, KEY_FAIL_LIMIT, KEY_BLOCK_MS, KEY_FAIL_WINDOW_MS } from '../netlify/lib/key-guard.mts';
import { guideSender } from '../netlify/lib/guide-shared.mts';
import stopEmailRequest from '../netlify/functions/stop-email.mts';

const respond = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
const req = (key?: string) => new Request('https://realdarrentsai.com/api/x', { method: 'POST', headers: key ? { 'x-api-key': key } : {}, body: '{}' });
const REAL = 'the-configured-key';

beforeEach(() => { state.records.clear(); state.version = 0; state.down = false; });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('key comparison', () => {
  it('matches only the exact configured key', () => {
    expect(keyMatches(REAL, REAL)).toBe(true);
    expect(keyMatches(REAL + 'x', REAL)).toBe(false);
    expect(keyMatches(null, REAL)).toBe(false);
    expect(keyMatches(REAL, undefined)).toBe(false);
  });
});

describe('failure window', () => {
  it('blocks on the fifth failure inside the window and resets after it', () => {
    let f = null as ReturnType<typeof nextFails> | null;
    for (let i = 1; i < KEY_FAIL_LIMIT; i++) { f = nextFails(f, 1000 * i); expect(f.blockedUntil).toBeUndefined(); }
    f = nextFails(f, 5000);
    expect(f.blockedUntil).toBe(5000 + KEY_BLOCK_MS);
    expect(nextFails({ count: 4, windowStart: 0 }, KEY_FAIL_WINDOW_MS).count).toBe(1);
  });
});

describe('guardKey', () => {
  it('blocks an address after five wrong keys, even when it then sends the right one', async () => {
    for (let i = 0; i < KEY_FAIL_LIMIT; i++) expect((await guardKey(req('guess' + i), '203.0.113.9', REAL, respond))!.status).toBe(401);
    expect((await guardKey(req(REAL), '203.0.113.9', REAL, respond))!.status).toBe(429);
    // Another address, such as Apps Script, is unaffected.
    expect(await guardKey(req(REAL), '198.51.100.7', REAL, respond)).toBeNull();
    expect(JSON.stringify([...state.records.keys()])).not.toContain('203.0.113.9');
  });
  it('does not count requests without any key', async () => {
    for (let i = 0; i < 10; i++) expect((await guardKey(req(), '203.0.113.9', REAL, respond))!.status).toBe(401);
    expect(await guardKey(req(REAL), '203.0.113.9', REAL, respond)).toBeNull();
  });
  it('fails open to the normal key check when storage is down', async () => {
    state.down = true;
    expect(await guardKey(req(REAL), '203.0.113.9', REAL, respond)).toBeNull();
    expect((await guardKey(req('guess'), '203.0.113.9', REAL, respond))!.status).toBe(401);
  });
});

describe('wired into the endpoints', () => {
  it('guide and confirmation senders refuse a blocked address before anything else', async () => {
    vi.stubGlobal('Netlify', { env: { get: (k: string) => ({ CONTACT_CONFIRM_API_KEY: REAL })[k] } });
    const send = guideSender({ apiKeyEnv: 'CONTACT_CONFIRM_API_KEY' } as Parameters<typeof guideSender>[0]);
    const ctx = { ip: '203.0.113.9' } as Parameters<typeof send>[1];
    for (let i = 0; i < KEY_FAIL_LIMIT; i++) expect((await send(req('guess' + i), ctx)).status).toBe(401);
    expect((await send(req(REAL), ctx)).status).toBe(429);
  });
  it('stop-email refuses a blocked address', async () => {
    vi.stubGlobal('Netlify', { env: { get: (k: string) => ({ CONTACT_CONFIRM_API_KEY: REAL })[k] } });
    const ctx = { ip: '203.0.113.9' } as Parameters<typeof stopEmailRequest>[1];
    for (let i = 0; i < KEY_FAIL_LIMIT; i++) expect((await stopEmailRequest(req('guess' + i), ctx)).status).toBe(401);
    expect((await stopEmailRequest(req(REAL), ctx)).status).toBe(429);
  });
});
