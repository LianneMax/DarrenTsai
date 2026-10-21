/**
 * processFollowUps and the daily digest, run for real against a fake Spreadsheet
 * and a fake UrlFetchApp.
 *
 * This is the part of the pipeline that can lose something a visitor was
 * promised. doPost only writes a row; everything the lead actually receives —
 * the HubSpot contact and the guide email — happens here, minutes later, with
 * no browser attached and nobody watching. The failure modes are all quiet
 * ones: a guide retried into oblivion, a guide mailed twice, a row left
 * 'processing' forever because the run that claimed it died.
 *
 * So these tests drive the real function and assert on the Status cell it
 * leaves behind, plus which HTTP calls it made.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { loadGas, recordingFetch, type Tab, type FetchCall } from './helpers/gas-harness';

const WORKER_LEASE_KEY = 'followup_worker_lease_v1';

describe('authoritative worker admission, independent of cached Sheet rows', () => {
  type WorkerRuntime = {
    processFollowUps: () => void;
    acquireFollowUpWorker: () => string | null;
    releaseFollowUpWorker: (token: string) => boolean;
    SpreadsheetApp: { openById: () => unknown };
  };
  const exports = ['processFollowUps', 'acquireFollowUpWorker', 'releaseFollowUpWorker', 'SpreadsheetApp'];
  it('does not even read a stale pending Sheet snapshot while another worker owns the property lease', () => {
    const props: Record<string, string> = {};
    const owner = loadGas<WorkerRuntime>({ exports, props });
    const h = loadGas<WorkerRuntime>({ exports, props });
    h.queue({ source: 'dscr', email: 'qa@example.com' });
    const originalOpen = h.gas.SpreadsheetApp.openById;
    let reads = 0;
    h.gas.SpreadsheetApp.openById = () => { reads++; return originalOpen(); };
    const first = owner.gas.acquireFollowUpWorker()!;
    expect(Object.keys(JSON.parse(props[WORKER_LEASE_KEY]))).toEqual(['token', 'startedAt']);
    expect(props[WORKER_LEASE_KEY].length).toBeLessThan(200);
    expect(props[WORKER_LEASE_KEY]).not.toContain('qa@example.com');
    // The second execution's view is deliberately still pending. Admission
    // cannot depend on this stale view or its missing per-row journal.
    expect(h.statusOf().status).toBe('pending');
    h.gas.processFollowUps();
    expect(reads).toBe(0);
    expect(h.statusOf().status).toBe('pending');
    expect(JSON.parse(props[WORKER_LEASE_KEY]).token).toBe(first);
    expect(owner.gas.releaseFollowUpWorker(first)).toBe(true);
    h.gas.processFollowUps();
    expect(reads).toBe(1);
    expect(h.statusOf().status).toBe('guide-rejected'); // No sender configured, not silently skipped.
    expect(props[WORKER_LEASE_KEY]).toBeUndefined();
  });
  it('expires a crashed worker only after the orphan window, and stale cleanup cannot release its replacement', () => {
    const props: Record<string, string> = {};
    const h = loadGas<WorkerRuntime>({ exports, props });
    const first = h.gas.acquireFollowUpWorker()!;
    expect(h.gas.acquireFollowUpWorker()).toBeNull();
    const lease = JSON.parse(props[WORKER_LEASE_KEY]);
    props[WORKER_LEASE_KEY] = JSON.stringify({ ...lease, startedAt: Date.now() - 11 * 60_000 });
    const replacement = h.gas.acquireFollowUpWorker()!;
    expect(replacement).not.toBe(first);
    expect(h.gas.releaseFollowUpWorker(first)).toBe(false);
    expect(JSON.parse(props[WORKER_LEASE_KEY]).token).toBe(replacement);
    expect(h.gas.releaseFollowUpWorker(replacement)).toBe(true);
    expect(Object.keys(props)).toEqual([]);
  });
  it('releases admission after an exception so the next run can recover checkpointed work', () => {
    const props: Record<string, string> = {};
    const h = loadGas<WorkerRuntime>({ exports, props });
    h.gas.SpreadsheetApp.openById = () => { throw new Error('Sheet unavailable'); };
    expect(() => h.gas.processFollowUps()).toThrow('Sheet unavailable');
    expect(props[WORKER_LEASE_KEY]).toBeUndefined();
    expect(h.gas.acquireFollowUpWorker()).toBeTruthy();
  });
  it('fails closed on a malformed worker property without reading or sending queued work', () => {
    const props: Record<string, string> = { [WORKER_LEASE_KEY]: '{bad' };
    const h = loadGas<WorkerRuntime>({ exports, props });
    h.gas.SpreadsheetApp.openById = () => { throw new Error('must not read'); };
    expect(() => h.gas.processFollowUps()).not.toThrow();
    expect(props[WORKER_LEASE_KEY]).toBe('{bad');
  });
});

type Harness = {
  processFollowUps: () => void;
  sendGuideDigest: () => void;
  tabs: Map<string, Tab>;
  mail: Array<{ to: string; subject: string; body: string }>;
  fetches: FetchCall[];
  /**
   * Response code per URL fragment, e.g. `reply('send-dscr-guide', 503)`.
   * Keyed rather than queued on purpose: one lead can make more than one
   * call, so a positional queue could hand one call's response to another.
   */
  reply: (urlFragment: string, code: number, body?: string) => void;
  props: Record<string, string>;
  queue: (payload: Record<string, unknown>, status?: string, processedAt?: string) => void;
  statusOf: (row?: number) => { status: string; processedAt: unknown; error: string };
};

