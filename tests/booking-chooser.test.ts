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
 *  - The calendar appears only after /api/lead confirms receipt, with a Google frame and a safe new-tab fallback.
 *  - generate_lead fires once, for a confirmed qualified lead, with no PII.
 *  - an unverified iframe message never reports meeting_booked.
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
const TEST_URL = 'https://calendar.google.com/calendar/appointments/schedules/test?gv=true';

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

function selectGoal(value: string) {
  tap('bookingGoal', value);
  if (value === 'not-sure') {
    const note = card().querySelector('textarea') as HTMLTextAreaElement;
    note.value = 'I want to compare refinancing with using my equity.'; note.dispatchEvent(new Event('input'));
  }
  next();
}

function passSteps(use = 'primary', state = 'CA', goal = 'equity') {
  selectGoal(goal);
  if (card().querySelector('[data-q="propertyUse"]')) tap('propertyUse', use);
  pickState(state);
  next();
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
  new Function(SOURCE.replace(/var BOOKING_URL = '[^']*'/, `var BOOKING_URL = '${TEST_URL}'`))();
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
  it('names the supplied Google appointment schedule in one setting', () => {
    expect(SOURCE.match(/var BOOKING_URL = /g)).toHaveLength(1);
    expect(SOURCE).toContain('https://calendar.google.com/calendar/appointments/schedules/');
    expect(SOURCE).not.toContain('MeetingsEmbedCode.js');
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
    expect(card().querySelector('[data-book="state"]')).toBeNull();
    next();
    expect(card().querySelector('[data-q="propertyUse"]')).not.toBeNull();
    expect(card().querySelector('[data-book="state"]')).not.toBeNull();
    expect(card().querySelector('[data-q="propertyType"]')).toBeNull();
    expect(card().querySelector('input[name="email"]')).toBeNull();
    expect(card().querySelector('a[href^="tel:"]')).toBeNull();
  });

  it('keeps the visitor on the step until all three are answered', () => {
    booking.open();
    selectGoal('equity');
    tap('propertyUse', 'primary');
    next();
    expect(errText()).toMatch(/answer each question/);
    expect(card().querySelector('[data-q="mortgageCurrent"]')).toBeNull();
  });

  it('sends an unsupported primary-home state to /out-of-market-primary/, posting nothing', () => {
    booking.open();
    selectGoal('equity');
    tap('propertyUse', 'primary');
    pickState('NY');
    next();
    expect(assign).toHaveBeenCalledWith('/out-of-market-primary/');
    expect(leadFetch).not.toHaveBeenCalled();
  });

  it('sends an unsupported rental state to /out-of-market-dscr/', () => {
    booking.open();
    selectGoal('equity');
    tap('propertyUse', 'investment');
    pickState('NY');
    next();
    expect(assign).toHaveBeenCalledWith('/out-of-market-dscr/');
  });

  it('declines mobile homes and land with no calendar and no phone number', () => {
    booking.open();
    selectGoal('equity');
    tap('propertyUse', 'primary');
    pickState('CA');
    next();
    tap('propertyType', 'mobile-land');
    next();
    expect(card().textContent).toMatch(/mobile homes or land/);
    expect(card().querySelector('a[href^="tel:"]')).toBeNull();
    expect(card().querySelector('.dt-book-frame iframe')).toBeNull();
    expect(leadFetch).not.toHaveBeenCalled();
  });

  it('offers primary, second home and rental (policy v3)', () => {
    booking.open();
    selectGoal('equity');
    const values = [...card().querySelectorAll('[data-q="propertyUse"] [data-value]')].map((b) => b.getAttribute('data-value'));
    expect(values).toEqual(['primary', 'second-home', 'investment']);
  });

  it('lets a second home in a licensed state through to the knockouts', () => {
    booking.open();
    selectGoal('equity');
    tap('propertyUse', 'second-home');
    pickState('HI');
    next();
    tap('propertyType', 'single-family-condo');
    next();
    expect(card().querySelector('[data-q="mortgageCurrent"]')).not.toBeNull();
  });

  it('sends a second home anywhere else to /out-of-market-primary/', () => {
    booking.open();
    selectGoal('equity');
    tap('propertyUse', 'second-home');
    pickState('NV');
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
    selectGoal('equity');
    expect(qText()).toContain('Where is the home you’re borrowing against?');
    expect(uses()).toEqual(['primary', 'second-home', 'investment']);
    expect(qText()).not.toMatch(/not your current residence|where.*cash/i);
  });

  it('DSCR and commercial ask only where the investment property is', () => {
    for (const goal of ['dscr', 'commercial']) {
      booking.open();
      selectGoal(goal);
      expect(card().querySelector('[data-q="propertyUse"]')).toBeNull();
      expect(qText()).toMatch(goal === 'dscr' ? /Where is the investment property\?/ : /Where is the property\?/);
      booking.close();
      booking.identify({});
    }
  });

  it('own-home and not-sure ask primary or second home only', () => {
    for (const goal of ['own-home', 'not-sure']) {
      booking.open();
      selectGoal(goal);
      expect(uses()).toEqual(['primary', 'second-home']);
      booking.close();
      booking.identify({});
    }
  });

  it('requires a nonblank explanation for not-sure, and hides it for another goal', () => {
    booking.open(); tap('bookingGoal', 'not-sure'); next();
    expect(errText()).toContain('tell Darren');
    const note = card().querySelector('textarea') as HTMLTextAreaElement;
    expect(document.activeElement).toBe(note);
    note.value = '   '; note.dispatchEvent(new Event('input')); next();
    expect(errText()).toContain('tell Darren');
    expect(leadFetch).not.toHaveBeenCalled();
    selectGoal('equity'); expect(card().querySelector('textarea')).toBeNull();
  });

  it('flags commercial and not-sure for Darren, and posts the goal', async () => {
    booking.open();
    passSteps('primary', 'CA', 'not-sure');
    fillContact();
    await flush();
    expect(leadBody()).toMatchObject({ bookingGoal: 'not-sure', reviewFlag: 'Yes', message: 'I want to compare refinancing with using my equity.' });
  });
});

