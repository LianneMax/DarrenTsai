/**
 * /home-equity/ (revamp phase 3), end to end on both sides of the wall.
 *
 * What the page sends (buildEquityLead), where it lands (the 'home-equity'
 * schema in the real google-apps-script.js), that it reaches no Bonzo, and what
 * the page says. The page itself is drawn from props, like the debt page, so each
 * step renders here on its own, including the ones behind the gates.
 */
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import youtubeRedirect from '../netlify/functions/youtube-redirect.mts';
import { buildEquityLead, equityNumbers } from '../src/utils/homeEquity';
import { stateForZip } from '../src/utils/zipState';
import { prequalPasses } from '../src/utils/serviceArea';
import EquityPage, {
  EquityPageHero, StepEquityHome, StepEquityGoal, StepEquityContact, EquityRecap, EquityDeclined, EquityProducts,
  EQUITY_FORM_ID, type EquityPageView,
} from '../src/components/HomeEquityViews';
import { loadGas, recordingFetch, TEST_PROXY_KEY, type FetchCall } from './helpers/gas-harness';

const read = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8');
/** Source without comments: the comments name the banned claims on purpose. */
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^\s*\/\/.*$/gm, '');
const noop = () => {};
const html = (el: JSX.Element) => renderToStaticMarkup(el);

const CONTACT = { firstName: 'Ava', lastName: 'Owner', phone: '(714) 882-1190', email: 'ava@example.com' };
const ANSWERS = {
  propertyType: 'single-family-condo', propertyUse: 'primary', propertyZip: '92646', propertyState: 'CA',
  goal: 'Home improvement', creditRange: '720+', cashRange: '$75k-150k',
  mortgageCurrent: 'yes', recentBankruptcyForeclosure: 'no', preference: 'HELOC',
};

describe('the lead the page sends', () => {
  it('carries the snapshot, the answers and the source', () => {
    const lead = buildEquityLead({ ...CONTACT, ...ANSWERS, homeValue: 650000, mortgageBalance: 350000 });
    expect(lead).toMatchObject({
      source: 'home-equity', state: 'CA',
      homeValue: 650000, mortgageBalance: 350000,
      estimatedEquity: 300000, currentLtv: 53.8,
      ...ANSWERS,
    });
    expect(prequalPasses(lead)).toBe(true);
  });

  it('sends the columns it no longer asks for as blank, never as 0, and a skipped preference as blank', () => {
    const lead = buildEquityLead({ ...CONTACT, ...ANSWERS, preference: '', homeValue: 650000, mortgageBalance: 350000 });
    expect(lead.amountExploring).toBe('');
    expect(lead.illustrativeCltv).toBe('');
    expect(lead.preference).toBe('');
  });

  it('carries HEI as the chosen option when the visitor picks it', () => {
    const lead = buildEquityLead({ ...CONTACT, ...ANSWERS, preference: 'Home equity investment (HEI)', homeValue: 650000, mortgageBalance: 350000 });
    expect(lead.preference).toBe('Home equity investment (HEI)');
  });

  it('keeps a paid-off home: a balance of 0 is an answer', () => {
    const lead = buildEquityLead({ ...CONTACT, ...ANSWERS, mortgageCurrent: 'no-mortgage', homeValue: 500000, mortgageBalance: 0 });
    expect(lead.mortgageBalance).toBe(0);
    expect(lead.estimatedEquity).toBe(500000);
    expect(lead.currentLtv).toBe(0);
    expect(prequalPasses(lead)).toBe(true);
  });

  it('computes nothing from a missing home value', () => {
    expect(equityNumbers(0, 350000, 75000)).toEqual({ equity: 0, ltv: 0, cltv: 0 });
  });

  it('is held to the booking prequal rules on the server', () => {
    expect(read('src/utils/serviceArea.ts')).toContain(`PREQUAL_FORMS = [BOOKING_PREQUAL_FORM, '${EQUITY_FORM_ID}']`);
  });
});

describe('the ZIP gives the state', () => {
  it.each([
    ['92646', 'CA'], ['90210', 'CA'], ['96813', 'HI'], ['97201', 'OR'], ['85001', 'AZ'],
    ['33101', 'FL'], ['19103', 'PA'], ['37201', 'TN'], ['75201', 'TX'], ['88510', 'TX'],
    ['10001', 'NY'], ['83702', 'ID'], ['20001', 'DC'], ['05501', 'MA'], ['73301', 'TX'],
  ])('%s is in %s', (zip, state) => {
    expect(stateForZip(zip)).toBe(state);
  });

  it('places nothing it cannot be sure of', () => {
    for (const zip of ['', '9264', 'abcde', '00601', '09001', '96201', '96910']) expect(stateForZip(zip), zip).toBe('');
  });
});

