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

import handler, { buildRescueEmail, readHutk } from '../netlify/functions/lead.mts';

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
const LEAD = { firstName: 'Jane', email: 'jane@gmail.com', phone: '7145550123', source: 'dscr' };

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
        ({ APPS_SCRIPT_WEBHOOK_URL: UPSTREAM, LEAD_PROXY_KEY: 'private-test-key', RESEND_API_KEY: 're_test', SITE_NAME: 'site' })[k],
    },
  });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  if (vi.isFakeTimers()) vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const ctx = {} as never;

describe('request guards', () => {
  it('fails closed without either server authentication key without enabling public alert-email abuse', async () => {
    vi.stubGlobal('Netlify', {env:{get:(k:string)=>({APPS_SCRIPT_WEBHOOK_URL:UPSTREAM,RESEND_API_KEY:'re_test'})[k]}});
    const response = await handler(req({...LEAD,submissionId:'12345678-1234-4234-8234-123456789012'}),ctx);
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ok:false,receipt:'rejected',code:'proxy_auth_not_configured'});
    expect(upstreamCalled()).toBe(false); expect(rescueSent()).toBe(false);
  });
  it('retains the configured confirmation-key fallback during staged key rotation', async () => {
    vi.stubGlobal('Netlify',{env:{get:(k:string)=>({APPS_SCRIPT_WEBHOOK_URL:UPSTREAM,CONTACT_CONFIRM_API_KEY:'fallback-test-key'})[k]}});
    expect((await handler(req(LEAD),ctx)).status).toBe(200);
    expect(JSON.parse(String(calls.find(c=>c.url===UPSTREAM)!.init.body))._proxyKey).toBe('fallback-test-key');
  });
  it('uses a nonblank fallback when the primary is whitespace, preserving exact secret bytes', async () => {
    vi.stubGlobal('Netlify',{env:{get:(k:string)=>({APPS_SCRIPT_WEBHOOK_URL:UPSTREAM,LEAD_PROXY_KEY:'  ',CONTACT_CONFIRM_API_KEY:' fallback-test-key '})[k]}});
    expect((await handler(req(LEAD),ctx)).status).toBe(200);
    expect(JSON.parse(String(calls.find(c=>c.url===UPSTREAM)!.init.body))._proxyKey).toBe(' fallback-test-key ');
  });
  it('maps the upstream explicit missing-auth configuration rejection without a rescue email', async () => {
    responses=[new Response('{"success":false,"code":"proxy_auth_not_configured"}')];
    const response=await handler(req(LEAD),ctx);
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ok:false,receipt:'rejected',code:'proxy_auth_not_configured'});
    expect(rescueSent()).toBe(false);
  });
  it('rejects omitted screening when enforcement is enabled, without saving or emailing', async () => {
    vi.stubGlobal('Netlify', { env: { get: (k: string) => k === 'SERVICE_AREA_REQUIRED' ? 'true' : k === 'APPS_SCRIPT_WEBHOOK_URL' ? UPSTREAM : '' } });
    const response = await handler(req(LEAD), ctx);
    expect(response.status).toBe(422);
    expect(upstreamCalled()).toBe(false); expect(rescueSent()).toBe(false);
  });
  it('ignores a forged supported result for an unsupported property state', async () => {
    const response = await handler(req({ ...LEAD, propertyUse: 'primary', propertyState: 'NY', serviceAreaVersion: 'old', serviceAreaResult: 'supported' }), ctx);
    expect(response.status).toBe(422); expect(upstreamCalled()).toBe(false); expect(rescueSent()).toBe(false);
  });
  /**
   * The booking prequal shows Darren's calendar only to a lead that passes
   * (15 Oct 2026). A hand-built post must not get around it, whatever the
   * SERVICE_AREA_REQUIRED rollout switch says.
   */
  describe('booking-prequal', () => {
    const PREQUAL = {
      ...LEAD, formId: 'booking-prequal', source: 'home-contact', bookingGoal: 'equity',
      propertyUse: 'primary', propertyState: 'CA', serviceAreaVersion: 'v',
      propertyType: 'single-family-condo', mortgageCurrent: 'yes', recentBankruptcyForeclosure: 'no',
    };

    it('forwards a lead that passes', async () => {
      const response = await handler(req(PREQUAL), ctx);
      expect(response.status).toBe(200);
      expect(upstreamCalled()).toBe(true);
    });

    it('lets a buyer with no mortgage yet through', async () => {
      const response = await handler(req({ ...PREQUAL, mortgageCurrent: 'no-mortgage' }), ctx);
      expect(response.status).toBe(200);
    });

    it('refuses an unsupported state even with screening fields stripped', async () => {
      const { serviceAreaVersion: _omit, ...noVersion } = PREQUAL;
      const response = await handler(req({ ...noVersion, propertyState: 'NY' }), ctx);
      expect(response.status).toBe(422);
      expect((await response.json()).field).toBe('propertyState');
      expect(upstreamCalled()).toBe(false); expect(rescueSent()).toBe(false);
    });

    it.each([
      ['a mobile home or land', { propertyType: 'mobile-land' }],
      ['a mortgage that is not current', { mortgageCurrent: 'no' }],
      ['a recent bankruptcy or foreclosure', { recentBankruptcyForeclosure: 'yes' }],
      ['missing knockout answers', { mortgageCurrent: undefined, recentBankruptcyForeclosure: undefined }],
    ])('refuses %s without saving or emailing', async (_label, over) => {
      const response = await handler(req({ ...PREQUAL, ...over }), ctx);
      expect(response.status).toBe(422);
      expect((await response.json()).field).toBe('prequal');
      expect(upstreamCalled()).toBe(false); expect(rescueSent()).toBe(false);
    });

    it('takes a second home in a licensed state and refuses one anywhere else (policy v3)', async () => {
      expect((await handler(req({ ...PREQUAL, propertyUse: 'second-home', propertyState: 'FL' }), ctx)).status).toBe(200);
      const refused = await handler(req({ ...PREQUAL, propertyUse: 'second-home', propertyState: 'NV' }), ctx);
      expect(refused.status).toBe(422);
      expect((await refused.json()).field).toBe('propertyState');
    });

    it('refuses a booking with no goal, or one it does not know', async () => {
      for (const bookingGoal of [undefined, '', 'made-up']) {
        const response = await handler(req({ ...PREQUAL, bookingGoal }), ctx);
        expect(response.status, String(bookingGoal)).toBe(422);
      }
      expect(upstreamCalled()).toBe(false);
    });

    it('applies the goal: DSCR in OR passes, in NY and NH is refused; own-home rental is refused', async () => {
      const dscr = { ...PREQUAL, bookingGoal: 'dscr', propertyUse: 'investment' };
      expect((await handler(req({ ...dscr, propertyState: 'OR' }), ctx)).status).toBe(200);
      for (const st of ['NY', 'NH']) expect((await handler(req({ ...dscr, propertyState: st }), ctx)).status, st).toBe(422);
      expect((await handler(req({ ...PREQUAL, bookingGoal: 'own-home', propertyUse: 'investment', propertyState: 'TX' }), ctx)).status).toBe(422);
    });

    it('takes an equity rental used as collateral on either list (OH, OR) and refuses it in NY', async () => {
      const rental = { ...PREQUAL, bookingGoal: 'equity', propertyUse: 'investment' };
      for (const st of ['OH', 'OR']) expect((await handler(req({ ...rental, propertyState: st }), ctx)).status, st).toBe(200);
      expect((await handler(req({ ...rental, propertyState: 'NY' }), ctx)).status).toBe(422);
    });

    it('sets the review flag on the server from the goal, whatever the browser sent', async () => {
      await handler(req({ ...PREQUAL, bookingGoal: 'commercial', propertyUse: 'investment', propertyState: 'OH', reviewFlag: '' }), ctx);
      const sent = JSON.parse(String(calls.find((c) => c.url === UPSTREAM)!.init!.body));
      expect(sent).toMatchObject({ bookingGoal: 'commercial', reviewFlag: 'Yes' });
      calls = [];
      await handler(req({ ...PREQUAL, reviewFlag: 'Yes' }), ctx);
      expect(JSON.parse(String(calls.find((c) => c.url === UPSTREAM)!.init!.body)).reviewFlag).toBe('');
    });

    it('requires an explanation for not-sure before an upstream write', async () => {
      for (const message of [undefined, '   ', 42, 'x'.repeat(2001)]) {
        expect((await handler(req({ ...PREQUAL, bookingGoal: 'not-sure', message }), ctx)).status).toBe(422);
      }
      expect(upstreamCalled()).toBe(false);
      expect((await handler(req({ ...PREQUAL, bookingGoal: 'not-sure', message: 'I need help comparing my options.' }), ctx)).status).toBe(200);
    });

    it('holds /home-equity/ to the same rules', async () => {
      const equity = { ...PREQUAL, formId: 'home-equity-calculator', source: 'home-equity' };
      expect((await handler(req(equity), ctx)).status).toBe(200);
      const refused = await handler(req({ ...equity, recentBankruptcyForeclosure: 'yes' }), ctx);
      expect(refused.status).toBe(422);
    });

    it('leaves every other form alone', async () => {
      const response = await handler(req({ ...LEAD, mortgageCurrent: 'no' }), ctx);
      expect(response.status).toBe(200);
    });
  });

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

  it('rejects an unrelated Netlify site', async () => {
    const res = await handler(req(LEAD, { origin: 'https://unrelated.netlify.app' }), ctx);
    expect(res.status).toBe(403);
    expect(upstreamCalled()).toBe(false);
  });

  it('adds only the configured server credential to the upstream payload', async () => {
    vi.stubGlobal('Netlify', { env: { get: (k: string) => ({ APPS_SCRIPT_WEBHOOK_URL: UPSTREAM, LEAD_PROXY_KEY: 'private-test-key' })[k] } });
    await handler(req({ ...LEAD, _proxyKey: 'visitor-forgery' }), ctx);
    expect(JSON.parse(String(calls.find(c => c.url === UPSTREAM)!.init.body))).toEqual({ ...LEAD, _proxyKey: 'private-test-key' });
  });

  /**
   * The allowlist is the only thing keeping this endpoint from being a free
   * relay into Darren's Sheet, his CRM and his Resend sending domain. It was
   * tested from the easy direction only: one allowed host and one obviously
   * foreign one. These are the near-misses, which is what an abuser would
   * actually send.
   */
  it.each([
    'https://realdarrentsai.com.evil.com',
    'https://notrealdarrentsai.com',
    'https://realdarrentsai.com.attacker.io',
    'https://evil.netlify.app.attacker.com',
    'https://netlify.app',
    'https://evilnetlify.app',
    'not a url at all',
  ])('rejects the lookalike origin %s', async (origin) => {
    const res = await handler(req(LEAD, { origin }), ctx);
    expect(res.status).toBe(403);
    expect(upstreamCalled()).toBe(false);
  });

  it.each([
    'https://realdarrentsai.com',
    'https://www.realdarrentsai.com',
    'https://REALDARRENTSAI.COM',
    'https://realdarrentsai.com:443',
  ])('allows the real site as %s', async (origin) => {
    expect((await handler(req(LEAD, { origin }), ctx)).status).toBe(200);
  });

  it('falls back to the referer when there is no origin header', async () => {
    // Some browsers omit Origin on a same-origin POST, which would 403 every
    // form on the site if the referer were not read too.
    const r = new Request('https://realdarrentsai.com/api/lead', {
      method: 'POST',
      headers: { 'content-type': 'application/json', referer: 'https://realdarrentsai.com/dscr/' },
      body: JSON.stringify(LEAD),
    });
    const res = await handler(r, ctx);
    expect(res.status).toBe(200);
    expect(upstreamCalled()).toBe(true);
  });

  it('does not send a rescue email for a request it refused', async () => {
    // A blocked origin is not a lost lead. Mailing on it would let anyone flood
    // the inbox the real alerts arrive in.
    await handler(req(LEAD, { origin: 'https://evil.example.com' }), ctx);
    expect(rescueSent()).toBe(false);
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

  /**
   * Refusing it is right; refusing it silently is not. Every form on the site
   * answers a 413 with "your details were passed to Darren, no need to submit
   * again", so something has to actually carry the lead out.
   */
  it('still rescues an oversized lead rather than dropping it silently', async () => {
    await handler(req({ ...LEAD, blob: 'x'.repeat(200_000) }), ctx);
    expect(rescueSent()).toBe(true);
  });

  it('requires an email or a phone', async () => {
    const res = await handler(req({ firstName: 'Jane' }), ctx);
    expect(res.status).toBe(400);
    expect(upstreamCalled()).toBe(false);
  });

  it('accepts a phone-only lead', async () => {
    const res = await handler(req({ phone: '7145550123' }), ctx);
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

  /**
   * The worst failure this endpoint has, and the one it used to handle worst.
   * A missing or renamed webhook variable takes every form on the site down at
   * once: nothing reaches the Sheet, nothing reaches HubSpot, and the visitor is
   * told not to submit again. Without this alert that can run for days unnoticed.
   */
  it('mails the lead when the webhook is unset, since nothing downstream has it', async () => {
    vi.stubGlobal('Netlify', {
      env: { get: (k: string) => (k === 'RESEND_API_KEY' ? 're_test' : undefined) },
    });
    const res = await handler(req(LEAD), ctx);
    expect(res.status).toBe(500);
    expect(upstreamCalled()).toBe(false);
    expect(rescueSent()).toBe(true);
  });

  // Production had APP_SCRIPT_WEBHOOK_URL set while the code read
  // APPS_SCRIPT_WEBHOOK_URL, which took every form on the site down with a 500.
  // Both spellings are accepted so a rename cannot repeat that.
  it.each(['APPS_SCRIPT_WEBHOOK_URL', 'APP_SCRIPT_WEBHOOK_URL'])(
    'reads the upstream URL from %s',
    async (varName) => {
      vi.stubGlobal('Netlify', {
        env: { get: (k: string) => (k === varName ? UPSTREAM : k === 'LEAD_PROXY_KEY' ? 'private-test-key' : k === 'RESEND_API_KEY' ? 're_test' : undefined) },
      });
      const res = await handler(req(LEAD), ctx);
      expect(res.status).toBe(200);
      expect(upstreamCalled()).toBe(true);
    },
  );
});

describe('the happy path', () => {
  it('returns the confirmed identity and replay marker without changing the request', async () => {
    const submissionId = '12345678-1234-4234-8234-123456789012';
    responses = [new Response(JSON.stringify({ success: true, submissionId, receipt: 'saved', replayed: true }))];
    const response = await handler(req({ ...LEAD, submissionId }), ctx);
    expect(await response.json()).toEqual({ ok: true, submissionId, receipt: 'saved', replayed: true });
    expect(JSON.parse(String(calls.find(c => c.url === UPSTREAM)!.init.body)).submissionId).toBe(submissionId);
  });
  it.each([
    ['submission_conflict', 409, 'rejected'],
    ['invalid_submission_id', 422, 'rejected'],
    ['capture_busy', 503, 'uncertain'],
  ])('maps upstream %s without a success state or rescue copy', async (code, status, receipt) => {
    const submissionId = '12345678-1234-4234-8234-123456789012';
    responses = [new Response(JSON.stringify({ success: false, code }))];
    const response = await handler(req({ ...LEAD, submissionId }), ctx);
    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({ ok: false, code, submissionId, receipt });
    expect(rescueSent()).toBe(false);
  });
  it.each([{}, { submissionId: 'another', receipt: 'saved' }, { submissionId: '12345678-1234-4234-8234-123456789012' }])('refuses an unverified ID receipt: %j', async fields => {
    const submissionId = '12345678-1234-4234-8234-123456789012';
    responses = [new Response(JSON.stringify({ success: true, ...fields }))];
    const response = await handler(req({ ...LEAD, submissionId }), ctx);
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ ok: false, receipt: 'uncertain', submissionId });
  });
  it('keeps the retry identity on a network timeout or unknown upstream outcome', async () => {
    const submissionId = '12345678-1234-4234-8234-123456789012';
    responses = [new Error('network disconnected')];
    const response = await handler(req({ ...LEAD, submissionId }), ctx);
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ ok: false, receipt: 'uncertain', submissionId });
  });
  it('rejects a malformed identity before upstream writes', async () => {
    const response = await handler(req({ ...LEAD, submissionId: '=unsafe' }), ctx);
    expect(response.status).toBe(422);
    expect(upstreamCalled()).toBe(false);
    expect(rescueSent()).toBe(false);
  });
  it('forwards the body verbatim and returns ok', async () => {
    responses = [new Response(JSON.stringify({ success: true }), { status: 200 })];
    const res = await handler(req(LEAD), ctx);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, receipt: 'saved', replayed: false });

    const forwarded = calls.find((c) => c.url === UPSTREAM)!;
    expect(JSON.parse(forwarded.init.body as string)).toEqual({...LEAD, _proxyKey:'private-test-key'});
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

  it('alerts only Max to check the Sheet on a timeout, since Apps Script keeps running', async () => {
    responses = [Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' })];
    const res = await handler(req(LEAD), ctx);
    expect(res.status).toBe(502);
    const rescue = calls.find((c) => c.url.includes('api.resend.com'))!;
    const body = JSON.parse(rescue.init.body as string);
    expect(body.to).toEqual(['liannemaxbalbastro@gmail.com']);
    expect(body.subject).toMatch(/Check the Sheet/);
    expect(body.subject).not.toMatch(/did not save/);
    expect(body.text).toContain('jane@gmail.com');
  });

  it('also sends definite capture-failure rescue messages only to Max', async () => {
    responses = [new Response('boom', { status: 500 })];
    await handler(req(LEAD), ctx);
    const rescue = calls.find(c => c.url.includes('api.resend.com'))!;
    expect(JSON.parse(String(rescue.init.body)).to).toEqual(['liannemaxbalbastro@gmail.com']);
  });

  it.each([12_000, null])('waits for a slow confirmation but still bounds an unreachable upstream: %s', async delay => {
    vi.useFakeTimers();
    vi.spyOn(AbortSignal, 'timeout').mockImplementation(ms => {
      const controller = new AbortController();
      setTimeout(() => controller.abort(new DOMException('Timed out', 'TimeoutError')), ms);
      return controller.signal;
    });
    const submissionId = '12345678-1234-4234-8234-123456789012';
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({url, init});
      if (url !== UPSTREAM) return new Response('{}');
      return new Promise<Response>((resolve, reject) => {
        const completion = delay === null ? undefined : setTimeout(() => resolve(new Response(JSON.stringify({
          success: true, receipt: 'saved', submissionId,
        }))), delay);
        init.signal!.addEventListener('abort', () => {
          clearTimeout(completion);
          reject(init.signal!.reason);
        }, {once:true});
      });
    }));
    let settled = false;
    const pending = handler(req({...LEAD,submissionId}),ctx).then(r => { settled = true; return r; });
    await vi.advanceTimersByTimeAsync(9_001);
    expect(settled).toBe(false);
    expect(rescueSent()).toBe(false);
    await vi.advanceTimersByTimeAsync(delay === null ? 17_000 : 3_000);
    const response = await pending;
    expect(response.status).toBe(delay === null ? 502 : 200);
    expect(await response.json()).toMatchObject({submissionId,receipt:delay === null ? 'uncertain' : 'saved'});
    expect(rescueSent()).toBe(delay === null);
    if (delay === null) {
      const rescue = calls.find(c => c.url.includes('api.resend.com'))!;
      expect(JSON.parse(String(rescue.init.body)).to).toEqual(['liannemaxbalbastro@gmail.com']);
    }
  });

  it('still returns 502 when the rescue email itself cannot be sent', async () => {
    // No RESEND_API_KEY: the visitor must still be told it failed rather than
    // being shown a success state.
    vi.stubGlobal('Netlify', { env: { get: (k: string) => (k === 'APPS_SCRIPT_WEBHOOK_URL' ? UPSTREAM : k === 'LEAD_PROXY_KEY' ? 'private-test-key' : undefined) } });
    responses = [new Response('boom', { status: 500 })];
    const res = await handler(req(LEAD), ctx);
    expect(res.status).toBe(502);
  });
});

