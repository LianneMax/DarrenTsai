// Calendly popup helper — same URL and popup-with-new-tab-fallback behaviour
// used by Nav, the calculators, and the static landing pages.
//
// The widget's script and stylesheet used to load eagerly in <head> on every
// page, putting a render-blocking third-party stylesheet in front of first
// paint for something nobody sees until they click "Book a call". They are now
// injected on first use, and the pre-existing window.open fallback covers the
// gap while the script downloads, so a fast clicker still gets a booking page.
export const CALENDLY_URL = 'https://calendly.com/realdarrentsai/15min';

const WIDGET_CSS = 'https://assets.calendly.com/assets/external/widget.css';
const WIDGET_JS = 'https://assets.calendly.com/assets/external/widget.js';

type CalendlyWindow = Window & {
  Calendly?: { initPopupWidget: (o: { url: string }) => void };
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

export function openCalendly() {
  const cal = (window as CalendlyWindow).Calendly;
  if (cal && typeof cal.initPopupWidget === 'function') {
    cal.initPopupWidget({ url: CALENDLY_URL });
    return;
  }

  // Not loaded yet: start fetching for next time, and send this click straight
  // to Calendly in a new tab so it is never swallowed by the wait.
  loadWidget().catch(() => { /* the new tab already handled this click */ });
  window.open(CALENDLY_URL, '_blank', 'noopener,noreferrer');
}

/** Warm the widget when a booking CTA scrolls into view or is hovered. */
export function preloadCalendly() {
  loadWidget().catch(() => { /* best effort */ });
}
