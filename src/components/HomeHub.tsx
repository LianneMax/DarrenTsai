/**
 * The homepage as a goal hub (frontend revamp, phase 4).
 *
 * WHY. The homepage hosted the debt calculator, so every visitor who arrived
 * for anything else (equity, an ADU, a rental, a first home) met a debt tool
 * first. Each goal now has its own page, so the homepage's job is to send a
 * visitor to the right one: five goal cards, plus "Not sure where to start?",
 * which opens the contact modal (source home-contact, the Leads tab).
 *
 * Every card goes to a page that exists. That is the plan's rule, and the
 * reason /adu/ (phase 5) was built before this. Invest is the one card that
 * asks a question first, because it has two real destinations: the DSCR
 * calculator for a property scenario, and Real Estate Investing for learning
 * and planning.
 *
 * Layout and copy follow Max's design preview v4 (homepage), with the site's
 * title for Darren ("Senior Loan Officer · Saxton Mortgage") rather than the
 * preview's placeholder.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { NMLS, DRE, COMPANY, LICENSED_STATES } from '../config';
import { openCalendly } from '../utils/calendly';
import { useScrollReveal } from '../hooks/useScrollReveal';

const STATES = LICENSED_STATES.join(' · ');

// ─── Icons (Lucide shapes, inline so there is no icon font to wait for) ───────

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

const ICONS = {
  wallet: (
    <Icon>
      <path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" />
      <path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" />
    </Icon>
  ),
  house: (
    <Icon>
      <path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" />
      <path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </Icon>
  ),
  hammer: (
    <Icon>
      <path d="m15 12-8.373 8.373a1 1 0 1 1-3-3L12 9" />
      <path d="m18 15 4-4" />
      <path d="m21.5 11.5-1.914-1.914A2 2 0 0 1 19 8.172V7l-2.26-2.26a6 6 0 0 0-4.202-1.756L9 2.96l.92.82A6.18 6.18 0 0 1 12 8.4V10l2 2h1.172a2 2 0 0 1 1.414.586L18.5 14.5" />
    </Icon>
  ),
  building: (
    <Icon>
      <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" />
      <path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
      <path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" />
      <path d="M10 6h4M10 10h4M10 14h4M10 18h4" />
    </Icon>
  ),
  key: (
    <Icon>
      <path d="M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z" />
      <circle cx="16.5" cy="7.5" r=".5" fill="currentColor" />
    </Icon>
  ),
};

// ─── Hero ─────────────────────────────────────────────────────────────────────

/**
 * Pre-rendered into index.html (src/prerender.tsx). Static on purpose: its one
 * call to action is a real anchor, so it works before React has loaded and
 * needs no early-click key, and it carries no phone number for CallRail to
 * swap and React to overwrite.
 */
export function HomeHero() {
  return (
    <section className="hub-hero">
      <div className="hub-hero-inner container">
        <div>
          <span className="hub-eyebrow">Mortgage &amp; Real Estate Guidance</span>
          <h1 className="hub-h1">
            Start with your goal. Make your next move <em>with confidence.</em>
          </h1>
          <p className="hub-hero-sub">
            Pay off debt, access equity, renovate, invest or buy a home. Understand your numbers first,
            then explore what makes sense for you.
          </p>
          <a href="#goals" className="btn hub-hero-btn">
            Explore Your Options
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 5v14M6 13l6 6 6-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>
          <p className="hub-cred">NMLS #{NMLS} · DRE #{DRE} · {COMPANY}</p>
        </div>

        <aside className="hub-hero-aside">
          <img src="/darren-96.webp" srcSet="/darren-96.webp 96w, /darren-192.webp 192w"
            sizes="96px" width={96} height={96} alt="Darren Tsai" className="hub-hero-photo" />
          <div>
            <p className="hub-hero-aside-title">Real numbers. Real guidance.</p>
            <p className="hub-hero-aside-text">
              Mortgage decisions are personal. Start with a useful estimate and a straightforward
              conversation.
            </p>
            <p className="hub-cred">Darren Tsai<br />Senior Loan Officer · {COMPANY}</p>
          </div>
        </aside>
      </div>
    </section>
  );
}

// ─── Goals ────────────────────────────────────────────────────────────────────

const GOALS: Array<{ name: string; desc: string; href: string; icon: ReactNode }> = [
  { name: 'Pay Off Debt', desc: 'Compare ways to consolidate higher-interest debt.', href: '/debt-consolidation/', icon: ICONS.wallet },
  { name: 'Access Home Equity', desc: 'Estimate your equity and explore your options.', href: '/home-equity/', icon: ICONS.house },
  { name: 'Renovate / Build an ADU', desc: 'Explore funding for your next home project.', href: '/adu/', icon: ICONS.hammer },
];

const BUY = { name: 'Buy a Home', desc: 'Understand payments and financing options.', href: '/fha/', icon: ICONS.key };

function GoalCard({ name, desc, icon }: { name: string; desc: string; icon: ReactNode }) {
  return (
    <>
      <span className="hub-icon">{icon}</span>
      <h3>{name}</h3>
      <p>{desc}</p>
      <span className="hub-arrow">Explore options →</span>
    </>
  );
}

/**
 * Invest has two real destinations, so it asks which one. A small dialog,
 * closed by Escape, the close button or a click outside it.
 */
