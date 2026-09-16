/**
 * Tests for google-apps-script.js.
 *
 * The file targets the Apps Script runtime, so it is evaluated here with the GAS
 * globals stubbed and the pure functions pulled out. That keeps the tests honest:
 * they run the same source that gets deployed, not a copy.
 *
 * The alignment tests are the important ones. A header array and its row builder
 * drifting out of sync writes every value one column off, and on a tab that
 * already holds real leads that is not recoverable.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SOURCE = readFileSync(resolve(__dirname, '../google-apps-script.js'), 'utf8');

type Gas = {
  ATTR_HEADERS: string[];
  attrRow: (d: Record<string, unknown>) => unknown[];
  LEAD_HEADERS: string[];
  QUALIFY_HEADERS: string[];
  NEWSLETTER_HEADERS: string[];
  DEBT_CONSOLIDATION_HEADERS: string[];
  SOURCE_SCHEMAS: Record<string, { tab: string; headers: string[]; row: (d: Record<string, unknown>) => unknown[] }>;
  isDuplicateLead: (sheet: unknown, email: string, phone: string) => boolean;
  ensureHeaders: (sheet: unknown, headers: string[]) => void;
  bonzoTag: (value: string) => string;
  isLicensedState: (s: string) => boolean;
  addMortgageFields: (body: Record<string, unknown>, d: Record<string, unknown>) => void;
  attributionTags: (d: Record<string, unknown>) => string[];
};

/** Evaluate the Apps Script source with GAS globals stubbed, and expose its top-level bindings. */
function loadGas(): Gas {
  const names = [
    'ATTR_HEADERS', 'attrRow', 'LEAD_HEADERS', 'QUALIFY_HEADERS', 'NEWSLETTER_HEADERS',
    'DEBT_CONSOLIDATION_HEADERS', 'SOURCE_SCHEMAS', 'isDuplicateLead', 'ensureHeaders',
    'bonzoTag', 'isLicensedState', 'addMortgageFields', 'attributionTags',
  ];
  const stubs = `
    var PropertiesService = { getScriptProperties: function(){ return { getProperty: function(){ return ''; } }; } };
    var SpreadsheetApp = { openById: function(){ return {}; } };
    var UrlFetchApp = { fetch: function(){ return { getResponseCode: function(){ return 200; }, getContentText: function(){ return '{}'; } }; } };
    var Logger = { log: function(){} };
    var MailApp = { sendEmail: function(){} };
    var CacheService = { getScriptCache: function(){ return { get: function(){ return null; }, put: function(){} }; } };
    var LockService = { getScriptLock: function(){ return { waitLock: function(){}, releaseLock: function(){} }; } };
    var ContentService = { createTextOutput: function(){ return { setMimeType: function(){ return {}; } }; }, MimeType: { JSON: 'json' } };
  `;
  const factory = new Function(`${stubs}\n${SOURCE}\nreturn { ${names.join(', ')} };`);
  return factory() as Gas;
}

let gas: Gas;
beforeEach(() => { gas = loadGas(); });

/** Minimal fake of the Sheets Range/Sheet surface ensureHeaders touches. */
function fakeSheet(headerRow: string[]) {
  const state = { headers: [...headerRow], writes: 0 };
  return {
    state,
    getLastColumn: () => state.headers.length,
    getRange: (_row: number, col: number, _numRows: number, numCols: number) => ({
      setValues: (values: string[][]) => {
        state.writes += 1;
        for (let i = 0; i < numCols; i++) state.headers[col - 1 + i] = values[0][i];
        return this;
      },
      setFontWeight: () => ({ setBackground: () => ({ setFontColor: () => ({}) }) }),
      setBackground: () => ({}),
      setFontColor: () => ({}),
    }),
  };
}

const SAMPLE = {
  timestamp: '2026-09-16T00:00:00Z',
  firstName: 'Jane', lastName: 'Investor', email: 'jane@example.com',
  phone: '(555) 555-0123', state: 'AZ', magnet: 'Guide', source: 'dscr',
  dscr: '1.14', downPayment: '25%', loanAmount: '$240,000', rate: '7.00%',
  creditScore: '740',
  utm_source: 'google', utm_medium: 'cpc', utm_campaign: 'heloc-q4',
  utm_term: 'dscr loan', utm_content: 'ad-a',
  clickId: 'ABC123', clickIdType: 'gclid',
  landingPage: '/dscr/?gclid=ABC123', referrer: 'https://www.google.com/',
  firstUtmSource: 'youtube', firstUtmCampaign: 'yt-dscr',
};

