import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '..');
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8');

/** Everything that puts words in front of a visitor. */
function visitorFacing(): string[] {
  const out = ['index.html', 'mortgage-calculator/index.html', 'debt-consolidation/index.html', 'home-equity/index.html', 'adu/index.html'];
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

describe('APR estimates disclose their assumptions', () => {
  it.each(FILES)('%s never adds a fixed spread to the note rate', file => {
    expect(code(read(file))).not.toMatch(/\+\s*0\.20?\)/);
  });
  it('uses the shared calculator at every formerly hidden APR location', () => {
    expect(read('src/components/DebtPageViews.tsx').match(/<AprEstimate /g)).toHaveLength(2);
    expect(read('src/components/Calculator.tsx')).toContain('<AprEstimate ');
    for (const file of ['DebtPageViews', 'Calculator']) {
      expect(read(`src/components/${file}.tsx`)).not.toContain('See cost assumptions');
      expect(read(`src/components/${file}.tsx`)).toContain('principal and');
    }
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
    // Whitespace folded: a JSX paragraph can wrap the sentence across lines.
    for (const file of ['DebtPageViews', 'HomeEquityViews', 'AduViews', 'LeadForm']) {
      const src = read(`src/components/${file}.tsx`).replace(/\s+/g, ' ');
      expect(src, file).toContain('Darren will be in touch.');
    }
    for (const page of ['dscr', 'fha', 'realestateinvesting']) {
      const html = read(`public/${page}/index.html`);
      expect(html, page).toContain('Darren will be in touch.');
      expect(html, page).not.toContain('reach out');
    }
  });
});
