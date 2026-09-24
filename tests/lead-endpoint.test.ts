/**
 * Tests for netlify/functions/lead.mts.
 *
 * This endpoint is the only thing standing between a paid click and a silently
 * lost lead, so the failure paths matter more than the happy path. Each test
 * asserts both the status the visitor's browser sees AND whether the rescue
 * email fired, because "returned 502" without the rescue email would still mean
 * the lead is gone.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

import handler, { buildRescueEmail } from '../netlify/functions/lead.mts';

const UPSTREAM = 'https://script.google.com/macros/s/TEST/exec';

type Call = { url: string; init: RequestInit };
let calls: Call[] = [];

/** Queue of responses the mocked fetch hands back, in order. */
let responses: Array<Response | Error> = [];

function mockFetch() {
  return vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const next = responses.shift();
    if (!next) return new Response(JSON.stringify({ success: true }), { status: 200 });
    if (next instanceof Error) throw next;
    return next;
  });
}

function req(body: unknown, opts: { method?: string; origin?: string | null } = {}) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  const origin = opts.origin === undefined ? 'https://realdarrentsai.com' : opts.origin;
  if (origin) headers.origin = origin;
  return new Request('https://realdarrentsai.com/api/lead', {
    method: opts.method ?? 'POST',
    headers,
    body: opts.method === 'GET' ? undefined : JSON.stringify(body),
  });
}

// gmail.com is on the endpoint's known-good list, so these tests never reach
// the DNS resolver. The domain check has its own file: lead-email-domain.test.ts.
const LEAD = { firstName: 'Jane', email: 'jane@gmail.com', phone: '5551234567', source: 'dscr' };

/** Did the handler try to send the rescue email? */
function rescueSent() {
  return calls.some((c) => c.url.includes('api.resend.com'));
}
function upstreamCalled() {
  return calls.some((c) => c.url === UPSTREAM);
}

