/**
 * Every lead tab's column order, and the one rule that keeps a row under its
 * own headers: values are written by header NAME.
 *
 * WHY THIS FILE EXISTS. Rows used to be built in the order of a header list in
 * google-apps-script.js and appended blind, which holds only while the live
 * sheet's columns are in that same order. On @38 two new Debt Consolidation
 * columns went in just before the triage block instead of at the very end.
 * Every test passed: the row and the header list agreed with each other, the
 * attribution block was still contiguous, the lengths matched. What none of
 * them could see is the live sheet, which already had the triage columns last,
 * so every cell from Test? onwards was written one or two columns away from its
 * own header. A test lead's TEST flag landed under Contacted.
 *
 * This file used to answer that by pinning each list as "only ever extended at
 * the end". The 8 Oct schema release (docs/lead-sheet-schema.md) replaced the
 * append-only rule, so it now pins two different things:
 *
 *  1. THE ORDER, exactly. A change to a tab's columns has to be made here as
 *     well as in the script, which is the moment to remember that the script's
 *     list moves nothing on the sheet: only migrateLeadTabs() does.
 *  2. THE WRITE, against sheets that are deliberately not in that order. This is
 *     the half that would have caught @38: the header row on the sheet decides
 *     where a value goes, so the two cannot disagree about position.
 */
import { describe, it, expect } from 'vitest';
import { loadGas, type Tab } from './helpers/gas-harness';

const PREFIX = [
  'Timestamp', 'Submission ID', 'First Name', 'Last Name', 'Email', 'Phone', 'State',
  'Licensed?', 'Source', 'Magnet/Goal', 'Form ID', 'Page',
];
const ATTR = [
  'UTM Source', 'UTM Medium', 'UTM Campaign', 'UTM Term', 'UTM Content',
  'Click ID', 'Click ID Type', 'Landing Page', 'Referrer',
  'First Touch Source', 'First Touch Medium', 'First Touch Campaign',
  'First Click ID', 'First Click ID Type', 'First Touch At',
];
const TRIAGE = ['Test?', 'Status', 'Contacted'];

/** source -> [tab, the funnel's own columns], as docs/lead-sheet-schema.md lists them. */
const DETAILS: Record<string, [string, string[]]> = {
  'dscr': ['DSCR', [
    'Purchase Price', 'Down Payment', 'Loan Amount', 'Rate', 'Monthly Rent', 'Annual Tax',
    'Annual Insurance', 'Monthly HOA', 'Monthly P&I', 'Monthly PITIA', 'DSCR',
  ]],
  'self-employed': ['Self-Employed', []],
  'fha': ['FHA', [
    'Credit Score', 'Purchase Price', 'Down Payment %', 'Rate', 'Annual Tax',
    'Annual Insurance', 'Monthly HOA', 'Est. Monthly Payment',
  ]],
  'real-estate-investing': ['Real Estate Investing', []],
  'DebtConsolidation': ['Debt Consolidation', [
    'Debts', 'Total Debt Balance', 'Total Debt Payment', 'Weighted Avg Rate',
    'Home Value', 'Mortgage Balance', 'Mortgage Payment', 'Mortgage Rate', 'Mortgage Term',
    'Estimated Home Equity', 'Current LTV', 'Current Monthly Payment', 'Monthly Savings',
    'Refi Monthly Payment', 'Refi Monthly Savings',
    'Same-Payoff Refi Payment', 'Same-Payoff Refi Savings',
    'HELOAN Credit Tier', 'HELOAN Term', 'HELOAN Monthly Payment', 'HELOAN Monthly Savings',
    'Rate Source Date',
  ]],
  'home-equity': ['Home Equity', [
    'Home Value', 'Mortgage Balance', 'Estimated Home Equity', 'Current LTV',
    'Goal', 'Amount Exploring', 'Illustrative CLTV', 'Preference',
  ]],
  'adu': ['ADU', [
    'Home Value', 'Mortgage Balance', 'Estimated Home Equity', 'Current LTV',
    'Project Cost', 'Amount to Finance', 'Illustrative CLTV', 'Project Purpose',
  ]],
};
const LEADS_DETAILS = ['Loan Amount', 'Term (Years)', 'Rate (%)', 'Goals', 'Target Outcome', 'Timeline'];

