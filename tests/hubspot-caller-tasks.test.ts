/**
 * Call-back task for inbound callers (27 Nov 2026). Runs the real
 * google-apps-script.js in the shared fake runtime: an inbound call logged in
 * HubSpot becomes a "Call back <name>" task for Darren once it is 15 minutes
 * old, unless CallRail marks it as spam, Darren already called back, the
 * contact already has an open task, the call was a real conversation, or the
 * contact is not a borrower.
 */
import { describe, expect, it, vi } from 'vitest';
import { loadGas, type FetchResponse } from './helpers/gas-harness';

type Runtime = {
  SpreadsheetApp: { openById: (id: string) => unknown };
  processHubSpotCallerTasks: (ss: unknown) => void;
  callerSpamReason: (cr: Record<string, unknown> | null) => string;
  callerTaskDecision: (f: Record<string, unknown>) => string;
  callerDigits: (p: string) => string;
};

const config = {
  HUBSPOT_CALLER_TASKS_ENABLED: 'true', HUBSPOT_PRIVATE_APP_TOKEN: 'pat-test',
  CALLRAIL_API_TOKEN: 'cr-test', CALLRAIL_ACCOUNT_ID: '523782312', CALLRAIL_COMPANY_ID: '650367292',
};
const ok = (body: unknown, code = 200): FetchResponse => ({ getResponseCode: () => code, getContentText: () => JSON.stringify(body) });
const minsAgo = (m: number) => new Date(Date.now() - m * 60 * 1000).toISOString();

type Opts = {
  callAt?: string; durationMs?: number; contacts?: string[];
  rel?: string; test?: string; owner?: string; status?: string;
  transcription?: string | null; tags?: unknown[]; leadStatus?: string | null; callrailCalls?: 'none';
  laterOutbound?: boolean; openTask?: boolean; taskCode?: number;
};

function apis(o: Opts = {}) {
  const callAt = o.callAt ?? minsAgo(30);
  return vi.fn((url: string, opt: Record<string, unknown>) => {
    if (url.startsWith('https://api.callrail.com/')) {
      if (o.callrailCalls === 'none') return ok({ calls: [] });
      return ok({ calls: [{ id: 'CAL1', customer_phone_number: '+19092475448', start_time: callAt, transcription: o.transcription === undefined ? 'Calling. I will see if this person is available.' : o.transcription,
        tags: o.tags ?? [], lead_status: o.leadStatus ?? null, voicemail: false, source: 'Google Ads', keywords: 'home equity financing' }] });
    }
    if (url.endsWith('/crm/v3/objects/calls/search')) return ok({ results: [{ id: 'HSCALL1', properties: { hs_timestamp: callAt, hs_call_from_number: '+19092475448', hs_call_duration: String(o.durationMs ?? 48000), hs_call_title: 'Call with Richard Luna' } }] });
    if (/\/crm\/v4\/objects\/calls\/.+\/associations\/contacts$/.test(url)) return ok({ results: (o.contacts ?? ['605000000001']).map((id) => ({ toObjectId: Number(id) })) });
    if (/\/crm\/v4\/objects\/contacts\/.+\/associations\/calls/.test(url)) return ok({ results: [{ toObjectId: 1 }, ...(o.laterOutbound ? [{ toObjectId: 2 }] : [])] });
    if (/\/crm\/v4\/objects\/contacts\/.+\/associations\/tasks/.test(url)) return ok({ results: o.openTask ? [{ toObjectId: 9 }] : [] });
    if (url.endsWith('/crm/v3/objects/calls/batch/read')) return ok({ results: [
      { properties: { hs_timestamp: callAt, hs_call_direction: 'INBOUND' } },
      ...(o.laterOutbound ? [{ properties: { hs_timestamp: new Date(Date.parse(callAt) + 60000).toISOString(), hs_call_direction: 'OUTBOUND' } }] : []),
    ] });
    if (url.endsWith('/crm/v3/objects/tasks/batch/read')) return ok({ results: [{ properties: { hs_task_status: 'NOT_STARTED' } }] });
    if (url.includes('/crm/v3/objects/contacts/') && opt.method === 'get') return ok({ properties: { firstname: 'Richard', lastname: 'Luna', phone: '909-247-5448',
      relationship_type: o.rel ?? '', rdt_test_lead: o.test ?? 'No', hubspot_owner_id: o.owner ?? '', hs_lead_status: o.status ?? '' } });
    if (url.includes('/crm/v3/objects/contacts/') && opt.method === 'patch') return ok({ id: '605000000001' });
    if (url.endsWith('/crm/v3/objects/tasks') && opt.method === 'post') return ok({ id: 'TASK1' }, o.taskCode ?? 201);
    return ok({});
  });
}

