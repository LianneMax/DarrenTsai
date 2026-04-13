import { useMemo, useState } from 'react';
import type { MortgageInputs } from './types/mortgage';
import { calculateMortgage } from './utils/mortgageCalc';
import Nav from './components/Nav';
import Hero from './components/Hero';
import Calculator from './components/Calculator';
import Education from './components/Education';
import LeadForm from './components/LeadForm';
import Newsletter from './components/Newsletter';
import Footer from './components/Footer';

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

export default function App() {
  const [inputs, setInputs] = useState<MortgageInputs>(defaultInputs);
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
