import policy from '../../public/service-area-policy.json';

export const SERVICE_AREA_VERSION = policy.version;
export const PROPERTY_STATES = policy.states;
export const PROPERTY_STATE_LABELS: Record<string, string> = policy.labels;

/**
 * State rules, final (policy v3, 15 Oct 2026, with Darren and Max). The state
 * checked is always the state of the property the loan is on:
 *  - a primary or second home passes in the 8 licensed states;
 *  - an investment property (a DSCR loan, or a rental used as collateral for
 *    an equity loan) passes if its state is on either list: the investment
 *    list or the 8 licensed states. Oregon is on the second only.
 * For an equity loan that is the home being borrowed against; where the cash
 * goes does not matter and is not asked. public/service-area.js mirrors this
 * for the static pages and the booking prequal; tests keep the two in step.
 *
 * Contexts decide which uses a form offers, not the states:
 *  fha      primary only
 *  dscr     investment only (/dscr/, booking goals "Investment property" and
 *           "Commercial or custom")
 *  own-home primary or second home (booking goals "Buy or refinance a home I
 *           live in or a second home" and "Not sure yet")
 *  general  primary, second home or rental (equity loans and everything else)
 */
export type ServiceContext = 'fha' | 'dscr' | 'own-home' | 'general';

/** /book/'s goal question, by stored value. Commercial and not-sure are flagged for Darren. */
export const BOOKING_GOALS: Record<string, { context: ServiceContext; review: boolean }> = {
  equity: { context: 'general', review: false },
  dscr: { context: 'dscr', review: false },
  'own-home': { context: 'own-home', review: false },
  commercial: { context: 'dscr', review: true },
  'not-sure': { context: 'own-home', review: true },
};

/** null when a goal was given but is not one we know. */
export function serviceContext(source = '', goal?: unknown): ServiceContext | null {
  if (goal !== undefined && goal !== null && goal !== '') {
    return Object.prototype.hasOwnProperty.call(BOOKING_GOALS, String(goal)) ? BOOKING_GOALS[String(goal)].context : null;
  }
  const funnel = source.toLowerCase();
  if (funnel.includes('fha')) return 'fha';
  if (funnel.includes('dscr')) return 'dscr';
  return 'general';
}

export function propertyUses(source = '', goal?: unknown): string[] {
  const context = serviceContext(source, goal);
  return context ? (policy.propertyUses as Record<string, string[]>)[context] : [];
}

/** Investment property passes if its state is on either list. */
export const INVESTMENT_STATES = Array.from(new Set([...policy.investment, ...policy.consumer]));

export function serviceArea(propertyUse: unknown, propertyState: unknown, source = '', goal?: unknown) {
  const state = typeof propertyState === 'string' ? propertyState.trim().toUpperCase() : '';
  const list = propertyUse === 'primary' || propertyUse === 'second-home' ? policy.consumer
    : propertyUse === 'investment' ? INVESTMENT_STATES : [];
  if (!list.length || !policy.states.includes(state)) return 'incomplete';
  if (!propertyUses(source, goal).includes(String(propertyUse))) return 'out-of-market';
  return list.includes(state) ? 'supported' : 'out-of-market';
}

/** Where a visitor goes when the property's state fails. */
export function outOfMarketPage(propertyUse: unknown) {
  return propertyUse === 'investment' ? '/out-of-market-dscr/' : '/out-of-market-primary/';
}

/** The questions, worded for the loan the form is about. */
export function serviceAreaWording(formId = '') {
  const id = formId.toLowerCase();
  if (id.includes('fha')) return { legend: 'Where is the home?', use: 'How will you use the home?', state: 'Home state' };
  if (id.includes('dscr')) return { legend: 'Where is the investment property?', use: 'Property use', state: 'Investment property state' };
  if (!id.includes('contact') && /home-equity|debt|adu/.test(id)) {
    return { legend: 'Where is the home you’re borrowing against?', use: 'How do you use that home?', state: 'State of the home you’re borrowing against' };
  }
  return { legend: 'Where is the property?', use: 'Property use', state: 'Property state' };
}

export const OUT_OF_MARKET_MESSAGE = 'A personal review isn’t available for this property location right now. You’re welcome to keep exploring your options with the calculator.';

// The booking prequal's knockouts, shared by lead.mts and the tests. The
// browser copy lives in public/booking-chooser.js; tests/booking-prequal.test.ts
// keeps the two in step. Mobile homes and land are a knockout, as are a
// mortgage that is not current and a bankruptcy or foreclosure in the last 4
// years. "No mortgage yet" passes: a buyer has no mortgage to be current on.
export const BOOKING_PREQUAL_FORM = 'booking-prequal';
// /home-equity/ asks the same questions as its own three steps and shows the
// same calendar after them, so it is held to the same rules.
export const PREQUAL_FORMS = [BOOKING_PREQUAL_FORM, 'home-equity-calculator'];
export const PREQUAL_PROPERTY_TYPES = ['single-family-condo', '2-4-units'];
export const PREQUAL_MORTGAGE_OK = ['yes', 'no-mortgage'];
/** Every knockout question has a valid answer, whatever it is (Sheet-only inquiries). */
export function prequalAnswered(p: Record<string, unknown>): boolean {
  return ['single-family-condo', '2-4-units', 'mobile-land'].includes(String(p.propertyType))
    && ['yes', 'no', 'no-mortgage'].includes(String(p.mortgageCurrent))
    && ['yes', 'no'].includes(String(p.recentBankruptcyForeclosure));
}

export function prequalPasses(p: Record<string, unknown>): boolean {
  return PREQUAL_PROPERTY_TYPES.includes(String(p.propertyType))
    && PREQUAL_MORTGAGE_OK.includes(String(p.mortgageCurrent))
    && p.recentBankruptcyForeclosure === 'no';
}
