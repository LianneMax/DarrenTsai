/**
 * One fake Apps Script runtime, shared by every test that evaluates
 * google-apps-script.js.
 *
 * WHY THIS EXISTS. Four test files each carried their own copy of the same
 * ~60-line fake Spreadsheet plus the same blob of GAS global stubs. They had
 * already started to drift: the same `getValues` loop named its local `source`
 * in one file and `src` in another, with different brace styles. That drift was
 * harmless in itself, but nothing stopped a *behavioural* divergence appearing
 * the same way, and then two files would disagree about what a Sheet does while
 * both stayed green.
 *
 * The differences between the four callers are real and deliberate, so they are
 * parameters here rather than being flattened away. The one that matters most is
 * `fetch`: apps-script wants an inert 200, dopost wants one that records the URL
 * and then throws, followups wants keyed replies so a DSCR lead's two Bonzo calls
 * can be answered separately, and bonzo-push wants a fixed prospect id back.
 *
 * Stubs that were identical everywhere (Logger, LockService) are unconditional.
 * Three stubs were a superset in three files and a subset in apps-script only:
 * CacheService.remove, ScriptApp...everyDays, and ContentService's __body. They
 * are unconditional too. Handing apps-script the superset is inert, because the
 * bindings it pulls out never reach those paths, and an option nobody reads is
 * worse than a stub nobody calls.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SOURCE = readFileSync(resolve(__dirname, '../../google-apps-script.js'), 'utf8');

export type Tab = { name: string; rows: unknown[][] };
export type FetchCall = { url: string; options: Record<string, unknown> };

/** What UrlFetchApp.fetch hands back to the Apps Script code. */
export type FetchResponse = {
  getResponseCode: () => number;
  getContentText: () => string;
};

export type MailMessage = { to: string; subject: string; body: string };

export type GasOptions = {
  /** Top-level bindings to pull out of the evaluated source, by name. */
  exports: string[];
  /**
   * Script Properties. Omitted means every getProperty returns '', matching the
   * two files that evaluate the source without configuring anything.
   */
  props?: Record<string, string>;
  /**
   * What UrlFetchApp.fetch does. Omitted means an inert 200 with an empty JSON
   * body: enough for the source to evaluate, nothing recorded.
   */
  fetch?: (url: string, options: Record<string, unknown>) => FetchResponse;
  /** Called for every MailApp.sendEmail. Omitted means the mail is discarded. */
  onMail?: (message: MailMessage) => void;
  /**
   * false makes SpreadsheetApp.openById return a bare {} instead of the fake.
   * apps-script.test.ts only reads pure helpers, so it never touches a sheet and
   * a real fake would just be misleading.
   */
  spreadsheet?: boolean;
};

export type GasHarness<T> = {
  /** The bindings named in `options.exports`. */
  gas: T;
  tabs: Map<string, Tab>;
  /** A tab's row as a header -> value object. Never by column index. */
  rowOf: (tabName: string, index?: number) => Record<string, unknown>;
  /** Put a row on the Follow-ups tab, creating the tab on first use. */
  queue: (payload: Record<string, unknown>, status?: string, processedAt?: string) => void;
  statusOf: (row?: number) => { status: string; processedAt: unknown; error: string };
};

/** The Follow-ups header row, as enqueueFollowUp writes it. */
const FOLLOWUP_HEADERS = ['Queued At', 'Status', 'Processed At', 'Error', 'Source', 'Email', 'Payload'];

const INERT_RESPONSE: FetchResponse = {
  getResponseCode: () => 200,
  getContentText: () => '{}',
};

/**
 * The Sheets surface the Apps Script actually touches: appendRow, the row/column
 * counts ensureHeaders reads, and a Range with setValues/getValues plus the
 * formatting calls, which are chained and so must each return something
 * chainable.
 */
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

/**
 * The GAS globals, as source text prepended to the file under test.
 *
 * Every varying part is a call out to a real function injected through the
 * factory arguments, rather than a differently-worded stub per caller. That
 * keeps this string the single description of the runtime.
 */
const STUBS = `
  var PropertiesService = { getScriptProperties: function(){ return { getProperty: function(k){ return __getProp(k); } }; } };
  var SpreadsheetApp = { openById: function(){ return __ss; }, flush: function(){} };
  var UrlFetchApp = { fetch: function(url, options){ return __fetch(url, options || {}); } };
  var Logger = { log: function(){} };
  var MailApp = { sendEmail: function(m){ __mail(m); } };
  var CacheService = { getScriptCache: function(){ return { get: function(){ return null; }, put: function(){}, remove: function(){} }; } };
  var LockService = { getScriptLock: function(){ return { waitLock: function(){}, tryLock: function(){ return true; }, releaseLock: function(){} }; } };
  var ScriptApp = { getProjectTriggers: function(){ return []; }, deleteTrigger: function(){}, newTrigger: function(){ return { timeBased: function(){ return { everyMinutes: function(){ return { create: function(){} }; }, everyDays: function(){ return { atHour: function(){ return { create: function(){} }; } }; } }; } }; } };
  var ContentService = { createTextOutput: function(t){ return { setMimeType: function(){ return { __body: t }; } }; }, MimeType: { JSON: 'json' } };
`;

export function loadGas<T = Record<string, unknown>>(options: GasOptions): GasHarness<T> {
  const tabs = new Map<string, Tab>();

  const spreadsheet = options.spreadsheet === false ? {} : {
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

  const props = options.props;
  const getProp = (key: string) => (props ? props[key] || '' : '');
  const doFetch = options.fetch ?? (() => INERT_RESPONSE);
  const onMail = options.onMail ?? (() => {});

  const factory = new Function(
    '__ss', '__getProp', '__fetch', '__mail',
    `${STUBS}\n${SOURCE}\nreturn { ${options.exports.join(', ')} };`,
  );
  const gas = factory(spreadsheet, getProp, doFetch, onMail) as T;

  return {
    gas,
    tabs,
    rowOf(tabName: string, index = 1) {
      const tab = tabs.get(tabName);
      if (!tab) throw new Error(`no tab named ${tabName}; got ${[...tabs.keys()].join(', ')}`);
      const headers = tab.rows[0] as string[];
      const row = tab.rows[index];
      if (!row) throw new Error(`tab ${tabName} has no row at ${index}`);
      return Object.fromEntries(headers.map((h, i) => [h, row[i]]));
    },
    queue(payload, status = 'pending', processedAt = '') {
      let tab = tabs.get('Follow-ups');
      if (!tab) {
        tab = { name: 'Follow-ups', rows: [FOLLOWUP_HEADERS] };
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

/**
 * A UrlFetchApp.fetch that records every call and answers by URL fragment.
 *
 * Keyed rather than queued on purpose: one DSCR lead makes two Bonzo calls
 * (create the prospect, then pin the scenario note), so a positional queue
 * silently hands the guide's response to the note instead.
 */
export function recordingFetch(
  calls: FetchCall[],
  replies: Array<{ match: string; code: number; body?: string }>,
  defaultBody = '{"data":{"id":1}}',
) {
  return (url: string, options: Record<string, unknown>): FetchResponse => {
    calls.push({ url, options });
    let reply: { code: number; body?: string } = { code: 200 };
    for (const candidate of replies) {
      if (String(url).indexOf(candidate.match) !== -1) { reply = candidate; break; }
    }
    return {
      getResponseCode: () => reply.code,
      getContentText: () => reply.body || defaultBody,
    };
  };
}
