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
  new Function(SOURCE.replace(/var BOOKING_URL = '[^']*'/, `var BOOKING_URL = '${url}'`))();
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
  it('reads the supplied Google schedule in the build flag and chooser alike', () => {
    expect(SOURCE).toContain('https://calendar.google.com/calendar/appointments/schedules/');
    expect(bookingCalendarReady()).toBe(true);
    expect(BOOKING_CALENDAR_READY).toBe(true);
  });

  it('says "Send my request" and "before Darren calls you" while it is the placeholder', async () => {
    const s = await contactStep('https://meetings.hubspot.com/PLACEHOLDER');
    expect(s.button).toBe('Send my request');
    expect(s.intro).toContain('before Darren calls you');
    expect(s.hero).toBe('before Darren calls you');
    expect(SOURCE).toContain('Darren has your details and will call you to set a time.');
  });

  it('brings the calendar wording back on its own once a real link is set', async () => {
    const s = await contactStep('https://calendar.google.com/calendar/appointments/schedules/AcZssZ2jtRO6oFZU1VgtFGePqnIMm8cYDO5eRRXAyu-5cuX9stZDl4mkCOn5nV83SFtW4BtfxhPu336X?gv=true');
    expect(s.button).toBe('See Darren’s calendar'.replace('’', "'"));
    expect(s.intro).toContain('before you pick a time');
    expect(s.hero).toBe('before you pick a time');
  });
});

describe('/home-equity/ follows the same setting', () => {
  const v = { sending: false, fname: '', setFname: () => {}, lname: '', setLname: () => {}, email: '', setEmail: () => {},
    emailHint: null, setEmailHint: () => {}, phone: '', setPhone: () => {}, goStep: () => {}, submitLead: () => {} } as unknown as EquityPageView;

  it('offers the calendar after a saved request when the schedule is configured', () => {
    const page = renderToStaticMarkup(<StepEquityContact v={v} />);
    expect(page).toContain('See Darren&#x27;s Calendar');
    expect(page).toContain('pick a time on Darren');
    expect(renderToStaticMarkup(<EquityPageHero />)).not.toContain('Calendar');
  });
});

describe('the consent words are untouched (10DLC review)', () => {
  it('keeps every consent string in the chooser identical to compliance.js', () => {
    for (const m of SOURCE.matchAll(/var SMS_(?:INFO|MARKETING)_TEXT = '([^']+)'/g)) expect(read('public/compliance.js')).toContain(m[1]);
    expect(SOURCE).toContain('I acknowledge the <a href="/privacy-policy" target="_blank" rel="noopener">Privacy Policy</a> and <a href="/legal" target="_blank" rel="noopener">Terms &amp; Legal Disclosures</a>. (Required)');
    expect(SOURCE).toContain('>Text messages are optional and not a condition of purchase or of submitting this form.</p>');
    expect(SOURCE).toContain('>Submitting requests a mortgage review from Darren Tsai (NMLS #2438102 · CA DRE #02103705), Ren Marketing Group LLC / Saxton Mortgage. Not a loan application, approval or commitment to lend. Equal Housing Opportunity.</p>');
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

describe('React forms format a US number the same way (16 Oct 2026)', () => {
  it.each([
    ['714', '714'], ['7145', '(714) 5'], ['7145550123', '(714) 555-0123'],
    ['17145550123', '(714) 555-0123'], ['+1 (714) 555-0123', '(714) 555-0123'], ['+1 714 555 0123 99', '(714) 555-0123'],
  ])('turns %s into %s', async (typed, shown) => {
    const { formatUsPhone } = await import('../src/utils/phone');
    expect(formatUsPhone(typed)).toBe(shown);
  });

  it('is what every React phone field uses, still validated as a US number', () => {
    for (const f of ['src/components/DebtPageViews.tsx', 'src/components/HomeEquityViews.tsx', 'src/components/PageParts.tsx', 'src/components/LeadForm.tsx']) {
      const src = read(f);
      expect(src, f).toContain('formatUsPhone(');
      expect(src, f).not.toContain('AsYouType');
    }
    for (const f of ['src/components/HomeEquityCalculator.tsx', 'src/components/AduCalculator.tsx', 'src/components/DebtSavingsCalculator.tsx', 'src/components/LeadForm.tsx']) {
      expect(read(f), f).toMatch(/isValidPhoneNumber\(.*, 'US'\)/);
    }
  });
});

describe('consent sizes (16 Oct 2026)', () => {
  it('sets the SMS line at the boxes 12.5px and keeps the mortgage disclosure at 11px', () => {
    for (const f of ['public/compliance.css', 'src/index.css']) {
      const css = read(f);
      expect(css, f).toContain('.compliance-disclosure p{margin:8px 0;font-size:11px;line-height:1.45}');
      expect(css, f).toContain('.compliance-disclosure p.sms-details{font-size:12.5px;line-height:1.45}');
    }
    expect(SOURCE).toContain(".dt-book-note-sms{font-size:12.5px;");
    expect(SOURCE).toContain(".dt-book-note{margin:12px 0 0;font-size:11px;");
  });
});

/**
 * The booking card's Call link starts from the site's one real number, like
 * every other number on the site; CallRail's swap.js replaces it, link and
 * text, with the visitor's tracking number once cookies are accepted, including
 * on links added after load (checked live, 16 Oct 2026).
 */
describe('the booking card number', () => {
  it('is the same real number as the rest of the site, for CallRail to swap', () => {
    const config = /export const PHONE = "([^"]+)"/.exec(read('src/config.ts'))![1];
    expect(SOURCE).toContain(`var PHONE_DISPLAY = '${config}';`);
    expect(SOURCE).toContain(`var PHONE_HREF = 'tel:+1${config.replace(/\D/g, '')}';`);
  });
});
