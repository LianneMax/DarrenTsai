// Booking, for the React side.
//
// The behaviour lives in public/booking-chooser.js, which owns the prequal, the
// HubSpot calendar and the booking events. It is a plain script on window so
// the three hand-written landing pages share the exact same implementation.
//
// What is left here is the fallback for when that script has not loaded, so a
// booking CTA is never a dead button: /book/ runs the same prequal as a page.
// There is deliberately no direct calendar link to fall back to (15 Oct 2026,
// with Darren): the calendar is only shown after the prequal passes.

type BookingWindow = Window & {
  DTBooking?: { open: () => void };
};

/** Every booking CTA on the site lands here. */
export function openBooking() {
  const booking = (window as BookingWindow).DTBooking;
  if (booking && typeof booking.open === 'function') {
    booking.open();
    return;
  }
  window.location.assign('/book/');
}

/**
 * Whether the calendar is live. While BOOKING_URL in public/booking-chooser.js
 * is the placeholder, a passing lead is called back instead, and the copy says
 * so (16 Oct 2026). Read from that one setting at build time.
 */
export const BOOKING_CALENDAR_READY: boolean = __BOOKING_CALENDAR_READY__;
