import { describe, expect, it, vi } from 'vitest';
import { loadGas, type MailMessage } from './helpers/gas-harness';
import { BOOKING_GOALS, propertyUses, PROPERTY_STATES, serviceArea } from '../src/utils/serviceArea';

const KEY = 'private-booking-test';
type Runtime = {
  doPost: (event: { postData: { contents: string } }) => { __body: string };
  processFollowUps: () => void;
  bookingServiceArea: (data: Record<string, unknown>) => string;
  captureServiceArea: (data: Record<string, unknown>) => string;
  alertFailure: (detail: string, raw?: string) => void;
  SpreadsheetApp: { openById: (id: string) => unknown; flush: () => void };
  LockService: { getScriptLock: () => { waitLock: (ms: number) => void; releaseLock: () => void } };
  CacheService: { getScriptCache: () => { get: (key: string) => unknown; put: (key: string, value: string) => void } };
};
function setup() {
  const mail: MailMessage[] = [];
  const calls: string[] = [];
  const h = loadGas<Runtime>({ exports: ['doPost', 'processFollowUps', 'bookingServiceArea', 'captureServiceArea', 'alertFailure', 'SpreadsheetApp', 'LockService', 'CacheService'],
    props: { LEAD_PROXY_KEY: KEY, HUBSPOT_PORTAL_ID: '123', HUBSPOT_FORM_GUID: 'test-form', HUBSPOT_SEND_TESTS: 'true',
      NETLIFY_CONTACT_CONFIRM_URL: 'https://realdarrentsai.com/api/send-contact-confirmation', NETLIFY_CONTACT_CONFIRM_KEY: 'confirm',
      CALLRAIL_SYNC_ENABLED: 'true', CALLRAIL_SEND_TESTS: 'true', CALLRAIL_API_TOKEN: 'test', CALLRAIL_ACCOUNT_ID: '123', CALLRAIL_COMPANY_ID: '456' },
    fetch: url => { calls.push(url); return { getResponseCode: () => 200, getContentText: () => '{"emails":[]}' }; },
    onMail: message => mail.push(message) });
  const post = (data: Record<string, unknown>) => JSON.parse(h.gas.doPost({ postData: { contents: JSON.stringify({ ...data, _proxyKey: KEY }) } }).__body);
  return { ...h, post, mail, calls };
}
function inquiry(patch: Record<string, unknown> = {}) {
  return { source: 'book-contact', formId: 'booking-prequal', submissionId: 'booking-capture-123', bookingGoal: 'equity',
    firstName: 'Test', lastName: 'Inquiry', email: 'qa@example.com', phone: '(714) 555-0123',
    state: 'CO', propertyState: 'CO', propertyUse: 'primary', propertyType: 'single-family-condo',
    mortgageCurrent: 'yes', recentBankruptcyForeclosure: 'no', privacyAcknowledged: true, privacyVersion: '2026-10-13-v1',
    timestamp: '2026-10-22T01:00:00Z', serviceAreaResult: 'supported', serviceAreaVersion: 'forged', ...patch };
}

