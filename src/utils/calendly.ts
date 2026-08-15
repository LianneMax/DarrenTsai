// Calendly popup helper — same URL and popup-with-new-tab-fallback behaviour
// used by Nav, the calculators, and the static landing pages.
export const CALENDLY_URL = 'https://calendly.com/realdarrentsai/15min';

export function openCalendly() {
  const cal = (window as Window & { Calendly?: { initPopupWidget: (o: { url: string }) => void } }).Calendly;
  if (cal && typeof cal.initPopupWidget === 'function') {
    cal.initPopupWidget({ url: CALENDLY_URL });
  } else {
    window.open(CALENDLY_URL, '_blank', 'noopener,noreferrer');
  }
}