beforeEach(() => {
  calls = [];
  responses = [];
  vi.stubGlobal('fetch', mockFetch());
  vi.stubGlobal('Netlify', {
    env: {
      get: (k: string) =>
        ({ APPS_SCRIPT_WEBHOOK_URL: UPSTREAM, RESEND_API_KEY: 're_test' })[k],
    },
  });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const ctx = {} as never;

describe('request guards', () => {
  it('rejects GET with 405', async () => {
    const res = await handler(req(LEAD, { method: 'GET' }), ctx);
    expect(res.status).toBe(405);
    expect(upstreamCalled()).toBe(false);
  });

  it('rejects a request with no origin or referer', async () => {
    const res = await handler(req(LEAD, { origin: null }), ctx);
    expect(res.status).toBe(403);
    expect(upstreamCalled()).toBe(false);
  });

  it('rejects a foreign origin', async () => {
    const res = await handler(req(LEAD, { origin: 'https://evil.example.com' }), ctx);
    expect(res.status).toBe(403);
  });

  it('allows a Netlify deploy preview', async () => {
    const res = await handler(req(LEAD, { origin: 'https://deploy-preview-3--site.netlify.app' }), ctx);
    expect(res.status).toBe(200);
  });

  it('rejects malformed JSON', async () => {
    const bad = new Request('https://realdarrentsai.com/api/lead', {
      method: 'POST',
      headers: { origin: 'https://realdarrentsai.com', 'content-type': 'application/json' },
      body: '{not json',
    });
    const res = await handler(bad, ctx);
    expect(res.status).toBe(400);
    expect(upstreamCalled()).toBe(false);
  });

  it('rejects an oversized payload without forwarding it', async () => {
    const res = await handler(req({ ...LEAD, blob: 'x'.repeat(200_000) }), ctx);
    expect(res.status).toBe(413);
    expect(upstreamCalled()).toBe(false);
  });

  it('requires an email or a phone', async () => {
    const res = await handler(req({ firstName: 'Jane' }), ctx);
    expect(res.status).toBe(400);
    expect(upstreamCalled()).toBe(false);
  });

  it('accepts a phone-only lead', async () => {
    const res = await handler(req({ phone: '5551234567' }), ctx);
    expect(res.status).toBe(200);
  });
});

describe('honeypot', () => {
  it('silently accepts and does not forward when the trap field is filled', async () => {
    const res = await handler(req({ ...LEAD, company: 'Acme Spam Co' }), ctx);
    // 200 on purpose: a bot must not learn that it was caught.
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(upstreamCalled()).toBe(false);
    expect(rescueSent()).toBe(false);
  });

  it('ignores an empty honeypot field from a real submission', async () => {
    const res = await handler(req({ ...LEAD, company: '   ' }), ctx);
    expect(res.status).toBe(200);
    expect(upstreamCalled()).toBe(true);
  });
});

describe('configuration', () => {
  it('fails loudly when the upstream URL is not configured', async () => {
    vi.stubGlobal('Netlify', { env: { get: () => undefined } });
    const res = await handler(req(LEAD), ctx);
    expect(res.status).toBe(500);
    expect(upstreamCalled()).toBe(false);
  });

  // Production had APP_SCRIPT_WEBHOOK_URL set while the code read
  // APPS_SCRIPT_WEBHOOK_URL, which took every form on the site down with a 500.
  // Both spellings are accepted so a rename cannot repeat that.
  it.each(['APPS_SCRIPT_WEBHOOK_URL', 'APP_SCRIPT_WEBHOOK_URL'])(
    'reads the upstream URL from %s',
    async (varName) => {
      vi.stubGlobal('Netlify', {
        env: { get: (k: string) => (k === varName ? UPSTREAM : k === 'RESEND_API_KEY' ? 're_test' : undefined) },
      });
      const res = await handler(req(LEAD), ctx);
      expect(res.status).toBe(200);
      expect(upstreamCalled()).toBe(true);
    },
  );
});

describe('the happy path', () => {
  it('forwards the body verbatim and returns ok', async () => {
    responses = [new Response(JSON.stringify({ success: true }), { status: 200 })];
    const res = await handler(req(LEAD), ctx);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    const forwarded = calls.find((c) => c.url === UPSTREAM)!;
    expect(JSON.parse(forwarded.init.body as string)).toEqual(LEAD);
    expect(forwarded.init.redirect).toBe('follow'); // the 302 to googleusercontent must be followed
    expect(rescueSent()).toBe(false);
  });

  it('passes attribution fields through untouched', async () => {
    const withAttr = { ...LEAD, clickId: 'ABC123', clickIdType: 'gclid', utm_campaign: 'heloc-q4' };
    await handler(req(withAttr), ctx);
    const forwarded = calls.find((c) => c.url === UPSTREAM)!;
    const body = JSON.parse(forwarded.init.body as string);
    expect(body.clickId).toBe('ABC123');
    expect(body.utm_campaign).toBe('heloc-q4');
  });
});

describe('failure paths — a lead must never be lost silently', () => {
  it('returns 502 and rescues the lead on an upstream 500', async () => {
    responses = [new Response('boom', { status: 500 })];
    const res = await handler(req(LEAD), ctx);
    expect(res.status).toBe(502);
    expect(rescueSent()).toBe(true);
  });

  it('treats {success:false} on a 200 as a failure', async () => {
    // Apps Script catches its own exceptions and answers 200 with success:false,
    // so a 2xx alone is not proof the lead was stored.
    responses = [new Response(JSON.stringify({ success: false, error: 'sheet locked' }), { status: 200 })];
    const res = await handler(req(LEAD), ctx);
    expect(res.status).toBe(502);
    expect(rescueSent()).toBe(true);
  });

  it('treats an unparseable upstream body as a failure', async () => {
    responses = [new Response('<html>Google sign-in</html>', { status: 200 })];
    const res = await handler(req(LEAD), ctx);
    expect(res.status).toBe(502);
    expect(rescueSent()).toBe(true);
  });

  it('rescues the lead when the upstream is unreachable', async () => {
    responses = [new TypeError('network down')];
    const res = await handler(req(LEAD), ctx);
    expect(res.status).toBe(502);
    expect(rescueSent()).toBe(true);
  });

  it('includes the raw submission in the rescue email so it is recoverable by hand', async () => {
    responses = [new Response('boom', { status: 500 })];
    await handler(req(LEAD), ctx);
    const rescue = calls.find((c) => c.url.includes('api.resend.com'))!;
    const body = JSON.parse(rescue.init.body as string);
    expect(body.text).toContain('jane@gmail.com');
    expect(body.subject).toMatch(/did not save/);
  });

  it('tells Darren to check the Sheet on a timeout, not to re-enter, since Apps Script keeps running', async () => {
    responses = [Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' })];
    const res = await handler(req(LEAD), ctx);
    expect(res.status).toBe(502);
    const rescue = calls.find((c) => c.url.includes('api.resend.com'))!;
    const body = JSON.parse(rescue.init.body as string);
    expect(body.subject).toMatch(/Check the Sheet/);
    expect(body.subject).not.toMatch(/did not save/);
    expect(body.text).toContain('jane@gmail.com');
  });

  it('still returns 502 when the rescue email itself cannot be sent', async () => {
    // No RESEND_API_KEY: the visitor must still be told it failed rather than
    // being shown a success state.
    vi.stubGlobal('Netlify', { env: { get: (k: string) => (k === 'APPS_SCRIPT_WEBHOOK_URL' ? UPSTREAM : undefined) } });
    responses = [new Response('boom', { status: 500 })];
    const res = await handler(req(LEAD), ctx);
    expect(res.status).toBe(502);
  });
});

/**
 * The rescue alert's formatting.
 *
 * This is the email Darren reads when a lead may be lost, so the contact
 * details have to survive every shape a payload can arrive in — including the
 * one where it is not JSON at all and the raw block is the only record.
 */
describe('buildRescueEmail', () => {
  const PAYLOAD = JSON.stringify({
    firstName: 'Jane',
    lastName: 'Doe',
    email: 'jane@gmail.com',
    phone: '(714) 555-0123',
    state: 'CA',
    source: 'dscr',
    utm_campaign: 'yt-dscr',
    monthlyRent: 2400,
    debts: [{ type: 'Credit Card', bal: 8500 }],
  });

  it('says what to do and who it is about, with no internal jargon', () => {
    const { subject } = buildRescueEmail('Timed out after 9000ms', PAYLOAD, true);
    expect(subject).toBe('Check the Sheet for Jane Doe - lead may not have saved');
  });

  it('makes the email and phone tappable', () => {
    const { html } = buildRescueEmail('Timed out after 9000ms', PAYLOAD, true);
    expect(html).toContain('mailto:jane@gmail.com');
    expect(html).toContain('tel:7145550123'); // dialable, formatting stripped
  });

  it('shows attribution and any unexpected field rather than dropping it', () => {
    const { html } = buildRescueEmail('Apps Script reported failure: x', PAYLOAD, false);
    expect(html).toContain('yt-dscr');
    expect(html).toContain('monthlyRent');
    expect(html).toContain('2400');
  });

  it('says what to do, and the two cases say different things', () => {
    const unknown = buildRescueEmail('Timed out after 9000ms', PAYLOAD, true);
    const notSaved = buildRescueEmail('Apps Script returned HTTP 500', PAYLOAD, false);
    expect(unknown.html).toContain('Search the Sheet for this email first');
    expect(notSaved.html).toContain('Enter this lead by hand');
    expect(notSaved.subject).toBe('Add Jane Doe by hand - lead did not save');
  });

  it('keeps the raw payload and a plain-text part', () => {
    const { html, text } = buildRescueEmail('Timed out after 9000ms', PAYLOAD, true);
    expect(html).toContain('Raw submission');
    expect(text).toContain('jane@gmail.com');
    expect(text).toContain('Timed out after 9000ms');
  });

  it('still sends when the payload is not JSON', () => {
    const { subject, html, text } = buildRescueEmail('unparseable', '<not json>', false);
    expect(subject).toContain('a new lead');
    expect(html).toContain('could not be parsed');
    expect(html).toContain('&lt;not json&gt;'); // escaped, not injected
    expect(text).toContain('<not json>');
  });

  it('escapes payload values instead of letting them into the markup', () => {
    const evil = JSON.stringify({ firstName: '<script>alert(1)</script>', email: 'a@b.com' });
    const { html } = buildRescueEmail('x', evil, false);
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
