import { useEffect, useRef, useState } from 'react';

import { openCalendly as openCalendlyPopup } from '../utils/calendly';

// Was a third local copy of this helper. It bypassed the shared one, so it kept
// assuming the widget had been eagerly loaded in <head>.
function openCalendly(e: React.MouseEvent) {
  e.preventDefault();
  openCalendlyPopup();
}

interface Props {
  onOpenContact: () => void;
  // The nav is white-on-transparent so it can sit over the homepage hero.
  // Pages that open on a light background (e.g. /mortgage-calculator/) would
  // render it invisible until the first scroll, so they pin the solid style on.
  alwaysSolid?: boolean;
  // The ad landing pages (/debt-consolidation/, /home-equity/, /adu/) show
  // only Contact and Book a Call (revamp phase 6, preview v4). A paid visitor
  // who came for one calculator should meet that calculator and the two ways
  // to reach Darren, not five exits to other pages. The logo still goes home.
  landing?: boolean;
}

/**
 * Every calculator, in the order the homepage's goal cards use. One list, so
 * the desktop dropdown and the mobile drawer cannot drift apart (until phase 6
 * neither listed /home-equity/ or /adu/).
 */
const CALCULATORS = [
  { href: '/debt-consolidation/', label: 'Debt Consolidation' },
  { href: '/home-equity/', label: 'Home Equity' },
  { href: '/adu/', label: 'ADU & Renovation' },
  { href: '/mortgage-calculator/', label: 'Mortgage Calculator' },
  { href: '/dscr/', label: 'DSCR' },
  { href: '/fha/', label: 'FHA Calculator' },
];

export default function Nav({ onOpenContact, alwaysSolid = false, landing = false }: Props) {
  // Read the scroll position at mount: on the homepage the nav is pre-rendered,
  // so a visitor may have scrolled before React loads, and the transparent
  // style would otherwise sit over content until the next scroll event. False
  // when rendered at build time (no window), which is the top-of-page style.
  const [scrolled, setScrolled] = useState(() => typeof window !== 'undefined' && window.scrollY > 60);
  const [menuOpen, setMenuOpen] = useState(false);
  const drawerTab = menuOpen ? undefined : -1;
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

  // The same Nav renders on the homepage and on /mortgage-calculator/, where
  // none of the homepage sections exist. When the target is not on this page,
  // hand the browser the real /#id URL instead of swallowing the click.
  const scrollTo = (id: string) => (e: React.MouseEvent) => {
    const target = document.getElementById(id);
    if (!target) {
      setMenuOpen(false);
      return;
    }
    e.preventDefault();
    setMenuOpen(false);
    target.scrollIntoView({ behavior: 'smooth' });
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
      <nav className={`nav${scrolled || alwaysSolid ? ' nav-scrolled' : ''}${menuOpen ? ' nav-menu-open' : ''}`}>
        <div className="nav-inner container">

          <a href="/" className="nav-logo" aria-label="Darren Tsai Home">
            <div className="nav-avatar">
              <img
                src="/darren-avatar.png"
                width={72}
                height={72}
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
            {!landing && <>
            <a href="/#about"      onClick={scrollTo('about')}      className="nav-link" data-early="nav-about">About Me</a>
            <a href="/#reviews"    onClick={scrollTo('reviews')}    className="nav-link" data-early="nav-reviews">Reviews</a>
            <div className={`nav-dropdown${calcOpen ? ' nav-dropdown--open' : ''}`} ref={calcDropdownRef}>
              <button
                type="button"
                onClick={() => setCalcOpen(o => !o)}
                data-early="nav-calc"
                aria-expanded={calcOpen}
                className="nav-link nav-dropdown-trigger"
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 'inherit' }}
              >
                Calculators
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
              <div className="nav-dropdown-menu">
                {CALCULATORS.map((c) => (
                  <a key={c.href} href={c.href} onClick={() => setCalcOpen(false)} className="nav-dropdown-item">{c.label}</a>
                ))}
              </div>
            </div>
            </>}
            <button onClick={handleContactClick} className="nav-link" data-early="nav-contact" style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 'inherit' }}>Contact</button>
            <button onClick={openCalendly} className="btn btn-rose btn-sm" data-early="nav-book">Book a Call</button>
          </div>

          {/* Hamburger button — mobile only */}
          <button
            className="nav-hamburger"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(o => !o)}
            data-early="nav-menu"
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
      {/* The closed drawer is aria-hidden, so its links must also leave the tab
          order (audit L3): otherwise a keyboard user tabs into links a screen
          reader has been told do not exist, and Lighthouse fails the page. */}
      <div className={`nav-mobile-menu${menuOpen ? ' nav-mobile-menu--open' : ''}`} aria-hidden={!menuOpen}>
        {landing ? (
          <a href="/" className="nav-mobile-link" tabIndex={drawerTab}>Home</a>
        ) : <>
          <a href="/#about"      onClick={scrollTo('about')}      className="nav-mobile-link" tabIndex={drawerTab}>About Me</a>
          <a href="/#reviews"    onClick={scrollTo('reviews')}    className="nav-mobile-link" tabIndex={drawerTab}>Reviews</a>
          <span className="nav-mobile-link nav-mobile-label">Calculators</span>
          {CALCULATORS.map((c) => (
            <a key={c.href} href={c.href} className="nav-mobile-link nav-mobile-sublink" tabIndex={drawerTab}>{c.label}</a>
          ))}
        </>}
        <button onClick={handleContactClick} className="nav-mobile-link nav-mobile-link--btn" tabIndex={drawerTab}>Contact</button>
        <button onClick={handleCalendlyClick} className="btn btn-rose btn-full" style={{ marginTop: 8 }} tabIndex={drawerTab}>Book a Call</button>
      </div>
    </>
  );
}
