import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { bookingBucket } from '../src/utils/bookingBucket';
import { loadGas, TEST_PROXY_KEY, type Tab } from './helpers/gas-harness';

const cases = [
  ['equity', 'book-contact', 'home-equity'],
  ['equity', 'home-contact', 'home-equity'],
  ['equity', 'adu-contact', 'adu'],
  ['dscr', 'home-contact', 'dscr'],
  ['own-home', 'fha-contact', 'fha'],
  ['own-home', 'mortgage-calculator-contact', 'mortgage-review'],
  ['own-home', 'home-contact', 'home-purchase-refinance'],
  ['commercial', 'dscr-contact', 'commercial'],
  ['not-sure', 'home-equity-contact', 'needs-guidance'],
  ['constructor', 'home-contact', 'needs-guidance'],
];
type Migration = { copied: number; verified: number; deleted: boolean };
type Gas = {
  bookingBucket: typeof bookingBucket;
  migrateLegacyLeads: (remove?: boolean) => Migration;
  doPost: (e: unknown) => { __body: string };
  sendGuideFor: (ss: unknown, data: Record<string, unknown>) => { outcome: string };
};

describe('booking bucket parity across all three runtimes', () => {
  const browserSource = readFileSync('public/booking-chooser.js', 'utf8');
  const fn = / {2}function bookingBucket\(goal, entry\) \{[\s\S]*?\n {2}\}/.exec(browserSource)![0];
  const browserBucket = new Function(fn + '; return bookingBucket;')() as typeof bookingBucket;
  const { gas } = loadGas<Gas>({ exports: ['bookingBucket'] });
  it.each(cases)('%s from %s routes to %s', (goal, entry, expected) => {
    expect(bookingBucket(goal, entry)).toBe(expected);
    expect(browserBucket(goal, entry)).toBe(expected);
    expect(gas.bookingBucket(goal, entry)).toBe(expected);
  });
});

function migrationHarness(ready = false) {
  const h = loadGas<Gas>({
    exports: ['migrateLegacyLeads', 'doPost'],
    props: { LEAD_PROXY_KEY: TEST_PROXY_KEY, ...(ready ? { LEAD_BUCKET_ROUTING_READY: '2026-10-17-v1' } : {}) },
  });
  const rows = [
    ['Source', 'Email', 'Submission ID', 'Form ID', 'Booking Goal', 'Goals', 'Click ID', 'Test?', 'SMS Marketing Consent', 'Submission Snapshot', 'Unexpected legacy column', 'Unsubscribe?'],
    ['book-contact', 'equity@example.com', 'saved-id', 'booking-prequal', 'equity', 'My question', 'gclid-123', 'TEST', 'No', '', 'keep me', true],
    ['mortgage-calculator-contact', 'mortgage@example.com', '', 'mortgage-calculator-contact-modal', '', '=IMAGE("https://example.com")', '', '', 'Yes', '', 0, false],
    ['home-contact', 'unsure@example.com', '', 'home-contact-modal', '', 'Need guidance', '', 'TEST', '', '', false, ''],
  ];
  const tab: Tab = { name: 'Leads', rows: rows.map(row => [...row]) };
  h.tabs.set('Leads', tab);
  return { ...h, original: rows };
}

describe('retiring Leads preserves the record before deletion', () => {
  it('a classified DSCR booking does not trigger a guide request', () => {
    const calls: string[] = [];
    const h = loadGas<Gas>({ exports: ['sendGuideFor'],
      props: { NETLIFY_DSCR_PDF_URL: 'https://example.com/guide', NETLIFY_DSCR_PDF_KEY: 'test' },
      fetch: (url) => { calls.push(url); throw new Error('No guide was requested'); },
    });
    expect(h.gas.sendGuideFor({}, { source: 'dscr', formId: 'booking-prequal', email: 'test@example.com' })).toEqual({ outcome: 'skipped' });
    expect(calls).toEqual([]);
  });
  it('copies by header, preserves every legacy cell and TEST, and resumes without duplicates', () => {
    const h = migrationHarness();
    expect(h.gas.migrateLegacyLeads()).toEqual({ copied: 3, verified: 3, deleted: false });
    const equity = h.rowOf('Home Equity');
    expect(equity).toMatchObject({ Source: 'home-equity', 'Submission ID': 'saved-id', 'Click ID': 'gclid-123', 'Test?': 'TEST', 'SMS Marketing Consent': 'No', 'Unsubscribe?': true });
    const snapshot = JSON.parse(String(equity['Submission Snapshot']));
    expect(snapshot.legacyRecord.cells['Unexpected legacy column']).toBe('keep me');
    expect(snapshot.entrySource).toBe('book-contact');
    expect(h.rowOf('Mortgage Review').Goals).toBe('=IMAGE("https://example.com")');
    expect(h.rowOf('Needs Guidance')['Test?']).toBe('TEST');
    expect(h.tabs.get('Leads')!.rows).toEqual(h.original);
    expect(h.gas.migrateLegacyLeads()).toEqual({ copied: 0, verified: 3, deleted: false });
    expect(h.tabs.has('Follow-ups')).toBe(false);
  });
  it('refuses deletion until the deployed writer is verified', () => {
    const h = migrationHarness();
    expect(() => h.gas.migrateLegacyLeads(true)).toThrow(/deployed bucket writer/);
    expect(h.tabs.get('Leads')!.rows).toEqual(h.original);
  });
  it('deletes only after readback and never recreates Leads for stale clients', () => {
    const h = migrationHarness(true);
    expect(h.gas.migrateLegacyLeads(true)).toEqual({ copied: 3, verified: 3, deleted: true });
    expect(h.tabs.has('Leads')).toBe(false);
    const result = h.gas.doPost({ postData: { contents: JSON.stringify({ source: 'book-contact', formId: 'booking-prequal', bookingGoal: 'equity', email: 'new@example.com', _proxyKey: TEST_PROXY_KEY }) } });
    expect(JSON.parse(result.__body).success).toBe(true);
    expect(h.rowOf('Home Equity', 2).Source).toBe('home-equity');
    expect(h.tabs.has('Leads')).toBe(false);
  });
  it('refuses to delete when an existing destination differs', () => {
    const h = migrationHarness(true);
    h.gas.migrateLegacyLeads();
    const target = h.tabs.get('Home Equity')!;
    target.rows[1][target.rows[0].indexOf('Click ID')] = 'wrong-click';
    expect(() => h.gas.migrateLegacyLeads(true)).toThrow(/readback differs/);
    expect(h.tabs.has('Leads')).toBe(true);
  });
});

