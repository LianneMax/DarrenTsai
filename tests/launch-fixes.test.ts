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
import youtubeRedirect, { SHORTLINKS } from '../netlify/functions/youtube-redirect.mts';

const read = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8');

const DSCR = 'public/dscr/index.html';
const FHA = 'public/fha/index.html';
const REI = 'public/realestateinvesting/index.html';
const LANDING = [DSCR, FHA, REI];
/** The pages Vite builds from an HTML entry of their own. */
const BUILT = ['index.html', 'debt-consolidation/index.html', 'mortgage-calculator/index.html'];

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
    expect(yt.length).toBe(0); // Static target queries must not shadow the query-preserving function.
    for (const bucket of Object.keys(SHORTLINKS)) {
      for (const suffix of ['', '-c']) expect(youtubeRedirect(new Request(`https://realdarrentsai.com/yt/${bucket}${suffix}`)).status).toBe(302);
    }
  });

  it.each([['debt', '/debt-consolidation/'], ['mortgage', '/mortgage-calculator/'], ['home', '/']])('tracks %s description and comment clicks separately', (slug, destination) => {
    for (const [suffix, content] of [['', 'description'], ['-c', 'pinned-comment']]) {
      const response = youtubeRedirect(new Request(`https://realdarrentsai.com/yt/${slug}${suffix}`));
      expect(response.status).toBe(302);
      const url = new URL(response.headers.get('Location')!);
      expect(url.pathname).toBe(destination);
      expect(url.searchParams.get('utm_source')).toBe('youtube');
      expect(url.searchParams.get('utm_content')).toBe(content);
    }
  });

  it('has no catch-all that could shadow them', () => {
    expect(rules.some((r) => r.from === '/*')).toBe(false);
  });
});

describe('L10: nothing of ours or CallRail\'s holds the first paint', () => {
  // swap.js in the <head> held first paint ~3 s on a visitor's first page (PSI:
  // 920 ms render-blocking) and still left the real number in place ~0.5 s
  // after paint. At the end of <body> the page paints at once and the swap lands
  // 0.9 to 1.2 s after navigation. It must stay synchronous: async never swapped.
  const TAG = '<script type="application/x-dt-consent" data-src="https://cdn.callrail.com/companies/650367292/c3023306605245b12c92/12/swap.js"></script>';
  it.each([...LANDING, ...BUILT])(
    '%s declares one consent-gated swap.js at the end of <body>',
    (page) => {
      const html = read(page);
      expect(html.split(TAG).length - 1).toBe(1);
      const at = html.indexOf(TAG);
      expect(at).toBeGreaterThan(html.indexOf('<body>'));
      // Nothing but whitespace after it, before </body>.
      expect(html.slice(at + TAG.length).trim()).toMatch(/^<\/body>/);
    },
  );

  it('the homepage build inlines its stylesheet and pre-renders the hero', () => {
    const config = read('vite.config.ts');
    expect(config).toMatch(/plugins: \[react\(\), prerenderHomeShell\(\), inlineHomeCss\(\)\]/);
    expect(config).toContain("order: 'post'");
  });

  it('/debt-consolidation/ gets the same two build steps, from one list', () => {
    // It is an ad destination, so it must not ship with the empty #root and the
    // render-blocking stylesheet the homepage took until L10 to lose. One list
    // drives both plugins, so a page cannot get one step without the other.
    const config = read('vite.config.ts');
    expect(config).toContain("'/debt-consolidation/index.html': 'renderDebtShell'");
    expect(config).toContain('const render = PRERENDERED[ctx.path]');
    expect(config).toContain('if (!PRERENDERED[ctx.path] || !ctx.bundle) return html');
    expect(config).toContain("debtConsolidation: 'debt-consolidation/index.html'");
  });
});

describe('L9: a footer link row never starts with a separator', () => {
  // As separate flex items the dots could wrap onto a new line alone, so on a
  // phone the second row of links opened with "·". Each dot is now its link's
  // ::after and wraps with it. Measured in a browser on 5 Oct, before: a row
  // started with a dot at 320 to 414px on all five pages; after: none.
  it.each([...LANDING, 'src/components/Footer.tsx'])('%s has no stand-alone separators', (file) => {
    const src = read(file);
    const footer = src.slice(src.indexOf('footer-compliance'));
    expect(footer.slice(0, footer.indexOf('</div>'))).not.toMatch(/<span[^>]*>\s*(·|&middot;)\s*<\/span>/);
  });

  it.each([...LANDING, 'src/index.css'])('%s draws the dot after each link but the last', (file) => {
    expect(read(file)).toMatch(/\.footer-compliance a:not\(:last-child\)::after\s*\{[^}]*content:\s*'\\00B7' \/ ''/);
  });
});

describe('L8: one company NMLS everywhere', () => {
  // Darren, 2 Oct: everything uses Saxton Mortgage, LLC NMLS #1717191. #2525913
  // is Dream Home Development Corporation, the California-only subsidiary, and
  // the emails and guide PDFs carried it while the site carried #1717191.
  const SENDERS = ['contact-confirmation', 'dscr-guide', 'fha-guide', 'rei-guide'].map(
    (n) => `netlify/functions/send-${n}.mts`,
  );

  it.each(SENDERS)('%s names Saxton Mortgage, LLC NMLS #1717191 only', (file) => {
    const src = read(file);
    expect(src).toContain('Saxton Mortgage, LLC | NMLS #1717191');
    expect(src).toContain('https://www.nmlsconsumeraccess.org/');
    expect(src).not.toContain('2525913');
    expect(src).not.toContain('Dream Home');
  });

  it('the DSCR guide PDF is built with #1717191', () => {
    const src = read('scripts/build_dscr_pdf.py');
    expect(src).toContain('NMLS #1717191');
    expect(src).not.toContain('2525913');
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

  it('the homepage hero has no entry animation at all', () => {
    // Since 5 Oct it is pre-rendered, and an animation would play twice: once
    // on the HTML, once on the elements React swaps in.
    expect(read('src/components/HomeHub.tsx')).not.toMatch(/hero-anim/);
    expect(read('src/index.css')).not.toMatch(/\.hero-anim\b/);
  });

  it.each([...LANDING, ...BUILT])(
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

  it.each(['src/App.tsx', 'src/DebtConsolidationApp.tsx', 'src/MortgageCalculatorApp.tsx'])('%s wraps its content in <main>', (file) => {
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

describe('security headers', () => {
  // Checked in the 10 Oct security pass. Pinned so a tidy-up of netlify.toml
  // cannot drop them: they stop another site framing a lead form, and stop a
  // browser guessing a file's type. No Content-Security-Policy yet: GTM loads
  // whatever is published in the GTM UI, so a policy needs a Report-Only run
  // on the live site first.
  it('sends them on every path', () => {
    // Git may check this file out with CRLF on Windows; inspect the same
    // header block regardless of the checkout's newline convention.
    const toml = read('netlify.toml').replace(/\r\n/g, '\n');
    const block = toml.slice(toml.indexOf('for = "/*"\n'));
    expect(block).toContain('X-Frame-Options = "SAMEORIGIN"');
    expect(block).toContain('X-Content-Type-Options = "nosniff"');
    expect(block).toContain('Referrer-Policy = "strict-origin-when-cross-origin"');
  });
});
