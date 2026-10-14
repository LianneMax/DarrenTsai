import { describe, expect, it, vi } from 'vitest';
import { loadGas } from './helpers/gas-harness';
type Runtime = { SpreadsheetApp: { openById: (id: string) => unknown }; enqueueCallRailSync: (ss: unknown, d: Record<string, unknown>) => void; processCallRailSync: (ss: unknown) => void; processFollowUps: () => void };
const config = { CALLRAIL_SYNC_ENABLED: 'true', CALLRAIL_API_TOKEN: 'fake', CALLRAIL_ACCOUNT_ID: '123', CALLRAIL_COMPANY_ID: 'company' };
const lead = { firstName: 'Sam', email: 'sam@example.com', phone: '+17145550201', submissionId: 'one', homeValue: 500000, propertyState: 'CA', propertyUse: 'primary', _proxyKey: 'private' };
describe('isolated CallRail visibility queue', () => {
  it('stays dark without explicit enablement', () => {
    const fetch = vi.fn(); const h = loadGas<Runtime>({ exports: ['SpreadsheetApp', 'enqueueCallRailSync'], fetch });
    h.gas.enqueueCallRailSync(h.gas.SpreadsheetApp.openById('sheet'), lead);
    expect(h.tabs.has('CallRail Sync')).toBe(false); expect(fetch).not.toHaveBeenCalled();
  });
  it('saves the returned form ID and does not repeat a successful POST', () => {
    const fetch = vi.fn((_url: string, _options: Record<string, unknown>) => ({getResponseCode: () => 201, getContentText: () => '{"id":"FOR1"}'}));
    const h = loadGas<Runtime>({ exports: ['SpreadsheetApp', 'enqueueCallRailSync', 'processCallRailSync', 'processFollowUps'], props: config, fetch });
    const ss = h.gas.SpreadsheetApp.openById('sheet'); h.gas.enqueueCallRailSync(ss, lead);
    h.gas.enqueueCallRailSync(ss, lead); h.queue(lead, 'done');
    h.gas.processFollowUps(); h.gas.processFollowUps();
    expect(h.tabs.get('CallRail Sync')!.rows).toHaveLength(2);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(h.rowOf('CallRail Sync')).toMatchObject({Status: 'sent', 'CallRail ID': 'FOR1'});
    const body = JSON.parse(String(fetch.mock.calls[0][1].payload));
    expect(body.form_submission.form_data).toMatchObject({homeValue: 500000, propertyState: 'CA'});
    expect(body.form_submission.form_data).not.toHaveProperty('_proxyKey');
  });
  it('does not blindly retry an uncertain delivery', () => {
    const fetch = vi.fn(() => { throw new Error('network timeout'); });
    const h = loadGas<Runtime>({ exports: ['SpreadsheetApp', 'enqueueCallRailSync', 'processCallRailSync'], props: config, fetch });
    const ss = h.gas.SpreadsheetApp.openById('sheet'); h.gas.enqueueCallRailSync(ss, lead);
    h.gas.processCallRailSync(ss); h.gas.processCallRailSync(ss);
    expect(fetch).toHaveBeenCalledTimes(1); expect(h.rowOf('CallRail Sync').Status).toBe('needs-review');
  });
});
