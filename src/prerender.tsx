/**
 * The homepage's nav and hero as static HTML, rendered at build time (audit,
 * "Homepage LCP", Option A, 5 Oct).
 *
 * WHY. The landing pages are plain HTML and paint their hero with the first
 * frame; the homepage shipped an empty <div id="root"> and painted nothing
 * until ~118 KB of JavaScript had downloaded and run, behind GTM and the
 * gtags. PSI put its LCP at a median 5.0 s after GTM v7, against 1.7 to 3.6 s
 * for the landing pages. vite.config.ts writes this markup into index.html's
 * #root, so the hero is in the HTML itself.
 *
 * HOW IT STAYS CORRECT. It is the same Nav and Hero components the app
 * renders, not a copy, so the two cannot drift. main.tsx is unchanged:
 * createRoot replaces this markup with identical DOM when the app loads. That
 * replacement is deliberate rather than hydration: hydrating would mean the
 * whole App renders on the server too, which pulls in the debt calculator and
 * the lead form, and a mismatch there is a lead-path risk (audit, Option B).
 *
 * The wrapper mirrors App.tsx: Nav, then <main> holding the hero first, so the
 * DOM React builds has the same shape and nothing moves when it swaps in.
 *
 * Clicks on the buttons in this markup before React has loaded are queued by
 * the inline script in index.html and replayed once the app mounts (App.tsx).
 */
import { renderToStaticMarkup } from 'react-dom/server';
import Nav from './components/Nav';
import Hero from './components/Hero';
import { DebtCalculatorHeader } from './components/DebtSavingsCalculator';

const noop = () => {};

/**
 * The same thing for /debt-consolidation/ (revamp phase 0, 8 Oct): the nav and
 * the calculator's heading, which is that page's <h1> and its LCP element.
 *
 * It stops at the heading on purpose. The calculator under it is the lead path,
 * and pre-rendering inputs that do nothing until React arrives is the mismatch
 * the homepage shell was kept clear of. The wrapper mirrors DebtConsolidationApp
 * and DebtSavingsCalculator down to the heading, so React draws the same DOM in
 * the same place and the steps appear beneath it without moving it.
 */
export function renderDebtShell(): string {
  return renderToStaticMarkup(
    <>
      <Nav onOpenContact={noop} alwaysSolid />
      <div className="page-top-spacer" />
      <main>
        <section id="savings" className="section section-light">
          <div className="container">
            <DebtCalculatorHeader standalone />
          </div>
        </section>
      </main>
    </>,
  );
}

export function renderHomeShell(): string {
  return renderToStaticMarkup(
    <>
      <Nav onOpenContact={noop} />
      <main>
        <Hero onOpenContact={noop} />
      </main>
    </>,
  );
}