/**
 * The rescue alert's formatting.
 *
 * This is the email Max reads when a lead may be lost, so the contact
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

  /**
   * The oversized-payload path rescues too, and that body is over 100,000
   * characters by definition. Embedded whole, in both the HTML and the text
   * part, it produces an alert about a lost lead that nobody can open.
   */
  it('caps an enormous raw payload in both parts, and says it did', () => {
    const huge = JSON.stringify({ ...JSON.parse(PAYLOAD), blob: 'x'.repeat(200_000) });
    const { html, text } = buildRescueEmail('Payload too large', huge, false);
    expect(html.length).toBeLessThan(huge.length);
    expect(text.length).toBeLessThan(huge.length);
    expect(text).toContain('[truncated,');
    expect(html).toContain('[truncated,');
    // The part that identifies the lead survives the cut.
    expect(text).toContain('jane@gmail.com');
  });

  it('leaves a normal payload untouched', () => {
    const { text } = buildRescueEmail('x', PAYLOAD, false);
    expect(text).not.toContain('[truncated,');
    expect(text).toContain(PAYLOAD);
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

/**
 * The HubSpot visitor cookie (audit H3). Apps Script cannot see the visitor's
 * cookies, so this is the only place hubspotutk can be read, and it is what
 * joins the HubSpot submission to the pageviews the tracking code recorded.
 */
describe('hubspotutk', () => {
  const HUTK = '0123456789abcdef0123456789abcdef';

  function withCookie(cookie: string) {
    return new Request('https://realdarrentsai.com/api/lead', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://realdarrentsai.com', cookie },
      body: JSON.stringify(LEAD),
    });
  }
  const forwarded = () => String(calls.find((c) => c.url === UPSTREAM)!.init.body);

  it('is passed to Apps Script as hutk, alongside the lead', async () => {
    const res = await handler(withCookie(`_ga=GA1.1.1; hubspotutk=${HUTK}; __hstc=abc`), ctx);
    expect(res.status).toBe(200);
    expect(JSON.parse(forwarded())).toEqual({ ...LEAD, hutk: HUTK, _proxyKey:'private-test-key' });
  });

  it('preserves every submitted field and adds server-only authentication when there is no cookie', async () => {
    await handler(req(LEAD), ctx);
    expect(JSON.parse(forwarded())).toEqual({...LEAD, _proxyKey:'private-test-key'});
  });

  it('wins over a hutk the body claims', async () => {
    const res = await handler(new Request('https://realdarrentsai.com/api/lead', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://realdarrentsai.com', cookie: `hubspotutk=${HUTK}` },
      body: JSON.stringify({ ...LEAD, hutk: 'ffffffffffffffffffffffffffffffff' }),
    }), ctx);
    expect(res.status).toBe(200);
    expect(JSON.parse(forwarded()).hutk).toBe(HUTK);
  });

  it('is dropped when it is not the 32 hex characters HubSpot issues', () => {
    expect(readHutk(`hubspotutk=${HUTK}`)).toBe(HUTK);
    expect(readHutk('hubspotutk=not-a-real-token')).toBeNull();
    expect(readHutk('xhubspotutk=' + HUTK)).toBeNull();
    expect(readHutk(null)).toBeNull();
    expect(readHutk('')).toBeNull();
  });
});

