/**
 * Uptime monitoring (27 Nov 2026). Netlify and the Apps Script watch each other:
 * Netlify's uptime-watch checks the Apps Script health answer and its follow-up
 * worker heartbeat; the Apps Script's watchSite checks the homepage and
 * /api/health (the website inbox worker heartbeat). One alert per problem per hour.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadGas, type FetchResponse, type MailMessage } from './helpers/gas-harness';

const blobs = vi.hoisted(() => ({ map: new Map<string, unknown>(), down: false }));
vi.mock('@netlify/blobs', () => ({ getStore: (name: string) => ({
  get: async (key: string) => { if (blobs.down) throw Error('unavailable'); return structuredClone(blobs.map.get(name + '/' + key) ?? null); },
  setJSON: async (key: string, value: unknown) => { if (blobs.down) throw Error('unavailable'); blobs.map.set(name + '/' + key, structuredClone(value)); return { modified: true, etag: '1' }; },
  getWithMetadata: async () => null,
  delete: async () => {},
  list: () => ({ async *[Symbol.asyncIterator]() { if (blobs.down) throw Error('unavailable'); yield { blobs: [] }; } }),
}) }));

import health from '../netlify/functions/health.mts';
import uptimeWatch, { judgeWriter, statusEmail, STATUS_SUBJECT } from '../netlify/functions/uptime-watch.mts';
import syncHandler from '../netlify/functions/lead-inbox-sync.mts';

const env = { APPS_SCRIPT_WEBHOOK_URL: 'https://script.google.com/macros/s/TEST/exec', LEAD_PROXY_KEY: 'k', RESEND_API_KEY: 're_test' } as Record<string, string>;
beforeEach(() => {
  blobs.map.clear(); blobs.down = false;
  vi.stubGlobal('Netlify', { env: { get: (key: string) => env[key] } });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const minsAgo = (m: number) => Date.now() - m * 60_000;

describe('Netlify side', () => {
  it('judges the Apps Script answer', () => {
    const now = Date.now();
    expect(judgeWriter(true, { status: 'ok', captureProtocol: 'stable-id-v1', workerAt: minsAgo(2) }, now)).toEqual({ ok: true });
    expect(judgeWriter(true, { status: 'ok', captureProtocol: 'stable-id-v1' }, now)).toEqual({ ok: true }); // older script: no workerAt yet
    expect(judgeWriter(true, { status: 'ok', captureProtocol: 'stable-id-v1', workerAt: minsAgo(40) }, now)).toMatchObject({ ok: false, problem: 'worker-stale' });
    expect(judgeWriter(false, null, now)).toMatchObject({ ok: false, problem: 'unreachable' });
    expect(judgeWriter(true, { status: 'ok', captureProtocol: 'old' }, now)).toMatchObject({ ok: false, problem: 'protocol' });
  });

  it('the inbox sync stamps a heartbeat only after a completed run', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}')));
    await syncHandler();
    expect(blobs.map.get('site-health/inbox-sync')).toMatchObject({ at: expect.any(Number) });
    blobs.map.clear();
    blobs.down = true;
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"id":"x"}')));
    expect((await syncHandler()).status).toBe(503);
    expect(blobs.map.has('site-health/inbox-sync')).toBe(false);
  });

  it('/api/health reports ok, stale and missing heartbeats with no lead data', async () => {
    blobs.map.set('site-health/inbox-sync', { at: minsAgo(1) });
    const body = await (await health()).json();
    expect(body).toMatchObject({ status: 'ok' });
    expect(Object.keys(body).sort()).toEqual(['inboxSyncAgeSec', 'inboxSyncAt', 'status']);
    blobs.map.set('site-health/inbox-sync', { at: minsAgo(30) });
    expect(await (await health()).json()).toMatchObject({ status: 'degraded' });
    blobs.map.clear();
    expect(await (await health()).json()).toMatchObject({ status: 'degraded', inboxSyncAt: null });
  });

  it('uptime-watch emails once per problem per hour, and stays quiet when healthy', async () => {
    const sends: string[] = [];
    const answer = { body: { status: 'ok', captureProtocol: 'stable-id-v1', workerAt: minsAgo(1) } as unknown };
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
      if (url.includes('resend')) { sends.push(String((init.headers as Record<string, string>)['Idempotency-Key'])); return new Response('{"id":"m1"}'); }
      return new Response(JSON.stringify(answer.body));
    }));
    expect((await uptimeWatch()).status).toBe(204);
    expect(sends).toHaveLength(0);
    answer.body = { status: 'ok', captureProtocol: 'stable-id-v1', workerAt: minsAgo(45) };
    expect((await uptimeWatch()).status).toBe(503);
    await uptimeWatch();
    expect(sends).toHaveLength(2);
    expect(sends[0]).toBe(sends[1]); // same idempotency key within the hour, so Resend sends one email
  });

  // 28 Nov 2026 (Max): one Gmail thread, written like the daily-task emails, with an all-clear.
  it('sends every uptime email in one thread, in the daily-task format, and an all clear on recovery', async () => {
    const mails: Array<{ subject: string; text: string; headers?: Record<string, string> }> = [];
    const answer = { body: { status: 'ok', captureProtocol: 'stable-id-v1', workerAt: minsAgo(45) } as unknown };
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
      if (url.includes('resend')) { mails.push(JSON.parse(String(init.body))); return new Response('{"id":"m1"}'); }
      return new Response(JSON.stringify(answer.body));
    }));
    await uptimeWatch();
    answer.body = { status: 'ok', captureProtocol: 'stable-id-v1', workerAt: minsAgo(1) };
    await uptimeWatch();
    await uptimeWatch(); // still healthy: no second all clear
    expect(mails).toHaveLength(2);
    expect(mails.map((m) => m.subject)).toEqual([STATUS_SUBJECT, STATUS_SUBJECT]);
    for (const m of mails) expect(m.headers?.References).toBe('<lead-system-status@realdarrentsai.com>');
    expect(mails[0].text).toMatch(/^Hi Max,\n\nLead follow-ups/);
    expect(mails[0].text).toContain('[ ] 1. Apps Script > Executions');
    expect(mails[0].text).toContain('Thank you!\nLead system watch');
    expect(mails[1].text).toContain('All clear');
  });

  it('formats a status email with no checklist when there is nothing to do', () => {
    const text = statusEmail({ headline: 'All clear.', problems: [], meaning: 'Fine.', checks: [], source: 'Netlify', now: Date.UTC(2026, 10, 28, 12, 34) });
    expect(text).not.toContain('[ ]');
    expect(text).toContain('Manila');
    expect(text).toContain('No action needed.');
  });
});

describe('Apps Script side', () => {
  type Runtime = { doGet: () => { __body: string }; watchSite: () => void; siteWatchProblems: (h: unknown, a: unknown) => string[] };
  const res = (code: number, body: unknown): FetchResponse => ({ getResponseCode: () => code, getContentText: () => typeof body === 'string' ? body : JSON.stringify(body) });

  function gas(props: Record<string, string>, healthBody: unknown, homeCode = 200) {
    const mails: MailMessage[] = [];
    const urls: string[] = [];
    const h = loadGas<Runtime>({ exports: ['doGet', 'watchSite', 'siteWatchProblems'], props, onMail: (m) => mails.push(m),
      fetch: (url) => { urls.push(url); return url.endsWith('/api/health') ? res(200, healthBody) : res(homeCode, '<html>'); } });
    return { h, mails, urls, props };
  }

  it('doGet reports when the follow-up worker last ran', () => {
    const { h } = gas({ FOLLOWUP_WORKER_AT: '1795700000000' }, {});
    expect(JSON.parse(h.gas.doGet().__body)).toEqual({ status: 'ok', captureProtocol: 'stable-id-v1', workerAt: 1795700000000 });
    const blank = gas({}, {});
    expect(JSON.parse(blank.h.gas.doGet().__body).workerAt).toBeNull();
  });

  it('names each problem in plain words', () => {
    const { h } = gas({}, {});
    expect(h.gas.siteWatchProblems({ code: 200 }, { code: 200, text: '{"inboxSyncAgeSec":60}' })).toEqual([]);
    expect(h.gas.siteWatchProblems({ code: 503 }, { code: 200, text: '{"inboxSyncAgeSec":60}' })[0]).toContain('homepage');
    expect(h.gas.siteWatchProblems({ code: 200 }, { code: 200, text: '{"inboxSyncAgeSec":1800}' })[0]).toContain('30 minutes');
    expect(h.gas.siteWatchProblems({ code: 200 }, { code: 404, text: '' })[0]).toContain('health check');
    expect(h.gas.siteWatchProblems(null, null)).toHaveLength(2);
  });

  it('stays dark until SITE_WATCH_ENABLED = true', () => {
    const { h, urls, mails } = gas({}, { inboxSyncAgeSec: 9999 });
    h.gas.watchSite();
    expect(urls).toHaveLength(0);
    expect(mails).toHaveLength(0);
  });

  it('when enabled, emails Max once and then holds for the hour', () => {
    const w = gas({ SITE_WATCH_ENABLED: 'true' }, { inboxSyncAgeSec: 3600 });
    w.h.gas.watchSite();
    expect(w.urls).toEqual(['https://realdarrentsai.com/', 'https://realdarrentsai.com/api/health']);
    expect(w.mails).toHaveLength(1);
    expect(w.mails[0].subject).toBe('Lead system status | realdarrentsai.com');
    expect(w.mails[0].body).toMatch(/^Hi Max,\n\nThe website needs attention\./);
    expect(w.mails[0].body).toContain('[ ] 1. Netlify > Deploys');
    expect(w.mails[0].body).toContain('60 minutes ago');
    delete w.props.SITE_WATCH_LAST_RUN; // past the 10-minute spacing, still inside the hour
    w.h.gas.watchSite();
    expect(w.mails).toHaveLength(1);
  });

  it('sends one all clear in the same thread once the site recovers', () => {
    const w = gas({ SITE_WATCH_ENABLED: 'true' }, { inboxSyncAgeSec: 3600 });
    w.h.gas.watchSite();
    const healthy = gas({ ...w.props, SITE_WATCH_LAST_RUN: '' }, { status: 'ok', inboxSyncAgeSec: 30 });
    healthy.h.gas.watchSite();
    expect(healthy.mails).toHaveLength(1);
    expect(healthy.mails[0].subject).toBe('Lead system status | realdarrentsai.com');
    expect(healthy.mails[0].body).toContain('All clear');
    delete healthy.props.SITE_WATCH_LAST_RUN;
    healthy.h.gas.watchSite();
    expect(healthy.mails).toHaveLength(1);
  });

  it('when enabled and healthy, sends nothing', () => {
    const w = gas({ SITE_WATCH_ENABLED: 'true' }, { status: 'ok', inboxSyncAgeSec: 30 });
    w.h.gas.watchSite();
    expect(w.mails).toHaveLength(0);
  });
});
