/**
 * Two things the pages and emails must not say (decided by Max, 8 Oct 2026,
 * ahead of the Google Ads launch).
 *
 * 1. NO APR FIGURE. The debt calculator and the mortgage calculator both
 *    printed "Est. APR" as the rate plus a flat 0.20: an assumed fee spread no
 *    lender had quoted, to two decimals, beside a real benchmark rate. An APR
 *    is a disclosure with a legal meaning, and one made from a constant is
 *    worse than none. Each place now says "See cost assumptions" and a note
 *    explains that APR depends on fees and lender terms and needs a personal
 *    quote.
 *
 * 2. NO RESPONSE TIME. Success cards promised "within 1 business day" and
 *    "shortly". Nobody had agreed to a deadline and nothing measures one, and a
 *    promise on an ad landing page is the kind a visitor remembers. They say
 *    "Darren will be in touch." and stop.
 *
 * Scanned across every page a visitor can reach and every email they can be
 * sent, because both are the kind of line that comes back with a copied
 * template.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '..');
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8');

/** Everything that puts words in front of a visitor. */
function visitorFacing(): string[] {
  const out = ['index.html', 'mortgage-calculator/index.html', 'debt-consolidation/index.html'];
  const walk = (dir: string, match: RegExp) => {
    for (const entry of readdirSync(resolve(ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(rel, match);
      else if (match.test(entry.name)) out.push(rel);
    }
  };
  walk('src', /\.tsx?$/);
  walk('public', /\.(html|js)$/);
  walk('netlify/functions', /^send-.*\.mts$/);
  return out;
}

const FILES = visitorFacing();

/** Source with comments removed: the reasons are written down beside the code. */
function code(src: string): string {
  return src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

describe('no APR is quoted that nobody calculated', () => {
  it('finds the files at all', () => {
    expect(FILES.length).toBeGreaterThan(20);
    expect(FILES).toContain('src/components/DebtSavingsCalculator.tsx');
    expect(FILES).toContain('public/dscr/index.html');
  });

  it.each(FILES)('%s prints no APR figure', (file) => {
    const src = code(read(file));
    // The old pattern in each of its three shapes: a rate plus 0.20, an
    // "Est. APR:" label followed by a value, and a labelled percentage.
    expect(src).not.toMatch(/\+\s*0\.20?\)/);
    expect(src).not.toMatch(/Est\.?\s*APR:\s*[{\d]/);
    expect(src).not.toMatch(/APR[^<\n]{0,20}\d+(\.\d+)?%/);
    expect(src).not.toContain('Estimated APR');
  });

  it('the debt comparison points at its cost assumptions instead', () => {
    const calc = read('src/components/DebtSavingsCalculator.tsx');
    expect(calc.match(/<BreakdownRow label="APR"\s+value="See cost assumptions" \/>/g)).toHaveLength(2);
    expect(calc).toContain('id="dsc-cost-assumptions"');
    expect(calc).toMatch(/APR is\s+not shown: it depends on fees and lender terms, and needs a personal quote\./);
  });

  it('the mortgage calculator keeps the card, without a number in it', () => {
    const calc = read('src/components/Calculator.tsx');
    expect(calc).toMatch(/label="Est\. APR"\s+value="See cost assumptions"/);
    expect(calc).toContain('id="cost-assumptions"');
    expect(calc).toMatch(/APR is not shown: it depends on fees and lender terms, and needs a personal quote\./);
    // And its page description no longer advertises one.
    expect(read('mortgage-calculator/index.html')).not.toMatch(/\bAPR\b/);
  });
});

describe('no response time is promised', () => {
  const PROMISES = [
    /within \d+ (business )?(day|hour|minute)s?/i,
    /\bbusiness day/i,
    /\bshortly\b/i,
    /\bsame[- ]day\b/i,
    /\bwithin 24\b/i,
    /\bright away\b/i,
    // Not "as soon as possible": that is an option in the visitor's own timeline
    // dropdown, their answer rather than our promise.
  ];

  it.each(FILES)('%s sets no deadline for Darren', (file) => {
    const src = code(read(file));
    for (const promise of PROMISES) expect(src, String(promise)).not.toMatch(promise);
  });

  it('every success state that speaks for Darren uses the one sentence', () => {
    const calc = read('src/components/DebtSavingsCalculator.tsx');
    const form = read('src/components/LeadForm.tsx');
    expect(calc).toContain('Darren will be in touch.');
    expect(form).toContain('Darren will be in touch.');
    for (const page of ['dscr', 'fha', 'realestateinvesting']) {
      const html = read(`public/${page}/index.html`);
      expect(html, page).toContain('Darren will be in touch.');
      expect(html, page).not.toContain('reach out');
    }
  });
});
