/**
 * The metric-matched fallback for Outfit (audit L11).
 *
 * Since L10 every page paints before Outfit has arrived. In plain Arial the
 * hero headline takes different lines, so it re-flowed when the font swapped in
 * and pushed everything under it down: CLS 0.106 on the homepage at phone width
 * with the font held back a second. 'Outfit Fallback' is Arial resized to the
 * space Outfit will take, which makes the swap move nothing.
 *
 * It only works where it is in the stack, and it is the kind of thing that is
 * lost one declaration at a time: a new rule written as `'Outfit', sans-serif`
 * looks right, renders right once the font is in, and quietly brings the shift
 * back for that element. jsdom has no layout, so this cannot measure the shift;
 * it pins the rule, on every page, the way layout-overflow.test.ts does.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';

const ROOT = resolve(__dirname, '..');
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8');

/** Where each of the five pages gets its CSS. `/` and `/mortgage-calculator/` share index.css. */
const CSS_SOURCES = [
  'src/index.css',
  'public/dscr/index.html',
  'public/fha/index.html',
  'public/realestateinvesting/index.html',
];

/** Computed with fontTools from public/fonts/Outfit-*.ttf against Arial. Measurements, not taste. */
const REGULAR = { weight: '100 500', src: "local('Arial')", size: '99.34%', ascent: '100.66%', descent: '26.17%' };
const BOLD = { weight: '600 900', src: "local('Arial Bold'),local('Arial-BoldMT')", size: '94.90%', ascent: '105.37%', descent: '27.40%' };

function fallbackFaces(css: string) {
  return (css.match(/@font-face\{[^}]*\}/g) ?? []).filter((f) => f.includes("font-family:'Outfit Fallback'"));
}

describe.each(CSS_SOURCES)('%s', (file) => {
  const css = read(file);

  it('declares the regular and the bold fallback face, with the measured metrics', () => {
    const faces = fallbackFaces(css);
    expect(faces).toHaveLength(2);
    for (const want of [REGULAR, BOLD]) {
      const face = faces.find((f) => f.includes(`font-weight:${want.weight};`));
      expect(face, `face for weight ${want.weight}`).toBeDefined();
      expect(face).toContain(`src:${want.src};`);
      expect(face).toContain(`size-adjust:${want.size};`);
      expect(face).toContain(`ascent-override:${want.ascent};`);
      expect(face).toContain(`descent-override:${want.descent};`);
      expect(face).toContain('line-gap-override:0%;');
    }
  });

  it('covers every weight the pages use between the two faces, with no gap', () => {
    // 100-500 and 600-900: a weight outside both would get the unadjusted
    // system font, and the swap would shift for that text alone.
    const ranges = fallbackFaces(css).map((f) => /font-weight:(\d+) (\d+);/.exec(f)!.slice(1).map(Number));
    ranges.sort((a, b) => a[0] - b[0]);
    expect(ranges).toEqual([[100, 500], [600, 900]]);
  });

  it('downloads nothing: the fallback is local() only', () => {
    for (const face of fallbackFaces(css)) expect(face).not.toMatch(/url\(/);
  });

  it("puts 'Outfit Fallback' straight after 'Outfit' in every font stack", () => {
    const stacks = css.match(/font-family\s*:\s*[^;}]+/g) ?? [];
    const naming = stacks.filter((s) => /'Outfit'/.test(s) && !/^font-family:'Outfit( Fallback)?'$/.test(s.replace(/\s/g, '')));
    expect(naming.length).toBeGreaterThan(0);
    for (const stack of naming) {
      expect(stack.replace(/\s/g, ''), stack).toMatch(/'Outfit','OutfitFallback',sans-serif$/);
    }
  });
});

describe('outside the stylesheets', () => {
  /** Every .ts/.tsx under src, for a font named in an inline style or a chart prop. */
  function sources(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) return sources(p);
      return /\.tsx?$/.test(name) ? [p] : [];
    });
  }

  it("never names Outfit in a component without the fallback beside it", () => {
    for (const file of sources(resolve(ROOT, 'src'))) {
      const text = readFileSync(file, 'utf8');
      for (const m of text.matchAll(/fontFamily:\s*(["'`])(.*?)\1\s*[,}]/g)) {
        if (!/Outfit/.test(m[2])) continue;
        expect(m[2].replace(/\s/g, ''), `${file}: ${m[0]}`).toBe("'Outfit','OutfitFallback',sans-serif");
      }
    }
  });
});
