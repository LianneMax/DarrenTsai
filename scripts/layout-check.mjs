/**
 * The real-browser layout check: every page, every width, in Chromium.
 *
 * WHY THIS IS NOT IN `npm test`. The R8 round asked for a test that loads each
 * page at nine widths and fails when the page is wider than the screen. That
 * cannot be done in jsdom, which has no layout engine: every box is 0x0 and both
 * `scrollWidth` and `clientWidth` are 0 at every width, so the test would have
 * passed on the code that was demonstrably broken. `tests/layout-overflow.test.ts`
 * pins the RULES that caused each overflow, which is what a source scan can do;
 * this is the measurement, which is what actually finds the next one.
 *
 * It stays out of `npm test` and the Netlify build on purpose. It needs a
 * browser binary and a build, takes the better part of a minute, and a deploy
 * that fails because a machine has no Chromium is a worse outcome than a layout
 * bug. Run it by hand before pushing anything that touches a page or the CSS:
 *
 *     npm run test:layout
 *
 * WHAT IT CATCHES, measured on 28 Sep. Run against caa65ca, the commit before
 * the R8 fixes, it reported every bug found by hand that round and nothing else:
 * the clipped header button at 320 and 360px, the DSCR card at 320px, the
 * licensed strip at 850px, the FHA form and the reviews carousel, and the 14.4px
 * search box. Against 80b21e4 it is silent.
 *
 * WHY THIRD PARTIES ARE BLOCKED. Every request that is not localhost is aborted,
 * so a run means the same thing on every machine and on a bad connection. With
 * HubSpot, CallRail and Google Fonts left in, a failure could be theirs and a
 * pass could depend on their being up. The cost is that text is laid out in
 * fallback fonts, so this measures the page's own structure rather than its exact
 * line breaks; that is the right trade for a check whose job is to find an
 * element hanging off the right edge.
 */
import { chromium, devices } from 'playwright';
import { spawn } from 'node:child_process';

const PORT = 4173;
const BASE = `http://localhost:${PORT}`;
const PAGES = ['/', '/about/', '/home-equity/?goal=payoff', '/home-equity/', '/adu/', '/mortgage-calculator/', '/dscr/', '/fha/', '/realestateinvesting/', '/book/', '/privacy-policy/', '/legal/', '/out-of-market-primary/', '/out-of-market-dscr/'];

/**
 * 320 to 414 are phones, 320 and 360 being where R8-4 was found (360px is the
 * most common Android width). 850 is the middle of the band where the FHA form
 * and the licensed strip overflowed, and 1440 is a common laptop width.
 */
const WIDTHS = [320, 360, 375, 414, 768, 850, 1024, 1280, 1440];
const PHONE_MAX = 768;

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
  shell: true,
  stdio: 'ignore',
});

/**
 * On Windows `npx` is a batch file wrapping the real node process, so killing
 * the child leaves vite holding the port and the next run fails on --strictPort.
 * taskkill /T takes the tree.
 */
function stopServer() {
  if (process.platform === 'win32') spawn('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore' });
  else server.kill();
}

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(BASE + '/')).ok) return;
    } catch {
      // Not up yet. 30s in total is far more than a preview server needs.
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('vite preview did not start on ' + BASE);
}

/**
 * Measured inside the page.
 *
 * `position:fixed` elements are skipped in the list of offenders, not in the
 * verdict: the sticky bars are fixed and sit outside the flow, so they are
 * usually a symptom of the real overflow rather than its cause. The verdict
 * still comes from scrollWidth, which counts everything.
 */
function measure() {
  const vw = document.documentElement.clientWidth;
  const sw = document.documentElement.scrollWidth;
  const over = sw > vw
    ? [...document.querySelectorAll('body *')]
        .filter((e) => {
          const b = e.getBoundingClientRect();
          return b.width > 0 && b.right > vw + 0.5 && getComputedStyle(e).position !== 'fixed';
        })
        .slice(0, 3)
        .map((e) => `${e.tagName}.${String(e.className).slice(0, 30)} right=${Math.round(e.getBoundingClientRect().right)}`)
    : [];
  // Fields only, and only the ones a visitor can focus: iOS zooms the page when
  // a focused field is under 16px. A range slider and a checkbox never take
  // text, so their size is not what triggers it.
  const small = [...document.querySelectorAll('input:not([type=hidden]):not([type=range]):not([type=checkbox]),select,textarea')]
    .filter((e) => parseFloat(getComputedStyle(e).fontSize) < 16)
    .map((e) => `${e.id || e.placeholder || e.tagName}:${getComputedStyle(e).fontSize}`);
  return { vw, sw, over, small: [...new Set(small)] };
}

