/**
 * Guards on the homepage savings calculator, scanned from the real source.
 *
 * WHY THIS FILE IS A TEXT SCAN. There is no React test renderer in this repo and
 * adding one for four assertions would be a heavier change than the fixes are.
 * The properties below are all visible in the source, and each one is a defect
 * the 26 Sep audit found live, so a scan that fails the day someone undoes them
 * is worth more than nothing:
 *
 *  - Items #1 and #13: a calculator that loads with someone else's numbers
 *    already in it submits those numbers. Both test leads that day did exactly
 *    that, and $26,500 of debt that nobody owed reached the Sheet and Darren.
 *  - Item #2: with the examples gone, an untouched tool computes from nothing,
 *    so the steps have to be gated or it shows "$0/mo" beside "Save $670/mo".
 *  - Item #3: three different savings claims on one page. They now come from one
 *    constant, so they cannot drift apart again.
 *  - Item #11: `sending` is state, read from the render already on screen, so two
 *    clicks in one tick both passed it.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8');

const CALC = read('src/components/DebtSavingsCalculator.tsx');
const HERO = read('src/components/Hero.tsx');
const CONFIG = read('src/config.ts');
const DSCR = read('public/dscr/index.html');
const FHA = read('public/fha/index.html');

describe('the calculator does not arrive pre-filled', () => {
  it('starts both debt rows empty', () => {
    const defaults = CALC.slice(
      CALC.indexOf('const [debts, setDebts]'),
      CALC.indexOf('// Home')
    );
    expect(defaults).not.toMatch(/bal:\s*[1-9]/);
    expect(defaults).not.toMatch(/pmt:\s*[1-9]/);
    expect(defaults).not.toMatch(/rate:\s*[1-9]/);
  });

  it('marks every example number as an example', () => {
    // A bare "650000" in grey reads as a value the tool already has. "e.g."
    // is the whole difference between a hint and a claim.
    const placeholders = [...CALC.matchAll(/placeholder="([^"]+)"/g)].map((m) => m[1]);
    const numeric = placeholders.filter((p) => /^[\d.]+$/.test(p));
    expect(numeric).toHaveLength(0);
  });
});

describe('the steps are gated', () => {
  it('refuses to move forward past what has been filled in', () => {
    expect(CALC).toContain('const furthestStep =');
    expect(CALC).toMatch(/if \(n > step && n > furthestStep\)/);
  });

  it('needs a debt with both a balance and a payment', () => {
    expect(CALC).toMatch(/hasDebt\s*=\s*debts\.some\(d => \(d\.bal \|\| 0\) > 0 && \(d\.pmt \|\| 0\) > 0\)/);
  });

  it('needs the home value, balance and payment before the comparison', () => {
    expect(CALC).toMatch(/hasHome\s*=\s*hv > 0 && mb > 0 && mp > 0/);
  });

  it('gates the pill tabs too, not only the Continue buttons', () => {
    // The tabs jump straight to any step and were the easier way past this.
    expect(CALC).toMatch(/onClick=\{\(\) => goStep\(n\)\}/);
  });
});

describe('one savings claim for the whole page', () => {
  it('keeps the number in a single place', () => {
    expect(CONFIG).toContain('export const SAVINGS_RANGE');
  });

  it('leaves no hard-coded range in the hero, the sticky bar or step 4', () => {
    for (const source of [CALC, HERO]) {
      expect(source).not.toMatch(/\$\s?\d[\d,]*\s*[–-]\s*\$\s?\d[\d,]*/);
    }
  });

  it('shows the visitor their own computed figure when there is one', () => {
    expect(CALC).toMatch(/bestSave > 0[\s\S]{0,200}fmt\(bestSave\)/);
  });
});

