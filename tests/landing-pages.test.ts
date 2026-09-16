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
