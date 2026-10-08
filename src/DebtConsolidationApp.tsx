import { useEffect, useState } from 'react';
import type { MortgageInputs } from './types/mortgage';
import { loadInputs } from './hooks/useMortgageInputs';
import Nav from './components/Nav';
import DebtSavingsCalculator from './components/DebtSavingsCalculator';
import ContactModal from './components/ContactModal';
import Footer from './components/Footer';

// The debt calculator on a URL of its own (frontend revamp, phase 0, 8 Oct).
//
// WHY THIS PAGE EXISTS BEFORE THE REVAMP DOES. The revamp turns the homepage
// into a goal hub and moves this calculator off it. Google Ads launches first,
// and an ad's final URL cannot follow the tool when it moves: an ad pointed at
// `/` would keep landing on a page that no longer holds what it promised. So the
// debt ads point here from day one, and the later homepage change touches no
// live ad URL. Until then the homepage keeps its own copy of the same component.
//
// Same component, same lead: source 'DebtConsolidation' and form id
// 'debt-savings-calculator', so the Sheet tab, the Bonzo tags and the GA4
// conversion do not fork. `page_path` is what tells the two pages apart.
export default function DebtConsolidationApp() {
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
  // the inline script in debt-consolidation/index.html), as App.tsx does for
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
        <DebtSavingsCalculator standalone />
      </main>
      <Footer />

      {contactOpen && <ContactModal
          currentInputs={inputs}
          onClose={closeContact}
          leadSource="debt-consolidation-contact"
          title="Talk to Darren"
          subtitle="No credit pull. No pressure. Four fields and a licensed loan officer gets back to you."
          formId="debt-consolidation-contact-modal"
          nextStep="In the meantime, the calculator on this page shows your full breakdown."
        />}
    </>
  );
}
