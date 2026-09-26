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
