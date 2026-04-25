import { NMLS, DRE, COMPANY } from '../config';

interface Props {
  onOpenContact: () => void;
}

export default function Hero({ onOpenContact }: Props) {
  const scrollToSavings = (e: React.MouseEvent<HTMLAnchorElement | HTMLButtonElement>) => {
    e.preventDefault();
    document.getElementById('savings')?.scrollIntoView({ behavior: 'smooth' });
  };

  const scrollToReviews = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    document.getElementById('reviews')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <section className="hero">
      <div className="hero-inner container">

        {/* ── Left column ── */}
        <div className="hero-copy">

          <h1 className="hero-headline hero-anim hero-anim-2">
            Most mortgages cost you money.
            Yours should build{' '}
            <em className="hero-headline-accent">wealth</em>.
          </h1>

          <p className="hero-sub hero-anim hero-anim-3">
            I help homeowners and investors make sure their current mortgage
            structure still makes sense. No pushy sales tactics —
            just straight talk about your options and the data to back it up.
          </p>

          <div className="hero-ctas hero-anim hero-anim-4">
            <a href="#reviews" onClick={scrollToReviews} className="hero-text-link">
              See what clients are saying
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </a>
          </div>

          <div className="hero-divider hero-anim hero-anim-5" />

          <div className="hero-credentials hero-anim hero-anim-5">
            <span>NMLS# {NMLS}</span>
            <span className="hero-cred-dot" aria-hidden="true" />
            <span>CA DRE Broker License #{DRE}</span>
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
        <div>
          <div className="hero-card hero-anim hero-anim-card">
            <p className="hero-card-eyebrow">Estimated tool-calculated savings</p>

            <div className="hero-stat">
              <div className="hero-stat-value">
                <span className="hero-stat-num">$1,500 – $3,000</span>
                <span className="hero-stat-range">/mo</span>
              </div>
              <span style={{ fontSize: '0.72rem', color: '#9ca3af', marginTop: 6, display: 'block', lineHeight: 1.5 }}>
                Based on consolidating $75,000–$150,000 in high-interest debt. Individual results will vary.
              </span>
            </div>

            <div className="hero-stat-divider" />

            <button onClick={scrollToSavings} className="btn btn-rose btn-full hero-card-btn">
              See How Much You Could Save
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>

            <div style={{ textAlign: 'center', marginTop: 10 }}>
              <span style={{ color: '#f59e0b', fontSize: '1.3rem', letterSpacing: 2 }}>★★★★★</span>
              <span style={{ color: 'rgba(255,255,255,0.75)', fontSize: '1rem', marginLeft: 6 }}>5.0</span>
            </div>

            <button
              onClick={(e) => { e.preventDefault(); onOpenContact(); }}
              className="btn btn-outline btn-full"
              style={{ marginTop: 10, padding: '11px 14px', fontSize: '0.9rem', borderRadius: 10 }}
            >
              Request a Private Debt Analysis
            </button>
          </div>

          {/* NMLS disclaimer below card */}
          <p style={{
            fontSize: '0.72rem', color: 'rgba(255,255,255,0.38)', marginTop: 12,
            lineHeight: 1.7, textAlign: 'center', maxWidth: 360, margin: '12px auto 0',
          }}>
            * Results vary. Actual savings depend on credit profile, property value, and loan terms.
            Not a commitment to lend. NMLS# {NMLS} · Equal Housing Opportunity.
          </p>
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
