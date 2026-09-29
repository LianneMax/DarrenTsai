/**
 * pushToHubSpot and the follow-up queue's handling of it (audit H3).
 *
 * HubSpot is a second destination next to Bonzo and it ships dark: it must do
 * nothing until its Script Properties are set, must never cost a lead its
 * guide email, and must never make a retry mail the same guide twice. These
 * run the real google-apps-script.js against the shared fake runtime and assert
 * on what reached the Forms API, the Status cell left behind, and the mail sent.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { loadGas, type Tab, type FetchCall, type FetchResponse } from './helpers/gas-harness';

type Outcome = { outcome: string; detail?: string };
type Field = { objectTypeId: string; name: string; value: string };

type Harness = {
  processFollowUps: () => void;
  sendGuideDigest: () => void;
  pushToHubSpot: (ss: unknown, data: Record<string, unknown>) => Outcome;
  hubspotFields: (data: Record<string, unknown>) => Field[];
  hubspotContext: (data: Record<string, unknown>) => Record<string, string>;
  hubspotRejectedFields: (text: string) => string[];
  nextFollowUpStatus: (outcomes: Record<string, string>, attempt: number) => { status: string; alert: boolean; bad: string[] };
  followUpJobs: (status: string) => { guide: boolean; hubspot: boolean };
  claimDecision: (status: unknown, processedAt: unknown, now: number) => { claim: boolean; attempts: number; reason: string };
  GUIDE_MAX_ATTEMPTS: number;
  tabs: Map<string, Tab>;
  mail: Array<{ to: string; subject: string; body: string }>;
  fetches: FetchCall[];
  props: Record<string, string>;
  /** Replies for URLs containing `match`, handed out in order; the last one repeats. */
  reply: (match: string, ...answers: Array<{ code: number; body?: string }>) => void;
  queue: (payload: Record<string, unknown>, status?: string, processedAt?: string) => void;
  statusOf: (row?: number) => { status: string; processedAt: unknown; error: string };
};

/** A reply code that makes the fake fetch throw instead of answering. */
const THROW = -1;

const HUBSPOT_PROPS = { HUBSPOT_PORTAL_ID: '247401197', HUBSPOT_FORM_GUID: 'form-guid-1' };

function load(extraProps: Record<string, string> = HUBSPOT_PROPS): Harness {
  const mail: Harness['mail'] = [];
  const fetches: FetchCall[] = [];
  const replies = new Map<string, Array<{ code: number; body?: string }>>();
  const props: Record<string, string> = {
    NETLIFY_DSCR_PDF_URL: 'https://realdarrentsai.com/api/send-dscr-guide',
    NETLIFY_DSCR_PDF_KEY: 'test-key',
    BONZO_API_KEY: 'bonzo-token',
    BONZO_CAMPAIGN_ID: '100',
    ...extraProps,
  };

  // Sequenced per URL fragment, unlike recordingFetch: the resubmit test needs
  // the same HubSpot URL to answer 400 and then 200.
  const fetch = (url: string, options: Record<string, unknown>): FetchResponse => {
    fetches.push({ url, options });
    for (const [match, queue] of replies) {
      if (url.includes(match)) {
        const next = queue.length > 1 ? queue.shift()! : queue[0];
        // As UrlFetchApp does on a DNS failure or a timeout.
        if (next.code === THROW) throw new Error('Address unavailable');
        return { getResponseCode: () => next.code, getContentText: () => next.body ?? '{}' };
      }
    }
    return { getResponseCode: () => 200, getContentText: () => '{"data":{"id":1}}' };
  };

  const { gas, tabs, queue, statusOf } = loadGas<Omit<Harness, 'tabs' | 'mail' | 'fetches' | 'props' | 'reply' | 'queue' | 'statusOf'>>({
    exports: [
      'processFollowUps', 'sendGuideDigest', 'pushToHubSpot', 'hubspotFields', 'hubspotContext',
      'hubspotRejectedFields', 'nextFollowUpStatus', 'followUpJobs', 'claimDecision', 'GUIDE_MAX_ATTEMPTS',
    ],
    props,
    onMail: (m) => mail.push(m),
    fetch,
  });

  return {
    ...gas,
    tabs,
    mail,
    fetches,
    props,
    queue,
    statusOf,
    reply(match, ...answers) { replies.set(match, answers); },
  };
}

