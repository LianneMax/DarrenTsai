/**
 * The booking prequal, run against the real public/booking-chooser.js and the
 * real public/service-area.js with the real service-area policy.
 *
 * WHY THIS FILE EXISTS. Decided with Darren on 15 Oct 2026: only a licensed-
 * state lead can book, and the site does the qualifying. Every booking and
 * Call button goes through this flow, so these are the details that must not
 * quietly come undone:
 *
 *  - Nothing is posted, and no calendar or phone number is shown, for a lead
 *    that fails: an unsupported state goes to the out-of-market pages, a
 *    knockout gets a decline.
 *  - The calendar appears only after /api/lead confirms receipt, prefilled so
 *    the booking lands on the same HubSpot contact.
 *  - generate_lead fires once, for a confirmed qualified lead, with no PII.
 *  - meeting_booked fires once, only for a message from HubSpot's own origin.
 *
 * The source is loaded once for the file rather than per test, because its
 * message listener is registered at evaluation: re-evaluating per test would
 * stack listeners and make one posted message look like several bookings.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { prequalPasses } from '../src/utils/serviceArea';

const SOURCE = readFileSync(resolve(__dirname, '../public/booking-chooser.js'), 'utf8');
const AREA = readFileSync(resolve(__dirname, '../public/service-area.js'), 'utf8');
const COMPLIANCE = readFileSync(resolve(__dirname, '../public/compliance.js'), 'utf8');
const POLICY = JSON.parse(readFileSync(resolve(__dirname, '../public/service-area-policy.json'), 'utf8'));
const TEST_URL = 'https://meetings.hubspot.com/darren-test';

type Booking = { open: () => void; close: () => void; mount: (el: Element) => void; identify: (l: { name?: string; email?: string }) => void };

let booking: Booking;
let track: ReturnType<typeof vi.fn>;
let leadFetch: ReturnType<typeof vi.fn>;
let assign: ReturnType<typeof vi.fn>;

const card = () => document.querySelector('.dt-book-card') as HTMLElement;
const tap = (q: string, value: string) => (card().querySelector(`[data-q="${q}"] [data-value="${value}"]`) as HTMLButtonElement).click();
const next = () => (card().querySelector('.dt-book-next') as HTMLButtonElement).click();
const errText = () => card().querySelector('.dt-book-err')?.textContent ?? '';
const flush = () => new Promise((r) => setTimeout(r, 0));

function pickState(code: string) {
  const sel = card().querySelector('[data-book="state"]') as HTMLSelectElement;
  sel.value = code;
  sel.dispatchEvent(new Event('change', { bubbles: true }));
}

function passSteps(use = 'primary', state = 'CA', goal = 'equity') {
  tap('bookingGoal', goal);
  if (card().querySelector('[data-q="propertyUse"]')) tap('propertyUse', use);
  pickState(state);
  tap('propertyType', 'single-family-condo');
  next();
  tap('mortgageCurrent', 'yes');
  tap('recentBankruptcyForeclosure', 'no');
  next();
}

function fillContact({ privacy = true } = {}) {
  const form = card().querySelector('form') as HTMLFormElement;
  (form.elements.namedItem('firstName') as HTMLInputElement).value = 'Ada';
  (form.elements.namedItem('lastName') as HTMLInputElement).value = 'Lovelace';
  (form.elements.namedItem('email') as HTMLInputElement).value = 'ada@example.com';
  (form.elements.namedItem('phone') as HTMLInputElement).value = '7145550123';
  (form.elements.namedItem('privacy') as HTMLInputElement).checked = privacy;
  form.dispatchEvent(new Event('submit', { cancelable: true }));
}

const leadBody = () => JSON.parse(String(leadFetch.mock.calls[0][1].body));

beforeAll(async () => {
  // The policy fetch service-area.js makes on load, answered with the real file.
  (window as unknown as { fetch: unknown }).fetch = vi.fn((url: string) => {
    if (url === '/service-area-policy.json') return Promise.resolve({ ok: true, json: () => Promise.resolve(POLICY) });
    return leadFetch(url, ...([] as unknown[]));
  });
  new Function(AREA)();
  await flush();
  await flush();
  new Function(SOURCE.replace('https://meetings.hubspot.com/PLACEHOLDER', TEST_URL))();
  booking = (window as unknown as { DTBooking: Booking }).DTBooking;
});

beforeEach(() => {
  booking.close();
  booking.identify({});
  document.body.innerHTML = '';
  document.querySelectorAll('script[src*="MeetingsEmbed"]').forEach((s) => s.remove());
  track = vi.fn();
  (window as unknown as { DT: unknown }).DT = { track, attr: () => ({ utm_source: 'youtube', pageUri: 'https://realdarrentsai.com/' }) };
  leadFetch = vi.fn(() => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true }) }));
  (window as unknown as { fetch: unknown }).fetch = (url: string, opts: unknown) => leadFetch(url, opts);
  assign = vi.fn();
  Object.defineProperty(window, 'location', { configurable: true, value: { ...window.location, pathname: '/', assign } });
});

describe('one config spot for the calendar', () => {
  it('names the HubSpot meetings address once, as a placeholder until Darren sends it', () => {
    expect(SOURCE.match(/https:\/\/meetings\.hubspot\.com\/[A-Za-z0-9-]+/g)).toEqual(['https://meetings.hubspot.com/PLACEHOLDER']);
    expect(SOURCE).toMatch(/BOOKING_READY = BOOKING_URL\.indexOf\('PLACEHOLDER'\) === -1/);
  });

  it('has nothing of Calendly left in it', () => {
    // Comments stripped: why Calendly went is deliberately explained there.
    const code = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code.toLowerCase()).not.toContain('calendly');
  });

  it('uses the Release 0 SMS wording, word for word with compliance.js', () => {
    for (const m of SOURCE.matchAll(/var SMS_(?:INFO|MARKETING)_TEXT = '([^']+)'/g)) {
      expect(COMPLIANCE).toContain(m[1]);
    }
    expect(SOURCE).toContain("SMS_CONSENT_VERSION = '2026-10-15-v5'");
  });
});

describe('step 1: property', () => {
  it('asks the goal first, then use, state and type', () => {
    booking.open();
    expect(card().querySelector('[data-q="bookingGoal"]')).not.toBeNull();
    expect(card().querySelector('[data-q="propertyUse"]')).toBeNull();
    tap('bookingGoal', 'equity');
    expect(card().querySelector('[data-q="propertyUse"]')).not.toBeNull();
    expect(card().querySelector('[data-book="state"]')).not.toBeNull();
    expect(card().querySelector('[data-q="propertyType"]')).not.toBeNull();
    expect(card().querySelector('input[name="email"]')).toBeNull();
    expect(card().querySelector('a[href^="tel:"]')).toBeNull();
  });

  it('keeps the visitor on the step until all three are answered', () => {
    booking.open();
    tap('bookingGoal', 'equity');
    tap('propertyUse', 'primary');
    next();
    expect(errText()).toMatch(/answer each question/);
    expect(card().querySelector('[data-q="mortgageCurrent"]')).toBeNull();
  });

  it('sends an unsupported primary-home state to /out-of-market-primary/, posting nothing', () => {
    booking.open();
    tap('bookingGoal', 'equity');
    tap('propertyUse', 'primary');
    pickState('NY');
    tap('propertyType', 'single-family-condo');
    next();
    expect(assign).toHaveBeenCalledWith('/out-of-market-primary/');
    expect(leadFetch).not.toHaveBeenCalled();
  });

  it('sends an unsupported rental state to /out-of-market-dscr/', () => {
    booking.open();
    tap('bookingGoal', 'equity');
    tap('propertyUse', 'investment');
    pickState('NY');
    tap('propertyType', 'single-family-condo');
    next();
    expect(assign).toHaveBeenCalledWith('/out-of-market-dscr/');
  });

  it('declines mobile homes and land with no calendar and no phone number', () => {
    booking.open();
    tap('bookingGoal', 'equity');
    tap('propertyUse', 'primary');
    pickState('CA');
    tap('propertyType', 'mobile-land');
    next();
    expect(card().textContent).toMatch(/mobile homes or land/);
    expect(card().querySelector('a[href^="tel:"]')).toBeNull();
    expect(card().querySelector('.meetings-iframe-container')).toBeNull();
    expect(leadFetch).not.toHaveBeenCalled();
  });

  it('offers primary, second home and rental (policy v3)', () => {
    booking.open();
    tap('bookingGoal', 'equity');
    const values = [...card().querySelectorAll('[data-q="propertyUse"] [data-value]')].map((b) => b.getAttribute('data-value'));
    expect(values).toEqual(['primary', 'second-home', 'investment']);
  });

  it('lets a second home in a licensed state through to the knockouts', () => {
    booking.open();
    tap('bookingGoal', 'equity');
    tap('propertyUse', 'second-home');
    pickState('HI');
    tap('propertyType', 'single-family-condo');
    next();
    expect(card().querySelector('[data-q="mortgageCurrent"]')).not.toBeNull();
  });

  it('sends a second home anywhere else to /out-of-market-primary/', () => {
    booking.open();
    tap('bookingGoal', 'equity');
    tap('propertyUse', 'second-home');
    pickState('NV');
    tap('propertyType', 'single-family-condo');
    next();
    expect(assign).toHaveBeenCalledWith('/out-of-market-primary/');
    expect(leadFetch).not.toHaveBeenCalled();
  });
});

describe('step 1: the goal decides the property question (policy v3)', () => {
  const qText = () => card().textContent ?? '';
  const uses = () => [...card().querySelectorAll('[data-q="propertyUse"] [data-value]')].map((b) => b.getAttribute('data-value'));

  it('equity asks about the home being borrowed against, with primary, second home or rental', () => {
    booking.open();
    tap('bookingGoal', 'equity');
    expect(qText()).toContain('Where is the home you’re borrowing against?');
    expect(uses()).toEqual(['primary', 'second-home', 'investment']);
    expect(qText()).not.toMatch(/not your current residence|where.*cash/i);
  });

  it('DSCR and commercial ask only where the investment property is', () => {
    for (const goal of ['dscr', 'commercial']) {
      booking.open();
      tap('bookingGoal', goal);
      expect(card().querySelector('[data-q="propertyUse"]')).toBeNull();
      expect(qText()).toMatch(goal === 'dscr' ? /Where is the investment property\?/ : /Where is the property\?/);
      booking.close();
    }
  });

  it('own-home and not-sure ask primary or second home only', () => {
    for (const goal of ['own-home', 'not-sure']) {
      booking.open();
      tap('bookingGoal', goal);
      expect(uses()).toEqual(['primary', 'second-home']);
      booking.close();
    }
  });

  it('flags commercial and not-sure for Darren, and posts the goal', async () => {
    booking.open();
    passSteps('primary', 'CA', 'not-sure');
    fillContact();
    await flush();
    expect(leadBody()).toMatchObject({ bookingGoal: 'not-sure', reviewFlag: 'Yes' });
  });
});

describe('step 2: the two knockouts', () => {
  function toStep2() {
    booking.open();
    tap('bookingGoal', 'equity');
    tap('propertyUse', 'primary');
    pickState('CA');
    tap('propertyType', '2-4-units');
    next();
  }

  it('declines a mortgage that is not current', () => {
    toStep2();
    tap('mortgageCurrent', 'no');
    tap('recentBankruptcyForeclosure', 'no');
    next();
    expect(card().textContent).toMatch(/not the right next step/);
    expect(card().querySelector('a[href^="tel:"]')).toBeNull();
    expect(leadFetch).not.toHaveBeenCalled();
  });

  it('declines a bankruptcy or foreclosure in the last 4 years', () => {
    toStep2();
    tap('mortgageCurrent', 'yes');
    tap('recentBankruptcyForeclosure', 'yes');
    next();
    expect(card().textContent).toMatch(/not the right next step/);
    expect(track).toHaveBeenCalledWith('booking_prequal_declined', { reason: 'bankruptcy-foreclosure', page_path: '/' });
  });

  it('lets a buyer with no mortgage through', () => {
    toStep2();
    tap('mortgageCurrent', 'no-mortgage');
    tap('recentBankruptcyForeclosure', 'no');
    next();
    expect(card().querySelector('form')).not.toBeNull();
  });
});

describe('step 3: save the lead, then the calendar', () => {
  it('requires the privacy acknowledgment and posts nothing without it', async () => {
    booking.open();
    passSteps();
    fillContact({ privacy: false });
    await flush();
    expect(errText()).toMatch(/Privacy Policy/);
    expect(leadFetch).not.toHaveBeenCalled();
  });

  it('posts the prequal answers, consent evidence and attribution as booking-prequal', async () => {
    booking.open();
    passSteps();
    fillContact();
    await flush();
    expect(leadFetch).toHaveBeenCalledTimes(1);
    expect(leadFetch.mock.calls[0][0]).toBe('/api/lead');
    expect(leadBody()).toMatchObject({
      formId: 'booking-prequal', source: 'home-contact', email: 'ada@example.com',
      bookingGoal: 'equity', reviewFlag: '',
      propertyUse: 'primary', propertyState: 'CA', state: 'CA', propertyType: 'single-family-condo',
      mortgageCurrent: 'yes', recentBankruptcyForeclosure: 'no', privacyAcknowledged: true,
      smsInformationalConsent: false, smsMarketingConsent: false, serviceAreaVersion: POLICY.version,
      utm_source: 'youtube',
    });
    expect(prequalPasses(leadBody())).toBe(true);
  });

  it('shows the calendar only after a confirmed receipt, prefilled for the same contact', async () => {
    let resolveLead: (v: unknown) => void = () => {};
    leadFetch = vi.fn(() => new Promise((r) => { resolveLead = r; }));
    booking.open();
    passSteps();
    fillContact();
    await flush();
    expect(card().querySelector('.meetings-iframe-container')).toBeNull();
    resolveLead({ ok: true, status: 200, json: () => Promise.resolve({}) });
    await flush();
    await flush();
    const container = card().querySelector('.meetings-iframe-container')!;
    const src = container.getAttribute('data-src')!;
    expect(src.startsWith(TEST_URL + '?embed=true')).toBe(true);
    expect(src).toContain('firstname=Ada');
    expect(src).toContain('lastname=Lovelace');
    expect(src).toContain('email=ada%40example.com');
    expect(document.querySelector('script[src*="MeetingsEmbedCode.js"]')).not.toBeNull();
    expect(card().querySelector('a[href^="tel:"]')).not.toBeNull();
  });

  it('fires generate_lead once with no PII, then booking_page_shown', async () => {
    booking.open();
    passSteps();
    fillContact();
    await flush();
    await flush();
    const events = track.mock.calls.map((c) => c[0]);
    expect(events.filter((e) => e === 'generate_lead')).toHaveLength(1);
    expect(events).toContain('booking_page_shown');
    const lead = track.mock.calls.find((c) => c[0] === 'generate_lead')![1];
    expect(lead).toEqual({ lead_source: 'home-contact', form_id: 'booking-prequal', page_path: '/' });
    expect(JSON.stringify(track.mock.calls)).not.toMatch(/ada|Lovelace|7145550123/i);
  });

  it('shows no calendar when the server refuses the answers', async () => {
    leadFetch = vi.fn(() => Promise.resolve({ ok: false, status: 422, json: () => Promise.resolve({ field: 'prequal' }) }));
    booking.open();
    passSteps();
    fillContact();
    await flush();
    await flush();
    expect(card().querySelector('.meetings-iframe-container')).toBeNull();
    expect(card().querySelector('a[href^="tel:"]')).toBeNull();
    expect(track.mock.calls.map((c) => c[0])).not.toContain('generate_lead');
  });

  it('follows the server to the out-of-market page if its screening says no', async () => {
    leadFetch = vi.fn(() => Promise.resolve({ ok: false, status: 422, json: () => Promise.resolve({ field: 'propertyState' }) }));
    booking.open();
    passSteps();
    fillContact();
    await flush();
    await flush();
    expect(assign).toHaveBeenCalledWith('/out-of-market-primary/');
  });

  it('shows no calendar for a receipt it cannot confirm, and does not ask for a resubmit', async () => {
    leadFetch = vi.fn(() => Promise.resolve({ ok: false, status: 502, json: () => Promise.resolve({}) }));
    booking.open();
    passSteps();
    fillContact();
    await flush();
    await flush();
    expect(card().querySelector('.meetings-iframe-container')).toBeNull();
    expect(card().textContent).toMatch(/No need to submit again/);
  });

  it('prefills the contact step from an earlier form', () => {
    booking.identify({ name: 'Ada Lovelace', email: 'ada@example.com' });
    booking.open();
    passSteps();
    const form = card().querySelector('form') as HTMLFormElement;
    expect((form.elements.namedItem('firstName') as HTMLInputElement).value).toBe('Ada');
    expect((form.elements.namedItem('email') as HTMLInputElement).value).toBe('ada@example.com');
  });
});

describe('meeting_booked', () => {
  it('fires once for HubSpot saying the meeting was booked', () => {
    window.dispatchEvent(new MessageEvent('message', { data: { meetingBookSucceeded: true }, origin: 'https://meetings.hubspot.com' }));
    window.dispatchEvent(new MessageEvent('message', { data: { meetingBookSucceeded: true }, origin: 'https://meetings-na2.hubspot.com' }));
    expect(track.mock.calls.filter((c) => c[0] === 'meeting_booked')).toEqual([['meeting_booked', { page_path: '/' }]]);
  });

  it('ignores the same message from any other origin', () => {
    for (const origin of ['https://evil.example', 'https://meetings.hubspot.com.attacker.example', 'https://app.hubspot.com']) {
      window.dispatchEvent(new MessageEvent('message', { data: { meetingBookSucceeded: true }, origin }));
    }
    expect(track.mock.calls.map((c) => c[0])).not.toContain('meeting_booked');
  });
});

describe('the panel', () => {
  it('closes on Escape and does not stack a second copy', () => {
    booking.open();
    booking.open();
    expect(document.querySelectorAll('.dt-book-overlay')).toHaveLength(1);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(document.querySelector('.dt-book-overlay')?.classList.contains('dt-open')).toBeFalsy();
  });

  it('mounts inline for /book/, where the Call button is exempt from the tel: redirect', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    booking.mount(host);
    expect(host.classList.contains('dt-book-inline')).toBe(true);
    expect(host.querySelector('[data-q="bookingGoal"]')).not.toBeNull();
    expect(AREA).toContain(".closest('.dt-book-overlay, .dt-book-inline')");
  });
});
