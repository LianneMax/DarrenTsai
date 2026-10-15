/**
 * /home-equity/ (revamp phase 3): its choices, its three numbers, and the lead
 * it sends. Pure, so the payload can be tested without rendering a step that
 * sits behind the page's gates.
 *
 * The numbers are the same three the debt calculator already shows, from the
 * same formulas: equity = value - balance, LTV = balance / value, and an
 * illustrative CLTV = (balance + amount) / value. Nothing here prices a loan or
 * says what anyone can borrow. That is a lender's answer, not a calculator's.
 */

/**
 * The three-step page's taps (15 Oct 2026). Values are what the Sheet and
 * HubSpot receive, so a label change here is a data change there.
 */
export const EQUITY_GOALS = [
  'Debt payoff',
  'Home improvement',
  'Business or investment',
  'Other',
] as const;

export const CREDIT_RANGES = ['720+', '600-719', 'Below 600'] as const;

export const CASH_RANGES = ['$25k-75k', '$75k-150k', '$150k+'] as const;

/** Property type, primary/rental and the knockouts share the booking prequal's values. */
export const PROPERTY_TYPES = [
  ['single-family-condo', 'Single family or condo'],
  ['2-4-units', '2 to 4 units'],
  ['mobile-land', 'Mobile home or land'],
] as const;

export const PROPERTY_USES = [
  ['primary', 'Primary home'],
  ['second-home', 'Second home'],
  ['investment', 'Rental'],
] as const;

/**
 * The combined loan-to-value many lenders use as their ceiling for a second
 * loan on a primary home. The debt calculator caps its HELOAN at the same 85%,
 * so the two pages describe the same limit.
 */
export const COMMON_CLTV_LIMIT = 85;

export interface EquityNumbers {
  equity: number;
  ltv: number;
  /** 0 until the visitor gives an amount, because there is nothing to add. */
  cltv: number;
}

export function equityNumbers(homeValue: number, balance: number, amount: number): EquityNumbers {
  if (!(homeValue > 0)) return { equity: 0, ltv: 0, cltv: 0 };
  return {
    equity: homeValue - balance,
    ltv: (balance / homeValue) * 100,
    cltv: amount > 0 ? ((balance + amount) / homeValue) * 100 : 0,
  };
}

const oneDecimal = (n: number) => Math.round(n * 10) / 10;

export interface EquityLeadInput {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  homeValue: number;
  /** 0 is a real answer (a paid-off home), so the caller passes it through. */
  mortgageBalance: number;
  propertyType: string;
  propertyUse: string;
  propertyZip: string;
  propertyState: string;
  goal: string;
  creditRange: string;
  cashRange: string;
  mortgageCurrent: string;
  recentBankruptcyForeclosure: string;
}

/**
 * The body posted to /api/lead. The property state is the Sheet's State too:
 * the page asks for the property's ZIP, not where the visitor lives. Amount
 * Exploring, Illustrative CLTV and Preference are no longer asked and go blank,
 * so the Home Equity tab keeps its columns. The prequal answers ride with it so
 * lead.mts can hold this form to the same rules as the booking prequal.
 */
export function buildEquityLead(i: EquityLeadInput) {
  const n = equityNumbers(i.homeValue, i.mortgageBalance, 0);
  return {
    firstName: i.firstName, lastName: i.lastName, phone: i.phone, email: i.email,
    state: i.propertyState,
    homeValue: i.homeValue,
    mortgageBalance: i.mortgageBalance,
    estimatedEquity: Math.round(n.equity),
    currentLtv: oneDecimal(n.ltv),
    goal: i.goal,
    amountExploring: '',
    illustrativeCltv: '',
    preference: '',
    propertyType: i.propertyType,
    propertyUse: i.propertyUse,
    propertyState: i.propertyState,
    propertyZip: i.propertyZip,
    creditRange: i.creditRange,
    cashRange: i.cashRange,
    mortgageCurrent: i.mortgageCurrent,
    recentBankruptcyForeclosure: i.recentBankruptcyForeclosure,
    source: 'home-equity',
    timestamp: new Date().toISOString(),
  };
}
