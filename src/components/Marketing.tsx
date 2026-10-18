import { useEffect, useState } from 'react';
import { FAQ } from '../data/faq';

export function ArrowIcon() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M7 17 17 7M7 7h10v10" /></svg>; }

/** These are illustrations, never prefilled calculator inputs or lending offers. */
export function HouseOptions({ large = false }: { large?: boolean }) {
  return <div className={`house-options${large ? ' equity-page-illustration' : ''}`}>
    <img className="house-render" src="/house-3d.webp" width="840" height="840" alt="Illustrative home in slate, teal and off-white" decoding="async" />
    <div className="floating-product product-heloc"><strong><i aria-hidden="true" />HELOC</strong><span>Flexible access</span></div>
    <div className="floating-product product-loan"><strong><i aria-hidden="true" />Home equity loan</strong><span>Fixed payment structure</span></div>
    <div className="floating-product product-refinance"><strong><i aria-hidden="true" />Cash-out refinance</strong><span>Replaces your mortgage</span></div>
  </div>;
}

function EquityIllustration() {
  const [share, setShare] = useState(40);
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const y = 268 - 231 * share / 100;
  return <div className="home-diagram">
    <p className="diagram-heading">See your home a little differently.</p>
    <svg viewBox="0 0 480 300" role="img" aria-labelledby="equity-diagram-title equity-diagram-desc">
      <title id="equity-diagram-title">The two parts of your home’s value</title><desc id="equity-diagram-desc">An illustrative mortgage balance and estimated equity. These proportions are not a personal estimate.</desc>
      <defs><clipPath id="home-shape"><path d="M122 125 240 37 358 125V268H122Z" /></clipPath></defs>
      <g clipPath="url(#home-shape)"><path fill="#8fd8ea" d="M100 25H380V270H100Z" /><rect fill="#466a7a" x="100" y={y} width="280" height={270 - y} /></g>
      <path d="M96 144 240 37 384 144M122 125V268H358V125" fill="none" stroke="#223d55" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <path d={`M122 ${y}H358`} stroke="#fff" strokeWidth="2" strokeDasharray="4 5" />
    </svg>
    <div className="diagram-legend"><span><i className="mortgage-key" />Mortgage balance</span><span><i className="equity-key" />Estimated equity</span></div>
    <div className="diagram-control"><label htmlFor="equity-explorer">Explore the balance <output htmlFor="equity-explorer">{share}% mortgage</output></label>
      <input id="equity-explorer" type="range" min="10" max="90" value={share} disabled={!ready} onChange={e => setShare(Number(e.target.value))} aria-describedby="diagram-note" aria-valuetext={`${share}% illustrative mortgage share, ${100 - share}% estimated equity share`} />
      <p id="diagram-note">Illustration only. Your inputs determine your estimate.</p></div>
    <div className="equity-equation"><span>Home value</span><span aria-hidden="true">−</span><span>Mortgage balance</span><span aria-hidden="true">=</span><strong>Estimated equity</strong></div>
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
      <div className="other-goals" id="tools"><span>Something else in mind?</span><a href="/home-equity/?goal=payoff">Pay off high-interest debt</a><a href="/adu/">Renovate or build an ADU</a><a href="/mortgage-calculator/">Estimate a mortgage payment</a><a href="/dscr/">Explore an investment property</a><a href="/fha/">Explore buying a home</a><a href="/realestateinvesting/">Investing guide</a></div>
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
