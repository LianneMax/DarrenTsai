/**
 * End-to-end alignment between the website and google-apps-script.js.
 *
 * WHY THIS FILE EXISTS. Every other test checks one side of the wall. The
 * failure that actually costs a lead lives between them: a form ships a
 * `source` the Apps Script has never heard of, the router falls through to its
 * catch-all, and the lead lands on the generic Leads tab with its funnel-
 * specific fields (DSCR ratio, credit score) silently dropped. Nothing throws.
 * The visitor sees a green checkmark, the Sheet gets a row, and the guide email
 * is never sent because no sender matches that source.
 *
 * So these tests read both sides from disk and compare them. They are
 * deliberately source-scanning rather than hand-maintained lists: a new landing
 * page that forgets its Apps Script route fails here on the day it is written.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '..');
const GAS = readFileSync(resolve(ROOT, 'google-apps-script.js'), 'utf8');

/** Every file that can POST a lead: the React bundle and the static landing pages. */
function leadSendingFiles(): string[] {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(resolve(ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === 'dist') continue;
        walk(rel);
      } else if (/\.(tsx?|html)$/.test(entry.name)) {
        files.push(rel);
      }
    }
  };
  walk('src');
  walk('public');
  return files;
}

/**
 * The `source` values the site actually sends. Matches the React object literal
 * (`source: 'dscr'`), the landing pages' JSON (`"source": "dscr"`), and the
 * `leadSource="home-contact"` prop, because the contact modal is one shared
 * component whose source is handed to it by whichever page mounts it. Without
 * that last form a page could mount the modal with an unrouted source and this
 * file would not notice.
 */
