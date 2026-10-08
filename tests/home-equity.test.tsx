/**
 * /home-equity/ (revamp phase 3), end to end on both sides of the wall.
 *
 * What the page sends (buildEquityLead), where it lands (the 'home-equity'
 * schema in the real google-apps-script.js), how Bonzo files it, and what the
 * page says. The page itself is drawn from props, like the debt page, so each
 * step renders here on its own, including the ones behind the gates.
 */
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildEquityLead, equityNumbers } from '../src/utils/homeEquity';
import EquityPage, {
  EquityPageHero, StepEquityHome, StepEquityOptions, StepEquityContact, EquityRecap, type EquityPageView,
} from '../src/components/HomeEquityViews';
import { loadGas, recordingFetch, type FetchCall } from './helpers/gas-harness';

const read = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8');
const noop = () => {};
const html = (el: JSX.Element) => renderToStaticMarkup(el);

const CONTACT = { firstName: 'Ava', lastName: 'Owner', phone: '(714) 882-1190', email: 'ava@example.com', state: 'CA' };

describe('the lead the page sends', () => {
  it('carries the snapshot, the goal and the source', () => {
    const lead = buildEquityLead({
      ...CONTACT, homeValue: 650000, mortgageBalance: 350000,
      goal: 'Renovation / ADU', amountExploring: 75000, preference: 'Predictable payments',
    });
    expect(lead).toMatchObject({
      source: 'home-equity',
      homeValue: 650000, mortgageBalance: 350000,
      estimatedEquity: 300000, currentLtv: 53.8,
      goal: 'Renovation / ADU', amountExploring: 75000, illustrativeCltv: 65.4,
      preference: 'Predictable payments',
    });
  });

  it('sends a skipped amount and preference as blank, never as 0', () => {
    const lead = buildEquityLead({
      ...CONTACT, homeValue: 650000, mortgageBalance: 350000,
      goal: 'Pay Off Debt', amountExploring: 0, preference: '',
    });
    expect(lead.amountExploring).toBe('');
    expect(lead.illustrativeCltv).toBe('');
    expect(lead.preference).toBe('');
  });

  it('keeps a paid-off home: a balance of 0 is an answer', () => {
    const lead = buildEquityLead({
      ...CONTACT, homeValue: 500000, mortgageBalance: 0, goal: 'Investment', amountExploring: 0, preference: '',
    });
    expect(lead.mortgageBalance).toBe(0);
    expect(lead.estimatedEquity).toBe(500000);
    expect(lead.currentLtv).toBe(0);
  });

  it('computes nothing from a missing home value', () => {
    expect(equityNumbers(0, 350000, 75000)).toEqual({ equity: 0, ltv: 0, cltv: 0 });
  });
});

describe('where it lands: the Home Equity tab', () => {
  function post(payload: Record<string, unknown>) {
    const { gas, rowOf, tabs } = loadGas<{ doPost: (e: unknown) => { __body: string } }>({
      exports: ['doPost'],
      fetch: () => { throw new Error('doPost must not make HTTP calls'); },
    });
    const res = JSON.parse(gas.doPost({ postData: { contents: JSON.stringify(payload) } }).__body);
    return { res, rowOf, tabs };
  }

  it('writes every equity column under its own header', () => {
    const lead = buildEquityLead({
      ...CONTACT, homeValue: 650000, mortgageBalance: 350000,
      goal: 'Renovation / ADU', amountExploring: 75000, preference: '',
    });
    const { res, rowOf, tabs } = post({ ...lead, utm_source: 'youtube', utm_campaign: 'yt-heloc' });
    expect(res.success).toBe(true);
    expect(tabs.has('Leads')).toBe(false);
    expect(rowOf('Home Equity')).toMatchObject({
      'First Name': 'Ava', State: 'CA', Source: 'home-equity',
      'Home Value': 650000, 'Mortgage Balance': 350000,
      'Estimated Home Equity': 300000, 'Current LTV': 53.8,
      Goal: 'Renovation / ADU', 'Amount Exploring': 75000, 'Illustrative CLTV': 65.4,
      Preference: '', 'Licensed?': 'Yes',
      'UTM Source': 'youtube', 'UTM Campaign': 'yt-heloc',
    });
  });

  it('writes a paid-off balance as 0 and a skipped amount as blank', () => {
    const lead = buildEquityLead({
      ...CONTACT, homeValue: 500000, mortgageBalance: 0, goal: 'Investment', amountExploring: 0, preference: '',
    });
    expect(post(lead).rowOf('Home Equity')).toMatchObject({
      'Mortgage Balance': 0, 'Amount Exploring': '', 'Illustrative CLTV': '',
    });
  });
});

