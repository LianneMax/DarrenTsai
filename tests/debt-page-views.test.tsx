/**
 * The /debt-consolidation/ page view (revamp phase 2), rendered from props.
 *
 * DebtPageViews.tsx draws numbers it is handed and computes none, so each step
 * can be rendered here on its own with the values the calculator would pass,
 * including steps 2 to 4 that sit behind the calculator's gates. What is checked
 * is what the page says about those numbers: that an untouched step shows no
 * figure, that a payment that goes up is said in those words, that an option
 * which cannot be priced says why, and that the confirmation does not claim
 * more than the lead carries.
 */
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import DebtPage, {
  DebtPageHero, StepDebts, StepHome, StepCompare, StepContact, DebtRecap, type DebtPageView,
} from '../src/components/DebtPageViews';
import { savingsText, savingsRowText } from '../src/utils/savingsText';

const noop = () => {};

/** An untouched page: two empty debt rows, nothing typed, nothing chosen. */
function view(over: Partial<DebtPageView> = {}): DebtPageView {
  return {
    step: 1, goStep: noop,
    debts: [{ id: 1, type: '', bal: 0, pmt: 0, rate: 0 }, { id: 2, type: '', bal: 0, pmt: 0, rate: 0 }],
    addDebt: noop, removeDebt: noop, updateDebt: noop,
    totPmt: 0, totBal: 0, wtRate: 0, hasDebt: false,
    homeValue: '', setHomeValue: noop, mtgBalance: '', setMtgBalance: noop,
    mtgPayment: '', setMtgPayment: noop, mtgRate: '', setMtgRate: noop, mtgTerm: '', setMtgTerm: noop,
    hv: 0, mb: 0, mp: 0, mr: 0, mt: 0, hasHome: false,
    rate30: 6.41, todayTotal: 0, newLoan: 0, refiPmt: 0, refiSave: 0,
    sameTermYears: 0, refiSameTermPmt: 0, refiSameTermSave: 0, yearsAdded: 0,
    heloanTier: '', setHeloanTier: noop, heloanTerm: '', setHeloanTerm: noop,
    tierRate: 0, tierYears: 0, heloanPriced: false,
    heloanAmt: 0, heloanPmt: 0, heloanTotal: 0, heloanSave: 0, cltv: 0,
    chosen: '', setChosen: noop,
    fname: '', setFname: noop, lname: '', setLname: noop, phone: '', setPhone: noop,
    email: '', setEmail: noop, emailHint: null, setEmailHint: noop, usState: '', setUsState: noop,
    sending: false, submitted: false, submitLead: noop, openCalendly: noop,
    rateBadge: null, disclosure: null,
    ...over,
  };
}

/** A filled-in borrower: $75,000 of debt, a $650,000 home, $350,000 owed. */
const filled = view({
  step: 3, hasDebt: true, hasHome: true,
  debts: [{ id: 1, type: 'Credit Card', bal: 75000, pmt: 2000, rate: 16.09 }],
  totBal: 75000, totPmt: 2000, wtRate: 16.09,
  homeValue: '650000', mtgBalance: '350000', mtgPayment: '1800',
  hv: 650000, mb: 350000, mp: 1800, todayTotal: 3800,
  newLoan: 425000, refiPmt: 2661, refiSave: 1139,
  heloanAmt: 75000, cltv: 65.4,
});

const html = (el: JSX.Element) => renderToStaticMarkup(el);

describe('the hero', () => {
  it('is the only <h1>, carries no phone number, and queues an early tap', () => {
    const hero = html(<DebtPageHero onAskHeloc={noop} />);
    expect(hero.match(/<h1\b/g)).toHaveLength(1);
    expect(hero).not.toMatch(/tel:/);
    expect(hero).toContain('href="#savings"');
    // Pre-rendered: a button that needs React must be replayable.
    for (const b of hero.match(/<button\b[^>]*>/g) ?? []) expect(b).toContain('data-early=');
  });

  it('gives a HELOC visitor somewhere to go, since this page prices the fixed options', () => {
    expect(html(<DebtPageHero onAskHeloc={noop} />)).toContain('Ask Darren about a HELOC');
  });
});

