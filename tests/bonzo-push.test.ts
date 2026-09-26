/**
 * pushToBonzo, driven for real through processFollowUps.
 *
 * WHY THIS FILE EXISTS. Bonzo is where a lead is actually worked. Everything
 * about that push was untested: the tests either checked the pure helpers
 * (`attributionTags`, `addMortgageFields`, `bonzoTag`) in isolation, or checked
 * that *a* Bonzo call happened without looking at what was in it. That leaves
 * the expensive mistakes invisible:
 *
 *  - The campaign id decides which nurture sequence a paid lead receives. Route
 *    a DSCR investor into the default campaign and they get first-time-buyer
 *    copy. Nothing checked the routing at all, and three of the four ids are
 *    constants in the file rather than Script Properties, so a typo ships.
 *  - The tags are what Darren filters on. `licensed-state` in particular is the
 *    difference between a workable lead and one he cannot serve.
 *  - The pinned DSCR note carries annual tax, annual insurance and monthly HOA.
 *    Those three have no native Bonzo field, so if the note is not posted they
 *    are gone, and they are exactly what decides whether the deal pencils.
 *
 * So these tests read the request body Bonzo would have received.
 */
import { describe, it, expect } from 'vitest';
import { loadGas, recordingFetch, type Tab, type FetchCall } from './helpers/gas-harness';

type Harness = {
  processFollowUps: () => void;
  tabs: Map<string, Tab>;
  fetches: FetchCall[];
  props: Record<string, string>;
  queue: (payload: Record<string, unknown>) => void;
};

function load(props: Record<string, string>): Harness {
  const fetches: FetchCall[] = [];

  // No keyed replies: every call answers 200 with the same prospect id, which is
  // what the pinned-note assertions read back out of the create response.
  const { gas, tabs, queue } = loadGas<Pick<Harness, 'processFollowUps'>>({
    exports: ['processFollowUps'],
    props,
    fetch: recordingFetch(fetches, [], '{"data":{"id":4242}}'),
  });

  return { processFollowUps: gas.processFollowUps, tabs, fetches, props, queue };
}

/** No per-source campaign overrides, so the constants in the file are exercised. */
const BASE_PROPS = { BONZO_API_KEY: 'bonzo-token', BONZO_CAMPAIGN_ID: '999' };

/** Run one lead through the queue and hand back what Bonzo was sent. */
function push(payload: Record<string, unknown>, props: Record<string, string> = BASE_PROPS) {
  const h = load({ ...props });
  h.queue(payload);
  h.processFollowUps();
  const bonzo = h.fetches.filter((f) => f.url.includes('getbonzo.com'));
  return {
    h,
    calls: bonzo,
    /** The prospect-creation call: body, url, and its tags. */
    prospect: bonzo[0]
      ? {
          url: bonzo[0].url,
          body: JSON.parse(String(bonzo[0].options.payload)) as Record<string, unknown>,
          tags: (JSON.parse(String(bonzo[0].options.payload)).tags ?? []) as string[],
        }
      : null,
    note: bonzo.find((f) => f.url.includes('/notes')),
  };
}

const DSCR_LEAD = {
  source: 'dscr', magnet: 'DSCR Rate & Cash Flow Guide',
  firstName: 'Jane', lastName: 'Investor', email: 'jane@example.com',
  phone: '7145550123', state: 'CA',
  dscr: '1.17', downPayment: '25%', loanAmount: '$240,000', rate: '7.00%',
  downPaymentAmount: 80000, purchasePrice: 320000,
  monthlyRent: 2400, monthlyPitia: 2047, monthlyPI: 1600,
  annualTax: 4000, annualInsurance: 1200, monthlyHoa: 150,
};

/**
 * The campaign id is the whole routing decision. These are the live ids, and
 * they are constants in google-apps-script.js rather than Script Properties, so
 * a mistyped one ships silently and the lead is nurtured with the wrong copy.
 */
describe('each funnel is enrolled in its own Bonzo campaign', () => {
  it.each([
    ['dscr', '258025'],
    ['fha', '145797'],
    ['real-estate-investing', '261737'],
  ])('%s enrolls in campaign %s', (source, campaignId) => {
    const { prospect } = push({ source, email: 'a@example.com', state: 'CA' });
    expect(prospect!.url).toContain(`/prospects/campaign/${campaignId}`);
  });

  it('sends everything else to the default campaign from Script Properties', () => {
    for (const source of ['DebtConsolidation', 'MortgageCalculator', 'QualifyForm']) {
      const { prospect } = push({ source, email: 'a@example.com', state: 'CA' });
      expect(prospect!.url, source).toContain('/prospects/campaign/999');
    }
  });

  it.each([
    ['dscr', 'BONZO_DSCR_CAMPAIGN_ID'],
    ['fha', 'BONZO_FHA_CAMPAIGN_ID'],
    ['real-estate-investing', 'BONZO_REI_CAMPAIGN_ID'],
  ])('lets a Script Property override the built-in id for %s', (source, prop) => {
    const { prospect } = push(
      { source, email: 'a@example.com', state: 'CA' },
      { ...BASE_PROPS, [prop]: '777777' },
    );
    expect(prospect!.url).toContain('/prospects/campaign/777777');
  });

  it('falls back to a bare prospect when no campaign is configured at all', () => {
    // Otherwise the URL becomes /prospects/campaign/undefined and the lead is
    // never created.
    const { prospect } = push(
      { source: 'MortgageCalculator', email: 'a@example.com' },
      { BONZO_API_KEY: 'bonzo-token' },
    );
    expect(prospect!.url).toMatch(/\/prospects$/);
  });

  it('does nothing at all when Bonzo is not configured', () => {
    // The Sheet row is already written by this point, so a missing key must
    // skip quietly rather than throw and mark the row errored.
    const h = load({});
    h.queue(DSCR_LEAD);
    h.processFollowUps();
    expect(h.fetches.filter((f) => f.url.includes('getbonzo.com'))).toHaveLength(0);
  });
});

