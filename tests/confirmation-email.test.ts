/**
 * The confirmation email's contexts (netlify/functions/send-contact-confirmation.mts).
 *
 * WHY THIS FILE EXISTS. The contact confirmation is LIVE: it has gone to every
 * contact modal lead since 29 Sep. On 8 Oct the template gained four more sets
 * of words (debt, home equity, ADU, mortgage calculator review) so they could
 * be rendered and signed off, and that was done inside the live file, because
 * the brief asks for one email system and a preview drawn from a copy of the
 * template is a picture of the copy.
 *
 * That is only safe if two things hold, and both are easy to break by accident:
 *
 *  1. The email that is being sent today has not changed by a single byte.
 *  2. Nothing sends a context yet, so the four drafts cannot reach anybody.
 *
 * The rest pins what each draft may and may not say, which is the part a
 * borrower reads: the request was received, not reviewed; no deadline; no
 * figure from a calculator; nothing posted echoed back as HTML.
 */
import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildEmailHtml, copyFor, CONTEXT_NAMES } from '../netlify/functions/send-contact-confirmation.mts';

const read = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8');
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

const DRAFTS = ['debt', 'home-equity', 'adu', 'mortgage-review'];

describe('the email being sent today is untouched', () => {
  it('renders byte for byte what it did before the contexts existed', () => {
    // Hashes of the handler's output captured from the commit before this
    // change, for a lead with a message that needs escaping and one without.
    expect(sha(buildEmailHtml({ firstName: 'Sam', email: 's@example.com', message: 'Want to clear two <cards> & a loan' })))
      .toBe('be7400d3e79723de2910803e20cb7b88380289f63f3cbfa4e5094f984b53958e');
    expect(sha(buildEmailHtml({ email: 's@example.com' })))
      .toBe('c1a571b115bd3ed0d3e0fc0f8663fe1197eb68c31d1e9dee7cb5329f08a6bef8');
  });

  it('is what a lead with no context, or one it has never heard of, gets', () => {
    const live = buildEmailHtml({ firstName: 'Sam', message: 'hello' });
    for (const context of ['', 'contact', 'nonsense', '__proto__', 'constructor']) {
      expect(buildEmailHtml({ firstName: 'Sam', message: 'hello', context }), context).toBe(live);
    }
    expect(copyFor({}).subject).toBe('Got your details, here is my calendar');
  });

  it('is still what every contact lead is sent: the Apps Script names no context for them', () => {
    // Wired up on 10 Oct (copy approved by Max). A contact lead's body is the
    // four fields it always was; only the calculator funnels add a context.
    const gas = read('google-apps-script.js');
    const sender = gas.slice(gas.indexOf('function sendContactConfirmation'), gas.indexOf('/** Run whichever guide applies'));
    expect(sender).toContain("message: data.message || ''");
    expect(sender).toContain("if (context !== 'contact') {");
  });

  it('lists the five contexts and no more', () => {
    expect(CONTEXT_NAMES).toEqual(['contact', ...DRAFTS]);
  });
});

