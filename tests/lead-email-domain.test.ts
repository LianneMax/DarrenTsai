/**
 * The email domain check in netlify/functions/lead.mts.
 *
 * WHY IT EXISTS. Resend refuses an address whose domain cannot receive mail
 * (422 "Invalid `to` field"). That happens inside the follow-up queue, up to a
 * minute after the form has said "thanks" and the visitor has gone, so nobody
 * can fix it. This check runs while they are still looking at the form.
 *
 * WHAT THESE TESTS ARE REALLY FOR. The dangerous failure is not a missed typo,
 * it is refusing a real lead. Most of what follows pins the fail-open rule: a
 * timeout, a SERVFAIL, a thrown resolver, an odd-looking address - every one of
 * them must still save the lead. The resolver is injected, so nothing here
 * touches the network.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/** What the fake resolver does next, per method. */
type Answer = { ok: unknown[] } | { err: string } | { hang: true };
const answers: { mx: Answer; a: Answer } = { mx: { ok: [{ exchange: 'mx.test', priority: 10 }] }, a: { ok: ['1.2.3.4'] } };
let resolverCalls = 0;

function play(answer: Answer) {
  if ('hang' in answer) return new Promise(() => {}); // never settles
  if ('err' in answer) {
    const e = new Error(answer.err) as Error & { code: string };
    e.code = answer.err;
    return Promise.reject(e);
  }
  return Promise.resolve(answer.ok);
}

const fakeResolver = () => ({
  resolveMx(_d: string) { resolverCalls++; return play(answers.mx) as Promise<unknown[]>; },
  resolve4(_d: string) { return play(answers.a) as Promise<string[]>; },
  cancel() {},
});

import handler, { emailDomain, __setResolverFactory } from '../netlify/functions/lead.mts';

const UPSTREAM = 'https://script.google.com/macros/s/TEST/exec';
let calls: string[] = [];

function req(body: unknown) {
  return new Request('https://realdarrentsai.com/api/lead', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://realdarrentsai.com' },
    body: JSON.stringify(body),
  });
}
const lead = (email: string) => ({ firstName: 'Jane', phone: '5551234567', email, source: 'dscr' });
const ctx = {} as never;
const saved = () => calls.includes(UPSTREAM);

beforeEach(() => {
  calls = [];
  resolverCalls = 0;
  __setResolverFactory(fakeResolver);
  answers.mx = { ok: [{ exchange: 'mx.test', priority: 10 }] };
  answers.a = { ok: ['1.2.3.4'] };
  vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request) => {
    calls.push(String(url));
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  }));
  vi.stubGlobal('Netlify', {
    env: { get: (k: string) => ({ APPS_SCRIPT_WEBHOOK_URL: UPSTREAM, RESEND_API_KEY: 're_test' })[k] },
  });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { __setResolverFactory(null); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('pulling the domain out of an address', () => {
  it.each([
    ['jane@gmail.com', 'gmail.com'],
    ['Jane.Doe+tag@Example.CO.UK', 'example.co.uk'],
    ['  jane@gmail.com  ', 'gmail.com'],
  ])('%s -> %s', (input, expected) => expect(emailDomain(input)).toBe(expected));

  it.each(['jane', 'jane@', '@gmail.com', 'jane@localhost', 'jane@gmail.com.', 'jane@ gmail.com', '', null, undefined, 42])(
    'gives up on %s rather than guessing',
    (input) => expect(emailDomain(input)).toBeNull(),
  );
});

describe('refuses only a domain that certainly cannot receive mail', () => {
  it('refuses when DNS says the domain does not exist', async () => {
    answers.mx = { err: 'ENOTFOUND' };
    answers.a = { err: 'ENOTFOUND' };
    const res = await handler(req(lead('jane@thisdomaindoesnotexist.invalid')), ctx);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.field).toBe('email');
    expect(body.message).toContain('thisdomaindoesnotexist.invalid');
    // The point of refusing early: nothing was stored, so there is nothing to
    // clean up and the visitor can simply retype the address.
    expect(saved()).toBe(false);
  });

  it('accepts a domain with an MX record', async () => {
    const res = await handler(req(lead('jane@somecompany.io')), ctx);
    expect(res.status).toBe(200);
    expect(saved()).toBe(true);
  });

  it('accepts a domain with no MX but an A record, per RFC 5321', async () => {
    answers.mx = { err: 'ENODATA' };
    answers.a = { ok: ['93.184.216.34'] };
    const res = await handler(req(lead('jane@example.com')), ctx);
    expect(res.status).toBe(200);
    expect(saved()).toBe(true);
  });
});

describe('fails open — a real lead must never be turned away', () => {
  it.each(['SERVFAIL', 'ETIMEOUT', 'EAI_AGAIN', 'ECONNREFUSED', 'REFUSED'])(
    'saves the lead when DNS answers %s',
    async (code) => {
      answers.mx = { err: code };
      answers.a = { err: code };
      const res = await handler(req(lead('jane@somecompany.io')), ctx);
      expect(res.status).toBe(200);
      expect(saved()).toBe(true);
    },
  );

  it('saves the lead when the resolver never answers', async () => {
    answers.mx = { hang: true };
    answers.a = { hang: true };
    const res = await handler(req(lead('jane@slowdns.io')), ctx);
    expect(res.status).toBe(200);
    expect(saved()).toBe(true);
  }, 10_000);

  it('saves the lead when there is no email at all, only a phone', async () => {
    const res = await handler(req({ firstName: 'Jane', phone: '5551234567', source: 'dscr' }), ctx);
    expect(res.status).toBe(200);
    expect(saved()).toBe(true);
    expect(resolverCalls).toBe(0);
  });

  it('saves the lead when the address is too odd to parse a domain from', async () => {
    answers.mx = { err: 'ENOTFOUND' };
    answers.a = { err: 'ENOTFOUND' };
    const res = await handler(req(lead('jane@localhost')), ctx);
    expect(res.status).toBe(200);
    expect(resolverCalls).toBe(0);
  });
});

describe('cost', () => {
  it('does not look up the domains most leads use', async () => {
    for (const d of ['gmail.com', 'yahoo.com', 'icloud.com', 'outlook.com']) {
      await handler(req(lead(`jane@${d}`)), ctx);
    }
    expect(resolverCalls).toBe(0);
  });

  it('looks up a domain it does not know', async () => {
    await handler(req(lead('jane@somecompany.io')), ctx);
    expect(resolverCalls).toBe(1);
  });

  it('remembers a domain it has already refused', async () => {
    answers.mx = { err: 'ENOTFOUND' };
    answers.a = { err: 'ENOTFOUND' };
    await handler(req(lead('jane@gone.invalid')), ctx);
    await handler(req(lead('bob@gone.invalid')), ctx);
    expect(resolverCalls).toBe(1);
  });
});
