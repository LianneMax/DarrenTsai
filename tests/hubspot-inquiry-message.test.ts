import { describe, expect, it } from 'vitest';
import { loadGas } from './helpers/gas-harness';

type Runtime = {
  pushToHubSpot: (sheet: unknown, lead: Record<string, unknown>) => { outcome: string };
  SpreadsheetApp: { openById: (id: string) => unknown };
};

// Configuration remains explicit. The verified existing multi-line Message
// property must be declared on the API form before this mapping is activated.
const existingMapping = { loanAmount: 'loan_amount', loanType: 'loan_type', propertyUse: 'property_use' };
function setup(messageConfigured = true) {
  const bodies: string[] = [];
  const mapping = messageConfigured ? { ...existingMapping, message: 'message' } : existingMapping;
  const h = loadGas<Runtime>({
    exports: ['pushToHubSpot', 'SpreadsheetApp'],
    props: {
      HUBSPOT_PORTAL_ID: 'test-portal', HUBSPOT_FORM_GUID: 'test-form', HUBSPOT_SEND_TESTS: 'true',
      HUBSPOT_DETAIL_FIELD_MAP: JSON.stringify(mapping),
    },
    fetch: (url, options) => {
      if (url.includes('/submissions/v3/integration/submit/')) bodies.push(String(options.payload));
      return { getResponseCode: () => 200, getContentText: () => '{}' };
    },
  });
  const send = (patch: Record<string, unknown> = {}) => h.gas.pushToHubSpot(h.gas.SpreadsheetApp.openById('test'), {
    firstName: 'TEST', lastName: 'Inquiry', email: 'test@example.com', phone: '7145550123',
    source: 'home-equity', formId: 'home-equity-calculator', state: 'CA', propertyState: 'CA', propertyUse: 'primary',
    ...patch,
  });
  const fields = () => Object.fromEntries(JSON.parse(bodies[0]).fields.map((field: { name: string; value: string }) => [field.name, field.value]));
  return { send, bodies, fields };
}

describe('optional inquiry message account mapping', () => {
  it('sends the configured plain-text message alongside existing loan fields without owner or original-attribution writes', () => {
    const h = setup();
    const message = 'Please call after 5.\nI’m comparing a HELOC & a home equity loan.';
    expect(h.send({ message, preference: 'Fixed home equity loan', utm_source: 'youtube' }).outcome).toBe('sent');
    expect(h.bodies).toHaveLength(1);
    expect(h.fields()).toMatchObject({ message, loan_type: 'Home Equity Loan', property_use: 'primary', rdt_latest_utm_source: 'youtube' });
    expect(h.fields()).not.toHaveProperty('hubspot_owner_id');
    expect(Object.keys(h.fields()).some(name => name.startsWith('rdt_first_'))).toBe(false);
    expect(h.fields()).not.toHaveProperty('rdt_submission_snapshot');
  });

  it.each([undefined, null, '', '  \n '])('omits unanswered message %s so a repeat submission cannot clear a known CRM message', message => {
    const h = setup();
    expect(h.send({ message }).outcome).toBe('sent');
    expect(h.fields()).not.toHaveProperty('message');
  });

  it('keeps message delivery inactive until the account mapping is configured', () => {
    const h = setup(false);
    expect(h.send({ message: 'A message retained in the Sheet.' }).outcome).toBe('sent');
    expect(h.fields()).not.toHaveProperty('message');
    expect(h.fields()).toHaveProperty('property_use', 'primary');
  });

  it('does not dispatch an outside-area inquiry even when its message mapping is configured', () => {
    const h = setup();
    expect(h.send({ state: 'CO', propertyState: 'CO', message: 'Please keep my inquiry.' }).outcome).toBe('skipped');
    expect(h.bodies).toEqual([]);
  });
});
