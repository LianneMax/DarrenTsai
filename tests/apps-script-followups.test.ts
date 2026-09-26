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
import { loadGas, recordingFetch, type Tab, type FetchCall } from './helpers/gas-harness';

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
    email: 'sam@example.com', phone: '7145550144', state: 'CA',
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

  it.each(['dscr-contact', 'fha-contact', 'rei-contact', 'mortgage-calculator-contact'])(
    'covers the copy of the modal on every page (%s)',
    (source) => {
      const c = configured();
      c.queue({ ...CONTACT_LEAD, source });
      c.processFollowUps();
      expect(guideCalls(c).map((f) => f.url).join(' ')).toContain('send-contact-confirmation');
    },
  );

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
 * A lead who comes back.
 *
 * Bonzo answers 422 "already exists" for an email it already holds, which is
 * exactly what happens when someone who downloaded one guide returns for
 * another. Until 26 Sep 2026 that was reported to Darren as a LEAD PIPELINE
 * FAILURE, so he was being paged about his own returning leads: the fastest way
 * to teach someone to ignore an alert that matters.
 */
describe('a returning lead is not a failure', () => {
  const DUPLICATE = '{"message":"The email has already been taken."}';

  it('does not alert when Bonzo says the prospect already exists', () => {
    h.reply('getbonzo.com', 422, DUPLICATE);
    h.queue(DSCR_LEAD);
    h.processFollowUps();

    expect(h.mail.map((m) => m.subject).join(' ')).not.toContain('FAILURE');
  });

  it('records it where a lead is traced, rather than silently', () => {
    h.reply('getbonzo.com', 422, DUPLICATE);
    h.queue(DSCR_LEAD);
    h.processFollowUps();

    const debug = h.tabs.get('Debug');
    const text = JSON.stringify(debug ? debug.rows : []);
    expect(text).toContain('returning lead');
    expect(text).toContain('jane@example.com');
  });

  it('still sends the guide they came back for', () => {
    // The whole point of the visit. Bonzo's answer must not stop it.
    h.reply('getbonzo.com', 422, DUPLICATE);
    h.queue(DSCR_LEAD);
    h.processFollowUps();

    expect(guideCalls(h).map((f) => f.url).join(' ')).toContain('send-dscr-guide');
    expect(h.statusOf().status).toBe('done');
  });

  it('still alerts on a 422 that is a real rejection', () => {
    // Narrow on purpose: 422 is also how a malformed body comes back, and
    // silencing that would hide a genuine break.
    h.reply('getbonzo.com', 422, '{"message":"The phone field is invalid."}');
    h.queue(DSCR_LEAD);
    h.processFollowUps();

    expect(h.mail.map((m) => m.subject).join(' ')).toContain('FAILURE');
  });

  it('still alerts on a 500', () => {
    h.reply('getbonzo.com', 500, 'upstream exploded');
    h.queue(DSCR_LEAD);
    h.processFollowUps();

    expect(h.mail.map((m) => m.subject).join(' ')).toContain('FAILURE');
  });
});
