/**
 * Booked calls from HubSpot (21 Nov 2026). Runs the real google-apps-script.js
 * in the shared fake runtime: Google's "Appointment booked" email logged in
 * HubSpot -> note on the contact + lifecycle Lead -> MQL (HubSpot sends MQL to
 * Google Ads as the booked-call conversion).
 */
import { describe, expect, it, vi } from 'vitest';
import { loadGas, type FetchResponse } from './helpers/gas-harness';

type Runtime = {
  SpreadsheetApp: { openById: (id: string) => unknown };
  processHubSpotBookings: (ss: unknown) => void;
  hubspotBookingWhen: (s: string) => string;
  hubspotBookingNote: (s: string) => string;
};

const SUBJECT = 'Appointment booked: 15-min Qualification Call with Darren (Kariyana Isom) @ Fri Nov 20, 2026 11:40am - 11:55am (PST) (Darren Tsai)';
const config = { HUBSPOT_BOOKINGS_ENABLED: 'true', HUBSPOT_PRIVATE_APP_TOKEN: 'pat-test' };
const ok = (body: unknown, code = 200): FetchResponse => ({ getResponseCode: () => code, getContentText: () => JSON.stringify(body) });

function hubspot(opts: { stage?: string; test?: string; emails?: Array<{ id: string; subject: string; at?: string }>; searchCode?: number } = {}) {
  const emails = opts.emails ?? [{ id: 'E1', subject: SUBJECT, at: '2026-11-20T12:38:54Z' }];
  return vi.fn((url: string, o: Record<string, unknown>) => {
    if (url.endsWith('/crm/v3/objects/emails/search')) return ok({ results: emails.map((e) => ({ id: e.id, properties: { hs_email_subject: e.subject, hs_timestamp: e.at ?? '2026-11-20T12:38:54Z' } })) }, opts.searchCode ?? 200);
    if (/\/crm\/v4\/objects\/emails\/.+\/associations\/contacts$/.test(url)) return ok({ results: [{ toObjectId: 602603450073 }] });
    if (url.includes('/crm/v3/objects/contacts/602603450073') && o.method === 'get') return ok({ properties: { lifecyclestage: opts.stage ?? 'lead', rdt_test_lead: opts.test ?? 'No', firstname: 'Kariyana', lastname: 'Isom' } });
    if (url.includes('/crm/v3/objects/contacts/602603450073') && o.method === 'patch') return ok({ id: '602603450073' });
    if (url.endsWith('/crm/v3/objects/notes')) return ok({ id: 'N1' }, 201);
    return ok({});
  });
}

function setup(props: Record<string, string> = { ...config }, fetch = hubspot()) {
  const h = loadGas<Runtime>({ exports: ['SpreadsheetApp', 'processHubSpotBookings', 'hubspotBookingWhen', 'hubspotBookingNote'], props, fetch });
  return { h, fetch, props, ss: h.gas.SpreadsheetApp.openById('sheet') };
}
const calls = (f: ReturnType<typeof hubspot>, m: string, end: RegExp) => f.mock.calls.filter((c) => (c[1] as { method: string }).method === m && end.test(String(c[0])));

describe('HubSpot booked-call tracker', () => {
  it('stays dark until enabled and given a token', () => {
    for (const props of [{}, { HUBSPOT_BOOKINGS_ENABLED: 'true' }, { HUBSPOT_PRIVATE_APP_TOKEN: 'pat' }]) {
      const { h, fetch, ss } = setup(props as Record<string, string>);
      h.gas.processHubSpotBookings(ss);
      expect(fetch).not.toHaveBeenCalled();
      expect(h.tabs.has('HubSpot Bookings')).toBe(false);
    }
  });

  it('moves a Lead to MQL and notes the call time, once per booking email', () => {
    const { h, fetch, props, ss } = setup();
    h.gas.processHubSpotBookings(ss);
    delete props.HUBSPOT_BOOKINGS_LAST_RUN; // skip the 10-minute throttle
    h.gas.processHubSpotBookings(ss);
    const patches = calls(fetch, 'patch', /contacts\/602603450073$/);
    expect(patches).toHaveLength(1);
    expect(JSON.parse(String(patches[0][1].payload))).toEqual({ properties: { lifecyclestage: 'marketingqualifiedlead' } });
    const notes = calls(fetch, 'post', /\/objects\/notes$/);
    expect(notes).toHaveLength(1);
    const note = JSON.parse(String(notes[0][1].payload));
    expect(note.properties.hs_note_body).toContain('Fri Nov 20, 2026 11:40am - 11:55am (PST)');
    expect(note.associations[0].types[0].associationTypeId).toBe(202);
    expect(h.rowOf('HubSpot Bookings')).toMatchObject({ 'Email ID': 'E1', 'Contact ID': '602603450073', Status: 'done' });
    expect(String(h.rowOf('HubSpot Bookings').Detail)).toContain('lifecycle lead -> MQL');
  });

  it('never moves lifecycle backward, but still notes the booking', () => {
    const { h, fetch, ss } = setup({ ...config }, hubspot({ stage: 'customer' }));
    h.gas.processHubSpotBookings(ss);
    expect(calls(fetch, 'patch', /contacts\//)).toHaveLength(0);
    expect(calls(fetch, 'post', /\/objects\/notes$/)).toHaveLength(1);
    expect(String(h.rowOf('HubSpot Bookings').Detail)).toContain('lifecycle kept (customer)');
  });

  it('skips TEST bookings and ignores other "Appointment" emails', () => {
    const { h, fetch, ss } = setup({ ...config }, hubspot({ test: 'Yes', emails: [
      { id: 'E2', subject: 'Appointment with Rudy' },
      { id: 'E3', subject: SUBJECT },
    ] }));
    h.gas.processHubSpotBookings(ss);
    expect(calls(fetch, 'patch', /contacts\//)).toHaveLength(0);
    expect(calls(fetch, 'post', /\/objects\/notes$/)).toHaveLength(0);
    expect(h.tabs.get('HubSpot Bookings')!.rows).toHaveLength(2);
    expect(h.rowOf('HubSpot Bookings')).toMatchObject({ 'Email ID': 'E3', Status: 'skipped-test' });
  });

  it('logs and stops when the key cannot read emails', () => {
    const { fetch, ss, h } = setup({ ...config }, hubspot({ searchCode: 403 }));
    h.gas.processHubSpotBookings(ss);
    expect(calls(fetch, 'patch', /contacts\//)).toHaveLength(0);
  });

  it('reads the call time from Google\'s subject', () => {
    const { h } = setup();
    expect(h.gas.hubspotBookingWhen(SUBJECT)).toBe('Fri Nov 20, 2026 11:40am - 11:55am (PST)');
    expect(h.gas.hubspotBookingWhen('Appointment booked: x')).toBe('');
  });
});
