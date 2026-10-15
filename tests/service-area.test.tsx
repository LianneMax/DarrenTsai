import { describe, expect, it, vi, afterEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { serviceArea } from '../src/utils/serviceArea';
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
    expect(serviceArea('investment', 'AL', source)).toBe(source.includes('home-equity') || source.includes('fha') ? 'out-of-market' : 'supported');
  });
  it('does not extend DSCR coverage to home-equity inquiries', () => {
    expect(serviceArea('investment', 'AL', 'home-equity-calculator')).toBe('out-of-market');
    expect(serviceArea('investment', 'OR', 'home-equity-contact')).toBe('supported');
    expect(serviceArea('investment', 'AL', 'dscr-magnet')).toBe('supported');
  });
  it('static forms load the same policy and record an independent property state', async () => {
    document.body.innerHTML = '<div><div class="compliance-disclosure"><input data-privacy-form="static-test"></div></div>';
    const fake: {DTServiceArea?: {ready: () => boolean; validate: (id: string) => boolean; read: (id: string) => Record<string, unknown>}} = {};
    const policy = JSON.parse(readFileSync('public/service-area-policy.json', 'utf8'));
    new Function('window', 'document', 'fetch', readFileSync('public/service-area.js', 'utf8'))(fake, document, async () => ({ok: true, json: async () => policy}));
    await vi.waitFor(() => expect(fake.DTServiceArea?.ready()).toBe(true));
    const use = document.querySelector<HTMLSelectElement>('[data-property-use]')!;
    const state = document.querySelector<HTMLSelectElement>('[data-property-state]')!;
    use.value = 'investment'; state.value = 'OR'; expect(fake.DTServiceArea!.validate('static-test')).toBe(false);
    state.value = 'FL'; expect(fake.DTServiceArea!.validate('static-test')).toBe(true);
    expect(fake.DTServiceArea!.read('static-test')).toMatchObject({propertyState: 'FL', propertyUse: 'investment', serviceAreaResult: 'supported'});
  });
  it.each([['primary', 'OR', 'supported'], ['investment', 'OR', 'out-of-market'], ['primary', 'NY', 'out-of-market'], ['investment', 'FL', 'supported'], ['investment', 'NH', 'out-of-market'], ['investment', 'DC', 'supported'], ['', 'CA', 'incomplete'], ['primary', '', 'incomplete']])('%s in %s returns %s', (use, state, result) => { expect(serviceArea(use, state)).toBe(result); });
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
 * Policy v3 (15 Oct 2026, Darren): a second home is served in the same 8
 * licensed states as a primary home, and nowhere else. FHA stays primary-only
 * and DSCR investment-only.
 */
describe('second homes (policy v3)', () => {
  const POLICY = JSON.parse(readFileSync(__dirname + '/../public/service-area-policy.json', 'utf8'));
  const LICENSED = ['AZ', 'CA', 'FL', 'HI', 'OR', 'PA', 'TN', 'TX'];

  it('is version v3 and lists exactly the 8 licensed states', () => {
    expect(POLICY.version).toBe('2026-10-15-v3');
    expect([...POLICY.secondHome].sort()).toEqual(LICENSED);
    expect(POLICY.secondHome).toEqual(POLICY.consumer);
  });

  it.each(['home-contact', 'home-equity', 'booking-prequal', 'debt-savings-calculator', 'adu-calculator'])('serves the 8 states and refuses the rest for %s', (source) => {
    for (const s of LICENSED) expect(serviceArea('second-home', s, source), s).toBe('supported');
    for (const s of ['NV', 'NY', 'WA', 'CO', 'AL']) expect(serviceArea('second-home', s, source), s).toBe('out-of-market');
  });

  it('keeps FHA primary-only and DSCR investment-only', () => {
    expect(serviceArea('second-home', 'CA', 'fha-magnet')).toBe('out-of-market');
    expect(serviceArea('second-home', 'CA', 'dscr-magnet')).toBe('out-of-market');
  });

  it('offers Second home in the shared select pair, but not on FHA or DSCR', () => {
    expect(renderToStaticMarkup(<ServiceAreaFields formId="home-equity-calculator" />)).toContain('value="second-home"');
    expect(renderToStaticMarkup(<ServiceAreaFields formId="fha-magnet" />)).not.toContain('value="second-home"');
  });
});
