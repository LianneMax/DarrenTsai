/** Real-browser regression gate for the mortgage presentation.
 * Start Vite, then: node scripts/mortgage-journey-check.mjs http://127.0.0.1:5194
 * External requests are blocked and every lead receipt is intercepted locally.
 * This never creates a real lead, sends email or books an appointment.
 */
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const base = process.argv[2] || 'http://127.0.0.1:5194';
assert(['127.0.0.1', 'localhost'].includes(new URL(base).hostname), 'Use a local preview only.');
const output = '.local-notes/mortgage-journey';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
let checks = 0;
const money = n => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Math.round(n));

async function open(width = 1440) {
  const page = await browser.newPage({ viewport: { width, height: width < 500 ? 844 : 1000 }, reducedMotion: 'reduce' });
  const errors = [], requests = [], posts = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', r => requests.push(r.url()));
  await page.route('**/*', r => {
    if (new URL(r.request().url()).origin !== base || r.request().method() === 'POST') return r.abort();
    return r.continue();
  });
  await page.goto(base + '/mortgage-calculator/?utm_source=verification&utm_medium=local-test&utm_campaign=mortgage-ui');
  await page.waitForFunction(() => window.DTBooking);
  const reject = page.getByRole('button', { name: 'Reject optional', exact: true });
  if (await reject.isVisible()) {
    await Promise.all([page.waitForEvent('domcontentloaded'), reject.click()]);
    await page.waitForFunction(() => window.DTBooking);
  }
  await page.evaluate(() => document.fonts.ready);
  return { page, errors, requests, posts };
}

async function fill(page, { amount = 330000, rate = 6.41, term = 30, month = 9, year = new Date().getFullYear() } = {}) {
  await page.getByLabel('Loan Amount', { exact: true }).fill(String(amount));
  await page.getByLabel('Annual Interest Rate', { exact: true }).fill(String(rate));
  await page.getByLabel('Loan Term', { exact: true }).selectOption(String(term));
  await page.getByLabel('Start month', { exact: true }).selectOption(String(month));
  await page.getByLabel('Start year', { exact: true }).selectOption(String(year));
  const r = rate / 1200, n = term * 12;
  const payment = amount * r / (1 - (1 + r) ** -n);
  const expected = [money(payment), money(payment * n - amount), money(payment * n),
    new Date(year, month - 1 + n - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })];
  await page.waitForFunction(values => {
    const actual = [...document.querySelectorAll('.stat-value')].map(e => e.textContent);
    return actual.length === 4 && actual.every((v, i) => v === values[i]);
  }, expected);
  checks += 4;
  return expected;
}

async function layout(page, width) {
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), `${width}px page overflows`);
  assert(await page.locator('.mortgage-calculator input,.mortgage-calculator select').evaluateAll(es => es.every(e => parseFloat(getComputedStyle(e).fontSize) >= 16)));
  assert.equal(await page.locator('h1').count(), 1);
  assert.equal(await page.locator('.apr-info summary').evaluate(e => getComputedStyle(e, '::after').content).catch(() => 'none'), 'none');
  checks += 4;
}

