/**
 * One website lead through every HubSpot automation, in order (28 Nov 2026,
 * Max asked for the whole path to be proven together, not only step by step).
 * Runs the real google-apps-script.js against one stateful fake HubSpot
 * contact, so each step sees what the step before it changed:
 *
 *   form lead -> call task for Darren, blank owner -> Darren, blank Lead Status -> New
 *   Darren logs an outbound call -> Lead Status New -> Attempted to contact
 *   a second call -> nothing changes
 *   the visitor books -> lifecycle Lead -> MQL (HubSpot sends that to Google Ads) + note
 *   Darren sets Connected himself -> later calls never move it back
 */
import { describe, expect, it, vi } from 'vitest';
import { loadGas, type FetchResponse } from './helpers/gas-harness';

type Runtime = {
  SpreadsheetApp: { openById: (id: string) => unknown };
  enqueueHubSpotTask: (ss: unknown, d: Record<string, unknown>) => void;
  processHubSpotTasks: (ss: unknown) => void;
  processHubSpotLeadStatus: (ss: unknown) => void;
  processHubSpotBookings: (ss: unknown) => void;
};

const ID = '700000000001';
const DARREN = '99169757';
const ok = (body: unknown, code = 200): FetchResponse => ({ getResponseCode: () => code, getContentText: () => JSON.stringify(body) });

function fakeHubSpot() {
  const contact: Record<string, string> = {
    email: 'jordan@example.com', firstname: 'Jordan', lastname: 'Reyes',
    hubspot_owner_id: '', hs_lead_status: '', lifecyclestage: 'lead',
    relationship_type: '', rdt_test_lead: 'No',
  };
  const tasks: Array<Record<string, unknown>> = [];
  const notes: Array<Record<string, unknown>> = [];
  const calls: Array<{ id: string; at: string }> = [];
  const emails: Array<{ id: string; subject: string; at: string }> = [];
  const patches: Array<Record<string, string>> = [];
  const fetch = vi.fn((url: string, o: Record<string, unknown>) => {
    const method = String(o.method || 'get').toLowerCase();
    const body = o.payload ? JSON.parse(String(o.payload)) : {};
    if (url.endsWith('/crm/v3/objects/contacts/search')) return ok({ results: [{ id: ID }] });
    if (url.endsWith('/crm/v3/objects/tasks') && method === 'post') { tasks.push(body); return ok({ id: 'T' + tasks.length }, 201); }
    if (url.endsWith('/crm/v3/objects/notes') && method === 'post') { notes.push(body); return ok({ id: 'N' + notes.length }, 201); }
    if (url.endsWith('/crm/v3/objects/calls/search')) return ok({ results: calls.map((c) => ({ id: c.id, properties: { hs_timestamp: c.at, hs_call_direction: 'OUTBOUND' } })) });
    if (url.endsWith('/crm/v3/objects/emails/search')) return ok({ results: emails.map((e) => ({ id: e.id, properties: { hs_email_subject: e.subject, hs_timestamp: e.at } })) });
    if (/\/crm\/v4\/objects\/(calls|emails)\/.+\/associations\/contacts$/.test(url)) return ok({ results: [{ toObjectId: Number(ID) }] });
    if (url.includes(`/crm/v3/objects/contacts/${ID}`) && method === 'get') return ok({ id: ID, properties: { ...contact } });
    if (url.includes(`/crm/v3/objects/contacts/${ID}`) && method === 'patch') { patches.push(body.properties); Object.assign(contact, body.properties); return ok({ id: ID }); }
    return ok({});
  });
  return { contact, tasks, notes, calls, emails, patches, fetch };
}

