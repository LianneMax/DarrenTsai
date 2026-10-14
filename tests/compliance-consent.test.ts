import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { loadGas } from './helpers/gas-harness';

describe('SMS consent evidence', () => {
  it('records explicit yes/no and leaves older submissions unknown', () => {
    const { gas } = loadGas<{ LEADS_SCHEMA: { values: (d: Record<string, unknown>) => Record<string, unknown> } }>({ exports: ['LEADS_SCHEMA'] });
    const base = { email: 'test@example.com', smsConsentVersion: '2026-10-13-v1', smsConsentText: 'Approved disclosure', smsConsentAt: '2026-10-13T00:00:00Z' };
    expect(gas.LEADS_SCHEMA.values({ ...base, smsConsent: true })).toMatchObject({ 'SMS Consent': 'Yes', 'SMS Consent Version': base.smsConsentVersion, 'SMS Consent Text': base.smsConsentText, 'SMS Consent At': base.smsConsentAt });
    expect(gas.LEADS_SCHEMA.values({ ...base, smsConsent: false })['SMS Consent']).toBe('No');
    expect(gas.LEADS_SCHEMA.values({ email: base.email })['SMS Consent']).toBe('');
  });
  it('scopes static consent to its form and uses the FHA review modal choice', () => {
    document.body.innerHTML = '<input type="checkbox" data-sms-form="fha-magnet"><input type="checkbox" data-sms-form="fha-contact-modal" checked>';
    const runtime = new Function('window', 'document', readFileSync('public/compliance.js', 'utf8'));
    const fake = {} as { DTCompliance: { sms: (id: string) => { smsConsent: boolean } } };
    runtime(fake, document);
    expect(fake.DTCompliance.sms('fha-magnet').smsConsent).toBe(false);
    expect(fake.DTCompliance.sms('fha-payment-review').smsConsent).toBe(true);
    expect(fake.DTCompliance.sms('missing').smsConsent).toBe(false);
  });
  it('includes displayed FHA payment components but no hidden initial estimate', () => {
    document.body.innerHTML = '<div id="fhaResult"><span id="fhaPI">$1,250</span><span id="fhaMip">$100</span></div>';
    const fake = { DTCompliance: {calculatorResults: (): Record<string, unknown> => ({})} };
    new Function('window', 'document', readFileSync('public/compliance.js', 'utf8'))(fake, document);
    expect(fake.DTCompliance.calculatorResults()).toEqual({});
    const result = document.getElementById('fhaResult')!;
    Object.defineProperty(result, 'getClientRects', {value: () => [{width: 100, height: 100}]});
    expect(fake.DTCompliance.calculatorResults()).toMatchObject({estimateOnly: true, fhaPI: '$1,250', fhaMip: '$100'});
  });
});