type Schema = { tab: string; headers: string[] };
type Gas = {
  SOURCE_SCHEMAS: Record<string, Schema>;
  LEADS_SCHEMA: Schema;
  LEAD_HEADERS: string[];
  DEBT_CONSOLIDATION_HEADERS: string[];
  QUALIFY_HEADERS: string[];
  NEWSLETTER_HEADERS: string[];
  leadTabSchemas: () => Schema[];
  describeSheetDrift: (live: string[], headers: string[], missing: string[]) => string;
  doPost: (e: { postData: { contents: string } }) => unknown;
};

type Mail = { to: string; subject: string; body: string };

function load() {
  const mail: Mail[] = [];
  const harness = loadGas<Gas>({
    exports: [
      'SOURCE_SCHEMAS', 'LEADS_SCHEMA', 'LEAD_HEADERS', 'DEBT_CONSOLIDATION_HEADERS',
      'QUALIFY_HEADERS', 'NEWSLETTER_HEADERS', 'leadTabSchemas', 'describeSheetDrift', 'doPost',
    ],
    onMail: (m) => mail.push(m),
  });
  const post = (payload: Record<string, unknown>) => {
    const res = harness.gas.doPost({ postData: { contents: JSON.stringify(payload) } }) as { __body: string };
    return JSON.parse(res.__body) as { success: boolean; error?: string };
  };
  const seed = (tab: Tab) => harness.tabs.set(tab.name, tab);
  return { ...harness, mail, post, seed };
}

const { gas } = load();

describe('every lead tab is the standard order', () => {
  it.each(Object.keys(DETAILS))('%s: who, then its own numbers, then where from, then triage', (source) => {
    const [tab, details] = DETAILS[source];
    expect(gas.SOURCE_SCHEMAS[source].tab).toBe(tab);
    expect(gas.SOURCE_SCHEMAS[source].headers).toEqual([...PREFIX, ...details, ...ATTR, ...TRIAGE]);
  });

  it('Leads, the catch-all, is the same shape', () => {
    expect(gas.LEADS_SCHEMA.tab).toBe('Leads');
    expect(gas.LEADS_SCHEMA.headers).toEqual([...PREFIX, ...LEADS_DETAILS, ...ATTR, ...TRIAGE]);
    expect(gas.LEAD_HEADERS).toBe(gas.LEADS_SCHEMA.headers);
    expect(gas.DEBT_CONSOLIDATION_HEADERS).toBe(gas.SOURCE_SCHEMAS['DebtConsolidation'].headers);
  });

  it('covers every tab, so a new one cannot slip past unpinned', () => {
    expect(Object.keys(gas.SOURCE_SCHEMAS).sort()).toEqual(Object.keys(DETAILS).sort());
    expect(gas.leadTabSchemas()).toHaveLength(Object.keys(DETAILS).length + 1);
  });

  it.each(gas.leadTabSchemas().map((s) => [s.tab, s.headers] as const))(
    '%s names no column twice',
    (_tab, headers) => {
      // By-name writing has one precondition: a name finds one column. 'Rate'
      // on FHA and 'Rate (%)' on Leads are different tabs; within a tab every
      // header has to be its own.
      expect(new Set(headers).size).toBe(headers.length);
    },
  );

  it('gives each schema a tab of its own', () => {
    const tabs = gas.leadTabSchemas().map((s) => s.tab);
    expect(new Set(tabs).size).toBe(tabs.length);
  });

  it('the two tabs with no sender keep the shape they were created with', () => {
    expect(gas.NEWSLETTER_HEADERS).toEqual(['Timestamp', 'Email', 'Source']);
    expect(gas.QUALIFY_HEADERS).toEqual([
      'Timestamp', 'First Name', 'Last Name', 'Email', 'Phone', 'Loan Type', 'Timeline',
      'Price Range', 'Credit Range', 'Employment', 'Notes', 'Source', ...ATTR, ...TRIAGE,
    ]);
  });
});

