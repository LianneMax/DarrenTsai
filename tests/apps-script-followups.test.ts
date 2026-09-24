/**
 * processFollowUps and the daily digest, run for real against a fake Spreadsheet
 * and a fake UrlFetchApp.
 *
 * This is the part of the pipeline that can lose something a visitor was
 * promised. doPost only writes a row; everything the lead actually receives —
 * the Bonzo enrollment and the guide email — happens here, minutes later, with
 * no browser attached and nobody watching. The failure modes are all quiet
 * ones: a guide retried into oblivion, a Bonzo prospect created twice, a row
 * left 'processing' forever because the run that claimed it died.
 *
 * So these tests drive the real function and assert on the Status cell it
 * leaves behind, plus which HTTP calls it made.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SOURCE = readFileSync(resolve(__dirname, '../google-apps-script.js'), 'utf8');

type Tab = { name: string; rows: unknown[][] };
type FetchCall = { url: string; options: Record<string, unknown> };

type Harness = {
  processFollowUps: () => void;
  sendGuideDigest: () => void;
  tabs: Map<string, Tab>;
  mail: Array<{ to: string; subject: string; body: string }>;
  fetches: FetchCall[];
  /**
   * Response code per URL fragment, e.g. `reply('send-dscr-guide', 503)`.
   * Keyed rather than queued on purpose: one DSCR lead makes two Bonzo calls
   * (create the prospect, then pin the scenario note), so a positional queue
   * silently hands the guide's response to the note instead.
   */
  reply: (urlFragment: string, code: number, body?: string) => void;
  props: Record<string, string>;
  queue: (payload: Record<string, unknown>, status?: string, processedAt?: string) => void;
  statusOf: (row?: number) => { status: string; processedAt: unknown; error: string };
};