function load(): Harness {
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
    // Left in Script Properties after Bonzo was retired (15 Oct 2026), as
    // they are live until someone deletes them. Nothing may read them.
    BONZO_API_KEY: 'bonzo-token',
    BONZO_CAMPAIGN_ID: '100',
  };

  const { gas, tabs, queue, statusOf } = loadGas<Pick<Harness, 'processFollowUps' | 'sendGuideDigest'>>({
    exports: ['processFollowUps', 'sendGuideDigest'],
    props,
    onMail: (m) => mail.push(m),
    fetch: recordingFetch(fetches, replies),
  });

  return {
    ...gas,
    tabs,
    mail,
    fetches,
    props,
    queue,
    statusOf,
    reply(urlFragment, code, body) {
      replies.push({ match: urlFragment, code, body });
    },
  };
}

let h: Harness;
beforeEach(() => { h = load(); });

const DSCR_LEAD = {
  submissionId: 'followup-dscr-1',
  source: 'dscr', firstName: 'Jane', lastName: 'Investor', email: 'jane@example.com',
  phone: '7148821190', state: 'CA', dscr: '1.17', downPayment: '25%',
  loanAmount: '$240,000', rate: '7.00%',
};

/** The guide call is the one that goes to our own Netlify function. */
const guideCalls = (h: Harness) => h.fetches.filter((f) => f.url.includes('/api/send-'));
const bonzoCalls = (h: Harness) => h.fetches.filter((f) => f.url.includes('getbonzo.com'));

