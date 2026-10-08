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
 * Calendly, CallRail and Google Fonts left in, a failure could be theirs and a
 * pass could depend on their being up. The cost is that text is laid out in
 * fallback fonts, so this measures the page's own structure rather than its exact
 * line breaks; that is the right trade for a check whose job is to find an
 * element hanging off the right edge.
 */
import { chromium, devices } from 'playwright';
import { spawn } from 'node:child_process';

const PORT = 4173;
const BASE = `http://localhost:${PORT}`;
const PAGES = ['/', '/debt-consolidation/', '/mortgage-calculator/', '/dscr/', '/fha/', '/realestateinvesting/'];

/**
 * 320 to 414 are phones, 320 and 360 being where R8-4 was found (360px is the
 * most common Android width). 850 is the middle of the band where the FHA form
 * and the licensed strip overflowed, and 1440 is where Calendly switches to its
 * two-column layout.
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

      if (r.sw > r.vw) {
        failures.push(`${width}px ${path}: page is ${r.sw}px wide on a ${r.vw}px screen. ${r.over.join(', ')}`);
      }
      if (phone && r.small.length) {
        failures.push(`${width}px ${path}: fields under 16px (iOS zooms on focus): ${r.small.join(', ')}`);
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
