/**
 * The "Book a Call" chooser, run against the real public/booking-chooser.js.
 *
 * WHY THIS FILE EXISTS. Every booking CTA on the site goes through this, and
 * several of its details are load-bearing in ways that are easy to undo:
 *
 *  - The call option must stay a real <a href="tel:">. That is the entire
 *    tracking story for calls: CallRail's swap.js rewrites the number and the
 *    href, and the existing listener in attribution.js fires phone_click off
 *    the anchor. Turn it into a <button>, as the rest of the site's CTAs are,
 *    and calls silently stop being attributed.
 *  - The calendar must render inline. Calendly announces a booking by posting
 *    to its parent window; in a popup or a new tab we are not the parent, which
 *    is why bookings went uncounted for so long.
 *  - The booking listener must check the origin. Without it any page could post
 *    a forged booking and inflate the count.
 *
 * The source is loaded once for the file rather than per test, because its
 * message listener is registered at evaluation: re-evaluating per test would
 * stack listeners and make one posted message look like several bookings.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SOURCE = readFileSync(resolve(__dirname, '../public/booking-chooser.js'), 'utf8');

type Booking = {
  open: (o: { onSchedule?: () => void; onOpen?: () => void }) => void;
  close: () => void;
  preload: () => void;
  identify: (lead: { name?: string; email?: string }) => void;
};

type InlineConfig = { url: string; parentElement: Element; utm?: Record<string, string> };

let booking: Booking;
let track: ReturnType<typeof vi.fn>;
let initInline: ReturnType<typeof vi.fn>;
let initPopup: ReturnType<typeof vi.fn>;

const overlay = () => document.querySelector('.dt-book-overlay');
const callLink = () => document.querySelector('.dt-book-call') as HTMLAnchorElement | null;
const schedBtn = () => document.querySelector('.dt-book-sched') as HTMLButtonElement | null;
const frame = () => document.querySelector('.dt-book-frame');
const stall = () => document.querySelector('.dt-book-stall');

/** A message as Calendly's iframe posts it. */
function postFromCalendly(event: string, origin = 'https://calendly.com', source?: Window) {
  window.dispatchEvent(new MessageEvent('message', { data: { event }, origin, source }));
}

/**
 * The iframe widget.js would have created inside the panel, which the mocked
 * initInlineWidget does not. Returns its window and a spy on postMessage: that
 * window is both what a real Calendly message would arrive from and where the
 * prefill has to be posted back to.
 */
function mountCalendarIframe() {
  const iframe = document.createElement('iframe');
  frame()!.appendChild(iframe);
  const win = iframe.contentWindow as Window;
  const post = vi.spyOn(win, 'postMessage');
  return { win, post };
}

beforeAll(() => {
  new Function(SOURCE)();
  booking = (window as unknown as { DTBooking: Booking }).DTBooking;
});

beforeEach(() => {
  vi.useRealTimers();
  booking.close();
  booking.identify({ name: '', email: '' });
  document.body.innerHTML = '';
  track = vi.fn();
  (window as unknown as { DT: unknown }).DT = { track, attr: () => ({}) };
  initInline = vi.fn();
  initPopup = vi.fn();
  delete (window as unknown as { Calendly?: unknown }).Calendly;
});

/** Pretend the widget script has arrived. */
function widgetReady() {
  (window as unknown as { Calendly: unknown }).Calendly = {
    initInlineWidget: initInline,
    initPopupWidget: initPopup,
  };
}

