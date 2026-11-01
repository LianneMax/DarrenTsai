import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '..');
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8');

/** Everything that puts words in front of a visitor. */
function visitorFacing(): string[] {
  const out = ['index.html', 'mortgage-calculator/index.html', 'home-equity/index.html', 'adu/index.html'];
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

describe('no credit-pull claim is made', () => {
  // Saxton has not approved a credit-pull claim (held since 15 Oct). The
  // home-equity test only renders that page, so "No hard pull" reached the
  // shared contact step, the confirmation email and the FHA hero anyway.
  // Replaced on 31 Oct with "No obligation. Not a loan application." This scan
  // covers every visitor-facing file so the claim cannot return elsewhere.
  const CLAIMS = [
    /\bno (hard|credit) (pull|check|inquiry)/i,
    /\bsoft[- ](pull|credit)/i,
    /\bzero credit impact/i,
    /\b(won.t|will not|doesn.t|does not) (affect|hurt|impact) your credit/i,
  ];

  it.each(FILES)('%s makes no credit-pull claim', (file) => {
    const src = code(read(file));
    for (const claim of CLAIMS) expect(src, String(claim)).not.toMatch(claim);
  });

  it('the scan includes the pages and email where the claim used to be', () => {
    for (const file of ['src/components/PageParts.tsx', 'src/components/DebtPageViews.tsx',
      'public/fha/index.html', 'netlify/functions/send-contact-confirmation.mts']) {
      expect(FILES).toContain(file);
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

  it('completed React captures lead with scheduling instead of a waiting message', () => {
    // Max, 27 Oct: a large received/wait-for-contact state made scheduling
    // easy to miss. Keep the no-deadline rules above, but make booking next.
    for (const file of ['DebtPageViews', 'HomeEquityViews', 'AduViews', 'LeadForm']) {
      const src = read(`src/components/${file}.tsx`).replace(/\s+/g, ' ');
      expect(src, file).toContain('<SavedLeadCalendar');
    }
    for (const page of ['dscr', 'fha', 'realestateinvesting']) {
      const html = read(`public/${page}/index.html`);
      expect(html, page).not.toContain('id="contactOverlay"');
      expect(html, page).not.toContain('reach out');
    }
  });
});