describe('authoritative Sheet-only booking inquiries', () => {
  it('pins the Apps Script policy mirror against every supported goal/use/state combination', () => {
    const h = setup();
    for (const goal of Object.keys(BOOKING_GOALS)) for (const use of propertyUses('', goal)) for (const state of PROPERTY_STATES) {
      expect(h.gas.bookingServiceArea({ bookingGoal: goal, propertyUse: use, propertyState: state }), `${goal}/${use}/${state}`)
        .toBe(serviceArea(use, state, '', goal));
    }
  });
  it.each([
    ['CO', 'primary', 'equity', 'Home Equity'], ['NY', 'investment', 'dscr', 'DSCR'],
  ])('saves %s/%s only once in its existing goal tab with an honest receipt and no downstream queue', (state, use, goal, tab) => {
    const h = setup();
    const data = inquiry({ propertyState: state, state: 'CA', propertyUse: use, bookingGoal: goal, captureDisposition: 'supported' });
    expect(h.post(data)).toEqual({ success: true, submissionId: data.submissionId, receipt: 'saved', replayed: false, disposition: 'sheet-only' });
    expect(h.rowOf(tab)).toMatchObject({ State: state, 'Property State': state, 'Licensed?': 'No',
      'Service Area Result': 'out-of-market', 'Service Area Version': '2026-10-15-v3', Status: 'Sheet only: outside service area', Contacted: '',
      'Privacy Acknowledged': 'Yes', 'Form ID': 'booking-prequal' });
    const snapshot = JSON.parse(String(h.rowOf(tab)['Submission Snapshot']));
    expect(snapshot.captureDisposition).toBe('sheet-only');
    expect(snapshot.state).toBe(state);
    expect(h.post(data)).toMatchObject({ success: true, replayed: true, disposition: 'sheet-only' });
    expect(h.tabs.get(tab)!.rows).toHaveLength(2);
    expect(h.tabs.has('Follow-ups')).toBe(false);
    expect(h.tabs.has('CallRail Sync')).toBe(false);
    h.gas.processFollowUps();
    expect(h.calls.filter(url => !url.endsWith('/stop-email'))).toEqual([]);
    expect(h.mail).toEqual([]);
  });
  // 22 Oct (Max): failed knockouts outside the service area are still recorded Sheet-only.
  it.each([{ mortgageCurrent: 'no' }, { recentBankruptcyForeclosure: 'yes' }, { propertyType: 'mobile-land' }])('records an outside-area knockout %j Sheet-only, but refuses it in-area', fields => {
    const h = setup();
    expect(h.post(inquiry(fields))).toMatchObject({ success: true, disposition: 'sheet-only' });
    expect(h.rowOf('Home Equity')).toMatchObject({ 'Property State': 'CO', Status: 'Sheet only: outside service area' });
    expect(h.tabs.has('Follow-ups')).toBe(false);
    const inArea = setup();
    expect(inArea.post(inquiry({ ...fields, propertyState: 'CA', state: 'CA', submissionId: 'in-area-knockout' }))).toMatchObject({ success: false, code: 'invalid_booking_inquiry' });
    expect(inArea.post(inquiry({ propertyType: 'boat', submissionId: 'garbage' }))).toMatchObject({ success: false, code: 'invalid_booking_inquiry' });
  });
  it('rejects changed answers under an existing Sheet-only ID without queue repair', () => {
    const h = setup(); const data = inquiry(); h.post(data);
    expect(h.post({ ...data, firstName: 'Changed' })).toMatchObject({ success: false, code: 'submission_conflict' });
    expect(h.tabs.get('Home Equity')!.rows).toHaveLength(2); expect(h.tabs.has('Follow-ups')).toBe(false);
  });
  it.each([
    { privacyAcknowledged: false }, { privacyVersion: '' }, { firstName: '' }, { lastName: '' },
    { email: 'bad' }, { phone: '' }, { propertyState: 'ZZ' }, { propertyUse: 'vacation' },
    { bookingGoal: 'unknown' }, { submissionId: '' }, { propertyType: 'mobile-land', propertyState: 'CA', state: 'CA' },
    { mortgageCurrent: 'no', propertyState: 'CA', state: 'CA' }, { recentBankruptcyForeclosure: 'yes', propertyState: 'CA', state: 'CA' },
    { mortgageCurrent: 'maybe' }, { propertyType: 'boat' },
  ])('rejects incomplete, invalid, unconsented or non-state knockout submissions without any row (%j)', patch => {
    const h = setup(); expect(h.post(inquiry(patch))).toMatchObject({ success: false, code: 'invalid_booking_inquiry' });
    expect(h.tabs.size).toBe(0); expect(h.calls).toEqual([]); expect(h.mail).toEqual([]);
  });
  it.each([
    ['CA', 'primary', 'equity', 'Home Equity', 'Yes'], ['CO', 'investment', 'dscr', 'DSCR', 'No'],
  ])('keeps normal qualified flow for %s/%s, stripping forged disposition', (state, use, goal, tab, licensed) => {
    const h = setup(); const data = inquiry({ state, propertyState: state, propertyUse: use, bookingGoal: goal, captureDisposition: 'sheet-only', disposition: 'sheet-only' });
    expect(h.post(data)).toEqual({ success: true, submissionId: data.submissionId, receipt: 'saved', replayed: false });
    expect(h.rowOf(tab)).toMatchObject({ 'Licensed?': licensed, 'Service Area Result': 'supported', Status: '' });
    expect(JSON.parse(String(h.rowOf(tab)['Submission Snapshot'])).captureDisposition).toBeUndefined();
    expect(h.tabs.get('Follow-ups')!.rows).toHaveLength(2);
  });
  it('recomputes dispatch eligibility if a Sheet-only inquiry is accidentally inserted into operational queues without its flag', () => {
    const h = setup(); const data = inquiry(); h.queue(data);
    h.tabs.set('CallRail Sync', { name: 'CallRail Sync', rows: [['Submission ID', 'Payload', 'Status', 'CallRail ID', 'Detail'],
      [data.submissionId, JSON.stringify(data), 'pending', '', '']] });
    h.gas.processFollowUps();
    expect(h.statusOf().status).toBe('done');
    expect(h.tabs.get('CallRail Sync')!.rows[1][2]).toBe('skipped');
    expect(h.calls.filter(url => !url.endsWith('/stop-email'))).toEqual([]);
    expect(h.mail).toEqual([]);
  });
});