describe('the prospect carries the lead, not just an email', () => {
  it('sends the contact fields Bonzo needs to make contact', () => {
    const { prospect } = push(DSCR_LEAD);
    expect(prospect!.body).toMatchObject({
      first_name: 'Jane',
      last_name: 'Investor',
      email: 'jane@example.com',
      phone: '7145550123',
      source: 'dscr',
    });
  });

  it('sends the calculator numbers as flat top-level keys', () => {
    // Verified live against the v3 API: a nested `mortgage: {...}` object is
    // accepted with a 201 and then silently dropped. This is the assertion that
    // would catch someone "tidying" these into an object.
    const { prospect } = push(DSCR_LEAD);
    expect(prospect!.body).toMatchObject({
      loan_amount: '240000',
      down_payment: '80000',
      purchase_price: '320000',
      interest_rate: '7.00',
      monthly_payment: '2047',
      loan_program: 'DSCR 1.17',
      property_state: 'CA',
      loan_type: 'DSCR',
    });
    expect(prospect!.body).not.toHaveProperty('mortgage');
    expect(prospect!.body).not.toHaveProperty('custom_fields');
  });

  it('never sends a display string to a numeric Bonzo field', () => {
    // "$240,000" and "7.00%" are what the landing pages collect; Bonzo's
    // numeric fields reject them, which 422s the whole push.
    const { prospect } = push(DSCR_LEAD);
    for (const key of ['loan_amount', 'down_payment', 'purchase_price', 'interest_rate']) {
      expect(String(prospect!.body[key]), key).toMatch(/^\d+(\.\d+)?$/);
    }
  });

  it('omits a state Bonzo does not know rather than 422ing the whole push', () => {
    // property_state is a select. An unlisted value rejects the request, taking
    // the entire lead with it.
    const { prospect } = push({ ...DSCR_LEAD, state: 'ZZ' });
    expect(prospect!.body).not.toHaveProperty('property_state');
    expect(prospect!.body.email).toBe('jane@example.com'); // the lead still goes
  });

  it('puts the click id somewhere it can be read back for offline conversions', () => {
    const { prospect } = push({
      ...DSCR_LEAD, clickId: 'GCLID_ABC', clickIdType: 'gclid',
      utm_campaign: 'dscr-q4', utm_content: 'ad-a',
    });
    expect(prospect!.body.lead_id).toBe('GCLID_ABC');
    expect(prospect!.body.current_step).toBe('dscr-q4 / ad-a');
  });
});

/**
 * Tags are the filter Darren actually works from. `licensed-state` is the one
 * that matters most: he cannot serve a lead outside his eight states, and an
 * untagged out-of-area lead is indistinguishable from a workable one.
 */
