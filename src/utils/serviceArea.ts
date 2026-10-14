import policy from '../../public/service-area-policy.json';

export const SERVICE_AREA_VERSION = policy.version;
export const PROPERTY_STATES = policy.states;
export const PROPERTY_STATE_LABELS: Record<string, string> = policy.labels;
export function propertyUses(source = ''): string[] {
  const funnel = source.toLowerCase();
  if (funnel.includes('fha')) return policy.propertyUses.fha;
  if (funnel.includes('dscr')) return policy.propertyUses.dscr;
  return ['primary', 'investment'];
}
export function serviceArea(propertyUse: unknown, propertyState: unknown, source = '') {
  const state = typeof propertyState === 'string' ? propertyState.trim().toUpperCase() : '';
  // The DSCR footprint is not evidence of HELOC/HELOAN product coverage.
  const equity = source.toLowerCase().includes('home-equity');
  const list = propertyUse === 'primary' ? policy.consumer : propertyUse === 'investment' ? (equity ? policy.consumer : policy.investment) : [];
  if (!list.length || !policy.states.includes(state)) return 'incomplete';
  if (!propertyUses(source).includes(String(propertyUse))) return 'out-of-market';
  return list.includes(state) ? 'supported' : 'out-of-market';
}
export const OUT_OF_MARKET_MESSAGE = 'A personal review isn’t available for this property location right now. You’re welcome to keep exploring your options with the calculator.';

// The booking prequal's knockouts, shared by lead.mts and the tests. The
// browser copy lives in public/booking-chooser.js; tests/booking-prequal.test.ts
// keeps the two in step. Mobile homes and land are a knockout, as are a
// mortgage that is not current and a bankruptcy or foreclosure in the last 4
// years. "No mortgage yet" passes: a buyer has no mortgage to be current on.
export const BOOKING_PREQUAL_FORM = 'booking-prequal';
export const PREQUAL_PROPERTY_TYPES = ['single-family-condo', '2-4-units'];
export const PREQUAL_MORTGAGE_OK = ['yes', 'no-mortgage'];
export function prequalPasses(p: Record<string, unknown>): boolean {
  return PREQUAL_PROPERTY_TYPES.includes(String(p.propertyType))
    && PREQUAL_MORTGAGE_OK.includes(String(p.mortgageCurrent))
    && p.recentBankruptcyForeclosure === 'no';
}
