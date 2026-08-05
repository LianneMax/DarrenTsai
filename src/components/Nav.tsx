import { useEffect, useRef, useState } from 'react';

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
  const [calcOpen, setCalcOpen] = useState(false);
  const calcDropdownRef = useRef<HTMLDivElement>(null);

  // Close calculator dropdown on outside click
  useEffect(() => {
    if (!calcOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (calcDropdownRef.current && !calcDropdownRef.current.contains(e.target as Node)) {
        setCalcOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [calcOpen]);

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

          <a href="#" className="nav-logo" aria-label="Darren Tsai Home">
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
            <a href="#savings"    onClick={scrollTo('savings')}    className="nav-link">Monthly Reset</a>
            <div className={`nav-dropdown${calcOpen ? ' nav-dropdown--open' : ''}`} ref={calcDropdownRef}>
              <button
                type="button"
                onClick={() => setCalcOpen(o => !o)}
                aria-expanded={calcOpen}
                className="nav-link nav-dropdown-trigger"
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 'inherit' }}
              >
                Calculator
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
              <div className="nav-dropdown-menu">
                <a href="#savings" onClick={(e) => { scrollTo('savings')(e); setCalcOpen(false); }} className="nav-dropdown-item">Debt Consolidation</a>
                <a href="#calculator" onClick={(e) => { scrollTo('calculator')(e); setCalcOpen(false); }} className="nav-dropdown-item">Mortgage Calculator</a>
                <a href="/dscr/" onClick={() => setCalcOpen(false)} className="nav-dropdown-item">DSCR</a>
                <a href="/fha/" onClick={() => setCalcOpen(false)} className="nav-dropdown-item">FHA Calculator</a>
              </div>
            </div>
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
        <a href="#savings"    onClick={scrollTo('savings')}    className="nav-mobile-link">Monthly Reset</a>
        <a href="#calculator" onClick={scrollTo('calculator')} className="nav-mobile-link">Calculator</a>
        <a href="#savings" onClick={scrollTo('savings')} className="nav-mobile-link nav-mobile-sublink">Debt Consolidation</a>
        <a href="/dscr/" className="nav-mobile-link nav-mobile-sublink">DSCR</a>
        <a href="/fha/" className="nav-mobile-link nav-mobile-sublink">FHA Calculator</a>
        <a href="#reviews"    onClick={scrollTo('reviews')}    className="nav-mobile-link">Reviews</a>
        <button onClick={handleContactClick} className="nav-mobile-link nav-mobile-link--btn">Contact</button>
        <button onClick={handleCalendlyClick} className="btn btn-rose btn-full" style={{ marginTop: 8 }}>Book a Call</button>
      </div>
    </>
  );
}
