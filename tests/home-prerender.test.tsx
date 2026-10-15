/**
 * The homepage's pre-rendered nav and hero (audit, "Homepage LCP", Option A).
 *
 * vite.config.ts writes renderHomeShell() into index.html's #root at build time
 * and fails open if it throws, so a break here would ship silently as a slower
 * homepage. These tests are where it fails loudly instead.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8');

describe('the pre-rendered homepage shell', () => {
  it('holds the nav and the hero headline', async () => {
    const { renderHomeShell } = await import('../src/prerender');
    const shell = renderHomeShell();
    expect(shell.startsWith('<nav')).toBe(true);
    expect(shell).toContain('<main>');
    expect(shell).toMatch(/<h1[^>]*>Access your home <em>equity\.<\/em>/);
    expect(shell.match(/<h1\b/g)).toHaveLength(1);
  });

  it('is exactly the start of what the app renders, so nothing moves when React swaps in', async () => {
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { renderHomeShell } = await import('../src/prerender');
    const { default: App } = await import('../src/App');
    const app = renderToStaticMarkup(<App />);
    const shell = renderHomeShell();
    expect(shell.endsWith('</main>')).toBe(true);
    expect(app.startsWith(shell.slice(0, -'</main>'.length))).toBe(true);
  });

  it('marks every button that needs JavaScript, so an early click is queued', async () => {
    const { renderHomeShell } = await import('../src/prerender');
    const shell = renderHomeShell();
    // The hero's calls to action are anchors, so neither needs a key: a link
    // works before React does.
    for (const key of ['nav-book', 'nav-contact', 'nav-calc', 'nav-menu', 'nav-about', 'nav-reviews']) {
      expect(shell, key).toContain(`data-early="${key}"`);
    }
    // Every <button> in the shell is marked: a button does nothing without React.
    const buttons = shell.match(/<button\b[^>]*>/g) ?? [];
    const visible = buttons.filter((b) => !/tabindex="-1"/.test(b)); // the closed drawer's
    expect(visible.length).toBeGreaterThan(0);
    for (const b of visible) expect(b).toContain('data-early=');
  });

  it('carries no phone number for CallRail to swap and React to overwrite', async () => {
    const { renderHomeShell } = await import('../src/prerender');
    expect(renderHomeShell()).not.toMatch(/tel:/);
  });

  it('index.html still has the empty #root the build fills', () => {
    expect(read('index.html')).toContain('<div id="root"></div>');
  });
});

/**
 * /debt-consolidation/ was retired on 15 Oct 2026: its comparison is the "Pay
 * off high-interest debt" path of /home-equity/ (?goal=payoff), and the old URL
 * and /yt/debt redirect there with every UTM and click id kept.
 */
