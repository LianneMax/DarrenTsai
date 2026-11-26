/**
 * Lead Status from logged calls (25 Nov 2026). Runs the real
 * google-apps-script.js in the shared fake runtime: an outbound call logged on
 * a borrower whose Lead Status is New (or blank) moves it to Attempted to
 * contact. Nothing else is changed.
 */
import { describe, expect, it, vi } from 'vitest';
import { loadGas, type FetchResponse } from './helpers/gas-harness';

type Runtime = {
  SpreadsheetApp: { openById: (id: string) => unknown };
  processHubSpotLeadStatus: (ss: unknown) => void;
  hubspotLeadStatusDecision: (p: Record<string, string>) => string;
};

const config = { HUBSPOT_LEAD_STATUS_ENABLED: 'true', HUBSPOT_PRIVATE_APP_TOKEN: 'pat-test' };
const ok = (body: unknown, code = 200): FetchResponse => ({ getResponseCode: () => code, getContentText: () => JSON.stringify(body) });

function hubspot(opts: { status?: string; rel?: string; test?: string; calls?: Array<{ id: string; at?: string }>; searchCode?: number; contacts?: string[] } = {}) {
  const calls = opts.calls ?? [{ id: 'CALL1', at: '2026-11-23T18:17:27Z' }];
  return vi.fn((url: string, o: Record<string, unknown>) => {
    if (url.endsWith('/crm/v3/objects/calls/search')) return ok({ results: calls.map((c) => ({ id: c.id, properties: { hs_timestamp: c.at ?? '2026-11-23T18:17:27Z', hs_call_direction: 'OUTBOUND' } })) }, opts.searchCode ?? 200);
    if (/\/crm\/v4\/objects\/calls\/.+\/associations\/contacts$/.test(url)) return ok({ results: (opts.contacts ?? ['605356338934']).map((id) => ({ toObjectId: Number(id) })) });
    if (url.includes('/crm/v3/objects/contacts/') && o.method === 'get') return ok({ properties: { hs_lead_status: opts.status ?? 'NEW', relationship_type: opts.rel ?? 'borrower_client', rdt_test_lead: opts.test ?? 'No', firstname: 'Stefan', lastname: 'Rudzki' } });
    if (url.includes('/crm/v3/objects/contacts/') && o.method === 'patch') return ok({ id: '605356338934' });
    return ok({});
  });
}

function setup(props: Record<string, string> = { ...config }, fetch = hubspot()) {
  const h = loadGas<Runtime>({ exports: ['SpreadsheetApp', 'processHubSpotLeadStatus', 'hubspotLeadStatusDecision'], props, fetch });
  return { h, fetch, props, ss: h.gas.SpreadsheetApp.openById('sheet') };
}
const callsOf = (f: ReturnType<typeof hubspot>, m: string, end: RegExp) => f.mock.calls.filter((c) => (c[1] as { method: string }).method === m && end.test(String(c[0])));

describe('HubSpot Lead Status from logged calls', () => {
  it('stays dark until enabled and given a token', () => {
    for (const props of [{}, { HUBSPOT_LEAD_STATUS_ENABLED: 'true' }, { HUBSPOT_PRIVATE_APP_TOKEN: 'pat' }]) {
      const { h, fetch, ss } = setup(props as Record<string, string>);
      h.gas.processHubSpotLeadStatus(ss);
      expect(fetch).not.toHaveBeenCalled();
      expect(h.tabs.has('HubSpot Lead Status')).toBe(false);
    }
  });

  it('moves New to Attempted to contact once per call, and only searches outbound calls', () => {
    const { h, fetch, props, ss } = setup();
    h.gas.processHubSpotLeadStatus(ss);
    delete props.HUBSPOT_LEAD_STATUS_LAST_RUN; // skip the 10-minute throttle
    h.gas.processHubSpotLeadStatus(ss);
    const patches = callsOf(fetch, 'patch', /contacts\/605356338934$/);
    expect(patches).toHaveLength(1);
    expect(JSON.parse(String(patches[0][1].payload))).toEqual({ properties: { hs_lead_status: 'ATTEMPTED_TO_CONTACT' } });
    expect(h.rowOf('HubSpot Lead Status')).toMatchObject({ 'Call ID': 'CALL1', 'Contact ID': '605356338934', From: 'NEW', To: 'ATTEMPTED_TO_CONTACT', Status: 'done' });
    const search = JSON.parse(String(callsOf(fetch, 'post', /calls\/search$/)[0][1].payload));
    expect(search.filterGroups[0].filters[0]).toEqual({ propertyName: 'hs_call_direction', operator: 'EQ', value: 'OUTBOUND' });
  });

  it('treats a blank Lead Status on an untriaged contact like New', () => {
    const { h, fetch, ss } = setup({ ...config }, hubspot({ status: '', rel: '' }));
    h.gas.processHubSpotLeadStatus(ss);
    expect(callsOf(fetch, 'patch', /contacts\//)).toHaveLength(1);
    expect(h.rowOf('HubSpot Lead Status')).toMatchObject({ From: 'blank', Status: 'done' });
  });

  it.each(['ATTEMPTED_TO_CONTACT', 'CONNECTED', 'IN_PROGRESS', 'OPEN_DEAL', 'BAD_TIMING', 'UNQUALIFIED'])('never touches a status Darren already set: %s', (status) => {
    const { h, fetch, ss } = setup({ ...config }, hubspot({ status }));
    h.gas.processHubSpotLeadStatus(ss);
    expect(callsOf(fetch, 'patch', /contacts\//)).toHaveLength(0);
    expect(h.rowOf('HubSpot Lead Status')).toMatchObject({ Status: 'skipped-status-kept' });
  });

  it('skips vendors, partners, spam and TEST contacts', () => {
    for (const opts of [{ rel: 'vendor' }, { rel: 'business_partner' }, { rel: 'system_newsletter_spam' }, { rel: 'needs_review' }, { test: 'Yes' }]) {
      const { fetch, ss, h } = setup({ ...config }, hubspot(opts));
      h.gas.processHubSpotLeadStatus(ss);
      expect(callsOf(fetch, 'patch', /contacts\//)).toHaveLength(0);
    }
  });

  it('still updates a borrower who is also a referral partner', () => {
    const { h } = setup();
    expect(h.gas.hubspotLeadStatusDecision({ hs_lead_status: 'NEW', relationship_type: 'borrower_client;referral_partner' })).toBe('update');
  });

  it('logs and stops when the key cannot read calls', () => {
    const { fetch, ss, h } = setup({ ...config }, hubspot({ searchCode: 403 }));
    h.gas.processHubSpotLeadStatus(ss);
    expect(callsOf(fetch, 'patch', /contacts\//)).toHaveLength(0);
  });
});