describe('tags say what kind of lead this is', () => {
  it.each([
    ['dscr', ['dscr', 'investor', 'priority:p2']],
    ['fha', ['fha', 'fha-calculator', 'priority:p4']],
    ['real-estate-investing', ['real-estate-investing', 'case-study', 'priority:p5']],
    ['DebtConsolidation', ['debt-consolidation']],
    ['MortgageCalculator', ['mortgage-calculator']],
    // The contact modal, one entry per page. All five posted
    // 'MortgageCalculator' until 26 Sep 2026, so every one of these arrived in
    // Bonzo tagged identically and Darren could not tell which page the lead
    // had been reading when they asked him to call.
    ['home-contact', ['contact', 'home']],
    ['mortgage-calculator-contact', ['contact', 'mortgage-calculator']],
    ['dscr-contact', ['contact', 'dscr']],
    ['fha-contact', ['contact', 'fha']],
    ['rei-contact', ['contact', 'real-estate-investing']],
  ])('%s is tagged for its funnel', (source, expected) => {
    const { prospect } = push({ source, email: 'a@example.com', state: 'CA' });
    for (const tag of expected) expect(prospect!.tags, source).toContain(tag);
  });

  it.each([
    'dscr', 'fha', 'real-estate-investing', 'DebtConsolidation', 'MortgageCalculator',
    'home-contact', 'mortgage-calculator-contact', 'dscr-contact', 'fha-contact', 'rei-contact',
  ])(
    '%s says whether the state is one Darren is licensed in',
    (source) => {
      expect(push({ source, email: 'a@example.com', state: 'CA' }).prospect!.tags)
        .toContain('licensed-state');
      expect(push({ source, email: 'a@example.com', state: 'NY' }).prospect!.tags)
        .toContain('unlicensed-state');
    },
  );

  it('does not mistake a contact lead for the funnel it sits on', () => {
    // 'dscr-contact' shares a prefix with 'dscr' but is not the DSCR magnet: it
    // has no ratio, no guide to send, and should not be tagged 'investor'.
    const { prospect } = push({ source: 'dscr-contact', email: 'a@example.com', state: 'CA' });
    expect(prospect!.tags).not.toContain('investor');
    expect(prospect!.tags).not.toContain('priority:p2');
  });

  it('records the state itself, normalised, so it can be filtered on', () => {
    expect(push({ source: 'dscr', email: 'a@example.com', state: ' ca ' }).prospect!.tags)
      .toContain('state:CA');
  });

  it('still enrolls an out-of-area lead rather than dropping it', () => {
    // Out-of-area leads used to be skipped entirely. They are surfaced by tag
    // now, because a referral partner is still worth having on the record.
    const { prospect } = push({ source: 'dscr', email: 'ny@example.com', state: 'NY' });
    expect(prospect).not.toBeNull();
    expect(prospect!.body.email).toBe('ny@example.com');
  });

  it('carries the ad attribution onto the prospect', () => {
    const { prospect } = push({
      ...DSCR_LEAD, clickId: 'ABC', clickIdType: 'gclid',
      utm_source: 'google', utm_campaign: 'HELOC Q4',
    });
    expect(prospect!.tags).toContain('ads:google');
    expect(prospect!.tags).toContain('utm:google');
    expect(prospect!.tags).toContain('campaign:heloc-q4'); // sanitised
  });

  it('tags an untracked lead as such, so broken tracking is visible', () => {
    expect(push({ source: 'dscr', email: 'a@example.com', state: 'CA' }).prospect!.tags)
      .toContain('attr:none');
  });

  it('credits a returning visitor to the ad that first found them', () => {
    // Last touch is organic YouTube; the gclid is only on the first touch.
    const { prospect } = push({
      source: 'dscr', email: 'a@example.com', state: 'CA',
      utm_source: 'youtube.com', utm_medium: 'referral',
      firstUtmSource: 'google', firstUtmCampaign: 'heloc-q4',
      firstClickId: 'FIRST_GCLID', firstClickIdType: 'gclid',
    });
    expect(prospect!.tags).toContain('ads:google');
    expect(prospect!.tags).toContain('campaign:heloc-q4');
    expect(prospect!.tags).toContain('last:youtube-com');
    expect(prospect!.body.lead_id).toBe('FIRST_GCLID');
  });

  it('produces tags Bonzo will not mangle', () => {
    // Bonzo HTML-escapes note and tag content: "&" came back as &amp; and "+"
    // as &#43;, both verified live.
    const { prospect } = push({
      source: 'dscr', email: 'a@example.com', state: 'CA',
      utm_source: 'google', utm_campaign: 'Brand & Equity + Q4',
    });
    for (const tag of prospect!.tags) {
      expect(tag, tag).not.toMatch(/[&+]/);
    }
  });
});

/**
 * The pinned note is the only place annual tax, annual insurance and monthly
 * HOA survive: Bonzo has no field for any of them, and they are what decide
 * whether a DSCR deal pencils.
 */
describe('the DSCR scenario note', () => {
  it('is pinned to the prospect that was just created', () => {
    const { note } = push(DSCR_LEAD);
    expect(note).toBeDefined();
    expect(note!.url).toContain('/prospects/4242/notes'); // the id Bonzo returned
    const body = JSON.parse(String(note!.options.payload));
    expect(body.is_pinned).toBe(true);
  });

  it('carries the three figures that have no Bonzo field of their own', () => {
    const { note } = push(DSCR_LEAD);
    const content = String(JSON.parse(String(note!.options.payload)).content);
    expect(content).toContain('Annual property tax: $4,000');
    expect(content).toContain('Annual insurance: $1,200');
    expect(content).toContain('Monthly HOA: $150');
  });

  it('says plainly that the numbers are the lead\'s own, not verified', () => {
    const content = String(JSON.parse(String(push(DSCR_LEAD).note!.options.payload)).content);
    expect(content).toContain('self-reported by the lead, not verified');
    expect(content).toContain('Resulting DSCR: 1.17');
  });

  it('uses only characters Bonzo will not escape', () => {
    const content = String(JSON.parse(String(push(DSCR_LEAD).note!.options.payload)).content);
    expect(content).not.toMatch(/[&+<>]/);
  });

  it('is not posted for a funnel that has no scenario', () => {
    for (const source of ['fha', 'real-estate-investing', 'DebtConsolidation']) {
      expect(push({ source, email: 'a@example.com', state: 'CA' }).note, source).toBeUndefined();
    }
  });

  it('is skipped rather than posted empty when the lead entered no numbers', () => {
    expect(push({ source: 'dscr', email: 'a@example.com', state: 'CA' }).note).toBeUndefined();
  });
});