describe('/debt-consolidation/ retired into /home-equity/?goal=payoff', () => {
  const QUERY = 'utm_source=google&utm_medium=cpc&utm_campaign=debt-q4&utm_content=ad-a&utm_term=pay+off+cards&gclid=G1&gbraid=GB&wbraid=WB&msclkid=MS&fbclid=FB';

  it('301s the old URL, with or without a slash, keeping every UTM and click id', async () => {
    const { default: debtRedirect } = await import('../netlify/functions/debt-redirect.mts');
    for (const path of ['/debt-consolidation', '/debt-consolidation/', '/debt-consolidation/index.html']) {
      const res = debtRedirect(new Request(`https://realdarrentsai.com${path}?${QUERY}`));
      expect(res.status, path).toBe(301);
      expect(res.headers.get('Cache-Control')).toBe('no-store');
      const to = new URL(res.headers.get('Location')!);
      expect(to.origin + to.pathname).toBe('https://realdarrentsai.com/home-equity/');
      expect(to.searchParams.get('goal')).toBe('payoff');
      for (const [k, v] of new URLSearchParams(QUERY)) expect(to.searchParams.get(k), k).toBe(v);
    }
  });

  it('302s /yt/debt and /yt/debt-c to the payoff path, like every short link, keeping the visitor query', async () => {
    const { default: yt } = await import('../netlify/functions/youtube-redirect.mts');
    for (const [path, content] of [['/yt/debt', 'description'], ['/yt/debt-c', 'pinned-comment']]) {
      const res = yt(new Request(`https://realdarrentsai.com${path}?gclid=G1&utm_term=t`));
      expect(res.status).toBe(302);
      const to = new URL(res.headers.get('Location')!);
      expect(to.pathname).toBe('/home-equity/');
      expect(to.searchParams.get('goal')).toBe('payoff');
      expect(to.searchParams.get('gclid')).toBe('G1');
      expect(to.searchParams.get('utm_term')).toBe('t');
      expect(to.searchParams.get('utm_campaign')).toBe('yt-debt');
      expect(to.searchParams.get('utm_content')).toBe(content);
    }
  });

  it('has no page, entry, shell or sitemap listing of its own any more', () => {
    expect(existsSync(resolve(__dirname, '../debt-consolidation/index.html'))).toBe(false);
    expect(existsSync(resolve(__dirname, '../src/DebtConsolidationApp.tsx'))).toBe(false);
    expect(read('src/prerender.tsx')).not.toContain('renderDebtShell');
    expect(read('public/sitemap.xml')).not.toContain('debt-consolidation');
  });

  it('picks the payoff hero before first paint, so nothing moves', () => {
    const page = read('home-equity/index.html');
    expect(page).toMatch(/goal=payoff[\s\S]*classList\.add\('goal-payoff'\)/);
    expect(page.indexOf("classList.add('goal-payoff')")).toBeLessThan(page.indexOf('</head>'));
  });

  it('posts the payoff comparison with the same source and form id, so Sheet and HubSpot fields hold', () => {
    const calc = read('src/components/DebtSavingsCalculator.tsx');
    expect(calc).toContain("formId: 'debt-savings-calculator'");
    expect(calc).toContain("source: 'DebtConsolidation'");
    expect(read('src/components/HomeEquityCalculator.tsx')).toContain('<DebtSavingsCalculator flowId="equity" />');
  });

  it('renders the comparison on /home-equity/?goal=payoff, under the payoff heading', async () => {
    window.history.replaceState({}, '', '/home-equity/?goal=payoff&gclid=G1');
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { default: HomeEquityApp } = await import('../src/HomeEquityApp');
    const html = renderToStaticMarkup(<HomeEquityApp />);
    window.history.replaceState({}, '', '/');
    expect(html).toContain('Compare paying off high-interest debt with home <em>equity</em>');
    expect(html).toContain('aria-pressed="true">Pay off high-interest debt</button>');
    expect(html).toContain('id="equity"');
    expect(html).toContain('Your Current Monthly Debts'); // the comparison's first step
  });
});

/**
 * The retired product name and its old slogans (15 Oct 2026): not in any
 * title, heading, meta or other copy the site serves. The Sheet's tab keeps
 * its "Debt Consolidation" name for old leads; that is the Apps Script, not
 * the site, and the source value DebtConsolidation has no space.
 */
describe('no retired phrase on the site', () => {
  const PHRASES = [/debt[\s-]consolidation(?!-contact)/i, /monthly reset/i, /boost your monthly cash ?flow/i];
  const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/<!--[\s\S]*?-->/g, '');
  function files(dir: string, ext: RegExp): string[] {
    return readdirSync(resolve(__dirname, '..', dir), { withFileTypes: true }).flatMap((d) => {
      const rel = `${dir}/${d.name}`;
      if (d.isDirectory()) return files(rel, ext);
      return ext.test(d.name) ? [rel] : [];
    });
  }
  const SITE = [
    'index.html', 'home-equity/index.html', 'adu/index.html', 'mortgage-calculator/index.html',
    ...files('public', /\.(html|js|xml|json|txt)$/),
    ...files('src', /\.(tsx?|css)$/),
    ...files('netlify/functions', /\.mts$/).filter((f) => !f.endsWith('debt-redirect.mts') && !f.endsWith('youtube-redirect.mts')),
  ];

  // HTML entries and public/ are served exactly as written, so their comments
  // are visible to anyone viewing source and are checked too. Bundled source
  // loses its comments in the build.
  const servedAsIs = (f: string) => f.endsWith('.html') || f.startsWith('public/');
  it.each(SITE)('%s', (file) => {
    const text = servedAsIs(file) ? read(file) : strip(read(file));
    for (const phrase of PHRASES) expect(text, String(phrase)).not.toMatch(phrase);
  });
});

