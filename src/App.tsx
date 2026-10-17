import { useEffect } from 'react';
import Nav from './components/Nav';
import { useBookingEntry } from './hooks/useBookingEntry';
import { HomeHero } from './components/HomeHub';
import { MarketingBenefits, MarketingOptions, MarketingFaq, MarketingClosing } from './components/Marketing';
import Reviews from './components/Education';
import Footer from './components/Footer';

export default function App() {
  const openContact = useBookingEntry();

  // Replay a click made on the pre-rendered nav or hero before React loaded
  // (queued by the inline script in index.html). Clicking the matching live
  // element runs its real handler, so "Book a Call" opens the chooser and is
  // tracked exactly as a normal click. take() empties the queue, so StrictMode's
  // second effect run in development replays nothing.
  useEffect(() => {
    const early = (window as { __dtEarlyClick?: { take: () => string | null } }).__dtEarlyClick;
    const key = early?.take();
    if (!key) return;
    document.querySelector<HTMLElement>(`[data-early="${CSS.escape(key)}"]`)?.click();
  }, []);

  return (
    <>
      <Nav onOpenContact={openContact} />
      {/* One <main> landmark per page (audit L3): screen-reader users jump to it,
          and Lighthouse fails a page without one. Nav and Footer stay outside. */}
      <main>
        <HomeHero />
        <MarketingBenefits onOpenContact={openContact} />
        <MarketingOptions />
        <Reviews />
        <MarketingFaq onOpenContact={openContact} outlined />
        <MarketingClosing />
      </main>
      <Footer />


    </>
  );
}
