import { beforeEach, describe, expect, it } from 'vitest';
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
beforeEach(() => {
  document.body.innerHTML = '<form><input name="email"></form><script type="application/x-dt-consent" data-src="https://cdn.callrail.com/test.js"></script>';
  document.head.innerHTML = '';
  window.localStorage.clear();
  window.history.replaceState({}, '', '/?utm_source=youtube&utm_campaign=test-consent&gclid=TESTONLY');
  (window as unknown as Record<string, unknown>).dataLayer = [];
  Object.defineProperty(window.navigator, 'globalPrivacyControl', { value: false, configurable: true });
});
describe('optional tracking waits for a real consent choice', () => {
  it('leaves scripts and persistent attribution off before a choice, with the lead attribution available in memory', () => {
    load();
    expect(document.querySelector('script[src*="googletagmanager"]')).toBeNull();
    expect(document.querySelector('script[src*="callrail"]')).toBeNull();
    expect(window.localStorage.getItem('dt_attr')).toBeNull();
    expect(window.DT!.attr().clickId).toBe('TESTONLY');
    expect(document.querySelector('form input')).toBeTruthy();
  });
  it('starts the existing GTM path and CallRail once on acceptance and retains attribution', () => {
    load(); click('accept');
    expect(document.querySelectorAll('script[src*="googletagmanager"]')).toHaveLength(1);
    expect(document.querySelectorAll('script[src*="callrail"]')).toHaveLength(1);
    expect(window.localStorage.getItem('dt_attr')).toContain('TESTONLY');
    click('accept');
    expect(document.querySelectorAll('script[src*="googletagmanager"]')).toHaveLength(1);
  });
  it('rejects optional tracking without disabling any form', () => {
    load(); click('reject');
    expect(document.querySelector('script[src*="googletagmanager"]')).toBeNull();
    expect(JSON.parse(window.localStorage.getItem('dt_cookie_preferences')!).optional).toBe(false);
    expect((document.querySelector('form input') as HTMLInputElement).disabled).toBe(false);
  });
  it('honors Global Privacy Control even if a previous choice accepted', () => {
    window.localStorage.setItem('dt_cookie_preferences', JSON.stringify({ optional: true, ts: Date.now() }));
    Object.defineProperty(window.navigator, 'globalPrivacyControl', { value: true, configurable: true });
    load();
    expect((document.querySelector('[data-choice="accept"]') as HTMLButtonElement).disabled).toBe(true);
    expect(document.querySelector('script[src*="googletagmanager"]')).toBeNull();
  });
  it('places the consent gate before attribution and makes raw CallRail inert on every entry', () => {
    for (const path of ['index.html','debt-consolidation/index.html','home-equity/index.html','adu/index.html','mortgage-calculator/index.html','public/dscr/index.html','public/fha/index.html','public/realestateinvesting/index.html']) {
      const html = readFileSync(resolve(__dirname, '..', path), 'utf8');
      expect(html.indexOf('/cookie-preferences.js')).toBeLessThan(html.indexOf('/attribution.js'));
      expect(html).toContain('type="application/x-dt-consent"');
      expect(html).not.toMatch(/<script[^>]*\ssrc="[^"\n]*cdn.callrail/);
      expect(html).not.toContain('googletagmanager.com/ns.html');
    }
  });
});
