import { useEffect } from 'react';
import Nav from './components/Nav';
import { useBookingEntry } from './hooks/useBookingEntry';
import AduCalculator from './components/AduCalculator';
import Footer from './components/Footer';
import { MobileActionBar } from './components/PageParts';

// Calculator opt-ins retain their own bucket; personal contact uses screened booking.
export default function AduApp() {
  const openContact = useBookingEntry();

  // Replay a click made on the pre-rendered nav before React loaded (queued by
  // the inline script in adu/index.html), as App.tsx does for
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
        <AduCalculator />
      </main>
      <Footer />
      <MobileActionBar target="project" label="Explore My Project" />


    </>
  );
}
