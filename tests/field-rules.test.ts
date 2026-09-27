/**
 * The field rules from audit.md, enforced across every page at once.
 *
 * WHY THIS FILE EXISTS. The recurring defect on this site is not a bug in one
 * form, it is a habit: a value that looks like the visitor's answer but was set
 * by the page. Example debts. 7.63%. 6.41%. Term 30. The 680+ credit tier.
 * "YouTube". Each was found and fixed on its own, and the next audit found
 * another one somewhere else, because nothing checked the rule itself.
 *
 * So this scans all five pages for the rule rather than the instance:
 *
 *  - a money, rate, percent or year field opens EMPTY with an `e.g.` placeholder
 *  - a dropdown that describes the person opens on "Select…"
 *  - a blank optional number is sent as '' and never as 0 or a default
 *
 * Tool settings the visitor can see (the mortgage calculator's term and start
 * date, the DSCR down-payment slider) may keep a position. They are settings,
 * not claims about the person. What they must not do is travel with a lead
 * unless the tool was actually used.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8');

const PAGES: Array<[string, string]> = [
  ['homepage calculator', 'src/components/DebtSavingsCalculator.tsx'],
  ['mortgage calculator', 'src/components/Calculator.tsx'],
  ['contact modal', 'src/components/LeadForm.tsx'],
  ['/dscr/', 'public/dscr/index.html'],
  ['/fha/', 'public/fha/index.html'],
  ['/realestateinvesting/', 'public/realestateinvesting/index.html'],
];

const SOURCES = PAGES.map(([name, path]) => [name, read(path)] as const);

describe('no numeric field arrives pre-filled', () => {
  it.each(SOURCES)('%s has no bare numeric placeholder', (_name, src) => {
    // `placeholder="650000"` in grey reads as a value the tool already holds.
    // This is how audit item 1 and R3-10 both happened.
    expect(src.match(/placeholder="[0-9][^"]*"/g)).toBeNull();
  });

  it.each(SOURCES)('%s writes thousands with a comma', (_name, src) => {
    // One format everywhere, so a number on one page does not read differently
    // from the same number on another.
    const placeholders = [...src.matchAll(/placeholder="e\.g\. ([0-9,.]+)"/g)].map((m) => m[1]);
    for (const value of placeholders) {
      if (/^\d{4,}$/.test(value.replace(/,/g, '')) && !value.includes('.')) {
        expect(value, `${value} needs a thousands comma`).toMatch(/,/);
      }
    }
  });

  it.each(SOURCES)('%s gives every numeric input a value it did not pick', (_name, src) => {
    // A `value="3600"` on an input is the same defect as a bare placeholder,
    // only harder to see. The DSCR calculator shipped with four of them.
    const withValue = [...src.matchAll(/<input[^>]*type="number"[^>]*>/g)]
      .filter((m) => /\bvalue="[0-9]/.test(m[0]));
    expect(withValue.map((m) => m[0])).toEqual([]);
  });
});

describe('nothing is sent that the visitor did not give', () => {
  const CALC = read('src/components/DebtSavingsCalculator.tsx');
  const LEAD_FORM = read('src/components/LeadForm.tsx');

  it('has no `|| 30` term fallback left anywhere', () => {
    // R3-9. No Contact form on this site asks for a term, and every one of
    // them was writing 30 into the Leads tab as though the visitor had said so.
    for (const [name, src] of SOURCES) {
      expect(src, `${name} still defaults a term`).not.toMatch(/termYears:\s*30\b/);
      expect(src, `${name} still falls back to 30`).not.toMatch(/parseInt\(form\.termYears\)\s*\|\|\s*30/);
    }
  });

  it('sends the term only when the mortgage calculator was used', () => {
    expect(LEAD_FORM).toContain("termYears:  prefillNumbers ? (parseInt(form.termYears) || '') : ''");
  });

  it('sends blank rather than 0 for the optional loan and rate', () => {
    expect(LEAD_FORM).toContain("loanAmount: parseFloat(form.loanAmount.replace(/[^0-9.]/g, '')) || ''");
    expect(LEAD_FORM).toContain("annualRate: parseFloat(form.annualRate) || ''");
  });

  it('sends blank rather than 0 for the optional mortgage rate and term', () => {
    expect(CALC).toContain("mortgageRate: mr > 0 ? mr : '', mortgageTerm: mt > 0 ? mt : ''");
  });
});

describe('the mortgage calculator opens empty', () => {
  const HOOK = read('src/hooks/useMortgageInputs.ts');
  const CALCULATOR = read('src/components/Calculator.tsx');

  it('has no loan amount or rate of its own', () => {
    // R3-10. It opened on a real $330,000 loan at 6.41%, and the Contact modal
    // on that page copies whatever the calculator holds, which is how a real
    // May lead came to be logged at 6.41%.
    const defaults = HOOK.slice(HOOK.indexOf('export const defaultInputs'), HOOK.indexOf('export function loadInputs'));
    expect(defaults).toContain('loanAmount: 0');
    expect(defaults).toContain('annualRate: 0');
  });

  it('keeps the term and start date, which are settings and not answers', () => {
    const defaults = HOOK.slice(HOOK.indexOf('export const defaultInputs'), HOOK.indexOf('export function loadInputs'));
    expect(defaults).toContain('termYears: 30');
    expect(defaults).toContain('startMonth: now.getMonth() + 1');
  });

  it('shows no schedule until there is a loan and a rate', () => {
    expect(CALCULATOR).toContain('const hasLoan = inputs.loanAmount > 0 && inputs.annualRate > 0;');
    expect(CALCULATOR).toContain('{hasLoan && <AmortizationTable');
  });

  it('prefills the Contact modal only once the calculator holds something', () => {
    const app = read('src/MortgageCalculatorApp.tsx');
    expect(app).toContain('prefillNumbers={inputs.loanAmount > 0 && inputs.annualRate > 0}');
  });
});

describe('the FHA estimator waits for what its answer depends on', () => {
  const FHA = read('public/fha/index.html');

  it('needs a down payment, not just a price and a rate', () => {
    // R4-2. A blank down payment was read as 0, so price 400,000 and rate 6.5
    // alone showed "$2,759 per month, all in": a 100% loan, which FHA does not
    // do, with $0 tax and $0 insurance.
    expect(FHA).toContain('var ready = price > 0 && rate > 0 && downPct >= MIN_DOWN_PCT;');
  });

  it('does not say "all in" before taxes and insurance are in', () => {
    expect(FHA).toContain("var escrowed = num(taxEl) > 0 && num(insEl) > 0;");
    expect(FHA).toContain("'per month, before taxes and insurance'");
  });

  it('sends what the visitor typed into it', () => {
    // R4-6. The page asked for six numbers and sent Darren none of them.
    expect(FHA).toContain('window.FHA_ESTIMATE = function ()');
    for (const field of ['fhaPrice', 'fhaDownPct', 'fhaRate', 'fhaTax', 'fhaInsurance', 'fhaHoa']) {
      expect(FHA, `${field} is not in the payload`).toContain(`${field}: estimate.${field} || ''`);
    }
  });

  it('sends a payment only when the page stood behind one', () => {
    expect(FHA).toContain('fhaMonthlyPayment: priced');
  });
});

describe('success copy matches what was actually sent', () => {
  it('does not claim "your numbers" from a four-field submit', () => {
    // R4-3. Every Contact form said "Darren will review your numbers",
    // including the minimal submit, which gives none.
    const LEAD_FORM = read('src/components/LeadForm.tsx');
    expect(LEAD_FORM).toContain("'Darren will reach out within 1 business day.'");
    expect(LEAD_FORM).toContain('form.loanAmount.trim() || form.annualRate.trim()');

    for (const page of ['public/dscr/index.html', 'public/fha/index.html', 'public/realestateinvesting/index.html']) {
      const src = read(page);
      expect(src, `${page} still hard-codes the claim`).not.toContain(
        '<p class="lf-success-body">Darren will review your numbers and be in touch shortly.</p>',
      );
      expect(src, `${page} does not vary its copy`).toContain("cLoanAmount').value.trim()");
    }
  });
});

describe('the goals example fits the page it is on', () => {
  // R4-8. The homeowner example ("pay off credit card debt, save for a rental
  // property") showed on /fha/, which is first-time buyers, and on the two
  // investor pages.
  it.each([
    ['public/fha/index.html', 'First home'],
    ['public/dscr/index.html', 'rental in Phoenix'],
    ['public/realestateinvesting/index.html', 'out-of-state rental'],
  ])('%s', (page, expected) => {
    const src = read(page);
    expect(src).toContain(expected);
    expect(src).not.toContain('save for a rental property');
  });
});