describe('the chooser offers both ways to act', () => {
  it('opens with a call option and a schedule option', () => {
    booking.open({});
    expect(overlay()).not.toBeNull();
    expect(callLink()).not.toBeNull();
    expect(schedBtn()).not.toBeNull();
  });

  it('makes the call option a real tel: anchor, not a button', () => {
    // This is what CallRail rewrites and what attribution.js reads. A button
    // here would be untracked and unswappable.
    booking.open({});
    const link = callLink()!;
    expect(link.tagName).toBe('A');
    expect(link.getAttribute('href')).toMatch(/^tel:\+?\d+$/);
  });

  it('shows the number, so CallRail has something to swap', () => {
    booking.open({});
    expect(callLink()!.textContent).toContain('714');
  });

  it('leaves the call anchor free to navigate', () => {
    // No preventDefault: the tel: href must fire, and the click must reach
    // document so attribution.js sees it.
    booking.open({});
    const ev = new MouseEvent('click', { bubbles: true, cancelable: true });
    callLink()!.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
  });

  it('preconnects to Calendly while the visitor reads the options', () => {
    // The iframe is the slow part of an inline embed. Warming DNS and TLS here
    // buys most of that back before they have picked anything.
    booking.open({});
    const hosts = [...document.head.querySelectorAll('link[rel="preconnect"]')]
      .map((l) => l.getAttribute('href'));
    expect(hosts).toContain('https://calendly.com');
    expect(hosts).toContain('https://assets.calendly.com');
  });
});

describe('choosing to schedule', () => {
  it('renders the calendar inline, in the panel already open', () => {
    // Inline is what makes a booking observable at all.
    widgetReady();
    booking.open({});
    schedBtn()!.click();

    expect(initInline).toHaveBeenCalledTimes(1);
    const config = initInline.mock.calls[0][0] as InlineConfig;
    expect(config.url).toContain('calendly.com');
    expect(config.parentElement).toBe(frame());
    expect(overlay()).not.toBeNull(); // still in our panel, not a new tab
  });

  it('carries the ad attribution into Calendly its own record', () => {
    widgetReady();
    (window as unknown as { DT: unknown }).DT = {
      track,
      attr: () => ({ utm_source: 'google', utm_campaign: 'yt-dscr', utm_medium: '' }),
    };
    booking.open({});
    schedBtn()!.click();
    const config = initInline.mock.calls[0][0] as InlineConfig;
    expect(config.utm).toMatchObject({ utmSource: 'google', utmCampaign: 'yt-dscr' });
    expect(config.utm).not.toHaveProperty('utmMedium'); // empty values are dropped
  });

  it('fires calendly_open exactly once', () => {
    widgetReady();
    booking.open({});
    schedBtn()!.click();
    const opens = track.mock.calls.filter((c) => c[0] === 'calendly_open');
    expect(opens).toHaveLength(1);
  });

  it('falls back to the caller when the widget has not arrived', () => {
    // Untrackable, and the reason inline exists. Still better than a dead button.
    const onSchedule = vi.fn();
    booking.open({ onSchedule });
    schedBtn()!.click();
    expect(onSchedule).toHaveBeenCalledTimes(1);
    expect(initInline).not.toHaveBeenCalled();
  });

  it('fires calendly_open on the fallback too, and still only once', () => {
    const onSchedule = vi.fn();
    booking.open({ onSchedule });
    schedBtn()!.click();
    expect(track.mock.calls.filter((c) => c[0] === 'calendly_open')).toHaveLength(1);
  });

  it('can go back to the two options', () => {
    widgetReady();
    booking.open({});
    schedBtn()!.click();
    (document.querySelector('.dt-book-back') as HTMLButtonElement).click();
    expect(callLink()).not.toBeNull();
    expect(schedBtn()).not.toBeNull();
  });
});

describe('a completed booking', () => {
  it('is counted when Calendly says it happened', () => {
    postFromCalendly('calendly.event_scheduled');
    const booked = track.mock.calls.filter((c) => c[0] === 'calendly_booking');
    expect(booked).toHaveLength(1);
  });

  it.each([
    'https://evil.example.com',
    // The one that a substring check waved through. Anyone can register
    // calendly.com.attacker.example and post from it.
    'https://calendly.com.attacker.example',
    'https://notcalendly.com',
    'http://calendly.com',
  ])('ignores a forged message from %s', (origin) => {
    // The origin check is the security boundary: without it any page could
    // inflate the booking count.
    postFromCalendly('calendly.event_scheduled', origin);
    expect(track.mock.calls.filter((c) => c[0] === 'calendly_booking')).toHaveLength(0);
  });

  it('ignores Calendly its other lifecycle messages', () => {
    // Viewing the page or picking a date is not a booking.
    postFromCalendly('calendly.profile_page_viewed');
    postFromCalendly('calendly.date_and_time_selected');
    expect(track.mock.calls.filter((c) => c[0] === 'calendly_booking')).toHaveLength(0);
  });

  it('survives a message with no usable payload', () => {
    expect(() => {
      window.dispatchEvent(new MessageEvent('message', { data: null, origin: 'https://calendly.com' }));
      window.dispatchEvent(new MessageEvent('message', { data: 'hello', origin: 'https://calendly.com' }));
    }).not.toThrow();
  });
});

