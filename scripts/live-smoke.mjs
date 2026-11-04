/** Live pre-launch smoke test (4 Nov 2026, for the 9 Nov ads launch).
 *
 * Submits ONE clearly marked TEST lead through each of the seven live forms on
 * realdarrentsai.com, exactly as a visitor would, and checks what the site
 * itself can prove: the /api/lead receipt (saved to the durable inbox and
 * recognised as a TEST), the calendar/recap step that follows, no Ads
 * conversion, and no sideways scroll at phone width.
 *
 * It CREATES REAL TEST LEADS. They go to the Sheet, the follow-up queue and
 * the confirmation/guide emails (HubSpot skips TEST leads). TEST leads are kept
 * until Max authorizes deletion. Seven posts stay under the site's limit of 10
 * per address per 15 minutes; do not run it twice inside that window.
 *
 * Afterwards a person checks the Sheet rows and the emails (the script cannot
 * read either). Run: node scripts/live-smoke.mjs --confirm-live [base-url]
 */
/* global document, window */
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

if (!process.argv.includes('--confirm-live')) {
  console.error('This creates real TEST leads on the live site. Re-run with --confirm-live.');
  process.exit(2);
}
const base = (process.argv.find(a => a.startsWith('http')) || 'https://realdarrentsai.com').replace(/\/$/, '');
const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
const output = '.local-notes/live-smoke-' + stamp;
await mkdir(output, { recursive: true });

// Reserved 555-01xx numbers and Max's TEST address family: isTestLead() marks
// every one of these, so no Ads conversion and no HubSpot contact.
const kinds = ['equity', 'payoff', 'adu', 'dscr', 'fha', 'rei', 'booking'];
const who = kind => ({
  first: 'TEST', last: 'Smoke ' + kind + ' ' + stamp,
  email: 'liannemaxbalbastro+smoke-' + kind + '-' + stamp + '@gmail.com',
  phone: '71455501' + String(50 + kinds.indexOf(kind)),
  note: 'TEST live smoke ' + stamp + ' (' + kind + '). Synthetic, please retain. No call needed.',
});
const paths = { equity: '/home-equity/', payoff: '/home-equity/?goal=payoff', adu: '/adu/', dscr: '/dscr/', fha: '/fha/', rei: '/realestateinvesting/', booking: '/book/' };
const formIds = { equity: 'home-equity-calculator', payoff: 'debt-savings-calculator', adu: 'adu-calculator', dscr: 'dscr-magnet', fha: 'fha-magnet', rei: 'rei-magnet', booking: 'booking-prequal' };
const query = 'utm_source=verification&utm_medium=retained-test&utm_campaign=live-smoke-' + stamp;

let browser; const results = [];
async function open(path) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  const page = await ctx.newPage(); page.setDefaultTimeout(20000);
  await page.goto(base + path + (path.includes('?') ? '&' : '?') + query);
  // Close the cookie panel: optional tracking stays off, as for a visitor who declines.
  const close = page.getByRole('button', { name: 'Close cookie preferences', exact: true });
  if (await close.isVisible()) await close.click();
  const events = [];
  await page.exposeFunction('recordSmokeEvent', name => events.push(name));
  await page.evaluate(() => { const track = window.DT && window.DT.track; if (window.DT) window.DT.track = function (name, ...args) { window.recordSmokeEvent(name); if (track) track.call(this, name, ...args); }; });
  return { ctx, page, events };
}
async function noSidewaysScroll(page, label) {
  const m = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
  assert.ok(m.scroll <= m.width, label + ' scrolls sideways ' + JSON.stringify(m));
}
const choose = (page, group, name) => page.getByRole('group', { name: group, exact: true }).getByRole('button', { name, exact: true }).click();
async function identity(page, p, prefix = 'lead-') {
  for (const [field, value] of [['fname', p.first], ['lname', p.last], ['email', p.email], ['phone', p.phone]]) await page.locator('#' + prefix + field).fill(value);
}
async function toPreferences(page) { await page.locator('.dcp-actions .dcp-next').click(); await page.getByRole('heading', { name: 'Your preferences.' }).waitFor(); }

