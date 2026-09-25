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

/** A message as Calendly's iframe posts it. */
function postFromCalendly(event: string, origin = 'https://calendly.com') {
  window.dispatchEvent(new MessageEvent('message', { data: { event }, origin }));
}

beforeAll(() => {
  new Function(SOURCE)();
  booking = (window as unknown as { DTBooking: Booking }).DTBooking;
});

beforeEach(() => {
  booking.close();
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

  it('ignores a forged message from another origin', () => {
    // The origin check is the security boundary: without it any page could
    // inflate the booking count.
    postFromCalendly('calendly.event_scheduled', 'https://evil.example.com');
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
