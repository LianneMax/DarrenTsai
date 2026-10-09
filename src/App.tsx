import { useEffect, useState } from 'react';
import type { MortgageInputs } from './types/mortgage';
import { loadInputs } from './hooks/useMortgageInputs';
import Nav from './components/Nav';
import { HomeHero, HomeGoals, HomeAbout, HomeTools, HomeEducation } from './components/HomeHub';
import Reviews from './components/Education';
import ContactModal from './components/ContactModal';
import Footer from './components/Footer';

export default function App() {
  // The homepage is the goal hub (revamp phase 4): it sends each visitor to the
  // page for their goal and hosts no calculator of its own. The debt calculator
  // lives at /debt-consolidation/, the amortization one at /mortgage-calculator/.
  // The contact modal still prefills its loan fields, so the stored inputs are
  // read once here (read-only: only the calculator page writes them).
  const [inputs] = useState<MortgageInputs>(loadInputs);
  const [contactOpen, setContactOpen] = useState(false);

  // Prevent body scroll when modal is open
  useEffect(() => {
    document.body.style.overflow = contactOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [contactOpen]);

  const openContact  = () => setContactOpen(true);
  const closeContact = () => setContactOpen(false);

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
        <HomeGoals onOpenContact={openContact} />
        <HomeAbout />
        <Reviews />
        <HomeTools />
        <HomeEducation />
      </main>
      <Footer />

      {contactOpen && <ContactModal
          currentInputs={inputs}
          onClose={closeContact}
          leadSource="home-contact"
          title="Talk to Darren"
          subtitle="No credit pull. No pressure. Four fields and a licensed loan officer gets back to you."
          formId="home-contact-modal"
          nextStep="In the meantime, each goal card on this page leads to an estimate of its own."
        />}
    </>
  );
}