describe('column alignment — a mismatch here corrupts a live sheet', () => {
  it('ATTR_HEADERS and attrRow have the same length', () => {
    expect(gas.attrRow(SAMPLE).length).toBe(gas.ATTR_HEADERS.length);
  });

  it.each(['heloc-hei', 'dscr', 'self-employed', 'fha', 'real-estate-investing'])(
    'SOURCE_SCHEMAS[%s] headers match its row length',
    (key) => {
      const schema = gas.SOURCE_SCHEMAS[key];
      expect(schema.row({ ...SAMPLE, source: key }).length).toBe(schema.headers.length);
    },
  );

  it('every schema ends with the attribution columns, so earlier columns keep their meaning', () => {
    for (const key of Object.keys(gas.SOURCE_SCHEMAS)) {
      const headers = gas.SOURCE_SCHEMAS[key].headers;
      expect(headers.slice(-gas.ATTR_HEADERS.length)).toEqual(gas.ATTR_HEADERS);
    }
    expect(gas.LEAD_HEADERS.slice(-gas.ATTR_HEADERS.length)).toEqual(gas.ATTR_HEADERS);
    expect(gas.QUALIFY_HEADERS.slice(-gas.ATTR_HEADERS.length)).toEqual(gas.ATTR_HEADERS);
    expect(gas.DEBT_CONSOLIDATION_HEADERS.slice(-gas.ATTR_HEADERS.length)).toEqual(gas.ATTR_HEADERS);
  });

  it('the attribution values land in the same positions as their headers', () => {
    const schema = gas.SOURCE_SCHEMAS['dscr'];
    const row = schema.row(SAMPLE);
    const at = (name: string) => row[schema.headers.indexOf(name)];
    expect(at('Click ID')).toBe('ABC123');
    expect(at('Click ID Type')).toBe('gclid');
    expect(at('UTM Campaign')).toBe('heloc-q4');
    expect(at('First Touch Source')).toBe('youtube');
    expect(at('Landing Page')).toBe('/dscr/?gclid=ABC123');
    // and the pre-existing columns are untouched
    expect(at('DSCR')).toBe('1.14');
    expect(at('Email')).toBe('jane@example.com');
    expect(at('Licensed?')).toBe('Yes');
  });

  it('newsletter keeps its original shape (isDuplicateLead assumes cols 4/5 elsewhere)', () => {
    expect(gas.NEWSLETTER_HEADERS).toEqual(['Timestamp', 'Email', 'Source']);
  });

  it('attrRow yields empty strings, never undefined, for an untracked lead', () => {
    const row = gas.attrRow({});
    expect(row.length).toBe(gas.ATTR_HEADERS.length);
    for (const cell of row) expect(cell).toBe('');
  });
});

describe('ensureHeaders', () => {
  it('appends only the columns the tab is missing', () => {
    const sheet = fakeSheet(['Timestamp', 'Email']);
    gas.ensureHeaders(sheet, ['Timestamp', 'Email', 'UTM Source', 'Click ID']);
    expect(sheet.state.headers).toEqual(['Timestamp', 'Email', 'UTM Source', 'Click ID']);
  });

  it('is idempotent — a second run writes nothing', () => {
    const headers = ['Timestamp', 'Email', 'UTM Source'];
    const sheet = fakeSheet(['Timestamp', 'Email']);
    gas.ensureHeaders(sheet, headers);
    const writesAfterFirst = sheet.state.writes;
    gas.ensureHeaders(sheet, headers);
    expect(sheet.state.writes).toBe(writesAfterFirst);
  });

  it('never rewrites an existing header cell', () => {
    const sheet = fakeSheet(['Timestamp', 'RENAMED BY HAND']);
    gas.ensureHeaders(sheet, ['Timestamp', 'Email', 'UTM Source']);
    expect(sheet.state.headers[1]).toBe('RENAMED BY HAND');
  });

  it('is a no-op when the tab already has more columns than the schema', () => {
    const sheet = fakeSheet(['a', 'b', 'c', 'd']);
    gas.ensureHeaders(sheet, ['a', 'b']);
    expect(sheet.state.writes).toBe(0);
  });
});