describe('step 2: the two knockouts', () => {
  function toStep2() {
    booking.open();
    selectGoal('equity');
    tap('propertyUse', 'primary');
    pickState('CA');
    next();
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
      formId: 'booking-prequal', source: 'home-equity', email: 'ada@example.com',
      bookingGoal: 'equity', reviewFlag: '',
      propertyUse: 'primary', propertyState: 'CA', state: 'CA', propertyType: 'single-family-condo',
      mortgageCurrent: 'yes', recentBankruptcyForeclosure: 'no', privacyAcknowledged: true,
      smsInformationalConsent: false, smsMarketingConsent: false, serviceAreaVersion: POLICY.version,
      utm_source: 'youtube',
    });
    expect(prequalPasses(leadBody())).toBe(true);
  });

  it('shows the calendar only after a confirmed receipt, with a safe fallback and no PII in its URL', async () => {
    let resolveLead: (v: unknown) => void = () => {};
    leadFetch = vi.fn(() => new Promise((r) => { resolveLead = r; }));
    booking.open();
    passSteps();
    fillContact();
    await flush();
    expect(card().querySelector('.dt-book-frame iframe')).toBeNull();
    resolveLead({ ok: true, status: 200, json: () => Promise.resolve({}) });
    await flush();
    await flush();
    const container = card().querySelector('.dt-book-frame iframe')!;
    const src = container.getAttribute('src')!;
    expect(src).toBe(TEST_URL);
    expect(src).not.toMatch(/Ada|Lovelace|ada|firstname|lastname|email/);
    expect(container.getAttribute('title')).toBe('Book a qualification call with Darren Tsai');
    expect(card().querySelector('.dt-book-calendar-link')?.getAttribute('href')).toBe(TEST_URL);
    expect(document.querySelector('script[src*="MeetingsEmbedCode.js"]')).toBeNull();
    expect(card().querySelector('a[href^="tel:"]')).not.toBeNull();
  });

  it('fires generate_lead once, with no PII before consent, then booking_page_shown', async () => {
    booking.open();
    passSteps();
    fillContact();
    await flush();
    await flush();
    const events = track.mock.calls.map((c) => c[0]);
    expect(events.filter((e) => e === 'generate_lead')).toHaveLength(1);
    expect(events).toContain('booking_page_shown');
    const lead = track.mock.calls.find((c) => c[0] === 'generate_lead')![1];
    expect(lead).toEqual({ lead_source: 'home-equity', form_id: 'booking-prequal', page_path: '/' });
    expect(JSON.stringify(track.mock.calls)).not.toMatch(/ada|Lovelace|7145550123/i);
  });

  it('attaches user_data for enhanced conversions only when DT.userData returns it (after consent)', async () => {
    const userData = vi.fn(() => ({ email: 'ada@example.com', phone_number: '+17145550123' }));
    (window as unknown as { DT: unknown }).DT = { track, attr: () => ({}), userData };
    booking.open();
    passSteps();
    fillContact();
    await flush();
    await flush();
    expect(userData).toHaveBeenCalledWith(expect.objectContaining({ email: 'ada@example.com', firstName: 'Ada', lastName: 'Lovelace' }));
    const lead = track.mock.calls.find((c) => c[0] === 'generate_lead')![1];
    expect(lead).toEqual({ lead_source: 'home-equity', form_id: 'booking-prequal', page_path: '/', user_data: { email: 'ada@example.com', phone_number: '+17145550123' } });
    // Only generate_lead carries it.
    for (const [event, params] of track.mock.calls) if (event !== 'generate_lead') expect(JSON.stringify(params)).not.toContain('ada@');
  });

  it('shows no calendar when the server refuses the answers', async () => {
    leadFetch = vi.fn(() => Promise.resolve({ ok: false, status: 422, json: () => Promise.resolve({ field: 'prequal' }) }));
    booking.open();
    passSteps();
    fillContact();
    await flush();
    await flush();
    expect(card().querySelector('.dt-book-frame iframe')).toBeNull();
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
    expect(card().querySelector('.dt-book-frame iframe')).toBeNull();
    expect(card().textContent).toMatch(/avoid a duplicate/);
    expect(card().textContent).not.toMatch(/your details reached Darren/);
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

describe('Google booking conversion truth', () => {
  it('never reports a booking from an iframe load or an unverified message', () => {
    for (const origin of ['https://calendar.google.com', 'https://meetings.hubspot.com', 'https://meetings-na2.hubspot.com', 'https://evil.example']) {
      window.dispatchEvent(new MessageEvent('message', { data: { meetingBookSucceeded: true }, origin }));
    }
    expect(track.mock.calls.map((c) => c[0])).not.toContain('meeting_booked');
  });
});

describe('the panel', () => {
  it('reuses the inline journey when a visitor clicks Book a Call on /book/', () => {
    Object.defineProperty(window,'location',{configurable:true,value:{...window.location,pathname:'/book/'}});
    const mount=document.createElement('main'); mount.id='dt-book-mount'; document.body.appendChild(mount); booking.mount(mount);
    tap('bookingGoal','equity'); next(); pickState('CA');
    booking.open();
    expect(document.querySelector('.dt-book-overlay')).toBeNull();
    expect((card().querySelector('[data-book="state"]') as HTMLSelectElement).value).toBe('CA');
  });
  it('returns mobile drawer launches to the visible menu control', () => {
    document.body.innerHTML='<button class="nav-hamburger">Open menu</button><div class="nav-mobile-menu"><button id="drawer-book">Book a Call</button></div>';
    (document.querySelector('#drawer-book') as HTMLButtonElement).focus();
    booking.open(); booking.close();
    expect(document.activeElement).toBe(document.querySelector('.nav-hamburger'));
  });
  it('retains the current stage and answers after close and reopen, and restores the trigger focus', () => {
    const trigger = document.createElement('button'); document.body.appendChild(trigger); trigger.focus();
    booking.open(); selectGoal('equity'); pickState('CA'); tap('propertyUse', 'primary');
    booking.close();
    expect(document.activeElement).toBe(trigger);
    expect(document.body.classList.contains('dt-booking-open')).toBe(false);
    booking.open();
    expect((card().querySelector('[data-book="state"]') as HTMLSelectElement).value).toBe('CA');
    expect(card().querySelector('[data-q="propertyUse"] [data-value="primary"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(document.body.classList.contains('dt-booking-open')).toBe(true);
  });

  it('preserves contact details and consent choices when going back, without posting', () => {
    booking.open(); passSteps();
    const form = card().querySelector('form') as HTMLFormElement;
    for (const [key,value] of Object.entries({firstName:'Ada',lastName:'Lovelace',email:'ada@example.com',phone:'7145550123'})) (form.elements.namedItem(key) as HTMLInputElement).value=value;
    form.dispatchEvent(new Event('submit',{cancelable:true}));
    (form.elements.namedItem('smsInfo') as HTMLInputElement).checked=true;
    (card().querySelector('.dt-book-back') as HTMLButtonElement).click();
    expect((form.elements.namedItem('email') as HTMLInputElement).value).toBe('ada@example.com');
    expect((card().querySelector('.dt-book-contact-details') as HTMLElement).hidden).toBe(false);
    form.dispatchEvent(new Event('submit',{cancelable:true}));
    expect((form.elements.namedItem('smsInfo') as HTMLInputElement).checked).toBe(true);
    expect((form.elements.namedItem('smsMarketing') as HTMLInputElement).checked).toBe(false);
    expect(leadFetch).not.toHaveBeenCalled();
  });

  it('invalidates later stages when a property answer changes', () => {
    booking.open(); passSteps();
    (card().querySelector('[data-stage="1"]') as HTMLButtonElement).click();
    pickState('NY');
    expect((card().querySelector('[data-stage="2"]') as HTMLButtonElement).disabled).toBe(true);
    next();
    expect(assign).toHaveBeenCalledWith('/out-of-market-primary/');
    expect(leadFetch).not.toHaveBeenCalled();
  });

  it('blocks duplicate submission and stage changes while saving, including after reopening', async () => {
    leadFetch=vi.fn(()=>new Promise(()=>{}));
    booking.open(); passSteps(); fillContact();
    const form=card().querySelector('form') as HTMLFormElement;
    form.dispatchEvent(new Event('submit',{cancelable:true}));
    expect(leadFetch).toHaveBeenCalledTimes(1);
    expect([...card().querySelectorAll('.dt-book-progress button')].every(b=>(b as HTMLButtonElement).disabled)).toBe(true);
    booking.close(); booking.open();
    expect((card().querySelector('.dt-book-next') as HTMLButtonElement).disabled).toBe(true);
    expect(card().querySelector('iframe')).toBeNull();
  });

  it('returns to the editable email field on a definitive server email rejection', async () => {
    leadFetch=vi.fn(()=>Promise.resolve({ok:false,status:422,json:()=>Promise.resolve({field:'email',message:'Email domain does not exist.'})}));
    booking.open(); passSteps(); fillContact(); await flush(); await flush();
    const email=card().querySelector('[name="email"]') as HTMLInputElement;
    expect(document.activeElement).toBe(email);
    expect(email.closest('[hidden]')).toBeNull();
    expect(email.value).toBe('ada@example.com');
    expect(errText()).toBe('Email domain does not exist.');
    expect(card().querySelector('iframe')).toBeNull();
  });

  it('does not send a guidance note after switching to a known goal', async () => {
    booking.open(); tap('bookingGoal','not-sure');
    const note=card().querySelector('textarea') as HTMLTextAreaElement;
    note.value='A private question'; note.dispatchEvent(new Event('input'));
    passSteps(); fillContact(); await flush();
    expect(leadBody().message).toBeUndefined();
  });

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

describe('contact checks (16 Oct 2026)', () => {
  function toContact() {
    booking.open();
    passSteps();
    return card().querySelector('form') as HTMLFormElement;
  }
  const field = (form: HTMLFormElement, name: string) => form.elements.namedItem(name) as HTMLInputElement;

  it('formats the phone as a US number while it is typed', () => {
    const form = toContact();
    const phone = field(form, 'phone');
    for (const [typed, shown] of [['714', '714'], ['7145', '(714) 5'], ['7145550123', '(714) 555-0123'], ['17145550123', '(714) 555-0123'], ['+1 (714) 555-0123 99', '(714) 555-0123']]) {
      phone.value = typed;
      phone.dispatchEvent(new Event('input', { bubbles: true }));
      expect(phone.value, typed).toBe(shown);
    }
    expect(phone.getAttribute('inputmode')).toBe('tel');
  });

  it.each(['7141110123', '1234567890', '9115550123', '71455501'])('refuses %s as not a US number and posts nothing', async (typed) => {
    const form = toContact();
    field(form, 'firstName').value = 'Ada'; field(form, 'lastName').value = 'Lovelace';
    field(form, 'email').value = 'ada@example.com'; field(form, 'phone').value = typed;
    field(form, 'privacy').checked = true;
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();
    expect(errText()).toBe('Please enter a valid US phone number.');
    expect(leadFetch).not.toHaveBeenCalled();
  });

  it.each(['ada', 'ada@example', 'ada@example.c', 'ada @example.com'])('refuses the email %s and posts nothing', async (email) => {
    const form = toContact();
    field(form, 'firstName').value = 'Ada'; field(form, 'lastName').value = 'Lovelace';
    field(form, 'email').value = email; field(form, 'phone').value = '(714) 555-0123';
    field(form, 'privacy').checked = true;
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();
    expect(errText()).toBe('Please enter a valid email address.');
    expect(leadFetch).not.toHaveBeenCalled();
  });

  it('posts the formatted number', async () => {
    const form = toContact();
    field(form, 'firstName').value = 'Ada'; field(form, 'lastName').value = 'Lovelace';
    field(form, 'email').value = 'ada@example.com';
    const phone = field(form, 'phone');
    phone.value = '7145550123'; phone.dispatchEvent(new Event('input', { bubbles: true }));
    field(form, 'privacy').checked = true;
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();
    expect(leadBody().phone).toBe('(714) 555-0123');
  });
});