describe('a double click is one lead', () => {
  it('guards with a ref, written synchronously', () => {
    expect(CALC).toContain('const inFlight = useRef(false)');
    expect(CALC).toContain('if (inFlight.current || sending) return;');
    expect(CALC).toMatch(/inFlight\.current = true;\s*\n\s*setSending\(true\);/);
  });

  it('releases the guard on every failure path', () => {
    // Success replaces the form with the success card, so there is no button
    // left to re-enable and nothing to release.
    expect(CALC).toMatch(/if \(!result\.ok\) \{\s*\n\s*inFlight\.current = false;/);
  });
});

describe('the DSCR calculator does not arrive pre-filled either', () => {
  // Item #13. Three of the five DSCR Sheet rows are the untouched sample.
  it('leaves rent, price, tax and insurance empty', () => {
    for (const id of ['rent', 'price', 'tax', 'insurance']) {
      const tag = DSCR.match(new RegExp(`<input[^>]*id="${id}"[^>]*>`));
      expect(tag, `input#${id} not found`).not.toBeNull();
      expect(tag![0]).not.toMatch(/\bvalue="[\d.]/);
    }
  });

  it('holds the result back until every input the ratio needs is given', () => {
    // R4-1. Tax and insurance are two of the four parts of PITIA, and a blank
    // counted as $0 does not make the ratio approximate, it makes it wrong in
    // the flattering direction: rent 2,000 against price 300,000 alone reads
    // 1.26 "Qualifies", the same property with ordinary tax and insurance
    // reads 0.98 "Below standard", and the 1.26 reached the Sheet, Bonzo and
    // the PDF. HOA stays optional: the field says "if any" and $0 is a real
    // answer.
    expect(DSCR).toContain('const dscrHasInputs = rent > 0 && price > 0 && tax > 0 && insurance > 0;');
    expect(DSCR).toContain('Add the annual property tax and insurance to see your DSCR');
  });

  it('sends nothing from the calculator when the calculator was not used', () => {
    // R3-3. The opt-in sits below the calculator and can be submitted without
    // it. Blank is honest and stays blank the whole way down: addMortgageFields
    // skips empty values, so Bonzo gets no loan_amount or interest_rate.
    for (const field of ['dscr:', 'downPayment:', 'rate:', 'loanAmount:', 'monthlyRent:', 'annualTax:']) {
      const line = DSCR.split(/\r?\n/).find((l) => l.trim().startsWith(field));
      expect(line, `payload field ${field} not found`).toBeDefined();
      expect(line, `${field} is sent unconditionally`).toContain('dscrReady ?');
    }
  });

  it('does not hand the Contact modal a rate nobody chose', () => {
    // R3-1. #outRate shows the starting tier's rate from page load, so the
    // modal opened with Interest Rate reading 7.63% and saved it as the
    // visitor's own answer.
    const prefill = DSCR.slice(
      DSCR.indexOf('window.LF_CONTACT_PREFILL'),
      DSCR.indexOf('window.LF_CONTACT_PREFILL') + 1200,
    );
    expect(prefill).toContain('if (!(rent > 0 && price > 0)) return {};');
  });

  it('sends a blank term, not 30', () => {
    // R3-9. No Contact form on this site asks for a term.
    expect(DSCR).not.toContain('termYears: 30,');
    expect(DSCR).toContain("termYears: '',");
  });
});

/**
 * The FHA page's own calculator.
 *
 * The page has been titled "FHA Mortgage Calculator" since it shipped and the
 * calculator was an .xlsx emailed after an opt-in. Most of this page's traffic
 * comes from YouTube on a phone, where a spreadsheet cannot be opened at all,
 * so the promise in the title was kept for almost nobody, and the success copy
 * promised a "payment breakdown" built from numbers the visitor had never been
 * asked for.
 *
 * Scanned rather than executed: it is inline ES5 in a hand-written page with no
 * build step. What matters most is that its constants and the explainer copy
 * above it cannot drift apart, because the page would then contradict itself in
 * two places a borrower can see at once.
 */
describe('the FHA estimator agrees with the page around it', () => {
  it('exists on the page the title names', () => {
    expect(FHA).toContain('id="fha-calculator"');
    expect(FHA).toContain('FHA PAYMENT ESTIMATOR');
  });

  it('uses the upfront MIP the explainer quotes', () => {
    expect(FHA).toContain('var UFMIP_RATE = 0.0175;');
    expect(FHA).toContain('Upfront MIP is 1.75%');
  });

  it('uses the two annual MIP tiers the explainer quotes', () => {
    expect(FHA).toContain('var MIP_HIGH_LTV = 0.0055;');
    expect(FHA).toContain('var MIP_LOW_LTV = 0.0050;');
    expect(FHA).toContain('annual MIP rises from 0.50% to 0.55%');
  });

  it('charges MIP on the financed balance, like the worked example', () => {
    // $386,650 at 0.50% is $161 a month, which is the figure in the explainer.
    // On the base loan it would be $158, and the page would disagree with
    // itself two sections apart.
    expect(FHA).toContain('var mip = totalLoan * mipRate / 12;');
    expect(FHA).toContain('MIP adds $161');
  });

  it('knows the minimum down payment it advertises', () => {
    expect(FHA).toContain('var MIN_DOWN_PCT = 3.5;');
    expect(FHA).toContain('3.5%');
  });

  it('starts empty and holds the result back', () => {
    for (const id of ['fhaPrice', 'fhaDown', 'fhaRate', 'fhaTax', 'fhaIns', 'fhaHoa']) {
      const tag = FHA.match(new RegExp(`<input[^>]*id="${id}"[^>]*>`));
      expect(tag, `input#${id} not found`).not.toBeNull();
      expect(tag![0]).not.toMatch(/\bvalue="[\d.]/);
      expect(tag![0]).toMatch(/placeholder="e\.g\./);
    }
    expect(FHA).toContain("resultCard.classList.toggle('is-waiting', !ready)");
  });

  it('no longer promises a breakdown of numbers it never asked for', () => {
    expect(FHA).not.toContain('Check your email for your FHA payment breakdown');
  });
});

/**
 * R3-7, R3-8, R4-4, R4-7: the Monthly Reset's preset answers.
 *
 * The empty-debt and empty-home gates already held, but once those were in the
 * rest of the form was answered for the visitor: HELOAN Credit Tier 680+,
 * HELOAN Term 10 Years, Best Time to Call Morning, How Did You Find Me
 * YouTube. All four reached the Sheet as fact, and the savings figure was
 * priced at the best credit band, five points better than the worst.
 */
describe('the Monthly Reset answers nothing on the visitor behalf', () => {
  it('opens every describe-the-person dropdown unchosen', () => {
    expect(CALC).toContain("useState('');");
    for (const decl of [
      'const [heloanTier, setHeloanTier] = useState',
      'const [heloanTerm, setHeloanTerm] = useState',
      'const [bestTime,  setBestTime]  = useState',
      'const [leadSrc,   setLeadSrc]   = useState',
    ]) {
      const line = CALC.split(/\r?\n/).find((l) => l.includes(decl));
      expect(line, `${decl} not found`).toBeDefined();
      expect(line, `${decl} opens pre-answered`).toContain("useState('')");
    }
  });

  it('starts the debt rows with no type', () => {
    // R4-7. Someone with two cards typed into a row labelled "Auto Loan".
    const defaults = CALC.slice(
      CALC.indexOf('const [debts, setDebts]'),
      CALC.indexOf('// Home'),
    );
    expect(defaults).not.toContain("'Credit Card'");
    expect(defaults).not.toContain("'Auto Loan'");
    expect(CALC).toContain("{ id: uid(), type: '', bal: 0, pmt: 0, rate: 0 }");
  });

  it('prices no HELOAN until a tier and a term are chosen', () => {
    expect(CALC).toContain('const heloanPriced = tierRate > 0 && tierYears > 0;');
    expect(CALC).toContain('const heloanPmt   = heloanPriced ? calcPmt(heloanAmt, tierRate, tierYears) : 0;');
    expect(CALC).toContain('Pick your credit range and a term below to price this option.');
  });

  it('sends blank rather than zero for anything not given', () => {
    expect(CALC).toContain("mortgageRate: mr > 0 ? mr : '', mortgageTerm: mt > 0 ? mt : ''");
    expect(CALC).toContain("monthlySavings: bestSave > 0 ? Math.round(bestSave) : ''");
    expect(CALC).toContain("heloanMonthlyPayment: heloanPmt > 0 ? Math.round(heloanPmt) : ''");
    expect(CALC).toContain("heloanMonthlySavings: heloanSave > 0 ? Math.round(heloanSave) : ''");
  });

  it('sends what the HELOAN figures were priced at', () => {
    expect(CALC).toContain('heloanCreditTier: heloanTier, heloanTermYears: heloanTerm');
  });

  it('has no booking shortcut that skips the form', () => {
    // R3-8. Step 4's booking card opened Calendly without submitting, so a
    // visitor who had just entered their debts, home value and mortgage could
    // book a call and never create a Sheet row. Booking lives on the success
    // card, where the lead is already saved.
    const step4 = CALC.slice(CALC.indexOf('{step === 4 && !submitted &&'), CALC.indexOf('{submitted && ('));
    expect(step4).not.toContain('openCalendly');
    expect(step4).not.toContain('Schedule a Free 15-Min Call');
    expect(CALC.slice(CALC.indexOf('{submitted && ('))).toContain('Book a Free Strategy Call');
  });

  it('does not offer a text nobody answers', () => {
    // R4-4. CallRail swaps this number for a pool number, and texts to a pool
    // number land in CallRail's messaging inbox, not on Darren's phone.
    expect(CALC).not.toContain('Call or text');
  });
});