function load(): Harness {
  const tabs = new Map<string, Tab>();
  const mail: Array<{ to: string; subject: string; body: string }> = [];
  const fetches: FetchCall[] = [];
  const replies: Array<{ match: string; code: number; body?: string }> = [];
  const props: Record<string, string> = {
    NETLIFY_DSCR_PDF_URL: 'https://realdarrentsai.com/api/send-dscr-guide',
    NETLIFY_DSCR_PDF_KEY: 'test-key',
    NETLIFY_REI_PDF_URL: 'https://realdarrentsai.com/api/send-rei-guide',
    NETLIFY_REI_PDF_KEY: 'test-key',
    NETLIFY_FHA_PDF_URL: 'https://realdarrentsai.com/api/send-fha-guide',
    NETLIFY_FHA_PDF_KEY: 'test-key',
    BONZO_API_KEY: 'bonzo-token',
    BONZO_CAMPAIGN_ID: '100',
  };

  function makeSheet(tab: Tab) {
    const sheet = {
      appendRow(values: unknown[]) { tab.rows.push(values); },
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
              const src = tab.rows[row - 1 + r] ?? [];
              out.push(src.slice(col - 1, col - 1 + numCols));
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
    var PropertiesService = { getScriptProperties: function(){ return { getProperty: function(k){ return __props[k] || ''; } }; } };
    var SpreadsheetApp = { openById: function(){ return __ss; }, flush: function(){} };
    var UrlFetchApp = { fetch: function(url, options){
      __fetches.push({ url: url, options: options || {} });
      var r = { code: 200 };
      for (var i = 0; i < __replies.length; i++) {
        if (String(url).indexOf(__replies[i].match) !== -1) { r = __replies[i]; break; }
      }
      return { getResponseCode: function(){ return r.code; }, getContentText: function(){ return r.body || '{"data":{"id":1}}'; } };
    } };
    var Logger = { log: function(){} };
    var MailApp = { sendEmail: function(m){ __mail.push(m); } };
    var CacheService = { getScriptCache: function(){ return { get: function(){ return null; }, put: function(){}, remove: function(){} }; } };
    var LockService = { getScriptLock: function(){ return { waitLock: function(){}, tryLock: function(){ return true; }, releaseLock: function(){} }; } };
    var ScriptApp = { getProjectTriggers: function(){ return []; }, deleteTrigger: function(){}, newTrigger: function(){ return { timeBased: function(){ return { everyMinutes: function(){ return { create: function(){} }; }, everyDays: function(){ return { atHour: function(){ return { create: function(){} }; } }; } }; } }; } };
    var ContentService = { createTextOutput: function(t){ return { setMimeType: function(){ return { __body: t }; } }; }, MimeType: { JSON: 'json' } };
  `;
  const factory = new Function(
    '__ss', '__mail', '__fetches', '__replies', '__props',
    `${stubs}\n${SOURCE}\nreturn { processFollowUps: processFollowUps, sendGuideDigest: sendGuideDigest };`,
  );
  const api = factory(spreadsheet, mail, fetches, replies, props) as Pick<Harness, 'processFollowUps' | 'sendGuideDigest'>;

  const HEADERS = ['Queued At', 'Status', 'Processed At', 'Error', 'Source', 'Email', 'Payload'];

  return {
    ...api,
    tabs,
    mail,
    fetches,
    props,
    reply(urlFragment, code, body) {
      replies.push({ match: urlFragment, code, body });
    },
    queue(payload, status = 'pending', processedAt = '') {
      let tab = tabs.get('Follow-ups');
      if (!tab) {
        tab = { name: 'Follow-ups', rows: [HEADERS] };
        tabs.set('Follow-ups', tab);
      }
      tab.rows.push([
        new Date().toISOString(), status, processedAt, '',
        payload.source ?? '', payload.email ?? '', JSON.stringify(payload),
      ]);
    },
    statusOf(row = 1) {
      const r = tabs.get('Follow-ups')!.rows[row];
      return { status: String(r[1]), processedAt: r[2], error: String(r[3] ?? '') };
    },
  };
}

let h: Harness;
beforeEach(() => { h = load(); });

const DSCR_LEAD = {
  source: 'dscr', firstName: 'Jane', lastName: 'Investor', email: 'jane@example.com',
  phone: '7145550123', state: 'CA', dscr: '1.17', downPayment: '25%',
  loanAmount: '$240,000', rate: '7.00%',
};

/** The guide call is the one that goes to our own Netlify function. */
const guideCalls = (h: Harness) => h.fetches.filter((f) => f.url.includes('/api/send-'));
const bonzoCalls = (h: Harness) => h.fetches.filter((f) => f.url.includes('getbonzo.com'));

describe('the happy path: Bonzo once, guide once, row done', () => {
  it('pushes to Bonzo and sends the DSCR guide, then marks the row done', () => {
    h.queue(DSCR_LEAD);
    h.processFollowUps();

    // Two Bonzo calls by design: create the prospect, then pin the scenario note.
    expect(bonzoCalls(h)).toHaveLength(2);
    expect(bonzoCalls(h)[0].url).toContain('/prospects/campaign/');
    expect(bonzoCalls(h)[1].url).toContain('/notes');
    expect(guideCalls(h)).toHaveLength(1);
    expect(guideCalls(h)[0].url).toContain('send-dscr-guide');
    expect(h.statusOf().status).toBe('done');
    expect(h.statusOf().error).toBe('');
    expect(h.mail).toHaveLength(0); // nothing to tell Darren about
  });

  it('sends the guide the DSCR numbers the lead actually entered', () => {
    h.queue(DSCR_LEAD);
    h.processFollowUps();
    const body = JSON.parse(String(guideCalls(h)[0].options.payload));
    expect(body).toMatchObject({ email: 'jane@example.com', dscr: '1.17', rate: '7.00%', loanAmount: '$240,000' });
  });

  it('authenticates the guide call with the key from Script Properties', () => {
    h.queue(DSCR_LEAD);
    h.processFollowUps();
    const headers = guideCalls(h)[0].options.headers as Record<string, string>;
    expect(headers['x-api-key']).toBe('test-key');
  });

  it('marks a funnel with no guide done without calling any sender', () => {
    h.queue({ source: 'DebtConsolidation', email: 'cy@example.com', state: 'CA' });
    h.processFollowUps();
    expect(guideCalls(h)).toHaveLength(0);
    expect(h.statusOf().status).toBe('done');
  });

  it('routes each funnel to its own guide endpoint', () => {
    h.queue({ source: 'fha', email: 'ben@example.com' });
    h.queue({ source: 'real-estate-investing', email: 'ada@example.com' });
    h.processFollowUps();
    const urls = guideCalls(h).map((f) => f.url);
    expect(urls.some((u) => u.includes('send-fha-guide'))).toBe(true);
    expect(urls.some((u) => u.includes('send-rei-guide'))).toBe(true);
    expect(urls.some((u) => u.includes('send-dscr-guide'))).toBe(false);
  });

  it('leaves a row it has finished alone on the next run', () => {
    h.queue(DSCR_LEAD);
    h.processFollowUps();
    const before = h.fetches.length;
    h.processFollowUps();
    expect(h.fetches.length).toBe(before); // 'done' is terminal
  });
});

describe('a guide that fails is retried, but Bonzo never is', () => {
  it('marks a 503 as a retry and says why, without alerting yet', () => {
    h.reply('send-dscr-guide', 503, 'Resend unavailable');
    h.queue(DSCR_LEAD);
    h.processFollowUps();

    expect(h.statusOf().status).toBe('guide-retry:1');
    expect(h.statusOf().error).toBeTruthy();
    expect(h.mail).toHaveLength(0); // a retry is not worth an email
  });

  it('does not re-push Bonzo on a retry pass, so no duplicate prospect is created', () => {
    // A row already retried once, with its backoff long expired.
    h.queue(DSCR_LEAD, 'guide-retry:1', new Date(Date.now() - 60 * 60 * 1000).toISOString());
    h.processFollowUps();

    expect(bonzoCalls(h)).toHaveLength(0);
    expect(guideCalls(h)).toHaveLength(1);
    expect(h.statusOf().status).toBe('done');
  });

  it('respects the backoff: a row retried a minute ago is left alone', () => {
    h.queue(DSCR_LEAD, 'guide-retry:3', new Date(Date.now() - 60 * 1000).toISOString());
    h.processFollowUps();
    expect(h.fetches).toHaveLength(0);
    expect(h.statusOf().status).toBe('guide-retry:3');
  });

  it('gives up after the last attempt, and alerts when it does', () => {
    h.reply('send-dscr-guide', 503);
    h.queue(DSCR_LEAD, 'guide-retry:5', new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString());
    h.processFollowUps();

    expect(h.statusOf().status).toBe('guide-failed');
    expect(h.mail).toHaveLength(1);
    expect(h.mail[0].body).toContain('jane@example.com');
    expect(h.mail[0].body).toContain('send the guide by hand');
  });

  it('never retries a permanent rejection, and alerts immediately', () => {
    h.reply('send-dscr-guide', 422, 'Invalid `to` field');
    h.queue(DSCR_LEAD);
    h.processFollowUps();

    expect(h.statusOf().status).toBe('guide-rejected');
    expect(h.mail).toHaveLength(1);
    // And the next run does not touch it again.
    const before = h.fetches.length;
    h.processFollowUps();
    expect(h.fetches.length).toBe(before);
  });
});

describe('a run that dies mid-flight does not strand the lead', () => {
  it('leaves a freshly claimed row alone, so two runs cannot send twice', () => {
    h.queue(DSCR_LEAD, 'processing:0', new Date().toISOString());
    h.processFollowUps();
    expect(h.fetches).toHaveLength(0);
    expect(h.statusOf().status).toBe('processing:0');
  });

  it('recovers a row abandoned longer than the orphan window', () => {
    h.queue(DSCR_LEAD, 'processing:0', new Date(Date.now() - 20 * 60 * 1000).toISOString());
    h.processFollowUps();
    expect(guideCalls(h)).toHaveLength(1);
    expect(h.statusOf().status).toBe('done');
  });

  it('recovers a legacy bare "processing" row with no timestamp at all', () => {
    h.queue(DSCR_LEAD, 'processing', '');
    h.processFollowUps();
    expect(h.statusOf().status).toBe('done');
  });

  it('marks a row that throws as error and alerts, without stopping the batch', () => {
    h.queue({ source: 'dscr', email: 'bad@example.com' });
    // Corrupt the payload cell so JSON.parse inside the loop throws.
    h.tabs.get('Follow-ups')!.rows[1][6] = '{oops';
    h.queue(DSCR_LEAD);
    h.processFollowUps();

    expect(h.statusOf(1).status).toBe('error');
    expect(h.statusOf(2).status).toBe('done'); // the second row still ran
    expect(h.mail.some((m) => m.subject.includes('LEAD PIPELINE FAILURE'))).toBe(true);
  });
});

describe('the daily digest', () => {
  it('sends nothing on a clean day', () => {
    h.queue(DSCR_LEAD);
    h.processFollowUps();
    h.sendGuideDigest();
    expect(h.mail).toHaveLength(0);
  });

  it('reports every terminal failure from the last 24h in one email', () => {
    const recent = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    h.queue({ source: 'dscr', email: 'a@example.com' }, 'guide-failed', recent);
    h.queue({ source: 'fha', email: 'b@example.com' }, 'guide-rejected', recent);
    h.queue({ source: 'dscr', email: 'c@example.com' }, 'error', recent);
    h.sendGuideDigest();

    expect(h.mail).toHaveLength(1);
    expect(h.mail[0].subject).toBe('3 guide email(s) not delivered in the last 24h');
    for (const address of ['a@example.com', 'b@example.com', 'c@example.com']) {
      expect(h.mail[0].body).toContain(address);
    }
    expect(h.mail[0].body).toContain('These leads ARE saved in the Sheet');
  });

  it('ignores failures older than the window, and rows that succeeded', () => {
    const old = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    h.queue({ source: 'dscr', email: 'old@example.com' }, 'guide-failed', old);
    h.queue({ source: 'dscr', email: 'fine@example.com' }, 'done', new Date().toISOString());
    h.sendGuideDigest();
    expect(h.mail).toHaveLength(0);
  });

  it('does not mistake a row still being retried for a delivered one', () => {
    h.queue({ source: 'dscr', email: 'trying@example.com' }, 'guide-retry:2', new Date().toISOString());
    h.sendGuideDigest();
    // A retry is not terminal, so it is not in the digest - it is still in play.
    expect(h.mail).toHaveLength(0);
  });

  it('goes to both recipients', () => {
    h.queue({ source: 'dscr', email: 'a@example.com' }, 'guide-failed', new Date().toISOString());
    h.sendGuideDigest();
    expect(h.mail[0].to).toContain('darren@realdarrentsai.com');
    expect(h.mail[0].to.split(',').length).toBe(2);
  });
});
