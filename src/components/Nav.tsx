import { useEffect, useState } from 'react';

const CALENDLY_URL = 'https://calendly.com/realdarrentsai/15min';

function openCalendly(e: React.MouseEvent) {
  e.preventDefault();
  const cal = (window as Window & { Calendly?: { initPopupWidget: (o: { url: string }) => void } }).Calendly;
  if (cal) {
    cal.initPopupWidget({ url: CALENDLY_URL });
  } else {
    window.open(CALENDLY_URL, '_blank', 'noopener,noreferrer');
  }
}

interface Props {
  onOpenContact: () => void;
}

export default function Nav({ onOpenContact }: Props) {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 60);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Close menu on resize back to desktop
  useEffect(() => {
    const handleResize = () => { if (window.innerWidth > 768) setMenuOpen(false); };
    window.addEventListener('resize', handleResize, { passive: true });
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Prevent body scroll when menu is open
  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [menuOpen]);

  const scrollTo = (id: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    setMenuOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleContactClick = (e: React.MouseEvent) => {
    e.preventDefault();
    setMenuOpen(false);
    onOpenContact();
  };

  const handleCalendlyClick = (e: React.MouseEvent) => {
    setMenuOpen(false);
    openCalendly(e);
  };

  return (
    <>
      <nav className={`nav${scrolled ? ' nav-scrolled' : ''}${menuOpen ? ' nav-menu-open' : ''}`}>
        <div className="nav-inner container">

          <a href="#" className="nav-logo" aria-label="Darren Tsai — Home">
            <div className="nav-avatar">
              <img
                src="/darren.jpg"
                alt=""
                className="nav-avatar-img"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = 'none';
                  const fb = e.currentTarget.nextElementSibling as HTMLElement | null;
                  if (fb) fb.style.display = 'flex';
                }}
              />
              <span className="nav-avatar-fallback" aria-hidden="true">DT</span>
            </div>
            <div className="nav-logo-text">
              <span className="nav-logo-name">Darren Tsai</span>
              <span className="nav-logo-title">Senior Loan Officer · Saxton Mortgage</span>
            </div>
          </a>

          {/* Desktop links */}
          <div className="nav-links">
            <a href="#savings"    onClick={scrollTo('savings')}    className="nav-link">Debt Consolidation</a>
            <a href="#calculator" onClick={scrollTo('calculator')} className="nav-link">Calculator</a>
            <a href="#reviews"    onClick={scrollTo('reviews')}    className="nav-link">Reviews</a>
            <button onClick={handleContactClick} className="nav-link" style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 'inherit' }}>Contact</button>
            <button onClick={openCalendly} className="btn btn-rose btn-sm">Book a Call</button>
          </div>

          {/* Hamburger button — mobile only */}
          <button
            className="nav-hamburger"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(o => !o)}
          >
            <span className={`nav-hamburger-bar${menuOpen ? ' open' : ''}`} />
            <span className={`nav-hamburger-bar${menuOpen ? ' open' : ''}`} />
            <span className={`nav-hamburger-bar${menuOpen ? ' open' : ''}`} />
          </button>

        </div>
      </nav>

      {/* Mobile drawer */}
      {menuOpen && (
        <div className="nav-mobile-overlay" onClick={() => setMenuOpen(false)} aria-hidden="true" />
      )}
      <div className={`nav-mobile-menu${menuOpen ? ' nav-mobile-menu--open' : ''}`} aria-hidden={!menuOpen}>
        <a href="#savings"    onClick={scrollTo('savings')}    className="nav-mobile-link">Debt Consolidation</a>
        <a href="#calculator" onClick={scrollTo('calculator')} className="nav-mobile-link">Calculator</a>
        <a href="#reviews"    onClick={scrollTo('reviews')}    className="nav-mobile-link">Reviews</a>
        <button onClick={handleContactClick} className="nav-mobile-link nav-mobile-link--btn">Contact</button>
        <button onClick={handleCalendlyClick} className="btn btn-rose btn-full" style={{ marginTop: 8 }}>Book a Call</button>
      </div>
    </>
  );
}
