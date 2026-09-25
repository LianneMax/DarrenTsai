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
import { loadGas as loadHarness } from './helpers/gas-harness';

// Read separately from the harness: most of the describes below assert on the
// raw source text rather than on the evaluated bindings.
const SOURCE = readFileSync(resolve(__dirname, '../google-apps-script.js'), 'utf8');

type Gas = {
  ATTR_HEADERS: string[];
  attrRow: (d: Record<string, unknown>) => unknown[];
  LEAD_HEADERS: string[];
  QUALIFY_HEADERS: string[];
  NEWSLETTER_HEADERS: string[];
  DEBT_CONSOLIDATION_HEADERS: string[];
  SOURCE_SCHEMAS: Record<string, { tab: string; headers: string[]; row: (d: Record<string, unknown>) => unknown[] }>;
  ensureHeaders: (sheet: unknown, headers: string[]) => void;
  bonzoTag: (value: string) => string;
  isLicensedState: (s: string) => boolean;
  addMortgageFields: (body: Record<string, unknown>, d: Record<string, unknown>) => void;
  attributionTags: (d: Record<string, unknown>) => string[];
  FOLLOWUP_HEADERS: string[];
  classifyGuideResponse: (code: number) => string;
  nextGuideStatus: (outcome: string, attempt: number) => { status: string; alert: boolean };
  guideAttemptsFromStatus: (status: unknown) => number;
  GUIDE_MAX_ATTEMPTS: number;
  GUIDE_BACKOFF_MIN: number[];
  FOLLOWUP_ORPHAN_MS: number;
  guideBackoffMs: (attemptsMade: number) => number;
  claimDecision: (status: unknown, processedAt: unknown, now: number) => { claim: boolean; attempts: number; reason: string };
  guideDigestRows: (rows: unknown[][], now: number) => Array<{ row: number; status: string; source: string; email: string; error: string }>;
  formatGuideDigest: (items: Array<Record<string, unknown>>) => string;
  FOLLOWUP_COL: Record<string, number>;
  DEBUG_HEADERS: string[];
  effectiveTouch: (d: Record<string, unknown>) => { fromFirst: boolean; source: string; campaign: string; content: string };
  effectiveClickId: (d: Record<string, unknown>) => string;
  effectiveClickIdType: (d: Record<string, unknown>) => string;
};

/**
 * Evaluate the Apps Script source with GAS globals stubbed, and expose its
 * top-level bindings.
 *
 * `spreadsheet: false` because this file only reads pure helpers and the header
 * arrays; it never drives a function that touches a sheet, so openById hands
 * back a bare {} exactly as it always did. The Range surface ensureHeaders needs
 * comes from fakeSheet() below, which is a different shape from the shared fake.
 */