const failures = [];
let browser;
let checks = 0;

try {
  await waitForServer();
  browser = await chromium.launch();

  for (const width of WIDTHS) {
    const phone = width < PHONE_MAX;
    const ctx = await browser.newContext({
      viewport: { width, height: phone ? 780 : 900 },
      isMobile: phone,
      hasTouch: phone,
      deviceScaleFactor: 1,
      userAgent: phone ? devices['Pixel 5'].userAgent : undefined,
    });
    // Everything off this origin is aborted: see the header comment.
    await ctx.route((url) => !url.href.startsWith(BASE), (route) => route.abort());
    const page = await ctx.newPage();

    for (const path of PAGES) {
      await page.goto(BASE + path, { waitUntil: 'domcontentloaded' });
      // The reveal animations and the carousel both settle within this, and the
      // landing pages build their state dropdowns from script on load.
      await page.waitForTimeout(900);
      const r = await page.evaluate(measure);
      checks++;

      // The shared heading rule once overrode the closing band's inherited
      // white text. Overflow checks passed while the headline lost contrast.
      // Measure the rendered color so that CSS cascade regression fails here.
      const closingColors = await page.locator('.closing h2').evaluateAll(
        nodes => nodes.map(node => getComputedStyle(node).color),
      );
      if (closingColors.some(color => color !== 'rgb(255, 255, 255)')) {
        failures.push(`${width}px ${path}: closing headline must be white, got ${closingColors.join(', ')}`);
      }

      if (r.sw > r.vw) {
        failures.push(`${width}px ${path}: page is ${r.sw}px wide on a ${r.vw}px screen. ${r.over.join(', ')}`);
      }
      if (phone && r.small.length) {
        failures.push(`${width}px ${path}: fields under 16px (iOS zooms on focus): ${r.small.join(', ')}`);
      }
      if (await page.locator('#contactOverlay, .modal-overlay[aria-labelledby="modal-title"]').count()) failures.push(`${path}: retired contact form still mounted`);
      // Check real CTA behavior as well as dimensions: the old equity link
      // reloaded this page and the contact action opened an unrelated form.
      if (width === 1280 && path !== '/book/') {
        const book = page.getByRole('button', { name: 'Book a Call', exact: true });
        for (const button of await book.all()) {
          if (!await button.isVisible()) continue;
          await button.click();
          await page.locator('.dt-book-overlay .dt-book-card [data-q="bookingGoal"]').waitFor({ state: 'visible' });
          const actionColor = await page.locator('.dt-book-overlay .dt-book-next').evaluate(node => getComputedStyle(node).color);
          if (actionColor !== 'rgb(255, 255, 255)') failures.push(`${path}: booking action text must be white, got ${actionColor}`);
          await page.locator('.dt-book-overlay').getByRole('button', { name: 'Close', exact: true }).click();
          checks++;
        }
        if (path === '/home-equity/') {
          let navigations = 0;
          const countNavigation = () => { navigations++; };
          page.on('domcontentloaded', countNavigation);
          await page.getByRole('link', { name: 'Find my starting point' }).click();
          if (!page.url().endsWith('#equity') || navigations) failures.push('Equity starting point reloads instead of reaching the calculator');
          page.off('domcontentloaded', countNavigation);
          checks++;
        }
      }
      // Exercise the real screened flow with a local receipt, never a live lead
      // or appointment. Google is blocked like every external host; the frame
      // bounds, accessible title and working fallback still belong to this site.
      if (path === '/book/' && [320, 1280].includes(width)) {
        await page.route('**/api/lead', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }));
        const card = page.locator('#dt-book-mount .dt-book-card');
        const bookingGoal = width === 320 ? 'not-sure' : 'equity';
        await card.locator('[data-q="bookingGoal"] [data-value="' + bookingGoal + '"]').click();
        if (bookingGoal === 'not-sure') {
          await card.getByRole('button', { name: 'Continue', exact: true }).click();
          if (!await card.getByText('Please tell Darren a little about your situation.', { exact: true }).isVisible()) failures.push('Missing not-sure explanation gate');
          await card.locator('#dt-book-situation').fill('I need help comparing refinancing with using my equity.');
          const noteLayout = await page.evaluate(measure);
          if (noteLayout.sw > noteLayout.vw || noteLayout.small.length) failures.push('Not-sure explanation field does not fit a phone');
        }
        await card.getByRole('button', { name: 'Continue', exact: true }).click();
        await card.locator('[data-book="state"]').selectOption('CA');
        await card.locator('[data-q="propertyUse"] [data-value="primary"]').click();
        await card.getByRole('button', { name: 'Continue', exact: true }).click();
        await card.locator('[data-q="propertyType"] [data-value="single-family-condo"]').click();
        await card.getByRole('button', { name: 'Continue', exact: true }).click();
        await card.locator('[data-q="mortgageCurrent"] [data-value="yes"]').click();
        await card.locator('[data-q="recentBankruptcyForeclosure"] [data-value="no"]').click();
        await card.getByRole('button', { name: 'Continue', exact: true }).click();
        await card.locator('[name="firstName"]').fill('TEST');
        await card.locator('[name="lastName"]').fill('Layout');
        await card.locator('[name="email"]').fill('layout@example.com');
        await card.locator('[name="phone"]').fill('7145550193');
        await card.getByRole('button', { name: 'Review preferences', exact: true }).click();
        await card.locator('[name="privacy"]').check();
        await card.getByRole('button', { name: "See Darren's calendar", exact: true }).click();
        const frame = card.locator('iframe[title="Book a qualification call with Darren Tsai"]');
        await frame.waitFor({ state: 'attached' });
        const bounds = await frame.boundingBox();
        const saved = await page.evaluate(measure);
        checks++;
        if (!bounds || bounds.x < 0 || bounds.x + bounds.width > width || saved.sw > saved.vw) failures.push(width + 'px booking calendar overflows');
        if (!await card.getByRole('link', { name: 'Open calendar in a new tab', exact: true }).isVisible()) failures.push(width + 'px booking recovery link missing');
        if (!(await frame.getAttribute('src')).startsWith('https://calendar.google.com/calendar/appointments/schedules/')) failures.push('Wrong booking provider');
      }
      // An empty first screen cannot expose an APR popover overflowing a phone.
      // Exercise the real calculated state and its editable-fee explanation.
      if (path === '/mortgage-calculator/' && width < 600) {
        const reject = page.getByRole('button', { name: 'Reject optional', exact: true });
        if (await reject.isVisible()) await reject.click();
        await page.getByRole('textbox', { name: 'Loan Amount', exact: true }).fill('330000');
        await page.getByRole('spinbutton', { name: 'Annual Interest Rate', exact: true }).fill('4');
        await page.getByLabel('About this estimated APR', { exact: true }).click();
        await page.getByLabel('Prepaid finance charges ($)', { exact: true }).fill('4000');
        const bounds = await page.locator('.apr-tooltip').boundingBox();
        const active = await page.evaluate(measure);
        checks++;
        if (!bounds || bounds.x < 0 || bounds.x + bounds.width > width || active.sw > active.vw) {
          failures.push(`${width}px ${path}: calculated APR explanation overflows the viewport`);
        }
        if (active.small.length) failures.push(`${width}px ${path}: APR fields under 16px`);
        if (!await page.getByText('4.10%', { exact: true }).isVisible()) failures.push(`${width}px ${path}: APR did not update with entered charges`);
      }
    }

    await ctx.close();
  }
} finally {
  // Both, always, including on a throw: a leaked browser or a held port makes
  // the next run fail for a reason that has nothing to do with the layout.
  if (browser) await browser.close();
  stopServer();
}

if (failures.length) {
  console.error(failures.join('\n'));
  console.error(`\n${failures.length} layout failure(s) across ${checks} checks.`);
  process.exit(1);
}
console.log(`Layout OK: ${PAGES.length} pages x ${WIDTHS.length} widths (${checks} checks), no sideways scroll, no field under 16px on phones.`);
