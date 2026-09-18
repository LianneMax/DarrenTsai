/**
 * Opening the Saxton HELOC quote in a second tab.
 *
 * This lived inline in DebtSavingsCalculator and shipped a bug nobody caught:
 * window.open('', '_blank', 'noopener,noreferrer') returns null by spec even
 * when the tab opens, so the "popup blocked" fallback ran on every submit and
 * sent the visitor's own tab to Saxton. They never saw the confirmation, and
 * they never saw the "we couldn't save your details" message either.
 *
 * It is a module so it can be tested against a fake window. A grep over the
 * component source proved only that the characters were present, which is not
 * the same as proving the branch behaves.
 */

/** What happened to the quote: the second tab has it, or the visitor must click. */
export type QuoteDelivery = 'tab' | 'manual';

/**
 * Must be called synchronously inside the click handler, or the browser treats
 * the popup as unsolicited and blocks it.
 *
 * No 'noopener' in the features string (see above). The opener reference is cut
 * by hand instead, which is what noopener was there for.
 */
export function openQuoteTab(w: Window = window): Window | null {
  let tab: Window | null = null;
  try {
    tab = w.open('', '_blank');
  } catch {
    return null; // some embedded browsers throw rather than return null
  }
  if (tab) {
    try {
      tab.opener = null;
    } catch {
      /* cross-origin or locked down; the tab is still usable */
    }
  }
  return tab;
}

/**
 * Point the opened tab at the quote. Returns 'manual' when there is no tab to
 * point (a popup blocker, or an embedded browser), in which case the caller
 * must offer a link the visitor can click.
 *
 * It deliberately does NOT navigate the current tab. Doing that is the original
 * bug: the visitor loses the page, the confirmation, and any error message.
 */
export function deliverQuote(tab: Window | null, url: string): QuoteDelivery {
  if (!tab) return 'manual';
  try {
    tab.location.href = url;
    return 'tab';
  } catch {
    return 'manual'; // tab was closed between opening and now
  }
}
