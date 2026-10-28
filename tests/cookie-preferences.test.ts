import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = readFileSync(resolve(__dirname, '../public/cookie-preferences.js'), 'utf8');
const attribution = readFileSync(resolve(__dirname, '../public/attribution.js'), 'utf8');
function load() {
  new Function(source).call(window);
  document.dispatchEvent(new Event('DOMContentLoaded'));
  new Function(attribution).call(window);
}
function click(choice: string) { (document.querySelector(`[data-choice="${choice}"]`) as HTMLButtonElement).click(); }
function cookieRuntime() {
  const browser: {
    localStorage: Storage; navigator: Navigator; location: {hostname: string; reload: ReturnType<typeof vi.fn>}; dataLayer: unknown[];
    DTConsent?: {isAllowed: () => boolean; whenAllowed: (callback: () => void) => void};
  } = {localStorage: window.localStorage, navigator: window.navigator, location: {hostname: 'realdarrentsai.com', reload: vi.fn()}, dataLayer: []};
  new Function('window', source)(browser);
  document.dispatchEvent(new Event('DOMContentLoaded'));
  return browser;
}
beforeEach(() => {
  document.body.innerHTML = '<form><input name="email"></form><script type="application/x-dt-consent" data-src="https://cdn.callrail.com/test.js"></script>';
  document.head.innerHTML = '';
  window.localStorage.clear();
  window.history.replaceState({}, '', '/?utm_source=youtube&utm_campaign=test-consent&gclid=TESTONLY');
  (window as unknown as Record<string, unknown>).dataLayer = [];
  Object.defineProperty(window.navigator, 'globalPrivacyControl', { value: false, configurable: true });
});
afterEach(() => vi.restoreAllMocks());
describe('explicit opt-in tracking respects privacy choices', () => {
  it('keeps vendors and persistence off until explicit acceptance', () => {
    load();
    expect(document.querySelectorAll('script[src*="googletagmanager"]')).toHaveLength(0);
    expect(document.querySelectorAll('script[src*="callrail"]')).toHaveLength(0);
    expect(window.localStorage.getItem('dt_attr')).toBeNull();
    expect(window.localStorage.getItem('dt_cookie_preferences')).toBeNull();
    expect((window as unknown as {dataLayer: IArguments[]}).dataLayer[0][2]).toMatchObject({ad_storage: 'denied', analytics_storage: 'denied'});
    expect(document.querySelector('.dt-cookie-panel')!.textContent).toContain('off until you accept');
    expect(window.DT!.attr().clickId).toBe('TESTONLY');
    expect(document.querySelector('form input')).toBeTruthy();
  });
  it('does not duplicate the existing tag path when Accept optional is pressed', () => {
    load(); click('accept');
    expect(document.querySelectorAll('script[src*="googletagmanager"]')).toHaveLength(1);
    expect(document.querySelectorAll('script[src*="callrail"]')).toHaveLength(1);
    expect(window.localStorage.getItem('dt_attr')).toContain('TESTONLY');
    click('accept');
    expect(document.querySelectorAll('script[src*="googletagmanager"]')).toHaveLength(1);
  });
  it('rejects optional tracking without disabling any form', () => {
    const browser = cookieRuntime();
    window.localStorage.setItem('dt_attr', 'tracking');
    document.cookie = '_ga=tracking; path=/';
    click('reject');
    expect(browser.DTConsent!.isAllowed()).toBe(false);
    expect(browser.location.reload).not.toHaveBeenCalled();
    expect(window.localStorage.getItem('dt_attr')).toBeNull();
    expect(document.cookie).not.toContain('_ga=');
    expect(JSON.parse(window.localStorage.getItem('dt_cookie_preferences')!).optional).toBe(false);
    expect((document.querySelector('form input') as HTMLInputElement).disabled).toBe(false);
  });
  it.each([0, 181])('honors a saved rejection from %s days ago before any vendor loads', (days) => {
    window.localStorage.setItem('dt_cookie_preferences', JSON.stringify({optional: false, ts: Date.now() - days * 86400000}));
    load();
    expect(document.querySelector('script[src*="googletagmanager"]')).toBeNull();
    expect(document.querySelector('script[src*="callrail"]')).toBeNull();
    expect(window.localStorage.getItem('dt_attr')).toBeNull();
    expect(window.DT!.attr().clickId).toBe('TESTONLY');
  });
  it('re-enables tracking once when a previously rejecting visitor changes their choice', () => {
    window.localStorage.setItem('dt_cookie_preferences', JSON.stringify({optional: false, ts: Date.now()}));
    load(); click('accept'); click('accept');
    expect(document.querySelectorAll('script[src*="googletagmanager"]')).toHaveLength(1);
    expect(document.querySelectorAll('script[src*="callrail"]')).toHaveLength(1);
  });
  it('offers exactly Accept and Reject without an extra preference step', () => {
    load();
    expect(Array.from(document.querySelectorAll('.dt-cookie-actions button')).map(b => b.textContent)).toEqual(['Accept', 'Reject']);
    expect(document.querySelector('[data-choice="manage"]')).toBeNull();
  });
  it('withdraws an existing acceptance, clears attribution and reloads to stop loaded vendors', () => {
    window.localStorage.setItem('dt_cookie_preferences', JSON.stringify({optional:true,ts:Date.now()}));
    const browser = cookieRuntime();
    window.localStorage.setItem('dt_attr','old-tracking');
    click('reject');
    expect(browser.DTConsent!.isAllowed()).toBe(false);
    expect(browser.location.reload).toHaveBeenCalledOnce();
    expect(window.localStorage.getItem('dt_attr')).toBeNull();
  });
  it('does not treat closing the first-visit notice as consent', () => {
    load();
    (document.querySelector('.dt-cookie-close') as HTMLButtonElement).click();
    expect(window.localStorage.getItem('dt_cookie_preferences')).toBeNull();
    expect(window.DTConsent!.isAllowed()).toBe(false);
    expect(document.querySelector('script[src*="googletagmanager"]')).toBeNull();
  });
  it('shows the first-visit notice without taking focus away from a form', () => {
    const input = document.querySelector('form input') as HTMLInputElement;
    input.focus();
    load();
    expect(document.activeElement).toBe(input);
    expect((document.querySelector('.dt-cookie-panel') as HTMLElement).hidden).toBe(false);
  });
  it('expires an old acceptance without starting vendors', () => {
    window.localStorage.setItem('dt_cookie_preferences', JSON.stringify({optional:true,ts:Date.now()-181*86400000}));
    load();
    expect(window.DTConsent!.isAllowed()).toBe(false);
    expect(document.querySelector('script[src*="callrail"]')).toBeNull();
  });
  it('defaults off if browser storage cannot save a rejection across reloads', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('storage blocked'); });
    const browser = cookieRuntime();
    expect(browser.DTConsent!.isAllowed()).toBe(false);
    expect(document.querySelector('script[src*="callrail"]')).toBeNull();
    expect(document.querySelector('.dt-cookie-panel')!.textContent).toContain('cannot save preferences');
    click('reject');
    expect(browser.location.reload).not.toHaveBeenCalled();
  });
  it('honors GPC on the first visit before any optional script or persistence', () => {
    Object.defineProperty(window.navigator, 'globalPrivacyControl', {value: true, configurable: true});
    load();
    expect(document.querySelector('script[src*="googletagmanager"]')).toBeNull();
    expect(document.querySelector('script[src*="callrail"]')).toBeNull();
    expect(window.localStorage.getItem('dt_attr')).toBeNull();
  });
  it('honors Global Privacy Control even if a previous choice accepted', () => {
    window.localStorage.setItem('dt_cookie_preferences', JSON.stringify({ optional: true, ts: Date.now() }));
    Object.defineProperty(window.navigator, 'globalPrivacyControl', { value: true, configurable: true });
    load();
    expect((document.querySelector('[data-choice="accept"]') as HTMLButtonElement).disabled).toBe(true);
    expect(document.querySelector('script[src*="googletagmanager"]')).toBeNull();
    expect(JSON.parse(window.localStorage.getItem('dt_cookie_preferences')!).optional).toBe(false);
  });
  it('places the consent gate before attribution and makes raw CallRail inert on every entry', () => {
    for (const path of ['index.html','home-equity/index.html','adu/index.html','mortgage-calculator/index.html','public/dscr/index.html','public/fha/index.html','public/realestateinvesting/index.html']) {
      const html = readFileSync(resolve(__dirname, '..', path), 'utf8');
      expect(html.indexOf('/cookie-preferences.js')).toBeLessThan(html.indexOf('/attribution.js'));
      expect(html).toContain('type="application/x-dt-consent"');
      expect(html).not.toMatch(/<script[^>]*\ssrc="[^"\n]*cdn.callrail/);
      expect(html).not.toContain('googletagmanager.com/ns.html');
    }
  });
  it.each(['none', 'reject', 'gpc', 'accept'])('keeps the accessibility phone on the existing consent-gated CallRail path: %s', (choice) => {
    const html = readFileSync(resolve(__dirname, '../public/legal/index.html'), 'utf8');
    const page = new DOMParser().parseFromString(html, 'text/html');
    document.body.innerHTML = page.body.innerHTML;
    const phone = document.querySelector('#accessibility')!.parentElement!.querySelector('a[href^="tel:"]');
    expect(phone?.getAttribute('href')).toBe('tel:+17148875432');
    expect(phone?.textContent).toBe('(714) 887-5432');
    const placeholder = document.querySelector('script[type="application/x-dt-consent"][data-src*="cdn.callrail.com"]');
    expect(placeholder).not.toBeNull();
    expect(html).not.toMatch(/<script[^>]*\ssrc="[^"\n]*cdn.callrail/);
    if (choice === 'gpc') Object.defineProperty(window.navigator, 'globalPrivacyControl', { value: true, configurable: true });
    cookieRuntime();
    if (choice === 'reject' || choice === 'accept') click(choice);
    const active = document.querySelectorAll('script[src*="cdn.callrail.com"]');
    expect(active).toHaveLength(choice === 'accept' ? 1 : 0);
    if (choice === 'accept') expect(active[0].getAttribute('src')).toBe(placeholder!.getAttribute('data-src'));
  });
});