describe('where it lands: the Home Equity tab', () => {
  function post(payload: Record<string, unknown>) {
    const { gas, rowOf, tabs } = loadGas<{ doPost: (e: unknown) => { __body: string } }>({
      exports: ['doPost'],
      props: { LEAD_PROXY_KEY: TEST_PROXY_KEY },
      fetch: () => { throw new Error('doPost must not make HTTP calls'); },
    });
    const res = JSON.parse(gas.doPost({ postData: { contents: JSON.stringify({ ...payload, _proxyKey: TEST_PROXY_KEY }) } }).__body);
    return { res, rowOf, tabs };
  }

  it('writes every equity column under its own header', () => {
    const lead = buildEquityLead({ ...CONTACT, ...ANSWERS, homeValue: 650000, mortgageBalance: 350000 });
    const { res, rowOf, tabs } = post({ ...lead, utm_source: 'youtube', utm_campaign: 'yt-heloc' });
    expect(res.success).toBe(true);
    expect(tabs.has('Leads')).toBe(false);
    expect(rowOf('Home Equity')).toMatchObject({
      'First Name': 'Ava', State: 'CA', Source: 'home-equity',
      'Home Value': 650000, 'Mortgage Balance': 350000,
      'Estimated Home Equity': 300000, 'Current LTV': 53.8,
      Goal: 'Home improvement', 'Amount Exploring': '', 'Illustrative CLTV': '', Preference: 'HELOC',
      'Licensed?': 'Yes', 'Property Type': 'single-family-condo', 'Mortgage Current': 'yes',
      'Recent Bankruptcy/Foreclosure': 'no', 'Property ZIP': '92646', 'Credit Range': '720+', 'Cash Range': '$75k-150k',
      'UTM Source': 'youtube', 'UTM Campaign': 'yt-heloc',
    });
  });

  it('writes a paid-off balance as 0', () => {
    const lead = buildEquityLead({ ...CONTACT, ...ANSWERS, mortgageCurrent: 'no-mortgage', homeValue: 500000, mortgageBalance: 0 });
    expect(post(lead).rowOf('Home Equity')).toMatchObject({ 'Mortgage Balance': 0 });
  });
});

describe('after Bonzo was retired (15 Oct 2026)', () => {
  it('is not sent to Bonzo, even with the old Script Properties still set', () => {
    const fetches: FetchCall[] = [];
    const { gas, queue } = loadGas<{ processFollowUps: () => void }>({
      exports: ['processFollowUps'],
      props: { BONZO_API_KEY: 't', BONZO_CAMPAIGN_ID: '999', BONZO_HOME_EQUITY_CAMPAIGN_ID: '4321' },
      fetch: recordingFetch(fetches, []),
    });
    queue(buildEquityLead({ ...CONTACT, ...ANSWERS, homeValue: 650000, mortgageBalance: 350000 }));
    gas.processFollowUps();
    expect(fetches.filter((f) => f.url.includes('getbonzo.com'))).toHaveLength(0);
  });
});

/** An untouched page. */
function view(over: Partial<EquityPageView> = {}): EquityPageView {
  return {
    step: 1, goStep: noop, next: noop,
    homeValue: '', setHomeValue: noop, mtgBalance: '', setMtgBalance: noop,
    hv: 0, mb: 0, hasHome: false, equity: 0,
    propertyType: '', setPropertyType: noop, propertyUse: '', setPropertyUse: noop,
    zip: '', setZip: noop, propertyState: '', setPropertyState: noop,
    goal: '', setGoal: noop, creditRange: '', setCreditRange: noop, cashRange: '', setCashRange: noop,
    mortgageCurrent: '', setMortgageCurrent: noop, bankruptcy: '', setBankruptcy: noop,
    preference: '', setPreference: noop,
    fname: '', setFname: noop, lname: '', setLname: noop, phone: '', setPhone: noop,
    email: '', setEmail: noop, emailHint: null, setEmailHint: noop, message: '', setMessage: noop,
    sending: false, submitted: false, declined: '', submitLead: noop,
    ...over,
  };
}

const filled = view({
  step: 2, homeValue: '650000', mtgBalance: '350000', hv: 650000, mb: 350000, hasHome: true, equity: 300000,
  propertyType: 'single-family-condo', propertyUse: 'primary', zip: '92646', propertyState: 'CA',
  goal: 'Home improvement', creditRange: '720+', cashRange: '$75k-150k', mortgageCurrent: 'yes', bankruptcy: 'no',
  fname: 'Ava', lname: 'Owner', email: 'ava@example.com',
});

