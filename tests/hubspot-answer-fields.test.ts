/**
 * The five answer fields sent to HubSpot from 28 Nov 2026 (Max: "you can go
 * ahead and do this"), so Darren can filter and report on them: search keyword,
 * goal, cash range, property type and other loans. The properties and their
 * hidden fields on the API form were created the same day.
 *
 * What matters: plain words, never the internal codes, and nothing at all for a
 * value the forms do not offer (a tampered body must not write into the CRM).
 */
import { describe, expect, it } from 'vitest';
import { loadGas } from './helpers/gas-harness';

type Field = { name: string; value: string };

function fields(data: Record<string, unknown>) {
  const { gas } = loadGas<{ hubspotFields: (data: Record<string, unknown>) => Field[] }>({ exports: ['hubspotFields'] });
  return Object.fromEntries(gas.hubspotFields({ email: 'jane@gmail.com', ...data }).map(f => [f.name, f.value]));
}

describe('HubSpot answer fields', () => {
  it('sends a home-equity lead\'s answers in plain words', () => {
    expect(fields({
      source: 'home-equity', goal: 'Debt payoff', cashRange: '$75k-150k', propertyType: '2-4-units', otherLoans: 'heloc', utm_term: 'heloc rates california',
    })).toMatchObject({
      rdt_search_keyword: 'heloc rates california',
      rdt_goal: 'Debt payoff',
      rdt_cash_range: '$75k-150k',
      rdt_property_type: '2 to 4 units',
      rdt_other_loans: 'A HELOC',
    });
  });

  it('uses the booking panel\'s goal when the equity form did not ask', () => {
    expect(fields({ source: 'book', bookingGoal: 'dscr', propertyType: '5-plus-commercial' })).toMatchObject({
      rdt_goal: 'Investment property (DSCR)',
      rdt_property_type: '5+ units or commercial',
    });
  });

  it('leaves every field out when the form did not ask it', () => {
    const r = fields({ source: 'dscr' });
    for (const name of ['rdt_search_keyword', 'rdt_goal', 'rdt_cash_range', 'rdt_property_type', 'rdt_other_loans']) expect(r).not.toHaveProperty(name);
  });

  it('never writes a value the forms do not offer', () => {
    const r = fields({ goal: 'DROP TABLE', bookingGoal: 'hacked', cashRange: '$1', propertyType: 'castle', otherLoans: 'many' });
    for (const name of ['rdt_goal', 'rdt_cash_range', 'rdt_property_type', 'rdt_other_loans']) expect(r).not.toHaveProperty(name);
  });

  it('caps a long search term', () => {
    expect(fields({ utm_term: 'x'.repeat(500) }).rdt_search_keyword).toHaveLength(200);
  });
});
