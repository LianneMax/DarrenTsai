// Calendly popup helper — same URL and popup-with-new-tab-fallback behaviour
// used by Nav, the calculators, and the static landing pages.
//
// The widget's script and stylesheet used to load eagerly in <head> on every
// page, putting a render-blocking third-party stylesheet in front of first
// paint for something nobody sees until they click "Book a call". They are now
// injected on first use, and the pre-existing window.open fallback covers the
// gap while the script downloads, so a fast clicker still gets a booking page.
import { track } from './attribution';

export const CALENDLY_URL = 'https://calendly.com/realdarrentsai/15min';

const WIDGET_CSS = 'https://assets.calendly.com/assets/external/widget.css';
const WIDGET_JS = 'https://assets.calendly.com/assets/external/widget.js';

type CalendlyWindow = Window & {
  Calendly?: { initPopupWidget: (o: { url: string }) => void };
};

type BookingWindow = Window & {
  DTBooking?: { open: (o: { onSchedule: () => void; onOpen?: () => void }) => void };
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

/** Straight to Calendly. Reached only once the visitor has chosen to schedule. */
function openCalendlyDirect() {
  track('calendly_open', { page_path: window.location.pathname });

  const cal = (window as CalendlyWindow).Calendly;
  if (cal && typeof cal.initPopupWidget === 'function') {
    cal.initPopupWidget({ url: CALENDLY_URL });
    return;
  }

  // Not loaded yet: start fetching for next time, and send this click straight
  // to Calendly in a new tab so it is never swallowed by the wait. Rarer now
  // that the chooser warms the widget while the visitor is reading it.
  loadWidget().catch(() => { /* the new tab already handled this click */ });
  window.open(CALENDLY_URL, '_blank', 'noopener,noreferrer');
}

/**
 * Every booking CTA on the site lands here. It offers the call and the schedule
 * in one place rather than assuming everybody wants to schedule: see
 * public/booking-chooser.js for why that matters to attribution.
 *
 * The chooser is a plain script on window so the three hand-written landing
 * pages can share this exact implementation. If it has not loaded for any
 * reason, fall through to Calendly rather than leaving the button dead.
 */
export function openCalendly() {
  const booking = (window as BookingWindow).DTBooking;
  if (booking && typeof booking.open === 'function') {
    booking.open({ onSchedule: openCalendlyDirect, onOpen: preloadCalendly });
    return;
  }
  openCalendlyDirect();
}

/** Warm the widget when a booking CTA scrolls into view or is hovered. */
export function preloadCalendly() {
  loadWidget().catch(() => { /* best effort */ });
}
