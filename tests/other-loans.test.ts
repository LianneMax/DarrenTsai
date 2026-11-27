/**
 * "Any other loans on this home?" (28 Nov 2026, Max). Optional on /home-equity/
 * step 2. The answer rides in the lead, lands in the Sheet's Other Loans column,
 * shows on Darren's HubSpot call task, and the endpoint accepts only the listed
 * values. It does not change any estimate on the page.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildEquityLead } from '../src/utils/homeEquity';
import { OTHER_LOANS, OTHER_LOAN_VALUES } from '../src/utils/serviceArea';
import { loadGas, TEST_PROXY_KEY } from './helpers/gas-harness';
import handler from '../netlify/functions/lead.mts';

const BASE_LEAD = {
  firstName: 'Jordan', lastName: 'Reyes', phone: '(714) 555-2142', email: 'jordan@example.com',
  homeValue: 650000, mortgageBalance: 300000, propertyType: 'single-family-condo', propertyUse: 'primary',
  propertyZip: '92646', propertyState: 'CA', goal: 'Debt payoff', creditRange: '720+', cashRange: '$25k-75k',
  mortgageCurrent: 'yes', recentBankruptcyForeclosure: 'no', preference: '',
};

describe('the payload', () => {
  it('carries the answer, or blank when skipped, and leaves the numbers alone', () => {
    const withAnswer = buildEquityLead({ ...BASE_LEAD, otherLoans: 'heloc' });
    const skipped = buildEquityLead(BASE_LEAD);
    expect(withAnswer.otherLoans).toBe('heloc');
    expect(skipped.otherLoans).toBe('');
    expect(withAnswer.estimatedEquity).toBe(skipped.estimatedEquity);
    expect(withAnswer.currentLtv).toBe(skipped.currentLtv);
  });

  it('offers four plain answers', () => {
    expect(OTHER_LOANS.map(([, label]) => label)).toEqual(['No other loans', 'A HELOC', 'A second mortgage or home equity loan', 'Not sure']);
  });
});

describe('the Sheet and the HubSpot task', () => {
  type Runtime = { doPost: (e: unknown) => { __body: string }; hubspotTaskContent: (d: Record<string, unknown>) => { body: string } };
  const load = () => loadGas<Runtime>({
    exports: ['doPost', 'hubspotTaskContent'], props: { LEAD_PROXY_KEY: TEST_PROXY_KEY },
    fetch: () => { throw new Error('no HTTP here'); },
  });

  it('writes the answer under Other Loans on the Home Equity tab', () => {
    const h = load();
    const res = JSON.parse(h.gas.doPost({ postData: { contents: JSON.stringify({ ...buildEquityLead({ ...BASE_LEAD, otherLoans: 'second' }), _proxyKey: TEST_PROXY_KEY }) } }).__body);
    expect(res.success).toBe(true);
    expect(h.rowOf('Home Equity')['Other Loans']).toBe('second');
  });

  it('names the answer on the call task, and says nothing when skipped or unknown', () => {
    const h = load();
    expect(h.gas.hubspotTaskContent({ ...BASE_LEAD, otherLoans: 'heloc' }).body).toContain('Other loans on the home: a HELOC');
    expect(h.gas.hubspotTaskContent({ ...BASE_LEAD, otherLoans: '' }).body).not.toContain('Other loans');
    expect(h.gas.hubspotTaskContent({ ...BASE_LEAD, otherLoans: '<b>x</b>' }).body).not.toContain('Other loans');
  });
});

describe('the endpoint', () => {
  const UPSTREAM = 'https://script.google.com/macros/s/TEST/exec';
  let upstream = 0;
  beforeEach(() => {
    upstream = 0;
    vi.stubGlobal('fetch', vi.fn(async (url: string) => { if (String(url) === UPSTREAM) upstream++; return new Response(JSON.stringify({ success: true }), { status: 200 }); }));
    vi.stubGlobal('Netlify', { env: { get: (k: string) => ({ APPS_SCRIPT_WEBHOOK_URL: UPSTREAM, LEAD_PROXY_KEY: 'k', RESEND_API_KEY: 're_test' })[k] } });
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
  const post = (body: unknown) => handler(new Request('https://realdarrentsai.com/api/lead', {
    method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://realdarrentsai.com' }, body: JSON.stringify(body),
  }), {} as never);
  const LEAD = { firstName: 'Jane', email: 'jane@gmail.com', phone: '7145552123', source: 'dscr' };

  it('refuses anything but the listed answers, without forwarding', async () => {
    for (const bad of ['heloc; DROP TABLE', 'yes', 3]) {
      const res = await post({ ...LEAD, otherLoans: bad });
      expect(res.status).toBe(422);
      expect(await res.json()).toMatchObject({ field: 'otherLoans' });
    }
    expect(upstream).toBe(0);
  });

  it('accepts each listed answer and a blank one', async () => {
    for (const ok of [...OTHER_LOAN_VALUES, '']) expect((await post({ ...LEAD, otherLoans: ok })).status).toBe(200);
  });
});
