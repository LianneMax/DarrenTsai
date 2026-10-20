import { useEffect, useRef, useState } from 'react';
import { FAQ } from '../data/faq';
import EquityPropertyStory from './EquityPropertyStory';
import { GOALS } from './equityGoals';

export function ArrowIcon() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M7 17 17 7M7 7h10v10" /></svg>; }

/** These are illustrations, never prefilled calculator inputs or lending offers. */
export function HouseOptions({ large = false }: { large?: boolean }) {
  if (large) return <EquityPropertyStory />;
  return <div className={`house-options${large ? ' equity-page-illustration' : ''}`}>
    <img className="house-render" src="/house-3d.webp" width="840" height="840" alt="Illustrative home in slate, teal and off-white" decoding="async" />
    <div className="floating-product product-heloc"><strong><i aria-hidden="true" />HELOC</strong><span>Flexible access</span></div>
    <div className="floating-product product-loan"><strong><i aria-hidden="true" />Home equity loan</strong><span>Fixed payment structure</span></div>
    <div className="floating-product product-refinance"><strong><i aria-hidden="true" />Cash-out refinance</strong><span>Replaces your mortgage</span></div>
  </div>;
}

/* Hero geometry, in the SVG's own units (viewBox 480 x 340). The three goal
   columns below are an equal three-column grid, so their centres sit at 1/6,
   1/2 and 5/6 of the width: x = 80, 240 and 400 here. */
const HOUSE_SHAPE = 'M122 125 240 37 358 125V268H122Z';
const ROUTES = ['M240 268V300H80V340', 'M240 268V340', 'M240 268V300H400V340'];
/** The mortgage level drifts between these y values; lower y is a larger mortgage. */
const LEVELS = '170;132;196;150;170';

/**
 * The house is the bar (Max, 20 Oct): its outline is filled with the mortgage
 * from the ground up and equity above it, and the level drifts by itself. The
 * old version drew a photo, a separate bar and a slider, and moved the branch
 * origin with the bar every 100ms while the CSS money animation was mid-flight,
 * so the note left the line it was travelling on. Here every note follows a
 * fixed SVG path (animateMotion), so it cannot leave its line.
 *
 * No slider and no pause button, both removed at Max's request. The motion is
 * decorative and stops itself: offscreen, in a hidden tab, and for anyone who
 * prefers reduced motion (frozen at the starting frame, notes hidden). The
 * hero is pre-rendered, so nothing here depends on state at first paint.
 */
