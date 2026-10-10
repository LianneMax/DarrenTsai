// @vitest-environment node
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
const storage = vi.hoisted(() => new Map<string, unknown>());
const state = vi.hoisted(() => ({ down: false }));
vi.mock('@netlify/blobs', () => ({ getStore: vi.fn((_name, options) => {
  expect(options.consistency).toBe('strong');
  return {
    get: async (key: string) => { if (state.down) throw Error('Store unavailable'); return storage.get(key) ?? null; },
    set: async (key: string, value: unknown) => { storage.set(key, value); },
    setJSON: async (key: string, value: unknown) => { if (state.down) throw Error('Store unavailable'); storage.set(key, value); },
  };
}) }));
import { stopEmail, unsubscribeLinkFor, isEmailSuppressed } from '../netlify/functions/email-preferences.mts';
import unsubscribe from '../netlify/functions/unsubscribe.mts';
import { guideSender } from '../netlify/functions/guide-shared.mts';
import stopEmailRequest from '../netlify/functions/stop-email.mts';
import { loadGas } from './helpers/gas-harness';

const email = 'local-test@example.com';
let sent: Record<string, unknown>[];
const handler = guideSender({ name: 'test', apiKeyEnv: 'TEST_KEY', subject: 'Test',
  buildEmailHtml: () => '<a href="mailto:darren@realdarrentsai.com?subject=Unsubscribe">Unsubscribe</a>',
  buildAttachments: async () => [],
});
const request = () => new Request('https://realdarrentsai.com/api/test', { method: 'POST',
  headers: { 'x-api-key': 'private-test' }, body: JSON.stringify({ email }),
});
beforeEach(() => {
  storage.clear(); state.down = false; sent = [];
  vi.stubGlobal('Netlify', { env: { get: () => 'private-test' } });
  vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
    sent.push(JSON.parse(init.body)); return new Response('{"id":"test"}');
  }));
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('persistent email opt-out', () => {
  it('uses opaque stable links without email addresses and GET scanners cannot unsubscribe', async () => {
    const link = await unsubscribeLinkFor(email);
    expect(link).not.toContain(email); expect(await unsubscribeLinkFor(email)).toBe(link);
    const res = await unsubscribe(new Request(link));
    expect(res.status).toBe(200); expect(await res.text()).toContain('Stop emails');
    expect(await isEmailSuppressed(email)).toBe(false);
    expect(res.headers.get('X-Robots-Tag')).toContain('noindex');
  });
  it('stops on confirmation; repeated requests and differently cased addresses remain stopped', async () => {
    const link = await unsubscribeLinkFor(email);
    expect((await unsubscribe(new Request(link, { method: 'POST' }))).status).toBe(200);
    expect((await unsubscribe(new Request(link, { method: 'POST' }))).status).toBe(200);
    expect(await isEmailSuppressed(' LOCAL-TEST@example.com ')).toBe(true);
    const res = await handler(request(), {} as never);
    expect(await res.json()).toMatchObject({ suppressed: true }); expect(sent).toHaveLength(0);
    expect(await isEmailSuppressed(email)).toBe(true);
  });
  it('handles mailbox one-click POST without a confirmation page or email', async () => {
    const link = await unsubscribeLinkFor(email);
    const res = await unsubscribe(new Request(link, { method: 'POST', body: 'List-Unsubscribe=One-Click' }));
    expect(res.status).toBe(200); expect(await res.text()).toBe('');
    expect(await isEmailSuppressed(email)).toBe(true); expect(sent).toHaveLength(0);
  });
  it('rejects invented tokens and never claims success when the preference store fails', async () => {
    expect((await unsubscribe(new Request('https://realdarrentsai.com/unsubscribe?token=bad', { method: 'POST' }))).status).toBe(400);
    const link = await unsubscribeLinkFor(email); state.down = true;
    expect((await unsubscribe(new Request(link, { method: 'POST' }))).status).toBe(503);
    expect((await handler(request(), {} as never)).status).toBe(500); expect(sent).toHaveLength(0);
  });
  it('adds the live footer link and standard one-click headers to outgoing email', async () => {
    expect((await handler(request(), {} as never)).status).toBe(200);
    const headers = sent[0].headers as Record<string, string>;
    expect(headers['List-Unsubscribe']).toMatch(/^<https:\/\/realdarrentsai.com\/unsubscribe\?token=[a-f0-9]{64}>$/);
    expect(headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
    expect(sent[0].html).not.toContain('mailto:');
  });
  it('a reply/manual opt-out blocks email; no confirmation is mailed to that address', async () => {
    await stopEmail(email, 'reply'); await handler(request(), {} as never);
    expect(sent).toHaveLength(0);
  });
  it('an opt-out arriving during attachment work prevents the send', async () => {
    const pending = guideSender({ name: 'slow', apiKeyEnv: 'TEST_KEY', subject: 'Test',
      buildEmailHtml: () => '', buildAttachments: async () => { await stopEmail(email, 'reply'); return []; },
    });
    const res = await pending(request(), {} as never);
    expect(await res.json()).toMatchObject({ suppressed: true }); expect(sent).toHaveLength(0);
  });
  it('the reply/manual recording endpoint requires the server key before modifying consent', async () => {
    const body = JSON.stringify({email,reason:'reply'});
    expect((await stopEmailRequest(new Request('https://realdarrentsai.com/api/stop-email', {method:'POST',body}))).status).toBe(401);
    expect(await isEmailSuppressed(email)).toBe(false);
    const res = await stopEmailRequest(new Request('https://realdarrentsai.com/api/stop-email', {
      method:'POST',headers:{'x-api-key':'private-test'},body,
    }));
    expect(res.status).toBe(200); expect(await isEmailSuppressed(email)).toBe(true);
    expect(sent).toHaveLength(0);
  });
  it('Apps Script treats a suppressed send as skipped, not as a delivery failure or retry', () => {
    const { gas } = loadGas<{ postGuide: (...args: unknown[]) => { outcome: string } }>({
      exports: ['postGuide'], props: { URL: 'https://example.invalid/LOCAL', KEY: 'private-test' },
      fetch: () => ({ getResponseCode: () => 200, getContentText: () => '{"success":true,"suppressed":true}' }),
    });
    expect(gas.postGuide({}, 'test', 'URL', 'KEY', {email}).outcome).toBe('skipped');
  });
  it('the operator helper records consent through the configured private endpoint', () => {
    let called = '';
    const { gas } = loadGas<{ recordEmailOptOut: (address: string) => { suppressed: boolean } }>({
      exports: ['recordEmailOptOut'], props: {
        NETLIFY_CONTACT_CONFIRM_URL: 'https://realdarrentsai.com/api/send-contact-confirmation',
        NETLIFY_CONTACT_CONFIRM_KEY: 'private-test',
      }, fetch: url => { called = url; return {getResponseCode:()=>200,getContentText:()=>'{"suppressed":true}'}; },
    });
    expect(gas.recordEmailOptOut(email)).toEqual({suppressed:true});
    expect(called).toBe('https://realdarrentsai.com/api/stop-email');
  });
});
