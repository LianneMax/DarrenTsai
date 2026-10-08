/**
 * The dropdown panel's placement (src/hooks/useAnchoredPanel.ts).
 *
 * WHY THIS FILE EXISTS. State is required on every lead form, and its dropdown
 * could not be used reliably on a phone. Measured on 8 Oct in Chromium with
 * touch, on step 4 of the debt calculator at 375x812, 320x568 and 375x667:
 * the panel closed the moment the on-screen keyboard resized the window, and
 * closed when the page moved 40px. It always opened downwards, so with the
 * field low on the screen the list hung off the bottom, and the only way to
 * bring it into view was a scroll, which closed it.
 *
 * jsdom has no layout, so it cannot measure any of that. What it can do is pin
 * the rule the fix rests on: where the panel goes for a given trigger and
 * screen, and that neither component closes on scroll or resize any more.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { placePanel } from '../src/hooks/useAnchoredPanel';

const read = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8');

/** A 44px-tall trigger whose top edge is at `top`. */
const trigger = (top: number) => ({ top, bottom: top + 44, left: 16, width: 343 });

describe('where the panel goes', () => {
  it('hangs below the trigger when there is comfortable room', () => {
    const place = placePanel(trigger(300), 812)!;
    expect(place.top).toBe(350); // 6px under the trigger
    expect(place.bottom).toBeUndefined();
    expect(place.left).toBe(16);
    expect(place.width).toBe(343);
  });

  it('opens upwards when the field is low on the screen', () => {
    // The case that could not be used at all: the field just above the sticky
    // bar on a 375x667 phone.
    const place = placePanel(trigger(557), 667)!;
    expect(place.top).toBeUndefined();
    expect(place.bottom).toBe(667 - 557 + 6);
    expect(place.maxHeight).toBe(557 - 6 - 8);
  });

  it('prefers below on a tie, which is where a dropdown is expected', () => {
    const place = placePanel(trigger(262), 568)!; // 248 below, 248 above
    expect(place.top).toBe(312);
  });

  it('is never taller than the room on the side it took', () => {
    for (const vh of [480, 568, 667, 812]) {
      for (let top = 0; top + 44 <= vh; top += 20) {
        const place = placePanel(trigger(top), vh)!;
        const room = place.top !== undefined ? vh - place.top : vh - place.bottom!;
        // 140 is the floor: on a screen with no room either side it may overlap
        // the trigger rather than shrink to nothing.
        if (place.maxHeight > 140) expect(place.maxHeight, `vh ${vh}, top ${top}`).toBeLessThanOrEqual(room);
      }
    }
  });

  it('takes the roomier side when neither is comfortable, as with a keyboard up', () => {
    const place = placePanel(trigger(200), 340)!; // 82 below, 186 above
    expect(place.bottom).toBe(340 - 200 + 6);
    expect(place.maxHeight).toBe(186);
  });

  it('gives up when the trigger has left the screen', () => {
    expect(placePanel(trigger(-80), 667)).toBeNull();
    expect(placePanel(trigger(700), 667)).toBeNull();
  });

  it('but stays while the visitor is typing in it', () => {
    // Tapping the search box raises the keyboard, and the keyboard is what
    // pushes a low trigger off the screen. Closing then would take the list
    // away from someone half way through typing a state.
    const place = placePanel(trigger(700), 400, true)!;
    expect(place.top).toBe(8);
    expect(place.maxHeight).toBe(384);
  });
});

describe.each(['src/components/StateSelect.tsx', 'src/components/CustomSelect.tsx'])('%s', (file) => {
  const src = read(file);

  it('follows its trigger instead of closing on scroll or resize', () => {
    expect(src).toContain('useAnchoredPanel(open, triggerRef, panelRef, closePanel)');
    expect(src).not.toContain("addEventListener('scroll'");
    expect(src).not.toContain("addEventListener('resize'");
  });

  it('takes its position and its height limit from the hook', () => {
    expect(src).toContain('style={{ top: place.top, bottom: place.bottom, left: place.left, width: place.width, maxHeight: place.maxHeight }}');
  });

  it('does not summon the keyboard on a touch screen, or scroll to the search box', () => {
    expect(src).toMatch(/hasFinePointer\(\)\) searchRef\.current\?\.focus\(\{ preventScroll: true \}\)/);
    expect(src).not.toContain('searchRef.current?.focus();');
  });
});

describe('the hook and the stylesheet', () => {
  it('re-measures on the events a phone actually sends', () => {
    const hook = read('src/hooks/useAnchoredPanel.ts');
    expect(hook).toContain("window.addEventListener('scroll', follow, true)");
    expect(hook).toContain("window.addEventListener('resize', follow)");
    // iOS reports the keyboard on visualViewport and does not resize the window.
    expect(hook).toContain("window.visualViewport?.addEventListener('resize', follow)");
    expect(hook).toContain('if (!measure()) close();');
  });

  it('lets the option list, not the search box, give way when the panel is short', () => {
    const css = read('src/index.css');
    const panel = /\.cselect-panel \{([^}]*)\}/.exec(css)![1];
    expect(panel).toContain('display: flex');
    expect(panel).toContain('flex-direction: column');
    expect(css).toMatch(/\.cselect-options \{[^}]*min-height: 0;[^}]*overflow-y: auto;/);
    expect(css).toMatch(/\.cselect-search \{[^}]*flex-shrink: 0;/);
  });
});