function sourcesSentByTheSite(): Set<string> {
  const found = new Set<string>();
  for (const file of leadSendingFiles()) {
    const text = readFileSync(resolve(ROOT, file), 'utf8');
    for (const m of text.matchAll(/["']?\bsource["']?\s*:\s*["']([A-Za-z][\w-]*)["']/g)) {
      found.add(m[1]);
    }
    for (const m of text.matchAll(/\bleadSource=["']([A-Za-z][\w-]*)["']/g)) {
      found.add(m[1]);
    }
  }
  // utm_source lives in the same payloads and is not a funnel name.
  found.delete('utm_source');
  return found;
}

/** The `source` values doPost routes explicitly, and the tab each one writes to. */
function routesInAppsScript(): Map<string, string> {
  const routes = new Map<string, string>();

  // The schema-driven landing funnels.
  const schemaBlock = GAS.slice(GAS.indexOf('const SOURCE_SCHEMAS'), GAS.indexOf('const LANDING_SOURCES'));
  for (const m of schemaBlock.matchAll(/'([\w-]+)':\s*\{\s*\n\s*tab:\s*'([^']+)'/g)) {
    routes.set(m[1], m[2]);
  }

  // The hand-written branches in doPost.
  const doPost = GAS.slice(GAS.indexOf('function doPost'));
  for (const m of doPost.matchAll(
    /data\.source === '([\w-]+)'\)\s*\{\s*\n\s*const sheet = getOrCreateSheet\(ss, '([^']+)'/g,
  )) {
    routes.set(m[1], m[2]);
  }
  return routes;
}

const SITE_SOURCES = sourcesSentByTheSite();
const ROUTES = routesInAppsScript();

describe('every lead the site sends has somewhere to land', () => {
  it('finds the forms at all, so a silent zero-match scan cannot pass this file', () => {
    expect(SITE_SOURCES.size).toBeGreaterThanOrEqual(5);
    expect(ROUTES.size).toBeGreaterThanOrEqual(5);
  });

  /**
   * The contact modal is the intended catch-all: it has no funnel-specific
   * columns, so the generic Leads tab holds everything it sends. Any OTHER
   * unrouted source is a bug — it means a funnel's own fields are being dropped.
   *
   * There is one entry per page the modal lives on. Until 26 Sep 2026 there was
   * a single 'MortgageCalculator' for all five, which is why the Sheet's Source
   * column, the Bonzo tags and the GA4 event could not tell a DSCR investor from
   * a homeowner after equity. Each of these has a tag branch in pushToBonzo,
   * asserted below, so falling through here costs nothing but the tab.
   */
  const CONTACT_SOURCES = [
    'dscr-contact',
    'fha-contact',
    'home-contact',
    'mortgage-calculator-contact',
    'rei-contact',
  ];

  it('routes every funnel source explicitly, with only the contact modal falling through', () => {
    const unrouted = [...SITE_SOURCES].filter((s) => !ROUTES.has(s)).sort();
    expect(unrouted).toEqual(CONTACT_SOURCES);
  });

  it('gives every contact source its own Bonzo tag branch', () => {
    // Without this they land on the `else` and are all tagged
    // 'mortgage-calculator' again, which is the defect this replaced.
    const table = GAS.slice(GAS.indexOf('const CONTACT_SOURCES'), GAS.indexOf('const FUNNEL_CAMPAIGNS'));
    for (const source of CONTACT_SOURCES) {
      expect(table, `no Bonzo tag for ${source}`).toContain(`'${source}'`);
    }
  });

  it('gives each routed source its own tab, so two funnels never share one', () => {
    const tabs = [...ROUTES.values()];
    expect(new Set(tabs).size).toBe(tabs.length);
  });

  /**
   * Not an error, but it should be a decision rather than a surprise: these
   * routes and their tabs are dead until a form sends them again. Update this
   * list when a funnel is genuinely retired or revived.
   */
  it('lists the routes no form on the site currently sends', () => {
    // 'heloc-hei' was removed from this list and from the Apps Script: HELOC and
    // home-equity interest is captured by the debt-consolidation form on the
    // homepage, which is where /yt/heloc and /yt/equity already point.
    const unused = [...ROUTES.keys()].filter((s) => !SITE_SOURCES.has(s)).sort();
    expect(unused).toEqual(['QualifyForm', 'newsletter', 'self-employed']);
  });

  /**
   * The removal, asserted rather than assumed. A dead schema is cheap to
   * re-add by reflex when someone greps for "heloc" and finds the short links,
   * and a tab nothing writes to looks identical to one that is merely quiet.
   */
  it('has no heloc-hei route, since the homepage funnel owns that intent', () => {
    expect(ROUTES.has('heloc-hei')).toBe(false);
    // Comments are stripped first: the removal is deliberately *explained* in
    // the source, and asserting on the raw text would fail on its own rationale.
    const code = GAS.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toContain("'heloc-hei'");
    expect(code).not.toContain('HELOC vs HEI');
  });

  it('still tags the debt-consolidation funnel with the equity intent', () => {
    // This is what heloc-hei's 'equity' / 'loan:cash-out' tags collapsed into.
    // Without it the removal would quietly drop the signal rather than move it.
    expect(GAS).toContain("tags.push('debt-consolidation', 'HELOC/cash-out interest')");
  });
});

describe('guide emails match the funnels that promise them', () => {
  /** source -> the Netlify function the Apps Script calls for it. */
  const GUIDE_ROUTES: Array<[source: string, fn: string, urlProp: string]> = [
    ['dscr', 'send-dscr-guide', 'NETLIFY_DSCR_PDF_URL'],
    ['real-estate-investing', 'send-rei-guide', 'NETLIFY_REI_PDF_URL'],
    ['fha', 'send-fha-guide', 'NETLIFY_FHA_PDF_KEY'.replace('KEY', 'URL')],
  ];

  it.each(GUIDE_ROUTES)('%s has a sender, a live endpoint, and is a source the site sends', (source, fn, urlProp) => {
    expect(GAS).toContain(`data.source !== '${source}'`); // the sender guards on this exact source
    expect(GAS).toContain(urlProp);
    expect(SITE_SOURCES.has(source)).toBe(true);
    expect(() => readFileSync(resolve(ROOT, `netlify/functions/${fn}.mts`))).not.toThrow();
  });

  it('runs at most one guide per lead, so a lead cannot be emailed twice', () => {
    const block = GAS.slice(GAS.indexOf('function sendGuideFor'), GAS.indexOf('// Email Darren when a lead fails'));
    expect(block).toContain("results[i].outcome !== 'skipped'");
    expect(block).toContain('return results[i]');
  });

  it('sends the DSCR guide every field its email renders', () => {
    const sender = GAS.slice(GAS.indexOf('function sendDscrGuide'), GAS.indexOf('function sendReiGuide'));
    for (const field of ['firstName', 'lastName', 'email', 'dscr', 'downPayment', 'rate', 'loanAmount']) {
      expect(sender).toContain(`${field}:`);
    }
  });
});

describe('the DSCR tab holds every field the DSCR page sends', () => {
  const page = readFileSync(resolve(ROOT, 'public/dscr/index.html'), 'utf8');
  const schemaBlock = GAS.slice(GAS.indexOf("'dscr': {"), GAS.indexOf("'self-employed': {"));

  it.each(['dscr', 'downPayment', 'loanAmount', 'rate', 'magnet'])(
    'writes %s to a column of its own',
    (field) => {
      expect(page).toContain(field); // the page sends it
      expect(schemaBlock).toContain(`d.${field}`); // the row builder writes it
    },
  );
});

describe('the Sheet tabs the script relies on', () => {
  /**
   * getOrCreateSheet creates a missing tab, so a wrong name here does not throw
   * — it quietly starts a second tab beside the real one and the leads split
   * across both. These names are therefore load-bearing strings.
   */
  it('names every tab it writes to, and nothing else', () => {
    // Literal tab names only: skip the schema-driven call and the function's
    // own parameter, neither of which names a tab.
    const tabs = [...GAS.matchAll(/getOrCreateSheet\(ss,\s*(?:'([^']+)'|([A-Z_]+))/g)]
      .map((m) => m[1] ?? m[2]);
    expect(new Set(tabs)).toEqual(
      new Set(['Debug', 'Newsletter', 'Qualify', 'Debt Consolidation', 'Leads', 'FOLLOWUP_TAB']),
    );
    expect(GAS).toContain("const FOLLOWUP_TAB = 'Follow-ups'");
  });

  it('keeps the Follow-ups column map in step with its headers', () => {
    const headers = /const FOLLOWUP_HEADERS = \[([^\]]+)\]/.exec(GAS)![1]
      .split(',')
      .map((s) => s.trim().replace(/'/g, ''))
      .filter(Boolean);
    expect(headers).toEqual(['Queued At', 'Status', 'Processed At', 'Error', 'Source', 'Email', 'Payload']);
    // FOLLOWUP_COL is 1-based, and the digest reads cells by it.
    expect(GAS).toContain('const FOLLOWUP_COL = { status: 2, processedAt: 3, error: 4, source: 5, email: 6, payload: 7 }');
  });

  it('sends the daily digest and the failure alert to the same recipients', () => {
    const alertEmail = /const ALERT_EMAIL = '([^']+)'/.exec(GAS)![1];
    expect(alertEmail.split(',').length).toBeGreaterThanOrEqual(1);
    for (const address of alertEmail.split(',')) {
      expect(address.trim()).toMatch(/^[^@\s]+@[^@\s]+\.[^@\s]+$/);
    }
    // Both senders read the same constant rather than hard-coding an address.
    expect(GAS.match(/to: ALERT_EMAIL/g)?.length).toBe(2);
  });
});

/**
 * The three gaps this audit turned up, now fixed. The tests stay as the record
 * of what was wrong, so a later refactor cannot quietly undo any of them.
 */
describe('audit fixes stay fixed', () => {
  it('Debt Consolidation records licensed state, like every other funnel', () => {
    // It collects State but was neither a LANDING_SOURCE nor tagged
    // mortgage-calculator, so an out-of-area lead there looked identical to a
    // workable one in both the Sheet and Bonzo.
    expect(GAS).toContain("].concat(ATTR_HEADERS, ['Licensed?']);");
    expect(GAS).toContain("data.source === 'DebtConsolidation' ||");
  });

  it("puts that column last, because the tab's existing rows cannot shift", () => {
    // The append-only rule: inserting 'Licensed?' where it reads best would
    // change the meaning of every historical cell to its right.
    const headers = /const DEBT_CONSOLIDATION_HEADERS = \[([\s\S]*?)\.concat\(([^;]*?)\);/.exec(GAS)!;
    expect(headers[1]).not.toContain("'Licensed?'"); // not in the literal
    expect(headers[2]).toContain("ATTR_HEADERS, ['Licensed?']"); // appended after
  });

  it('no longer carries a dedupe function nothing calls', () => {
    // Removed rather than wired in: a second submission usually means the lead
    // never got their guide and tried again, which is signal worth keeping, not
    // a duplicate worth hiding.
    expect(GAS).not.toContain('isDuplicateLead');
  });

  it('trims the Debug tab instead of letting it grow forever', () => {
    expect(GAS).toContain('function trimDebugTab(ss)');
    expect(GAS).toContain('const DEBUG_MAX_ROWS = 2000');
    // Run from the one daily job, not from the write path: deleting rows is
    // slow and doPost has a response budget.
    expect(GAS).toContain('trimDebugTab(ss); // once a day');
    const doPostBody = GAS.slice(GAS.indexOf('function doPost'), GAS.indexOf('function withSheetLock'));
    expect(doPostBody).not.toContain('trimDebugTab');
    expect(GAS.slice(GAS.indexOf('function logDebug'), GAS.indexOf('function classifyGuideResponse')))
      .not.toContain('trimDebugTab');
  });
});

/**
 * Rate display. These were live on the site: the homepage told visitors to
 * "add VITE_FRED_API_KEY for live updates", and the DSCR page carried a FRED
 * key in its HTML for a request CORS blocked anyway. Both are the kind of thing
 * that creeps back in, so they are asserted rather than trusted.
 */
describe('rates are fetched server-side and labelled honestly', () => {
  const calc = readFileSync(resolve(ROOT, 'src/components/DebtSavingsCalculator.tsx'), 'utf8');
  const dscr = readFileSync(resolve(ROOT, 'public/dscr/index.html'), 'utf8');
  const config = readFileSync(resolve(ROOT, 'src/config.ts'), 'utf8');
  const clients: Array<[string, string]> = [['debt calculator', calc], ['DSCR page', dscr]];

  it.each(clients)('%s calls /api/rates, never FRED directly', (_name, src) => {
    expect(src).toContain('/api/rates');
    // A URL literal pointing at the API host, which is what a direct call needs.
    // The human-facing fred.stlouisfed.org attribution link is fine and stays.
    expect(src).not.toMatch(/["'`]https:\/\/api\.stlouisfed\.org/);
  });

  it.each(clients)('%s carries no FRED API key', (_name, src) => {
    expect(src).not.toMatch(/FRED_API_KEY/);
    expect(src).not.toMatch(/api_key=/);
  });

  it('no VITE_-prefixed FRED key exists, since that prefix is what leaked it', () => {
    expect(config).not.toContain('VITE_FRED_API_KEY');
    // The dev-only proxy is gone too: it made FRED work in dev and only in dev,
    // which is why the production CORS failure went unnoticed.
    expect(readFileSync(resolve(ROOT, 'vite.config.ts'), 'utf8')).not.toContain("'/fred-api':");
  });

  it('shows no developer instruction to a visitor when rates are unavailable', () => {
    expect(calc).not.toContain('add VITE_FRED_API_KEY for live updates');
    expect(calc).toContain('Static example range, not current market rates');
  });

  it('names one rate source, consistently, in the caption and the disclaimer', () => {
    // It used to credit FRED in the caption and MortgageNewsDaily in the
    // disclaimer twelve lines below, on the same screen.
    expect(calc).not.toContain('MortgageNewsDaily');
    expect(calc).toContain('Freddie Mac PMMS via');
    expect(calc).toContain("Freddie Mac's Primary Mortgage Market Survey");
    expect(dscr).toContain('Freddie Mac PMMS 30-yr weekly average');
  });

  it('ships no console.log from the rate path', () => {
    expect(calc).not.toContain('console.log');
  });
});