describe('a website lead through every HubSpot automation', () => {
  it('creates the task, sets owner and New, moves to Attempted on the first call, MQL on booking, and never undoes Darren', () => {
    const hs = fakeHubSpot();
    const props: Record<string, string> = {
      HUBSPOT_PRIVATE_APP_TOKEN: 'pat-test',
      HUBSPOT_TASKS_ENABLED: 'true', HUBSPOT_LEAD_STATUS_ENABLED: 'true', HUBSPOT_BOOKINGS_ENABLED: 'true',
    };
    const h = loadGas<Runtime>({
      exports: ['SpreadsheetApp', 'enqueueHubSpotTask', 'processHubSpotTasks', 'processHubSpotLeadStatus', 'processHubSpotBookings'],
      props, fetch: hs.fetch,
    });
    const ss = h.gas.SpreadsheetApp.openById('sheet');
    const unthrottle = () => { delete props.HUBSPOT_LEAD_STATUS_LAST_RUN; delete props.HUBSPOT_BOOKINGS_LAST_RUN; };

    // 1. A Google Ads lead from /home-equity/ with a 5+ unit building and a
    //    message that looks like code: it must reach the task as plain text.
    h.gas.enqueueHubSpotTask(ss, {
      firstName: 'Jordan', lastName: 'Reyes', email: 'Jordan@Example.com', phone: '(714) 555-2142', // not 555-01xx, which the script treats as a TEST lead
      submissionId: 'inbox1-life', source: 'home-equity', propertyState: 'CA', propertyType: '5-plus-commercial',
      utm_source: 'adwords', utm_medium: 'ppc', clickIdType: 'gclid', smsConsent: false,
      message: "<b>hi</b>'); DROP TABLE leads;--", timestamp: '2026-11-28T17:00:00.000Z',
    });
    h.gas.processHubSpotTasks(ss);
    expect(hs.tasks).toHaveLength(1);
    expect(hs.tasks[0].properties).toMatchObject({ hs_task_subject: 'Call Jordan Reyes (new Google Ads lead)', hs_task_type: 'CALL', hubspot_owner_id: DARREN });
    expect(String((hs.tasks[0].properties as Record<string, string>).hs_task_body)).toContain('Property type: 5+ units or commercial');
    expect(String((hs.tasks[0].properties as Record<string, string>).hs_task_body)).not.toContain('<b>');
    expect(hs.contact).toMatchObject({ hubspot_owner_id: DARREN, hs_lead_status: 'NEW', lifecyclestage: 'lead' });

    // Running the task worker again creates nothing new.
    h.gas.processHubSpotTasks(ss);
    expect(hs.tasks).toHaveLength(1);

    // 2. Darren calls and logs it: New -> Attempted to contact.
    hs.calls.push({ id: 'CALL1', at: '2026-11-28T18:05:00Z' });
    unthrottle(); h.gas.processHubSpotLeadStatus(ss);
    expect(hs.contact.hs_lead_status).toBe('ATTEMPTED_TO_CONTACT');

    // 3. A second logged call changes nothing.
    hs.calls.push({ id: 'CALL2', at: '2026-11-28T20:00:00Z' });
    const before = hs.patches.length;
    unthrottle(); h.gas.processHubSpotLeadStatus(ss);
    expect(hs.contact.hs_lead_status).toBe('ATTEMPTED_TO_CONTACT');
    expect(hs.patches.length).toBe(before);

    // 4. Jordan books: lifecycle Lead -> MQL, with a note giving the time.
    hs.emails.push({ id: 'E1', at: '2026-11-28T21:00:00Z', subject: 'Appointment booked: 15-min Qualification Call with Darren (Jordan Reyes) @ Mon Nov 30, 2026 10:00am - 10:15am (PST) (Darren Tsai)' });
    unthrottle(); h.gas.processHubSpotBookings(ss);
    expect(hs.contact.lifecyclestage).toBe('marketingqualifiedlead');
    expect(hs.notes).toHaveLength(1);
    expect(String((hs.notes[0].properties as Record<string, string>).hs_note_body)).toContain('Mon Nov 30, 2026 10:00am - 10:15am (PST)');
    unthrottle(); h.gas.processHubSpotBookings(ss);
    expect(hs.notes).toHaveLength(1); // same booking email: no second note

    // 5. Darren sets Connected himself; a later logged call never moves it back.
    hs.contact.hs_lead_status = 'CONNECTED';
    hs.calls.push({ id: 'CALL3', at: '2026-11-30T18:20:00Z' });
    unthrottle(); h.gas.processHubSpotLeadStatus(ss);
    expect(hs.contact).toMatchObject({ hs_lead_status: 'CONNECTED', lifecyclestage: 'marketingqualifiedlead', hubspot_owner_id: DARREN });
    expect(hs.tasks).toHaveLength(1);
  });
});
