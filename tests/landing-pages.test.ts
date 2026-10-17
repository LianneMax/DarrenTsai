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

  it('shows an inline error on the remaining guide form', () => {
    expect(html.match(/className = 'submit-error'/g) ?? []).toHaveLength(1);
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

  it('reads the message off a 422 in the guide form handler', () => {
    expect(html.match(/if \(res\.status === 422 \|\| res\.status === 429\)/g) ?? []).toHaveLength(1);
    expect(html.match(/fix\.field === 'email'/g) ?? []).toHaveLength(1);
  });

  it('prefers that message over the do-not-resubmit copy', () => {
    expect(html.match(/errEl\.textContent = visitorMessage \? visitorMessage/g) ?? []).toHaveLength(1);
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

  it('routes reviews into the shared screened booking flow', () => {
    expect(FHA_PAGE).not.toContain('id="contactOverlay"');
    expect(FHA_PAGE).toContain('window.DTBooking.open()');
  });

  it('prefills the loan and rate only once the estimate shows a payment', () => {
    const hook = FHA_PAGE.slice(FHA_PAGE.indexOf('window.LF_CONTACT_PREFILL = function () {'));
    expect(hook.slice(0, 400)).toContain('if (!(price > 0 && rate > 0 && downPct >= MIN_DOWN_PCT)) return {};');
  });
});

/**
 * A rate-limited post (429) was refused before it was read: nothing reached
 * Darren and no rescue email went out. Every form on the static pages must show
 * the endpoint's message then, never its generic "your details were passed to
 * Darren" copy, which is only true because other failures are rescued.
 */
describe.each(['dscr', 'fha', 'realestateinvesting'])('/%s/ on a rate-limited post', (page) => {
  it('shows the endpoint\'s message on its guide form', () => {
    const html = readFileSync(resolve(__dirname, `../public/${page}/index.html`), 'utf8');
    expect(html.split('if (res.status === 422 || res.status === 429) {').length - 1).toBe(1);
    // phone since 16 Oct 2026: lead.mts refuses a non-US number with a message too.
    expect(html.split("(fix.field === 'email' || fix.field === 'phone' || fix.field === 'rate')").length - 1).toBe(1);
  });
});

/**
 * 16 Oct 2026: every static form formats its phone as a US number while it is
 * typed, and a leading 1 (the country code) is dropped the moment it is typed,
 * so "+1 714..." never shows as (171) 4... The page's own functions, run here.
 */
describe.each(['dscr', 'fha', 'realestateinvesting'])('/%s/ phone formatting', (page) => {
  const html = readFileSync(resolve(__dirname, `../public/${page}/index.html`), 'utf8');
  const fns = [...html.matchAll(/function (formatUSPhone|formatPhone)\(raw\) \{[\s\S]*?\n {2}\}/g)].map((m) => m[0]);

  it('has a formatter on its guide form', () => {
    expect(fns).toHaveLength(1);
  });

  it.each([
    ['714', '714'], ['7145', '(714) 5'], ['7145550123', '(714) 555-0123'],
    ['17145550123', '(714) 555-0123'], ['+1 7', '7'], ['+1 714', '714'], ['+1 (714) 555-0123', '(714) 555-0123'],
  ])('turns %s into %s', (typed, shown) => {
    for (const src of fns) {
      const name = /function (\w+)/.exec(src)![1];
      expect(new Function(`${src}; return ${name};`)()(typed), name).toBe(shown);
    }
  });
});
