import { useEffect, useState } from 'react';
import Nav from './components/Nav';
import Calculator from './components/Calculator';
import ContactModal from './components/ContactModal';
import Footer from './components/Footer';
import { useMortgageInputs } from './hooks/useMortgageInputs';

// The homepage carries one CTA (debt consolidation), so the amortization
// calculator that used to sit below it lives here on its own page instead.
// Same component, same inputs, same contact modal.
export default function MortgageCalculatorApp() {
  const { inputs, setInputs, summary } = useMortgageInputs();
  const [contactOpen, setContactOpen] = useState(false);

  useEffect(() => {
    document.body.style.overflow = contactOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [contactOpen]);

  const openContact = () => setContactOpen(true);
  const closeContact = () => setContactOpen(false);

  return (
    <>
      <Nav onOpenContact={openContact} alwaysSolid />

      {/* Offsets the fixed nav, which the hero used to do on the homepage. */}
      <div className="page-top-spacer" />

      <Calculator inputs={inputs} setInputs={setInputs} summary={summary} onOpenContact={openContact} />
      <Footer />

      {contactOpen && <ContactModal currentInputs={inputs} onClose={closeContact} />}
    </>
  );
}
