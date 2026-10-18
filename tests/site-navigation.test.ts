import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const source = readFileSync('public/site-navigation.js', 'utf8');
afterEach(() => { document.body.innerHTML = ''; vi.unstubAllGlobals(); });

describe('the shared static navigation', () => {
  it('keeps the drawer keyboard-safe and opens the screened chooser once', () => {
    const html = readFileSync('public/fha/index.html', 'utf8');
    const parsed = new DOMParser().parseFromString(html, 'text/html');
    document.body.append(parsed.querySelector('.static-navigation')!);
    const open = vi.fn(); vi.stubGlobal('DTBooking', { open });
    new Function(source)();
    const toggle = document.querySelector<HTMLButtonElement>('.nav-hamburger')!;
    const drawer = document.querySelector<HTMLElement>('.nav-mobile-menu')!;
    expect(drawer.getAttribute('aria-hidden')).toBe('true');
    expect(Array.from(drawer.querySelectorAll('a,button')).every(el => el.getAttribute('tabindex') === '-1')).toBe(true);
    toggle.click();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(drawer.getAttribute('aria-hidden')).toBe('false');
    drawer.querySelector<HTMLButtonElement>('button')!.click();
    expect(open).toHaveBeenCalledTimes(1);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(toggle);
    const calculator = document.querySelector<HTMLButtonElement>('.nav-dropdown-trigger')!;
    calculator.click();
    expect(calculator.getAttribute('aria-expanded')).toBe('true');
    calculator.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(calculator.getAttribute('aria-expanded')).toBe('false');
  });

  it('retains restricted-page screening instead of adding a booking bypass', () => {
    for (const slug of ['out-of-market-primary', 'out-of-market-dscr']) {
      const parsed = new DOMParser().parseFromString(readFileSync(`public/${slug}/index.html`, 'utf8'), 'text/html');
      const nav = parsed.querySelector('.static-navigation')!;
      expect(nav).toBeTruthy();
      expect(nav.querySelector('[data-early="nav-contact"],[data-early="nav-book"],.nav-mobile-menu>.btn,a[href^="tel:"]')).toBeNull();
    }
  });
});
