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

/**
 * The guide functions used to return 502 for every Resend failure, so the queue
 * could not tell "Resend is busy, try again" from "this address will never work".
 */
describe.each(['send-dscr-guide', 'send-rei-guide', 'send-fha-guide'])('%s failure status', (fn) => {
  const src = readFileSync(resolve(__dirname, `../netlify/functions/${fn}.mts`), 'utf8');

  it('returns 503 for retryable Resend failures (429, 5xx) and 422 for the rest', () => {
    expect(src).toContain('emailRes.status === 429 || emailRes.status >= 500');
    expect(src).toContain('retryable ? 503 : 422');
    expect(src).not.toMatch(/jsonResponse\(502, \{ error: "email send failed" \}\)/);
  });
});

/**
 * window.open with 'noopener' returns null by spec, which made the debt
 * calculator send every visitor's own tab to Saxton (smoke test, 17 Sep).
 */
describe('debt calculator quote tab', () => {
  const src = readFileSync(resolve(__dirname, '../src/components/DebtSavingsCalculator.tsx'), 'utf8');

  it('does not pass noopener to window.open', () => {
    const calls = src.match(/window\.open\([^)]*\)/g) ?? [];
    expect(calls.length).toBeGreaterThan(0);
    for (const c of calls) expect(c).not.toMatch(/noopener/);
  });

  it('severs the opener by hand instead', () => {
    expect(src).toContain('quoteTab.opener = null');
  });
});
