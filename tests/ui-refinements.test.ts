/**
 * Small visual fixes Max asked for on 1 Nov 2026.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8');
const LUCIDE_PHONE = 'M13.832 16.568a1 1 0 0 0 1.213-.303';
const OLD_FEATHER_PHONE = 'M22 16.92';

describe('call buttons use the Lucide phone icon', () => {
  it.each(['src/components/PageParts.tsx', 'public/realestateinvesting/index.html'])('%s', (file) => {
    const src = read(file);
    expect(src).toContain(LUCIDE_PHONE);
    // The old path ran to the edge of its box and sat off-centre in the button.
    expect(src).not.toContain(OLD_FEATHER_PHONE);
  });
});

describe('/book/ step row on tablets and phones', () => {
  it('centres each step in its column so the row lines up under the card', () => {
    const css = read('public/booking-chooser.css');
    const tablet = css.slice(css.indexOf('@media(max-width:900px)'), css.indexOf('@media(max-width:520px)'));
    expect(tablet).toMatch(/\.dt-book-progress button\{flex-direction:column;align-items:center;[^}]*text-align:center\}/);
    expect(tablet).toContain('left:calc(50% + 17.5px);right:calc(-50% + 17.5px)');
    expect(css).toContain('left:calc(50% + 14.5px);right:calc(-50% + 14.5px)');
  });

  it('centres the calculator step bars (home equity, payoff, ADU) the same way', () => {
    const css = read('src/components/journey-timeline.css');
    expect(css).toContain('.journey-progress button{flex-direction:column;align-items:center;text-align:center;gap:10px}');
    expect(css).toContain('left:calc(50% + 15px)');
    expect(css).toContain('left:calc(50% + 13.5px)');
  });

  it.each([['public/fha/fha.css', 'fha'], ['public/realestateinvesting/rei.css', 'rei'], ['public/dscr/dscr.css', 'dscr']])(
    'centres the %s guide pop-up step bar', (file, prefix) => {
      const css = read(file);
      expect(css).toContain(`.${prefix}-guide-timeline li { display:block; min-height:66px; text-align:center; }`);
      expect(css).toContain(`.${prefix}-guide-timeline li>span { position:relative; z-index:1; margin:0 auto; }`);
      expect(css).toContain('left:calc(50% + 17.5px); right:calc(-50% + 17.5px)');
    });
});
