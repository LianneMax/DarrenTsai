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

/** "What would you use your equity for?" Values from design preview v4. */
export const EQUITY_GOALS = [
  'Pay Off Debt',
  'Renovation / ADU',
  'Investment',
  'Major Expense',
  'Something Else',
] as const;

/** "What matters most to you?" Optional. Values from design preview v4. */
export const EQUITY_PREFERENCES = [
  'Flexible access',
  'Predictable payments',
  'Keeping my current mortgage',
  'Lowest monthly payment',
  "I'm not sure",
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
  state: string;
  homeValue: number;
  /** 0 is a real answer (a paid-off home), so the caller passes it through. */
  mortgageBalance: number;
  goal: string;
  /** 0 when skipped. */
  amountExploring: number;
  preference: string;
}

/**
 * The body posted to /api/lead. Every optional answer the visitor skipped is
 * sent as '' and never as 0 or a default, which is the field rule the whole
 * site follows (tests/field-rules.test.tsx): a 0 reads as an answer.
 */
export function buildEquityLead(i: EquityLeadInput) {
  const n = equityNumbers(i.homeValue, i.mortgageBalance, i.amountExploring);
  return {
    firstName: i.firstName, lastName: i.lastName, phone: i.phone, email: i.email,
    state: i.state,
    homeValue: i.homeValue,
    mortgageBalance: i.mortgageBalance,
    estimatedEquity: Math.round(n.equity),
    currentLtv: oneDecimal(n.ltv),
    goal: i.goal,
    amountExploring: i.amountExploring > 0 ? i.amountExploring : '',
    illustrativeCltv: n.cltv > 0 ? oneDecimal(n.cltv) : '',
    preference: i.preference,
    source: 'home-equity',
    timestamp: new Date().toISOString(),
  };
}