const fill = {
  async equity(page, p) {
    await page.locator('#he-value').fill('650000'); await page.locator('#he-balance').fill('300000');
    await choose(page, 'Property type', 'Single family or condo'); await choose(page, 'Property use', 'Primary home');
    await page.locator('#he-zip').fill('92646'); await page.locator('#he-state').selectOption('CA');
    await page.locator('#equity .dcp-panel').getByRole('button', { name: 'Continue', exact: true }).click();
    await choose(page, 'Goal', 'Home improvement'); await choose(page, 'Credit range', '720+'); await choose(page, 'Cash range', '$25k-75k');
    await choose(page, 'Mortgage current', 'Yes'); await choose(page, 'Bankruptcy or foreclosure', 'No');
    await page.locator('#equity .dcp-panel').getByRole('button', { name: 'Continue', exact: true }).click();
    await identity(page, p); await page.locator('#equity-inquiry-message').fill(p.note); await toPreferences(page);
    return { privacy: page.locator('[data-privacy-form="home-equity-calculator"]'), submit: page.locator('#equity .dcp-actions .dcp-next') };
  },
  async payoff(page, p) {
    await page.locator('[id^=debt-type-]').first().click(); await page.getByRole('option', { name: 'Credit Card', exact: true }).click();
    for (const [field, value] of [['balance', '25000'], ['payment', '750'], ['rate', '24.99']]) await page.locator('[id^=debt-' + field + '-]').first().fill(value);
    await page.getByRole('button', { name: 'Continue to Home Info' }).click();
    for (const [i, value] of ['650000', '300000', '1800', '3.5', '24'].entries()) await page.locator('#equity .dcp-panel input[type=number]').nth(i).fill(value);
    await page.locator('#equity [data-property-use]').selectOption('primary'); await page.locator('#equity [data-property-state]').selectOption('CA');
    await page.getByRole('button', { name: 'See My Comparison' }).click();
    assert.equal(await page.locator('.dcp-primary-options > .dcp-option').count(), 3, 'three comparison cards');
    await noSidewaysScroll(page, 'payoff comparison');
    await page.getByRole('button', { name: 'Discuss a HELOC' }).click();
    await identity(page, p, 'payoff-'); await page.locator('#payoff-inquiry-message').fill(p.note); await toPreferences(page);
    return { privacy: page.locator('[data-privacy-form="debt-savings-calculator"]'), submit: page.locator('#equity .dcp-actions .dcp-next') };
  },
  async adu(page, p) {
    await page.getByRole('button', { name: /ADU for family/ }).click(); await page.locator('#adu-cost').fill('175000'); await page.locator('#adu-finance').fill('75000');
    await page.getByRole('button', { name: 'Add my home' }).click(); await page.locator('#adu-value').fill('650000'); await page.locator('#adu-balance').fill('350000');
    await page.locator('#adu-calculator-property-use').selectOption('primary'); await page.locator('#adu-calculator-property-state').selectOption('CA');
    await page.getByRole('button', { name: 'See my snapshot' }).click(); await page.getByRole('button', { name: 'Talk through my plan' }).click();
    await identity(page, p); await page.locator('textarea.inquiry-message, .inquiry-message textarea').fill(p.note);
    await page.locator('.adu-contact-stage .dcp-actions .dcp-next').click();
    return { privacy: page.locator('[data-privacy-form="adu-calculator"]'), submit: page.locator('.adu-contact-stage .dcp-actions .dcp-next') };
  },
  async guide(page, p, kind) {
    const id = formIds[kind]; const prefix = kind === 'rei' ? 'l' : 'm';
    await page.locator(kind === 'dscr' ? '#openModalBtn' : '[data-' + kind + '-guide]').first().click();
    for (const [field, value] of [['Name', p.first + ' ' + p.last], ['Email', p.email], ['Phone', p.phone]]) await page.locator('#' + prefix + field).fill(value);
    const next = page.locator(kind === 'dscr' ? '#guideNext' : '#' + kind + 'GuideNext'); await next.click();
    if (kind === 'rei') await page.locator('[data-property-use="' + id + '"]').selectOption('investment');
    const native = page.locator('#' + prefix + 'State'); await native.locator('..').locator('.cselect-trigger').click();
    await page.locator('.cselect-panel').getByRole('option', { name: await native.locator('option[value="CA"]').textContent(), exact: true }).click();
    if (kind === 'fha') { await page.locator('#mCreditShell .cselect-trigger').click(); await page.locator('.cselect-panel').getByRole('option').first().click(); }
    await next.click(); await page.locator('[data-inquiry-message="' + id + '"]').fill(p.note);
    return { privacy: page.locator('[data-privacy-form="' + id + '"]'), submit: page.locator('#submitLead') };
  },
  async booking(page, p) {
    await page.waitForSelector('.dt-book-card'); const card = page.locator('.dt-book-card');
    const next = () => card.locator('.dt-book-next').click(); const tap = (q, v) => card.locator('[data-q="' + q + '"] [data-value="' + v + '"]').click();
    await tap('bookingGoal', 'equity'); await next(); await tap('propertyUse', 'primary'); await card.locator('[data-book="state"]').selectOption('CA'); await next();
    await tap('propertyType', 'single-family-condo'); await next(); await tap('mortgageCurrent', 'yes'); await tap('recentBankruptcyForeclosure', 'no'); await next();
    for (const [field, value] of [['firstName', p.first], ['lastName', p.last], ['email', p.email], ['phone', p.phone]]) await card.locator('[name="' + field + '"]').fill(value);
    await next(); await card.locator('[name="message"]').fill(p.note);
    return { privacy: card.locator('[name="privacy"]'), submit: card.locator('.dt-book-next') };
  },
};

