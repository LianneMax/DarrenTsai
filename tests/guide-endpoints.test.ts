/**
 * Tests for the three guide senders in netlify/functions/.
 *
 * These replace the string-matching tests patch 0003 shipped. Those asserted
 * that the source text contained `retryable ? 503 : 422`, which a function that
 * returned the right status and never sent the email would also pass. Here the
 * handler is actually invoked: fetch is stubbed, the real assets are served off
 * disk, and the assertion is on the Response the Apps Script queue would see.
 *
 * Why the status matters: the queue reads it to decide between retrying (Resend
 * is busy) and giving up and alerting Darren (the address will never work).
 * Getting it backwards means either a guide that is never retried or a lead
 * hammered with retries that cannot succeed.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import dscrHandler from '../netlify/functions/send-dscr-guide.mts';
import reiHandler from '../netlify/functions/send-rei-guide.mts';
import fhaHandler from '../netlify/functions/send-fha-guide.mts';

type Handler = (req: Request, context: unknown) => Promise<Response>;

const ENV: Record<string, string> = {
  RESEND_API_KEY: 're_test',
  DSCR_GUIDE_API_KEY: 'dscr_key',
  REI_GUIDE_API_KEY: 'rei_key',
  FHA_GUIDE_API_KEY: 'fha_key',
};

/** Files the functions fetch from the live site, served from the repo instead. */
const ASSETS: Record<string, string> = {
  'https://realdarrentsai.com/magnets/dscr-rate-cashflow-guide.pdf': 'public/magnets/dscr-rate-cashflow-guide.pdf',
  'https://realdarrentsai.com/magnets/real-estate-investing-case-study.pdf': 'public/magnets/real-estate-investing-case-study.pdf',
  'https://realdarrentsai.com/magnets/fha-affordability-calculator.xlsx': 'public/magnets/fha-affordability-calculator.xlsx',
  'https://realdarrentsai.com/fonts/Outfit-Regular.ttf': 'public/fonts/Outfit-Regular.ttf',
  'https://realdarrentsai.com/fonts/Outfit-SemiBold.ttf': 'public/fonts/Outfit-SemiBold.ttf',
  'https://realdarrentsai.com/fonts/Outfit-Bold.ttf': 'public/fonts/Outfit-Bold.ttf',
};

/** What Resend will answer next. Default: accepted. */
let resend: { status: number; body: string } = { status: 200, body: '{"id":"abc"}' };
let resendCalls: Array<{ body: Record<string, unknown> }> = [];

function stubFetch() {
  return vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const asset = ASSETS[url];
    if (asset) {
      const bytes = readFileSync(resolve(__dirname, '..', asset));
      return new Response(new Uint8Array(bytes), { status: 200 });
    }
    if (url.startsWith('https://api.resend.com/emails')) {
      resendCalls.push({ body: JSON.parse(String(init?.body ?? '{}')) });
      return new Response(resend.body, { status: resend.status });
    }
    throw new Error(`unexpected fetch in test: ${url}`);
  });
}

function req(handlerKey: string, body: unknown, opts: { key?: string | null; method?: string } = {}) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  const key = opts.key === undefined ? ENV[handlerKey] : opts.key;
  if (key) headers['x-api-key'] = key;
  return new Request('https://realdarrentsai.com/api/guide', {
    method: opts.method ?? 'POST',
    headers,
    body: opts.method === 'GET' ? undefined : JSON.stringify(body),
  });
}

beforeEach(() => {
  resend = { status: 200, body: '{"id":"abc"}' };
  resendCalls = [];
  vi.stubGlobal('fetch', stubFetch());
  vi.stubGlobal('Netlify', { env: { get: (k: string) => ENV[k] } });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.unstubAllGlobals());

const FUNCS: Array<[string, Handler, string, Record<string, string>]> = [
  ['send-dscr-guide', dscrHandler as Handler, 'DSCR_GUIDE_API_KEY',
    { firstName: 'Jane', lastName: 'Doe', email: 'jane@gmail.com', dscr: '1.25', downPayment: '20', rate: '7.1', loanAmount: '400000' }],
  ['send-rei-guide', reiHandler as Handler, 'REI_GUIDE_API_KEY',
    { firstName: 'Jane', lastName: 'Doe', email: 'jane@gmail.com' }],
  ['send-fha-guide', fhaHandler as Handler, 'FHA_GUIDE_API_KEY',
    { firstName: 'Jane', lastName: 'Doe', email: 'jane@gmail.com' }],
];

describe.each(FUNCS)('%s', (name, handler, keyName, lead) => {
  it('rejects a request without the shared key', async () => {
    const res = await handler(req(keyName, lead, { key: null }), {});
    expect(res.status).toBe(401);
    expect(resendCalls).toHaveLength(0);
  });

  it('rejects a request with the wrong key', async () => {
    const res = await handler(req(keyName, lead, { key: 'wrong' }), {});
    expect(res.status).toBe(401);
  });

  it('rejects a GET', async () => {
    expect((await handler(req(keyName, lead, { method: 'GET' }), {})).status).toBe(405);
  });

  it('requires an email', async () => {
    const res = await handler(req(keyName, { ...lead, email: '' }), {});
    expect(res.status).toBe(400);
    expect(resendCalls).toHaveLength(0);
  });

  it('sends the guide and reports 200', async () => {
    const res = await handler(req(keyName, lead), {});
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    // The status is worthless if nothing was actually sent.
    expect(resendCalls).toHaveLength(1);
    expect(resendCalls[0].body.to).toEqual(['jane@gmail.com']);
    expect((resendCalls[0].body.attachments as unknown[]).length).toBeGreaterThan(0);
  });

  it.each([429, 500, 502, 503])('returns 503 (retry) when Resend answers %i', async (status) => {
    resend = { status, body: 'rate limited' };
    const res = await handler(req(keyName, lead), {});
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe('email send failed');
    expect(body.resendStatus).toBe(status);
  });

  it.each([400, 401, 403, 422])('returns 422 (do not retry) when Resend answers %i', async (status) => {
    resend = { status, body: 'Invalid `to` field' };
    const res = await handler(req(keyName, lead), {});
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe('email rejected');
    expect(body.resendStatus).toBe(status);
    expect(body.detail).toContain('Invalid');
  });

  it('never answers 502, the old status the queue could not read', async () => {
    for (const status of [429, 422, 500, 403]) {
      resend = { status, body: 'x' };
      expect((await handler(req(keyName, lead), {})).status).not.toBe(502);
    }
  });
});
