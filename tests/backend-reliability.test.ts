import { describe, expect, it } from 'vitest';
import { loadGas, TEST_PROXY_KEY } from './helpers/gas-harness';

type Payload = Record<string, unknown>;
type Sheet = unknown;
type Claim = { data: Payload; token: string };
type Runtime = {
  doPost: (event: { postData: { contents: string } }) => { __body: string };
  SpreadsheetApp: { openById: () => { getSheetByName: (name: string) => Sheet } };
  LockService: { getScriptLock: () => { tryLock: (ms: number) => boolean; releaseLock: () => void } };
  processFollowUps: () => void;
  claimFollowUp: (sheet: Sheet, row: number) => Claim | null;
  checkpointFollowUp: (sheet: Sheet, claim: Claim, job: string | null, result: Payload | null, final: boolean) => unknown;
  hubspotFields: (lead: Payload) => Array<{ name: string; value: string }>;
};
const exports = ['doPost', 'SpreadsheetApp', 'LockService', 'processFollowUps', 'claimFollowUp', 'checkpointFollowUp', 'hubspotFields'];
const lead = { source: 'fha', formId: 'fha-magnet', submissionId: 'stable-1', email: 'qa@example.com',
  timestamp: '2026-10-20T01:00:00Z', smsConsentAt: '2026-10-20T01:00:00Z', privacyAcknowledged: true, utm_source: 'youtube' };
function post(gas: Runtime, data: Payload) { return JSON.parse(gas.doPost({ postData: { contents: JSON.stringify({ ...data, _proxyKey: TEST_PROXY_KEY }) } }).__body); }

describe('capture retry identity', () => {
  it('saves one row/job and returns the same confirmed receipt on replay, ignoring transport cookie changes', () => {
    const h = loadGas<Runtime>({ exports, props: { LEAD_PROXY_KEY: TEST_PROXY_KEY } });
    expect(post(h.gas, lead)).toMatchObject({ success: true, submissionId: 'stable-1', receipt: 'saved', replayed: false });
    expect(post(h.gas, { ...lead, hutk: 'changed-cookie', _proxyKey: 'ignored' })).toMatchObject({ success: true, replayed: true });
    expect(h.tabs.get('FHA')!.rows).toHaveLength(2);
    expect(h.tabs.get('Follow-ups')!.rows).toHaveLength(2);
  });
  it.each(['email', 'source', 'utm_source', 'privacyAcknowledged', 'smsConsentAt'])('rejects changed %s under the same ID and preserves the original', key => {
    const h = loadGas<Runtime>({ exports, props: { LEAD_PROXY_KEY: TEST_PROXY_KEY } });
    post(h.gas, lead);
    const before = JSON.stringify([...h.tabs]);
    expect(post(h.gas, { ...lead, [key]: 'changed' })).toMatchObject({ success: false, code: 'submission_conflict', field: 'submissionId' });
    expect(JSON.stringify([...h.tabs])).toBe(before);
  });
  it('repairs a missing queue after the durable capture without duplicating the lead', () => {
    const h = loadGas<Runtime>({ exports, props: { LEAD_PROXY_KEY: TEST_PROXY_KEY } });
    post(h.gas, lead);
    h.tabs.get('Follow-ups')!.rows.splice(1);
    expect(post(h.gas, lead)).toMatchObject({ success: true, replayed: true });
    expect(h.tabs.get('FHA')!.rows).toHaveLength(2);
    expect(h.tabs.get('Follow-ups')!.rows).toHaveLength(2);
    expect(JSON.parse(String(h.rowOf('Follow-ups').Payload)).submissionId).toBe('stable-1');
  });
  it('keeps an intentional new inquiry from the same email independent', () => {
    const h = loadGas<Runtime>({ exports, props: { LEAD_PROXY_KEY: TEST_PROXY_KEY } });
    post(h.gas, lead);
    post(h.gas, { ...lead, submissionId: 'stable-2' });
    expect(h.tabs.get('FHA')!.rows).toHaveLength(3);
    expect(h.tabs.get('Follow-ups')!.rows).toHaveLength(3);
  });
  it('an existing queue identity cannot be reused with different answers after its capture row was removed', () => {
    const h = loadGas<Runtime>({ exports, props: { LEAD_PROXY_KEY: TEST_PROXY_KEY } });
    h.queue(lead);
    expect(post(h.gas, { ...lead, email: 'different@example.com' }).code).toBe('submission_conflict');
    expect(h.tabs.has('FHA')).toBe(false);
    expect(post(h.gas, lead).success).toBe(true);
    expect(h.tabs.get('FHA')!.rows).toHaveLength(2);
    expect(h.tabs.get('Follow-ups')!.rows).toHaveLength(2);
  });
  it('does not trust client-injected delivery checkpoints', () => {
    const h = loadGas<Runtime>({ exports, props: { LEAD_PROXY_KEY: TEST_PROXY_KEY } });
    post(h.gas, { ...lead, _delivery: { version: 1, jobs: { hubspot: { state: 'sent' }, guide: { state: 'sent' } } } });
    expect(JSON.parse(String(h.rowOf('Follow-ups').Payload))._delivery).toBeUndefined();
  });
  it('returns bounded busy without writes; the same request can retry later', () => {
    const h = loadGas<Runtime>({ exports, props: { LEAD_PROXY_KEY: TEST_PROXY_KEY } });
    const original = h.gas.LockService.getScriptLock;
    let waited = 0;
    h.gas.LockService.getScriptLock = () => ({ tryLock: ms => { waited = ms; return false; }, releaseLock() {} });
    expect(post(h.gas, lead)).toMatchObject({ success: false, code: 'capture_busy' });
    expect(waited).toBeLessThan(2000);
    expect(h.tabs.size).toBe(0);
    h.gas.LockService.getScriptLock = original;
    expect(post(h.gas, lead).success).toBe(true);
  });
});