describe('dismissing', () => {
  it('closes on Escape', () => {
    booking.open({});
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(overlay()!.classList.contains('dt-open')).toBe(false);
  });

  it('closes when the backdrop itself is clicked, but not the card', () => {
    booking.open({});
    const card = document.querySelector('.dt-book-card')!;
    card.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(overlay()).not.toBeNull();

    overlay()!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(overlay()!.classList.contains('dt-open')).toBe(false);
  });

  it('does not stack a second copy if a CTA is clicked twice', () => {
    booking.open({});
    booking.open({});
    expect(document.querySelectorAll('.dt-book-overlay')).toHaveLength(1);
  });
});

describe('when the calendar stalls', () => {
  // Seen live: in one browser the embed sat on Calendly's own spinner for over
  // twenty seconds, twice, with no way out. Calendly has no failure state, and
  // by that point the Call option has been replaced by the calendar, so the
  // visitor is left with a spinner and nothing else.
  beforeEach(() => {
    vi.useFakeTimers();
  });

  function scheduleAndWait(ms: number) {
    widgetReady();
    booking.open({});
    schedBtn()!.click();
    vi.advanceTimersByTime(ms);
  }

  it('says nothing while the calendar is still plausibly coming', () => {
    scheduleAndWait(7000);
    expect(stall()).toBeNull();
  });

  it('offers the phone and a new tab once it has waited long enough', () => {
    scheduleAndWait(8500);
    const out = stall();
    expect(out).not.toBeNull();

    const call = out!.querySelector('a.dt-book-call') as HTMLAnchorElement;
    expect(call.getAttribute('href')).toMatch(/^tel:\+?\d+$/);

    const tab = out!.querySelector('a.dt-book-sched') as HTMLAnchorElement;
    expect(tab.getAttribute('href')).toContain('calendly.com');
    expect(tab.getAttribute('target')).toBe('_blank');
    expect(tab.getAttribute('rel')).toContain('noopener');
  });

  it('leaves the embed in place, in case it is one second away', () => {
    scheduleAndWait(8500);
    expect(frame()).not.toBeNull();
  });

  it('records the stall, so a run of them is visible rather than looking like nobody booked', () => {
    scheduleAndWait(8500);
    expect(track.mock.calls.filter((c) => c[0] === 'calendly_stalled')).toHaveLength(1);
  });

  it.each(['calendly.event_type_viewed', 'calendly.page_height'])(
    'says nothing once Calendly reports it has rendered (%s)',
    (event) => {
      widgetReady();
      booking.open({});
      schedBtn()!.click();
      postFromCalendly(event);
      vi.advanceTimersByTime(20000);
      expect(stall()).toBeNull();
    },
  );

  it('still fires when the iframe loads but nothing renders in it', () => {
    // The defect this replaced. The watcher settled on the iframe's `load`
    // event, which fired about two seconds in, while Calendly's content then
    // sat blank for fifteen to twenty seconds. `load` means the document
    // arrived, not that a calendar is on screen, so the fallback had already
    // been cancelled and never fired once in real use.
    widgetReady();
    booking.open({});
    schedBtn()!.click();
    const iframe = document.createElement('iframe');
    frame()!.appendChild(iframe);
    iframe.dispatchEvent(new Event('load'));
    vi.advanceTimersByTime(8500);
    expect(stall()).not.toBeNull();
  });

  it('ignores a forged "it rendered" from another origin', () => {
    // Suppressing the fallback is exactly what an attacker would want here:
    // it is the visitor's only way out of a blank panel.
    widgetReady();
    booking.open({});
    schedBtn()!.click();
    postFromCalendly('calendly.event_type_viewed', 'https://calendly.com.attacker.example');
    vi.advanceTimersByTime(8500);
    expect(stall()).not.toBeNull();
  });

  it('says nothing after the panel has been closed', () => {
    widgetReady();
    booking.open({});
    schedBtn()!.click();
    booking.close();
    vi.advanceTimersByTime(20000);
    expect(stall()).toBeNull();
  });
});