describe('equity calculator interest-only capture', () => {
  const forms = [['home-equity-calculator', 'home-equity', 'Home Equity'], ['debt-savings-calculator', 'DebtConsolidation', 'Debt Consolidation']];
  it('keeps the independent writer policy aligned for every property state and use', () => {
    const h = setup();
    for (const propertyUse of ['primary', 'second-home', 'investment']) for (const propertyState of PROPERTY_STATES) {
      expect(h.gas.captureServiceArea({formId:'home-equity-calculator', propertyUse, propertyState})).toBe(serviceArea(propertyUse, propertyState, 'home-equity'));
    }
  });
  it.each(forms)('saves %s once, retaining its message safely and never dispatching downstream', (formId, source, tab) => {
    const h = setup(); const data = inquiry({formId, source, message: '=IMPORTXML("https://invalid.test", "//a")', state: 'CA'});
    expect(h.post(data)).toMatchObject({success:true, receipt:'saved', disposition:'sheet-only'});
    const row = h.rowOf(tab);
    expect(row).toMatchObject({'Inquiry Message': data.message, State:'CO', 'Property State':'CO', 'Licensed?':'No', 'Service Area Result':'out-of-market', Status:'Sheet only: outside service area'});
    // The harness consumes a protective apostrophe like Sheets, and represents
    // a live formula as an object. A plain string proves it stayed inert.
    expect(typeof row['Inquiry Message']).toBe('string');
    expect(JSON.parse(String(row['Submission Snapshot'])).message).toBe(data.message);
    expect(h.post(data)).toMatchObject({replayed:true, disposition:'sheet-only'});
    expect(h.tabs.get(tab)!.rows).toHaveLength(2);
    expect(h.tabs.has('Follow-ups')).toBe(false); expect(h.tabs.has('CallRail Sync')).toBe(false);
    // A damaged queue must still recompute eligibility, rather than trust a flag.
    h.queue(data); h.gas.processFollowUps();
    expect(h.calls.filter(url => !url.endsWith('/stop-email'))).toEqual([]); expect(h.mail).toEqual([]);
  });
  it.each(forms)('preserves supported rentals outside the consumer license list for %s', (formId, source, tab) => {
    const h = setup();
    expect(h.post(inquiry({formId, source, propertyUse:'investment', propertyState:'CO', captureDisposition:'sheet-only'})))
      .toEqual({success:true, receipt:'saved', submissionId:'booking-capture-123', replayed:false});
    expect(h.rowOf(tab)).toMatchObject({'Licensed?':'No', 'Service Area Result':'supported', Status:''});
    expect(h.tabs.get('Follow-ups')!.rows).toHaveLength(2);
  });
  it.each(forms)('refuses missing consent, malformed messages, forged pairing and incomplete contacts in %s', (formId, source) => {
    for (const patch of [{privacyAcknowledged:false}, {privacyVersion:''}, {lastName:''}, {email:''}, {phone:''}, {submissionId:''},
      {propertyState:'ZZ'}, {propertyUse:'vacation'}, {source:'dscr'}, {message:42}, {message:'x'.repeat(2001)}]) {
      const h = setup(); expect(h.post(inquiry({formId, source, ...patch}))).toMatchObject({success:false, code:'invalid_booking_inquiry'});
      expect(h.tabs.size).toBe(0); expect(h.mail).toEqual([]); expect(h.calls).toEqual([]);
    }
  });
  it('retains outside-area knockout answers for equity, while preserving in-area knockouts', () => {
    const fields = {formId:'home-equity-calculator', source:'home-equity', propertyType:'mobile-land', mortgageCurrent:'no', recentBankruptcyForeclosure:'yes'};
    expect(setup().post(inquiry(fields))).toMatchObject({success:true, disposition:'sheet-only'});
    expect(setup().post(inquiry({...fields, propertyState:'CA'}))).toMatchObject({success:false});
  });
});