const HUTK = '0123456789abcdef0123456789abcdef';

const LEAD = {
  source: 'dscr', formId: 'dscr-magnet', firstName: 'Jane', lastName: 'Investor',
  email: 'jane@example.com', phone: '7148821190', state: 'CA', dscr: '1.17',
  utm_source: 'google', utm_medium: 'cpc', utm_campaign: 'dscr-search',
  clickId: 'GCLID-1', clickIdType: 'gclid',
  firstUtmSource: 'youtube', firstUtmMedium: 'video', firstUtmCampaign: 'dscr-explainer',
  pageUri: 'https://realdarrentsai.com/dscr/?gclid=GCLID-1', pageName: 'DSCR Loan Calculator',
  hutk: HUTK,
};

const hubspotCalls = (h: Harness) => h.fetches.filter((f) => f.url.includes('hsforms.com'));
const guideCalls = (h: Harness) => h.fetches.filter((f) => f.url.includes('send-dscr-guide'));
const bonzoCalls = (h: Harness) => h.fetches.filter((f) => f.url.includes('getbonzo.com') && !f.url.includes('/notes'));
const bodyOf = (call: FetchCall) => JSON.parse(String(call.options.payload));
const fieldMap = (fields: Field[]) => Object.fromEntries(fields.map((f) => [f.name, f.value]));
const debugMessages = (h: Harness) => (h.tabs.get('Debug')?.rows ?? []).slice(1).map((r) => String(r[1]));

