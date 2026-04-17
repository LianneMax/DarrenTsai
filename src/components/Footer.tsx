import { PHONE, EMAIL, NMLS, DRE, COMPANY } from '../config';

export default function Footer() {
  return (
    <footer className="footer">
      <div className="footer-dots" aria-hidden="true" />
      <div className="container">
        <div className="footer-grid">
          <div className="footer-left">
            <div className="footer-brand">
              <img
                src="/darren.jpg"
                alt="Darren Tsai"
                style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
              />
              <span className="footer-name">Darren Tsai</span>
            </div>
            <p className="footer-title">Senior Loan Officer · {COMPANY}</p>
            <p className="footer-meta">NMLS# {NMLS} · DRE# {DRE}</p>
            <p className="footer-meta">Licensed in <strong>AZ · CA · FL · HI · OR · PA · TN · TX</strong></p>
          </div>

          <div className="footer-right">
            <a href={`tel:${PHONE.replace(/\D/g, '')}`} className="footer-contact-link">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.8 19.79 19.79 0 01.07 1.18 2 2 0 012.07 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              {PHONE}
            </a>
            <a href={`mailto:${EMAIL}`} className="footer-contact-link">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <polyline points="22,6 12,13 2,6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              {EMAIL}
            </a>
            <a
              href="https://www.linkedin.com/in/soldwithtsai/"
              className="footer-contact-link footer-linkedin"
              aria-label="Darren Tsai on LinkedIn"
              target="_blank"
              rel="noopener noreferrer"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M16 8a6 6 0 016 6v7h-4v-7a2 2 0 00-2-2 2 2 0 00-2 2v7h-4v-7a6 6 0 016-6zM2 9h4v12H2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <circle cx="4" cy="4" r="2" stroke="currentColor" strokeWidth="2"/>
              </svg>
              LinkedIn
            </a>
          </div>
        </div>

        <div className="footer-bottom">
          <p className="footer-copy">&copy; 2026 Darren Tsai. All rights reserved.</p>
          <p className="footer-disclaimer">
            This website is for informational purposes only and does not constitute a commitment
            to lend. All loans subject to credit approval, underwriting, and property valuation.
            Equal Housing Opportunity.
          </p>
          <div className="footer-compliance">
            <a href="https://www.saxtonmortgage.com/privacy-policy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>
            <span aria-hidden="true">·</span>
            <a href="https://www.saxtonmortgage.com/legal" target="_blank" rel="noopener noreferrer">Legal</a>
            <span aria-hidden="true">·</span>
            <a href="https://www.saxtonmortgage.com/terms-of-use" target="_blank" rel="noopener noreferrer">Terms of Use</a>
            <span aria-hidden="true">·</span>
            <a href="https://www.saxtonmortgage.com/accessibility-statement" target="_blank" rel="noopener noreferrer">Accessibility</a>
            <span aria-hidden="true">·</span>
            <a href="https://www.saxtonmortgage.com/site-map" target="_blank" rel="noopener noreferrer">Site Map</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
