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

/**
 * /fha/ "Have Darren Review My Payment" (revamp brief section 9, preview v4).
 * The estimate's button opens the contact modal under its own form id, with the
 * estimate's loan and rate prefilled once a payment is showing. Checked in
 * Chromium on 10 Oct: a review posts formId fha-payment-review, and the nav's
 * Contact still posts fha-contact-modal.
 */
describe('/fha/ review button', () => {
  const FHA_PAGE = readFileSync(resolve(__dirname, '../public/fha/index.html'), 'utf8');

  it('opens the contact modal as a payment review, not the guide form', () => {
    expect(FHA_PAGE).toContain('>Have Darren Review My Payment</button>');
    expect(FHA_PAGE).toContain("window.openContactModal({ formId: 'fha-payment-review', title: 'Have Darren Review My Payment' });");
  });

  it('posts whichever form id opened it, and the modal\'s own by default', () => {
    expect(FHA_PAGE).toContain("var DEFAULT_FORM_ID = 'fha-contact-modal';");
    expect(FHA_PAGE).toContain('formIdNow = (opts && opts.formId) || DEFAULT_FORM_ID;');
    expect(FHA_PAGE).toContain('{ formId: formIdNow })');
    expect(FHA_PAGE).toContain('form_id: formIdNow,');
  });

  it('prefills the loan and rate only once the estimate shows a payment', () => {
    const hook = FHA_PAGE.slice(FHA_PAGE.indexOf('window.LF_CONTACT_PREFILL = function () {'));
    expect(hook.slice(0, 400)).toContain('if (!(price > 0 && rate > 0 && downPct >= MIN_DOWN_PCT)) return {};');
  });
});