function InvestChooser({ onClose }: { onClose: () => void }) {
  const first = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    first.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="invest-title" onClick={onClose}>
      <div className="modal-panel hub-chooser" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 id="invest-title" className="modal-title">Run a deal or start with guidance?</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="modal-body">
          <div className="hub-choices">
            <a ref={first} href="/dscr/" className="hub-choice">
              <h3>Run a property scenario</h3>
              <p>DSCR Calculator →</p>
            </a>
            <a href="/realestateinvesting/" className="hub-choice">
              <h3>Learn and plan</h3>
              <p>Real Estate Investing →</p>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

export function HomeGoals({ onOpenContact }: { onOpenContact: () => void }) {
  const [investOpen, setInvestOpen] = useState(false);
  const reveal = useScrollReveal<HTMLDivElement>();
  return (
    <section id="goals" className="hub-section">
      <div className="container" ref={reveal}>
        <span className="hub-eyebrow hub-eyebrow-dark">Your goal. Your starting point.</span>
        <h2 className="hub-h2">What are you looking to do?</h2>
        <p className="hub-lead">You don&apos;t need to know the loan product to get started.</p>

        <div className="hub-goals">
          {GOALS.map((g) => (
            <a key={g.href} href={g.href} className="hub-goal"><GoalCard {...g} /></a>
          ))}
          <button type="button" className="hub-goal" onClick={() => setInvestOpen(true)}>
            <GoalCard name="Invest in Property" desc="Run a property scenario or plan your next move." icon={ICONS.building} />
          </button>
          <a href={BUY.href} className="hub-goal"><GoalCard {...BUY} /></a>
          <button type="button" className="hub-goal hub-unsure" onClick={onOpenContact}>
            <h3>Not sure where to start?</h3>
            <p>Tell Darren what you&apos;re hoping to accomplish.</p>
            <span className="hub-arrow">Let&apos;s talk →</span>
          </button>
        </div>
      </div>
      {investOpen && <InvestChooser onClose={() => setInvestOpen(false)} />}
    </section>
  );
}

// ─── About ────────────────────────────────────────────────────────────────────

export function HomeAbout() {
  const reveal = useScrollReveal<HTMLDivElement>();
  return (
    <section id="about" className="hub-section hub-about-wrap">
      <div className="container hub-about" ref={reveal}>
        <img src="/darren-240.webp" srcSet="/darren-240.webp 240w, /darren-320.webp 320w"
          sizes="240px" width={240} height={240} alt="Darren Tsai" loading="lazy" decoding="async" />
        <div>
          <span className="hub-eyebrow hub-eyebrow-dark">About Me</span>
          <h2 className="hub-h2">I&apos;m Darren Tsai.</h2>
          <p className="hub-about-title">Senior Loan Officer · {COMPANY}<br />California Real Estate Broker &amp; Investor</p>
          <p>
            I help homeowners and investors make sure their current mortgage structure still makes sense.
            No pushy sales tactics, just straight talk about your options and the data to back it up.
          </p>
          <p>
            I&apos;m an investor myself. Whether you&apos;re looking at a rental property, your home equity
            or a new mortgage, I start with the numbers and help you understand the tradeoffs.
          </p>
          <p className="hub-licenses">NMLS #{NMLS} · CA DRE Broker #{DRE}<br />Licensed in {STATES}</p>
          <button type="button" className="btn btn-teal" onClick={() => openCalendly()}>Talk to Darren</button>
        </div>
      </div>
    </section>
  );
}

// ─── Tools and education ──────────────────────────────────────────────────────

const TOOLS = [
  { name: 'Mortgage Calculator', desc: 'Estimate payments, interest and payoff.', href: '/mortgage-calculator/' },
  { name: 'DSCR Calculator', desc: 'Check the numbers on an investment property.', href: '/dscr/' },
  { name: 'FHA Calculator', desc: 'Explore an estimated FHA mortgage payment.', href: '/fha/' },
];

export function HomeTools() {
  const reveal = useScrollReveal<HTMLDivElement>();
  return (
    <section id="tools" className="hub-section">
      <div className="container" ref={reveal}>
        <span className="hub-eyebrow hub-eyebrow-dark">Calculators &amp; Tools</span>
        <h2 className="hub-h2">Get a clearer picture.</h2>
        <div className="hub-tools">
          {TOOLS.map((t) => (
            <a key={t.href} href={t.href} className="hub-tool">
              <h3>{t.name}</h3>
              <p>{t.desc}</p>
              <span className="hub-arrow">Run the numbers →</span>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}

export function HomeEducation() {
  const reveal = useScrollReveal<HTMLDivElement>();
  return (
    <section className="hub-section">
      <div className="container hub-education" ref={reveal}>
        <div>
          <span className="hub-eyebrow hub-eyebrow-dark">Education &amp; Resources</span>
          <h2 className="hub-h2">A little understanding goes a long way.</h2>
          <p>Explore real estate investing, mortgage fundamentals and the questions worth asking.</p>
          <a href="/realestateinvesting/" className="hub-link">Explore resources →</a>
        </div>
        <aside>
          <h3>Prefer to talk it through?</h3>
          <p>Bring your questions. Darren can help you understand the numbers and decide what to explore next.</p>
          <button type="button" className="btn btn-accent" onClick={() => openCalendly()}>Book a Call</button>
        </aside>
      </div>
    </section>
  );
}
