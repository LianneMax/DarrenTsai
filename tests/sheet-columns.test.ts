/**
 * Every Sheet tab's header list, pinned as it was DEPLOYED.
 *
 * WHY THIS FILE EXISTS. "Sheet columns are append-only" is the oldest rule in
 * this repo, and the tests still let it be broken in production. On @38 two new
 * Debt Consolidation columns went in just before the triage block instead of at
 * the very end. Every existing test passed: the row and the header list agreed
 * with each other, the attribution block was still contiguous, the row length
 * still matched the header length.
 *
 * What none of them could see is the live sheet, which already had the triage
 * columns last. ensureHeaders only ever writes PAST the current last column, so
 * it appended 'Status' and 'Contacted' a second time, the two new names never
 * appeared at all, and every cell from Test? onwards was written one or two
 * columns away from its own header. A test lead's TEST flag landed under
 * Contacted.
 *
 * So the invariant is not "the row matches the headers". It is "the headers
 * already on the sheet are still a PREFIX of the headers in this file". That is
 * the only thing ensureHeaders can honour, and it is what these snapshots check.
 *
 * WHEN THIS FAILS. If you added a column, move it to the END of the list, after
 * everything including the triage columns, and it will pass. If you moved,
 * renamed or removed one, it will not pass, and it should not: those cells are
 * already written on a live sheet and nothing in this repo can shift them.
 *
 * Snapshot taken from google-apps-script.js at c95ec19, the file behind Apps
 * Script deployment @37. Update it only after a deployment has gone out AND the
 * live sheet's own header row has been confirmed to match.
 */
import { describe, it, expect } from 'vitest';
import { loadGas } from './helpers/gas-harness';

/** The header lists as the live sheets already hold them. */
const DEPLOYED_AT_37: Record<string, string[]> = {
  LEAD_HEADERS: [
    'Timestamp',
    'First Name',
    'Last Name',
    'Email',
    'Phone',
    'State',
    'Loan Amount',
    'Term (Years)',
    'Rate (%)',
    'Goals',
    'Target Outcome',
    'Timeline',
    'Source',
    'Licensed?',
    'UTM Source',
    'UTM Medium',
    'UTM Campaign',
    'UTM Term',
    'UTM Content',
    'Click ID',
    'Click ID Type',
    'Landing Page',
    'Referrer',
    'First Touch Source',
    'First Touch Campaign',
    'First Click ID',
    'First Click ID Type',
    'First Touch At',
    'Test?',
    'Status',
    'Contacted',
  ],
  QUALIFY_HEADERS: [
    'Timestamp',
    'First Name',
    'Last Name',
    'Email',
    'Phone',
    'Loan Type',
    'Timeline',
    'Price Range',
    'Credit Range',
    'Employment',
    'Notes',
    'Source',
    'UTM Source',
    'UTM Medium',
    'UTM Campaign',
    'UTM Term',
    'UTM Content',
    'Click ID',
    'Click ID Type',
    'Landing Page',
    'Referrer',
    'First Touch Source',
    'First Touch Campaign',
    'First Click ID',
    'First Click ID Type',
    'First Touch At',
    'Test?',
    'Status',
    'Contacted',
  ],
  DEBT_CONSOLIDATION_HEADERS: [
    'Timestamp',
    'First Name',
    'Last Name',
    'Email',
    'Phone',
    'State',
    'Best Time to Call',
    'Lead Source',
    'Home Value',
    'Mortgage Balance',
    'Mortgage Payment',
    'Mortgage Rate',
    'Mortgage Term',
    'Total Debt Balance',
    'Total Debt Payment',
    'Monthly Savings',
    'Refi Monthly Payment',
    'Refi Monthly Savings',
    'HELOAN Monthly Payment',
    'HELOAN Monthly Savings',
    'UTM Source',
    'UTM Medium',
    'UTM Campaign',
    'UTM Term',
    'UTM Content',
    'Click ID',
    'Click ID Type',
    'Landing Page',
    'Referrer',
    'First Touch Source',
    'First Touch Campaign',
    'First Click ID',
    'First Click ID Type',
    'First Touch At',
    'Licensed?',
    'Test?',
    'Status',
    'Contacted',
  ],
  NEWSLETTER_HEADERS: [
    'Timestamp',
    'Email',
    'Source',
  ],
  "SOURCE_SCHEMAS['dscr']": [
    'Timestamp',
    'First Name',
    'Last Name',
    'Email',
    'Phone',
    'State',
    'Magnet',
    'Source',
    'DSCR',
    'Down Payment',
    'Loan Amount',
    'Rate',
    'Licensed?',
    'UTM Source',
    'UTM Medium',
    'UTM Campaign',
    'UTM Term',
    'UTM Content',
    'Click ID',
    'Click ID Type',
    'Landing Page',
    'Referrer',
    'First Touch Source',
    'First Touch Campaign',
    'First Click ID',
    'First Click ID Type',
    'First Touch At',
    'Test?',
    'Status',
    'Contacted',
  ],
  "SOURCE_SCHEMAS['self-employed']": [
    'Timestamp',
    'First Name',
    'Last Name',
    'Email',
    'Phone',
    'State',
    'Magnet',
    'Source',
    'Licensed?',
    'UTM Source',
    'UTM Medium',
    'UTM Campaign',
    'UTM Term',
    'UTM Content',
    'Click ID',
    'Click ID Type',
    'Landing Page',
    'Referrer',
    'First Touch Source',
    'First Touch Campaign',
    'First Click ID',
    'First Click ID Type',
    'First Touch At',
    'Test?',
    'Status',
    'Contacted',
  ],
  "SOURCE_SCHEMAS['fha']": [
    'Timestamp',
    'First Name',
    'Last Name',
    'Email',
    'Phone',
    'State',
    'Magnet',
    'Source',
    'Credit Score',
    'Licensed?',
    'UTM Source',
    'UTM Medium',
    'UTM Campaign',
    'UTM Term',
    'UTM Content',
    'Click ID',
    'Click ID Type',
    'Landing Page',
    'Referrer',
    'First Touch Source',
    'First Touch Campaign',
    'First Click ID',
    'First Click ID Type',
    'First Touch At',
    'Test?',
    'Status',
    'Contacted',
  ],
  "SOURCE_SCHEMAS['real-estate-investing']": [
    'Timestamp',
    'First Name',
    'Last Name',
    'Email',
    'Phone',
    'State',
    'Magnet',
    'Source',
    'Licensed?',
    'UTM Source',
    'UTM Medium',
    'UTM Campaign',
    'UTM Term',
    'UTM Content',
    'Click ID',
    'Click ID Type',
    'Landing Page',
    'Referrer',
    'First Touch Source',
    'First Touch Campaign',
    'First Click ID',
    'First Click ID Type',
    'First Touch At',
    'Test?',
    'Status',
    'Contacted',
  ],
  // Not yet deployed. Pinned at creation (revamp phase 3, 9 Oct) so the tab is
  // covered from its first row: the live sheet has no "Home Equity" tab until
  // the deploy that adds this route, and from then on these are its columns.
  "SOURCE_SCHEMAS['home-equity']": [
    'Timestamp', 'First Name', 'Last Name', 'Email', 'Phone', 'State',
    'Source', 'Home Value', 'Mortgage Balance', 'Estimated Home Equity', 'Current LTV',
    'Goal', 'Amount Exploring', 'Illustrative CLTV', 'Preference', 'Licensed?',
    'UTM Source', 'UTM Medium', 'UTM Campaign', 'UTM Term', 'UTM Content',
    'Click ID', 'Click ID Type', 'Landing Page', 'Referrer',
    'First Touch Source', 'First Touch Campaign',
    'First Click ID', 'First Click ID Type', 'First Touch At',
    'Test?', 'Status', 'Contacted',
  ],
  // Not yet deployed. Pinned at creation (revamp phase 5, 9 Oct), like
  // 'home-equity' above.
  "SOURCE_SCHEMAS['adu']": [
    'Timestamp', 'First Name', 'Last Name', 'Email', 'Phone', 'State',
    'Source', 'Home Value', 'Mortgage Balance', 'Estimated Home Equity', 'Current LTV',
    'Project Cost', 'Amount to Finance', 'Illustrative CLTV', 'Project Purpose', 'Licensed?',
    'UTM Source', 'UTM Medium', 'UTM Campaign', 'UTM Term', 'UTM Content',
    'Click ID', 'Click ID Type', 'Landing Page', 'Referrer',
    'First Touch Source', 'First Touch Campaign',
    'First Click ID', 'First Click ID Type', 'First Touch At',
    'Test?', 'Status', 'Contacted',
  ],
};

