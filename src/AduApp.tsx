import { useEffect, useState } from 'react';
import type { MortgageInputs } from './types/mortgage';
import { loadInputs } from './hooks/useMortgageInputs';
import Nav from './components/Nav';
import AduCalculator from './components/AduCalculator';
import ContactModal from './components/ContactModal';
import Footer from './components/Footer';
import { MobileActionBar } from './components/PageParts';

// /adu/ (frontend revamp, phase 5). The same shell as HomeEquityApp: nav, page,
// footer, and a contact modal that posts its own source, 'adu-contact', so a
// modal lead from this page is filed and tagged as ADU rather than as a generic
// contact. The page's own lead is AduCalculator's, source 'adu'.
export default function AduApp() {
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
      <Nav onOpenContact={openContact} alwaysSolid landing />

      {/* Offsets the fixed nav, which the hero does on the homepage. */}
      <div className="page-top-spacer" />

      <main>
        <AduCalculator />
      </main>
      <Footer />
      <MobileActionBar target="project" label="Explore My Project" />

      {contactOpen && <ContactModal
          currentInputs={inputs}
          onClose={closeContact}
          leadSource="adu-contact"
          title="Talk to Darren"
          subtitle="No credit pull. No pressure. Four fields and a licensed loan officer gets back to you."
          formId="adu-contact-modal"
          nextStep="In the meantime, the snapshot on this page connects your budget to a funding plan."
        />}
    </>
  );
}