function loadGas(): Gas {
  return loadHarness<Gas>({
    spreadsheet: false,
    exports: [
      'ATTR_HEADERS', 'attrRow', 'LEAD_HEADERS', 'QUALIFY_HEADERS', 'NEWSLETTER_HEADERS',
      'DEBT_CONSOLIDATION_HEADERS', 'SOURCE_SCHEMAS', 'ensureHeaders',
      'bonzoTag', 'isLicensedState', 'addMortgageFields', 'attributionTags', 'effectiveTouch',
      'FOLLOWUP_HEADERS', 'effectiveClickId', 'effectiveClickIdType',
      'classifyGuideResponse', 'nextGuideStatus', 'guideAttemptsFromStatus', 'GUIDE_MAX_ATTEMPTS',
      'GUIDE_BACKOFF_MIN', 'FOLLOWUP_ORPHAN_MS', 'guideBackoffMs', 'claimDecision',
      'guideDigestRows', 'formatGuideDigest', 'FOLLOWUP_COL', 'DEBUG_HEADERS',
    ],
  }).gas;
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

  it.each(['dscr', 'self-employed', 'fha', 'real-estate-investing'])(
    'SOURCE_SCHEMAS[%s] headers match its row length',
    (key) => {
      const schema = gas.SOURCE_SCHEMAS[key];
      expect(schema.row({ ...SAMPLE, source: key }).length).toBe(schema.headers.length);
    },
  );

  /**
   * The invariant is that the attribution block stays CONTIGUOUS and in order,
   * so attrRow's values keep landing under their own headers. It used to be
   * phrased as "must be last", which is how it happens to sit on most tabs but
   * is not the actual requirement: Debt Consolidation has 'Licensed?' appended
   * after it, because that column was added later and the append-only rule
   * forbids inserting it further left on a tab that already holds rows.
   */
  it('keeps the attribution columns contiguous and in order on every tab', () => {
    const schemas: Array<[string, string[]]> = [
      ...Object.keys(gas.SOURCE_SCHEMAS).map((k) => [k, gas.SOURCE_SCHEMAS[k].headers] as [string, string[]]),
      ['LEAD_HEADERS', gas.LEAD_HEADERS],
      ['QUALIFY_HEADERS', gas.QUALIFY_HEADERS],
      ['DEBT_CONSOLIDATION_HEADERS', gas.DEBT_CONSOLIDATION_HEADERS],
    ];
    for (const [name, headers] of schemas) {
      const start = headers.indexOf(gas.ATTR_HEADERS[0]);
      expect(start, `${name} has no attribution columns at all`).toBeGreaterThan(-1);
      expect(
        headers.slice(start, start + gas.ATTR_HEADERS.length),
        `${name} interleaves something into the attribution block`,
      ).toEqual(gas.ATTR_HEADERS);
    }
  });

  it('puts Licensed? after attribution on Debt Consolidation, and nowhere else', () => {
    // Pinned because it looks like a mistake and is not: see the header comment
    // on DEBT_CONSOLIDATION_HEADERS.
    const dc = gas.DEBT_CONSOLIDATION_HEADERS;
    expect(dc[dc.length - 1]).toBe('Licensed?');
    expect(dc[dc.length - 2]).toBe(gas.ATTR_HEADERS[gas.ATTR_HEADERS.length - 1]);
    // Every other tab still has it before the attribution block.
    for (const key of Object.keys(gas.SOURCE_SCHEMAS)) {
      const headers = gas.SOURCE_SCHEMAS[key].headers;
      expect(headers.indexOf('Licensed?')).toBeLessThan(headers.indexOf(gas.ATTR_HEADERS[0]));
    }
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

  it('newsletter keeps its original email-only shape', () => {
    expect(gas.NEWSLETTER_HEADERS).toEqual(['Timestamp', 'Email', 'Source']);
  });

  it('attrRow yields empty strings, never undefined, for an untracked lead', () => {
    const row = gas.attrRow({});
    expect(row.length).toBe(gas.ATTR_HEADERS.length);
    for (const cell of row) expect(cell).toBe('');
  });

  /**
   * doPost builds some rows inline rather than through SOURCE_SCHEMAS, so the
   * length-parity tests above cannot see them. This caught a real bug: the
   * Qualify branch kept writing 12 values after QUALIFY_HEADERS grew to 23,
   * which would have left attribution permanently blank on that tab.
   *
   * Source-level rather than behavioural because those rows are literals inside
   * doPost with no seam to call.
   */
  it('every inline appendRow in doPost writes the attribution columns', () => {
    const doPost = SOURCE.slice(SOURCE.indexOf('function doPost'));
    const branches = [...doPost.matchAll(/getOrCreateSheet\(ss, '([^']+)', (\w+)\)/g)];
    expect(branches.length).toBeGreaterThan(0);

    for (const [, tabName, headersConst] of branches) {
      // Newsletter deliberately has no attribution columns.
      if (headersConst === 'NEWSLETTER_HEADERS') continue;

      const after = doPost.slice(doPost.indexOf(`getOrCreateSheet(ss, '${tabName}'`));
      const upToNextBranch = after.slice(0, after.indexOf('getOrCreateSheet', 10) + 1 || after.length);
      expect(
        // `concat(attrRow(data)` without the closing paren, so a branch that
        // appends a further column after it still counts.
        upToNextBranch.includes('concat(attrRow(data)') || upToNextBranch.includes('schema.row(data)'),
        `the "${tabName}" branch writes a row without concat(attrRow(data)), so its ` +
        `${headersConst} attribution columns would stay blank`,
      ).toBe(true);
    }
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

/**
 * The case this guards: someone clicks a Google ad, leaves, then comes back
 * weeks later through organic YouTube or search and converts. Their last touch
 * has no click id, so attributing on last touch alone loses the gclid entirely
 * and files a paid lead as organic.
 */
describe('first-touch fallback for returning visitors', () => {
  const returningVisitor = {
    // last touch: organic YouTube, no click id
    utm_source: 'youtube.com', utm_medium: 'referral',
    clickId: '', clickIdType: '',
    // first touch: the Google ad that originally found them, still in window
    firstUtmSource: 'google', firstUtmCampaign: 'heloc-q4',
    firstClickId: 'GCLID_FROM_THE_AD', firstClickIdType: 'gclid',
  };

  it('keeps the first-touch click id in its own column', () => {
    const row = gas.attrRow(returningVisitor);
    expect(row[gas.ATTR_HEADERS.indexOf('First Click ID')]).toBe('GCLID_FROM_THE_AD');
    expect(row[gas.ATTR_HEADERS.indexOf('First Click ID Type')]).toBe('gclid');
  });

  it('attributes the lead to the ad click rather than nothing', () => {
    expect(gas.effectiveClickId(returningVisitor)).toBe('GCLID_FROM_THE_AD');
  });

  it('still tags it ads:google, not just organic youtube', () => {
    const tags = gas.attributionTags(returningVisitor);
    expect(tags).toContain('ads:google');
    expect(tags).not.toContain('attr:none');
  });

  it('takes source and campaign from the same touch as the click, so tags never name two origins', () => {
    const tags = gas.attributionTags(returningVisitor);
    expect(tags).toContain('utm:google');
    expect(tags).toContain('campaign:heloc-q4');
    expect(tags).not.toContain('utm:youtube-com');
  });

  it('keeps the latest visit under its own last: prefix', () => {
    expect(gas.attributionTags(returningVisitor)).toContain('last:youtube-com');
  });

  it('uses the latest touch, with no last: tag, when the latest visit has the click', () => {
    const clickedAgain = { ...returningVisitor, clickId: 'NEWER_GCLID', clickIdType: 'gclid', utm_source: 'google', utm_campaign: 'dscr' };
    const tags = gas.attributionTags(clickedAgain);
    expect(tags).toContain('campaign:dscr');
    expect(tags.some((t) => t.startsWith('last:'))).toBe(false);
  });

  it('credits the first-touch campaign in current_step too', () => {
    expect(gas.effectiveTouch(returningVisitor)).toMatchObject({ fromFirst: true, campaign: 'heloc-q4' });
  });

  it('prefers the most recent click id when there is one', () => {
    const clickedAgain = { ...returningVisitor, clickId: 'NEWER_GCLID', clickIdType: 'gclid' };
    expect(gas.effectiveClickId(clickedAgain)).toBe('NEWER_GCLID');
  });

  it('respects the network of the newer click when they differ', () => {
    const switchedNetwork = { ...returningVisitor, clickId: 'BING_ID', clickIdType: 'msclkid' };
    expect(gas.effectiveClickIdType(switchedNetwork)).toBe('msclkid');
    expect(gas.attributionTags(switchedNetwork)).toContain('ads:bing');
  });

  it('yields nothing for a lead that never had a click id', () => {
    expect(gas.effectiveClickId({ utm_source: 'youtube.com' })).toBe('');
    expect(gas.attributionTags({})).toEqual(['attr:none']);
  });

  it('records every first-touch field attribution.js sends', () => {
    // A field sent by the client but absent from ATTR_HEADERS is silently
    // dropped, which is exactly how the first-touch click id was lost.
    const sent = ['firstUtmSource', 'firstUtmCampaign', 'firstClickId', 'firstClickIdType', 'firstTouchTs'];
    const written = gas.attrRow(
      Object.fromEntries(sent.map((k) => [k, `value-${k}`])),
    ) as string[];
    for (const key of sent) {
      expect(written, `${key} is sent by attribution.js but never written to the sheet`)
        .toContain(`value-${key}`);
    }
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

/**
 * doPost must not make any HTTP call. Bonzo plus the guide senders (one renders
 * a PDF) ran past the proxy's 8s budget in production on 16 Sep: the lead saved,
 * but the visitor saw an error and Darren got a false NOT SAVED alert.
 */
describe('doPost replies before the slow follow-ups', () => {
  const body = () => {
    const start = SOURCE.indexOf('function doPost');
    return SOURCE.slice(start, SOURCE.indexOf('\nfunction ', start + 1));
  };
  const processFollowUps = () => {
    const start = SOURCE.indexOf('function processFollowUps');
    return SOURCE.slice(start, SOURCE.indexOf('\nfunction ', start + 1));
  };

  it('does not call Bonzo or any guide sender inline', () => {
    const src = body();
    for (const fn of ['pushToBonzo(', 'sendDscrGuide(', 'sendReiGuide(', 'sendFhaGuide(', 'UrlFetchApp.fetch(']) {
      expect(src, `${fn} runs inside doPost and will blow the proxy timeout`).not.toContain(fn);
    }
  });

  it('queues the follow-up before replying', () => {
    const src = body();
    expect(src).toContain('enqueueFollowUp(');
    expect(src.indexOf('enqueueFollowUp(')).toBeLessThan(src.indexOf('success: true'));
  });

  it('processFollowUps still runs every step the old inline path did', () => {
    const src = processFollowUps();
    expect(src).toContain('pushToBonzo(');
    expect(src).toContain('sendGuideFor(');
    const start = SOURCE.indexOf('function sendGuideFor');
    const guideFor = SOURCE.slice(start, SOURCE.indexOf('\nfunction ', start + 1));
    for (const fn of ['sendDscrGuide(', 'sendReiGuide(', 'sendFhaGuide(']) {
      expect(guideFor).toContain(fn);
    }
  });

  it('claims a row before doing HTTP, so a crashed run cannot send twice', () => {
    const src = processFollowUps();
    expect(src.indexOf("'processing'")).toBeLessThan(src.indexOf('pushToBonzo('));
  });

  /**
   * The queue must never hold the script lock across its HTTP. doPost waits on
   * that same lock for 20s, so a multi-minute batch holding it would fail the
   * live submissions this queue exists to protect.
   */
  it('does not hold the script lock across the HTTP calls', () => {
    const src = processFollowUps();
    expect(src).not.toMatch(/getScriptLock\(\)/);
    expect(src, 'overlap guard should be the self-expiring cache key, not the script lock')
      .toContain('FOLLOWUP_RUNNING_KEY');
  });

  it('serialises each sheet write against doPost via withSheetLock', () => {
    expect(processFollowUps()).toContain('withSheetLock(');
  });

  it('keeps the payload as the last follow-up column', () => {
    expect(gas.FOLLOWUP_HEADERS[gas.FOLLOWUP_HEADERS.length - 1]).toBe('Payload');
  });
});

/**
 * A guide that failed used to be logged and swallowed, so the queue marked the
 * lead 'done'. Found on 16 Sep: four DSCR guides returned 502 in the Debug tab
 * while every Follow-ups row read done.
 */
describe('guide email outcomes', () => {
  it('classifies responses: 2xx sent, 429 and 5xx retry, other 4xx rejected', () => {
    expect(gas.classifyGuideResponse(200)).toBe('sent');
    expect(gas.classifyGuideResponse(503)).toBe('retry');
    expect(gas.classifyGuideResponse(502)).toBe('retry');
    expect(gas.classifyGuideResponse(429)).toBe('retry');
    expect(gas.classifyGuideResponse(422)).toBe('rejected'); // Resend: invalid `to`
    expect(gas.classifyGuideResponse(401)).toBe('rejected'); // bad x-api-key
  });

  it('only a sent or skipped guide is done', () => {
    expect(gas.nextGuideStatus('sent', 1)).toEqual({ status: 'done', alert: false });
    expect(gas.nextGuideStatus('skipped', 1)).toEqual({ status: 'done', alert: false });
    expect(gas.nextGuideStatus('retry', 1).status).not.toBe('done');
    expect(gas.nextGuideStatus('rejected', 1).status).not.toBe('done');
  });

  it('never retries a rejection, and alerts on it immediately', () => {
    expect(gas.nextGuideStatus('rejected', 1)).toEqual({ status: 'guide-rejected', alert: true });
  });

  it('retries quietly up to the limit, then fails loudly', () => {
    const max = gas.GUIDE_MAX_ATTEMPTS;
    for (let a = 1; a < max; a++) {
      expect(gas.nextGuideStatus('retry', a)).toEqual({ status: `guide-retry:${a}`, alert: false });
    }
    expect(gas.nextGuideStatus('retry', max)).toEqual({ status: 'guide-failed', alert: true });
  });

  it('reads the attempt count back from a retry status', () => {
    expect(gas.guideAttemptsFromStatus('guide-retry:2')).toBe(2);
    expect(gas.guideAttemptsFromStatus('pending')).toBe(0);
    expect(gas.guideAttemptsFromStatus('done')).toBe(0);
    expect(gas.guideAttemptsFromStatus('')).toBe(0);
  });

  it('a retry pass re-sends the guide but never pushes to Bonzo again', () => {
    const start = SOURCE.indexOf('function processFollowUps');
    const src = SOURCE.slice(start, SOURCE.indexOf('\nfunction ', start + 1));
    expect(src).toMatch(/if \(priorAttempts === 0\) pushToBonzo\(/);
    expect(src).not.toMatch(/setValues\(\[\['done'/); // done only via nextGuideStatus
  });

  it('every guide sender reports an outcome instead of swallowing it', () => {
    for (const name of ['sendDscrGuide', 'sendReiGuide', 'sendFhaGuide']) {
      const start = SOURCE.indexOf(`function ${name}`);
      const src = SOURCE.slice(start, SOURCE.indexOf('\nfunction ', start + 1));
      expect(src, name).toMatch(/return postGuide\(/);
      expect(src, name).toContain("return { outcome: 'skipped' }");
    }
  });
});

/**
 * Patch 0003 retried a failed guide once per trigger run, so all three attempts
 * were spent inside three minutes. A Resend outage lasts longer than that: every
 * lead submitted during one would reach 'guide-failed' having barely tried.
 *
 * It also claimed each row as a bare 'processing', which threw away the attempt
 * count and, if the run died mid-call, left the row stuck in that state forever
 * with no way for a later run to tell a live claim from a dead one.
 */
describe('retry scheduling', () => {
  const MIN = 60 * 1000;

  it('waits longer after each failure instead of hammering once a minute', () => {
    const waits = [1, 2, 3, 4, 5].map((n) => gas.guideBackoffMs(n) / MIN);
    expect(waits).toEqual(gas.GUIDE_BACKOFF_MIN);
    for (let i = 1; i < waits.length; i++) expect(waits[i]).toBeGreaterThan(waits[i - 1]);
  });

  it('spreads its attempts over hours, not minutes', () => {
    let total = 0;
    for (let n = 1; n < gas.GUIDE_MAX_ATTEMPTS; n++) total += gas.guideBackoffMs(n);
    expect(total / (60 * MIN)).toBeGreaterThan(3); // hours
  });

  it('takes a new row at once', () => {
    expect(gas.claimDecision('pending', '', Date.now())).toEqual({ claim: true, attempts: 0, reason: 'new' });
  });

  it('leaves a failed guide alone until its backoff has passed', () => {
    const now = Date.now();
    const justNow = new Date(now - 10 * 1000).toISOString();
    expect(gas.claimDecision('guide-retry:1', justNow, now).claim).toBe(false);

    const later = new Date(now - 2 * MIN).toISOString();
    expect(gas.claimDecision('guide-retry:1', later, now)).toEqual({ claim: true, attempts: 1, reason: 'retry' });
  });

  it('honours the longer waits at higher attempt counts', () => {
    const now = Date.now();
    const thirtyMinAgo = new Date(now - 30 * MIN).toISOString();
    // attempt 3 waits 20 min: due. attempt 4 waits 60 min: not due.
    expect(gas.claimDecision('guide-retry:3', thirtyMinAgo, now).claim).toBe(true);
    expect(gas.claimDecision('guide-retry:4', thirtyMinAgo, now).claim).toBe(false);
  });

  it('stops once the attempts are used up', () => {
    const old = new Date(Date.now() - 10 * 60 * MIN).toISOString();
    const d = gas.claimDecision('guide-retry:' + gas.GUIDE_MAX_ATTEMPTS, old, Date.now());
    expect(d.claim).toBe(false);
    expect(d.reason).toBe('exhausted');
  });

  it('never touches a terminal row', () => {
    const old = new Date(Date.now() - 10 * 60 * MIN).toISOString();
    for (const s of ['done', 'guide-failed', 'guide-rejected', 'error', '']) {
      expect(gas.claimDecision(s, old, Date.now()).claim, s).toBe(false);
    }
  });
});

describe('a run that dies mid-guide', () => {
  const now = Date.now();

  it('leaves a freshly claimed row alone, another run is working on it', () => {
    const d = gas.claimDecision('processing:0', new Date(now - 30 * 1000).toISOString(), now);
    expect(d).toEqual({ claim: false, attempts: 0, reason: 'in-flight' });
  });

  it('takes the row back once it is too old to be alive', () => {
    const stale = new Date(now - gas.FOLLOWUP_ORPHAN_MS - 1000).toISOString();
    expect(gas.claimDecision('processing:2', stale, now)).toEqual({ claim: true, attempts: 2, reason: 'orphan' });
  });

  it('waits longer than the execution cap before calling a row orphaned', () => {
    expect(gas.FOLLOWUP_ORPHAN_MS).toBeGreaterThan(6 * 60 * 1000);
  });

  it('recovers a bare legacy processing row too', () => {
    const stale = new Date(now - gas.FOLLOWUP_ORPHAN_MS - 1000).toISOString();
    expect(gas.claimDecision('processing', stale, now).claim).toBe(true);
  });

  it('treats a row with no timestamp as old rather than stranding it', () => {
    expect(gas.claimDecision('processing:1', '', now).claim).toBe(true);
    expect(gas.claimDecision('guide-retry:1', '', now).claim).toBe(true);
  });

  it('accepts a Date as well as an ISO string, since Sheets returns both', () => {
    const stale = new Date(now - gas.FOLLOWUP_ORPHAN_MS - 1000);
    expect(gas.claimDecision('processing:1', stale, now).claim).toBe(true);
    expect(gas.claimDecision('processing:1', new Date(now - 1000), now).claim).toBe(false);
  });

  it('claims with the attempt count and a timestamp, not a bare processing', () => {
    const start = SOURCE.indexOf('function processFollowUps');
    const src = SOURCE.slice(start, SOURCE.indexOf('\nfunction ', start + 1));
    expect(src).toContain("'processing:' + priorAttempts");
    expect(src).not.toMatch(/setValue\('processing'\)/);
    expect(src).toContain('claimDecision(');
  });
});

/**
 * alertFailure sends at most one email per 5 minutes. In a burst, an expired API
 * key for instance, Darren gets the first failure and the rest are visible only
 * to someone who opens the Follow-ups tab. The digest is the backstop.
 */
describe('daily digest', () => {
  const C = () => gas.FOLLOWUP_COL;
  const now = Date.now();

  /** One Follow-ups row, in sheet order. */
  function row(status: string, opts: { at?: string; email?: string; source?: string; error?: string } = {}) {
    const r: unknown[] = new Array(7).fill('');
    r[C().status - 1] = status;
    r[C().processedAt - 1] = opts.at ?? new Date(now - 60 * 1000).toISOString();
    r[C().error - 1] = opts.error ?? 'Resend 422';
    r[C().source - 1] = opts.source ?? 'dscr';
    r[C().email - 1] = opts.email ?? 'jane@gmail.com';
    return r;
  }

  it('reports every terminal failure, not just the first', () => {
    const items = gas.guideDigestRows([row('guide-failed'), row('guide-rejected'), row('error')], now);
    expect(items).toHaveLength(3);
    expect(items.map((i) => i.status)).toEqual(['guide-failed', 'guide-rejected', 'error']);
  });

  it('ignores rows that are fine or still in flight', () => {
    const items = gas.guideDigestRows(
      [row('done'), row('pending'), row('guide-retry:2'), row('processing:1')],
      now,
    );
    expect(items).toHaveLength(0);
  });

  it('ignores failures older than a day, so one row is not reported forever', () => {
    const old = new Date(now - 25 * 60 * 60 * 1000).toISOString();
    expect(gas.guideDigestRows([row('guide-failed', { at: old })], now)).toHaveLength(0);
  });

  it('points at the sheet row and the lead, so recovery is possible', () => {
    const items = gas.guideDigestRows([row('done'), row('guide-failed', { email: 'bob@work.io' })], now);
    expect(items[0].row).toBe(3); // second data row, header is row 1
    expect(items[0].email).toBe('bob@work.io');
  });

  it('says plainly that the lead itself is safe', () => {
    const body = gas.formatGuideDigest(gas.guideDigestRows([row('guide-failed')], now));
    expect(body).toContain('ARE saved');
    expect(body).toContain('jane@gmail.com');
  });

  it('sends nothing on a clean day', () => {
    const start = SOURCE.indexOf('function sendGuideDigest');
    const src = SOURCE.slice(start, SOURCE.indexOf('\n/**', start + 1));
    expect(src).toMatch(/if \(items\.length === 0\) return;/);
  });

  it('is installed as its own daily trigger', () => {
    expect(SOURCE).toContain("ScriptApp.newTrigger('sendGuideDigest').timeBased().everyDays(1)");
    // The old name still works: it is what the deployment notes tell Darren to run.
    expect(SOURCE).toContain('function installFollowUpTrigger()');
  });
});

/**
 * The Debug tab is how a guide failure is actually read back. Without the
 * address you can see that a send returned 422 but not who lost their guide,
 * which is the only thing that lets you send it by hand.
 */
describe('Debug tab', () => {
  it('records who the message was about', () => {
    expect(gas.DEBUG_HEADERS).toEqual(['Timestamp', 'Message', 'Email']);
  });

  it('appends Email rather than inserting it, so old rows keep their meaning', () => {
    // ensureHeaders only writes past the current last column; a column added in
    // the middle would silently re-label every historical row.
    expect(gas.DEBUG_HEADERS.indexOf('Email')).toBe(gas.DEBUG_HEADERS.length - 1);
  });

  it('passes the lead address on every guide log line', () => {
    const start = SOURCE.indexOf('function postGuide');
    const src = SOURCE.slice(start, SOURCE.indexOf('\nfunction ', start + 1));
    const logs = src.match(/logDebug\([^;]*\);/g) ?? [];
    expect(logs.length).toBe(3);
    for (const call of logs) expect(call, call).toContain('body.email');
  });
});