/**
 * 16 Oct 2026: the server holds the same email and US-phone line every form
 * applies, so a stale or hand-built request cannot save a malformed contact.
 */
describe('contact format', () => {
  it.each(['jane', 'jane@', '@gmail.com', 'jane@gmail', 'jane@gmail.c', 'ja ne@gmail.com'])('refuses the email %s with its own message, saving nothing', async (email) => {
    const res = await handler(req({ ...LEAD, email }), ctx);
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ field: 'email', message: 'Please enter a valid email address.' });
    expect(upstreamCalled()).toBe(false); expect(rescueSent()).toBe(false);
  });

  it.each(['123', '714555012', '71455501234', '1234567890', '0145550123', '9115550123', '7141110123', '7140110123', '+44 20 7946 0958'])('refuses the phone %s as not a US number', async (phone) => {
    const res = await handler(req({ ...LEAD, phone }), ctx);
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ field: 'phone', message: 'Please enter a valid US phone number.' });
    expect(upstreamCalled()).toBe(false); expect(rescueSent()).toBe(false);
  });

  it.each(['7145550123', '(714) 555-0123', '714-555-0123', '+1 (714) 555-0123', '1 714 555 0123'])('accepts the US number %s', async (phone) => {
    expect((await handler(req({ ...LEAD, phone }), ctx)).status).toBe(200);
  });

  it('still accepts an email-only lead and a phone-only lead', async () => {
    expect((await handler(req({ firstName: 'Jane', email: 'jane@gmail.com', source: 'dscr' }), ctx)).status).toBe(200);
    expect((await handler(req({ firstName: 'Jane', phone: '(714) 555-0123', source: 'dscr' }), ctx)).status).toBe(200);
  });
});