const { gas } = loadGas<{
  LEAD_HEADERS: string[];
  QUALIFY_HEADERS: string[];
  DEBT_CONSOLIDATION_HEADERS: string[];
  NEWSLETTER_HEADERS: string[];
  SOURCE_SCHEMAS: Record<string, { headers: string[] }>;
}>({
  exports: [
    'LEAD_HEADERS', 'QUALIFY_HEADERS', 'DEBT_CONSOLIDATION_HEADERS',
    'NEWSLETTER_HEADERS', 'SOURCE_SCHEMAS',
  ],
});

/** The current header list for one pinned name. */
function current(name: string): string[] {
  const schema = /^SOURCE_SCHEMAS\['(.+)'\]$/.exec(name);
  if (schema) return gas.SOURCE_SCHEMAS[schema[1]].headers;
  return (gas as unknown as Record<string, string[]>)[name];
}

const NAMES = Object.keys(DEPLOYED_AT_37);

describe('a deployed header list is only ever extended', () => {
  it.each(NAMES)('%s keeps its deployed columns, in order', (name) => {
    const deployed = DEPLOYED_AT_37[name];
    const now = current(name);
    expect(now, name + ' no longer exists').toBeDefined();
    // Compared by position, which is the whole point: a column that moved is a
    // column whose historical cells now mean something else.
    expect(now.slice(0, deployed.length)).toEqual(deployed);
  });

  it.each(NAMES)('%s only ever grows', (name) => {
    expect(current(name).length).toBeGreaterThanOrEqual(DEPLOYED_AT_37[name].length);
  });

  it('puts anything new after the triage columns, which were the last append', () => {
    // The specific mistake on @38. Test?, Status and Contacted were the end of
    // every list, so a new column belongs after them, not before.
    for (const name of NAMES) {
      const now = current(name);
      if (now.indexOf('Contacted') === -1) continue; // Newsletter has no triage columns
      for (const column of now.slice(DEPLOYED_AT_37[name].length)) {
        expect(
          now.indexOf(column),
          name + ': ' + column + ' sits before Contacted',
        ).toBeGreaterThan(now.indexOf('Contacted'));
      }
    }
  });

  it('covers every tab, so a new one cannot slip past unpinned', () => {
    const covered = NAMES.filter((k) => k.startsWith('SOURCE_SCHEMAS'));
    expect(covered).toHaveLength(Object.keys(gas.SOURCE_SCHEMAS).length);
  });
});