/** Pretend the window is this wide, for the duration of one test. */
function atWidth(px: number) {
  Object.defineProperty(window, 'innerWidth', { value: px, configurable: true, writable: true });
}

describe('the calendar gets a width Calendly can lay out in', () => {
  // R6-1. Calendly picks its layout from the width of the element it is given:
  // 1100px and up is side by side, 650 to 1099 is stacked behind an avatar and
  // description block, under 650 is the phone layout. The card was 720px on
  // every desktop, so every desktop got the stacked one with a blank band above
  // it and the first date below the fold.
  it('keeps the details block on a screen wide enough for two columns', () => {
    atWidth(1440);
    widgetReady();
    booking.open({});
    schedBtn()!.click();
    const config = initInline.mock.calls[0][0] as InlineConfig;
    expect(config.url).not.toContain('hide_event_type_details');
  });

  it('drops that block at the widths that only get the stacked layout', () => {
    atWidth(1000);
    widgetReady();
    booking.open({});
    schedBtn()!.click();
    const config = initInline.mock.calls[0][0] as InlineConfig;
    expect(config.url).toContain('hide_event_type_details=1');
  });

  it('drops it on a phone too, where there is least room for it', () => {
    // R8-6 reversed the original R6-1 rule here. Hiding the block from 780px up
    // left it in place on exactly the smallest screen: on a phone it takes
    // about 350px of a 585px panel, so the visitor scrolled inside the panel to
    // reach a day. It is now hidden at every width except the two-column one,
    // where it is the left column.
    atWidth(390);
    widgetReady();
    booking.open({});
    schedBtn()!.click();
    const config = initInline.mock.calls[0][0] as InlineConfig;
    expect(config.url).toContain('hide_event_type_details=1');
  });

  it('hides the GDPR banner at every width, since it covers the top of the frame', () => {
    for (const px of [390, 1000, 1440]) {
      atWidth(px);
      widgetReady();
      booking.open({});
      schedBtn()!.click();
      const config = initInline.mock.calls.pop()![0] as InlineConfig;
      expect(config.url).toContain('hide_gdpr_banner=1');
      booking.close();
      document.body.innerHTML = '';
    }
  });

  it('gives the wide card room for the frame Calendly needs', () => {
    // The 1100px threshold is the reason for the number, so it is worth pinning
    // rather than leaving as a magic max-width someone tidies downwards.
    expect(SOURCE).toContain('@media(min-width:1200px){.dt-book-card.dt-cal{max-width:1160px;}');
    expect(SOURCE).toContain('.dt-book-card.dt-cal .dt-book-frame{height:700px;max-height:85vh;}');
  });
});

