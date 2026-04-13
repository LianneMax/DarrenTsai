import { useState } from 'react';
import { GOOGLE_SHEET_WEBHOOK_URL } from '../config';
import { useScrollReveal } from '../hooks/useScrollReveal';

export default function Newsletter() {
  const ref = useScrollReveal<HTMLDivElement>();
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;

    setStatus('loading');

    try {
      if (!GOOGLE_SHEET_WEBHOOK_URL) {
        await new Promise((r) => setTimeout(r, 600));
        setStatus('success');
        return;
      }

      // Google Apps Script requires no-cors — response will be opaque but data is written
      await fetch(GOOGLE_SHEET_WEBHOOK_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({
          email: email.trim(),
          source: 'newsletter',
          timestamp: new Date().toISOString(),
        }),
      });

      setStatus('success');
    } catch {
      setStatus('error');
    }
  };

  const benefits = [
    'Mortgage rate alerts when it actually matters',
    'Real estate investing tips from someone doing it',
    'Deal of the Week — off-market & discounted properties',
    'Plain-English market updates',
  ];

  return (
    <section id="newsletter" className="section section-light">
      <div className="container">
        <div ref={ref} className="newsletter-card reveal">
          <span className="section-eyebrow newsletter-eyebrow">COMING SOON</span>
          <h2 className="newsletter-title">Market Insights. Straight Talk. No Spam.</h2>
          <p className="newsletter-body">
            Darren's newsletter is coming soon. Be first on the list for mortgage rate alerts,
            investing tips from a practicing investor, and off-market deal flow.
          </p>

          <ul className="benefit-list">
            {benefits.map((b) => (
              <li key={b} className="benefit-item">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M20 6L9 17l-5-5" stroke="var(--teal)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                {b}
              </li>
            ))}
          </ul>

          {status === 'success' ? (
            <div className="newsletter-success">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M20 6L9 17l-5-5" stroke="#2ecc71" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              You're on the list!
            </div>
          ) : (
            <form className="newsletter-form" onSubmit={handleSubmit}>
              <input
                type="email"
                className="form-input newsletter-input"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                aria-label="Email address for newsletter"
              />
              <button
                type="submit"
                className="btn btn-rose"
                disabled={status === 'loading'}
              >
                {status === 'loading' ? (
                  <span className="btn-spinner" aria-hidden="true" />
                ) : (
                  <>
                    Notify Me
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </>
                )}
              </button>
            </form>
          )}

          {status === 'error' && (
            <p className="newsletter-error">Something went wrong. Please try again.</p>
          )}

          <p className="newsletter-disclaimer">No spam, ever. Unsubscribe any time.</p>
        </div>
      </div>
    </section>
  );
}