function EquityIllustration() {
  const svg = useRef<SVGSVGElement>(null);
  useEffect(() => {
    const el = svg.current;
    if (!el || typeof el.pauseAnimations !== 'function') return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    let inView = true;
    const sync = () => {
      if (reduced?.matches) { el.pauseAnimations(); el.setCurrentTime(0); return; }
      if (inView && !document.hidden) el.unpauseAnimations(); else el.pauseAnimations();
    };
    const observer = typeof IntersectionObserver === 'undefined' ? null
      : new IntersectionObserver(([entry]) => { inView = entry.isIntersecting; sync(); }, { threshold: 0.1 });
    observer?.observe(el);
    document.addEventListener('visibilitychange', sync);
    reduced?.addEventListener?.('change', sync);
    sync();
    return () => { observer?.disconnect(); document.removeEventListener('visibilitychange', sync); reduced?.removeEventListener?.('change', sync); };
  }, []);
  return <div className="home-diagram">
    <p className="diagram-heading">See your home a little differently.</p>
    <svg ref={svg} className="home-equity-house" viewBox="0 0 480 340" role="img" aria-labelledby="equity-diagram-title equity-diagram-desc">
      <title id="equity-diagram-title">Your home’s value, split into mortgage balance and estimated equity</title>
      <desc id="equity-diagram-desc">An illustrative house filled with a mortgage balance from the ground up and estimated equity above it, with equity branching to renovation, paying off debt and other goals. These proportions are not a personal estimate.</desc>
      <defs><clipPath id="home-shape"><path d={HOUSE_SHAPE} /></clipPath></defs>
      <g clipPath="url(#home-shape)">
        <rect className="home-equity-fill" x="100" y="25" width="280" height="250" />
        <rect className="home-mortgage-fill" x="100" y="170" width="280" height="160"><animate attributeName="y" values={LEVELS} dur="10s" repeatCount="indefinite" calcMode="spline" keySplines=".45 0 .55 1;.45 0 .55 1;.45 0 .55 1;.45 0 .55 1" /></rect>
        <line className="home-level" x1="100" x2="380" y1="170" y2="170"><animate attributeName="y1" values={LEVELS} dur="10s" repeatCount="indefinite" calcMode="spline" keySplines=".45 0 .55 1;.45 0 .55 1;.45 0 .55 1;.45 0 .55 1" /><animate attributeName="y2" values={LEVELS} dur="10s" repeatCount="indefinite" calcMode="spline" keySplines=".45 0 .55 1;.45 0 .55 1;.45 0 .55 1;.45 0 .55 1" /></line>
      </g>
      <g className="home-details"><rect x="222" y="222" width="36" height="46" rx="2" /><rect x="152" y="160" width="44" height="36" rx="2" /><rect x="284" y="160" width="44" height="36" rx="2" /><path d="M174 160v36M152 178h44M306 160v36M284 178h44" /></g>
      <path className="home-outline" d="M96 144 240 37 384 144M122 125V268H358V125" />
      <path className="home-routes" d={ROUTES.join('')} />
      {ROUTES.map((route, i) => <g key={route} className="home-note" opacity="0">
        <g transform="translate(-14 -10.5) scale(.875)"><rect x="2" y="3" width="28" height="18" rx="3" /><circle cx="16" cy="12" r="4" /></g>
        {/* One 12s loop per note, offset 4s apart: travel for the first 2.6s, then rest unseen. */}
        <animateMotion path={route} dur="12s" begin={`${0.6 + i * 4}s`} repeatCount="indefinite" keyPoints="0;1;1" keyTimes="0;.22;1" calcMode="linear" />
        <animate attributeName="opacity" values="0;1;1;0;0" keyTimes="0;.03;.19;.22;1" dur="12s" begin={`${0.6 + i * 4}s`} repeatCount="indefinite" />
      </g>)}
    </svg>
    <ul className="home-goal-row" aria-label="Example goals to discuss with Darren">
      {GOALS.map(goal => <li key={goal.label}><span className="home-goal-emblem"><svg viewBox="0 0 24 24" aria-hidden="true">{goal.icon}</svg></span><span>{goal.label}</span></li>)}
    </ul>
    <div className="diagram-legend"><span><i className="mortgage-key" />Mortgage balance</span><span><i className="equity-key" />Estimated equity</span></div>
    <div className="equity-equation"><span>Home value</span><span aria-hidden="true">−</span><span>Mortgage balance</span><span aria-hidden="true">=</span><strong>Estimated equity</strong></div>
    <p className="diagram-note">Illustration only. Your inputs determine your estimate.</p>
  </div>;
}

export function MarketingHomeHero() {
  return <section className="hero wrap">
    <div className="hero-copy"><h1>Your home.<br />More <em>possibilities.</em></h1><p>Understand your equity. Explore what it could help you do. Take the next step with a clearer picture.</p>
      <div className="hero-actions"><a className="design-primary large" href="/home-equity/">Check my home equity <ArrowIcon /></a><a href="#goals">Explore other goals ↓</a></div>
      <p className="hero-trust">Darren Tsai · NMLS #2438102 · CA DRE #02103705</p></div>
    <div className="hero-visual"><EquityIllustration /><div className="personal-intro" id="about"><img src="/darren-96.webp" width="46" height="46" alt="Darren Tsai" /><div><strong>Real numbers. Personal guidance.</strong><small>Darren Tsai · Senior Loan Officer</small></div><a href="/about/">Meet Darren <ArrowIcon /></a></div></div>
  </section>;
}