describe('a visitor who has already given their details', () => {
  it('does not have to type them into Calendly again', () => {
    booking.identify({ name: 'Sam Homeowner', email: 'sam@example.com' });
    widgetReady();
    booking.open({});
    schedBtn()!.click();
    const config = initInline.mock.calls[0][0] as InlineConfig & { prefill?: Record<string, string> };
    expect(config.prefill).toEqual({ name: 'Sam Homeowner', email: 'sam@example.com' });
  });

  it('passes each value exactly once, and only through prefill', () => {
    // R6-2. R3-5 put the name and email on the embed URL as well, so that the
    // iframe src could be read in devtools. widget.js serialises config.prefill
    // into that same src, so the src then carried each field twice and nothing
    // says which copy Calendly reads. On 27 Sep it carried both and the details
    // step was still empty. Prefill is the documented route; it is now the only
    // one, and the point of this test is that it stays the only one.
    booking.identify({ name: 'Sam Homeowner', email: 'sam@example.com' });
    widgetReady();
    booking.open({});
    schedBtn()!.click();
    const config = initInline.mock.calls[0][0] as InlineConfig & { prefill?: Record<string, string> };
    expect(config.prefill).toEqual({ name: 'Sam Homeowner', email: 'sam@example.com' });
    // Counted across everything handed to Calendly, not just the URL: a second
    // route reappearing anywhere in the config is the failure being guarded.
    const passed = JSON.stringify({ url: config.url, utm: config.utm, prefill: config.prefill });
    expect(passed.split('Sam Homeowner')).toHaveLength(2);
    expect(passed.split('sam@example.com')).toHaveLength(2);
    expect(config.url).not.toContain('name=');
    expect(config.url).not.toContain('email=');
  });

  it('carries no visitor data on the embed URL when nobody has identified', () => {
    atWidth(1000);
    widgetReady();
    booking.open({});
    schedBtn()!.click();
    const config = initInline.mock.calls[0][0] as InlineConfig;
    expect(config.url).toBe(
      'https://calendly.com/realdarrentsai/15min?hide_gdpr_banner=1&hide_event_type_details=1',
    );
  });

  it('asks as it always did when no form has run', () => {
    widgetReady();
    booking.open({});
    schedBtn()!.click();
    const config = initInline.mock.calls[0][0] as InlineConfig & { prefill?: unknown };
    expect(config.prefill).toBeUndefined();
  });

  it('ignores an empty identify rather than sending blank fields', () => {
    booking.identify({ name: '', email: '' });
    widgetReady();
    booking.open({});
    schedBtn()!.click();
    const config = initInline.mock.calls[0][0] as InlineConfig & { prefill?: unknown };
    expect(config.prefill).toBeUndefined();
  });
});

