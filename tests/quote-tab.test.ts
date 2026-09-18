/**
 * The debt calculator's quote tab.
 *
 * Patch 0003 fixed the noopener bug but proved it with a regex over the
 * component source, which only shows the characters are present. These tests
 * run the branch: a fake window stands in for the browser, so "popup blocked"
 * is an actual code path rather than an assumption.
 */
import { describe, it, expect, vi } from 'vitest';
import { openQuoteTab, deliverQuote } from '../src/utils/quoteTab';

const URL_ = 'https://heloc.saxtonmortgage.com/register?fn=Jane';

/** A stand-in for the tab the browser hands back. */
function fakeTab() {
  return { location: { href: '' }, opener: {} as unknown } as unknown as Window;
}

describe('opening the tab', () => {
  it('opens a blank tab with no features string', () => {
    const open = vi.fn(() => fakeTab());
    openQuoteTab({ open } as unknown as Window);
    expect(open).toHaveBeenCalledWith('', '_blank');
    // A third argument is how the bug got in: any features string containing
    // noopener makes a real browser return null.
    expect(open.mock.calls[0]).toHaveLength(2);
  });

  it('cuts the opener reference by hand', () => {
    const tab = fakeTab();
    openQuoteTab({ open: () => tab } as unknown as Window);
    expect(tab.opener).toBeNull();
  });

  it('returns null when the popup is blocked', () => {
    expect(openQuoteTab({ open: () => null } as unknown as Window)).toBeNull();
  });

  it('returns null instead of throwing when window.open throws', () => {
    const w = { open: () => { throw new Error('blocked'); } } as unknown as Window;
    expect(() => openQuoteTab(w)).not.toThrow();
    expect(openQuoteTab(w)).toBeNull();
  });

  it('still returns the tab if the opener cannot be cleared', () => {
    const tab = { location: { href: '' } } as unknown as Window;
    Object.defineProperty(tab, 'opener', { get: () => null, set: () => { throw new Error('locked'); } });
    expect(openQuoteTab({ open: () => tab } as unknown as Window)).toBe(tab);
  });
});

describe('delivering the quote', () => {
  it('points the opened tab at the quote', () => {
    const tab = fakeTab();
    expect(deliverQuote(tab, URL_)).toBe('tab');
    expect(tab.location.href).toBe(URL_);
  });

  it('asks for a manual click when there is no tab', () => {
    expect(deliverQuote(null, URL_)).toBe('manual');
  });

  it('asks for a manual click when the tab was closed', () => {
    const tab = {} as Window;
    Object.defineProperty(tab, 'location', { get: () => { throw new Error('closed'); } });
    expect(deliverQuote(tab, URL_)).toBe('manual');
  });

  /**
   * The bug this whole module exists for. The old code did
   * `window.location.href = helocUrl` whenever quoteTab was null, which was
   * every single time, so every visitor was sent to Saxton mid-journey.
   */
  it('never navigates the current tab', () => {
    // Assigning window.location.href in jsdom is a no-op that logs "Not
    // implemented: navigation", so reading the href back proves nothing. Trap
    // the setter instead, or this test passes against the original bug.
    let navigatedTo: string | null = null;
    const original = Object.getOwnPropertyDescriptor(window, 'location')!;
    Object.defineProperty(window, 'location', {
      configurable: true,
      get: () => ({
        get href() { return 'https://realdarrentsai.com/'; },
        set href(v: string) { navigatedTo = v; },
      }),
    });
    try {
      expect(deliverQuote(null, URL_)).toBe('manual');
    } finally {
      Object.defineProperty(window, 'location', original);
    }
    expect(navigatedTo).toBeNull();
  });
});
