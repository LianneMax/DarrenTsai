/**
 * The static landing pages are plain HTML with inline scripts, so these checks
 * read the source. A native alert() on a failed submit froze the page during the
 * 16 Sep smoke test and told a visitor whose lead HAD saved to "try again".
 */
import { afterEach, describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const PAGES = ['dscr', 'fha', 'realestateinvesting'];
const REQUEST_SOURCE = readFileSync(resolve(__dirname, '../public/lead-request.js'), 'utf8');
afterEach(() => { document.body.innerHTML = ''; delete window.DTLead; sessionStorage.clear(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

/** Execute the real inline callback and shared request runtime. Only surrounding
 * calculator dependencies are stubbed; payload, receipt and error UI stay real. */
function guideHandler(page: string) {
  const html = readFileSync(resolve(__dirname, `../public/${page}/index.html`), 'utf8');
  document.documentElement.innerHTML = html;
  vi.stubGlobal('DT', undefined);
  vi.stubGlobal('DTConsent', {isAllowed: () => false});
  vi.stubGlobal('DTCompliance', {ack: () => true, sms: () => ({privacyAcknowledged:true,smsConsent:false})});
  delete window.DTLead;
  new Function(REQUEST_SOURCE)();
  const $ = (id: string) => document.getElementById(id)!;
  const prefix = page === 'realestateinvesting' ? 'l' : 'm';
  for (const [field, value] of Object.entries({Name:'TEST Guide',Email:'qa@example.com',Phone:'(714) 555-0123',State:'CA',Credit:'700'})) {
    const el = document.getElementById(prefix + field) as HTMLInputElement | null;
    if (el) el.value = value;
  }
  const marker = "$('submitLead').addEventListener('click', async () => {";
  const start = html.indexOf(marker);
  const end = html.indexOf('\n  });', start);
  expect(start).toBeGreaterThan(0); expect(end).toBeGreaterThan(start);
  const body = html.slice(start + marker.length, end);
  const run = new Function('window','document','$','stateSelect','lStateSelect','clearErrors','validateLeadDetails','validateFhaLeadDetails','validateReiLeadDetails','showGuideStep','dscrReady','LEAD_ENDPOINT','modalForm','modalSuccess', `return async () => {${body}\n};`)(
    window, document, $, $(prefix+'State'), $(prefix+'State'), () => {}, () => true, () => true, () => true, () => {}, false, '/api/lead',
    document.getElementById('modalForm'), document.getElementById('modalSuccess'),
  ) as () => Promise<void>;
  return {run, button:$('submitLead') as HTMLButtonElement, error:() => document.querySelector('.submit-error')?.textContent || ''};
}

describe.each(PAGES)('/%s submit errors', (page) => {
  const html = readFileSync(resolve(__dirname, `../public/${page}/index.html`), 'utf8');

  it('never uses a native alert()', () => {
    expect(html).not.toMatch(/\balert\(/);
  });

  it('shows an inline error on the remaining guide form', () => {
    expect(html.match(/className = 'submit-error'/g) ?? []).toHaveLength(1);
  });

  it('offers a same-inquiry retry without claiming an uncertain lead was delivered', async () => {
    const form = guideHandler(page);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', {status:502})));
    await form.run();
    expect(form.error()).toMatch(/couldn't confirm whether your request was saved/i);
    expect(form.error()).toMatch(/retry here with the same details/i);
    expect(form.error()).not.toMatch(/No need to submit again|passed to Darren|delivered/i);
    expect(form.button.disabled).toBe(false);
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
 * Definitive rejections show the actionable endpoint message. Unknown outcomes
 * retain the recovery identity and never show success or a delivery promise.
 */
describe.each(PAGES)('/%s actionable rejection and safe retry', (page) => {
  it.each([[422,'email'],[422,'phone'],[429,'rate'],[409,'submissionId']])('shows the %s/%s message and re-enables the button', async (status, field) => {
    const form = guideHandler(page);
    const message = `Please review ${field}.`;
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({field,message}), {status:Number(status)})));
    await form.run();
    expect(form.error()).toBe(message);
    expect(form.button.disabled).toBe(false);
    expect(document.querySelector('.modal-success.show')).toBeNull();
  });
  it('retries an unknown result with the exact same ID/body', async () => {
    const form = guideHandler(page);
    const sent: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {sent.push(String(init.body)); return new Response('{}',{status:503});}));
    await form.run(); await form.run();
    expect(sent).toHaveLength(2);
    expect(JSON.parse(sent[0]).submissionId).toMatch(/^inbox1-[0-9a-f-]{36}$/);
    expect(sent[1]).toBe(sent[0]);
    expect(form.error()).toMatch(/same details/i);
  });
  it('never shows success for a malformed 2xx receipt', async () => {
    const form = guideHandler(page);
    vi.stubGlobal('fetch',vi.fn(async () => new Response('{"ok":true}')));
    await form.run();
    expect(form.error()).toMatch(/couldn't confirm/i);
    expect(form.button.disabled).toBe(false);
    expect(document.querySelector('.modal-success.show')).toBeNull();
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
