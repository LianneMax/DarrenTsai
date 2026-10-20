import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const { records, state } = vi.hoisted(() => ({ records: new Map<string, string>(), state: { failWrite: false, onDelete: undefined as (() => void) | undefined } }));
vi.mock('@netlify/blobs', () => ({ getStore: () => ({
  get: async (key: string, options?: { type: string }) => records.has(key) ? (options?.type === 'json' ? JSON.parse(records.get(key)!) : records.get(key)) : null,
  set: async (key: string, value: string, options?: { onlyIfNew: boolean }) => {
    if (state.failWrite) return { modified: true };
    if (options?.onlyIfNew && records.has(key)) return { modified: false };
    records.set(key, value); return { modified: true };
  },
  setJSON: async (key: string, value: unknown, options?: { onlyIfNew: boolean }) => {
    if (state.failWrite) return { modified: true };
    if (options?.onlyIfNew && records.has(key)) return { modified: false };
    records.set(key, JSON.stringify(value)); return { modified: true };
  },
  delete: async (key: string) => { records.delete(key); state.onDelete?.(); },
  list: (options: { prefix: string; directories?: boolean; paginate?: boolean }) => {
    const keys = [...records.keys()].filter(key => key.startsWith(options.prefix));
    if (options.directories) return Promise.resolve({ blobs: [], directories: [...new Set(keys.map(key => key.slice(0, key.indexOf('/', options.prefix.length))))] });
    const result = { blobs: keys.map(key => ({ key })), directories: [] };
    if (options.paginate) return (async function* () { yield result; })();
    return Promise.resolve(result);
  },
}) }));
vi.mock('../netlify/functions/email-preferences.mts', () => ({
  isEmailSuppressed: vi.fn(async () => false), unsubscribeLinkFor: vi.fn(async () => 'https://example.com/unsubscribe'),
}));
import { isEmailSuppressed } from '../netlify/functions/email-preferences.mts';
import { guideSender, purgeExpiredEmailDeliveries } from '../netlify/functions/guide-shared.mts';

const handler = guideSender({ name: 'guide-test', apiKeyEnv: 'GUIDE_KEY', subject: 'Requested guide', buildEmailHtml: () => '<p>Your guide</p>', buildAttachments: async () => [] });
const body = () => ({ email: 'qa@example.com', submissionId: 'stable-1', deliveryStartedAt: new Date().toISOString() });
const request = (data = body()) => new Request('https://example.com/guide', { method: 'POST', headers: { 'x-api-key': 'key' }, body: JSON.stringify(data) });
beforeEach(() => {
  records.clear(); state.failWrite = false; state.onDelete = undefined;
  vi.stubGlobal('Netlify', { env: { get: (key: string) => ({ GUIDE_KEY: 'key', RESEND_API_KEY: 'resend' })[key] } });
  vi.mocked(isEmailSuppressed).mockResolvedValue(false);
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('Resend request identity', () => {
  it('reuses the same provider key on retries of one request', async () => {
    const fetch = vi.fn(async () => new Response('{"id":"one-email"}'));
    vi.stubGlobal('fetch', fetch);
    const data = body();
    expect((await handler(request(data), {} as never)).status).toBe(200);
    expect((await handler(request(data), {} as never)).status).toBe(200);
    expect(fetch.mock.calls).toHaveLength(2);
    const options = fetch.mock.calls as unknown as Array<[string, RequestInit]>;
    for (const [, init] of options) expect(new Headers(init.headers).get('Idempotency-Key')).toBe('guide-test/stable-1');
    expect(options[0][1].body).toBe(options[1][1].body);
  });
  it('freezes changing rendered attachments across concurrent and later retries', async () => {
    let renders = 0;
    const varying = guideSender({ name: 'varying', apiKeyEnv: 'GUIDE_KEY', subject: 'Guide', buildEmailHtml: () => 'same',
      buildAttachments: async () => [{ filename: 'report.pdf', content: `bytes-${++renders}` }] });
    const fetch = vi.fn(async (_url: unknown, _init: RequestInit) => new Response('{}'));
    vi.stubGlobal('fetch', fetch);
    const data = body();
    await Promise.all([varying(request(data), {} as never), varying(request(data), {} as never)]);
    await varying(request(data), {} as never);
    const sent = fetch.mock.calls.map(([, init]) => init.body);
    expect(new Set(sent).size).toBe(1);
  });
  it('does not send when storage reports success without durable readback', async () => {
    state.failWrite = true;
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    expect((await handler(request(), {} as never)).status).toBe(500);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('physically purges expired payloads, retains opaque tombstones and refuses an old delivery afterwards', async () => {
    const fetch = vi.fn(async () => new Response('{}')); vi.stubGlobal('fetch', fetch);
    const data = body();
    await handler(request(data), {} as never);
    expect([...records.keys()].some(key => key.startsWith('requests/'))).toBe(true);
    expect(await purgeExpiredEmailDeliveries(Date.now() + 26 * 3600_000)).toMatchObject({ deleted: 1 });
    expect([...records.keys()].every(key => key.startsWith('seen/'))).toBe(true);
    expect([...records.values()].join('')).not.toContain('qa@example.com');
    const now = Date.now(); vi.spyOn(Date, 'now').mockReturnValue(now + 26 * 3600_000);
    expect((await handler(request(data), {} as never)).status).toBe(409);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('stops deleting within the scheduled time budget and leaves a reported backlog for the next run', async () => {
    let clock = Date.now();
    vi.spyOn(Date, 'now').mockImplementation(() => clock);
    const oldHour = Math.floor(clock / 3600_000) - 2;
    records.set(`requests/${oldHour}/one`, 'private payload one');
    records.set(`requests/${oldHour}/two`, 'private payload two');
    state.onDelete = () => { clock += 21_000; };
    expect(await purgeExpiredEmailDeliveries()).toEqual({ deleted: 1, remaining: true });
    expect(records.size).toBe(1);
    state.onDelete = undefined;
    expect(await purgeExpiredEmailDeliveries()).toEqual({ deleted: 1, remaining: false });
    expect(records.size).toBe(0);
  });
  it('holds requests beyond the provider retention margin without sending', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    const response = await handler(request({ ...body(), deliveryStartedAt: new Date(Date.now() - 24 * 3600_000).toISOString() }), {} as never);
    expect(response.status).toBe(409); expect(fetch).not.toHaveBeenCalled();
  });
  it.each([
    [409, 'invalid_idempotent_request', 409],
    [409, 'concurrent_idempotent_requests', 503],
    [503, 'temporarily unavailable', 503],
  ])('classifies provider %s/%s as %s', async (code, text, expected) => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(String(text), { status: Number(code) })));
    expect((await handler(request(), {} as never)).status).toBe(expected);
  });
  it('network uncertainty may retry only with a supported stable key', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('lost response'); }));
    expect((await handler(request(), {} as never)).status).toBe(503);
    expect((await handler(request({ ...body(), submissionId: '', deliveryStartedAt: '' }), {} as never)).status).toBe(409);
  });
  it('suppression remains authoritative before any provider request', async () => {
    vi.mocked(isEmailSuppressed).mockResolvedValue(true);
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    const response = await handler(request(), {} as never);
    expect(await response.json()).toMatchObject({ success: true, suppressed: true });
    expect(fetch).not.toHaveBeenCalled();
  });
});