describe('an untouched page shows no figures', () => {
  it('step 1 shows its totals only once there is a debt row, as the homepage does', () => {
    const page = html(<StepDebts v={view({ debts: [] })} />);
    expect(page).not.toContain('Total Debt Balance');
  });

  it('step 2 draws no equity picture until there is a value and a balance', () => {
    expect(html(<StepHome v={view({ step: 2 })} />)).not.toContain('Estimated Home Equity');
    expect(html(<StepHome v={view({ step: 2, hv: 650000, mb: 350000 })} />)).toContain('Estimated Home Equity');
  });

  it('the HELOAN card asks for a tier and term instead of quoting the best case', () => {
    const page = html(<StepCompare v={filled} />);
    expect(page).toContain('Pick your credit range and a term below');
  });
});

describe('the comparison says what each option does to the payment', () => {
  it('a payment that goes up is said in those words, never as a negative saving', () => {
    const page = html(<StepCompare v={{ ...filled, refiPmt: 3940, refiSave: -140 }} />);
    expect(page).toContain('Payment goes up $140/mo');
    expect(page).not.toMatch(/Save -/);
  });

  it('a HELOAN with no room under 85% CLTV says so, not "pick your credit range"', () => {
    const page = html(<StepCompare v={{
      ...filled, mb: 560000, hv: 650000, heloanAmt: 0,
      heloanTier: '8.99', heloanTerm: '10', tierRate: 8.99, tierYears: 10, heloanPriced: true,
    }} />);
    expect(page).toContain('no room under the 85% combined loan-to-value limit');
    expect(page).not.toContain('Pick your credit range');
    // The note above the cards must not claim every option clears the debt.
    expect(page).toContain('The refinance options pay off all');
    expect(page).not.toContain('Each option pays off the same');
  });

  it('names no best option, and does not discuss the absence of one', () => {
    expect(html(<StepCompare v={filled} />)).not.toMatch(/best option/i);
  });
});

describe('step 4 asks only for contact details', () => {
  it('has no Best Time to Call and no How did you hear (removed 8 Oct)', () => {
    const page = html(<StepContact v={view({ step: 4 })} />);
    expect(page).not.toMatch(/Best Time/i);
    expect(page).not.toMatch(/How did you hear/i);
  });
});

describe('the confirmation', () => {
  const recap = (over: Partial<DebtPageView>) => html(<DebtRecap v={{ ...filled, submitted: true, ...over }} />);

  it('shows total debt, today\'s payment and the chosen option', () => {
    const page = recap({ chosen: 'refi' });
    expect(page).toContain('$75,000');
    expect(page).toContain('$3,800/mo');
    expect(page).toContain('Cash-out refinance');
  });

  it('says the request was received and promises no time', () => {
    const page = recap({});
    expect(page).toContain('Your request has been received.');
    expect(page).toContain('Darren will be in touch.');
    expect(page).not.toMatch(/business day|shortly|has reviewed/i);
  });

  it('shows the option under the visitor\'s summary, without claiming it was sent', () => {
    // `chosen` is not in the lead payload. The page must not say it was.
    const page = recap({ chosen: 'heloan' });
    expect(page).toContain('Your summary');
    expect(page).not.toMatch(/option[^<]*(was|were) sent/i);
  });
});

describe('the page', () => {
  it('replaces the steps with the confirmation once submitted', () => {
    const page = html(<DebtPage v={{ ...filled, submitted: true }} overlays={null} />);
    expect(page).toContain('Your request has been received.');
    expect(page).not.toContain('class="dcp-steps"');
  });

  it('keeps id="savings" on the calculator, which the hero button and goStep scroll to', () => {
    expect(html(<DebtPage v={view()} overlays={null} />)).toContain('id="savings"');
  });
});

describe('the sticky savings bar', () => {
  it('is drawn on the homepage only', () => {
    // It announces the larger saving as "your result", which picks a winner on
    // a page that has no "best option" badge. Dropped there on 9 Oct. A source
    // scan, because the bar only appears once a saving exists, which takes the
    // calculator's state and so a browser.
    const calc = readFileSync(resolve(__dirname, '../src/components/DebtSavingsCalculator.tsx'), 'utf8');
    expect(calc).toContain('{!standalone && bestSave > 0 && (');
  });
});

describe('savingsText', () => {
  it.each([
    [1139.4, 'Save $1,139/mo'],
    [-140.2, 'Payment goes up $140/mo'],
    [0.3, 'No monthly savings'],
    [-0.4, 'No monthly savings'],
  ])('%s reads "%s"', (n, text) => {
    expect(savingsText(n)).toBe(text);
  });

  it('drops the verb in a breakdown row, whose label already says Savings', () => {
    expect(savingsRowText(1139)).toBe('$1,139/mo');
    expect(savingsRowText(-140)).toBe('Payment goes up $140/mo');
  });
});
