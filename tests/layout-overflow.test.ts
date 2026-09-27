/**
 * The narrow-screen rules that keep a page from scrolling sideways.
 *
 * WHY THIS IS A SOURCE SCAN AND NOT A MEASUREMENT. The R8 round asked for a test
 * that loads each page at eight widths and fails when
 * `documentElement.scrollWidth > clientWidth`. That test cannot exist here:
 * jsdom has no layout engine, so every box is 0x0 and both of those numbers are
 * 0 at every width. Measuring for real needs a browser (Playwright or vitest
 * browser mode), which is a new dependency and a separate decision.
 *
 * So each overflow found on 28 Sep is pinned here as the rule that caused it.
 * That is weaker than a measurement in one way, since it cannot find the NEXT
 * overflow, and stronger in another: it names the cause, so a fix cannot be
 * undone by someone who does not know why the value is what it is. The widths in
 * the comments are the ones the overflow was measured at.
 *
 * All six rules failed before the R8 fixes.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8');

const DSCR = 'public/dscr/index.html';
const FHA = 'public/fha/index.html';
const REI = 'public/realestateinvesting/index.html';
const LANDING = [DSCR, FHA, REI];

describe('nothing is sized against the viewport including its scrollbar', () => {
  /**
   * R8-3, ~8px over at every desktop width on /fha/ and /realestateinvesting/.
   *
   * `.reviews-carousel{width:100vw;left:50%;transform:translateX(-50%)}` is a
   * full-bleed break-out, and 100vw counts the scrollbar while the page's own
   * width does not, so the element ends ~8px past each edge. On these two pages
   * the carousel's parent section is already full width, so width:100% is the
   * same picture without the overhang.
   *
   * src/index.css carries the same rule for the React pages, where the carousel
   * DOES sit inside a padded container and the break-out is doing real work.
   * That copy is left alone: `html` and `body` there set `overflow-x:hidden`,
   * which is why the homepage measures clean, and it cannot be copied onto the
   * landing pages because it breaks their sticky form.
   */
  it.each([FHA, REI])('%s does not size the carousel with 100vw', (page) => {
    const rule = /\.reviews-carousel\{([^}]*)\}/.exec(read(page));
    expect(rule, 'the rule moved').not.toBeNull();
    expect(rule![1]).not.toContain('100vw');
    // The break-out went with it: the parent section is full width already.
    expect(rule![1]).not.toContain('translateX(-50%)');
  });
});

describe('the licensed strip wraps instead of pushing the page wider', () => {
  // R8-2, ~47px over at 850px. The strip is five nowrap items in a nowrap flex
  // row, and it only stacked at 820px, so 821 to ~900px had nowhere to put them.
  it.each([DSCR, FHA])('%s lets .licensed-strip-inner wrap', (page) => {
    const rule = /\.licensed-strip-inner\{([^}]*)\}/.exec(read(page));
    expect(rule, 'the rule moved').not.toBeNull();
    expect(rule![1]).not.toContain('flex-wrap:nowrap');
    expect(rule![1]).toContain('flex-wrap:wrap');
  });
});

describe('the FHA lead form shrinks rather than overflowing', () => {
  // R8-1, page 1043px wide on an 850px screen, form cut off. `1fr` is
  // minmax(auto,1fr), so the column cannot go below its own min-content width
  // and the surplus lands outside the page instead.
  const source = () => read(FHA);

  it('lets both columns shrink below their content', () => {
    const rule = /\.explainer-grid\{([^}]*)\}/.exec(source());
    expect(rule, 'the rule moved').not.toBeNull();
    expect(rule![1]).toContain('minmax(0,1fr)');
    expect(rule![1]).not.toMatch(/grid-template-columns:\s*1fr\s/);
  });

  it('goes single column while there is still room for the form', () => {
    // 460px of form plus a 56px gap needs ~1080px of page before the left
    // column is squeezed to nothing, which is where the breakpoint belongs.
    expect(source()).toMatch(/@media\(max-width:10[0-9]{2}px\)\{[^@]*\.explainer-grid\{grid-template-columns:1fr/);
  });
});

describe('the header buttons fit the narrowest common phone', () => {
  // R8-4, 2px over at 360px and 46px over at 320px. Two buttons pinned to 104px
  // each by an inline style, which no media query can reach.
  it.each([DSCR, FHA])('%s sizes them from their text, not a fixed inline width', (page) => {
    const html = read(page);
    for (const id of ['openContactBtn', 'openCalendlyBtn']) {
      const tag = new RegExp('<button[^>]*id="' + id + '"[^>]*>').exec(html);
      expect(tag, id + ' moved').not.toBeNull();
      expect(tag![0], id + ' still carries an inline width').not.toMatch(/width:\s*\d/);
    }
  });

  it.each([DSCR, FHA])('%s tightens the header on a phone', (page) => {
    expect(read(page)).toMatch(/@media\(max-width:(3[6-9][0-9]|400)px\)\{[^@]*\.site-nav-actions/);
  });
});

describe('no focusable field is small enough to make iOS zoom', () => {
  /**
   * R8-5. Safari zooms the page when a focused input is under 16px, and the
   * visitor has to pinch back out in the middle of a form. Only fields count:
   * `.cselect-option` is a div and never takes focus.
   *
   * src/index.css is in the list because it holds the same state dropdown for
   * the homepage and the calculator, with the same 0.9rem search box.
   */
  const ELEMENT = /(?:^|[\s>+~,])(?:input|textarea|select)\b(?![-_])/;
  const RULE = /([^{}]+)\{([^{}]*font-size\s*:[^{}]*)\}/g;

  it.each([...LANDING, 'src/index.css'])('%s keeps every field at 16px or more', (page) => {
    const small: string[] = [];
    for (const [, selector, body] of read(page).matchAll(RULE)) {
      if (!ELEMENT.test(selector)) continue;
      const size = /font-size\s*:\s*([0-9.]+)(rem|em|px)/.exec(body);
      if (!size) continue;
      const px = size[2] === 'px' ? Number(size[1]) : Number(size[1]) * 16;
      if (px < 16) small.push(selector.trim().replace(/\s+/g, ' ') + ' -> ' + px + 'px');
    }
    expect(small).toEqual([]);
  });
});

describe('the calendar opens on the dates, not on a photo', () => {
  // R8-6. Calendly's own details block takes ~350px of a 585px phone panel, so
  // the visitor scrolls inside the panel to find a day. R6-1 hid it between 780
  // and 1199px; below 780 it was left in.
  it('hides the details block at every width except the two-column layout', () => {
    const source = read('public/booking-chooser.js');
    const guard = /if \(([^)]*)\) parts\.push\('hide_event_type_details=1'\);/.exec(source);
    expect(guard, 'the guard moved').not.toBeNull();
    expect(guard![1]).toContain('w < SIDE_BY_SIDE_MIN');
    // The lower bound is what R8-6 removes: a phone got the block too.
    expect(guard![1]).not.toContain('DETAILS_HIDE_MIN');
  });
});
