import { useEffect, useMemo, useState } from 'react';
import type { MortgageInputs } from '../types/mortgage';
import { calculateMortgage } from '../utils/mortgageCalc';
import { useDebounced } from './useDebounced';

// The calculator lives on /mortgage-calculator/ now, but the contact modal on
// the homepage still prefills its loan fields from whatever was last entered,
// so the stored inputs are shared between the two entry points and the storage
// key has to stay exactly what it was.
const SESSION_KEY = 'dt_mortgage_inputs';

const now = new Date();

export const defaultInputs: MortgageInputs = {
  loanAmount: 330000,
  termYears: 30,
  annualRate: 6.41,
  startMonth: now.getMonth() + 1,
  startYear: now.getFullYear(),
};

export function loadInputs(): MortgageInputs {
  try {
    const stored = sessionStorage.getItem(SESSION_KEY);
    if (stored) return { ...defaultInputs, ...JSON.parse(stored) };
  } catch {
    // ignore
  }
  return defaultInputs;
}

export function useMortgageInputs() {
  const [inputs, setInputs] = useState<MortgageInputs>(loadInputs);

  // Persisting was a synchronous JSON.stringify + sessionStorage write on the
  // main thread on EVERY keystroke, which showed up directly in the Poor INP
  // number. Nothing needs it written that eagerly, so it waits for a pause in
  // typing and yields to idle time when the browser offers it.
  useEffect(() => {
    const persist = () => {
      try {
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(inputs));
      } catch {
        // ignore
      }
    };
    const idle = (window as Window & { requestIdleCallback?: (cb: () => void) => number })
      .requestIdleCallback;
    const timer = window.setTimeout(() => (idle ? idle(persist) : persist()), 400);
    return () => window.clearTimeout(timer);
  }, [inputs]);

  // The full 360-row amortization schedule is rebuilt whenever inputs change,
  // and rendering it re-renders up to 390 table rows. Recomputing on the raw
  // keystroke made every character a long task; a short debounce keeps typing
  // responsive while still feeling instant.
  const debouncedInputs = useDebounced(inputs, 180);
  const summary = useMemo(() => calculateMortgage(debouncedInputs), [debouncedInputs]);

  return { inputs, setInputs, summary };
}
