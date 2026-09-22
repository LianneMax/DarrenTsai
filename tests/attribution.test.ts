/**
 * Tests for public/attribution.js.
 *
 * The script is an IIFE that reads location/referrer/localStorage at load time,
 * so each test re-evaluates it in a freshly configured jsdom window. That is
 * deliberate: it exercises the real file the browser runs, not a reimplementation.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SOURCE = readFileSync(resolve(__dirname, '../public/attribution.js'), 'utf8');

const DAY = 24 * 60 * 60 * 1000;

/** Load attribution.js against a given URL + referrer, preserving localStorage. */
function load(opts: { url?: string; referrer?: string } = {}) {
  const url = opts.url ?? 'https://realdarrentsai.com/';
  // jsdom locks document.referrer, so define it directly.
  Object.defineProperty(window.document, 'referrer', {
    value: opts.referrer ?? '',
    configurable: true,
  });
  window.history.replaceState({}, '', url.replace('https://realdarrentsai.com', ''));

  delete (window as Record<string, unknown>).DT;
  (window as Record<string, unknown>).dataLayer = [];
  new Function(SOURCE).call(window);
  return window.DT!;
}

beforeEach(() => {
  window.localStorage.clear();
  vi.useRealTimers();
});

describe('click id capture', () => {
  it('stores a gclid with its type', () => {
    const dt = load({ url: 'https://realdarrentsai.com/?gclid=ABC123&utm_source=google&utm_medium=cpc' });
    const a = dt.attr();
    expect(a.clickId).toBe('ABC123');
    expect(a.clickIdType).toBe('gclid');
    expect(a.utm_source).toBe('google');
    expect(a.utm_medium).toBe('cpc');
  });

  it.each([
    ['gbraid', 'gbraid'],
    ['wbraid', 'wbraid'],
    ['msclkid', 'msclkid'],
    ['fbclid', 'fbclid'],
  ])('maps %s to the right clickIdType', (param, expected) => {
    const dt = load({ url: `https://realdarrentsai.com/?${param}=XYZ` });
    expect(dt.attr().clickId).toBe('XYZ');
    expect(dt.attr().clickIdType).toBe(expected);
  });

  it('records landing page and referrer', () => {
    const dt = load({
      url: 'https://realdarrentsai.com/dscr/?gclid=A1',
      referrer: 'https://www.google.com/search',
    });
    expect(dt.attr().landingPage).toBe('/dscr/?gclid=A1');
    expect(dt.attr().referrer).toBe('https://www.google.com/search');
  });
});

describe('the write rule — a stored ad click must survive', () => {
  it('a later DIRECT visit does not clobber the gclid', () => {
    load({ url: 'https://realdarrentsai.com/?gclid=KEEPME&utm_source=google' });
    const dt = load({ url: 'https://realdarrentsai.com/' }); // direct, no params, no referrer
    expect(dt.attr().clickId).toBe('KEEPME');
    expect(dt.attr().utm_source).toBe('google');
  });

  it('an internal navigation does not clobber the gclid', () => {
    load({ url: 'https://realdarrentsai.com/?gclid=KEEPME' });
    const dt = load({
      url: 'https://realdarrentsai.com/dscr/',
      referrer: 'https://realdarrentsai.com/',
    });
    expect(dt.attr().clickId).toBe('KEEPME');
  });

  it('a www internal referrer is still treated as internal', () => {
    load({ url: 'https://realdarrentsai.com/?gclid=KEEPME' });
    const dt = load({
      url: 'https://realdarrentsai.com/fha/',
      referrer: 'https://www.realdarrentsai.com/',
    });
    expect(dt.attr().clickId).toBe('KEEPME');
  });

  it('a NEW ad click overwrites last touch but not first', () => {
    load({ url: 'https://realdarrentsai.com/?gclid=FIRST&utm_campaign=c1' });
    const dt = load({ url: 'https://realdarrentsai.com/?gclid=SECOND&utm_campaign=c2' });
    expect(dt.attr().clickId).toBe('SECOND');
    expect(dt.attr().utm_campaign).toBe('c2');
    expect(dt.attr().firstClickId).toBe('FIRST');
    expect(dt.attr().firstUtmCampaign).toBe('c1');
  });
});

describe('referrer handling', () => {
  it('synthesises source/medium from an external referrer with no params', () => {
    const dt = load({ url: 'https://realdarrentsai.com/', referrer: 'https://www.youtube.com/watch?v=x' });
    expect(dt.attr().utm_source).toBe('youtube.com');
    expect(dt.attr().utm_medium).toBe('referral');
  });

  it('does not treat a same-origin referrer as a touch', () => {
    const dt = load({ url: 'https://realdarrentsai.com/dscr/', referrer: 'https://realdarrentsai.com/' });
    expect(dt.attr().utm_source).toBe('');
    expect(dt.attr().utm_medium).toBe('');
  });

  it('an explicit utm_source beats the referrer', () => {
    const dt = load({
      url: 'https://realdarrentsai.com/?utm_source=newsletter&utm_medium=email',
      referrer: 'https://www.youtube.com/',
    });
    expect(dt.attr().utm_source).toBe('newsletter');
    expect(dt.attr().utm_medium).toBe('email');
  });
});

