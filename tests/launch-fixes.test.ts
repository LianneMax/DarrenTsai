/**
 * The Google Ads launch fixes of 30 Sep (audit.md, "Launch fixes", L1 to L3).
 *
 * None of these is a lead-path bug, which is exactly why they are pinned: each
 * one is a line of markup or config that looks removable to someone tidying a
 * page, and each one is something an Ads reviewer or Lighthouse checks for.
 * Contrast itself is measured by Lighthouse, not here; jsdom computes no colours.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8');

const DSCR = 'public/dscr/index.html';
const FHA = 'public/fha/index.html';
const REI = 'public/realestateinvesting/index.html';
const LANDING = [DSCR, FHA, REI];

/** Every [[redirects]] block in netlify.toml, in file order. */
function redirects() {
  return read('netlify.toml')
    .split('[[redirects]]')
    .slice(1)
    .map((block) => ({
      from: /from\s*=\s*"([^"]+)"/.exec(block)?.[1],
      to: /to\s*=\s*"([^"]+)"/.exec(block)?.[1],
      status: Number(/status\s*=\s*(\d+)/.exec(block)?.[1]),
    }));
}

describe('L1: every ad landing page carries the licence footer', () => {
  it.each(LANDING)('%s links the privacy policy and NMLS Consumer Access', (page) => {
    const html = read(page);
    const footer = html.slice(html.indexOf('<footer class="site-footer">'), html.indexOf('</footer>'));
    expect(footer.length).toBeGreaterThan(0);
    expect(footer).toContain('https://www.saxtonmortgage.com/privacy-policy');
    expect(footer).toContain('https://www.nmlsconsumeraccess.org/EntityDetails.aspx/INDIVIDUAL/2438102');
    expect(footer).toContain('NMLS #2438102');
    expect(footer).toContain('CA DRE Broker #02103705');
    expect(footer).toContain('Equal Housing');
  });
});

describe('L2: old site URLs are permanently redirected', () => {
  const rules = redirects();
  const OLD: Array<[string, string]> = [
    ['/investing', '/realestateinvesting/'],
    ['/investing/*', '/realestateinvesting/'],
    ['/homeowners', '/'],
    ['/agent-career', '/'],
    ['/post/*', '/'],
  ];

  it.each(OLD)('%s -> %s is a 301', (from, to) => {
    expect(rules.find((r) => r.from === from)).toEqual({ from, to, status: 301 });
  });

  it('leaves the /yt short links as 302s', () => {
    const yt = rules.filter((r) => r.from?.startsWith('/yt/'));
    expect(yt.length).toBe(10);
    for (const r of yt) expect(r.status).toBe(302);
  });

  it('has no catch-all that could shadow them', () => {
    expect(rules.some((r) => r.from === '/*')).toBe(false);
  });
});

describe('L7: the hero paints at once', () => {
  // LCP does not count an element at opacity 0 as painted, so a hero that fades
  // in makes LCP wait for the fade, and the fade's frames wait behind every
  // tracking script on a phone. PSI put / at 5.9 to 9.4s on 1 Oct for this.
  it.each([FHA, REI])('%s moves its hero in without fading it', (page) => {
    const rule = /\n {2}\.anim\{([^}]*)\}/.exec(read(page))?.[1] ?? '';
    expect(rule).toContain('heroRise');
    expect(rule).not.toMatch(/opacity/);
    expect(read(page)).toMatch(/@keyframes heroRise\{[^}]*\{transform:[^}]*\}[^}]*\{transform:[^}]*\} \}/);
  });

  it('the React hero moves in without fading', () => {
    const css = read('src/index.css');
    const rule = /\.hero-anim\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(rule).toContain('heroRise');
    expect(rule).not.toMatch(/opacity/);
    const frames = /@keyframes heroRise\s*\{([\s\S]*?)\n {2}\}/.exec(css)?.[1] ?? '';
    expect(frames).toContain('transform');
    expect(frames).not.toContain('opacity');
  });

  it.each([...LANDING, 'index.html', 'mortgage-calculator/index.html'])(
    '%s loads attribution.js off the render path',
    (page) => {
      expect(read(page)).toContain('<script src="/attribution.js" async fetchpriority="high"></script>');
    },
  );
});

describe('L3: landmarks, headings and the closed drawer', () => {
  it.each(LANDING)('%s has exactly one <main>, holding the hero', (page) => {
    const html = read(page);
    expect(html.match(/<main\b/g)?.length).toBe(1);
    expect(html.indexOf('<main>')).toBeLessThan(html.indexOf('<header class="hero">'));
    expect(html.indexOf('</main>')).toBeLessThan(html.indexOf('<footer class="site-footer">'));
  });

  it.each(['src/App.tsx', 'src/MortgageCalculatorApp.tsx'])('%s wraps its content in <main>', (file) => {
    expect(read(file)).toMatch(/<main>[\s\S]*<\/main>\s*<Footer \/>/);
  });

  it('/dscr/ does not jump from the h1 to an h3 in the rate module', () => {
    expect(read(DSCR)).toContain('<h2>Get Your Actual Rate &amp; Terms</h2>');
  });

  it('takes every link in the closed mobile drawer out of the tab order', () => {
    const nav = read('src/components/Nav.tsx');
    const drawer = nav.slice(nav.indexOf('className={`nav-mobile-menu'));
    const focusables = drawer.match(/<(a|button)\b[^>]*>/g) ?? [];
    expect(focusables.length).toBeGreaterThan(0);
    for (const tag of focusables) expect(tag).toContain('tabIndex={drawerTab}');
  });
});
