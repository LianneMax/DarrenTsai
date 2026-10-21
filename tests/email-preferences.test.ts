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
    list: async ({ prefix }: { prefix: string }) => ({ blobs: [...storage.keys()].filter(key => key.startsWith(prefix)).map(key => ({ key })) }),
    delete: async (key: string) => { storage.delete(key); },
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
  it('keeps Sheet updates pending until acknowledged, without lifting suppression', async () => {
    await stopEmail(email, 'link');
    const api = (body: unknown) => stopEmailRequest(new Request('https://realdarrentsai.com/api/stop-email', {
      method: 'POST', headers: { 'x-api-key': 'private-test' }, body: JSON.stringify(body),
    }));
    expect(await (await api({ operation: 'pending' })).json()).toEqual({ emails: [email] });
    await api({ operation: 'acknowledge', email });
    expect(await (await api({ operation: 'pending' })).json()).toEqual({ emails: [] });
    expect(await isEmailSuppressed(email)).toBe(true);
  });

  it('marks all matching historical rows TRUE without moving headers or changing other leads', () => {
    // Use the harness's actual Spreadsheet binding, keeping Range writes real.
    const harness = loadGas<{ SpreadsheetApp: { openById: (id: string) => unknown }; markLeadEmailUnsubscribed: (ss: unknown, email: string) => void; leadEmailUnsubscribed: (ss: unknown, email: string) => boolean }>({
      exports: ['SpreadsheetApp', 'markLeadEmailUnsubscribed', 'leadEmailUnsubscribed'],
    });
    harness.tabs.set('Needs Guidance', { name: 'Needs Guidance', rows: [['Email', 'Name'], [email, 'One'], ['another@example.com', 'Two'], [email.toUpperCase(), 'Three']] });
    const spreadsheet = harness.gas.SpreadsheetApp.openById('test');
    harness.gas.markLeadEmailUnsubscribed(spreadsheet, email);
    harness.gas.markLeadEmailUnsubscribed(spreadsheet, email);
    expect(harness.tabs.get('Needs Guidance')!.rows).toEqual([['Email', 'Name', 'Unsubscribe?'], [email, 'One', true], ['another@example.com', 'Two'], [email.toUpperCase(), 'Three', true]]);
    expect(harness.gas.leadEmailUnsubscribed(spreadsheet, email)).toBe(true);
    expect(harness.gas.leadEmailUnsubscribed(spreadsheet, 'another@example.com')).toBe(false);
  });
  it('a manual TRUE prevents guide delivery and records durable suppression', () => {
    const calls: string[] = [];
    const harness = loadGas<{ SpreadsheetApp: { openById: (id: string) => unknown }; postGuide: (...args: unknown[]) => { outcome: string } }>({
      exports: ['SpreadsheetApp', 'postGuide'], props: {
        NETLIFY_CONTACT_CONFIRM_URL: 'https://realdarrentsai.com/api/send-contact-confirmation', NETLIFY_CONTACT_CONFIRM_KEY: 'private-test',
        URL: 'https://example.invalid/guide', KEY: 'guide-test',
      }, fetch: url => { calls.push(url); return { getResponseCode: () => 200, getContentText: () => '{"suppressed":true}' }; },
    });
    harness.tabs.set('Needs Guidance', { name: 'Needs Guidance', rows: [['Email', 'Unsubscribe?'], [email, true]] });
    expect(harness.gas.postGuide(harness.gas.SpreadsheetApp.openById('test'), 'guide', 'URL', 'KEY', { email }).outcome).toBe('skipped');
    expect(calls).toEqual(['https://realdarrentsai.com/api/stop-email']);
  });
  it('initialises opt-out headers without scanning leads and releases the lock between tabs', () => {
    type Sheet = { getRange: (...args: number[]) => unknown };
    const harness = loadGas<{
      SpreadsheetApp: { openById: (id: string) => { getSheetByName: (name: string) => Sheet | null } };
      LockService: { getScriptLock: () => { waitLock: (ms: number) => void; releaseLock: () => void } };
      initializeEmailOptOutColumns: (ss: unknown) => void;
      markLeadEmailUnsubscribed: (ss: unknown, address: string) => void;
    }>({exports:['SpreadsheetApp','LockService','initializeEmailOptOutColumns','markLeadEmailUnsubscribed']});
    for (const name of ['Needs Guidance','Mortgage Review']) harness.tabs.set(name,{name,rows:[['Email','Name'],[email,'One'],['someone@example.com','Two']]});
    const sections: Set<string>[] = [];
    let held: Set<string> | undefined;
    let headerOnly = true;
    harness.gas.LockService.getScriptLock = () => ({
      waitLock: () => { expect(held).toBeUndefined(); held = new Set(); sections.push(held); },
      releaseLock: () => { held = undefined; },
    });
    const original = harness.gas.SpreadsheetApp.openById('test');
    const spreadsheet = {getSheetByName(name: string) {
      const sheet = original.getSheetByName(name);
      if (!sheet) return null;
      return {...sheet,getRange(...args: number[]) {
        if (held) held.add(name);
        else expect(args[0], 'only header existence may be read outside the write lock').toBe(1);
        if (headerOnly) expect(args[0], 'header setup must not read lead rows').toBe(1);
        return sheet.getRange(...args);
      }};
    }};
    harness.gas.initializeEmailOptOutColumns(spreadsheet);
    expect(sections).toHaveLength(2);
    // Steady-state minute ticks must not acquire or flush write locks when
    // every header already exists; actual missing headers still repair above.
    harness.gas.initializeEmailOptOutColumns(spreadsheet);
    expect(sections).toHaveLength(2);
    headerOnly = false;
    harness.gas.markLeadEmailUnsubscribed(spreadsheet,email);
    expect(sections).toHaveLength(4);
    expect(sections.every(section => section.size === 1)).toBe(true);
    for (const tab of harness.tabs.values()) expect(tab.rows).toEqual([['Email','Name','Unsubscribe?'],[email,'One',true],['someone@example.com','Two']]);
  });
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
  it('keeps preference screens script-free, private and recoverable when storage is down', async () => {
    const link = await unsubscribeLinkFor(email);
    const confirmation = await unsubscribe(new Request(link));
    const markup = await confirmation.text();
    expect(markup).toContain('aria-labelledby="preference-title"');
    expect(markup).toContain('method="post"');
    expect(markup).not.toContain(email);
    expect(markup).not.toContain('<script');
    expect(confirmation.headers.get('Cache-Control')).toBe('no-store');
    expect(confirmation.headers.get('Referrer-Policy')).toBe('no-referrer');
    expect(confirmation.headers.get('Content-Security-Policy')).toContain("default-src 'none'");
    expect(confirmation.headers.get('Content-Security-Policy')).toContain("form-action 'self'");
    state.down = true;
    const failed = await unsubscribe(new Request(link, {method:'POST'}));
    const failure = await failed.text();
    expect(failed.status).toBe(503);
    expect(failure).toContain('Try again</a>');
    expect(failure).toContain('We could not save your choice yet');
    expect(failure).not.toContain('You are unsubscribed');
    expect(failure).not.toContain(email);
    expect(sent).toHaveLength(0);
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
    const { gas } = loadGas<{ postGuide: (...args: unknown[]) => { outcome: string }; SpreadsheetApp: { openById: (id: string) => unknown } }>({
      exports: ['postGuide', 'SpreadsheetApp'], props: { URL: 'https://example.invalid/LOCAL', KEY: 'private-test' },
      fetch: () => ({ getResponseCode: () => 200, getContentText: () => '{"success":true,"suppressed":true}' }),
    });
    expect(gas.postGuide(gas.SpreadsheetApp.openById('test'), 'test', 'URL', 'KEY', {email}).outcome).toBe('skipped');
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
