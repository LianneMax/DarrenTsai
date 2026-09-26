import type { MortgageInputs, MortgageSummary, MonthlyRow, YearlySummary } from '../types/mortgage';
import { formatDate } from './formatters';

/**
 * The month the final payment is made.
 *
 * It used to be one month later: startMonth - 1 + totalMonths counts a month
 * past the last payment, because payment one falls in the start month itself.
 * A 30-year loan starting September 2026 has its 360th payment in August 2056,
 * and the card read September 2056.
 */
export function getPayoffDate(startMonth: number, startYear: number, termYears: number): string {
  const lastPaymentOffset = termYears * 12 - 1;
  const payoffDate = new Date(startYear, startMonth - 1 + lastPaymentOffset, 1);
  return payoffDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export function calculateMortgage(inputs: MortgageInputs): MortgageSummary {
  const { loanAmount, termYears, annualRate, startMonth, startYear } = inputs;

  const r = annualRate / 100 / 12;
  const n = termYears * 12;

  let monthlyPayment: number;
  if (r === 0) {
    monthlyPayment = loanAmount / n;
  } else {
    const factor = Math.pow(1 + r, n);
    monthlyPayment = (loanAmount * r * factor) / (factor - 1);
  }

  const schedule: MonthlyRow[] = [];
  let balance = loanAmount;
  let cumulativePrincipal = 0;
  let cumulativeInterest = 0;

  let currentMonth = startMonth;
  let currentYear = startYear;

  for (let i = 1; i <= n; i++) {
    const interest = balance * r;
    let principal = monthlyPayment - interest;
    if (principal > balance) principal = balance;
    balance = Math.max(0, balance - principal);

    cumulativePrincipal += principal;
    cumulativeInterest += interest;

    schedule.push({
      paymentNumber: i,
      date: formatDate(currentMonth, currentYear),
      payment: monthlyPayment,
      principal,
      interest,
      balance,
      cumulativePrincipal,
      cumulativeInterest,
    });

    currentMonth++;
    if (currentMonth > 12) {
      currentMonth = 1;
      currentYear++;
    }
  }

  // Build yearly summaries, by CALENDAR year.
  //
  // They used to be fixed blocks of twelve from payment one, labelled
  // startYear + n. That is only right for a loan starting in January. A loan
  // starting in September 2026 counted twelve payments into "2026", so every
  // row after it was a partial year out of step and the last one read 2055
  // while the payoff date directly above it said September 2056. Anyone
  // checking one against the other found the calculator contradicting itself.
  //
  // The first year now holds only the months left in it, and the last holds
  // whatever remains.
  const yearlyData: YearlySummary[] = [];
  let cursor = 0;
  let year = startYear;
  let monthsLeftInFirstYear = 13 - startMonth;
  while (cursor < schedule.length) {
    const take = Math.min(monthsLeftInFirstYear, schedule.length - cursor);
    const yearRows = schedule.slice(cursor, cursor + take);

    yearlyData.push({
      year,
      totalPayment: yearRows.reduce((sum, row) => sum + row.payment, 0),
      totalPrincipal: yearRows.reduce((sum, row) => sum + row.principal, 0),
      totalInterest: yearRows.reduce((sum, row) => sum + row.interest, 0),
      endingBalance: yearRows[yearRows.length - 1]?.balance ?? 0,
      firstPaymentIndex: cursor,
      paymentCount: take,
    });

    cursor += take;
    year++;
    monthsLeftInFirstYear = 12; // every year after the first is whole
  }

  const totalInterest = schedule.reduce((sum, row) => sum + row.interest, 0);
  const totalCost = loanAmount + totalInterest;
  const payoffDate = getPayoffDate(startMonth, startYear, termYears);

  return {
    monthlyPayment,
    totalInterest,
    totalCost,
    payoffDate,
    numberOfPayments: n,
    schedule,
    yearlyData,
  };
}