/** The Debt Consolidation tab as deployment @39 left it, with one historical row. */
const OLD_DEBT_HEADERS = [
  'Timestamp', 'First Name', 'Last Name', 'Email', 'Phone', 'State',
  'Best Time to Call', 'Lead Source', 'Home Value', 'Mortgage Balance', 'Mortgage Payment',
  'Mortgage Rate', 'Mortgage Term', 'Total Debt Balance', 'Total Debt Payment', 'Monthly Savings',
  'Refi Monthly Payment', 'Refi Monthly Savings', 'HELOAN Monthly Payment', 'HELOAN Monthly Savings',
  'UTM Source', 'UTM Medium', 'UTM Campaign', 'UTM Term', 'UTM Content',
  'Click ID', 'Click ID Type', 'Landing Page', 'Referrer',
  'First Touch Source', 'First Touch Campaign', 'First Click ID', 'First Click ID Type', 'First Touch At',
  'Licensed?', 'Test?', 'Status', 'Contacted', 'HELOAN Credit Tier', 'HELOAN Term',
];

const DEBT_LEAD = {
  source: 'DebtConsolidation', formId: 'debt-savings-calculator',
  pageUri: 'https://realdarrentsai.com/debt-consolidation/?gclid=ABC',
  firstName: 'Cy', lastName: 'Homeowner', email: 'liannemaxbalbastro+cols@gmail.com',
  phone: '(714) 882-1190', state: 'CA',
  homeValue: 900000, mortgageBalance: 400000, mortgagePayment: 2600,
  totalDebtBalance: 26500, totalDebtPayment: 670, monthlySavings: -120,
  heloanCreditTier: '10.49', heloanTermYears: '15',
  utm_source: 'google', firstUtmSource: 'youtube', firstUtmMedium: 'social',
};

