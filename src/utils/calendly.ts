// Booking, for the React side.
//
// The behaviour lives in public/booking-chooser.js, which owns the chooser, the
// inline calendar, the widget loading and the two tracking events. It is a
// plain script on window so the three hand-written landing pages share the
// exact same implementation; each runtime used to carry its own copy of the
// loader, and the copies had already started to disagree.
//
// What is left here is the fallback for when that script has not loaded, so a
// booking CTA is never a dead button.

export const CALENDLY_URL = 'https://calendly.com/realdarrentsai/15min';

const WIDGET_CSS = 'https://assets.calendly.com/assets/external/widget.css';
const WIDGET_JS = 'https://assets.calendly.com/assets/external/widget.js';

type CalendlyWindow = Window & {
  Calendly?: { initPopupWidget: (o: { url: string }) => void };
};

type BookingWindow = Window & {
  DTBooking?: {
    open: (o: { onSchedule?: () => void; onOpen?: () => void }) => void;
    preload: () => void;
  };
};

let loading: Promise<void> | null = null;

function loadWidget(): Promise<void> {
  if (loading) return loading;

  loading = new Promise<void>((resolve, reject) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = WIDGET_CSS;
    document.head.appendChild(css);

    const script = document.createElement('script');
    script.src = WIDGET_JS;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('calendly-widget-failed'));
    document.head.appendChild(script);
  });

  return loading;
}

/**
 * Last resort: Calendly in its own popup, or a new tab while the widget is
 * still downloading. Neither is observable, which is why the inline calendar
 * exists, but a booking we cannot count still beats a button that does nothing.
 *
 * Does not fire calendly_open. booking-chooser.js owns that event so it fires
 * exactly once whichever path is taken.
 */
function openCalendlyDirect() {
  const cal = (window as CalendlyWindow).Calendly;
  if (cal && typeof cal.initPopupWidget === 'function') {
    cal.initPopupWidget({ url: CALENDLY_URL });
    return;
  }
  loadWidget().catch(() => { /* the new tab already handled this click */ });
  window.open(CALENDLY_URL, '_blank', 'noopener,noreferrer');
}

/** Every booking CTA on the site lands here. */
export function openCalendly() {
  const booking = (window as BookingWindow).DTBooking;
  if (booking && typeof booking.open === 'function') {
    booking.open({ onSchedule: openCalendlyDirect });
    return;
  }
  openCalendlyDirect();
}

/** Warm the widget when a booking CTA scrolls into view or is hovered. */
export function preloadCalendly() {
  const booking = (window as BookingWindow).DTBooking;
  if (booking && typeof booking.preload === 'function') {
    booking.preload();
    return;
  }
  loadWidget().catch(() => { /* best effort */ });
}
