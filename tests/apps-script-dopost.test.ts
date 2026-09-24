/**
 * doPost, run for real against a fake Spreadsheet.
 *
 * The existing apps-script tests check the pure helpers and assert on the
 * source text. Neither catches the failure that matters most here: a lead whose
 * row lands on the wrong tab, or under the wrong columns, or not at all. Those
 * only show up when something actually drives doPost end to end and then reads
 * the resulting cells back by header name.
 *
 * So this file stubs Sheets with an in-memory spreadsheet, posts each form's
 * real payload shape, and asserts on the row that came out — by looking the
 * value up under its header, never by column index, which is the whole point.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SOURCE = readFileSync(resolve(__dirname, '../google-apps-script.js'), 'utf8');

type Tab = { name: string; rows: unknown[][] };

type Harness = {
  doPost: (e: { postData: { contents: string } }) => unknown;
  tabs: Map<string, Tab>;
  mail: Array<{ to: string; subject: string; body: string }>;
  /** The row a tab holds, as a header -> value object. */
  rowOf: (tabName: string, index?: number) => Record<string, unknown>;
};

function load(): Harness {
  const tabs = new Map<string, Tab>();
  const mail: Array<{ to: string; subject: string; body: string }> = [];

  function makeSheet(tab: Tab) {
    const sheet = {
      appendRow(values: unknown[]) {
        tab.rows.push(values);
      },
      getLastRow: () => tab.rows.length,
      getLastColumn: () => (tab.rows[0] ? tab.rows[0].length : 0),
      setFrozenRows: () => sheet,
      getRange(row: number, col: number, numRows: number, numCols: number) {
        return {
          setValues(values: unknown[][]) {
            for (let r = 0; r < numRows; r++) {
              const target = (tab.rows[row - 1 + r] ??= []);
              for (let c = 0; c < numCols; c++) target[col - 1 + c] = values[r][c];
            }
            return this;
          },
          getValues() {
            const out: unknown[][] = [];
            for (let r = 0; r < numRows; r++) {
              const source = tab.rows[row - 1 + r] ?? [];
              out.push(source.slice(col - 1, col - 1 + numCols));
            }
            return out;
          },
          setFontWeight: () => ({ setBackground: () => ({ setFontColor: () => ({}) }) }),
          setBackground: () => ({ setFontColor: () => ({}) }),
          setFontColor: () => ({}),
        };
      },
    };
    return sheet;
  }

  const spreadsheet = {
    getSheetByName(name: string) {
      const tab = tabs.get(name);
      return tab ? makeSheet(tab) : null;
    },
    insertSheet(name: string) {
      const tab: Tab = { name, rows: [] };
      tabs.set(name, tab);
      return makeSheet(tab);
    },
  };

  const stubs = `
    var PropertiesService = { getScriptProperties: function(){ return { getProperty: function(){ return ''; } }; } };
    var SpreadsheetApp = { openById: function(){ return __ss; } };
    var UrlFetchApp = { fetch: function(){ throw new Error('doPost must not make HTTP calls'); } };
    var Logger = { log: function(){} };
    var MailApp = { sendEmail: function(m){ __mail.push(m); } };
    var CacheService = { getScriptCache: function(){ return { get: function(){ return null; }, put: function(){}, remove: function(){} }; } };
    var LockService = { getScriptLock: function(){ return { waitLock: function(){}, tryLock: function(){ return true; }, releaseLock: function(){} }; } };
    var ScriptApp = { getProjectTriggers: function(){ return []; }, deleteTrigger: function(){}, newTrigger: function(){ return { timeBased: function(){ return { everyMinutes: function(){ return { create: function(){} }; }, everyDays: function(){ return { atHour: function(){ return { create: function(){} }; } }; } }; } }; } };
    var ContentService = { createTextOutput: function(t){ return { setMimeType: function(){ return { __body: t }; } }; }, MimeType: { JSON: 'json' } };
  `;
  const factory = new Function('__ss', '__mail', `${stubs}\n${SOURCE}\nreturn { doPost: doPost };`);
  const { doPost } = factory(spreadsheet, mail) as { doPost: Harness['doPost'] };

  return {
    doPost,
    tabs,
    mail,
    rowOf(tabName: string, index = 1) {
      const tab = tabs.get(tabName);
      if (!tab) throw new Error(`no tab named ${tabName}; got ${[...tabs.keys()].join(', ')}`);
      const headers = tab.rows[0] as string[];
      const row = tab.rows[index];
      if (!row) throw new Error(`tab ${tabName} has no row at ${index}`);
      return Object.fromEntries(headers.map((h, i) => [h, row[i]]));
    },
  };
}

