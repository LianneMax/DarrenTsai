import { useEffect, useState } from 'react';

export default function Nav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 60);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

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
          <a href="#calculator" className="nav-link">Calculator</a>
          <a href="#education" className="nav-link">Education</a>
          <a href="#contact" className="nav-link">Contact</a>
          <a href="#contact" className="btn btn-rose btn-sm">Book a Call</a>
        </div>

      </div>
    </nav>
  );
}
