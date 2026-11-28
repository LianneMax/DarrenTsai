import { useEffect, useRef } from 'react';
import { milestone } from './utils/attribution';
import Nav from './components/Nav';
import { useBookingEntry } from './hooks/useBookingEntry';
import Calculator from './components/Calculator';
import Footer from './components/Footer';
import { useMortgageInputs } from './hooks/useMortgageInputs';

// Calculator opt-ins retain their own bucket; personal contact uses screened booking.
export default function MortgageCalculatorApp() {
  const { inputs, setInputs, summary } = useMortgageInputs();
  const openContact = useBookingEntry();

  // calculator_used (28 Nov 2026, Max): once per visit, the first time the
  // visitor's own change produces a payment, so GA4 can tell use from visits.
  // Inputs restored from earlier in the session do not count until changed.
  const firstInputs = useRef(inputs);
  useEffect(() => {
    if (inputs === firstInputs.current) return;
    if (inputs.loanAmount > 0 && inputs.annualRate > 0) milestone('calculator_used', { form_id: 'mortgage-calculator' });
  }, [inputs]);

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
