import { useEffect, useMemo, useState } from 'react';
import type { MortgageInputs } from './types/mortgage';
import { calculateMortgage } from './utils/mortgageCalc';
import Nav from './components/Nav';
import Hero from './components/Hero';
import Calculator from './components/Calculator';
import Education from './components/Education';
import LeadForm from './components/LeadForm';
import Newsletter from './components/Newsletter';
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

  // Persist inputs to sessionStorage whenever they change
  useEffect(() => {
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(inputs));
    } catch {
      // ignore
    }
  }, [inputs]);

  const summary = useMemo(() => calculateMortgage(inputs), [inputs]);

  return (
    <>
      <Nav />
      <Hero />
      <Calculator inputs={inputs} setInputs={setInputs} summary={summary} />
      <Education />
      <LeadForm currentInputs={inputs} />
      <Newsletter />
      <Footer />
    </>
  );
}
