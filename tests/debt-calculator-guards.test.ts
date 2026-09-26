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

  it('holds the result back until rent and price are given', () => {
    expect(DSCR).toContain('dscrHasInputs');
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
