/**
 * TEST leads stay out of generate_lead (31 Oct 2026 QA review, audit item 3).
 *
 * A TEST submission fired generate_lead, the conversion Google Ads bids on.
 * /api/lead now marks a TEST lead's receipt and public/lead-request.js refuses
 * to claim its conversion. The website's rule must be Apps Script's rule, so
 * the first block evaluates the real deployed isTestLead() against ours.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { TEST_EMAILS, isTestLead } from '../src/utils/testLead';

vi.mock('@netlify/blobs', () => {
  const records = new Map<string, unknown>();
  return { getStore: () => ({
    get: async (key: string) => structuredClone(records.get(key) ?? null),
    getWithMetadata: async (key: string) => records.has(key) ? { data: structuredClone(records.get(key)), etag: '1', metadata: {} } : null,
    setJSON: async (key: string, value: unknown, options: { onlyIfNew?: boolean } = {}) => {
      if (options.onlyIfNew && records.has(key)) return { modified: false };
      records.set(key, structuredClone(value)); return { modified: true, etag: '1' };
    },
    delete: async (key: string) => { records.delete(key); },
    list: () => ({ async *[Symbol.asyncIterator]() { yield { blobs: [] }; } }),
  }) };
});

import handler from '../netlify/functions/lead.mts';

const gasSource = readFileSync('google-apps-script.js', 'utf8');
const gasIsTestLead = new Function(
  gasSource.match(/const TEST_EMAILS = \[[\s\S]*?\];/)![0] + '\n' +
  gasSource.match(/function isTestLead\(d\) \{[\s\S]*?\n\}/)![0] + '\nreturn isTestLead;',
)() as (d: unknown) => boolean;

describe('the website and Apps Script agree on what a TEST lead is', () => {
  it('lists the same test email addresses', () => {
    const listed = gasSource.match(/const TEST_EMAILS = \[([\s\S]*?)\];/)![1].match(/'[^']+'/g)!.map(s => s.slice(1, -1));
    expect(TEST_EMAILS).toEqual(listed);
  });
  it.each([
    [{ email: 'liannemaxbalbastro+qa-equity-oct31@gmail.com', phone: '7145550101' }],
    [{ email: 'LMBalbastro+x@Gmail.com' }],
    [{ email: 'real.person@gmail.com', phone: '(714) 555-0103' }],
    [{ email: 'real.person@gmail.com', phone: '+1 714 555 0199' }],
    [{ email: 'real.person@gmail.com', phone: '7145550200' }],
    [{ email: 'real.person@gmail.com', phone: '7148875432' }],
    [{ email: 'someone+liannemaxbalbastro@gmail.com' }],
    [{}],
    [null],
  ])('classifies %j the same way', lead => {
    expect(isTestLead(lead as never)).toBe(gasIsTestLead(lead));
  });
});

const lead = (id: string, over: Record<string, unknown> = {}) => ({
  submissionId: 'inbox1-' + id, formId: 'booking-prequal', source: 'home-contact', bookingGoal: 'equity',
  firstName: 'TEST Flag', lastName: 'Receipt', email: 'qa@gmail.com', phone: '7145550101', propertyState: 'CA', propertyUse: 'primary',
  propertyType: 'single-family-condo', mortgageCurrent: 'yes', recentBankruptcyForeclosure: 'no', privacyAcknowledged: true,
  privacyVersion: '2026-10-13-v1', timestamp: '2026-10-31T04:00:00Z', smsConsent: false, smsInformationalConsent: false, smsMarketingConsent: false,
  ...over,
});
const request = (body: unknown) => new Request('https://realdarrentsai.com/api/lead', { method: 'POST', headers: { origin: 'https://realdarrentsai.com', 'content-type': 'application/json' }, body: JSON.stringify(body) });

describe('/api/lead marks a TEST lead in its saved receipt', () => {
  beforeEach(() => {
    vi.stubGlobal('Netlify', { env: { get: (key: string) => ({ APPS_SCRIPT_WEBHOOK_URL: 'https://script.google.com/macros/s/TEST/exec', LEAD_PROXY_KEY: 'private-test-key' } as Record<string, string>)[key] } });
    vi.stubGlobal('fetch', vi.fn(async () => { throw Error('Sheet unavailable'); }));
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it('flags a TEST phone and still saves it with the normal next step', async () => {
    const response = await handler(request(lead('flag-test-phone')), { ip: '203.0.113.20' } as never);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, receipt: 'saved', storage: 'inbox', test: true });
  });
  it('flags a test email family address', async () => {
    const response = await handler(request(lead('flag-test-email', { email: 'liannemaxbalbastro+qa@gmail.com', phone: '7148870000' })), { ip: '203.0.113.21' } as never);
    expect(await response.json()).toMatchObject({ receipt: 'saved', test: true });
  });
  it('leaves a real lead\'s receipt without the flag', async () => {
    const response = await handler(request(lead('flag-real', { firstName: 'Real', phone: '7148870000' })), { ip: '203.0.113.22' } as never);
    const receipt = await response.json();
    expect(receipt).toMatchObject({ ok: true, receipt: 'saved' });
    expect(receipt).not.toHaveProperty('test');
  });
});

describe('the browser never claims a TEST lead\'s conversion', () => {
  const source = readFileSync('public/lead-request.js', 'utf8');
  const payload = { formId: 'dscr-magnet', email: 'x@example.com', phone: '7148870000', rent: 2400 };
  beforeEach(() => { sessionStorage.clear(); vi.stubGlobal('DTConsent', { isAllowed: () => true }); delete window.DTLead; new Function(source)(); });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  async function submitWith(extra: Record<string, unknown>) {
    const id = window.DTLead!.prepare('dscr-magnet', payload).submissionId;
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true, receipt: 'saved', submissionId: id, ...extra }))));
    return window.DTLead!.submit('dscr-magnet', payload);
  }

  it('refuses the conversion for a receipt marked test, while the save still confirms', async () => {
    const response = await submitWith({ test: true });
    expect(response.ok).toBe(true);
    expect(window.DTLead!.attribution('dscr-magnet', response)).not.toEqual({});
    expect(window.DTLead!.claimConversion('dscr-magnet', response)).toBe(false);
  });
  it('still claims exactly one conversion for a real lead', async () => {
    const response = await submitWith({});
    expect(window.DTLead!.claimConversion('dscr-magnet', response)).toBe(true);
    expect(window.DTLead!.claimConversion('dscr-magnet', response)).toBe(false);
  });
  it('treats only a literal true as test', async () => {
    const response = await submitWith({ test: 'yes' });
    expect(window.DTLead!.claimConversion('dscr-magnet', response)).toBe(true);
  });
});