/**
 * Held until Saxton approves them (15 Oct 2026). Checked across the whole
 * page source, not just one render, so a later step cannot slip one in.
 */
const UNAPPROVED = [
  /approval locked in/i, /zero credit impact/i, /soft[- ]pull/i, /no hard pull/i, /tax[- ]free/i,
  /\$400,?000/, /exact funded amount/i, /15 minutes?\b.*approv|approv.*15 minutes?/i, /\b7 days\b/i,
];

describe('what the page says', () => {
  it('the hero has one heading, no phone number and queues both path controls', () => {
    const hero = html(<EquityPageHero />);
    expect(hero.match(/<h1\b/g)).toHaveLength(1);
    expect(hero).not.toMatch(/tel:/);
    expect(hero).toContain('data-early="equity-path-access"');
    expect(hero).toContain('data-early="equity-path-payoff"');
    const page = html(<EquityPage v={view()} overlays={null} disclosure={null} onPath={() => {}} />);
    expect(page.match(/data-early="equity-path-/g)).toHaveLength(2);
    expect(hero).toContain('What could your <em>home equity</em> help you do?');
  });

  it('arrives empty: no figure, no answer chosen, every number an example', () => {
    const page = html(<StepEquityHome v={view()} />);
    expect(page).not.toContain('Estimated Home Equity');
    expect(page).not.toContain('aria-pressed="true"');
    for (const p of page.match(/placeholder="[^"]*"/g) ?? []) {
      if (/\d/.test(p)) expect(p).toMatch(/placeholder="e\.g\. /);
    }
    expect(page).not.toMatch(/value="\d/);
  });

  it('draws the live equity bar once there is a value and a balance, including a balance of 0', () => {
    expect(html(<StepEquityHome v={{ ...filled, step: 1 }} />)).toContain('class="dcp-bar"');
    expect(html(<StepEquityHome v={{ ...filled, step: 1, mb: 0, mtgBalance: '0' }} />)).toContain('$650,000');
  });

  it('step 1 asks home, type, use and ZIP; step 2 asks goal, credit, cash and the two knockouts', () => {
    const one = html(<StepEquityHome v={view()} />);
    for (const t of ['Single family or condo', '2 to 4 units', 'Mobile home or land', 'Primary home', 'Second home', 'Rental', 'ZIP of the home you&#x27;re borrowing against']) expect(one).toContain(t);
    const two = html(<StepEquityGoal v={filled} />);
    for (const t of ['Debt payoff', 'Home improvement', 'Business or investment', 'Other', '720+', '600-719', 'Below 600',
      '$25k-75k', '$75k-150k', '$150k+', 'Is your mortgage current?', 'bankruptcy or foreclosure in the last 4 years']) {
      expect(two).toContain(t.replace('&', '&amp;'));
    }
  });

  it('asks about the home being borrowed against, never where the cash goes', () => {
    const one = html(<StepEquityHome v={view()} />);
    expect(one).toContain('How do you use the home you&#x27;re borrowing against?');
    expect(one).not.toMatch(/not where you live|not your current residence|where.{0,20}(cash|money) (will|is) (be )?used/i);
  });

  it('asks no income, employer, start date or co-borrower question anywhere', () => {
    const src = code('src/components/HomeEquityViews.tsx');
    expect(src).not.toMatch(/income|employer|start date|co-?borrower/i);
  });

  it('asks only contact and consent on step 3, with no second state question', () => {
    const page = html(<StepEquityContact v={view({ step: 3 })} />);
    expect(page).not.toMatch(/Best Time|How did you hear|data-property-state/i);
    expect(page).toContain(`data-service-area="${EQUITY_FORM_ID}"`);
    expect(page).toContain(`data-privacy-form="${EQUITY_FORM_ID}"`);
    expect(page).toContain('Not a loan application, approval or commitment to lend.');
  });

  it('declines with no calendar and no phone number', () => {
    for (const declined of ['property-type', 'knockout'] as const) {
      const page = html(<EquityDeclined v={view({ declined })} />);
      expect(page).not.toMatch(/tel:|meetings/);
    }
  });

  it('confirms with the estimate and answers it sent, and promises no time', () => {
    const page = html(<EquityRecap v={{ ...filled, submitted: true }} />);
    expect(page).toContain('Your request has been received.');
    expect(page).toContain('$300,000');
    expect(page).toContain('Home improvement');
    expect(page).toContain('Darren will be in touch.');
    expect(page).toContain('dcp-recap-calendar');
    expect(page).not.toMatch(/business day|shortly|has reviewed/i);
  });

  it('explains HELOC first, then the fixed loan, cash-out and HEI', () => {
    const page = html(<EquityProducts />);
    const order = ['HELOC', 'Fixed home equity loan', 'Cash-out refinance', 'Home equity investment (HEI)'].map((t) => page.indexOf(t));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(page).not.toMatch(/\/mo\b|you qualify|pre-?approved|\bAPR\b/i);
  });

  it('describes HEI plainly, with no provider and no pricing', () => {
    const page = html(<EquityProducts />);
    const hei = page.slice(page.indexOf('Home equity investment (HEI)'));
    expect(hei).toContain('no monthly payment');
    expect(hei).toContain('share of your home&#x27;s future value');
    expect(hei).toContain('can cost more than a loan over time');
    expect(hei).toContain('Availability varies by state and property.');
    expect(hei).not.toMatch(/splitero|unison|hometap|point\.com|\bpoint\b|unlock|aspire|noah|\d+\s?%|\$\d/i);
  });

  it('lets a visitor pick HEI as their option of interest', () => {
    const page = html(<StepEquityGoal v={filled} />);
    expect(page).toContain('Which option interests you most?');
    expect(page).toContain('Home equity investment (HEI)');
  });

  it('makes none of the claims awaiting Saxton approval', () => {
    for (const file of ['src/components/HomeEquityViews.tsx', 'src/components/HomeEquityCalculator.tsx', 'src/components/HomeHub.tsx']) {
      const src = code(file);
      for (const claim of UNAPPROVED) expect(src, `${file}: ${claim}`).not.toMatch(claim);
    }
  });

  it('keeps id="equity" on the flow, which the hero button scrolls to', () => {
    expect(html(<EquityPage v={view()} overlays={null} disclosure={null} />)).toContain('id="equity"');
  });
});

describe('the pre-rendered /home-equity/ shell', () => {
  const TAIL = '</section></main>';

  it('holds the nav and the hero, and is exactly the start of what the app renders', async () => {
    const { renderEquityShell } = await import('../src/prerender');
    const { default: HomeEquityApp } = await import('../src/HomeEquityApp');
    const shell = renderEquityShell();
    expect(shell.startsWith('<nav')).toBe(true);
    expect(shell.match(/<h1\b/g)).toHaveLength(1);
    expect(shell.endsWith(TAIL)).toBe(true);
    expect(html(<HomeEquityApp />).startsWith(shell.slice(0, -TAIL.length))).toBe(true);
    expect(shell).not.toMatch(/class="[^"]*\breveal\b/);
  });

  it('marks every button in it that needs JavaScript', async () => {
    const { renderEquityShell } = await import('../src/prerender');
    const buttons = (renderEquityShell().match(/<button\b[^>]*>/g) ?? []).filter((b) => !/tabindex="-1"/.test(b));
    for (const b of buttons) expect(b).toContain('data-early=');
  });

  it('is built, pre-rendered, canonical to itself, in the sitemap, and runs the homepage early-click script', () => {
    expect(read('vite.config.ts')).toContain("'/home-equity/index.html': 'renderEquityShell'");
    expect(read('vite.config.ts')).toContain("homeEquity: 'home-equity/index.html'");
    const page = read('home-equity/index.html');
    expect(page).toContain('<link rel="canonical" href="https://realdarrentsai.com/home-equity/" />');
    expect(page).toContain('<div id="root"></div>');
    expect(read('public/sitemap.xml')).toContain('<loc>https://realdarrentsai.com/home-equity/</loc>');
    const script = (f: string) => /<script>\s*(\(function \(\) \{[\s\S]*?__dtEarlyClick[\s\S]*?\}\)\(\);)\s*<\/script>/.exec(read(f))?.[1];
    expect(script('home-equity/index.html')).toBeDefined();
    // Checkout line endings can differ; changes to the script itself must not.
    expect(script('home-equity/index.html')?.replace(/\r\n/g, '\n'))
      .toBe(script('index.html')?.replace(/\r\n/g, '\n'));
  });

  it('posts its contact modal under its own source', () => {
    const app = read('src/HomeEquityApp.tsx');
    expect(app).toContain('useBookingEntry');
    expect(app).not.toContain('<ContactModal');
  });
});

describe('the short links', () => {
  it('send /yt/heloc and /yt/equity, and their -c variants, to /home-equity/ with their UTMs', () => {
    for (const from of ['/yt/heloc', '/yt/heloc-c', '/yt/equity', '/yt/equity-c']) {
      const response = youtubeRedirect(new Request(`https://realdarrentsai.com${from}`));
      const url = new URL(response.headers.get('Location')!);
      expect(url.pathname).toBe('/home-equity/');
      expect(url.searchParams.get('utm_source')).toBe('youtube');
      expect(response.status).toBe(302);
    }
  });
});