function post(h: Harness, payload: Record<string, unknown>) {
  const res = h.doPost({ postData: { contents: JSON.stringify(payload) } }) as { __body: string };
  return JSON.parse(res.__body) as { success: boolean; error?: string };
}

const ATTR = {
  utm_source: 'google',
  utm_medium: 'cpc',
  utm_campaign: 'dscr-q4',
  utm_term: 'dscr loan',
  utm_content: 'ad-a',
  clickId: 'CLICK1',
  clickIdType: 'gclid',
  landingPage: '/dscr/?gclid=CLICK1',
  referrer: 'https://www.google.com/',
  firstUtmSource: 'youtube',
  firstUtmCampaign: 'yt-dscr',
  firstClickId: 'FIRSTCLICK',
  firstClickIdType: 'gclid',
  firstTouchTs: '2026-09-01T00:00:00.000Z',
};

let h: Harness;
beforeEach(() => { h = load(); });

describe('each funnel writes to its own tab, under its own headers', () => {
  it('DSCR: the ratio and the loan numbers land in named columns', () => {
    const res = post(h, {
      source: 'dscr', magnet: 'DSCR Rate & Cash Flow Guide',
      timestamp: '2026-09-24T10:00:00.000Z',
      firstName: 'Jane', lastName: 'Investor', email: 'jane@example.com',
      phone: '(714) 555-0123', state: 'CA',
      dscr: '1.17', downPayment: '25%', loanAmount: '$240,000', rate: '7.00%',
      ...ATTR,
    });
    expect(res.success).toBe(true);

    const row = h.rowOf('DSCR');
    expect(row).toMatchObject({
      'First Name': 'Jane',
      'Last Name': 'Investor',
      Email: 'jane@example.com',
      State: 'CA',
      Magnet: 'DSCR Rate & Cash Flow Guide',
      Source: 'dscr',
      DSCR: '1.17',
      'Down Payment': '25%',
      'Loan Amount': '$240,000',
      Rate: '7.00%',
      'Licensed?': 'Yes',
      'UTM Campaign': 'dscr-q4',
      'Click ID': 'CLICK1',
      'First Click ID': 'FIRSTCLICK',
      'First Touch At': '2026-09-01T00:00:00.000Z',
    });
  });

  it('FHA: credit score gets its own column, not the DSCR tab', () => {
    post(h, {
      source: 'fha', magnet: 'FHA Affordability Calculator',
      firstName: 'Ben', email: 'ben@example.com', phone: '5551110000', state: 'TX',
      creditScore: '680', ...ATTR,
    });
    expect(h.rowOf('FHA')).toMatchObject({ 'Credit Score': '680', Source: 'fha', 'Licensed?': 'Yes' });
    expect(h.tabs.has('DSCR')).toBe(false);
  });

  it('Real Estate Investing: writes to its own tab', () => {
    post(h, { source: 'real-estate-investing', magnet: 'Investor Case Study', firstName: 'Ada', email: 'ada@example.com', state: 'FL' });
    expect(h.rowOf('Real Estate Investing')).toMatchObject({ Source: 'real-estate-investing', 'Licensed?': 'Yes' });
  });

  it('Debt Consolidation: every calculator number is stored, zero not blank', () => {
    post(h, {
      source: 'DebtConsolidation',
      firstName: 'Cy', lastName: 'Homeowner', email: 'cy@example.com',
      phone: '5552223333', state: 'CA',
      bestTimeToCall: 'Morning (8am–12pm)', leadSource: 'YouTube',
      homeValue: 900000, mortgageBalance: 400000, mortgagePayment: 2600,
      totalDebtBalance: 26500, totalDebtPayment: 670, monthlySavings: 540,
      refiMonthlyPayment: 2730, refiMonthlySavings: 540,
      heloanMonthlyPayment: 336, heloanMonthlySavings: 334,
      ...ATTR,
    });
    const row = h.rowOf('Debt Consolidation');
    expect(row).toMatchObject({
      'Best Time to Call': 'Morning (8am–12pm)',
      'Lead Source': 'YouTube',
      'Home Value': 900000,
      'Total Debt Payment': 670,
      'HELOAN Monthly Savings': 334,
      'UTM Source': 'google',
    });
    // The calculator can legitimately send 0, and 0 must not become ''.
    post(h, { source: 'DebtConsolidation', email: 'z@example.com', homeValue: 0, monthlySavings: 0 });
    expect(h.rowOf('Debt Consolidation', 2)['Home Value']).toBe(0);
  });

  it('Debt Consolidation records licensed state, after the attribution columns', () => {
    post(h, { source: 'DebtConsolidation', email: 'ca@example.com', state: 'CA', ...ATTR });
    post(h, { source: 'DebtConsolidation', email: 'ny@example.com', state: 'NY', ...ATTR });
    expect(h.rowOf('Debt Consolidation', 1)['Licensed?']).toBe('Yes');
    expect(h.rowOf('Debt Consolidation', 2)['Licensed?']).toBe('No');

    // Last column, so no historical cell to its left changed meaning.
    const headers = h.tabs.get('Debt Consolidation')!.rows[0] as string[];
    expect(headers[headers.length - 1]).toBe('Licensed?');
    expect(headers[headers.length - 2]).toBe('First Touch At');
  });

  it('extends an older Debt Consolidation tab without disturbing its rows', () => {
    const old = ['Timestamp', 'First Name', 'Last Name', 'Email', 'Phone', 'State',
      'Best Time to Call', 'Lead Source', 'Home Value', 'Mortgage Balance', 'Mortgage Payment',
      'Total Debt Balance', 'Total Debt Payment', 'Monthly Savings', 'Refi Monthly Payment',
      'Refi Monthly Savings', 'HELOAN Monthly Payment', 'HELOAN Monthly Savings'];
    h.tabs.set('Debt Consolidation', {
      name: 'Debt Consolidation',
      rows: [old, ['2026-01-01', 'Old', 'Lead', 'old@example.com', '5550000000', 'CA', 'Morning', 'YouTube', 800000, 300000, 2000, 20000, 500, 400, 2100, 400, 300, 200]],
    });
    post(h, { source: 'DebtConsolidation', email: 'new@example.com', state: 'TX', ...ATTR });

    const tab = h.tabs.get('Debt Consolidation')!;
    expect(tab.rows[1].slice(0, 18)).toEqual([
      '2026-01-01', 'Old', 'Lead', 'old@example.com', '5550000000', 'CA', 'Morning', 'YouTube',
      800000, 300000, 2000, 20000, 500, 400, 2100, 400, 300, 200,
    ]);
    expect(h.rowOf('Debt Consolidation', 2)['Licensed?']).toBe('Yes');
  });

  it('the generic calculator falls through to Leads with its own source recorded', () => {
    post(h, {
      source: 'MortgageCalculator',
      firstName: 'Gen', email: 'gen@example.com', phone: '5554445555', state: 'OR',
      loanAmount: '500000', termYears: '30', annualRate: '6.5',
      message: 'Lower my payment', target: '3000', timeline: '3 months', ...ATTR,
    });
    expect(h.rowOf('Leads')).toMatchObject({
      Source: 'MortgageCalculator',
      'Loan Amount': '500000',
      'Term (Years)': '30',
      'Rate (%)': '6.5',
      Goals: 'Lower my payment',
      'Licensed?': 'Yes',
    });
  });

  it('an unknown source still lands, rather than being lost', () => {
    // A future landing page that forgets its route. The lead must survive; the
    // alignment test is what makes the missing route visible.
    const res = post(h, { source: 'brand-new-funnel', email: 'new@example.com', state: 'CA' });
    expect(res.success).toBe(true);
    expect(h.rowOf('Leads')).toMatchObject({ Source: 'brand-new-funnel' });
  });

  it('marks an out-of-state lead unlicensed but still records it', () => {
    post(h, { source: 'dscr', email: 'ny@example.com', state: 'NY' });
    expect(h.rowOf('DSCR')['Licensed?']).toBe('No');
  });
});