describe('operational admission notices', () => {
  it('keeps a malformed worker lease as an actionable failure rather than a lock-delay notice', () => {
    const mail: MailMessage[] = [];
    const h = loadGas<{ processFollowUps: () => void }>({ exports: ['processFollowUps'],
      props: { followup_worker_lease_v1: '{bad' }, onMail: message => mail.push(message) });
    h.gas.processFollowUps();
    expect(mail).toHaveLength(1);
    expect(mail[0].subject).toContain('LEAD PIPELINE FAILURE');
    expect(mail[0].body).toContain('admission needs review');
    expect(mail[0].body).not.toContain('RAW PAYLOAD');
  });

  it('does not mislabel a Script Properties timeout after lock acquisition as a lock delay', () => {
    const mail: MailMessage[] = [];
    const h = loadGas<{ processFollowUps: () => void; PropertiesService: { getScriptProperties: () => { getProperty: (key: string) => string } } }>({
      exports: ['processFollowUps', 'PropertiesService'], onMail: message => mail.push(message) });
    h.gas.PropertiesService.getScriptProperties = () => ({ getProperty: () => { throw new Error('Script Properties service timeout'); } });
    h.gas.processFollowUps();
    expect(mail).toHaveLength(1);
    expect(mail[0].subject).toContain('LEAD PIPELINE FAILURE');
    expect(mail[0].body).toContain('Script Properties service timeout');
    expect(mail[0].body).not.toContain('could not acquire');
  });

  it('reports the actual attempted wait and unknown queue only to Max, without suppressing a later genuine failure', () => {
    const h = setup(); let reads = 0; let now = 0;
    h.gas.SpreadsheetApp.openById = () => { reads++; throw new Error('No queue access expected'); };
    h.gas.LockService.getScriptLock = () => ({ waitLock: limit => { expect(limit).toBe(20000); now += 20000; throw new Error('Lock timeout: another process was holding the lock for too long.'); }, releaseLock: () => undefined });
    const cache = new Map<string, string>();
    h.gas.CacheService.getScriptCache = () => ({ get: key => cache.get(key), put: (key, value) => { cache.set(key, value); } });
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => now);
    try { h.gas.processFollowUps(); h.gas.processFollowUps(); h.gas.alertFailure('A real capture failed', '{"submissionId":"recoverable"}'); }
    finally { clock.mockRestore(); }
    expect(reads).toBe(0); expect(h.mail).toHaveLength(2);
    expect(h.mail[0].to).toBe('liannemaxbalbastro@gmail.com');
    expect(h.mail[0].subject).toBe('Follow-up processing delayed: realdarrentsai.com');
    expect(h.mail[0].body).toContain('Observed admission attempt: 20.0 seconds');
    expect(h.mail[0].body).toContain('did not inspect the queue or select an individual lead');
    expect(h.mail[0].body).toContain('recovery have not been verified');
    expect(h.mail[0].body).toContain('next scheduled minute run');
    expect(h.mail[0].body).not.toMatch(/RAW PAYLOAD|recover this lead by hand|\{\}/);
    expect(h.mail[1].subject).toContain('LEAD PIPELINE FAILURE');
    expect(h.mail[1].body).toContain('recoverable');
    expect(h.mail.every(message => message.to === 'liannemaxbalbastro@gmail.com')).toBe(true);
  });
});
