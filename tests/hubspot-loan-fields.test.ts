import { describe, expect, it } from 'vitest';
import { loadGas } from './helpers/gas-harness';

type Field = { name: string; value: string };
const mapping = { loanAmount: 'loan_amount', loanType: 'loan_type', propertyUse: 'property_use' };

function fields(data: Record<string, unknown>, configured = true) {
  const { gas } = loadGas<{ hubspotFields: (data: Record<string, unknown>) => Field[] }>({
    exports: ['hubspotFields'],
    props: configured ? { HUBSPOT_DETAIL_FIELD_MAP: JSON.stringify(mapping) } : {},
  });
  return Object.fromEntries(gas.hubspotFields({ email: 'test@example.com', ...data }).map(f => [f.name, f.value]));
}

describe('configured loan-field handoff', () => {
  it.each([
    ['HELOC', 'HELOC'],
    ['Fixed home equity loan', 'Home Equity Loan'],
    ['Cash-out refinance', 'Cash Out Refinance'],
  ])('sends the exact API option for %s without inventing an equity loan amount', (preference, expected) => {
    const result = fields({ source: 'home-equity', preference, propertyUse: 'primary', homeValue: 650000, estimatedEquity: 300000, cashRange: '$75k-150k' });
    expect(result).toMatchObject({ loan_type: expected, property_use: 'primary', rdt_lead_source: 'home-equity' });
    expect(result).not.toHaveProperty('loan_amount');
    expect(result).not.toHaveProperty('hubspot_owner_id');
  });

  it('maps the actual ADU amount to finance and project category, not project cost', () => {
    expect(fields({ source: 'adu', formId: 'adu-calculator', propertyUse: 'investment', amountToFinance: 75000, projectCost: 175000 }))
      .toMatchObject({ loan_amount: '75000', loan_type: 'ADU', property_use: 'investment', rdt_form_id: 'adu-calculator' });
  });

  it.each(['$300,000.50', 300000.5])('normalizes an explicitly collected numeric loan amount: %s', loanAmount => {
    expect(fields({ source: 'dscr', loanAmount }).loan_amount).toBe('300000.5');
  });

  it.each(['', 'Unknown', '$75k-150k', '75000-150000', '-5000', '$1,00', '1.2.3', '7.00%', 0, -1, Infinity, NaN, null, undefined])('omits an absent or invalid amount instead of clearing a prior answer: %s', loanAmount => {
      expect(fields({ loanAmount })).not.toHaveProperty('loan_amount');
    });

  it.each(['', 'Not sure yet', 'Home equity investment (HEI)', 'DSCR', 'constructor'])('omits an unsupported or unanswered product: %s', preference => {
      expect(fields({ source: 'home-equity', preference })).not.toHaveProperty('loan_type');
    });

  it('does not turn a general booking goal or uncollected ADU-contact amount into a loan selection', () => {
    const result = fields({ source: 'adu', formId: 'booking-prequal', bookingGoal: 'home-equity', amountToFinance: 50000, propertyUse: '' });
    expect(result).not.toHaveProperty('loan_type');
    expect(result).not.toHaveProperty('loan_amount');
    expect(result).not.toHaveProperty('property_use');
  });

  it('leaves the bridge dark without the approved mapping and preserves original payload values', () => {
    const data = { source: 'home-equity', preference: 'Cash-out refinance', propertyUse: 'primary', loanAmount: 100000 };
    const original = { ...data };
    const result = fields(data, false);
    expect(result).not.toHaveProperty('loan_type');
    expect(result).not.toHaveProperty('loan_amount');
    expect(result).not.toHaveProperty('property_use');
    expect(data).toEqual(original);
  });
});
