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
 * HOW IT STAYS CORRECT. It is the same Nav and HomeHero components the app
 * renders, not a copy, so the two cannot drift. main.tsx is unchanged:
 * createRoot replaces this markup with identical DOM when the app loads. That
 * replacement is deliberate rather than hydration: hydrating would mean the
 * whole App renders on the server too, which pulls in the contact modal and the
 * booking code, and a mismatch there is a lead-path risk (audit, Option B).
 *
 * The wrapper mirrors App.tsx: Nav, then <main> holding the hero first, so the
 * DOM React builds has the same shape and nothing moves when it swaps in.
 *
 * Clicks on the buttons in this markup before React has loaded are queued by
 * the inline script in index.html and replayed once the app mounts (App.tsx).
 */
import { renderToStaticMarkup } from 'react-dom/server';
import Nav from './components/Nav';
import { HomeHero } from './components/HomeHub';
import { EquityPageHero } from './components/HomeEquityViews';
import { AduPageHero } from './components/AduViews';
import Calculator from './components/Calculator';
import { defaultInputs } from './hooks/useMortgageInputs';
import { calculateMortgage } from './utils/mortgageCalc';
import { AboutHero } from './components/Marketing';

const noop = () => {};

/** Static entries use this same navigation markup; site-navigation.js owns their interactions. */
export function renderNavigation(): string {
  return renderToStaticMarkup(<Nav onOpenContact={noop} alwaysSolid />);
}

export function renderAboutShell(): string {
  return renderToStaticMarkup(<><Nav onOpenContact={noop} alwaysSolid /><main><AboutHero /></main></>);
}

/**
 * The mortgage entry was an empty root until its app ran: mobile LCP measured
 * 4.9–5.4s on 10 Oct. Render the actual empty calculator, not a second copy.
 * Preview controls are disabled until React mounts so early typing cannot be
 * lost during replacement. Contact/nav clicks use the existing early queue.
 * No chart or worked example is emitted; both require the visitor's inputs.
 */
export function renderMortgageShell(): string {
  return renderToStaticMarkup(
    <>
      <Nav onOpenContact={noop} alwaysSolid />
      <div className="page-top-spacer" />
      <main>
        <Calculator inputs={defaultInputs} setInputs={noop}
          summary={calculateMortgage(defaultInputs)} onOpenContact={noop} preview />
      </main>
    </>,
  );
}

/**
 * /home-equity/ (revamp phase 3), the same way: nav and hero, which holds the
 * <h1>. The wrapper mirrors HomeEquityApp and EquityPage down to the hero.
 */
export function renderEquityShell(): string {
  return renderToStaticMarkup(
    <>
      <Nav onOpenContact={noop} alwaysSolid />
      <div className="page-top-spacer" />
      <main>
        <section className="dcp equity-estimate-surface equity-revamp"><div className="equity-opening-surface"><EquityPageHero /></div>
        </section>
      </main>
    </>,
  );
}

/** /adu/ (revamp phase 5): nav and hero, mirroring AduApp and AduPage. */
export function renderAduShell(): string {
  return renderToStaticMarkup(
    <>
      <Nav onOpenContact={noop} alwaysSolid />
      <div className="page-top-spacer" />
      <main>
        <section className="dcp adu-revamp"><AduPageHero />
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
        <HomeHero />
      </main>
    </>,
  );
}