describe('Sheet-only booking inquiries, decided after acknowledgement', () => {
  const inquiry={...LEAD,lastName:'Doe',submissionId:'sheet-only-inquiry',formId:'booking-prequal',source:'home-contact',bookingGoal:'equity',propertyUse:'primary',propertyState:'CO',propertyType:'single-family-condo',mortgageCurrent:'yes',recentBankruptcyForeclosure:'no',privacyAcknowledged:true,privacyVersion:'2026-10-13-v1'};
  const receipt=(disposition: string|undefined='sheet-only')=>new Response(JSON.stringify({success:true,receipt:'saved',submissionId:inquiry.submissionId,...(disposition?{disposition}:{})}));
  it.each([['primary','CO','equity'],['investment','NY','dscr'],['second-home','NV','own-home']])('retains %s %s only after independent writer confirmation', async (propertyUse,propertyState,bookingGoal)=>{
    responses=[receipt()];
    const response=await handler(req({...inquiry,propertyUse,propertyState,bookingGoal,serviceAreaResult:'supported',captureDisposition:'supported'}),ctx);
    expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ok:true,receipt:'saved',submissionId:inquiry.submissionId,disposition:'sheet-only'});
    const sent=JSON.parse(String(calls.find(c=>c.url===UPSTREAM)!.init.body));
    expect(sent).toMatchObject({propertyState,propertyUse,serviceAreaResult:'out-of-market',captureDisposition:'sheet-only',privacyAcknowledged:true});
    expect(rescueSent()).toBe(false);
  });
  it.each([{privacyAcknowledged:false},{privacyAcknowledged:'true'},{privacyVersion:''},{submissionId:undefined},{email:''},{phone:''},{firstName:''},{lastName:''},{propertyState:'XX'},{bookingGoal:'own-home',propertyUse:'investment'},{mortgageCurrent:'maybe'},{propertyType:''},{recentBankruptcyForeclosure:''}])('rejects incomplete/invalid recording evidence before a write: %j', async fields=>{
    const response=await handler(req({...inquiry,...fields}),ctx);
    expect(response.status).toBe(422); expect(upstreamCalled()).toBe(false); expect(rescueSent()).toBe(false);
  });
  // 22 Oct (Max): outside the service area a failed knockout is still recorded.
  it.each([{mortgageCurrent:'no'},{recentBankruptcyForeclosure:'yes'},{propertyType:'mobile-land'}])('records an outside-area inquiry that fails a knockout: %j', async(fields)=>{
    responses=[receipt()];
    const response=await handler(req({...inquiry,...fields}),ctx);
    expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ok:true,disposition:'sheet-only'});
    expect(JSON.parse(String(calls.find(c=>c.url===UPSTREAM)!.init.body))).toMatchObject({...fields,captureDisposition:'sheet-only'});
  });
  it.each([{mortgageCurrent:'no'},{recentBankruptcyForeclosure:'yes'},{propertyType:'mobile-land'}])('still refuses an in-area booking that fails a knockout: %j', async(fields)=>{
    const response=await handler(req({...inquiry,propertyState:'CA',...fields}),ctx);
    expect(response.status).toBe(422); expect(await response.json()).toMatchObject({field:'prequal'}); expect(upstreamCalled()).toBe(false);
  });
  it('does not permit client Sheet-only flags to bypass supported DSCR delivery', async()=>{
    responses=[receipt('')];
    const response=await handler(req({...inquiry,bookingGoal:'dscr',propertyUse:'investment',captureDisposition:'sheet-only',disposition:'sheet-only'}),ctx);
    expect(response.status).toBe(200); expect(await response.json()).not.toHaveProperty('disposition');
    const sent=JSON.parse(String(calls.find(c=>c.url===UPSTREAM)!.init.body));
    expect(sent.serviceAreaResult).toBe('supported'); expect(sent).not.toHaveProperty('captureDisposition');expect(sent).not.toHaveProperty('disposition');
  });
  it('fails safely when an older writer does not acknowledge Sheet-only handling',async()=>{
    responses=[receipt(''),new Response('{}')];
    const response=await handler(req(inquiry),ctx);
    expect(response.status).toBe(502);expect(await response.json()).toMatchObject({receipt:'uncertain',submissionId:inquiry.submissionId});
  });
  it('does not widen unsupported capture to calculators',async()=>{
    const response=await handler(req({...inquiry,formId:'home-equity-calculator'}),ctx);
    expect(response.status).toBe(422);expect(upstreamCalled()).toBe(false);
  });
});
