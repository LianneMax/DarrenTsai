import { NMLS, DRE, COMPANY } from '../config';

export default function Hero() {
  const scrollToCalc = (e: React.MouseEvent<HTMLAnchorElement | HTMLButtonElement>) => {
    e.preventDefault();
    document.getElementById('calculator')?.scrollIntoView({ behavior: 'smooth' });
  };

  const scrollToEducation = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    document.getElementById('education')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <section className="hero">
      <div className="hero-inner container">

        {/* ── Left column ── */}
        <div className="hero-copy">

          <span className="hero-tag hero-anim hero-anim-1">
            <span className="hero-tag-dot" aria-hidden="true" />
            Mortgage &amp; Real Estate Broker · Southern California
          </span>

          <h1 className="hero-headline hero-anim hero-anim-2">
            Your mortgage should build{' '}
            <em className="hero-headline-accent">wealth</em>,
            not just house you.
          </h1>

          <p className="hero-sub hero-anim hero-anim-3">
            I help homeowners and investors make sure their current mortgage
            structure still makes sense. No pushy sales tactics —
            just straight talk about your options and the data to back it up.
          </p>

          <div className="hero-ctas hero-anim hero-anim-4">
            <a href="#calculator" onClick={scrollToCalc} className="btn btn-rose btn-lg">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <rect x="2" y="3" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="2"/>
                <path d="M8 21h8M12 17v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              See How Much You Could Save
            </a>
            <a href="#education" onClick={scrollToEducation} className="hero-text-link">
              Learn about Darren
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </a>
          </div>

          <div className="hero-divider hero-anim hero-anim-5" />

          <div className="hero-credentials hero-anim hero-anim-5">
            <span>NMLS# {NMLS}</span>
            <span className="hero-cred-dot" aria-hidden="true" />
            <span>DRE# {DRE}</span>
            <span className="hero-cred-dot" aria-hidden="true" />
            <span>
              Licensed in{' '}
              <strong>AZ · CA · FL · HI · OR · PA · TN · TX</strong>
            </span>
            <span className="hero-cred-dot" aria-hidden="true" />
            <strong>{COMPANY}</strong>
          </div>
        </div>

        {/* ── Right column — Stats card ── */}
        <div className="hero-card hero-anim hero-anim-card">
          <p className="hero-card-eyebrow">What could you save?</p>

          <div className="hero-stat">
            <span className="hero-stat-label">Average client monthly savings</span>
            <div className="hero-stat-value">
              <span className="hero-stat-num">$800</span>
              <span className="hero-stat-range"> – $1,400/mo</span>
            </div>
          </div>

          <div className="hero-stat-divider" />

          <div className="hero-stat">
            <span className="hero-stat-label">Typical HELOAN rate range</span>
            <div className="hero-stat-value">
              <span className="hero-stat-num">8.99</span>
              <span className="hero-stat-range"> – 13.99%</span>
            </div>
          </div>

          <div className="hero-stat-divider" />

          <div className="hero-stat">
            <span className="hero-stat-label">Today's 30YR fixed rate</span>
            <div className="hero-stat-value hero-stat-value-row">
              <span className="hero-stat-num">6.41</span>
              <span className="hero-stat-unit hero-stat-teal">%</span>
            </div>
          </div>

          <button onClick={scrollToCalc} className="btn btn-rose btn-full hero-card-btn">
            Run my <span className="hero-btn-free">FREE</span> Estimate
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      </div>

      <div className="hero-scroll-indicator" aria-hidden="true">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <path d="M6 9l6 6 6-6" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
    </section>
  );
}
