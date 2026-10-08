/**
 * The homepage's pre-rendered nav and hero (audit, "Homepage LCP", Option A).
 *
 * vite.config.ts writes renderHomeShell() into index.html's #root at build time
 * and fails open if it throws, so a break here would ship silently as a slower
 * homepage. These tests are where it fails loudly instead.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8');

describe('the pre-rendered homepage shell', () => {
  it('holds the nav and the hero headline', async () => {
    const { renderHomeShell } = await import('../src/prerender');
    const shell = renderHomeShell();
    expect(shell.startsWith('<nav')).toBe(true);
    expect(shell).toContain('<main>');
    expect(shell).toMatch(/<h1[^>]*>Most mortgages cost you money/);
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
    for (const key of ['nav-book', 'nav-contact', 'nav-calc', 'nav-menu', 'nav-savings', 'nav-reviews',
      'hero-savings', 'hero-contact', 'hero-reviews']) {
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
 * /debt-consolidation/ (revamp phase 0, 8 Oct). The same pre-render, for the
 * page the debt ads land on. Its shell stops at the calculator's heading: the
 * steps under it are the lead path and are drawn by React alone.
 */
describe('the pre-rendered /debt-consolidation/ shell', () => {
  /** Closes the heading's three wrappers, which the app goes on to fill. */
  const TAIL = '</div></section></main>';

  it('holds the nav and the calculator heading as the page <h1>', async () => {
    const { renderDebtShell } = await import('../src/prerender');
    const shell = renderDebtShell();
    expect(shell.startsWith('<nav')).toBe(true);
    expect(shell).toMatch(/<h1[^>]*>Boost Your Monthly Cashflow<\/h1>/);
    expect(shell.match(/<h1\b/g)).toHaveLength(1);
  });

  it('is exactly the start of what the app renders, so nothing moves when React swaps in', async () => {
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { renderDebtShell } = await import('../src/prerender');
    const { default: DebtConsolidationApp } = await import('../src/DebtConsolidationApp');
    const app = renderToStaticMarkup(<DebtConsolidationApp />);
    const shell = renderDebtShell();
    expect(shell.endsWith(TAIL)).toBe(true);
    expect(app.startsWith(shell.slice(0, -TAIL.length))).toBe(true);
  });

  it('fades nothing in: no element starts at opacity 0', async () => {
    // `.reveal` is opacity 0 until an IntersectionObserver adds `revealed`. In
    // pre-rendered HTML there is no observer yet, so a reveal class here would
    // hide the heading until React ran, and LCP does not count a hidden element.
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { renderDebtShell } = await import('../src/prerender');
    const { default: DebtConsolidationApp } = await import('../src/DebtConsolidationApp');
    expect(renderDebtShell()).not.toMatch(/class="[^"]*\breveal\b/);
    // The steps and the first card are on the first screen too.
    expect(renderToStaticMarkup(<DebtConsolidationApp />)).not.toMatch(/class="[^"]*\breveal\b/);
  });

  it('leaves the homepage copy as it was: an <h2> that reveals on scroll', async () => {
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { default: DebtSavingsCalculator } = await import('../src/components/DebtSavingsCalculator');
    const html = renderToStaticMarkup(<DebtSavingsCalculator />);
    expect(html).toMatch(/<h2[^>]*>Boost Your Monthly Cashflow<\/h2>/);
    expect(html).toContain('class="section-header reveal"');
    expect(html).not.toMatch(/<h1\b/);
  });

  it('marks every button that needs JavaScript, and carries no phone number', async () => {
    const { renderDebtShell } = await import('../src/prerender');
    const shell = renderDebtShell();
    const buttons = shell.match(/<button\b[^>]*>/g) ?? [];
    const visible = buttons.filter((b) => !/tabindex="-1"/.test(b));
    expect(visible.length).toBeGreaterThan(0);
    for (const b of visible) expect(b).toContain('data-early=');
    expect(shell).not.toMatch(/tel:/);
  });

  it('has the empty #root the build fills, and the same early-click script as the homepage', () => {
    const page = read('debt-consolidation/index.html');
    expect(page).toContain('<div id="root"></div>');
    const script = (html: string) =>
      /<script>\s*(\(function \(\) \{[\s\S]*?__dtEarlyClick[\s\S]*?\}\)\(\);)\s*<\/script>/.exec(html)?.[1];
    expect(script(page)).toBeDefined();
    // Two copies, because a static HTML entry cannot import. Held identical so
    // a fix to one is a fix to both; the behaviour is tested below, once.
    expect(script(page)).toBe(script(read('index.html')));
  });

  it('replays the queued click, as the homepage does', () => {
    const app = read('src/DebtConsolidationApp.tsx');
    expect(app).toMatch(/querySelector<HTMLElement>\(`\[data-early="\$\{CSS\.escape\(key\)\}"\]`\)\?\.click\(\)/);
  });

  it('sends the same lead as the homepage calculator, from a contact modal of its own', () => {
    const app = read('src/DebtConsolidationApp.tsx');
    // The calculator's source and form id live in the shared component, so the
    // page cannot fork them. The modal is the one thing that is this page's own.
    expect(app).toContain('<DebtSavingsCalculator standalone />');
    expect(app).toContain('leadSource="debt-consolidation-contact"');
    expect(app).toContain('formId="debt-consolidation-contact-modal"');
  });

  it('is canonical to itself and listed in the sitemap', () => {
    expect(read('debt-consolidation/index.html'))
      .toContain('<link rel="canonical" href="https://realdarrentsai.com/debt-consolidation/" />');
    expect(read('public/sitemap.xml')).toContain('<loc>https://realdarrentsai.com/debt-consolidation/</loc>');
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
    document.body.innerHTML = '<button data-early="hero-savings"></button><button data-early="nav-book"></button>';
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