describe('the happy path: guide once, row done, no Bonzo', () => {
  it('sends the DSCR guide and marks the row done without calling Bonzo', () => {
    h.queue(DSCR_LEAD);
    h.processFollowUps();

    expect(bonzoCalls(h)).toHaveLength(0);
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

describe('a guide that fails is retried', () => {
  it('marks an explicitly keyed-protocol 503 as a safe retry without alerting yet', () => {
    h.reply('send-dscr-guide', 503, JSON.stringify({ deliveryProtocol: 'resend-key-v1', submissionId: DSCR_LEAD.submissionId, error: 'Resend unavailable' }));
    h.queue(DSCR_LEAD);
    h.processFollowUps();

    expect(h.statusOf().status).toBe('guide-retry:1');
    expect(h.statusOf().error).toBeTruthy();
    expect(h.mail).toHaveLength(0); // a retry is not worth an email
  });

  it('re-sends only the guide on a retry pass', () => {
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
    h.reply('send-dscr-guide', 503, JSON.stringify({ deliveryProtocol: 'resend-key-v1', submissionId: DSCR_LEAD.submissionId, error: 'Resend unavailable' }));
    h.queue(DSCR_LEAD, 'guide-retry:5', new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString());
    h.processFollowUps();

    expect(h.statusOf().status).toBe('guide-failed');
    expect(h.mail).toHaveLength(1);
    expect(h.mail[0].body).toContain('jane@example.com');
    expect(h.mail[0].body).toContain('[guide-failed]');
    expect(h.mail[0].body).toContain('before reconciliation');
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

  it('holds a legacy abandoned row for reconciliation without resending', () => {
    h.queue(DSCR_LEAD, 'processing:0', new Date(Date.now() - 20 * 60 * 1000).toISOString());
    h.processFollowUps();
    expect(guideCalls(h)).toHaveLength(0);
    expect(h.statusOf().status).toBe('guide-uncertain');
    expect(h.mail[0].body).toContain('reconciliation');
  });

  it('holds a legacy bare "processing" row with no timestamp instead of guessing acceptance', () => {
    h.queue(DSCR_LEAD, 'processing', '');
    h.processFollowUps();
    expect(h.statusOf().status).toBe('guide-uncertain');
    expect(guideCalls(h)).toHaveLength(0);
  });

  it('recovers a checkpointed keyed guide orphan within its provider window using the original delivery identity', () => {
    const startedAt = new Date(Date.now() - 20 * 60_000).toISOString();
    h.queue({ ...DSCR_LEAD, _delivery: { version: 1, id: DSCR_LEAD.submissionId, token: 'abandoned-token', attempt: 1,
      jobs: { hubspot: { state: 'sent' }, guide: { state: 'inflight', retrySafe: true, startedAt } } } }, 'processing:0', startedAt);
    h.processFollowUps();
    expect(guideCalls(h)).toHaveLength(1);
    const body = JSON.parse(String(guideCalls(h)[0].options.payload));
    expect(body).toMatchObject({ submissionId: DSCR_LEAD.submissionId, deliveryStartedAt: startedAt });
    expect(h.statusOf().status).toBe('done');
  });

  it('preserves an unreadable row as terminal error for the digest without stopping the batch or alerting every minute', () => {
    h.queue({ source: 'dscr', email: 'bad@example.com' });
    // Corrupt the payload cell so JSON.parse inside the loop throws.
    h.tabs.get('Follow-ups')!.rows[1][6] = '{oops';
    h.queue(DSCR_LEAD);
    h.processFollowUps();

    expect(h.statusOf(1).status).toBe('error');
    expect(h.statusOf(2).status).toBe('done'); // the second row still ran
    expect(h.mail).toHaveLength(0);
    expect(h.tabs.get('Follow-ups')!.rows[1][6]).toBe('{oops');
    h.processFollowUps();
    expect(h.mail).toHaveLength(0);
    h.sendGuideDigest();
    expect(h.mail).toHaveLength(1);
    expect(h.mail[0].body).toContain('Invalid queue payload');
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

  it('goes only to Max, without notifying Darren', () => {
    h.queue({ source: 'dscr', email: 'a@example.com' }, 'guide-failed', new Date().toISOString());
    h.sendGuideDigest();
    expect(h.mail[0].to).toBe('liannemaxbalbastro@gmail.com');
  });
});

/**
 * The contact modal's instant reply.
 *
 * Every magnet form sent the visitor something. The contact modal, the form that
 * asks the most, sent nothing at all until 26 Sep 2026, so a visitor who pressed
 * "Send My Info to Darren" had no proof it arrived and no way to move first.
 */
describe('the contact confirmation', () => {
  const CONTACT_LEAD = {
    source: 'home-contact', firstName: 'Sam', lastName: 'Homeowner',
    email: 'sam@example.com', phone: '7148821191', state: 'CA',
    message: 'Want to clear two credit cards',
  };

  function configured(): Harness {
    const harness = load();
    harness.props.NETLIFY_CONTACT_CONFIRM_URL = 'https://realdarrentsai.com/api/send-contact-confirmation';
    harness.props.NETLIFY_CONTACT_CONFIRM_KEY = 'test-key';
    return harness;
  }

  it('emails a contact lead its confirmation and marks the row done', () => {
    const c = configured();
    c.queue(CONTACT_LEAD);
    c.processFollowUps();

    const sent = guideCalls(c);
    expect(sent).toHaveLength(1);
    expect(sent[0].url).toContain('send-contact-confirmation');
    expect(c.statusOf().status).toBe('done');
  });

  it('carries what the visitor wrote, so the reply is not generic', () => {
    const c = configured();
    c.queue(CONTACT_LEAD);
    c.processFollowUps();
    expect(String(guideCalls(c)[0].options.payload)).toContain('Want to clear two credit cards');
  });

  it.each(['dscr-contact', 'fha-contact', 'rei-contact', 'mortgage-calculator-contact', 'debt-consolidation-contact'])(
    'covers the copy of the modal on every page (%s)',
    (source) => {
      const c = configured();
      c.queue({ ...CONTACT_LEAD, source });
      c.processFollowUps();
      expect(guideCalls(c).map((f) => f.url).join(' ')).toContain('send-contact-confirmation');
    },
  );

  /**
   * R2 (10 Oct, copy approved by Max): the calculator funnels get the email that
   * fits them, on the same template. The context is what picks the words; the
   * dropdown answers ride along for the one sentence that may name them.
   */
  const bodyOf = (c: Harness) => JSON.parse(String(guideCalls(c)[0].options.payload));

  it.each([
    [{ source: 'DebtConsolidation', firstName: 'Dee' }, 'debt'],
    [{ source: 'home-equity', firstName: 'Hal', goal: 'Renovation / ADU' }, 'home-equity'],
    [{ source: 'adu', firstName: 'Ada', projectPurpose: 'Rental ADU' }, 'adu'],
    [{ source: 'mortgage-calculator-contact', firstName: 'Mo', loanAmount: 400000, message: 'Under 2,800' }, 'mortgage-review'],
  ])('sends a %o lead the %s confirmation', (lead, context) => {
    const c = configured();
    c.queue({ ...CONTACT_LEAD, message: '', ...lead });
    c.processFollowUps();
    const body = bodyOf(c);
    expect(guideCalls(c)[0].url).toContain('send-contact-confirmation');
    expect(body.context).toBe(context);
    if (context === 'home-equity') expect(body.goal).toBe('Renovation / ADU');
    if (context === 'adu') expect(body.projectPurpose).toBe('Rental ADU');
    expect(c.statusOf().status).toBe('done');
  });

  it('keeps the contact email, and its body, for a contact lead', () => {
    const c = configured();
    c.queue(CONTACT_LEAD);
    c.processFollowUps();
    const body = bodyOf(c);
    expect(Object.keys(body).sort()).toEqual(['deliveryStartedAt', 'email', 'firstName', 'lastName', 'message', 'submissionId']);
    expect(body).toMatchObject({ email: CONTACT_LEAD.email, firstName: CONTACT_LEAD.firstName, lastName: CONTACT_LEAD.lastName, message: CONTACT_LEAD.message });
    expect(typeof body.submissionId).toBe('string');
    expect(Number.isFinite(Date.parse(body.deliveryStartedAt))).toBe(true);
  });

  it('sends the mortgage review email only when the calculator numbers came with it', () => {
    const c = configured();
    c.queue({ ...CONTACT_LEAD, source: 'mortgage-calculator-contact' });
    c.processFollowUps();
    expect(bodyOf(c).context).toBeUndefined();
  });

  it('sends nothing on a magnet lead, which has its own guide', () => {
    const c = configured();
    c.queue(DSCR_LEAD);
    c.processFollowUps();
    const urls = guideCalls(c).map((f) => f.url).join(' ');
    expect(urls).toContain('send-dscr-guide');
    expect(urls).not.toContain('send-contact-confirmation');
  });

  it('skips quietly when its Script Properties are not set yet', () => {
    // The one deliberate difference from the guide senders. A missing guide is a
    // broken promise worth alerting on; this email is promised nowhere, so an
    // unset property must not turn every contact lead red and mail Darren a LEAD
    // PIPELINE FAILURE for a lead that arrived perfectly. It also lets the
    // Netlify function and the Apps Script be deployed in either order.
    h.queue(CONTACT_LEAD);
    h.processFollowUps();

    expect(guideCalls(h)).toHaveLength(0);
    expect(h.statusOf().status).toBe('done');
    expect(h.mail.map((m) => m.subject).join(' ')).not.toContain('FAILURE');
  });
});

/**
 * Bonzo was retired on 15 Oct 2026. Rows queued before that deploy still say
 * 'pending' or 'processing:0', which is exactly when the old code pushed to
 * Bonzo. They must finish their HubSpot and guide work and never reach Bonzo,
 * whatever the leftover BONZO_* Script Properties say.
 */
describe('rows queued before Bonzo was retired', () => {
  it('finishes a pending row without a Bonzo call', () => {
    h.queue(DSCR_LEAD, 'pending');
    h.processFollowUps();
    expect(bonzoCalls(h)).toHaveLength(0);
    expect(guideCalls(h)).toHaveLength(1);
    expect(h.statusOf().status).toBe('done');
  });

  it('holds an old ambiguous first-pass orphan for reconciliation and never calls Bonzo', () => {
    h.queue(DSCR_LEAD, 'processing:0', new Date(Date.now() - 60 * 60 * 1000).toISOString());
    h.processFollowUps();
    expect(bonzoCalls(h)).toHaveLength(0);
    expect(guideCalls(h)).toHaveLength(0);
    expect(h.statusOf().status).toBe('guide-uncertain');
  });

  it('never creates a Bonzo job for any funnel', () => {
    for (const source of ['dscr', 'fha', 'real-estate-investing', 'home-equity', 'adu', 'DebtConsolidation', 'home-contact']) {
      h.queue({ source, email: source + '@example.com', state: 'CA' });
    }
    h.processFollowUps();
    expect(bonzoCalls(h)).toHaveLength(0);
  });
});
