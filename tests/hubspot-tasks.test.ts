/**
 * Darren's same-day HubSpot call task (17 Nov 2026). Runs the real
 * google-apps-script.js in the shared fake runtime and checks what reached
 * HubSpot's CRM API and what the "HubSpot Tasks" tab records.
 */
import { describe, expect, it, vi } from 'vitest';
import { loadGas, type FetchResponse } from './helpers/gas-harness';

type Runtime = {
  SpreadsheetApp: { openById: (id: string) => unknown };
  enqueueHubSpotTask: (ss: unknown, d: Record<string, unknown>) => void;
  processHubSpotTasks: (ss: unknown) => void;
  processFollowUps: () => void;
  hubspotTaskContent: (d: Record<string, unknown>) => { subject: string; body: string };
};

const config = { HUBSPOT_TASKS_ENABLED: 'true', HUBSPOT_PRIVATE_APP_TOKEN: 'pat-test' };
const lead = {
  firstName: 'Richard', lastName: 'Montez', email: 'Rich@Example.com', phone: '(760) 555-2100',
  submissionId: 'inbox1-abc', source: 'home-equity', propertyState: 'CA',
  utm_source: 'adwords', utm_medium: 'ppc', utm_campaign: 'Search | Darren Tsai | Mortgage',
  utm_term: 'home equity loan rates', clickIdType: 'gclid', smsConsent: false,
  timestamp: '2026-11-16T00:50:16.282Z', _proxyKey: 'private',
};

const ok = (body: unknown, code = 200): FetchResponse => ({ getResponseCode: () => code, getContentText: () => JSON.stringify(body) });

/** search answers with `searchHits` contact ids, task create answers 201. */
function hubspotFetch(searchHits: string[] = ['123'], taskCode = 201) {
  return vi.fn((url: string, _options: Record<string, unknown>) => {
    if (url.endsWith('/crm/v3/objects/contacts/search')) return ok({ results: searchHits.map((id) => ({ id })) });
    if (url.endsWith('/crm/v3/objects/tasks')) return ok(taskCode === 201 ? { id: 'T1' } : { message: 'bad' }, taskCode);
    return ok({});
  });
}

function setup(props: Record<string, string> = config, fetch = hubspotFetch()) {
  const h = loadGas<Runtime>({
    exports: ['SpreadsheetApp', 'enqueueHubSpotTask', 'processHubSpotTasks', 'processFollowUps', 'hubspotTaskContent'],
    props, fetch,
  });
  return { h, fetch, ss: h.gas.SpreadsheetApp.openById('sheet') };
}