describe.each(DRAFTS)('the %s draft', (context) => {
  const lead = {
    context, firstName: 'Alex', goal: 'Renovation / ADU', projectPurpose: 'Rental ADU',
    message: context === 'mortgage-review' ? 'Keep the payment under 2,800.' : '',
  };
  const html = buildEmailHtml(lead);
  const live = buildEmailHtml({ firstName: 'Alex' });
  /** Everything from the divider above the footer to the end. */
  const footer = (s: string) => s.slice(s.indexOf('<tr><td style="border-top:1px solid #e6ebf0;'));
  /** Everything before the headline: the head, the styles and the teal header. */
  const top = (s: string) => s.slice(s.indexOf('<body'), s.indexOf('<div class="h1"'));

  it('keeps the live design: same header, signature, licence footer and unsubscribe', () => {
    expect(footer(html)).toBe(footer(live));
    expect(footer(html)).toContain('Saxton Mortgage, LLC | NMLS #1717191');
    expect(footer(html)).toContain('Unsubscribe');
    // The header block differs only by the hidden inbox preview line.
    const strip = (s: string) => s.replace(/<span style="display:none[^>]*>[^<]*<\/span>/, '');
    expect(strip(top(html))).toBe(strip(top(live)));
    expect(html).toContain('<span style="font-weight:600;color:#223d55;">Darren</span>');
    expect(html).toContain('Hi Alex,');
  });

  it('says the request was received, and that Darren will be in touch, with no deadline', () => {
    expect(html).toContain('>Your request has been received</div>');
    expect(html).toContain('I will be in touch.');
    for (const promise of [/within \d/i, /business day/i, /\bshortly\b/i, /\btoday\b/i, /\bsoon as\b/i]) {
      expect(html, String(promise)).not.toMatch(promise);
    }
  });

  it('does not claim a review, an approval or a quote', () => {
    for (const claim of [/has reviewed/i, /have reviewed/i, /I reviewed/i, /you qualify/i, /pre-?approved/i, /guarantee/i, /best (loan|option)/i]) {
      expect(html, String(claim)).not.toMatch(claim);
    }
  });

  it('repeats no figure from a calculator and promises no attachment', () => {
    const body = html.slice(html.indexOf('<div class="h1"'), html.indexOf('<tr><td style="border-top:1px solid #e6ebf0;'));
    const said = body.replace(/<[^>]+>/g, ' ').replace(/Keep the payment under 2,800\./, '').replace(/\(714\) 887-5432/, '');
    expect(said).not.toMatch(/\$\s?\d/);
    expect(said).not.toMatch(/\d+(\.\d+)?\s?%/);
    expect(html).not.toMatch(/attach/i);
    expect(html).not.toMatch(/\bPDF\b/);
  });

  it('tags its calendar link with its own campaign', () => {
    const link = /href="(https:\/\/calendly\.com[^"]+)"/.exec(html)![1];
    expect(link).toContain('utm_source=email&utm_medium=confirmation');
    expect(link).toContain('utm_campaign=' + copyFor(lead).campaign);
    expect(link).not.toContain('contact-modal');
  });

  it('carries no em-dash and has a subject of its own', () => {
    expect(html).not.toContain('—');
    expect(copyFor(lead).subject).not.toBe('Got your details, here is my calendar');
    expect(html).toContain(`<title>${copyFor(lead).subject}</title>`);
  });
});

describe('what a visitor chose is named from a fixed list, never echoed', () => {
  it('names a home equity goal the form offers', () => {
    expect(buildEmailHtml({ context: 'home-equity', goal: 'Pay Off Debt' })).toContain('You told me this is for paying off debt.');
    expect(buildEmailHtml({ context: 'home-equity', goal: 'Major Expense' })).toContain('for a major expense.');
  });

  it('names an ADU purpose the form offers', () => {
    expect(buildEmailHtml({ context: 'adu', projectPurpose: 'ADU for family' })).toContain('You told me it is an ADU for family.');
  });

  it('says nothing for "Something Else", "Other", or no answer', () => {
    for (const goal of ['Something Else', '', undefined]) {
      expect(buildEmailHtml({ context: 'home-equity', goal })).not.toContain('You told me');
    }
    expect(buildEmailHtml({ context: 'adu', projectPurpose: 'Other' })).not.toContain('You told me');
  });

  it('drops a posted value it does not recognise instead of printing it', () => {
    const html = buildEmailHtml({ context: 'home-equity', goal: '<script>alert(1)</script>', projectPurpose: '<img src=x>' });
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('alert(1)');
    expect(buildEmailHtml({ context: 'adu', projectPurpose: 'constructor' })).not.toContain('You told me');
  });

  it('still escapes the free text in the "What you told me" box', () => {
    const html = buildEmailHtml({ context: 'mortgage-review', message: '<b>hi</b> & bye' });
    expect(html).toContain('&lt;b&gt;hi&lt;/b&gt; &amp; bye');
    expect(html).not.toContain('<b>hi</b>');
  });
});

describe('the previews', () => {
  it('are rendered from the real template, by a script that sends nothing', () => {
    const script = read('scripts/build-email-previews.mjs');
    expect(script).toContain("netlify/functions/send-contact-confirmation.mts");
    expect(script).toContain('buildEmailHtml(p.lead)');
    expect(script).not.toContain('api.resend.com');
    expect(script).not.toMatch(/\bfetch\(/);
    expect(read('package.json')).toContain('"emails": "node scripts/build-email-previews.mjs"');
  });
});
