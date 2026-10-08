import { useEffect, useState } from 'react';
import type { MortgageInputs } from './types/mortgage';
import { loadInputs } from './hooks/useMortgageInputs';
import Nav from './components/Nav';
import HomeEquityCalculator from './components/HomeEquityCalculator';
import ContactModal from './components/ContactModal';
import Footer from './components/Footer';

// /home-equity/ (frontend revamp, phase 3). The same shell as
// DebtConsolidationApp: the nav, the page, the footer, and the contact modal
// behind the nav's "Contact" button, which posts its own source so a modal lead
// from this page is filed and tagged as home equity rather than as a generic
// contact. The page's own lead is HomeEquityCalculator's, source 'home-equity'.
export default function HomeEquityApp() {
  // The contact modal prefills its loan fields from the mortgage calculator's
  // stored inputs, read once and read-only, exactly as the homepage does.
  const [inputs] = useState<MortgageInputs>(loadInputs);
  const [contactOpen, setContactOpen] = useState(false);

  useEffect(() => {
    document.body.style.overflow = contactOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [contactOpen]);

  const openContact  = () => setContactOpen(true);
  const closeContact = () => setContactOpen(false);

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
      </main>
      <Footer />

      {contactOpen && <ContactModal
          currentInputs={inputs}
          onClose={closeContact}
          leadSource="home-equity-contact"
          title="Talk to Darren"
          subtitle="No credit pull. No pressure. Four fields and a licensed loan officer gets back to you."
          formId="home-equity-contact-modal"
          nextStep="In the meantime, the estimate on this page shows your equity snapshot."
        />}
    </>
  );
}