describe('how Bonzo files it', () => {
  function push(props: Record<string, string>) {
    const fetches: FetchCall[] = [];
    const { gas, queue } = loadGas<{ processFollowUps: () => void }>({
      exports: ['processFollowUps'], props, fetch: recordingFetch(fetches, [], '{"data":{"id":1}}'),
    });
    queue(buildEquityLead({
      ...CONTACT, homeValue: 650000, mortgageBalance: 350000,
      goal: 'Renovation / ADU', amountExploring: 75000, preference: 'Keeping my current mortgage',
    }));
    gas.processFollowUps();
    const call = fetches.find((f) => f.url.includes('getbonzo.com'))!;
    return { url: call.url, tags: JSON.parse(String(call.options.payload)).tags as string[] };
  }

  it('tags the intent, the goal and the preference, and says whether the state is workable', () => {
    const { tags } = push({ BONZO_API_KEY: 't', BONZO_CAMPAIGN_ID: '999' });
    expect(tags).toEqual(expect.arrayContaining([
      'home-equity', 'HELOC/cash-out interest',
      'goal:renovation-adu', 'preference:keeping-my-current-mortgage',
      'licensed-state', 'state:CA',
    ]));
  });

  it('enrolls into the default campaign until it has one of its own', () => {
    expect(push({ BONZO_API_KEY: 't', BONZO_CAMPAIGN_ID: '999' }).url).toMatch(/\/prospects\/campaign\/999$/);
  });

  it('moves to its own campaign when the Script Property is set, with no deploy', () => {
    const { url } = push({ BONZO_API_KEY: 't', BONZO_CAMPAIGN_ID: '999', BONZO_HOME_EQUITY_CAMPAIGN_ID: '4321' });
    expect(url).toMatch(/\/prospects\/campaign\/4321$/);
  });
});

/** An untouched page. */
function view(over: Partial<EquityPageView> = {}): EquityPageView {
  return {
    step: 1, goStep: noop,
    homeValue: '', setHomeValue: noop, mtgBalance: '', setMtgBalance: noop, amount: '', setAmount: noop,
    hv: 0, mb: 0, amt: 0, hasHome: false, equity: 0, ltv: 0, cltv: 0,
    goal: '', setGoal: noop, preference: '', setPreference: noop,
    fname: '', setFname: noop, lname: '', setLname: noop, phone: '', setPhone: noop,
    email: '', setEmail: noop, emailHint: null, setEmailHint: noop, usState: '', setUsState: noop,
    sending: false, submitted: false, submitLead: noop, openCalendly: noop,
    ...over,
  };
}

const filled = view({
  step: 2, homeValue: '650000', mtgBalance: '350000', amount: '75000',
  hv: 650000, mb: 350000, amt: 75000, hasHome: true, equity: 300000, ltv: 53.8, cltv: 65.4,
  goal: 'Renovation / ADU',
});

describe('what the page says', () => {
  it('the hero is the only <h1>, carries no phone number and needs no JavaScript', () => {
    const hero = html(<EquityPageHero />);
    expect(hero.match(/<h1\b/g)).toHaveLength(1);
    expect(hero).not.toMatch(/tel:|<button\b/);
    expect(hero).toContain('href="#equity"');
  });

  it('arrives empty: no figure, no goal chosen, every number an example', () => {
    const page = html(<StepEquityHome v={view()} />);
    expect(page).not.toContain('Estimated Home Equity');
    expect(page).not.toContain('aria-pressed="true"');
    for (const p of page.match(/placeholder="[^"]*"/g) ?? []) {
      if (/\d/.test(p)) expect(p).toMatch(/placeholder="e\.g\. /);
    }
    expect(page).not.toMatch(/value="\d/);
  });

  it('draws the snapshot once there is a value and a balance, including a balance of 0', () => {
    expect(html(<StepEquityHome v={{ ...filled, step: 1 }} />)).toContain('Estimated Home Equity');
    expect(html(<StepEquityHome v={{ ...filled, step: 1, mb: 0, mtgBalance: '0' }} />)).toContain('$650,000');
  });

  it('quotes no payment, rate or approval', () => {
    const page = html(<StepEquityOptions v={filled} />);
    expect(page).not.toMatch(/\/mo\b|you qualify|pre-?approved|\bAPR\b/i);
    expect(page).toContain('Illustrative CLTV');
    expect(page).toContain('Not an approval or available credit.');
  });

  it('says when the amount goes past the 85% CLTV lenders commonly use', () => {
    expect(html(<StepEquityOptions v={filled} />)).not.toContain('above the 85%');
    expect(html(<StepEquityOptions v={{ ...filled, cltv: 92.3 }} />)).toContain('above the 85% combined loan-to-value');
  });

  it('asks only for contact details on step 3', () => {
    const page = html(<StepEquityContact v={view({ step: 3 })} />);
    expect(page).not.toMatch(/Best Time|How did you hear/i);
    expect(page).toContain('This request is not a loan application.');
  });

  it('confirms with the estimate and goal it sent, and promises no time', () => {
    const page = html(<EquityRecap v={{ ...filled, submitted: true }} />);
    expect(page).toContain('Your request has been received.');
    expect(page).toContain('$300,000');
    expect(page).toContain('$75,000');
    expect(page).toContain('Renovation / ADU');
    expect(page).toContain('Darren will be in touch.');
    expect(page).not.toMatch(/business day|shortly|has reviewed/i);
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
    expect(script('home-equity/index.html')).toBe(script('index.html'));
  });

  it('posts its contact modal under its own source', () => {
    const app = read('src/HomeEquityApp.tsx');
    expect(app).toContain('leadSource="home-equity-contact"');
    expect(app).toContain('formId="home-equity-contact-modal"');
  });
});

describe('the short links', () => {
  it('send /yt/heloc and /yt/equity, and their -c variants, to /home-equity/ with their UTMs', () => {
    const toml = read('netlify.toml');
    for (const from of ['/yt/heloc', '/yt/heloc-c', '/yt/equity', '/yt/equity-c']) {
      const block = new RegExp(`from = "${from}"\\s+to = "([^"]+)"\\s+status = (\\d+)`).exec(toml);
      expect(block, from).not.toBeNull();
      expect(block![1]).toMatch(/^\/home-equity\/\?utm_source=youtube&/);
      expect(block![2]).toBe('302');
    }
  });
});
