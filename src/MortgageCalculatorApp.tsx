import { useEffect } from 'react';
import Nav from './components/Nav';
import { useBookingEntry } from './hooks/useBookingEntry';
import Calculator from './components/Calculator';
import Footer from './components/Footer';
import { useMortgageInputs } from './hooks/useMortgageInputs';

// Calculator opt-ins retain their own bucket; personal contact uses screened booking.
export default function MortgageCalculatorApp() {
  const { inputs, setInputs, summary } = useMortgageInputs();
  const openContact = useBookingEntry();

  // The same queue used by the other pre-rendered entries. Replaying on the
  // real mounted element preserves booking/contact behavior and tracking.
  useEffect(() => {
    const early = (window as { __dtEarlyClick?: { take: () => string | null } }).__dtEarlyClick;
    const key = early?.take();
    if (!key) return;
    document.querySelector<HTMLElement>(`[data-early="${CSS.escape(key)}"]`)?.click();
  }, []);

  return (
    <>
      <Nav onOpenContact={openContact} alwaysSolid />

      {/* Offsets the fixed nav, which the hero used to do on the homepage. */}
      <div className="page-top-spacer" />

      <main>
        <Calculator inputs={inputs} setInputs={setInputs} summary={summary} onOpenContact={openContact} />
      </main>
      <Footer />


    </>
  );
}