describe('Calendly is handed the prefill at a moment it can take it', () => {
  /**
   * R7-1. config.prefill is the documented route, is passed, and does not
   * arrive: widget.js posts a calendly.prefill message into the frame as the
   * frame loads, before the booking page has a listener, so it is dropped and
   * the details step opens empty. Proven by hand on 28 Sep, and the reason three
   * rounds of checking found nothing wrong with the call itself.
   *
   * These tests pin the re-send: right message, right frame, right origin, only
   * for a lead we actually have, and nothing left running after a close.
   */
  const SAM = { name: 'Sam Homeowner', email: 'sam@example.com' };
  const PREFILL = { event: 'calendly.prefill', payload: SAM };

  /** Open the panel with a calendar in it, as a real page would have. */
  function openCalendar() {
    widgetReady();
    booking.open({});
    schedBtn()!.click();
    return mountCalendarIframe();
  }

  it('re-sends the name and email when the booking page comes up', () => {
    booking.identify(SAM);
    const { win, post } = openCalendar();
    postFromCalendly('calendly.event_type_viewed', 'https://calendly.com', win);
    expect(post).toHaveBeenCalledWith(PREFILL, 'https://calendly.com');
  });

  it('sends nothing when no form has run', () => {
    const { win, post } = openCalendar();
    postFromCalendly('calendly.event_type_viewed', 'https://calendly.com', win);
    postFromCalendly('calendly.date_and_time_selected', 'https://calendly.com', win);
    expect(post).not.toHaveBeenCalled();
  });

  it('sends only the name and email, never anything else we hold', () => {
    booking.identify(SAM);
    const { win, post } = openCalendar();
    postFromCalendly('calendly.event_type_viewed', 'https://calendly.com', win);
    const [message] = post.mock.calls[0] as [{ payload: Record<string, unknown> }];
    expect(Object.keys(message.payload).sort()).toEqual(['email', 'name']);
  });

  it('sends again when a time is picked, because the details form draws after it', () => {
    vi.useFakeTimers();
    booking.identify(SAM);
    const { win, post } = openCalendar();
    postFromCalendly('calendly.date_and_time_selected', 'https://calendly.com', win);
    expect(post).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(600);
    expect(post).toHaveBeenCalledTimes(2);
    expect(post).toHaveBeenLastCalledWith(PREFILL, 'https://calendly.com');
  });

  it('never posts to a frame it did not open', () => {
    // The origin check says a message came from Calendly. It does not say which
    // frame, and a page can hold more than one: replying to the wrong one would
    // hand a visitor's name to a frame we never chose.
    booking.identify(SAM);
    const { post } = openCalendar();
    const stranger = document.createElement('iframe');
    document.body.appendChild(stranger);
    const strangerPost = vi.spyOn(stranger.contentWindow as Window, 'postMessage');
    postFromCalendly('calendly.event_type_viewed', 'https://calendly.com', stranger.contentWindow as Window);
    expect(strangerPost).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
  });

  it('ignores a forged prefill trigger from another origin', () => {
    booking.identify(SAM);
    const { win, post } = openCalendar();
    postFromCalendly('calendly.event_type_viewed', 'https://calendly.com.attacker.example', win);
    expect(post).not.toHaveBeenCalled();
  });

  it('leaves no timer running after the panel closes', () => {
    vi.useFakeTimers();
    booking.identify(SAM);
    const { win, post } = openCalendar();
    postFromCalendly('calendly.date_and_time_selected', 'https://calendly.com', win);
    expect(post).toHaveBeenCalledTimes(1);
    booking.close();
    vi.advanceTimersByTime(5000);
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('still passes config.prefill, which is the documented route', () => {
    booking.identify(SAM);
    widgetReady();
    booking.open({});
    schedBtn()!.click();
    const config = initInline.mock.calls[0][0] as InlineConfig & { prefill?: Record<string, string> };
    expect(config.prefill).toEqual(SAM);
  });
});

describe('the known lead survives leaving the page', () => {
  // R6-2. It used to live in memory alone, so a reload, or a move from a guide
  // page to the homepage, threw it away and the calendar asked again.
  it('is written to sessionStorage, name and email only', () => {
    booking.identify({ name: 'Sam Homeowner', email: 'sam@example.com' });
    expect(JSON.parse(window.sessionStorage.getItem('dt_known_lead')!)).toEqual({
      name: 'Sam Homeowner',
      email: 'sam@example.com',
    });
  });

  it('is cleared by an empty identify, storage included', () => {
    booking.identify({ name: 'Sam Homeowner', email: 'sam@example.com' });
    booking.identify({ name: '', email: '' });
    expect(window.sessionStorage.getItem('dt_known_lead')).toBeNull();
  });

  it('is read back by a fresh page view in the same tab', () => {
    window.sessionStorage.setItem(
      'dt_known_lead',
      JSON.stringify({ name: 'Sam Homeowner', email: 'sam@example.com' }),
    );
    // Deliberately last in the file: evaluating the source again registers a
    // second message listener, which would make one posted booking look like
    // two for every test after this point.
    new Function(SOURCE)();
    const fresh = (window as unknown as { DTBooking: Booking }).DTBooking;
    widgetReady();
    fresh.open({});
    schedBtn()!.click();
    const config = initInline.mock.calls[0][0] as InlineConfig & { prefill?: Record<string, string> };
    expect(config.prefill).toEqual({ name: 'Sam Homeowner', email: 'sam@example.com' });
    fresh.close();
  });

  it('survives storage being unavailable', () => {
    // Private mode and blocked site data both throw here, and a forgotten name
    // must never take the booking panel down with it.
    const real = window.sessionStorage.getItem;
    window.sessionStorage.getItem = () => { throw new Error('blocked'); };
    try {
      expect(() => new Function(SOURCE)()).not.toThrow();
    } finally {
      window.sessionStorage.getItem = real;
    }
  });
});

describe('every form that asks for a name and email hands them over', () => {
  // R6-2 found the gap: the three Contact modals called identify, the three
  // guide forms on the same three pages did not, so anyone who asked for a
  // guide and then booked met an empty calendar form.
  const PAGES = ['dscr', 'fha', 'realestateinvesting'];

  it.each(PAGES)('%s calls identify from both its forms', (slug) => {
    const html = readFileSync(resolve(__dirname, '../public/' + slug + '/index.html'), 'utf8');
    const calls = html.match(/DTBooking\.identify\(/g) || [];
    expect(calls).toHaveLength(2);
  });
});
