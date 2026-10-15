import { describe, expect, it, vi, afterEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { serviceArea, serviceAreaWording, outOfMarketPage, INVESTMENT_STATES, BOOKING_GOALS } from '../src/utils/serviceArea';
import ServiceAreaFields from '../src/components/ServiceAreaFields';
import { useLeadSubmit } from '../src/hooks/useLeadSubmit';
import { loadGas } from './helpers/gas-harness';
import { readFileSync } from 'node:fs';
vi.mock('../src/utils/attribution', () => ({ getAttribution: () => ({ utm_source: 'youtube' }), track: vi.fn() }));
afterEach(() => { document.body.innerHTML = ''; vi.unstubAllGlobals(); });
describe('property service-area routing', () => {
  it.each(['home', 'debt-savings-calculator', 'home-equity-calculator', 'adu-calculator', 'mortgage-calculator-contact-modal', 'dscr-magnet', 'fha-magnet', 'rei-magnet'])('uses the intended state rules for %s', (source) => {
    expect(serviceArea('primary', 'CA', source)).toBe(source.includes('dscr') ? 'out-of-market' : 'supported');
    expect(serviceArea('primary', 'NY', source)).toBe('out-of-market');
    expect(serviceArea('investment', 'NY', source)).toBe('out-of-market');
    expect(serviceArea('investment', 'AL', source)).toBe(source.includes('fha') ? 'out-of-market' : 'supported');
  });
  it('checks the home being borrowed against: a rental used as collateral passes on either list', () => {
    expect(serviceArea('investment', 'AL', 'home-equity-calculator')).toBe('supported');
    expect(serviceArea('investment', 'OR', 'home-equity-contact')).toBe('supported');
    expect(serviceArea('investment', 'OR', 'dscr-magnet')).toBe('supported');
    expect(serviceArea('investment', 'NY', 'home-equity-calculator')).toBe('out-of-market');
  });
  it('static forms load the same policy and record an independent property state', async () => {
    document.body.innerHTML = '<div><div class="compliance-disclosure"><input data-privacy-form="static-test"></div></div>';
    const fake: {DTServiceArea?: {ready: () => boolean; validate: (id: string) => boolean; read: (id: string) => Record<string, unknown>}} = {};
    const policy = JSON.parse(readFileSync('public/service-area-policy.json', 'utf8'));
    new Function('window', 'document', 'fetch', readFileSync('public/service-area.js', 'utf8'))(fake, document, async () => ({ok: true, json: async () => policy}));
    await vi.waitFor(() => expect(fake.DTServiceArea?.ready()).toBe(true));
    const use = document.querySelector<HTMLSelectElement>('[data-property-use]')!;
    const state = document.querySelector<HTMLSelectElement>('[data-property-state]')!;
    use.value = 'investment'; state.value = 'NH'; expect(fake.DTServiceArea!.validate('static-test')).toBe(false);
    state.value = 'FL'; expect(fake.DTServiceArea!.validate('static-test')).toBe(true);
    expect(fake.DTServiceArea!.read('static-test')).toMatchObject({propertyState: 'FL', propertyUse: 'investment', serviceAreaResult: 'supported'});
  });
  it.each([['primary', 'OR', 'supported'], ['investment', 'OR', 'supported'], ['primary', 'NY', 'out-of-market'], ['investment', 'FL', 'supported'], ['investment', 'NH', 'out-of-market'], ['investment', 'DC', 'supported'], ['', 'CA', 'incomplete'], ['primary', '', 'incomplete']])('%s in %s returns %s', (use, state, result) => { expect(serviceArea(use, state)).toBe(result); });
  it('blocks unsupported review before posting and preserves legacy state/attribution for a supported property', async () => {
    document.body.innerHTML = renderToStaticMarkup(<ServiceAreaFields formId="test" />);
    const use = document.querySelector<HTMLSelectElement>('[data-property-use]')!;
    const state = document.querySelector<HTMLSelectElement>('[data-property-state]')!;
    use.value = 'primary'; state.value = 'NY';
    let sent: Record<string, unknown> = {};
    const fetchMock = vi.fn(async (_url, init) => { sent = JSON.parse(init.body); return new Response('{"success":true}'); });
    vi.stubGlobal('fetch', fetchMock);
    const submit = useLeadSubmit({ formId: 'test', thankYouPath: '/thanks', thankYouTitle: 'Thanks' });
    const data = { firstName: 'Test', lastName: '', email: 'test@example.com', phone: '7145550101', state: 'NY', source: 'home-contact', loanAmount: 200000 };
    expect(await submit(data)).toMatchObject({ ok: false, field: 'propertyState' }); expect(fetchMock).not.toHaveBeenCalled();
    state.value = 'CA'; expect(await submit(data)).toEqual({ ok: true });
    expect(sent).toMatchObject({ propertyState: 'CA', propertyUse: 'primary', state: 'NY', loanAmount: 200000, utm_source: 'youtube', serviceAreaResult: 'supported' });
  });
  it('preserves all calculator fields in CRM snapshots without copying secrets', () => {
    const { gas } = loadGas<{ leadSnapshot: (d: Record<string, unknown>) => Record<string, unknown>; callRailSubmission: (d: Record<string, unknown>, id: string) => {form_submission: {form_data: Record<string, unknown>}} }>({ exports: ['leadSnapshot', 'callRailSubmission'] });
    const data = { phone: '+17145550101', loanAmount: 100000, annualRate: 6, monthlyPayment: 599, propertyState: 'CA', propertyUse: 'primary', _proxyKey: 'secret', hutk: 'private-cookie' };
    expect(gas.leadSnapshot(data)).toEqual({ phone: data.phone, loanAmount: 100000, annualRate: 6, monthlyPayment: 599, propertyState: 'CA', propertyUse: 'primary' });
    expect(gas.callRailSubmission(data, 'company').form_submission.form_data).toMatchObject({ phone_number: data.phone, loanAmount: 100000, monthlyPayment: 599 });
  });
  it('adds configured HubSpot detail properties without removing existing tracking or writing blank answers', () => {
    const { gas } = loadGas<{hubspotFields: (d: Record<string, unknown>) => Array<{name: string; value: string}>}>({ exports: ['hubspotFields'], props: {HUBSPOT_DETAIL_FIELD_MAP: JSON.stringify({propertyState: 'rdt_property_state', submissionSnapshot: 'rdt_submission_snapshot', goal: 'rdt_goal'})} });
    const fields = gas.hubspotFields({email: 'test@example.com', source: 'home-equity', propertyState: 'CA', goal: '', homeValue: 500000});
    expect(fields).toContainEqual({objectTypeId: '0-1', name: 'rdt_property_state', value: 'CA'});
    expect(fields.some(f => f.name === 'rdt_lead_source' && f.value === 'home-equity')).toBe(true);
    expect(fields.some(f => f.name === 'rdt_goal')).toBe(false);
    expect(JSON.parse(fields.find(f => f.name === 'rdt_submission_snapshot')!.value)).toMatchObject({homeValue: 500000});
  });
});

/**
 * State rules, final (policy v3, 15 Oct 2026). The state checked is the state
 * of the property the loan is on. Primary or second home: the 8 licensed
 * states. Investment (DSCR, or a rental used as collateral): on either list.
 */
describe('state rules, final (policy v3)', () => {
  const POLICY = JSON.parse(readFileSync(__dirname + '/../public/service-area-policy.json', 'utf8'));
  const LICENSED = ['AZ', 'CA', 'FL', 'HI', 'OR', 'PA', 'TN', 'TX'];
  const NEITHER = ['ID', 'MN', 'ND', 'NH', 'NJ', 'NV', 'NY', 'SD', 'UT'];

  it('is version v3; investment passes on either list, which fails exactly 9 states', () => {
    expect(POLICY.version).toBe('2026-10-15-v3');
    expect([...POLICY.consumer].sort()).toEqual(LICENSED);
    expect([...INVESTMENT_STATES].sort()).toEqual(POLICY.states.filter((x: string) => !NEITHER.includes(x)).sort());
    expect(INVESTMENT_STATES).toHaveLength(42);
    expect(INVESTMENT_STATES).toContain('OR');
  });

  it.each(['home-equity', 'booking-prequal', 'debt-savings-calculator', 'adu-calculator', 'mortgage-calculator-contact-modal'])('primary and second home pass only in the 8 for %s', (source) => {
    for (const use of ['primary', 'second-home']) {
      for (const st of LICENSED) expect(serviceArea(use, st, source), use + st).toBe('supported');
      for (const st of ['NV', 'NY', 'WA', 'CO', 'AL', 'OH']) expect(serviceArea(use, st, source), use + st).toBe('out-of-market');
    }
  });

  it('investment fails in exactly ID, MN, ND, NH, NJ, NV, NY, SD, UT, and passes everywhere else', () => {
    for (const st of POLICY.states) {
      for (const source of ['dscr-magnet', 'home-equity', 'home-contact']) {
        expect(serviceArea('investment', st, source), source + st).toBe(NEITHER.includes(st) ? 'out-of-market' : 'supported');
      }
    }
  });

  it('keeps FHA primary-only and DSCR investment-only', () => {
    expect(serviceArea('second-home', 'CA', 'fha-magnet')).toBe('out-of-market');
    expect(serviceArea('investment', 'CA', 'fha-magnet')).toBe('out-of-market');
    expect(serviceArea('primary', 'CA', 'dscr-magnet')).toBe('out-of-market');
  });

  it('applies /book/ goals: equity and everything else general, DSCR and commercial investment, own-home and not-sure the 8', () => {
    expect(serviceArea('investment', 'OH', 'book-contact', 'equity')).toBe('supported');
    expect(serviceArea('investment', 'OR', 'book-contact', 'dscr')).toBe('supported');
    expect(serviceArea('primary', 'TX', 'book-contact', 'dscr')).toBe('out-of-market');
    expect(serviceArea('investment', 'OH', 'book-contact', 'commercial')).toBe('supported');
    expect(serviceArea('primary', 'OR', 'book-contact', 'own-home')).toBe('supported');
    expect(serviceArea('second-home', 'NV', 'book-contact', 'own-home')).toBe('out-of-market');
    expect(serviceArea('investment', 'OH', 'book-contact', 'own-home')).toBe('out-of-market');
    expect(serviceArea('primary', 'CA', 'book-contact', 'not-sure')).toBe('supported');
    expect(serviceArea('primary', 'CA', 'book-contact', 'made-up')).toBe('out-of-market');
    expect(BOOKING_GOALS.commercial.review && BOOKING_GOALS['not-sure'].review).toBe(true);
    expect(BOOKING_GOALS.equity.review || BOOKING_GOALS.dscr.review || BOOKING_GOALS['own-home'].review).toBe(false);
  });

  it('routes a failure by use: investment to /out-of-market-dscr/, a home to /out-of-market-primary/', () => {
    expect(outOfMarketPage('investment')).toBe('/out-of-market-dscr/');
    expect(outOfMarketPage('primary')).toBe('/out-of-market-primary/');
    expect(outOfMarketPage('second-home')).toBe('/out-of-market-primary/');
  });

  it('the browser copy agrees with the server on every state, use and goal', async () => {
    const fake: { DTServiceArea?: { ready: () => boolean; check: (u: string, s: string, id: string, g?: string) => string } } = {};
    new Function('window', 'document', 'fetch', readFileSync('public/service-area.js', 'utf8'))(fake, document, async () => ({ ok: true, json: async () => POLICY }));
    await vi.waitFor(() => expect(fake.DTServiceArea?.ready()).toBe(true));
    for (const st of POLICY.states) for (const use of ['primary', 'second-home', 'investment']) {
      for (const [id, goal] of [['home-equity', undefined], ['dscr-magnet', undefined], ['fha-magnet', undefined], ['book-contact', 'equity'], ['book-contact', 'dscr'], ['book-contact', 'own-home'], ['book-contact', 'commercial'], ['book-contact', 'not-sure']] as const) {
        expect(fake.DTServiceArea!.check(use, st, id, goal), `${use} ${st} ${id} ${goal}`).toBe(serviceArea(use, st, id, goal));
      }
    }
  });

  it('asks equity forms about the home being borrowed against, and drops "(not your current residence)"', () => {
    expect(serviceAreaWording('home-equity-calculator').legend).toMatch(/borrowing against/);
    expect(serviceAreaWording('debt-savings-calculator').legend).toMatch(/borrowing against/);
    expect(serviceAreaWording('adu-calculator').legend).toMatch(/borrowing against/);
    expect(serviceAreaWording('mortgage-calculator-contact-modal').legend).toBe('Where is the property?');
    expect(serviceAreaWording('dscr-magnet').legend).toBe('Where is the investment property?');
    for (const f of ['public/service-area.js', 'src/components/ServiceAreaFields.tsx', 'public/booking-chooser.js']) {
      expect(readFileSync(f, 'utf8'), f).not.toContain('not your current residence');
    }
  });

  it('offers Second home in the shared select pair, but not on FHA or DSCR', () => {
    expect(renderToStaticMarkup(<ServiceAreaFields formId="home-equity-calculator" />)).toContain('value="second-home"');
    expect(renderToStaticMarkup(<ServiceAreaFields formId="fha-magnet" />)).not.toContain('value="second-home"');
    expect(renderToStaticMarkup(<ServiceAreaFields formId="dscr-magnet" />)).not.toContain('value="second-home"');
  });
});

describe('enhanced conversions on /home-equity/ (consentGatedUserData)', () => {
  const data = { firstName: 'Ada', lastName: 'Owner', email: 'ada@example.com', phone: '7145550123', state: 'CA', source: 'home-equity', propertyUse: 'primary', propertyState: 'CA' };
  async function run(userData?: (l: object) => unknown) {
    const { track } = await import('../src/utils/attribution');
    (track as unknown as ReturnType<typeof vi.fn>).mockClear();
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"success":true}')));
    vi.stubGlobal('DT', userData ? { userData } : {});
    const submit = useLeadSubmit({ formId: 'home-equity-calculator', thankYouPath: '/t', thankYouTitle: 'T', consentGatedUserData: true });
    expect(await submit(data)).toEqual({ ok: true });
    return (track as unknown as ReturnType<typeof vi.fn>).mock.calls.find((c) => c[0] === 'generate_lead')![1];
  }

  it('sends no user_data before consent', async () => {
    expect(await run(() => undefined)).not.toHaveProperty('user_data');
    expect(await run()).not.toHaveProperty('user_data');
  });

  it('sends DT.userData output after consent, and nothing else personal', async () => {
    const ud = { email: 'ada@example.com', phone_number: '+17145550123' };
    const event = await run(() => ud);
    expect(event.user_data).toEqual(ud);
    expect(Object.keys(event).sort()).toEqual(['form_id', 'lead_source', 'page_path', 'user_data']);
  });
});
