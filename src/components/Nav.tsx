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

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 60);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollTo = (id: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <nav className={`nav${scrolled ? ' nav-scrolled' : ''}`}>
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
            <span className="nav-logo-title">Mortgage &amp; Real Estate Broker</span>
          </div>
        </a>

        <div className="nav-links">
          <a href="#savings"    onClick={scrollTo('savings')}    className="nav-link">Debt Consolidation</a>
          <a href="#calculator" onClick={scrollTo('calculator')} className="nav-link">Calculator</a>
          <a href="#reviews"    onClick={scrollTo('reviews')}    className="nav-link">Reviews</a>
          <button onClick={(e) => { e.preventDefault(); onOpenContact(); }} className="nav-link" style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 'inherit' }}>Contact</button>
          <button onClick={openCalendly} className="btn btn-rose btn-sm">Book a Call</button>
        </div>

      </div>
    </nav>
  );
}
