/**
 * /adu/ (revamp phase 5), end to end on both sides of the wall: what the page
 * sends (buildAduLead), where it lands (the 'adu' schema in the real
 * google-apps-script.js), how Bonzo files it, and what the page says, with
 * each step rendered from props.
 */
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import youtubeRedirect from '../netlify/functions/youtube-redirect.mts';
import { buildAduLead, aduNumbers } from '../src/utils/adu';
import AduPage, { AduPageHero, StepAduProject, StepAduContact, AduRecap, type AduPageView } from '../src/components/AduViews';
import { loadGas, recordingFetch, type FetchCall } from './helpers/gas-harness';

const read = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8');
const noop = () => {};
const html = (el: JSX.Element) => renderToStaticMarkup(el);

const CONTACT = { firstName: 'Ava', lastName: 'Owner', phone: '(714) 882-1190', email: 'ava@example.com', state: 'CA' };
const PROJECT = { homeValue: 650000, mortgageBalance: 350000, projectCost: 175000, amountToFinance: 75000, purpose: 'Rental ADU' };

describe('the lead the page sends', () => {
  it('carries the snapshot, the project and the source', () => {
    expect(buildAduLead({ ...CONTACT, ...PROJECT })).toMatchObject({
      source: 'adu',
      homeValue: 650000, mortgageBalance: 350000, estimatedEquity: 300000, currentLtv: 53.8,
      projectCost: 175000, amountToFinance: 75000, illustrativeCltv: 65.4, projectPurpose: 'Rental ADU',
    });
  });

  it('keeps a paid-off home: a balance of 0 is an answer', () => {
    const lead = buildAduLead({ ...CONTACT, ...PROJECT, mortgageBalance: 0 });
    expect(lead.mortgageBalance).toBe(0);
    expect(lead.estimatedEquity).toBe(650000);
  });

  it('works out the budget gap either way, and none until both numbers exist', () => {
    expect(aduNumbers(650000, 350000, 175000, 75000).gap).toBe(100000);
    expect(aduNumbers(650000, 350000, 50000, 75000).gap).toBe(-25000);
    expect(aduNumbers(650000, 350000, 175000, 0).gap).toBe(0);
  });
});

describe('where it lands: the ADU tab', () => {
  function post(payload: Record<string, unknown>) {
    const { gas, rowOf, tabs } = loadGas<{ doPost: (e: unknown) => { __body: string } }>({
      exports: ['doPost'],
      fetch: () => { throw new Error('doPost must not make HTTP calls'); },
    });
    const res = JSON.parse(gas.doPost({ postData: { contents: JSON.stringify(payload) } }).__body);
    return { res, rowOf, tabs };
  }

  it('writes every project column under its own header', () => {
    const { res, rowOf, tabs } = post({ ...buildAduLead({ ...CONTACT, ...PROJECT }), utm_campaign: 'yt-adu' });
    expect(res.success).toBe(true);
    expect(tabs.has('Leads')).toBe(false);
    expect(rowOf('ADU')).toMatchObject({
      Source: 'adu', 'Home Value': 650000, 'Mortgage Balance': 350000,
      'Estimated Home Equity': 300000, 'Current LTV': 53.8,
      'Project Cost': 175000, 'Amount to Finance': 75000, 'Illustrative CLTV': 65.4,
      'Project Purpose': 'Rental ADU', 'Licensed?': 'Yes', 'UTM Campaign': 'yt-adu',
    });
  });

  it('writes a paid-off balance as 0, not blank', () => {
    expect(post(buildAduLead({ ...CONTACT, ...PROJECT, mortgageBalance: 0 })).rowOf('ADU')['Mortgage Balance']).toBe(0);
  });
});

describe('how Bonzo files it', () => {
  function push(props: Record<string, string>) {
    const fetches: FetchCall[] = [];
    const { gas, queue } = loadGas<{ processFollowUps: () => void }>({
      exports: ['processFollowUps'], props, fetch: recordingFetch(fetches, [], '{"data":{"id":1}}'),
    });
    queue(buildAduLead({ ...CONTACT, ...PROJECT }));
    gas.processFollowUps();
    const call = fetches.find((f) => f.url.includes('getbonzo.com'))!;
    return { url: call.url, tags: JSON.parse(String(call.options.payload)).tags as string[] };
  }

  it('tags the project, its purpose and the state', () => {
    expect(push({ BONZO_API_KEY: 't', BONZO_CAMPAIGN_ID: '999' }).tags).toEqual(expect.arrayContaining([
      'adu', 'HELOC/cash-out interest', 'purpose:rental-adu', 'licensed-state', 'state:CA',
    ]));
  });

  it('enrolls into the default campaign until BONZO_ADU_CAMPAIGN_ID is set', () => {
    expect(push({ BONZO_API_KEY: 't', BONZO_CAMPAIGN_ID: '999' }).url).toMatch(/\/campaign\/999$/);
    expect(push({ BONZO_API_KEY: 't', BONZO_CAMPAIGN_ID: '999', BONZO_ADU_CAMPAIGN_ID: '777' }).url).toMatch(/\/campaign\/777$/);
  });
});

function view(over: Partial<AduPageView> = {}): AduPageView {
  return {
    step: 1, goStep: noop,
    homeValue: '', setHomeValue: noop, mtgBalance: '', setMtgBalance: noop,
    projectCost: '', setProjectCost: noop, toFinance: '', setToFinance: noop,
    hv: 0, mb: 0, cost: 0, fin: 0, hasHome: false, equity: 0, ltv: 0, cltv: 0, gap: 0,
    purpose: '', setPurpose: noop,
    fname: '', setFname: noop, lname: '', setLname: noop, phone: '', setPhone: noop,
    email: '', setEmail: noop, emailHint: null, setEmailHint: noop, usState: '', setUsState: noop,
    sending: false, submitted: false, submitLead: noop, openCalendly: noop,
    ...over,
  };
}

