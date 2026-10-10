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
import { loadGas, type Tab } from './helpers/gas-harness';

type Harness = {
  doPost: (e: { postData: { contents: string } }) => unknown;
  tabs: Map<string, Tab>;
  mail: Array<{ to: string; subject: string; body: string }>;
  /**
   * Every URL doPost tried to fetch. It must stay empty: an assertion that the
   * stub "throws if it tries" is worthless on its own, because doPost catches
   * everything and answers success:false rather than propagating.
   */
  http: string[];
  /** The row a tab holds, as a header -> value object. */
  rowOf: (tabName: string, index?: number) => Record<string, unknown>;
};

function load(): Harness {
  const mail: Array<{ to: string; subject: string; body: string }> = [];
  const http: string[] = [];

  // Records the URL and then throws, which is the assertion this file is built
  // around: doPost must reach no network at all.
  const { gas, tabs, rowOf } = loadGas<{ doPost: Harness['doPost'] }>({
    exports: ['doPost'],
    onMail: (m) => mail.push(m),
    fetch: (url) => {
      http.push(String(url));
      throw new Error('doPost must not make HTTP calls');
    },
  });

  return { doPost: gas.doPost, tabs, mail, http, rowOf };
}

function post(h: Harness, payload: Record<string, unknown>) {
  const res = h.doPost({ postData: { contents: JSON.stringify(payload) } }) as { __body: string };
  return JSON.parse(res.__body) as { success: boolean; error?: string };
}

