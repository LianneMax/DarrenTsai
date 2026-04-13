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
        <span className="nav-logo">
          <div className="nav-avatar">
            <img
              src="/darren.jpg"
              alt="Darren Tsai"
              className="nav-avatar-img"
              onError={(e) => {
                // Fallback initials if photo not uploaded yet
                (e.currentTarget as HTMLImageElement).style.display = 'none';
                const next = e.currentTarget.nextElementSibling as HTMLElement | null;
                if (next) next.style.display = 'flex';
              }}
            />
            <span className="nav-avatar-fallback" aria-hidden="true">DT</span>
          </div>
          Darren Tsai
        </span>
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