function setup(props: Record<string, string> = { ...config }, fetch = apis()) {
  const h = loadGas<Runtime>({ exports: ['SpreadsheetApp', 'processHubSpotCallerTasks', 'callerSpamReason', 'callerTaskDecision', 'callerDigits'], props, fetch });
  return { h, fetch, props, ss: h.gas.SpreadsheetApp.openById('sheet') };
}
const callsOf = (f: ReturnType<typeof apis>, m: string, end: RegExp) => f.mock.calls.filter((c) => (c[1] as { method: string }).method === m && end.test(String(c[0])));
const taskPosts = (f: ReturnType<typeof apis>) => callsOf(f, 'post', /\/crm\/v3\/objects\/tasks$/);

describe('call-back task for inbound callers', () => {
  it('stays dark until enabled with a HubSpot key AND a CallRail key', () => {
    for (const props of [{}, { HUBSPOT_CALLER_TASKS_ENABLED: 'true', HUBSPOT_PRIVATE_APP_TOKEN: 'pat' },
      { ...config, CALLRAIL_API_TOKEN: '' }, { ...config, CALLRAIL_ACCOUNT_ID: 'ACC123' }, { ...config, HUBSPOT_CALLER_TASKS_ENABLED: 'false' }]) {
      const { h, fetch, ss } = setup(props as Record<string, string>);
      h.gas.processHubSpotCallerTasks(ss);
      expect(fetch).not.toHaveBeenCalled();
      expect(h.tabs.has('HubSpot Caller Tasks')).toBe(false);
    }
  });

  it('creates one call-back task for Darren, fills a blank owner and Lead Status, and never repeats', () => {
    const { h, fetch, props, ss } = setup();
    h.gas.processHubSpotCallerTasks(ss);
    delete props.HUBSPOT_CALLER_TASKS_LAST_RUN;
    h.gas.processHubSpotCallerTasks(ss);
    const posts = taskPosts(fetch);
    expect(posts).toHaveLength(1);
    const task = JSON.parse(String(posts[0][1].payload));
    expect(task.properties).toMatchObject({ hs_task_subject: 'Call back Richard Luna (inbound call, Google Ads)', hs_task_type: 'CALL', hubspot_owner_id: '99169757', hs_task_status: 'NOT_STARTED' });
    expect(task.properties.hs_task_body).toContain('home equity financing');
    expect(task.associations[0].to.id).toBe('605000000001');
    const patch = JSON.parse(String(callsOf(fetch, 'patch', /contacts\/605000000001$/)[0][1].payload));
    expect(patch).toEqual({ properties: { hubspot_owner_id: '99169757', hs_lead_status: 'NEW' } });
    expect(h.rowOf('HubSpot Caller Tasks')).toMatchObject({ 'Call ID': 'HSCALL1', 'Contact ID': '605000000001', Status: 'done', 'Task ID': 'TASK1' });
    const search = JSON.parse(String(callsOf(fetch, 'post', /calls\/search$/)[0][1].payload));
    expect(search.filterGroups[0].filters[0]).toEqual({ propertyName: 'hs_call_direction', operator: 'EQ', value: 'INBOUND' });
  });

  it('leaves an owner and Lead Status that are already set', () => {
    const { fetch, ss, h } = setup({ ...config }, apis({ owner: '123', status: 'ATTEMPTED_TO_CONTACT', rel: 'borrower_client' }));
    h.gas.processHubSpotCallerTasks(ss);
    expect(taskPosts(fetch)).toHaveLength(1);
    expect(callsOf(fetch, 'patch', /contacts\//)).toHaveLength(0);
  });

  it('waits until the call is 15 minutes old', () => {
    const { fetch, ss, h } = setup({ ...config }, apis({ callAt: minsAgo(5) }));
    h.gas.processHubSpotCallerTasks(ss);
    expect(taskPosts(fetch)).toHaveLength(0);
    expect(h.tabs.get('HubSpot Caller Tasks')?.rows).toHaveLength(1); // headers only
  });

  it('waits for the CallRail transcript for up to an hour, then decides without it', () => {
    const early = setup({ ...config }, apis({ callAt: minsAgo(20), transcription: null }));
    early.h.gas.processHubSpotCallerTasks(early.ss);
    expect(taskPosts(early.fetch)).toHaveLength(0);
    const late = setup({ ...config }, apis({ callAt: minsAgo(70), transcription: null }));
    late.h.gas.processHubSpotCallerTasks(late.ss);
    expect(taskPosts(late.fetch)).toHaveLength(1);
  });

  it.each([
    ['a robocall transcript', { transcription: 'Clients are having trouble finding you. Press 1 to verify your Google listing.' }],
    ['a spam tag', { tags: [{ name: 'Spam' }] }],
    ['a plain spam tag string', { tags: ['spam'] }],
    ['lead status Not a lead', { leadStatus: 'not_a_lead' }],
  ])('skips %s', (_label, opts) => {
    const { fetch, ss, h } = setup({ ...config }, apis(opts as Opts));
    h.gas.processHubSpotCallerTasks(ss);
    expect(taskPosts(fetch)).toHaveLength(0);
    expect(h.rowOf('HubSpot Caller Tasks')).toMatchObject({ Status: 'skipped-spam' });
  });

  it.each([
    ['Darren already called back', { laterOutbound: true }, 'skipped-called-back'],
    ['the contact already has an open task', { openTask: true }, 'skipped-open-task'],
    ['the call was a real conversation', { durationMs: 4 * 60 * 1000 }, 'skipped-conversation'],
    ['a vendor', { rel: 'vendor' }, 'skipped-not-borrower'],
    ['a contact marked spam in HubSpot', { rel: 'system_newsletter_spam' }, 'skipped-not-borrower'],
    ['a TEST contact', { test: 'Yes' }, 'skipped-test'],
  ])('skips when %s', (_label, opts, status) => {
    const { fetch, ss, h } = setup({ ...config }, apis(opts as Opts));
    h.gas.processHubSpotCallerTasks(ss);
    expect(taskPosts(fetch)).toHaveLength(0);
    expect(h.rowOf('HubSpot Caller Tasks')).toMatchObject({ Status: status });
  });

  it('does not call CallRail for a vendor or TEST contact', () => {
    const { fetch, ss, h } = setup({ ...config }, apis({ rel: 'vendor' }));
    h.gas.processHubSpotCallerTasks(ss);
    expect(fetch.mock.calls.some((c) => String(c[0]).startsWith('https://api.callrail.com/'))).toBe(false);
  });

  it('still creates the task when CallRail has no matching call, and says spam was not checked', () => {
    const { fetch, ss, h } = setup({ ...config }, apis({ callrailCalls: 'none' }));
    h.gas.processHubSpotCallerTasks(ss);
    expect(taskPosts(fetch)).toHaveLength(1);
    expect(String(h.rowOf('HubSpot Caller Tasks').Detail)).toContain('spam not checked');
  });

  it('marks a rejected task for review and never retries it', () => {
    const { fetch, props, ss, h } = setup({ ...config }, apis({ taskCode: 400 }));
    h.gas.processHubSpotCallerTasks(ss);
    delete props.HUBSPOT_CALLER_TASKS_LAST_RUN;
    h.gas.processHubSpotCallerTasks(ss);
    expect(taskPosts(fetch)).toHaveLength(1);
    expect(h.rowOf('HubSpot Caller Tasks')).toMatchObject({ Status: 'needs-review' });
  });

  it('spam rules: narrow phrases only, and nothing from caller ID or call length', () => {
    const { h } = setup();
    expect(h.gas.callerSpamReason(null)).toBe('');
    expect(h.gas.callerSpamReason({ transcription: 'Hi, I want to use my home equity to pay off credit cards. Please call me back.' })).toBe('');
    expect(h.gas.callerSpamReason({ transcription: 'This is an automated call about your extended car warranty.' })).not.toBe('');
    expect(h.gas.callerSpamReason({ lead_status: 'good_lead' })).toBe('');
    expect(h.gas.callerDigits('+1 (909) 247-5448')).toBe('9092475448');
    expect(h.gas.callerDigits('5448')).toBe('');
  });
});
