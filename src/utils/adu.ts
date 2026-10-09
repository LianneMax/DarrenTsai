/**
 * /adu/ (revamp phase 5): its choices, its numbers, and the lead it sends.
 * Pure, so the payload can be tested without rendering the page.
 *
 * The numbers are the home-equity page's (equity, LTV, an illustrative CLTV
 * with the amount to finance added), plus one of its own: how much of the
 * project budget the financing leaves uncovered. Nothing here prices a loan,
 * says what anyone can borrow, or says a project can be built.
 */
import { equityNumbers } from './homeEquity';

/** "What are you planning?" Values from design preview v4. */
export const ADU_PURPOSES = ['ADU for family', 'Rental ADU', 'Renovation', 'Other'] as const;

export interface AduNumbers {
  equity: number;
  ltv: number;
  cltv: number;
  /**
   * Project cost minus the amount to finance. Positive: budget the financing
   * does not cover. Negative: financing asked for beyond the stated cost.
   * 0 until both are given.
   */
  gap: number;
}

export function aduNumbers(homeValue: number, balance: number, projectCost: number, toFinance: number): AduNumbers {
  const { equity, ltv, cltv } = equityNumbers(homeValue, balance, toFinance);
  return { equity, ltv, cltv, gap: projectCost > 0 && toFinance > 0 ? projectCost - toFinance : 0 };
}

const oneDecimal = (n: number) => Math.round(n * 10) / 10;

export interface AduLeadInput {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  state: string;
  homeValue: number;
  /** 0 is a real answer (a paid-off home). */
  mortgageBalance: number;
  projectCost: number;
  amountToFinance: number;
  purpose: string;
}

/**
 * The body posted to /api/lead. Column names and order on the Sheet follow
 * docs/lead-sheet-schema.md's ADU row; see the 'adu' schema in
 * google-apps-script.js.
 */
export function buildAduLead(i: AduLeadInput) {
  const n = aduNumbers(i.homeValue, i.mortgageBalance, i.projectCost, i.amountToFinance);
  return {
    firstName: i.firstName, lastName: i.lastName, phone: i.phone, email: i.email,
    state: i.state,
    homeValue: i.homeValue,
    mortgageBalance: i.mortgageBalance,
    estimatedEquity: Math.round(n.equity),
    currentLtv: oneDecimal(n.ltv),
    projectCost: i.projectCost,
    amountToFinance: i.amountToFinance,
    illustrativeCltv: n.cltv > 0 ? oneDecimal(n.cltv) : '',
    projectPurpose: i.purpose,
    source: 'adu',
    timestamp: new Date().toISOString(),
  };
}