const filled = view({
  homeValue: '650000', mtgBalance: '350000', projectCost: '175000', toFinance: '75000',
  hv: 650000, mb: 350000, cost: 175000, fin: 75000, hasHome: true,
  equity: 300000, ltv: 53.8, cltv: 65.4, gap: 100000, purpose: 'Rental ADU',
});

describe('what the page says', () => {
  it('the hero is the only <h1>, carries no phone number and needs no JavaScript', () => {
    const hero = html(<AduPageHero />);
    expect(hero.match(/<h1\b/g)).toHaveLength(1);
    expect(hero).not.toMatch(/tel:|<button\b/);
    expect(hero).toContain('href="#project"');
  });

  it('arrives empty: no figure, no project type chosen, every number an example', () => {
    const page = html(<StepAduProject v={view()} />);
    expect(page).not.toContain('Estimated Home Equity');
    expect(page).not.toContain('Requested project financing');
    expect(page).not.toContain('aria-pressed="true"');
    for (const p of page.match(/placeholder="[^"]*"/g) ?? []) {
      if (/\d/.test(p)) expect(p).toMatch(/placeholder="e\.g\. /);
    }
  });

  it('says what the financing leaves of the budget, or adds beyond it', () => {
    expect(html(<StepAduProject v={filled} />)).toContain('remaining $100,000 of the budget needs a separate plan');
    expect(html(<StepAduProject v={{ ...filled, gap: -25000 }} />)).toContain('$25,000 more than the estimated project cost');
  });

  it('keeps financing and feasibility apart, and quotes no payment or approval', () => {
    const page = html(<StepAduProject v={filled} />);
    expect(page).toContain('Financing does not confirm the ADU can be built or rented.');
    expect(page).not.toMatch(/\/mo\b|you qualify|pre-?approved|\bAPR\b/i);
  });

  it('flags an amount past the 85% CLTV lenders commonly use', () => {
    expect(html(<StepAduProject v={filled} />)).not.toContain('above the 85%');
    expect(html(<StepAduProject v={{ ...filled, cltv: 90.1 }} />)).toContain('above the 85% combined loan-to-value');
  });

  it('asks only for contact details, and says the request confirms no permit', () => {
    const page = html(<StepAduContact v={view({ step: 2 })} />);
    expect(page).not.toMatch(/Best Time|How did you hear/i);
    expect(page).toContain('does not confirm permits or feasibility');
  });

  it('confirms with the project it sent, and promises no time', () => {
    const page = html(<AduRecap v={{ ...filled, submitted: true }} />);
    expect(page).toContain('Your request has been received.');
    expect(page).toContain('Rental ADU');
    expect(page).toContain('$175,000');
    expect(page).toContain('$75,000');
    expect(page).not.toMatch(/business day|shortly|has reviewed/i);
  });

  it('keeps id="project" on the flow, which the hero button scrolls to', () => {
    expect(html(<AduPage v={view()} overlays={null} disclosure={null} />)).toContain('id="project"');
  });
});

describe('the pre-rendered /adu/ shell', () => {
  const TAIL = '</section></main>';

  it('holds the nav and the hero, and is exactly the start of what the app renders', async () => {
    const { renderAduShell } = await import('../src/prerender');
    const { default: AduApp } = await import('../src/AduApp');
    const shell = renderAduShell();
    expect(shell.startsWith('<nav')).toBe(true);
    expect(shell.match(/<h1\b/g)).toHaveLength(1);
    expect(shell.endsWith(TAIL)).toBe(true);
    expect(html(<AduApp />).startsWith(shell.slice(0, -TAIL.length))).toBe(true);
    for (const b of (shell.match(/<button\b[^>]*>/g) ?? []).filter((x) => !/tabindex="-1"/.test(x))) {
      expect(b).toContain('data-early=');
    }
  });

  it('is built, pre-rendered, canonical, in the sitemap, with the shared early-click script and its own modal source', () => {
    expect(read('vite.config.ts')).toContain("'/adu/index.html': 'renderAduShell'");
    expect(read('vite.config.ts')).toContain("adu: 'adu/index.html'");
    const page = read('adu/index.html');
    expect(page).toContain('<link rel="canonical" href="https://realdarrentsai.com/adu/" />');
    expect(read('public/sitemap.xml')).toContain('<loc>https://realdarrentsai.com/adu/</loc>');
    const script = (f: string) => /<script>\s*(\(function \(\) \{[\s\S]*?__dtEarlyClick[\s\S]*?\}\)\(\);)\s*<\/script>/.exec(read(f))?.[1];
    expect(script('adu/index.html')).toBeDefined();
    // Checkout line endings can differ; changes to the script itself must not.
    expect(script('adu/index.html')?.replace(/\r\n/g, '\n'))
      .toBe(script('index.html')?.replace(/\r\n/g, '\n'));
    expect(read('src/AduApp.tsx')).toContain('leadSource="adu-contact"');
  });

  it('has /yt/adu and /yt/adu-c short links, as 302s with their UTMs', () => {
    for (const from of ['/yt/adu', '/yt/adu-c']) {
      const response = youtubeRedirect(new Request(`https://realdarrentsai.com${from}`));
      const url = new URL(response.headers.get('Location')!);
      expect(url.pathname).toBe('/adu/');
      expect(url.searchParams.get('utm_campaign')).toBe('yt-adu');
      expect(response.status).toBe(302);
    }
  });
});