describe('a row is written under its header by name, wherever the header is', () => {
  it('lands every value correctly on a tab still in its old order', () => {
    // The state of the live sheet between deploying this script and running the
    // migration. This is the @38 arrangement: triage before the two HELOAN
    // columns, Licensed? after attribution. Positional writing put the TEST
    // flag under Contacted here.
    const h = load();
    h.seed({ name: 'Debt Consolidation', rows: [[...OLD_DEBT_HEADERS]] });
    expect(h.post(DEBT_LEAD).success).toBe(true);

    const row = h.rowOf('Debt Consolidation');
    expect(row).toMatchObject({
      'First Name': 'Cy', State: 'CA', 'Home Value': 900000, 'Total Debt Balance': 26500,
      'Monthly Savings': -120, 'UTM Source': 'google', 'First Touch Source': 'youtube',
      'Licensed?': 'Yes', 'Test?': 'TEST', Status: '', Contacted: '',
      'HELOAN Credit Tier': '10.49', 'HELOAN Term': '15',
    });
    // The two columns the form no longer has are still there, and blank.
    expect(row['Best Time to Call']).toBe('');
    expect(row['Lead Source']).toBe('');
  });

  it('adds a column the tab lacks at the END, and never renames one in place', () => {
    const h = load();
    h.seed({ name: 'Debt Consolidation', rows: [[...OLD_DEBT_HEADERS]] });
    h.post(DEBT_LEAD);

    const headers = h.tabs.get('Debt Consolidation')!.rows[0] as string[];
    expect(headers.slice(0, OLD_DEBT_HEADERS.length)).toEqual(OLD_DEBT_HEADERS);
    const added = headers.slice(OLD_DEBT_HEADERS.length);
    expect(added).toContain('Submission ID');
    expect(added).toContain('First Touch Medium');
    expect(added).toContain('Page');
    // And the new row fills them.
    expect(h.rowOf('Debt Consolidation')).toMatchObject({
      'Submission ID': 'uuid-1', 'Form ID': 'debt-savings-calculator',
      Page: '/debt-consolidation/', 'First Touch Medium': 'social',
    });
  });

  it('does not disturb a historical row', () => {
    const old = ['2026-09-26', 'Old', 'Lead', 'old@example.com', '5550000000', 'CA', 'Morning', 'YouTube', 800000];
    const h = load();
    h.seed({ name: 'Debt Consolidation', rows: [[...OLD_DEBT_HEADERS], [...old]] });
    h.post(DEBT_LEAD);
    expect(h.tabs.get('Debt Consolidation')!.rows[1]).toEqual(old);
    expect(h.rowOf('Debt Consolidation', 2).Email).toBe(DEBT_LEAD.email);
  });

  it('follows the headers when someone has dragged the columns into any order', () => {
    const shuffled = [...gas.SOURCE_SCHEMAS['DebtConsolidation'].headers].reverse();
    const h = load();
    h.seed({ name: 'Debt Consolidation', rows: [shuffled] });
    h.post(DEBT_LEAD);

    const tab = h.tabs.get('Debt Consolidation')!;
    expect(tab.rows[0]).toEqual(shuffled); // nothing added, nothing moved
    expect(tab.rows[1][shuffled.indexOf('Email')]).toBe(DEBT_LEAD.email);
    expect(tab.rows[1][shuffled.indexOf('Test?')]).toBe('TEST');
    expect(tab.rows[1][shuffled.indexOf('Contacted')]).toBe('');
    expect(tab.rows[1][shuffled.indexOf('Monthly Savings')]).toBe(-120);
  });

  it('writes once when the sheet names a header twice, as @38 left Status and Contacted', () => {
    const doubled = [...OLD_DEBT_HEADERS.slice(0, 38), 'Status', 'Contacted'];
    const h = load();
    h.seed({ name: 'Debt Consolidation', rows: [doubled] });
    h.post(DEBT_LEAD);
    const row = h.tabs.get('Debt Consolidation')!.rows[1];
    expect(row[doubled.indexOf('Test?')]).toBe('TEST');
    // Neither copy of Contacted took the flag, which is the exact @38 symptom.
    expect(row[36]).toBe('');
    expect(row[37]).toBe('');
    expect(row[38]).toBe('');
    expect(row[39]).toBe('');
  });

  it('writes under the old name while the sheet still has it, instead of starting a second column', () => {
    // 'Magnet' became 'Magnet/Goal'. Until the migration renames it, a lead must
    // not split the magnets across two columns.
    const h = load();
    h.seed({
      name: 'DSCR',
      rows: [['Timestamp', 'First Name', 'Last Name', 'Email', 'Phone', 'State', 'Magnet', 'Source', 'DSCR']],
    });
    h.post({ source: 'dscr', email: 'a@example.com', magnet: 'DSCR Rate & Cash Flow Guide', dscr: '1.20' });
    const headers = h.tabs.get('DSCR')!.rows[0] as string[];
    expect(headers).not.toContain('Magnet/Goal');
    expect(h.rowOf('DSCR')).toMatchObject({ Magnet: 'DSCR Rate & Cash Flow Guide', DSCR: '1.20', Source: 'dscr' });
  });

  it('leaves a column a person added by hand alone, and blank on new rows', () => {
    const withNotes = [...gas.SOURCE_SCHEMAS['dscr'].headers, 'Darren notes'];
    const h = load();
    h.seed({ name: 'DSCR', rows: [withNotes] });
    h.post({ source: 'dscr', email: 'a@example.com' });
    expect(h.tabs.get('DSCR')!.rows[0]).toEqual(withNotes);
    expect(h.rowOf('DSCR')['Darren notes']).toBe('');
  });

  it('creates a tab that does not exist yet already in the standard order', () => {
    const h = load();
    h.post({ source: 'home-equity', email: 'a@example.com', goal: 'Renovation / ADU', amountExploring: 80000 });
    expect(h.tabs.get('Home Equity')!.rows[0]).toEqual(gas.SOURCE_SCHEMAS['home-equity'].headers);
    expect(h.rowOf('Home Equity')).toMatchObject({ Goal: 'Renovation / ADU', 'Amount Exploring': 80000, 'Magnet/Goal': '' });
  });

  it('writes Qualify by name too, so the new attribution column cannot shift it', () => {
    const before = gas.QUALIFY_HEADERS.filter((name) => name !== 'First Touch Medium');
    const h = load();
    h.seed({ name: 'Qualify', rows: [before] });
    h.post({ source: 'QualifyForm', email: 'liannemaxbalbastro+q@gmail.com', firstUtmCampaign: 'yt-buyer' });
    expect(h.rowOf('Qualify')).toMatchObject({ 'First Touch Campaign': 'yt-buyer', 'Test?': 'TEST', Contacted: '' });
  });
});