let failures = 0;
try {
  browser = await chromium.launch();
  for (const kind of kinds) {
    const p = who(kind); const started = Date.now();
    const { ctx, page, events } = await open(paths[kind]);
    try {
      const { privacy, submit } = await (fill[kind] || fill.guide)(page, p, kind);
      await noSidewaysScroll(page, kind + ' contact');
      await privacy.check();
      const posted = page.waitForResponse(r => r.url().endsWith('/api/lead') && r.request().method() === 'POST', { timeout: 30000 });
      await submit.click();
      const response = await posted; const receipt = await response.json();
      assert.equal(response.status(), 200, kind + ' status ' + response.status() + ' ' + JSON.stringify(receipt));
      assert.equal(receipt.ok, true); assert.equal(receipt.receipt, 'saved'); assert.equal(receipt.test, true, 'recognised as a TEST lead');
      assert.equal(JSON.parse(response.request().postData()).formId, formIds[kind]);
      await page.waitForFunction(() => [...document.querySelectorAll('.dcp-recap,.adu-recap,.dt-book-calendar,.dt-book-frame,.dt-book-confirm,.dt-book-success,#modalSuccess,#leadSuccess')].some(el => el.getBoundingClientRect().height > 0), null, { timeout: 30000 });
      assert.equal(events.filter(e => e === 'generate_lead').length, 0, 'TEST lead fired generate_lead');
      await page.screenshot({ path: output + '/' + kind + '.png' });
      results.push({ kind, ok: true, submissionId: receipt.submissionId, storage: receipt.storage, email: p.email, phone: p.phone, seconds: Math.round((Date.now() - started) / 1000) });
      console.log('PASS', kind, receipt.submissionId);
    } catch (error) {
      failures++;
      await page.screenshot({ path: output + '/failure-' + kind + '.png', fullPage: true }).catch(() => {});
      results.push({ kind, ok: false, error: String(error.message).slice(0, 400), email: p.email });
      console.log('FAIL', kind, String(error.message).slice(0, 300));
    } finally { await ctx.close(); }
  }
} finally {
  if (browser) await browser.close();
  await writeFile(output + '/results.json', JSON.stringify({ base, ranAt: new Date().toISOString(), results }, null, 2));
}
console.log(failures ? failures + ' of ' + kinds.length + ' journeys FAILED' : 'Live smoke OK: ' + kinds.length + ' TEST leads saved', '->', output + '/results.json');
process.exit(failures ? 1 : 0);
