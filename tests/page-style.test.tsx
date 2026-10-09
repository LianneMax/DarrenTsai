/**
 * One look across the site (10 Oct): the React pages (the hub, /debt-consolidation/,
 * /home-equity/, /adu/) take the static landing pages' palette, header, accent
 * word, licensed strip, motion and mobile bar.
 *
 * What this pins is what would drift silently: a colour changed on one side
 * only, a pink button copied back in from an old component, a reveal or a bar
 * that hides content when the browser lacks IntersectionObserver.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MobileActionBar, LicensedStrip } from '../src/components/PageParts';
import { useScrollReveal } from '../src/hooks/useScrollReveal';

const read = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8');
const CSS = read('src/index.css');
const token = (src: string, name: string) =>
  new RegExp(`--${name}:\\s*([^;]+);`).exec(src)?.[1].trim();

describe('the palette is the static pages\' palette', () => {
  for (const page of ['public/dscr/index.html', 'public/fha/index.html', 'public/realestateinvesting/index.html']) {
    it(`matches ${page}`, () => {
      const html = read(page);
      for (const name of ['teal', 'accent', 'accent-on-teal', 'header-text', 'teal-deep', 'line', 'navy']) {
        const theirs = token(html, name);
        if (theirs) expect(token(CSS, name), name).toBe(theirs);
      }
    });
  }
});

describe('the header and the buttons', () => {
  it('has the static pages\' pair: Contact outlined, Book a Call slate', () => {
    const nav = read('src/components/Nav.tsx');
    expect(nav).toContain('className="btn btn-outline-teal btn-sm" data-early="nav-contact"');
    expect(nav).toContain('className="btn btn-teal btn-sm" data-early="nav-book"');
  });

  it('uses no pink button outside the contact form, whose static twin is pink too', () => {
    for (const f of ['Nav', 'HomeHub', 'PageParts', 'DebtPageViews', 'HomeEquityViews', 'AduViews', 'DebtSavingsCalculator']) {
      expect(read(`src/components/${f}.tsx`), f).not.toContain('btn-rose');
    }
  });

  it('gives each page headline one accent word', () => {
    for (const f of ['HomeHub', 'DebtPageViews', 'HomeEquityViews', 'AduViews']) {
      const h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/.exec(read(`src/components/${f}.tsx`))?.[1] ?? '';
      expect(h1.match(/<em>/g), f).toHaveLength(1);
    }
  });
});

describe('the licensed strip', () => {
  it('carries the five items of the static strip, the Equal Housing mark among them', () => {
    const html = renderToStaticMarkup(<LicensedStrip />);
    expect(html.match(/dcp-licensed-item/g)).toHaveLength(5);
    expect(html.match(/dcp-licensed-divider/g)).toHaveLength(4);
    expect(html).toContain('NMLS #2438102');
    expect(html).toContain('CA DRE #02103705');
    expect(html).toContain('Equal Housing Opportunity');
  });
});

let root: Root | null = null;
let host: HTMLDivElement | null = null;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null; host = null;
  vi.unstubAllGlobals();
});
function mount(node: React.ReactNode) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(node));
  return host;
}

describe('the mobile action bar', () => {
  it('jumps to the tool and calls with a real tel: link', () => {
    const el = mount(<><div id="savings" /><MobileActionBar target="savings" label="See My Comparison" /></>);
    expect(el.querySelector('.dcp-mobile-bar-cta')?.getAttribute('href')).toBe('#savings');
    expect(el.querySelector('.dcp-mobile-bar-cta')?.textContent).toBe('See My Comparison');
    expect(el.querySelector('.dcp-mobile-bar-call')?.getAttribute('href')).toBe('tel:7148875432');
  });

  it('stays put when the browser has no IntersectionObserver', () => {
    const el = mount(<><div id="savings" /><MobileActionBar target="savings" label="Go" /></>);
    expect(el.querySelector('.dcp-mobile-bar')?.classList.contains('is-away')).toBe(false);
  });

  it('steps aside, out of the tab order too, while the tool is on screen', () => {
    let fire: (hit: boolean) => void = () => {};
    vi.stubGlobal('IntersectionObserver', class {
      constructor(cb: (e: Array<{ isIntersecting: boolean }>) => void) { fire = (hit) => cb([{ isIntersecting: hit }]); }
      observe() {}
      disconnect() {}
    });
    const el = mount(<><div id="savings" /><MobileActionBar target="savings" label="Go" /></>);
    act(() => fire(true));
    const bar = el.querySelector('.dcp-mobile-bar')!;
    expect(bar.classList.contains('is-away')).toBe(true);
    expect(bar.getAttribute('aria-hidden')).toBe('true');
    expect(el.querySelector('.dcp-mobile-bar-cta')?.getAttribute('tabindex')).toBe('-1');
    act(() => fire(false));
    expect(bar.classList.contains('is-away')).toBe(false);
  });

  it('is on all three calculator pages, after the footer, and never in the pre-rendered HTML', () => {
    for (const [app, target] of [['DebtConsolidationApp', 'savings'], ['HomeEquityApp', 'equity'], ['AduApp', 'project']]) {
      const src = read(`src/${app}.tsx`);
      expect(src, app).toMatch(new RegExp(`<Footer />\\s*<MobileActionBar target="${target}"`));
    }
    expect(read('src/prerender.tsx')).not.toContain('MobileActionBar');
  });
});

describe('scroll reveal', () => {
  function Probe() {
    const ref = useScrollReveal<HTMLDivElement>();
    return <div ref={ref} id="probe">x</div>;
  }
  it('hides nothing when the browser has no IntersectionObserver', () => {
    const el = mount(<Probe />);
    expect(el.querySelector('#probe')?.classList.contains('reveal')).toBe(false);
  });
  it('fades in when it does', () => {
    let fire: () => void = () => {};
    vi.stubGlobal('IntersectionObserver', class {
      constructor(cb: (e: Array<{ isIntersecting: boolean; target: Element }>) => void) {
        fire = () => cb([{ isIntersecting: true, target: document.getElementById('probe')! }]);
      }
      observe() {}
      disconnect() {}
    });
    const el = mount(<Probe />);
    const probe = el.querySelector('#probe')!;
    expect(probe.classList.contains('reveal')).toBe(true);
    act(() => fire());
    expect(probe.classList.contains('revealed')).toBe(true);
  });
});
