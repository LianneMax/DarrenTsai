import { useEffect, useState } from 'react';
import type { MortgageInputs } from './types/mortgage';
import { loadInputs } from './hooks/useMortgageInputs';
import Nav from './components/Nav';
import Hero from './components/Hero';
import DebtSavingsCalculator from './components/DebtSavingsCalculator';
import Education from './components/Education';
import ContactModal from './components/ContactModal';
import Footer from './components/Footer';

export default function App() {
  // The homepage carries a single CTA now: debt consolidation. The amortization
  // calculator moved to /mortgage-calculator/. The contact modal still prefills
  // its loan fields, so the stored inputs are read once here (read-only: only
  // the calculator page writes them).
  const [inputs] = useState<MortgageInputs>(loadInputs);
  const [contactOpen, setContactOpen] = useState(false);

  // Prevent body scroll when modal is open
  useEffect(() => {
    document.body.style.overflow = contactOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [contactOpen]);

  const openContact  = () => setContactOpen(true);
  const closeContact = () => setContactOpen(false);

  return (
    <>
      <Nav onOpenContact={openContact} />
      <Hero onOpenContact={openContact} />
      <DebtSavingsCalculator />
      <Education />
      <Footer />

      {contactOpen && <ContactModal currentInputs={inputs} onClose={closeContact} />}
    </>
  );
}