try {
  const normal = await open();
  const p = normal.page;
  assert.equal(await p.getByLabel('Loan Amount', { exact: true }).inputValue(), '');
  assert.equal(await p.getByLabel('Annual Interest Rate', { exact: true }).inputValue(), '');
  assert.equal(await p.locator('.stats-grid,.chart-wrapper,.table-wrapper').count(), 0);
  assert(!normal.requests.some(u => u.includes('/AmortizationChart.')));
  checks += 4;
  for (const scenario of [
    { amount: 330000, rate: 6.41, term: 30, month: 9 },
    { amount: 600000, rate: 6.5, term: 20, month: 1 },
    { amount: 250000, rate: 5.5, term: 15, month: 12 },
    { amount: 100000, rate: 8, term: 10, month: 6 },
    { amount: 1000000, rate: .1, term: 30, month: 10 },
    { amount: 400000, rate: 30, term: 10, month: 2 },
  ]) await fill(p, scenario);
  await fill(p);
  await p.locator('.chart-wrapper').waitFor();
  assert.equal(await p.locator('.chart-legend-item').count(), 3);
  checks++;

  await p.locator('.apr-info summary').click();
  const fee = p.getByLabel('Prepaid finance charges ($)', { exact: true });
  await fee.fill('2000');
  assert(Number(await p.locator('.apr-estimate').getAttribute('data-apr-result')) > 6.41);
  assert.equal(await p.locator('.stat-value').first().innerText(), '$2,066');
  await fee.fill('330000');
  assert(await p.getByRole('alert', { name: '' }).filter({ hasText: 'Enter fees below the loan amount.' }).isVisible());
  await fee.fill('');
  assert.equal(await p.locator('.apr-number').innerText(), '6.41%');
  await p.locator('.apr-info summary').click();
  checks += 4;

  await p.getByRole('button', { name: 'View Full Payment Schedule', exact: true }).click();
  const currentYear = new Date().getFullYear();
  assert.equal(await p.locator('.year-summary-row').count(), 31);
  await p.getByRole('button', { name: `Show monthly payments for ${currentYear}`, exact: true }).press('Enter');
  assert.equal(await p.locator('.amort-table tbody tr:not(.year-summary-row)').count(), 4);
  const all = p.getByRole('switch', { name: 'Expand all years', exact: true });
  await all.press('Space');
  assert.equal(await all.getAttribute('aria-checked'), 'true');
  assert.equal(await p.locator('.amort-table tbody tr:not(.year-summary-row)').count(), 360);
  assert.match(await p.locator('.amort-table tbody tr').last().innerText(), /Aug.*\$0/);
  const scheduleBounds = await p.locator('.table-collapsible').evaluate(el => ({
    bottom: el.getBoundingClientRect().bottom,
    lastPaymentBottom: el.querySelector('tbody tr:last-child').getBoundingClientRect().bottom,
  }));
  assert(scheduleBounds.lastPaymentBottom <= scheduleBounds.bottom + 1, 'The last payment must not be clipped by a fixed panel height.');
  await all.press('Space');
  assert.equal(await p.locator('.amort-table tbody tr:not(.year-summary-row)').count(), 0);
  await p.locator('.year-summary-row').first().click();
  assert.equal(await p.locator('.amort-table tbody tr:not(.year-summary-row)').count(), 4);
  await p.getByRole('button', { name: 'Hide Payment Schedule', exact: true }).click();
  assert.equal(await all.isVisible(), false);
  checks += 8;

  await p.waitForFunction(() => JSON.parse(sessionStorage.getItem('dt_mortgage_inputs') || '{}').startMonth === 9);
  await p.reload();
  await p.getByText('$2,066', { exact: true }).waitFor();
  assert.equal(await p.getByLabel('Loan Amount', { exact: true }).inputValue(), '330,000');
  assert.equal(await p.getByLabel('Annual Interest Rate', { exact: true }).inputValue(), '6.41');
  assert.equal(await p.getByLabel('Start month', { exact: true }).inputValue(), '9');
  checks += 3;
  await p.getByLabel('Annual Interest Rate', { exact: true }).fill('0');
  assert.equal(await p.locator('.stats-grid,.chart-wrapper,.table-wrapper').count(), 0);
  await p.getByLabel('Loan Amount', { exact: true }).fill('');
  assert.equal(await p.locator('.stat-value').count(), 0);
  checks += 2;
  assert.deepEqual(normal.errors, []);
  checks++;
  await p.close();

  for (const width of [1440, 768, 390, 320]) {
    const { page, errors } = await open(width);
    await layout(page, width);
    await page.screenshot({ path: `${output}/empty-${width}.png`, fullPage: true });
    await fill(page);
    await page.locator('.chart-wrapper').waitFor();
    await layout(page, width);
    // The existing Recharts lines animate for 1,200ms even in a reduced-motion
    // context. Capture their settled geometry, not a misleading halfway frame.
    await page.waitForTimeout(1300);
    await page.screenshot({ path: `${output}/filled-${width}.png`, fullPage: true });
    await page.locator('.apr-info summary').click();
    await feeFor(page).fill('2000');
    await layout(page, width);
    await page.screenshot({ path: `${output}/apr-${width}.png`, fullPage: false });
    await page.locator('.apr-info summary').click();
    await page.getByRole('button', { name: 'View Full Payment Schedule', exact: true }).click();
    await layout(page, width);
    assert(await page.locator('.table-scroll').isVisible());
    assert.deepEqual(errors, []);
    checks += 2;
    console.log(`PASS ${width}px: empty, populated, APR popover, schedule and 16px fields.`);
    await page.close();
  }

  for (const mode of ['retry', 'uncertain']) {
  const booking = await open(390);
  await fill(booking.page);
  await booking.page.route('**/api/lead', async route => {
    booking.posts.push(route.request().postDataJSON());
    if (mode === 'retry' && booking.posts.length === 1) return route.abort('connectionfailed');
    await route.fulfill({ status: mode === 'uncertain' ? 502 : 200, contentType: 'application/json', body: mode === 'uncertain' ? '{"error":"unconfirmed"}' : '{"ok":true}' });
  });
  await booking.page.locator('.calc-cta').click();
  const shell = booking.page.locator('.dt-book-overlay .dt-book-shell');
  const next = () => shell.locator('.dt-book-next').click();
  await shell.locator('[data-q=bookingGoal] [data-value=own-home]').click(); await next();
  await shell.locator('[data-book=state]').selectOption('CA');
  await shell.locator('[data-q=propertyUse] [data-value=primary]').click(); await next();
  await shell.locator('[data-q=propertyType] [data-value=single-family-condo]').click(); await next();
  await shell.locator('[data-q=mortgageCurrent] [data-value=yes]').click();
  await shell.locator('[data-q=recentBankruptcyForeclosure] [data-value=no]').click(); await next();
  for (const [key, value] of Object.entries({ firstName: 'TEST', lastName: 'Mortgage UI', email: 'mortgage-ui@example.com', phone: '7145550197' })) await shell.locator(`[name=${key}]`).fill(value);
  await next();
  assert.equal(await shell.locator('[name=smsInfo]').isChecked(), false);
  assert.equal(await shell.locator('[name=smsMarketing]').isChecked(), false);
  await next();
  assert.match(await shell.locator('.dt-book-err').innerText(), /Privacy Policy/);
  assert.equal(booking.posts.length, 0);
  await shell.locator('[name=privacy]').check(); await next();
  if (mode === 'retry') {
    await shell.locator('.dt-book-err').getByText(/could not reach/).waitFor();
    assert.equal(await shell.locator('iframe').count(), 0);
    assert.equal(booking.posts.length, 1);
    // The transport failure leaves an explicit retry on the same consent screen.
    await next();
    await shell.locator('.dt-book-frame iframe').waitFor({ state: 'attached' });
    assert.equal(booking.posts.length, 2);
    checks += 3;
  } else {
    await shell.getByRole('heading', { name: 'We couldn’t confirm your request', exact: true }).waitFor();
    assert.equal(await shell.locator('iframe').count(), 0);
    assert.doesNotMatch(await shell.innerText(), /your details reached Darren/);
    assert.match(await shell.innerText(), /do not submit again immediately/);
    assert.equal(booking.posts.length, 1);
    checks += 4;
  }
  checks += 4;
  assert.equal(booking.posts[0].source, 'mortgage-review');
  assert.equal(booking.posts[0].formId, 'booking-prequal');
  assert.equal(booking.posts[0].entrySource, 'mortgage-calculator-contact');
  assert.equal(booking.posts[0].utm_campaign, 'mortgage-ui');
  assert.equal(booking.posts[0].privacyAcknowledged, true);
  assert.equal(booking.posts[0].smsMarketingConsent, false);
  checks += 6;
  assert.deepEqual(booking.errors, []);
  checks++;
  await booking.page.close();
  }
  console.log(`PASS ${checks} mortgage journey assertions. All receipts local; no real leads or bookings.`);
} finally {
  await browser.close();
}

function feeFor(page) { return page.getByLabel('Prepaid finance charges ($)', { exact: true }); }
