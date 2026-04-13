import type { MortgageInputs, MortgageSummary, MonthlyRow, YearlySummary } from '../types/mortgage';
import { formatDate } from './formatters';

export function getPayoffDate(startMonth: number, startYear: number, termYears: number): string {
  const totalMonths = termYears * 12;
  const payoffDate = new Date(startYear, startMonth - 1 + totalMonths, 1);
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

  // Build yearly summaries
  const yearlyData: YearlySummary[] = [];
  for (let y = 0; y < termYears; y++) {
    const yearRows = schedule.slice(y * 12, (y + 1) * 12);
    const totalPayment = yearRows.reduce((sum, row) => sum + row.payment, 0);
    const totalPrincipal = yearRows.reduce((sum, row) => sum + row.principal, 0);
    const totalInterest = yearRows.reduce((sum, row) => sum + row.interest, 0);
    const endingBalance = yearRows[yearRows.length - 1]?.balance ?? 0;

    yearlyData.push({
      year: startYear + y,
      totalPayment,
      totalPrincipal,
      totalInterest,
      endingBalance,
    });
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
