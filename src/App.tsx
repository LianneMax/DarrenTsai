import { useEffect, useMemo, useState } from 'react';
import type { MortgageInputs } from './types/mortgage';
import { calculateMortgage } from './utils/mortgageCalc';
import Nav from './components/Nav';
import Hero from './components/Hero';
import DebtSavingsCalculator from './components/DebtSavingsCalculator';
import Calculator from './components/Calculator';
import Education from './components/Education';
import LeadForm from './components/LeadForm';
import Footer from './components/Footer';

const SESSION_KEY = 'dt_mortgage_inputs';

const now = new Date();
const currentMonth = now.getMonth() + 1;
const currentYear = now.getFullYear();

const defaultInputs: MortgageInputs = {
  loanAmount: 330000,
  termYears: 30,
  annualRate: 6.41,
  startMonth: currentMonth,
  startYear: currentYear,
};

function loadInputs(): MortgageInputs {
  try {
    const stored = sessionStorage.getItem(SESSION_KEY);
    if (stored) return { ...defaultInputs, ...JSON.parse(stored) };
  } catch {
    // ignore
  }
  return defaultInputs;
}

export default function App() {
  const [inputs, setInputs] = useState<MortgageInputs>(loadInputs);
  const [contactOpen, setContactOpen] = useState(false);

  // Persist inputs to sessionStorage whenever they change
  useEffect(() => {
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(inputs));
    } catch {
      // ignore
    }
  }, [inputs]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    document.body.style.overflow = contactOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [contactOpen]);

  const summary = useMemo(() => calculateMortgage(inputs), [inputs]);

  const openContact  = () => setContactOpen(true);
  const closeContact = () => setContactOpen(false);

  return (
    <>
      <Nav onOpenContact={openContact} />
      <Hero onOpenContact={openContact} />
      <DebtSavingsCalculator />

      <div className="section-divider">
        <span className="section-divider-line" />
        <span className="section-divider-label">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M3 9h18M3 15h18M9 3v18M15 3v18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          Mortgage Calculator
        </span>
        <span className="section-divider-line" />
      </div>

      <Calculator inputs={inputs} setInputs={setInputs} summary={summary} onOpenContact={openContact} />
      <Education />
      <Footer />

      {/* Contact modal */}
      {contactOpen && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
          onClick={closeContact}
        >
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 id="modal-title" className="modal-title">Want Darren to Review Your Numbers?</h2>
              <button className="modal-close" onClick={closeContact} aria-label="Close">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </button>
            </div>
            <div className="modal-body">
              <p className="modal-sub">
                No credit pull. No pressure. Just your real numbers, reviewed by a licensed pro.
              </p>
              <LeadForm currentInputs={inputs} onClose={closeContact} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
