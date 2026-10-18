import { useEffect } from 'react';
import Nav from './components/Nav';
import { useBookingEntry } from './hooks/useBookingEntry';
import HomeEquityCalculator from './components/HomeEquityCalculator';
import Footer from './components/Footer';
import { MobileActionBar } from './components/PageParts';
import { MarketingOptions, MarketingFaq } from './components/Marketing';

// Calculator opt-ins retain their own bucket; personal contact uses screened booking.
export default function HomeEquityApp() {
  const openContact = useBookingEntry();

  // Replay a click made on the pre-rendered nav before React loaded (queued by
  // the inline script in home-equity/index.html), as App.tsx does for
  // the homepage. take() empties the queue, so StrictMode's second effect run
  // in development replays nothing.
  useEffect(() => {
    const early = (window as { __dtEarlyClick?: { take: () => string | null } }).__dtEarlyClick;
    const key = early?.take();
    if (!key) return;
    document.querySelector<HTMLElement>(`[data-early="${CSS.escape(key)}"]`)?.click();
  }, []);

  return (
    <>
      <Nav onOpenContact={openContact} alwaysSolid />

      {/* Offsets the fixed nav, which the hero does on the homepage. */}
      <div className="page-top-spacer" />

      <main>
        <HomeEquityCalculator />
        <MarketingOptions />
        <MarketingFaq onOpenContact={openContact} />
      </main>
      <Footer />
      <MobileActionBar target="equity" label={<><span className="hv-equity">Check My Home Equity</span><span className="hv-payoff">See My Comparison</span></>} />


    </>
  );
}
