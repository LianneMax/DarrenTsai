import { useScrollReveal } from '../hooks/useScrollReveal';

interface CardProps {
  icon: React.ReactNode;
  heading: string;
  body: string;
  delay: number;
}

function EducationCard({ icon, heading, body, delay }: CardProps) {
  const ref = useScrollReveal<HTMLDivElement>(delay);
  return (
    <div ref={ref} className="edu-card reveal">
      <div className="edu-card-icon">{icon}</div>
      <h3 className="edu-card-heading">{heading}</h3>
      <p className="edu-card-body">{body}</p>
    </div>
  );
}

export default function Education() {
  const headerRef = useScrollReveal<HTMLDivElement>();
  const calloutRef = useScrollReveal<HTMLDivElement>(80);

  const scrollToCalc = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    document.getElementById('calculator')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <section id="education" className="section section-white">
      <div className="container">
        <div ref={headerRef} className="section-header reveal">
          <span className="section-eyebrow">WHY IT MATTERS</span>
          <h2 className="section-title">
            Most homeowners don't know what they're actually paying.
          </h2>
          <p className="section-sub">
            Understanding your mortgage structure is the first step to building real wealth.
          </p>
        </div>

        <div className="edu-grid">
          <EducationCard
            delay={0}
            icon={
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" stroke="var(--teal)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <polyline points="17 6 23 6 23 12" stroke="var(--teal)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            }
            heading="A 1% Rate Drop = $72,000 Saved"
            body="On a $400,000 loan over 30 years, a single percentage point difference in your rate saves over $200 per month — and more than $72,000 over the life of the loan. Rate shopping isn't optional. It's essential."
          />
          <EducationCard
            delay={120}
            icon={
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="var(--teal)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <line x1="12" y1="9" x2="12" y2="13" stroke="var(--teal)" strokeWidth="2" strokeLinecap="round"/>
                <line x1="12" y1="17" x2="12.01" y2="17" stroke="var(--teal)" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            }
            heading="The Interest Front-Loading Trap"
            body="In the early years of a 30-year mortgage, over 75% of each payment goes to interest — not equity. You're essentially renting money from the bank. Knowing this changes how you should think about refinancing and extra payments."
          />
          <EducationCard
            delay={240}
            icon={
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" stroke="var(--teal)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            }
            heading="Extra Payments Cut Years Off Your Loan"
            body="Adding just $200/month extra to a $330,000 loan at 6% can cut more than 5 years off your term and save tens of thousands in interest. Small moves, compounded over time, create massive results."
          />
        </div>

        <div ref={calloutRef} className="edu-callout reveal">
          <div className="edu-callout-text">
            <p className="edu-callout-main">
              As a mortgage broker, Darren has access to wholesale lending programs
              that retail banks simply cannot offer.
            </p>
            <p className="edu-callout-sub">
              That means better rates, better terms, and better outcomes for you.
            </p>
          </div>
          <a
            href="#calculator"
            onClick={scrollToCalc}
            className="btn btn-outline"
          >
            See How Much You Could Save
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </a>
        </div>
      </div>
    </section>
  );
}
