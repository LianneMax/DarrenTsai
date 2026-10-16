/**
 * Booking copy while there is no calendar (16 Oct 2026). Until BOOKING_URL in
 * public/booking-chooser.js is a real HubSpot meetings link, a passing lead is
 * called back, so /book/, the shared prequal and /home-equity/ say "Send my
 * request" and "before Darren calls you". The calendar wording comes back on
 * its own from that one setting: the chooser reads it directly, and the React
 * pages get it at build (booking-ready.config.ts -> __BOOKING_CALENDAR_READY__).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { bookingCalendarReady } from '../booking-ready.config';
import { BOOKING_CALENDAR_READY } from '../src/utils/booking';
import { StepEquityContact, EquityPageHero, type EquityPageView } from '../src/components/HomeEquityViews';

const read = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8');
const SOURCE = read('public/booking-chooser.js');
const POLICY = JSON.parse(read('public/service-area-policy.json'));

/** Evaluates the chooser with a given BOOKING_URL and opens it to the contact step. */
async function contactStep(url: string) {
  document.body.innerHTML = '<p>Three quick steps. They check that Darren can help with your property <span data-booking-when>before Darren calls you</span>.</p><div id="m"></div>';
  (window as unknown as { fetch: unknown }).fetch = vi.fn(async () => ({ ok: true, json: async () => POLICY }));
  new Function(read('public/service-area.js'))();
  await vi.waitFor(() => expect((window as unknown as { DTServiceArea: { ready: () => boolean } }).DTServiceArea.ready()).toBe(true));
  new Function(SOURCE.replace("var BOOKING_URL = 'https://meetings.hubspot.com/PLACEHOLDER'", `var BOOKING_URL = '${url}'`))();
  const booking = (window as unknown as { DTBooking: { mount: (el: Element) => void } }).DTBooking;
  booking.mount(document.getElementById('m')!);
  const card = () => document.querySelector('#m .dt-book-card')!;
  const intro = card().querySelector('.dt-book-sub')!.textContent;
  const tap = (q: string, v: string) => (card().querySelector(`[data-q="${q}"] [data-value="${v}"]`) as HTMLElement).click();
  tap('bookingGoal', 'equity');
  const sel = card().querySelector('[data-book="state"]') as HTMLSelectElement;
  sel.value = 'CA'; sel.dispatchEvent(new Event('change'));
  tap('propertyUse', 'primary'); tap('propertyType', 'single-family-condo');
  (card().querySelector('.dt-book-next') as HTMLElement).click();
  tap('mortgageCurrent', 'yes'); tap('recentBankruptcyForeclosure', 'no');
  (card().querySelector('.dt-book-next') as HTMLElement).click();
  return { intro, hero: document.querySelector('[data-booking-when]')!.textContent, button: card().querySelector('.dt-book-next')!.textContent };
}

beforeEach(() => { document.body.innerHTML = ''; });

describe('one setting decides the booking wording', () => {
  it('reads BOOKING_URL as a placeholder today, in the build flag and the chooser alike', () => {
    expect(SOURCE).toContain("var BOOKING_URL = 'https://meetings.hubspot.com/PLACEHOLDER'");
    expect(bookingCalendarReady()).toBe(false);
    expect(BOOKING_CALENDAR_READY).toBe(false);
  });

  it('says "Send my request" and "before Darren calls you" while it is the placeholder', async () => {
    const s = await contactStep('https://meetings.hubspot.com/PLACEHOLDER');
    expect(s.button).toBe('Send my request');
    expect(s.intro).toContain('before Darren calls you');
    expect(s.hero).toBe('before Darren calls you');
    expect(SOURCE).toContain('Darren has your details and will call you to set a time.');
  });

  it('brings the calendar wording back on its own once a real link is set', async () => {
    const s = await contactStep('https://meetings.hubspot.com/darren-test');
    expect(s.button).toBe('See Darren’s calendar'.replace('’', "'"));
    expect(s.intro).toContain('before you pick a time');
    expect(s.hero).toBe('before you pick a time');
  });
});

describe('/home-equity/ follows the same setting', () => {
  const v = { sending: false, fname: '', setFname: () => {}, lname: '', setLname: () => {}, email: '', setEmail: () => {},
    emailHint: null, setEmailHint: () => {}, phone: '', setPhone: () => {}, goStep: () => {}, submitLead: () => {} } as unknown as EquityPageView;

  it('asks to send the request and says Darren will call, while there is no calendar', () => {
    const page = renderToStaticMarkup(<StepEquityContact v={v} />);
    expect(page).toContain('Send my request');
    expect(page).toContain('Darren will call you to set a time.');
    expect(page).not.toMatch(/See Darren.{1,6}s Calendar|pick a time on Darren/);
    expect(renderToStaticMarkup(<EquityPageHero />)).toContain('Darren calls you');
  });
});

describe('the consent words are untouched (10DLC review)', () => {
  it('keeps every consent string in the chooser identical to compliance.js', () => {
    for (const m of SOURCE.matchAll(/var SMS_(?:INFO|MARKETING)_TEXT = '([^']+)'/g)) expect(read('public/compliance.js')).toContain(m[1]);
    expect(SOURCE).toContain('I acknowledge the <a href="/privacy-policy" target="_blank" rel="noopener">Privacy Policy</a> and <a href="/legal" target="_blank" rel="noopener">Terms &amp; Legal Disclosures</a>. (Required)');
    expect(SOURCE).toContain('Text messages are optional and not a condition of purchase or of submitting this form. Submitting requests a mortgage review from Darren Tsai (NMLS #2438102 · CA DRE #02103705), Ren Marketing Group LLC / Saxton Mortgage. Not a loan application, approval or commitment to lend. Equal Housing Opportunity.');
  });

  it('keeps the whole block visible: nothing collapsed behind a toggle', () => {
    for (const f of ['src/components/ComplianceDisclosure.tsx', 'public/booking-chooser.js']) {
      expect(read(f), f).not.toMatch(/<details|read more|show more/i);
    }
  });
});

describe('the flag reaches every build path', () => {
  it('is defined for the app build, the pre-rendered shells and the tests', () => {
    const vite = read('vite.config.ts');
    // Twice: the build itself, and the shell renderer, whose server runs with configFile: false.
    expect(vite.match(/__BOOKING_CALENDAR_READY__: JSON\.stringify\(bookingCalendarReady\(\)\)/g)).toHaveLength(2);
    expect(read('vitest.config.ts')).toContain('__BOOKING_CALENDAR_READY__: JSON.stringify(bookingCalendarReady())');
  });
});