describe('every lead is queued for follow-up exactly once', () => {
  it('queues the raw payload, pending, with the source and email beside it', () => {
    post(h, { source: 'dscr', email: 'jane@example.com', dscr: '1.17' });
    const row = h.rowOf('Follow-ups');
    expect(row).toMatchObject({ Status: 'pending', Source: 'dscr', Email: 'jane@example.com' });
    expect(JSON.parse(String(row.Payload))).toMatchObject({ dscr: '1.17' });
  });

  it('queues one row per submission, across different funnels', () => {
    post(h, { source: 'dscr', email: 'a@example.com' });
    post(h, { source: 'fha', email: 'b@example.com' });
    post(h, { source: 'DebtConsolidation', email: 'c@example.com' });
    expect(h.tabs.get('Follow-ups')!.rows.length).toBe(4); // header + 3
  });

  it('makes no HTTP call inside doPost — the stub throws if it tries', () => {
    // Bonzo and the guide senders used to run here and blew the 8s proxy budget.
    expect(() => post(h, { source: 'dscr', email: 'jane@example.com' })).not.toThrow();
  });
});

describe('a tab that already exists is extended, never rewritten', () => {
  it('appends new attribution columns to an old tab and leaves its rows intact', () => {
    // A tab created before the first-touch columns existed.
    h.tabs.set('DSCR', {
      name: 'DSCR',
      rows: [
        ['Timestamp', 'First Name', 'Last Name', 'Email', 'Phone', 'State', 'Magnet', 'Source', 'DSCR', 'Down Payment', 'Loan Amount', 'Rate', 'Licensed?'],
        ['2026-01-01', 'Old', 'Lead', 'old@example.com', '5550000000', 'CA', 'Guide', 'dscr', '1.05', '20%', '$200,000', '7.25%', 'Yes'],
      ],
    });

    post(h, { source: 'dscr', email: 'new@example.com', state: 'CA', dscr: '1.30', ...ATTR });

    const tab = h.tabs.get('DSCR')!;
    // The historical row keeps every value it had, in the same places.
    expect(tab.rows[1].slice(0, 13)).toEqual([
      '2026-01-01', 'Old', 'Lead', 'old@example.com', '5550000000', 'CA', 'Guide', 'dscr', '1.05', '20%', '$200,000', '7.25%', 'Yes',
    ]);
    // And the headers now cover the new columns, with the new row filling them.
    expect(tab.rows[0]).toContain('First Click ID');
    expect(h.rowOf('DSCR', 2)).toMatchObject({ DSCR: '1.30', 'First Click ID': 'FIRSTCLICK' });
  });

  it('does not create a second tab when one already exists under the same name', () => {
    post(h, { source: 'dscr', email: 'a@example.com' });
    post(h, { source: 'dscr', email: 'b@example.com' });
    expect([...h.tabs.keys()].filter((n) => n === 'DSCR').length).toBe(1);
    expect(h.tabs.get('DSCR')!.rows.length).toBe(3); // header + 2
  });
});

describe('failures are reported, not swallowed', () => {
  it('replies success:false and alerts when the payload is not JSON', () => {
    const res = h.doPost({ postData: { contents: '<not json>' } }) as { __body: string };
    const body = JSON.parse(res.__body);
    expect(body.success).toBe(false);
    expect(h.mail).toHaveLength(1);
    expect(h.mail[0].subject).toContain('LEAD PIPELINE FAILURE');
    expect(h.mail[0].body).toContain('<not json>'); // the raw payload is recoverable
  });

  it('alerts both recipients, so a lost lead is never one inbox away from silence', () => {
    h.doPost({ postData: { contents: 'nope' } });
    expect(h.mail[0].to.split(',').length).toBe(2);
  });

  it('an empty POST body is handled as an empty lead, not a crash', () => {
    const res = h.doPost({ postData: { contents: '' } }) as { __body: string };
    expect(JSON.parse(res.__body).success).toBe(true);
    expect(h.tabs.has('Leads')).toBe(true);
  });
});
