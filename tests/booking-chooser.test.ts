/**
 * The "Book a Call" chooser, run against the real public/booking-chooser.js.
 *
 * WHY THIS FILE EXISTS. Every booking CTA on the site now goes through this,
 * and two of its details are load-bearing in ways that are easy to undo by
 * accident:
 *
 *  - The call option must stay a real <a href="tel:">. That is the entire
 *    tracking story for calls: CallRail's swap.js rewrites the number and the
 *    href, and the existing listener in attribution.js fires phone_click off the
 *    anchor. Turn it into a <button> with a click handler, as the rest of the
 *    site's CTAs are, and calls silently stop being attributed.
 *  - The schedule option must reach Calendly. If the chooser swallowed the
 *    click, every booking CTA on the site would be dead, which is worse than
 *    the untracked state it replaced.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SOURCE = readFileSync(resolve(__dirname, '../public/booking-chooser.js'), 'utf8');

type Booking = {
  open: (o: { onSchedule?: () => void; onOpen?: () => void }) => void;
  close: () => void;
};

function load(): Booking {
  new Function(SOURCE)();
  return (window as unknown as { DTBooking: Booking }).DTBooking;
}

const overlay = () => document.querySelector('.dt-book-overlay');
const callLink = () => document.querySelector('.dt-book-call') as HTMLAnchorElement | null;
const schedBtn = () => document.querySelector('.dt-book-sched') as HTMLButtonElement | null;

let booking: Booking;

beforeEach(() => {
  document.body.innerHTML = '';
  document.head.innerHTML = '';
  delete (window as unknown as { DTBooking?: Booking }).DTBooking;
  booking = load();
});

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

  it('shows the number, so CallRail has something to swap and a visitor can read it', () => {
    booking.open({});
    expect(callLink()!.textContent).toContain('714');
  });

  it('leaves the call anchor free to navigate', () => {
    // No preventDefault: the tel: href must be allowed to fire, and the click
    // must reach document so attribution.js sees it.
    booking.open({});
    const ev = new MouseEvent('click', { bubbles: true, cancelable: true });
    callLink()!.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
  });
});

describe('choosing to schedule', () => {
  it('hands off to Calendly', () => {
    const onSchedule = vi.fn();
    booking.open({ onSchedule });
    schedBtn()!.click();
    expect(onSchedule).toHaveBeenCalledTimes(1);
  });

  it('warms the widget while the visitor is still reading the chooser', () => {
    // Without this the first schedule click falls back to a new tab, which is
    // both worse to use and invisible to us.
    const onOpen = vi.fn();
    booking.open({ onOpen });
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('still opens Calendly when no preload was supplied', () => {
    const onSchedule = vi.fn();
    expect(() => booking.open({ onSchedule })).not.toThrow();
    schedBtn()!.click();
    expect(onSchedule).toHaveBeenCalled();
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