describe('durable job ownership and recovery', () => {
  const props = { HUBSPOT_PORTAL_ID: 'portal', HUBSPOT_FORM_GUID: 'form', NETLIFY_FHA_PDF_URL: 'https://example.com/guide', NETLIFY_FHA_PDF_KEY: 'key' };
  it('an overlapping worker cannot send an already claimed row', () => {
    const calls: string[] = [];
    let nested: () => void = () => {};
    const h = loadGas<Runtime>({ exports, props, fetch: url => {
      calls.push(url);
      nested();
      return { getResponseCode: () => 200, getContentText: () => '{}' };
    } });
    h.queue(lead);
    nested = () => h.gas.processFollowUps();
    h.gas.processFollowUps();
    expect(calls.filter(url => url.includes('hsforms'))).toHaveLength(1);
    expect(calls.filter(url => url.includes('/guide'))).toHaveLength(1);
    expect(h.statusOf().status).toBe('done');
  });
  it('a stale claim cannot overwrite a replacement owner, even after a row moves', () => {
    const h = loadGas<Runtime>({ exports, props: { LEAD_PROXY_KEY: TEST_PROXY_KEY } });
    h.queue(lead);
    const sheet = h.gas.SpreadsheetApp.openById().getSheetByName('Follow-ups');
    const claim = h.gas.claimFollowUp(sheet, 2)!;
    const row = h.tabs.get('Follow-ups')!.rows[1];
    const payload = JSON.parse(String(row[6]));
    payload._delivery.token = 'new-owner';
    row[6] = JSON.stringify(payload);
    expect(h.gas.checkpointFollowUp(sheet, claim, 'hubspot', { state: 'sent' }, false)).toBe(false);
    expect(JSON.parse(String(row[6]))._delivery.jobs.hubspot.state).toBe('pending');
  });
  it('after CRM checkpoint, an orphan recovers only its still-owed email', () => {
    const calls: string[] = [];
    const h = loadGas<Runtime>({ exports, props, fetch: url => {
      calls.push(url); return { getResponseCode: () => 200, getContentText: () => '{}' };
    } });
    h.queue(lead);
    const sheet = h.gas.SpreadsheetApp.openById().getSheetByName('Follow-ups');
    const claim = h.gas.claimFollowUp(sheet, 2)!;
    h.gas.checkpointFollowUp(sheet, claim, 'hubspot', { state: 'sent' }, false);
    h.tabs.get('Follow-ups')!.rows[1][2] = new Date(Date.now() - 11 * 60_000).toISOString();
    h.gas.processFollowUps();
    expect(calls.some(url => url.includes('hsforms'))).toBe(false);
    expect(calls.filter(url => url.includes('/guide'))).toHaveLength(1);
    expect(h.statusOf().status).toBe('done');
  });
  it('unknown HubSpot acceptance is checkpointed and never automatically resent', () => {
    let calls = 0;
    const h = loadGas<Runtime>({ exports, props, fetch: url => {
      if (url.includes('hsforms')) { calls++; throw new Error('connection lost after acceptance'); }
      return { getResponseCode: () => 200, getContentText: () => '{}' };
    } });
    h.queue(lead);
    h.gas.processFollowUps(); h.gas.processFollowUps();
    expect(calls).toBe(1);
    expect(h.statusOf().status).toBe('hubspot-uncertain');
    expect(JSON.parse(String(h.rowOf('Follow-ups').Payload))._delivery.jobs.guide.state).toBe('sent');
  });
  it('legacy interrupted provider work is held for reconciliation rather than replayed', () => {
    let calls = 0;
    const h = loadGas<Runtime>({ exports, props, fetch: () => { calls++; throw new Error('must not send'); } });
    h.queue(lead, 'processing:0', new Date(Date.now() - 11 * 60_000).toISOString());
    h.gas.processFollowUps();
    expect(calls).toBe(0);
    expect(h.statusOf().status).toContain('uncertain');
  });
  it('preserves an unreadable queue payload in one terminal review state', () => {
    const h = loadGas<Runtime>({ exports, props });
    h.queue(lead);
    h.tabs.get('Follow-ups')!.rows[1][6] = '{broken-json';
    h.gas.processFollowUps(); h.gas.processFollowUps();
    expect(h.statusOf().status).toBe('error');
    expect(h.rowOf('Follow-ups').Payload).toBe('{broken-json');
  });
  it('retries guide ambiguity only after an explicit keyed-protocol acknowledgement', () => {
    let guides = 0;
    const h = loadGas<Runtime>({ exports, props, fetch: (url, options) => {
      if (!url.endsWith('/guide')) return { getResponseCode: () => 200, getContentText: () => '{}' };
      guides++;
      const body = JSON.parse(String(options.payload));
      return { getResponseCode: () => guides === 1 ? 503 : 200,
        getContentText: () => JSON.stringify({ deliveryProtocol: 'resend-key-v1', submissionId: body.submissionId }) };
    } });
    h.queue(lead); h.gas.processFollowUps();
    expect(h.statusOf().status).toBe('guide-retry:1');
    h.tabs.get('Follow-ups')!.rows[1][2] = new Date(Date.now() - 2 * 60_000).toISOString();
    h.gas.processFollowUps();
    expect(guides).toBe(2); expect(h.statusOf().status).toBe('done');
    expect(h.statusOf().error).toBe('');
  });
  it('does not assume an old sender honored a key after a server failure', () => {
    let guides = 0;
    const h = loadGas<Runtime>({ exports, props, fetch: url => {
      if (url.endsWith('/guide')) guides++;
      return { getResponseCode: () => url.endsWith('/guide') ? 503 : 200, getContentText: () => '{}' };
    } });
    h.queue(lead); h.gas.processFollowUps(); h.gas.processFollowUps();
    expect(guides).toBe(1); expect(h.statusOf().status).toBe('guide-uncertain');
  });
});

it('normal Forms API writes cannot overwrite original acquisition, including through configured detail mappings', () => {
  const h = loadGas<Runtime>({ exports, props: { HUBSPOT_DETAIL_FIELD_MAP: JSON.stringify({ utm_source: 'rdt_first_utm_source', utm_campaign: 'rdt_first_utm_campaign' }) } });
  const fields = h.gas.hubspotFields({ ...lead, firstUtmSource: 'campaign-b', utm_campaign: 'b' });
  expect(fields.some(field => field.name.startsWith('rdt_first_'))).toBe(false);
  expect(fields.find(field => field.name === 'rdt_latest_utm_campaign')?.value).toBe('b');
});
