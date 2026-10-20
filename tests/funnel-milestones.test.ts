import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const source = readFileSync('public/attribution.js', 'utf8');
function runtime(allowed: boolean | undefined) {
  const browser: any = {
    location: { pathname: '/fha/', search: '?email=never-send@example.com&gclid=private-click', href: 'https://realdarrentsai.com/fha/?email=never-send@example.com' },
    localStorage: window.localStorage, dataLayer: [],
  };
  if (allowed !== undefined) browser.DTConsent = { isAllowed: () => allowed, whenAllowed: () => {} };
  new Function('window', source)(browser);
  browser.dataLayer = [];
  return { browser, emit: browser.DT.milestone as (event: string, params: object) => void, allow: () => { allowed = true; } };
}
afterEach(() => { document.body.innerHTML = ''; vi.restoreAllMocks(); });

describe('consent-aware form observations', () => {
  it.each([undefined, false])('does not queue observations before explicit acceptance: %s', allowed => {
    const { browser, emit, allow } = runtime(allowed);
    emit('form_start', { form_id: 'fha-magnet' });
    emit('form_step', { form_id: 'fha-magnet', step_id: 1 });
    emit('form_error', { form_id: 'fha-magnet', error_code: 'validation' });
    expect(browser.dataLayer).toEqual([]);
    allow();
    expect(browser.dataLayer).toEqual([]);
    if (allowed !== undefined) {
      emit('form_start', { form_id: 'fha-magnet' });
      expect(browser.dataLayer).toEqual([{ event: 'form_start', form_id: 'fha-magnet', page_path: '/fha/' }]);
    }
  });
  it('emits only allowlisted categorical fields, with no attribution, PII or query strings', () => {
    const { browser, emit } = runtime(true);
    emit('form_error', { form_id: 'fha-magnet', step_id: 2, error_code: 'validation', field_category: 'contact', email: 'private@example.com', phone: '7145550101', zip: '90210', amount: 450000, rawError: 'email failed private@example.com', user_data: { email: 'private@example.com' }, page_path: '/?private=1', utm_campaign: 'private' });
    expect(browser.dataLayer).toEqual([{ event: 'form_error', form_id: 'fha-magnet', step_id: '2', error_code: 'validation', field_category: 'contact', page_path: '/fha/' }]);
    expect(JSON.stringify(browser.dataLayer)).not.toMatch(/@|7145550101|90210|450000|private|gclid|utm_|user_data/);
  });
  it('deduplicates starts/completed steps, permits distinct failures, and rejects arbitrary values', () => {
    const { browser, emit } = runtime(true);
    for (let i = 0; i < 2; i++) {
      emit('form_start', { form_id: 'dscr-magnet' });
      emit('form_step', { form_id: 'dscr-magnet', step_id: 1 });
      emit('form_error', { form_id: 'dscr-magnet', error_code: 'uncertain' });
    }
    emit('form_start', { form_id: 'private@example.com' });
    emit('form_step', { form_id: 'dscr-magnet', step_id: 'private@example.com' });
    emit('form_error', { form_id: 'dscr-magnet', error_code: 'private@example.com' });
    emit('generate_lead', { form_id: 'dscr-magnet' });
    expect(browser.dataLayer.filter((e: any) => e.event === 'form_start')).toHaveLength(1);
    expect(browser.dataLayer.filter((e: any) => e.event === 'form_step')).toHaveLength(1);
    expect(browser.dataLayer.filter((e: any) => e.event === 'form_error')).toHaveLength(2);
    expect(browser.dataLayer).toHaveLength(4);
  });
  it('records a start from an actual annotated form interaction, and cannot break inputs', () => {
    const { browser } = runtime(true);
    document.body.innerHTML = '<div data-dt-form="home-equity-calculator"><input value="private@example.com"></div>';
    document.querySelector('input')!.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('input')!.dispatchEvent(new Event('change', { bubbles: true }));
    expect(browser.dataLayer).toEqual([{ event: 'form_start', form_id: 'home-equity-calculator', page_path: '/fha/' }]);
    browser.dataLayer.push = () => { throw new Error('blocked'); };
    expect(() => browser.DT.milestone('form_error', { form_id: 'home-equity-calculator', error_code: 'validation' })).not.toThrow();
    expect(document.querySelector('input')!.value).toBe('private@example.com');
  });
});
