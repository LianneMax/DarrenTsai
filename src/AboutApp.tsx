import { useEffect } from 'react';
import Nav from './components/Nav';
import { useBookingEntry } from './hooks/useBookingEntry';
import Footer from './components/Footer';
import Reviews from './components/Education';
import { AboutHero, AboutApproach, MarketingClosing } from './components/Marketing';

export default function AboutApp() {
  const contact = useBookingEntry();
  useEffect(() => {
    const early = (window as { __dtEarlyClick?: { take: () => string | null } }).__dtEarlyClick;
    const key = early?.take();
    if (key) document.querySelector<HTMLElement>('[data-early="' + CSS.escape(key) + '"]')?.click();
  }, []);
  return <><Nav alwaysSolid onOpenContact={contact} /><main><AboutHero /><AboutApproach /><Reviews /><MarketingClosing about onOpenContact={contact} /></main><Footer /></>;
}