function ChevronIcon({ back = false }: { back?: boolean }) {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d={back ? 'M15 6l-6 6 6 6' : 'M9 6l6 6-6 6'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

/**
 * The goal links stay on one line (Max, 20 Oct), so most widths hide the last
 * few past the right edge. Fades and arrow buttons appear only on an edge that
 * really has more, measured from the live scroll position; the first render
 * (and the pre-rendered HTML) has neither, so nothing differs at hydration.
 * The links stay ordinary tab stops, which scroll themselves into view, so the
 * buttons are a pointer convenience rather than the only way to reach a goal.
 */
function OtherGoals() {
  const strip = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState({ left: false, right: false });
  useEffect(() => {
    const el = strip.current;
    if (!el) return;
    const measure = () => {
      const left = el.scrollLeft > 2, right = el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
      setMore(m => m.left === left && m.right === right ? m : { left, right });
    };
    measure();
    el.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    // Web fonts change the links' widths after first paint.
    document.fonts?.ready.then(measure).catch(() => {});
    return () => { el.removeEventListener('scroll', measure); window.removeEventListener('resize', measure); };
  }, []);
  const nudge = (direction: 1 | -1) => {
    const el = strip.current;
    if (!el) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el.scrollBy({ left: direction * el.clientWidth * 0.7, behavior: reduce ? 'auto' : 'smooth' });
  };
  return <div className="other-goals-wrap" data-more-left={more.left || undefined} data-more-right={more.right || undefined}>
    <div className="other-goals" id="tools" ref={strip}><span>Something else in mind?</span><a href="/home-equity/?goal=payoff">Pay off high-interest debt</a><a href="/adu/">Renovate or build an ADU</a><a href="/mortgage-calculator/">Estimate a mortgage payment</a><a href="/dscr/">Explore an investment property</a><a href="/fha/">Explore buying a home</a><a href="/realestateinvesting/">Investing guide</a></div>
    <button type="button" className="other-goals-more other-goals-prev" aria-label="Show earlier goals" aria-controls="tools" onClick={() => nudge(-1)}><ChevronIcon back /></button>
    <button type="button" className="other-goals-more other-goals-next" aria-label="Show more goals" aria-controls="tools" onClick={() => nudge(1)}><ChevronIcon /></button>
  </div>;
}

export function MarketingBenefits({ onOpenContact }: { onOpenContact: () => void }) {
  return <>
    <div className="license-strip">Licensed in <strong>AZ · CA · FL · HI · OR · PA · TN · TX</strong><span>Equal Housing Opportunity</span></div>
    <section className="wrap possibilities" id="goals"><div className="section-intro"><h2>A clearer path forward.</h2><p>You don’t need to know the loan product.<br />Start with what you want to do.</p></div>
      <div className="benefits">
        <article className="action-card"><h3 id="equity-card-title">Understand your equity</h3><p>Bring your home value and mortgage balance together in one simple snapshot.</p>
          <div className="mini equity-demo"><span>Home value</span><div className="placeholder-line" /><div className="equity-track"><i /></div><div className="mini-row"><span>Mortgage balance</span><span>Estimated equity</span></div><small>Illustration · Your inputs determine your estimate</small></div>
          <span className="card-cta">Start with my home <span className="card-arrow"><ArrowIcon /></span></span><a className="card-action" href="/home-equity/" aria-labelledby="equity-card-title"><span className="sr-only">Start with my home</span></a></article>
        <article className="action-card"><h3 id="options-card-title">Explore the tradeoffs</h3><p>Get to know a HELOC, a fixed home equity loan and a cash-out refinance.</p><HouseOptions />
          <span className="card-cta">Compare the options <span className="card-arrow"><ArrowIcon /></span></span><a className="card-action" href="#options" aria-labelledby="options-card-title"><span className="sr-only">Compare the options</span></a></article>
        <article className="action-card"><h3 id="guidance-card-title">Talk it through</h3><p>Put your questions and your numbers in front of a licensed loan officer.</p><div className="mini conversation-demo"><div className="bubble">Which option could fit my plans?</div><div className="advisor"><img src="/darren-96.webp" width="28" height="28" alt="" /><span>Darren Tsai<small>Senior Loan Officer</small></span></div><div className="reply">Let’s start with your goals.</div></div>
          <span className="card-cta">Ask Darren a question <span className="card-arrow"><ArrowIcon /></span></span><button className="card-action" onClick={onOpenContact} aria-labelledby="guidance-card-title"><span className="sr-only">Ask Darren a question</span></button></article>
      </div>
      <OtherGoals />
    </section>
  </>;
}

export function MarketingOptions() {
  return <section className="options-section" id="options"><div className="wrap options-grid"><div><h2>Understand your<br />home equity options.</h2><p>Start with an overview. Open an option when you want a little more detail.</p><a className="design-primary" href="/home-equity/#equity">Find my starting point <ArrowIcon /></a></div><div className="product-list">
    <details open><summary>Home equity line of credit <span>HELOC</span></summary><p>A revolving line secured by your home. Access funds as needed, subject to the lender’s terms. Rates and payments may vary.</p></details>
    <details><summary>Fixed home equity loan</summary><p>A lump sum secured by your home with a fixed rate and scheduled payments. Your existing mortgage remains in place.</p></details>
    <details><summary>Cash-out refinance</summary><p>Replace your existing mortgage with a new, larger loan. Consider the effect on your entire mortgage, closing costs and repayment term.</p></details>
    <details><summary>Home equity investment <span>HEI</span></summary><p>Cash now in exchange for a share of your home’s future value. There is no monthly payment, but it can cost more than a loan over time. Availability varies by state and property.</p></details>
  </div></div></section>;
}

export function MarketingFaq({ onOpenContact, outlined = false, groups = FAQ, promptTitle = 'Have a question about your situation?', promptDescription = 'Talk through your goals and the options you’re considering.' }: { onOpenContact: () => void; outlined?: boolean; groups?: Record<string, string[][]>; promptTitle?: string; promptDescription?: string }) {
  const categories = Object.keys(groups);
  const [category, setCategory] = useState(categories[0]);
  return <section className="wrap faq" id="questions"><div className="section-intro"><h2>Questions, answered.</h2><p>A little understanding makes the next step easier.</p></div><div className="faq-layout">
    <div role="tablist" aria-label="Question categories" className="faq-tabs">{categories.map((name, i) => <button key={name} role="tab" id={`category-${i}`} aria-selected={category === name} aria-controls="faq-answers" tabIndex={category === name ? 0 : -1} onClick={() => setCategory(name)} onKeyDown={e => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) return;
      e.preventDefault(); const n = e.key === 'Home' ? 0 : e.key === 'End' ? categories.length - 1 : (i + (['ArrowRight', 'ArrowDown'].includes(e.key) ? 1 : -1) + categories.length) % categories.length;
      setCategory(categories[n]); document.getElementById(`category-${n}`)?.focus();
    }}>{name}</button>)}</div>
    <div id="faq-answers" role="tabpanel" aria-labelledby={`category-${categories.indexOf(category)}`} tabIndex={0}>{groups[category].map(([q, a]) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}</div>
    </div><div className={`faq-bottom${outlined ? ' faq-bottom-outlined' : ''}`}><div className="faq-prompt"><h3>{promptTitle}</h3><p>{promptDescription}</p></div><button className="design-primary" onClick={onOpenContact}>Book a Call <ArrowIcon /></button></div></section>;
}

export function MarketingClosing({ onOpenContact, about = false }: { onOpenContact?: () => void; about?: boolean }) {
  if(about) return <section className="wrap faq closing-callout-section"><div className="faq-bottom"><div className="faq-prompt"><h3>Let’s put your questions first.</h3><p>Start with a useful estimate or a conversation.</p></div><button className="design-primary" onClick={onOpenContact}>Book a Call <ArrowIcon /></button></div></section>;
  return <section className="closing"><div className="wrap"><h2>{about ? 'Let’s put your questions first.' : 'Start with a clearer picture.'}</h2><p>{about ? 'Start with a useful estimate or a conversation.' : 'Your numbers. Your goals. A next step that makes sense to you.'}</p>{about ? <button className="design-light" onClick={onOpenContact}>Book a Call <ArrowIcon /></button> : <a className="design-light" href="/home-equity/">Explore my home equity <ArrowIcon /></a>}</div></section>;
}

export function AboutHero() {
  return <section className="about-hero wrap"><div className="about-portrait"><img src="/darren-320.webp" srcSet="/darren-240.webp 240w, /darren-320.webp 320w, /darren.jpg 640w" sizes="(max-width: 600px) 320px, 420px" width="480" height="480" alt="Darren Tsai" />
    <div className="portrait-credentials"><div className="portrait-credential"><i aria-hidden="true" /><div><strong>Senior Loan Officer</strong><span>Saxton Mortgage</span></div></div><div className="portrait-credential"><i aria-hidden="true" /><div><strong>California Real Estate</strong><span>Broker &amp; Investor</span></div></div></div></div>
    <div className="about-copy"><h1>I’m Darren Tsai.</h1><p>I help homeowners and investors make sure their current mortgage structure still makes sense. No pushy sales tactics, just straight talk about your options and the data to back it up.</p><p>I&apos;m an investor myself. Whether you&apos;re looking at a rental property, your home equity or a new mortgage, I start with the numbers and help you understand the tradeoffs.</p><div className="about-credentials">NMLS #2438102 · CA DRE Broker #02103705<br />Licensed in AZ · CA · FL · HI · OR · PA · TN · TX</div><div className="hero-actions"><a className="design-primary large" href="/book/">Book a Call <ArrowIcon /></a><a href="/home-equity/">Start with your numbers</a></div></div></section>;
}

export function AboutApproach() {
  const steps = [['Start with the numbers', 'Look at the mortgage you have today and the goal you want to explore.'], ['Understand the tradeoffs', 'Compare the structures, costs and repayment terms that deserve a closer look.'], ['Choose a useful next step', 'Bring your questions to a personal conversation with a licensed loan officer.']];
  return <section className="about-approach"><div className="wrap approach-layout"><div><h2>A conversation that starts with you.</h2><p>Your home, your plans and your current mortgage are the starting point.</p></div><ol className="approach-timeline" aria-label="How a conversation with Darren works">{steps.map(([title, text], i) => <li key={title}><span className="timeline-marker" aria-hidden="true">{i + 1}</span><div><h3>{title}</h3><p>{text}</p></div></li>)}</ol></div></section>;
}
