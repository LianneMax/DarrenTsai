/**
 * Bing Webmaster Tools flagged "Meta Description too long or too short" on
 * every indexed page (28 Nov 2026): it wants 25 to 160 characters, and eight
 * pages ran 165 to 224. Search engines cut a longer one off mid-sentence.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const pages = [
  'index.html', 'home-equity/index.html', 'adu/index.html', 'mortgage-calculator/index.html', 'about/index.html',
  'public/dscr/index.html', 'public/fha/index.html', 'public/realestateinvesting/index.html',
  'public/privacy-policy/index.html', 'public/legal/index.html',
];

describe('meta descriptions', () => {
  it.each(pages)('%s has one between 25 and 160 characters', (page) => {
    const html = readFileSync(resolve(__dirname, '..', page), 'utf8');
    const found = [...html.matchAll(/<meta name="description" content="([^"]*)"/g)].map((m) => m[1]);
    expect(found).toHaveLength(1);
    expect(found[0].length).toBeGreaterThanOrEqual(25);
    expect(found[0].length).toBeLessThanOrEqual(160);
  });
});