describe('expiry', () => {
  it('drops last touch after 30 days but keeps first touch', () => {
    load({ url: 'https://realdarrentsai.com/?gclid=OLD&utm_campaign=old' });
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 31 * DAY);
    const dt = load({ url: 'https://realdarrentsai.com/' });
    expect(dt.attr().clickId).toBe('');
    expect(dt.attr().firstClickId).toBe('OLD');
  });

  it('drops first touch after 90 days', () => {
    load({ url: 'https://realdarrentsai.com/?gclid=ANCIENT' });
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 91 * DAY);
    const dt = load({ url: 'https://realdarrentsai.com/' });
    expect(dt.attr().firstClickId).toBe('');
    expect(dt.attr().clickId).toBe('');
  });
});

describe('resilience', () => {
  it('still attributes the current pageview when localStorage.setItem throws', () => {
    const setItem = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new DOMException('QuotaExceededError');
      });
    const dt = load({ url: 'https://realdarrentsai.com/?gclid=PRIVATE_MODE' });
    expect(dt.attr().clickId).toBe('PRIVATE_MODE');
    setItem.mockRestore();
  });

  it('survives corrupt stored JSON', () => {
    window.localStorage.setItem('dt_attr', '{not json');
    const dt = load({ url: 'https://realdarrentsai.com/?gclid=RECOVERED' });
    expect(dt.attr().clickId).toBe('RECOVERED');
  });
});

describe('payload shape', () => {
  it('returns flat string values only — Bonzo and Sheets both need flat keys', () => {
    const dt = load({ url: 'https://realdarrentsai.com/?gclid=A&utm_source=google' });
    const a = dt.attr();
    for (const [key, value] of Object.entries(a)) {
      expect(typeof value, `${key} must be a string`).toBe('string');
    }
  });

  it('never yields undefined for an untracked visit', () => {
    const dt = load({ url: 'https://realdarrentsai.com/' });
    for (const value of Object.values(dt.attr())) {
      expect(value).toBeDefined();
    }
  });
});

describe('first touch', () => {
  it('exposes the click id TYPE of the first touch, not just its id', () => {
    // Without this an ad-originated lead whose last visit was organic cannot be
    // tagged with the right network downstream.
    load({ url: 'https://realdarrentsai.com/?gclid=FIRST_AD' });
    const dt = load({ url: 'https://realdarrentsai.com/', referrer: 'https://www.youtube.com/' });
    expect(dt.attr().firstClickId).toBe('FIRST_AD');
    expect(dt.attr().firstClickIdType).toBe('gclid');
    expect(dt.attr().clickId).toBe(''); // last touch is organic
    expect(dt.attr().utm_source).toBe('youtube.com');
  });
});

describe('outbound clicks', () => {
  function clickLink(href: string, text = 'Go') {
    const a = document.createElement('a');
    a.setAttribute('href', href);
    a.textContent = text;
    document.body.appendChild(a);
    a.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    a.remove();
    return (window.dataLayer as Record<string, unknown>[]).at(-1);
  }

  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('tracks a click to an external domain', () => {
    load({ url: 'https://realdarrentsai.com/' });
    const ev = clickLink('https://heloc.saxtonmortgage.com/account/heloc/register?referrer=abc', 'Get my quote');
    expect(ev?.event).toBe('outbound_click');
    expect(ev?.outbound_domain).toBe('heloc.saxtonmortgage.com');
    expect(ev?.link_text).toBe('Get my quote');
  });

  it('tracks the Point HEI affiliate link', () => {
    load({ url: 'https://realdarrentsai.com/' });
    const ev = clickLink('https://pointdigitalfinance.sjv.io/JKEgNe');
    expect(ev?.event).toBe('outbound_click');
    expect(ev?.outbound_domain).toBe('pointdigitalfinance.sjv.io');
  });

  it('does not treat an internal link as outbound', () => {
    load({ url: 'https://realdarrentsai.com/' });
    const before = (window.dataLayer as unknown[]).length;
    clickLink('/dscr/');
    clickLink('https://realdarrentsai.com/fha/');
    expect((window.dataLayer as unknown[]).length).toBe(before);
  });

  it('keeps phone and Calendly as their own events, not outbound', () => {
    load({ url: 'https://realdarrentsai.com/' });
    expect(clickLink('tel:+17148875432')?.event).toBe('phone_click');
    expect(clickLink('https://calendly.com/realdarrentsai/15min')?.event).toBe('calendly_open');
  });

  it('carries the attribution snapshot, so an outbound click is still attributable', () => {
    load({ url: 'https://realdarrentsai.com/?gclid=OUT123&utm_source=google' });
    const ev = clickLink('https://heloc.saxtonmortgage.com/');
    expect(ev?.clickId).toBe('OUT123');
    expect(ev?.utm_source).toBe('google');
  });
});

describe('track()', () => {
  it('pushes the event with the attribution snapshot merged in', () => {
    const dt = load({ url: 'https://realdarrentsai.com/?gclid=EVT&utm_source=google' });
    dt.track('generate_lead', { lead_source: 'dscr', form_id: 'dscr-magnet' });
    const pushed = (window.dataLayer as Record<string, unknown>[]).at(-1)!;
    expect(pushed.event).toBe('generate_lead');
    expect(pushed.lead_source).toBe('dscr');
    expect(pushed.form_id).toBe('dscr-magnet');
    expect(pushed.clickId).toBe('EVT');
  });

  it('queues into dataLayer so GTM replays events pushed before it loads', () => {
    const dt = load({ url: 'https://realdarrentsai.com/' });
    dt.track('generate_lead', { lead_source: 'fha' });
    dt.track('phone_click', {});
    const tracked = (window.dataLayer as Record<string, unknown>[])
      .filter((item) => item.event === 'generate_lead' || item.event === 'phone_click');
    expect(tracked).toHaveLength(2);
  });
});
