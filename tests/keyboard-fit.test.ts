/**
 * Phone keyboard (28 Nov 2026, Max): the field being typed in stays visible.
 * public/keyboard-fit.js runs on touch devices only, marks html.kb-open while a
 * text field has focus, and scrolls the field to the middle of what is left of
 * the screen when it is hidden. Every page loads it, with a viewport tag that
 * lets Chrome on Android shrink the page above the keyboard.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '..');
const SCRIPT = readFileSync(resolve(ROOT, 'public/keyboard-fit.js'), 'utf8');
const PAGES = ['index.html', 'about/index.html', 'adu/index.html', 'home-equity/index.html', 'mortgage-calculator/index.html',
  'public/book/index.html', 'public/dscr/index.html', 'public/fha/index.html', 'public/legal/index.html',
  'public/out-of-market-dscr/index.html', 'public/out-of-market-primary/index.html', 'public/privacy-policy/index.html',
  'public/realestateinvesting/index.html', 'public/404.html'];

function load(coarse: boolean) {
  delete (window as unknown as { __dtKeyboardFit?: boolean }).__dtKeyboardFit;
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('coarse') ? coarse : false }));
  new Function(SCRIPT)();
}

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); document.body.innerHTML = ''; document.documentElement.className = ''; });

describe('every page', () => {
  it.each(PAGES)('%s loads the script and lets the keyboard resize the page', (page) => {
    const html = readFileSync(resolve(ROOT, page), 'utf8');
    expect(html).toContain('<script src="/keyboard-fit.js" defer></script>');
    expect(html).toContain('name="viewport" content="width=device-width, initial-scale=1, interactive-widget=resizes-content"');
  });
});

describe('keyboard-fit.js', () => {
  it('does nothing on a mouse-and-keyboard computer', () => {
    load(false);
    document.body.innerHTML = '<input id="f">';
    document.getElementById('f')!.focus();
    expect(document.documentElement.classList.contains('kb-open')).toBe(false);
  });

  it('marks typing on a phone, scrolls a hidden field into view, and clears the mark after', () => {
    vi.useFakeTimers();
    load(true);
    document.body.innerHTML = '<input id="f"><input type="checkbox" id="c"><button id="b">x</button>';
    const field = document.getElementById('f') as HTMLInputElement;
    const scroll = vi.fn();
    field.scrollIntoView = scroll;
    field.getBoundingClientRect = () => ({ top: 900, bottom: 950, left: 0, right: 100, width: 100, height: 50, x: 0, y: 900, toJSON() {} });
    field.focus();
    expect(document.documentElement.classList.contains('kb-open')).toBe(true);
    vi.advanceTimersByTime(200);
    expect(scroll).toHaveBeenCalledWith({ block: 'center', inline: 'nearest', behavior: 'auto' });
    document.getElementById('b')!.focus();
    vi.advanceTimersByTime(10);
    expect(document.documentElement.classList.contains('kb-open')).toBe(false);
  });

  it('leaves a field alone when it is already visible, and ignores checkboxes', () => {
    vi.useFakeTimers();
    load(true);
    document.body.innerHTML = '<input id="f"><input type="checkbox" id="c">';
    const field = document.getElementById('f') as HTMLInputElement;
    const scroll = vi.fn();
    field.scrollIntoView = scroll;
    field.getBoundingClientRect = () => ({ top: 200, bottom: 250, left: 0, right: 100, width: 100, height: 50, x: 0, y: 200, toJSON() {} });
    field.focus();
    vi.advanceTimersByTime(2000);
    expect(scroll).not.toHaveBeenCalled();
    field.blur();
    document.getElementById('c')!.focus();
    vi.advanceTimersByTime(10);
    expect(document.documentElement.classList.contains('kb-open')).toBe(false);
  });
});
