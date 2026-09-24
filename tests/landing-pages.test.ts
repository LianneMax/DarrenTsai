/**
 * The static landing pages are plain HTML with inline scripts, so these checks
 * read the source. A native alert() on a failed submit froze the page during the
 * 16 Sep smoke test and told a visitor whose lead HAD saved to "try again".
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const PAGES = ['dscr', 'fha', 'realestateinvesting'];

describe.each(PAGES)('/%s submit errors', (page) => {
  const html = readFileSync(resolve(__dirname, `../public/${page}/index.html`), 'utf8');

  it('never uses a native alert()', () => {
    expect(html).not.toMatch(/\balert\(/);
  });

  it('shows an inline error on both the main form and the contact modal', () => {
    expect(html.match(/className = 'submit-error'/g) ?? []).toHaveLength(2);
  });

  it('tells a visitor not to resubmit when the server responded (lead was rescued)', () => {
    expect(html).toContain('No need to submit again');
  });
});

/*
 * The 502-vs-503/422 checks that used to live here were regexes over source
 * files. They are now real tests that invoke the handlers:
 * tests/guide-endpoints.test.ts.
 *
 * The window.open checks are gone rather than moved. They covered the
 * third-party HELOC hand-off (a second tab to the Figure white-label soft-pull,
 * with the visitor's name and email in the query string) and the popup-blocker
 * fallback around it. That journey was retired in fcb514b along with quoteTab.ts
 * and the generic outbound_click event, so there is nothing left to test.
 */

/**
 * Patch 0006 makes /api/lead able to refuse a lead outright (422, dead email
 * domain). That is the ONLY failure where the lead was not saved, so the
 * existing "no need to submit again" copy would be a lie there. These check the
 * handlers separate the two cases.
 */
describe.each(PAGES)('/%s email rejection', (page) => {
  const html = readFileSync(resolve(__dirname, `../public/${page}/index.html`), 'utf8');

  it('reads the message off a 422 in both form handlers', () => {
    expect(html.match(/if \(res\.status === 422\)/g) ?? []).toHaveLength(2);
    expect(html.match(/fix\.field === 'email'/g) ?? []).toHaveLength(2);
  });

  it('prefers that message over the do-not-resubmit copy', () => {
    expect(html.match(/errEl\.textContent = visitorMessage \? visitorMessage/g) ?? []).toHaveLength(2);
  });

  it('re-enables the button so the corrected address can be sent', () => {
    // The catch block already does this for every failure; the 422 path throws
    // into the same place rather than returning early.
    expect(html).toContain('btn.disabled = false');
  });
});