describe('isDuplicateLead — the numeric-cell landmine', () => {
  function sheetWith(rows: Array<[unknown, unknown]>) {
    return {
      getLastRow: () => rows.length + 1,
      getRange: (_r: number, col: number) => ({
        getValues: () => rows.map((row) => [col === 4 ? row[0] : row[1]]),
      }),
    };
  }

  it('does not throw when Sheets returns a Number for a phone cell', () => {
    const sheet = sheetWith([['jane@example.com', 5551234567]]);
    expect(() => gas.isDuplicateLead(sheet, 'new@example.com', '(555) 555-9999')).not.toThrow();
  });

  it('still matches a duplicate phone stored as a Number', () => {
    const sheet = sheetWith([['jane@example.com', 5551234567]]);
    expect(gas.isDuplicateLead(sheet, 'other@example.com', '(555) 123-4567')).toBe(true);
  });

  it('matches email case-insensitively', () => {
    const sheet = sheetWith([['Jane@Example.com', '']]);
    expect(gas.isDuplicateLead(sheet, 'jane@example.com', '')).toBe(true);
  });

  it('returns false for a genuinely new lead', () => {
    const sheet = sheetWith([['jane@example.com', 5551234567]]);
    expect(gas.isDuplicateLead(sheet, 'new@example.com', '(555) 000-1111')).toBe(false);
  });

  it('handles an empty sheet', () => {
    expect(gas.isDuplicateLead({ getLastRow: () => 1 }, 'a@b.com', '5551112222')).toBe(false);
  });
});

describe('bonzo tag sanitisation', () => {
  it.each([
    ['HELOC Q4', 'heloc-q4'],
    ['brand & equity', 'brand-equity'],
    ['a+b', 'a-b'],
    ['UPPER_Case', 'upper-case'],
    ['  padded  ', 'padded'],
    ['dscr', 'dscr'],
  ])('sanitises %s to %s', (input, expected) => {
    expect(gas.bonzoTag(input)).toBe(expected);
  });

  it('produces only [a-z0-9-]', () => {
    expect(gas.bonzoTag('Ünïcødé 🎉 Ads!')).toMatch(/^[a-z0-9-]*$/);
  });
});

describe('attribution tags', () => {
  it('tags a Google ad click', () => {
    const tags = gas.attributionTags({ clickIdType: 'gclid', utm_source: 'google', utm_campaign: 'HELOC Q4' });
    expect(tags).toContain('ads:google');
    expect(tags).toContain('utm:google');
    expect(tags).toContain('campaign:heloc-q4');
  });

  it.each([
    ['gbraid', 'ads:google'],
    ['wbraid', 'ads:google'],
    ['msclkid', 'ads:bing'],
    ['fbclid', 'ads:meta'],
  ])('maps %s to %s', (type, tag) => {
    expect(gas.attributionTags({ clickIdType: type })).toContain(tag);
  });

  it('tags the unattributed set so broken tracking is visible', () => {
    expect(gas.attributionTags({})).toEqual(['attr:none']);
  });

  it('does not emit attr:none when there is real attribution', () => {
    expect(gas.attributionTags({ utm_source: 'youtube' })).not.toContain('attr:none');
  });
});

describe('existing behaviour preserved', () => {
  it('still maps DSCR mortgage fields to the values verified in production', () => {
    const body: Record<string, unknown> = {};
    gas.addMortgageFields(body, {
      source: 'dscr', state: 'AZ', magnet: 'DSCR Rate & Cash Flow Guide',
      dscr: '1.14', downPayment: '25%', rate: '7.00%', loanAmount: '$240,000',
      downPaymentAmount: 80000, purchasePrice: 320000,
      monthlyRent: 2400, monthlyPitia: 2047,
    });
    expect(body.loan_amount).toBe('240000');
    expect(body.down_payment).toBe('80000');
    expect(body.purchase_price).toBe('320000');
    expect(body.interest_rate).toBe('7.00');
    expect(body.monthly_payment).toBe('2047');
    expect(body.monthly_income).toBe('2400');
    expect(body.loan_program).toBe('DSCR 1.14');
    expect(body.property_state).toBe('AZ');
  });

  it('still derives down payment from the percent when exact values are absent', () => {
    const body: Record<string, unknown> = {};
    gas.addMortgageFields(body, { source: 'dscr', loanAmount: '$300,000', downPayment: '25%' });
    expect(body.down_payment).toBe('100000');
    expect(body.purchase_price).toBe('400000');
  });

  it('keeps the licensed-state list intact', () => {
    for (const s of ['AZ', 'CA', 'FL', 'HI', 'OR', 'PA', 'TN', 'TX']) {
      expect(gas.isLicensedState(s)).toBe(true);
    }
    expect(gas.isLicensedState('MO')).toBe(false);
  });
});