describe('the pre-rendered mortgage calculator', () => {
  it('paints the real empty calculator with controls disabled until React replaces them', async () => {
    const { renderMortgageShell } = await import('../src/prerender');
    const shell = renderMortgageShell();
    document.body.innerHTML = shell;
    expect(document.querySelector('h1')?.textContent).toBe('Mortgage Calculator');
    const amount = document.querySelector<HTMLInputElement>('#loanAmount')!;
    const rate = document.querySelector<HTMLInputElement>('#annualRate')!;
    expect(amount.value).toBe('');
    expect(rate.value).toBe('');
    for (const control of document.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input, select')) {
      expect(control.disabled).toBe(true);
    }
    expect(shell).not.toMatch(/class="[^"]*\breveal\b/);
    expect(shell).not.toContain('Amortization Over Time');
    expect(shell).not.toContain('tel:');
    expect(document.querySelector('[data-early="calc-contact"]')).not.toBeNull();
  });

  it('uses the same early-click queue and replays the request on the mounted calculator', () => {
    const script = (html: string) => /<script>\s*(\(function \(\) \{[\s\S]*?__dtEarlyClick[\s\S]*?\}\)\(\);)\s*<\/script>/.exec(html)?.[1]?.replace(/\r\n/g, '\n');
    expect(script(read('mortgage-calculator/index.html'))).toBe(script(read('index.html')));
    expect(read('src/MortgageCalculatorApp.tsx')).toContain('__dtEarlyClick');
    expect(read('vite.config.ts')).toContain("'/mortgage-calculator/index.html': 'renderMortgageShell'");
  });
});

describe('the early-click queue in index.html', () => {
  type Early = { take: () => string | null };
  const script = /<script>\s*(\(function \(\) \{[\s\S]*?__dtEarlyClick[\s\S]*?\}\)\(\);)\s*<\/script>/.exec(read('index.html'))?.[1];

  beforeEach(() => {
    document.body.innerHTML = '';
    delete (window as { __dtEarlyClick?: Early }).__dtEarlyClick;
    // eslint-disable-next-line no-new-func
    new Function(script ?? 'throw new Error("inline early-click script not found")')();
  });

  const early = () => (window as unknown as { __dtEarlyClick: Early }).__dtEarlyClick;

  it('queues a click on a pre-rendered button and hands it over once', () => {
    document.body.innerHTML = '<button data-early="nav-book"><span>Book a Call</span></button>';
    const ev = new MouseEvent('click', { bubbles: true, cancelable: true });
    document.querySelector('span')!.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(early().take()).toBe('nav-book');
    expect(early().take()).toBe(null);
  });

  it('keeps only the last click', () => {
    document.body.innerHTML = '<button data-early="nav-calc"></button><button data-early="nav-book"></button>';
    for (const b of document.querySelectorAll('button')) b.click();
    expect(early().take()).toBe('nav-book');
  });

  it('never touches an element React has rendered', () => {
    document.body.innerHTML = '<button data-early="nav-book"></button>';
    const btn = document.querySelector('button')! as HTMLButtonElement & Record<string, unknown>;
    btn['__reactFiber$test'] = {};
    const ev = new MouseEvent('click', { bubbles: true, cancelable: true });
    btn.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
    expect(early().take()).toBe(null);
  });

  it('ignores unmarked elements, and stops listening after take()', () => {
    document.body.innerHTML = '<a href="/dscr/">DSCR</a><button data-early="nav-book"></button>';
    const link = new MouseEvent('click', { bubbles: true, cancelable: true });
    document.querySelector('a')!.dispatchEvent(link);
    expect(link.defaultPrevented).toBe(false);
    early().take();
    const later = new MouseEvent('click', { bubbles: true, cancelable: true });
    document.querySelector('button')!.dispatchEvent(later);
    expect(later.defaultPrevented).toBe(false);
  });

  it('App replays the queued click on the live element', () => {
    const app = read('src/App.tsx');
    expect(app).toContain('__dtEarlyClick');
    expect(app).toMatch(/querySelector<HTMLElement>\(`\[data-early="\$\{CSS\.escape\(key\)\}"\]`\)\?\.click\(\)/);
  });
});
