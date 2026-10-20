import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import ComplianceDisclosure from '../src/components/ComplianceDisclosure';
import { useLeadSubmit } from '../src/hooks/useLeadSubmit';
import { normalizeSmsConsent } from '../netlify/functions/lead.mts';
import { loadGas } from './helpers/gas-harness';
vi.mock('../src/utils/attribution', () => ({ getAttribution: () => ({}), track: vi.fn(), milestone: vi.fn() }));
afterEach(() => { for (const id of ['home-equity-calculator', 'home-contact-modal', 'test']) window.DTLead?.reset(id); document.body.innerHTML = ''; vi.unstubAllGlobals(); });
const combinations = [[false, false], [true, false], [false, true], [true, true]];
describe('independent SMS choices', () => {
  it.each(combinations)('records informational %s and marketing %s independently in React and static forms', async (info, marketing) => {
    document.body.innerHTML = renderToStaticMarkup(<ComplianceDisclosure formId="home-contact-modal" />);
    const privacy = document.querySelector<HTMLInputElement>('[data-privacy-form]')!;
    const infoBox = document.querySelector<HTMLInputElement>('[data-sms-info-form]')!;
    const marketingBox = document.querySelector<HTMLInputElement>('[data-sms-form]')!;
    expect(infoBox.checked).toBe(false); expect(marketingBox.checked).toBe(false);
    expect(infoBox.required).toBe(false); expect(marketingBox.required).toBe(false);
    privacy.checked = true; infoBox.checked = info; marketingBox.checked = marketing;
    let sent: Record<string, unknown> = {};
    vi.stubGlobal('fetch', vi.fn(async (_url, init) => { sent = JSON.parse(init.body); return new Response(JSON.stringify({ok:true,receipt:'saved',submissionId:JSON.parse(String(init.body)).submissionId})); }));
    const submit = useLeadSubmit({ formId: 'home-contact-modal', thankYouPath: '/thanks', thankYouTitle: 'Thanks' });
    expect(await submit({ source: 'home-contact', email: 'test@example.com', phone: '7145550101', firstName: 'Test', lastName: '', state: 'CA' })).toEqual({ ok: true });
    const expected = { smsInformationalConsent: info, smsMarketingConsent: marketing, smsConsent: marketing, privacyAcknowledged: true };
    expect(sent).toMatchObject(expected);
    const fake = { DTCompliance: { sms: (_id: string): Record<string, unknown> => ({}) } };
    new Function('window', 'document', readFileSync('public/compliance.js', 'utf8'))(fake, document);
    expect(fake.DTCompliance.sms('home-contact-modal')).toMatchObject(expected);
    const { gas } = loadGas<{ LEADS_SCHEMA: { values: (d: Record<string, unknown>) => Record<string, unknown> } }>({ exports: ['LEADS_SCHEMA'] });
    expect(gas.LEADS_SCHEMA.values(sent)).toMatchObject({ 'SMS Informational Consent': info ? 'Yes' : 'No', 'SMS Marketing Consent': marketing ? 'Yes' : 'No' });
  });
  it('does not grant consent for strings, missing fields or conflicting legacy values', () => {
    const payload = { smsConsent: true, smsMarketingConsent: 'false', smsInformationalConsent: 'true' };
    normalizeSmsConsent(payload);
    expect(payload).toEqual({ smsConsent: false, smsMarketingConsent: false, smsInformationalConsent: false });
    const older = {}; normalizeSmsConsent(older); expect(older).toEqual({});
  });
  it('all static form disclosures have both optional unchecked choices', () => {
    for (const page of ['dscr', 'fha', 'realestateinvesting']) {
      document.body.innerHTML = readFileSync(`public/${page}/index.html`, 'utf8');
      for (const box of document.querySelectorAll<HTMLInputElement>('[data-sms-form]')) {
        expect(box.checked).toBe(false); expect(box.required).toBe(false);
        const info = document.querySelector<HTMLInputElement>(`[data-sms-info-form="${box.dataset.smsForm}"]`)!;
        expect(info).not.toBeNull(); expect(info.checked).toBe(false); expect(info.required).toBe(false);
      }
    }
  });
});
