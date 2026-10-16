import { useEffect } from 'react';
import Nav from './components/Nav';
import Footer from './components/Footer';
import Reviews from './components/Education';
import { AboutHero, AboutApproach, MarketingClosing } from './components/Marketing';

export default function AboutApp() {
  // About has no separate lead endpoint: the existing homepage contact flow
  // supplies consent, attribution and the already-routed home-contact source.
  const contact = () => window.location.assign('/?contact=1');
  useEffect(() => {
    const early = (window as { __dtEarlyClick?: { take: () => string | null } }).__dtEarlyClick;
    const key = early?.take();
    if (key) document.querySelector<HTMLElement>('[data-early="' + CSS.escape(key) + '"]')?.click();
  }, []);
  return <><Nav alwaysSolid onOpenContact={contact} /><main><AboutHero /><AboutApproach /><Reviews /><MarketingClosing about onOpenContact={contact} /></main><Footer /></>;
}