describe('a tab that is not in schema order is reported, and the lead still saved', () => {
  it('says nothing when the tab is exactly the schema', () => {
    const h = load();
    h.post(DEBT_LEAD);
    h.post(DEBT_LEAD);
    expect(h.mail).toEqual([]);
  });

  it('says nothing about extra columns after the schema, which a person may add', () => {
    const h = load();
    h.seed({ name: 'DSCR', rows: [[...gas.SOURCE_SCHEMAS['dscr'].headers, 'Darren notes']] });
    h.post({ source: 'dscr', email: 'a@example.com' });
    expect(h.mail).toEqual([]);
  });

  it('mails both recipients when the tab is in its old order, and says no lead is affected', () => {
    const h = load();
    h.seed({ name: 'Debt Consolidation', rows: [[...OLD_DEBT_HEADERS]] });
    expect(h.post(DEBT_LEAD).success).toBe(true);
    expect(h.mail).toHaveLength(1);
    expect(h.mail[0].subject).toBe('Sheet columns out of order: Debt Consolidation');
    expect(h.mail[0].subject).not.toContain('LEAD PIPELINE FAILURE');
    expect(h.mail[0].to.split(',')).toHaveLength(2);
    expect(h.mail[0].body).toContain('NO LEAD IS AFFECTED');
    expect(h.mail[0].body).toContain('migrateLeadTabs()');
    expect(h.mail[0].body).toContain('missing: Submission ID');
  });

  it('throttles the notice per tab, so a busy day before the migration is not an email per lead', () => {
    // Source-level: the harness's cache never remembers, which is what lets
    // the test above see the mail at all.
    const alert = loadGas<{ alertSheetDrift: (...a: unknown[]) => void }>({ exports: ['alertSheetDrift'] })
      .gas.alertSheetDrift.toString();
    expect(alert).toContain("'sheet_drift_' + String(tabName)");
    expect(alert).toContain('if (cache.get(key)) return;');
    expect(alert).toContain("cache.put(key, '1', 21600)");
  });

  it('describes each kind of drift in words', () => {
    const headers = ['A', 'B', 'C'];
    expect(gas.describeSheetDrift(['A', 'B', 'C'], headers, [])).toBe('');
    expect(gas.describeSheetDrift(['A', 'B', 'C', 'Notes'], headers, [])).toBe('');
    expect(gas.describeSheetDrift(['A', 'C', 'B'], headers, [])).toContain('order differs from column 2');
    expect(gas.describeSheetDrift(['A', 'B', 'C', 'B'], headers, [])).toContain('there twice: B');
    expect(gas.describeSheetDrift(['A', 'B'], headers, ['C'])).toContain('missing: C');
  });
});