describe('ships dark', () => {
  it('skips, without calling HubSpot, until both Script Properties are set', () => {
    for (const missing of [{}, { HUBSPOT_PORTAL_ID: '247401197' }, { HUBSPOT_FORM_GUID: 'g' }]) {
      const h = load(missing);
      h.queue(LEAD);
      h.processFollowUps();
      expect(hubspotCalls(h)).toHaveLength(0);
      expect(h.statusOf().status).toBe('done'); // nothing else about the lead changes
      expect(guideCalls(h)).toHaveLength(1);
      expect(bonzoCalls(h)).toHaveLength(1);
      expect(debugMessages(h).some((m) => /pushToHubSpot: skipped/.test(m))).toBe(true);
      expect(h.mail).toHaveLength(0);
    }
  });

  it('posts to the Forms API v3 submit endpoint for the portal and form', () => {
    const h = load();
    h.queue(LEAD);
    h.processFollowUps();
    const [call] = hubspotCalls(h);
    expect(call.url).toBe('https://api.hsforms.com/submissions/v3/integration/submit/247401197/form-guid-1');
    expect(call.options.method).toBe('post');
    expect(debugMessages(h)).toContain('pushToHubSpot: 200');
    expect(h.statusOf().status).toBe('done');
  });

  it('uses a regional host when HUBSPOT_FORMS_HOST says so', () => {
    const h = load({ ...HUBSPOT_PROPS, HUBSPOT_FORMS_HOST: 'api-na2.hsforms.com' });
    h.queue(LEAD);
    h.processFollowUps();
    expect(hubspotCalls(h)[0].url).toMatch(/^https:\/\/api-na2\.hsforms\.com\/submissions\/v3\//);
  });
});

describe('test leads', () => {
  const TEST_LEAD = { ...LEAD, email: 'liannemaxbalbastro+h3@gmail.com' };

  it('are skipped by default', () => {
    const h = load();
    h.queue(TEST_LEAD);
    h.processFollowUps();
    expect(hubspotCalls(h)).toHaveLength(0);
    expect(debugMessages(h)).toContain('pushToHubSpot: skipped, test lead');
  });

  it('are sent with HUBSPOT_SEND_TESTS=true, marked rdt_test_lead = Yes', () => {
    const h = load({ ...HUBSPOT_PROPS, HUBSPOT_SEND_TESTS: 'true' });
    h.queue(TEST_LEAD);
    h.processFollowUps();
    const fields = fieldMap(bodyOf(hubspotCalls(h)[0]).fields);
    expect(fields.rdt_test_lead).toBe('Yes');
  });

  it('are marked No when real', () => {
    const h = load();
    expect(fieldMap(h.hubspotFields(LEAD)).rdt_test_lead).toBe('No');
  });
});

describe('what is sent', () => {
  let h: Harness;
  beforeEach(() => { h = load(); });

  it('maps the contact, source, form, page and attribution fields', () => {
    expect(fieldMap(h.hubspotFields(LEAD))).toEqual({
      email: 'jane@example.com',
      firstname: 'Jane',
      lastname: 'Investor',
      phone: '7148821190',
      state: 'CA',
      rdt_lead_source: 'dscr',
      rdt_form_id: 'dscr-magnet',
      rdt_page_path: '/dscr/',
      rdt_gclid: 'GCLID-1',
      hs_google_click_id: 'GCLID-1',
      rdt_first_utm_source: 'youtube',
      rdt_first_utm_medium: 'video',
      rdt_first_utm_campaign: 'dscr-explainer',
      rdt_latest_utm_source: 'google',
      rdt_latest_utm_medium: 'cpc',
      rdt_latest_utm_campaign: 'dscr-search',
      rdt_licensed_state: 'Yes',
      rdt_test_lead: 'No',
    });
    for (const f of h.hubspotFields(LEAD)) expect(f.objectTypeId).toBe('0-1');
  });

  it('never sends a blank, a whitespace value, or a stand-in for one', () => {
    const fields = h.hubspotFields({
      source: 'home-contact', email: 'a@example.com', firstName: '', lastName: '   ',
      phone: undefined, state: '', utm_source: '', clickId: '', clickIdType: '', formId: null,
    });
    expect(fields.map((f) => f.name).sort()).toEqual(['email', 'rdt_lead_source', 'rdt_test_lead']);
    for (const f of fields) expect(f.value.trim()).not.toBe('');
  });

  it('leaves rdt_licensed_state out when the lead gave no state, rather than saying No', () => {
    expect(fieldMap(h.hubspotFields({ ...LEAD, state: '' })).rdt_licensed_state).toBeUndefined();
    expect(fieldMap(h.hubspotFields({ ...LEAD, state: 'NY' })).rdt_licensed_state).toBe('No');
  });

  it('keeps the first touch click id when it came from another network', () => {
    const fields = fieldMap(h.hubspotFields({
      ...LEAD, clickId: 'MS-1', clickIdType: 'msclkid', firstClickId: 'G-FIRST', firstClickIdType: 'gclid',
    }));
    expect(fields.rdt_msclkid).toBe('MS-1');
    expect(fields.rdt_gclid).toBe('G-FIRST');
    expect(fields.hs_google_click_id).toBe('G-FIRST');
  });

  it('ignores a click id type it does not know, instead of inventing a property', () => {
    const fields = h.hubspotFields({ ...LEAD, clickId: 'X', clickIdType: 'constructor' });
    expect(fields.some((f) => /constructor|undefined/.test(f.name))).toBe(false);
  });

  it('passes hutk, pageUri and pageName through as the submission context', () => {
    h.queue(LEAD);
    h.processFollowUps();
    expect(bodyOf(hubspotCalls(h)[0]).context).toEqual({
      hutk: HUTK,
      pageUri: 'https://realdarrentsai.com/dscr/?gclid=GCLID-1',
      pageName: 'DSCR Loan Calculator',
    });
  });

  it('drops a malformed hutk rather than risk the submission over it', () => {
    expect(h.hubspotContext({ ...LEAD, hutk: 'not-a-hutk' }).hutk).toBeUndefined();
  });

  it('skips a phone-only lead: HubSpot has no contact to make from it', () => {
    h.queue({ ...LEAD, email: '' });
    h.processFollowUps();
    expect(hubspotCalls(h)).toHaveLength(0);
    expect(debugMessages(h)).toContain('pushToHubSpot: skipped, no email');
  });
});

describe('fields the form refuses', () => {
  const REFUSED = JSON.stringify({
    status: 'error',
    message: 'The request is not valid',
    errors: [
      { message: "Error in 'fields.rdt_gbraid'. Field 'rdt_gbraid' was not in the form definition", errorType: 'FIELD_NOT_IN_FORM_DEFINITION' },
      { message: "Error in 'fields.hs_google_click_id'. Property is read only", errorType: 'INVALID_PROPERTY' },
    ],
  });

  it('reads the named fields out of the error body', () => {
    const h = load();
    expect(h.hubspotRejectedFields(REFUSED)).toEqual(['rdt_gbraid', 'hs_google_click_id']);
    expect(h.hubspotRejectedFields('{"status":"error","message":"form not found"}')).toEqual([]);
  });

  it('resubmits once without them, so the lead still reaches HubSpot, and says so', () => {
    const h = load();
    h.reply('hsforms.com', { code: 400, body: REFUSED }, { code: 200 });
    h.queue({ ...LEAD, clickId: 'GB-1', clickIdType: 'gbraid', firstClickId: 'G-1', firstClickIdType: 'gclid' });
    h.processFollowUps();

    const calls = hubspotCalls(h);
    expect(calls).toHaveLength(2);
    const second = fieldMap(bodyOf(calls[1]).fields);
    expect(second.rdt_gbraid).toBeUndefined();
    expect(second.hs_google_click_id).toBeUndefined();
    expect(second.email).toBe('jane@example.com');
    expect(second.rdt_gclid).toBe('G-1');
    expect(h.statusOf().status).toBe('done');

    // A setup gap is worth one plain email; the refused hs_google_click_id alone is not.
    expect(h.mail).toHaveLength(1);
    expect(h.mail[0].subject).toBe('HubSpot is dropping lead fields: rdt_gbraid');
    expect(h.mail[0].body).toContain('ARE reaching HubSpot');
  });

  it('does not email about hs_google_click_id being refused on its own', () => {
    const h = load();
    const onlyGclid = JSON.stringify({ errors: [{ message: "Error in 'fields.hs_google_click_id'. Property is read only" }] });
    h.reply('hsforms.com', { code: 400, body: onlyGclid }, { code: 200 });
    h.queue(LEAD);
    h.processFollowUps();
    expect(hubspotCalls(h)).toHaveLength(2);
    expect(h.statusOf().status).toBe('done');
    expect(h.mail).toHaveLength(0);
  });

  it('never drops the email, which is what makes the contact', () => {
    const h = load();
    const badEmail = JSON.stringify({ errors: [{ message: "Error in 'fields.email'. Invalid email address", errorType: 'INVALID_EMAIL' }] });
    h.reply('hsforms.com', { code: 400, body: badEmail });
    h.queue(LEAD);
    h.processFollowUps();
    expect(hubspotCalls(h)).toHaveLength(1);
    expect(h.statusOf().status).toBe('hubspot-rejected');
  });
});

describe('failures go to the retry queue and the alert', () => {
  it('a 5xx is retried later, without mailing the delivered guide again', () => {
    const h = load();
    h.reply('hsforms.com', { code: 503 }, { code: 200 });
    h.queue(LEAD);
    h.processFollowUps();

    expect(h.statusOf().status).toBe('hubspot-retry:1');
    expect(h.statusOf().error).toMatch(/pushToHubSpot 503/);
    expect(guideCalls(h)).toHaveLength(1);
    expect(h.mail).toHaveLength(0); // not yet: it may well recover

    // Past the backoff, the next run owes HubSpot only.
    const row = h.tabs.get('Follow-ups')!.rows[1];
    row[2] = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    h.processFollowUps();
    expect(hubspotCalls(h)).toHaveLength(2);
    expect(guideCalls(h)).toHaveLength(1);
    expect(bonzoCalls(h)).toHaveLength(1);
    expect(h.statusOf().status).toBe('done');
  });

  it('a 4xx that names no field is rejected at once and alerted', () => {
    const h = load();
    h.reply('hsforms.com', { code: 404, body: '{"status":"error","message":"Form not found"}' });
    h.queue(LEAD);
    h.processFollowUps();
    expect(hubspotCalls(h)).toHaveLength(1);
    expect(h.statusOf().status).toBe('hubspot-rejected');
    expect(h.mail).toHaveLength(1);
    expect(h.mail[0].body).toContain('HubSpot did NOT receive jane@example.com');
    expect(h.mail[0].body).toContain('Form not found');
  });

  it('a throw is treated as retryable', () => {
    const h = load();
    h.reply('hsforms.com', { code: THROW });
    h.queue(LEAD);
    h.processFollowUps();
    expect(h.statusOf().status).toBe('hubspot-retry:1');
    expect(h.statusOf().error).toContain('pushToHubSpot threw');
    expect(guideCalls(h)).toHaveLength(1); // the guide still went out
  });

  it('gives up after the last attempt, as hubspot-failed, and alerts', () => {
    const h = load();
    h.reply('hsforms.com', { code: 503 });
    const last = h.GUIDE_MAX_ATTEMPTS - 1;
    h.queue(LEAD, `hubspot-retry:${last}`, new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
    h.processFollowUps();
    expect(guideCalls(h)).toHaveLength(0);
    expect(h.statusOf().status).toBe('hubspot-failed');
    expect(h.mail).toHaveLength(1);
  });

  it('shows up in the daily digest', () => {
    const h = load();
    h.queue(LEAD, 'hubspot-failed', new Date().toISOString());
    h.sendGuideDigest();
    expect(h.mail).toHaveLength(1);
    expect(h.mail[0].subject).toBe('1 lead follow-up(s) did not finish in the last 24h');
    expect(h.mail[0].body).toContain('not in HubSpot');
  });

  it('a returning lead is a 200 like any other, not a failure', () => {
    const h = load();
    h.queue(LEAD);
    h.queue(LEAD);
    h.processFollowUps();
    expect(h.statusOf(1).status).toBe('done');
    expect(h.statusOf(2).status).toBe('done');
    expect(h.mail).toHaveLength(0);
  });
});

describe('which job a row still owes', () => {
  let h: Harness;
  beforeEach(() => { h = load(); });

  it('names only what failed', () => {
    expect(h.nextFollowUpStatus({ guide: 'sent', hubspot: 'sent' }, 1)).toMatchObject({ status: 'done', alert: false });
    expect(h.nextFollowUpStatus({ guide: 'retry', hubspot: 'sent' }, 1).status).toBe('guide-retry:1');
    expect(h.nextFollowUpStatus({ guide: 'sent', hubspot: 'retry' }, 1).status).toBe('hubspot-retry:1');
    expect(h.nextFollowUpStatus({ guide: 'retry', hubspot: 'retry' }, 2).status).toBe('retry:2');
  });

  it('alerts on a job that ended badly without closing the row on the other', () => {
    expect(h.nextFollowUpStatus({ guide: 'retry', hubspot: 'rejected' }, 1))
      .toEqual({ status: 'guide-retry:1', alert: true, bad: ['hubspot-rejected'] });
  });

  it('reads the owed job back, and treats anything unmarked as owing both', () => {
    expect(h.followUpJobs('guide-retry:2')).toEqual({ guide: true, hubspot: false });
    expect(h.followUpJobs('processing-guide:2')).toEqual({ guide: true, hubspot: false });
    expect(h.followUpJobs('hubspot-retry:1')).toEqual({ guide: false, hubspot: true });
    expect(h.followUpJobs('processing-hubspot:1')).toEqual({ guide: false, hubspot: true });
    for (const s of ['pending', 'retry:3', 'processing:0', 'processing']) {
      expect(h.followUpJobs(s), s).toEqual({ guide: true, hubspot: true });
    }
  });

  it('schedules the new statuses on the same backoff as a guide retry', () => {
    const now = Date.now();
    const justNow = new Date(now - 10 * 1000).toISOString();
    const later = new Date(now - 2 * 60 * 1000).toISOString();
    for (const s of ['hubspot-retry:1', 'retry:1']) {
      expect(h.claimDecision(s, justNow, now).claim, s).toBe(false);
      expect(h.claimDecision(s, later, now), s).toEqual({ claim: true, attempts: 1, reason: 'retry' });
    }
    const stale = new Date(now - 11 * 60 * 1000).toISOString();
    expect(h.claimDecision('processing-hubspot:2', stale, now)).toEqual({ claim: true, attempts: 2, reason: 'orphan' });
    for (const s of ['hubspot-failed', 'hubspot-rejected']) {
      expect(h.claimDecision(s, stale, now).claim, s).toBe(false);
    }
  });

  it('recovers an orphaned HubSpot-only claim without re-sending the guide', () => {
    const stale = new Date(Date.now() - 11 * 60 * 1000).toISOString();
    h.queue(LEAD, 'processing-hubspot:1', stale);
    h.processFollowUps();
    expect(hubspotCalls(h)).toHaveLength(1);
    expect(guideCalls(h)).toHaveLength(0);
    expect(bonzoCalls(h)).toHaveLength(0);
    expect(h.statusOf().status).toBe('done');
  });

  it('leaves a guide-only retry from before HubSpot existed as guide-only', () => {
    const old = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    h.queue(LEAD, 'guide-retry:1', old);
    h.processFollowUps();
    expect(hubspotCalls(h)).toHaveLength(0);
    expect(guideCalls(h)).toHaveLength(1);
  });
});