describe('HubSpot call task for Darren', () => {
  it('stays dark until enabled and given a token', () => {
    for (const props of [{}, { HUBSPOT_TASKS_ENABLED: 'true' }, { HUBSPOT_PRIVATE_APP_TOKEN: 'pat' }]) {
      const { h, fetch, ss } = setup(props as Record<string, string>);
      h.gas.enqueueHubSpotTask(ss, lead);
      h.gas.processHubSpotTasks(ss);
      expect(h.tabs.has('HubSpot Tasks')).toBe(false);
      expect(fetch).not.toHaveBeenCalled();
    }
  });

  it('creates one high-priority call task for Darren, linked to the contact, due now', () => {
    const { h, fetch, ss } = setup();
    h.gas.enqueueHubSpotTask(ss, lead);
    h.gas.enqueueHubSpotTask(ss, lead); // same submission: no second row
    h.gas.processHubSpotTasks(ss);
    h.gas.processHubSpotTasks(ss); // already sent: no second task
    expect(h.tabs.get('HubSpot Tasks')!.rows).toHaveLength(2);
    const creates = fetch.mock.calls.filter((c) => String(c[0]).endsWith('/objects/tasks'));
    expect(creates).toHaveLength(1);
    const [, options] = creates[0];
    expect((options.headers as Record<string, string>).Authorization).toBe('Bearer pat-test');
    const task = JSON.parse(String(options.payload));
    expect(task.properties).toMatchObject({
      hs_task_subject: 'Call Richard Montez (new Google Ads lead)',
      hs_task_type: 'CALL', hs_task_priority: 'HIGH', hs_task_status: 'NOT_STARTED', hubspot_owner_id: '99169757',
    });
    expect(Math.abs(Date.parse(task.properties.hs_timestamp) - Date.now())).toBeLessThan(60_000);
    expect(task.associations).toEqual([{ to: { id: '123' }, types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 204 }] }]);
    expect(task.properties.hs_task_body).toContain('Search term: home equity loan rates');
    expect(task.properties.hs_task_body).toContain('Texting: no opt-in, call or email only.');
    const search = JSON.parse(String(fetch.mock.calls[0][1].payload));
    expect(search.filterGroups[0].filters[0]).toMatchObject({ propertyName: 'email', value: 'rich@example.com' });
    expect(h.rowOf('HubSpot Tasks')).toMatchObject({ Status: 'sent', 'Task ID': 'T1' });
    expect(String(h.rowOf('HubSpot Tasks').Payload)).not.toContain('_proxyKey');
  });

  it('waits for HubSpot to create the contact, then creates the task unlinked after 30 minutes', () => {
    const { h, fetch, ss } = setup(config, hubspotFetch([]));
    h.gas.enqueueHubSpotTask(ss, lead);
    h.gas.processHubSpotTasks(ss);
    expect(fetch.mock.calls.some((c) => String(c[0]).endsWith('/objects/tasks'))).toBe(false);
    expect(h.rowOf('HubSpot Tasks').Status).toBe('pending');
    // Age the row past the wait.
    const tab = h.tabs.get('HubSpot Tasks')!;
    const queuedCol = (tab.rows[0] as string[]).indexOf('Queued At');
    (tab.rows[1] as unknown[])[queuedCol] = new Date(Date.now() - 31 * 60 * 1000).toISOString();
    h.gas.processHubSpotTasks(ss);
    const create = fetch.mock.calls.find((c) => String(c[0]).endsWith('/objects/tasks'))!;
    expect(JSON.parse(String(create[1].payload)).associations).toBeUndefined();
    expect(h.rowOf('HubSpot Tasks').Status).toBe('sent-unlinked');
  });

  it('never repeats a task POST whose result is unknown or rejected', () => {
    for (const fetch of [
      hubspotFetch(['123'], 400),
      vi.fn((url: string) => { if (url.endsWith('/search')) return ok({ results: [{ id: '1' }] }); throw new Error('timeout'); }),
    ]) {
      const { h, ss } = setup(config, fetch as ReturnType<typeof hubspotFetch>);
      h.gas.enqueueHubSpotTask(ss, lead);
      h.gas.processHubSpotTasks(ss);
      h.gas.processHubSpotTasks(ss);
      expect(fetch.mock.calls.filter((c) => String(c[0]).endsWith('/objects/tasks'))).toHaveLength(1);
      expect(h.rowOf('HubSpot Tasks').Status).toBe('needs-review');
    }
  });

  it('is queued by the follow-up worker only after HubSpot accepts the lead', () => {
    const fetch = vi.fn((url: string, _o: Record<string, unknown>) => {
      if (url.includes('api.hsforms.com')) return ok({ inlineMessage: 'ok' });
      if (url.endsWith('/search')) return ok({ results: [{ id: '55' }] });
      if (url.endsWith('/objects/tasks')) return ok({ id: 'T9' }, 201);
      return ok({ data: { id: 1 } });
    });
    const { h } = setup({ ...config, HUBSPOT_PORTAL_ID: '247401197', HUBSPOT_FORM_GUID: 'form-guid' }, fetch as ReturnType<typeof hubspotFetch>);
    h.queue({ ...lead, source: 'home-equity' });
    h.gas.processFollowUps();
    expect(h.rowOf('HubSpot Tasks')).toMatchObject({ 'Submission ID': 'inbox1-abc', Status: 'sent', 'Task ID': 'T9' });
  });

  it('labels YouTube and test leads plainly', () => {
    const { h } = setup();
    expect(h.gas.hubspotTaskContent({ firstName: 'Ann', utm_source: 'youtube' }).subject).toBe('Call Ann (new YouTube lead)');
    expect(h.gas.hubspotTaskContent({ firstName: 'Ann', phone: '714-555-0123', email: 'a@b.co' }).subject).toMatch(/^TEST Call/);
  });
});
