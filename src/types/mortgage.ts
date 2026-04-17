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