describe('server-hop authentication', () => {
  it('rejects missing or forged credentials before writes and alerts', () => {
    const mail: unknown[] = [];
    const { gas, tabs } = loadGas<{ doPost: Harness['doPost'] }>({ exports: ['doPost'],
      props: { LEAD_PROXY_KEY: 'private-test-key' }, onMail: m => mail.push(m) });
    for (const payload of [{ email: 'test@gmail.com' }, { email: 'test@gmail.com', _proxyKey: 'forged' }]) {
      const result = gas.doPost({ postData: { contents: JSON.stringify(payload) } }) as { __body: string };
      expect(JSON.parse(result.__body)).toEqual({ success: false, error: 'Unauthorized' });
    }
    expect(tabs.size).toBe(0);
    expect(mail).toEqual([]);
  });

  it('accepts an authenticated lead and never stores the credential', () => {
    const { gas, tabs } = loadGas<{ doPost: Harness['doPost'] }>({ exports: ['doPost'], props: { LEAD_PROXY_KEY: 'private-test-key' } });
    const result = gas.doPost({ postData: { contents: JSON.stringify({ email: 'test@gmail.com', source: 'home-contact', _proxyKey: 'private-test-key' }) } }) as { __body: string };
    expect(JSON.parse(result.__body).success).toBe(true);
    expect(JSON.stringify([...tabs.values()])).not.toContain('private-test-key');
  });
});

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
      'Magnet/Goal': 'DSCR Rate & Cash Flow Guide',
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
      homeValue: 900000, mortgageBalance: 400000, mortgagePayment: 2600,
      totalDebtBalance: 26500, totalDebtPayment: 670, monthlySavings: 540,
      refiMonthlyPayment: 2730, refiMonthlySavings: 540,
      heloanMonthlyPayment: 336, heloanMonthlySavings: 334,
      ...ATTR,
    });
    const row = h.rowOf('Debt Consolidation');
    expect(row).toMatchObject({
      'Home Value': 900000,
      'Total Debt Payment': 670,
      'HELOAN Monthly Savings': 334,
      'UTM Source': 'google',
    });
    // The calculator can legitimately send 0, and 0 must not become ''.
    post(h, { source: 'DebtConsolidation', email: 'z@example.com', homeValue: 0, monthlySavings: 0 });
    expect(h.rowOf('Debt Consolidation', 2)['Home Value']).toBe(0);
    expect(h.rowOf('Debt Consolidation', 2)['Monthly Savings']).toBe(0);
  });

  it('Debt Consolidation ignores the two fields the form no longer has', () => {
    // Best Time to Call and Lead Source came off the form on 8 Oct. An old tab
    // still open in someone's browser, or a replayed payload, can still send
    // them, and must not bring the columns back.
    post(h, {
      source: 'DebtConsolidation', email: 'old-tab@example.com',
      bestTimeToCall: 'Morning (8am–12pm)', leadSource: 'YouTube',
    });
    const headers = h.tabs.get('Debt Consolidation')!.rows[0] as string[];
    expect(headers).not.toContain('Best Time to Call');
    expect(headers).not.toContain('Lead Source');
    expect(Object.values(h.rowOf('Debt Consolidation'))).not.toContain('YouTube');
  });

  it('Debt Consolidation stores a payment that goes UP as a negative saving', () => {
    // The site used to send a saving only when it was positive, so an option
    // that raised the payment looked exactly like one that was never priced.
    post(h, {
      source: 'DebtConsolidation', email: 'up@example.com',
      monthlySavings: -140, refiMonthlySavings: -140, heloanMonthlySavings: -310,
      refiSameTermPayment: 3100, refiSameTermSavings: -260,
    });
    expect(h.rowOf('Debt Consolidation')).toMatchObject({
      'Monthly Savings': -140,
      'Refi Monthly Savings': -140,
      'HELOAN Monthly Savings': -310,
      'Same-Payoff Refi Payment': 3100,
      'Same-Payoff Refi Savings': -260,
    });
  });

  it('Debt Consolidation records the position the options were compared against', () => {
    post(h, {
      source: 'DebtConsolidation', email: 'pos@example.com',
      estimatedEquity: 300000, currentLtv: 53.85, currentMonthlyPayment: 2870,
      weightedAvgRate: 21.4, rateSourceDate: '2026-10-01',
      debts: [
        { id: 1, type: 'Credit Card', bal: 8500, pmt: 250, rate: 24.99 },
        { id: 2, type: 'Auto Loan', bal: 18000, pmt: 420, rate: 0 },
        { id: 3, type: '', bal: 0, pmt: 0, rate: 0 },
      ],
    });
    expect(h.rowOf('Debt Consolidation')).toMatchObject({
      'Estimated Home Equity': 300000,
      'Current LTV': 53.85,
      'Current Monthly Payment': 2870,
      'Weighted Avg Rate': 21.4,
      'Rate Source Date': '2026-10-01',
      // One readable cell; the row the visitor never filled in is left out.
      Debts: 'Credit Card $8,500 at 24.99% ($250/mo); Auto Loan $18,000 ($420/mo)',
    });
  });

  it('keeps a formula out of the Debts cell, whatever the posted type says', () => {
    post(h, { source: 'DebtConsolidation', email: 'x@example.com', debts: [{ type: '=HYPERLINK("x")', bal: 100, pmt: 5 }] });
    expect(String(h.rowOf('Debt Consolidation').Debts)).toBe('HYPERLINKx $100 ($5/mo)');
  });

  it('DSCR: stores the scenario the visitor built, which used to reach only the Bonzo note', () => {
    post(h, {
      source: 'dscr', email: 'scenario@example.com', dscr: '1.14',
      purchasePrice: 320000, monthlyRent: 2600, annualTax: 3800, annualInsurance: 1400,
      monthlyHoa: 0, monthlyPI: 1678, monthlyPitia: 2111,
    });
    expect(h.rowOf('DSCR')).toMatchObject({
      'Purchase Price': 320000, 'Monthly Rent': 2600, 'Annual Tax': 3800, 'Annual Insurance': 1400,
      // No HOA is an answer here, not a blank.
      'Monthly HOA': 0, 'Monthly P&I': 1678, 'Monthly PITIA': 2111, DSCR: '1.14',
    });
  });

  it('gives every row an id, the form it came from and the page it was sent from', () => {
    post(h, {
      source: 'fha', email: 'ids@example.com', formId: 'fha-magnet',
      pageUri: 'https://realdarrentsai.com/fha/?gclid=ABC#form', firstUtmMedium: 'cpc',
    });
    expect(h.rowOf('FHA')).toMatchObject({
      'Submission ID': 'uuid-1',
      'Form ID': 'fha-magnet',
      // The path only: the query string carries the click id, which has its own column.
      Page: '/fha/',
      'First Touch Medium': 'cpc',
    });
    // The queue row carries the same id, so the two can be matched.
    expect(JSON.parse(String(h.rowOf('Follow-ups').Payload)).submissionId).toBe('uuid-1');
  });

  it('keeps the id a replayed payload already has', () => {
    post(h, { source: 'fha', email: 'replay@example.com', submissionId: 'kept-from-first-time' });
    expect(h.rowOf('FHA')['Submission ID']).toBe('kept-from-first-time');
  });

  it('does not treat an inherited property name as a funnel', () => {
    // SOURCE_SCHEMAS['constructor'] is Object, which is truthy and has no tab.
    const res = post(h, { source: 'constructor', email: 'proto@example.com' });
    expect(res.success).toBe(true);
    expect(h.rowOf('Leads')).toMatchObject({ Source: 'constructor', Email: 'proto@example.com' });
  });

  /**
   * The current rate and term were collected from the visitor and then thrown
   * away for a long time, so Darren called without knowing the two numbers that
   * decide whether a consolidation is worth doing at all.
   *
   * They sit with the rest of the mortgage, straight after its payment.
   */
  it('Debt Consolidation keeps the current rate and term, beside the mortgage payment', () => {
    post(h, {
      source: 'DebtConsolidation', email: 'rate@example.com', state: 'CA',
      mortgagePayment: 2600, mortgageRate: 3.5, mortgageTerm: 27,
      totalDebtBalance: 26500, ...ATTR,
    });
    const row = h.rowOf('Debt Consolidation');
    expect(row).toMatchObject({
      'Mortgage Payment': 2600,
      'Mortgage Rate': 3.5,
      'Mortgage Term': 27,
      'Total Debt Balance': 26500,
    });

    const headers = h.tabs.get('Debt Consolidation')!.rows[0] as string[];
    expect(headers.indexOf('Mortgage Rate')).toBe(headers.indexOf('Mortgage Payment') + 1);
    expect(headers.indexOf('Mortgage Term')).toBe(headers.indexOf('Mortgage Rate') + 1);
  });

  it('files a Debt Consolidation lead that skipped the optional rate and term', () => {
    // R3-7. Both are optional on the form, so a blank must land BLANK, while
    // still holding its column so nothing to the right shifts. It used to land
    // as 0, which reads as a 0% mortgage rate on a 0-year term: an answer,
    // rather than a question nobody was asked.
    post(h, { source: 'DebtConsolidation', email: 'norate@example.com', totalDebtBalance: 900 });
    expect(h.rowOf('Debt Consolidation')).toMatchObject({
      'Mortgage Rate': '',
      'Mortgage Term': '',
      'Total Debt Balance': 900,
    });
  });

  it('records what the HELOAN figures were priced at', () => {
    // R3-7. The tool used to pick the 680+ tier and a 10-year term on the
    // visitor's behalf, so a saving quoted at the best credit band was
    // indistinguishable in the Sheet from one the visitor actually chose.
    post(h, {
      source: 'DebtConsolidation', email: 'tier@example.com', totalDebtBalance: 900,
      heloanCreditTier: '10.49', heloanTermYears: '15',
      heloanMonthlyPayment: 812, heloanMonthlySavings: 240,
    });
    expect(h.rowOf('Debt Consolidation')).toMatchObject({
      'HELOAN Credit Tier': '10.49',
      'HELOAN Term': '15',
      'HELOAN Monthly Payment': 812,
    });
  });

  it('leaves the HELOAN columns blank when no tier was chosen', () => {
    post(h, { source: 'DebtConsolidation', email: 'notier@example.com', totalDebtBalance: 900 });
    const row = h.rowOf('Debt Consolidation');
    expect(row['HELOAN Credit Tier']).toBe('');
    expect(row['HELOAN Term']).toBe('');
    expect(row['HELOAN Monthly Payment']).toBe('');
    expect(row['HELOAN Monthly Savings']).toBe('');
    expect(row['Monthly Savings']).toBe('');
  });

  it('Debt Consolidation records licensed state, beside State like every other tab', () => {
    post(h, { source: 'DebtConsolidation', email: 'ca@example.com', state: 'CA', ...ATTR });
    post(h, { source: 'DebtConsolidation', email: 'ny@example.com', state: 'NY', ...ATTR });
    expect(h.rowOf('Debt Consolidation', 1)['Licensed?']).toBe('Yes');
    expect(h.rowOf('Debt Consolidation', 2)['Licensed?']).toBe('No');

    // It sat after the attribution block on this one tab, where the old
    // append-only rule had left it. The standard order puts it next to the
    // state it is a verdict on.
    const headers = h.tabs.get('Debt Consolidation')!.rows[0] as string[];
    const licensed = headers.indexOf('Licensed?');
    expect(licensed).toBeGreaterThan(-1);
    expect(headers[licensed - 1]).toBe('State');
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

  /**
   * heloc-hei was retired: HELOC and home-equity intent has its own page and
   * source now ('home-equity', revamp phase 3), and /yt/heloc and /yt/equity
   * point there.
   * Nothing sends the old source, but a stale link, a bookmarked form or a
   * replayed payload still could, and it must degrade to a saved lead rather
   * than a crash or a resurrected tab.
   */
  it('files a retired heloc-hei payload in Leads instead of recreating its tab', () => {
    const res = post(h, {
      source: 'heloc-hei', email: 'equity@example.com', state: 'CA',
      firstName: 'Hal', magnet: 'HELOC vs HEI', ...ATTR,
    });
    expect(res.success).toBe(true);
    expect(h.tabs.has('HELOC vs HEI')).toBe(false);
    expect(h.rowOf('Leads')).toMatchObject({
      Source: 'heloc-hei',
      Email: 'equity@example.com',
      'Licensed?': 'Yes',
      'UTM Source': 'google', // attribution survives the fall-through
    });
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

  /**
   * Bonzo and the guide senders used to run here and blew the 8s proxy budget:
   * the lead saved, but the visitor was shown an error and Darren got a false
   * "LEAD NOT SAVED" alert.
   *
   * This used to be asserted as `expect(() => post(...)).not.toThrow()`, which
   * proved nothing. doPost wraps its whole body in try/catch and answers
   * success:false, so it would never propagate the stub's throw — the test
   * passed identically whether or not an HTTP call was made. The call is now
   * recorded and counted.
   */
  it('makes no HTTP call inside doPost', () => {
    const res = post(h, { source: 'dscr', email: 'jane@example.com' });
    expect(h.http).toEqual([]);
    // And the belt-and-braces version of the same claim: had it called out, the
    // stub's throw would have been swallowed into exactly these two signals.
    expect(res.success).toBe(true);
    expect(h.mail).toHaveLength(0);
  });

  it('still queues the follow-up when the lead is one the guide senders serve', () => {
    // The guide call must happen later, off the response path, but the row that
    // makes it happen has to exist before doPost replies.
    post(h, { source: 'fha', email: 'ben@example.com' });
    expect(h.http).toEqual([]);
    expect(h.rowOf('Follow-ups')).toMatchObject({ Status: 'pending', Source: 'fha' });
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
  it('rejects malformed anonymous JSON without sending a failure email', () => {
    const res = h.doPost({ postData: { contents: '<not json>' } }) as { __body: string };
    const body = JSON.parse(res.__body);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Invalid JSON');
    expect(h.mail).toHaveLength(0);
  });

  it('rejects non-object input without creating rows or emailing Darren', () => {
    for (const contents of ['null', '[]', '"text"']) {
      const res = h.doPost({ postData: { contents } }) as { __body: string };
      expect(JSON.parse(res.__body)).toEqual({ success: false, error: 'Invalid payload' });
    }
    expect(h.tabs.size).toBe(0);
    expect(h.mail).toEqual([]);
  });

  it('an empty POST body is handled as an empty lead, not a crash', () => {
    const res = h.doPost({ postData: { contents: '' } }) as { __body: string };
    expect(JSON.parse(res.__body).success).toBe(true);
    expect(h.tabs.has('Leads')).toBe(true);
  });
});

/**
 * Telling a test row from a lead.
 *
 * The Sheet holds four real leads and more than twenty test rows with nothing
 * to separate them, so the one question anyone asks it — how are we doing —
 * cannot be answered without reading every row by eye.
 */
describe('triage columns', () => {
  const LEAD = { source: 'DebtConsolidation', state: 'CA', ...ATTR };

  it('flags a test address, with or without a plus tag', () => {
    post(h, { ...LEAD, email: 'liannemaxbalbastro+case14@gmail.com' });
    post(h, { ...LEAD, email: 'lmbalbastro@gmail.com' });
    expect(h.rowOf('Debt Consolidation', 1)['Test?']).toBe('TEST');
    expect(h.rowOf('Debt Consolidation', 2)['Test?']).toBe('TEST');
  });

  it('flags a 555-01xx phone, which was never a real person', () => {
    post(h, { ...LEAD, email: 'someone@example.com', phone: '(714) 555-0122' });
    expect(h.rowOf('Debt Consolidation', 1)['Test?']).toBe('TEST');
  });

  it('leaves a real lead alone, plus tag and all', () => {
    // The rule is an explicit list, not "has a plus tag". Plus addressing is
    // something real people use, and mislabelling a real lead as a test is how
    // a real lead stops being called.
    post(h, { ...LEAD, email: 'sam+mortgage@gmail.com', phone: '(714) 882-1190' });
    expect(h.rowOf('Debt Consolidation', 1)['Test?']).toBe('');
  });

  it('leaves Status and Contacted for a person to fill in', () => {
    post(h, { ...LEAD, email: 'sam@example.com' });
    const row = h.rowOf('Debt Consolidation', 1);
    expect(row['Status']).toBe('');
    expect(row['Contacted']).toBe('');
  });

  it('reaches every lead-bearing tab', () => {
    for (const [source, tab] of [
      ['dscr', 'DSCR'],
      ['fha', 'FHA'],
      ['real-estate-investing', 'Real Estate Investing'],
      ['MortgageCalculator', 'Leads'],
      ['QualifyForm', 'Qualify'],
    ] as const) {
      const fresh = load();
      post(fresh, { source, email: 'liannemaxbalbastro+x@gmail.com', state: 'CA', ...ATTR });
      expect(fresh.rowOf(tab, 1)['Test?'], tab).toBe('TEST');
    }
  });
});
