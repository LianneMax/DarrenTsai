export interface MortgageInputs {
  loanAmount: number;
  termYears: number;
  annualRate: number;
  startMonth: number;
  startYear: number;
}

export interface MonthlyRow {
  paymentNumber: number;
  date: string;
  payment: number;
  principal: number;
  interest: number;
  balance: number;
  cumulativePrincipal: number;
  cumulativeInterest: number;
}

export interface YearlySummary {
  year: number;
  totalPayment: number;
  totalPrincipal: number;
  totalInterest: number;
  endingBalance: number;
  /**
   * Where this calendar year's payments sit in the schedule.
   *
   * The rows used to be grouped in fixed blocks of twelve from payment one and
   * labelled startYear + n, which is only correct for a loan starting in
   * January. A mortgage starting in September 2026 counted twelve payments into
   * 2026, so every label was a partial year adrift and the last one read 2055
   * while the summary above it said the loan is paid off in September 2056.
   */
  firstPaymentIndex: number;
  paymentCount: number;
}

export interface MortgageSummary {
  monthlyPayment: number;
  totalInterest: number;
  totalCost: number;
  payoffDate: string;
  numberOfPayments: number;
  schedule: MonthlyRow[];
  yearlyData: YearlySummary[];
}

export interface LeadFormData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  loanAmount: number;
  termYears: number;
  annualRate: number;
  message: string;
source: string;
  timestamp: string;
}
