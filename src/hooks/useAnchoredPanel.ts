/**
 * Where a dropdown's panel goes, and keeping it there.
 *
 * WHY THIS EXISTS. StateSelect and CustomSelect each placed their panel once,
 * at the moment it opened, always below the trigger, and CLOSED it on any scroll
 * or resize. On a desktop that is unnoticeable. On a phone it broke the State
 * field, which every lead form requires. Measured on 8 Oct on step 4 of the
 * debt calculator, at 375x812, 320x568 and 375x667:
 *
 *  - With the field low on the screen (just above the sticky bar) the panel
 *    opened 211px off the bottom with not one option visible, and the scroll
 *    needed to bring it into view closed it.
 *  - Wherever the field was, the panel closed the moment the on-screen keyboard
 *    resized the window, or a thumb moved the page 40px.
 *
 * So the panel now follows its trigger instead of giving up: it is re-measured
 * on every scroll and resize, opens upwards when there is more room above, and
 * is never taller than the room it has. It closes only when the trigger itself
 * has left the screen, since a panel pointing at nothing is worse than none,
 * and not even then while the visitor is typing in its search box: the keyboard
 * that typing summons is exactly what pushes a low trigger off the screen.
 *
 * The search box is focused for a mouse or trackpad only. On a touch screen
 * focusing it summons the keyboard over a list the visitor has not looked at
 * yet, taking half the room the list needed; they can still tap the box to
 * search.
 */
import { useCallback, useEffect, useState, type RefObject } from 'react';

export type PanelPlace = {
  left: number;
  width: number;
  /** Set when the panel hangs below the trigger. */
  top?: number;
  /** Set when it sits above: distance from the bottom of the viewport. */
  bottom?: number;
  maxHeight: number;
};

/** Space between the trigger and the panel. */
const GAP = 6;
/** Kept clear at the screen edge, so the panel's shadow and border show. */
const EDGE = 8;
/** The search box plus roughly five options: enough to be usable. */
const COMFORTABLE = 260;
/** Never smaller than this, however little room there is. */
const MINIMUM = 140;

type Box = { top: number; bottom: number; left: number; width: number };

/**
 * Pure, so the rule can be tested without a browser. Returns null when the
 * trigger is entirely off screen, which is the caller's cue to close, unless
 * `inUse` says the visitor is working inside the panel: then it takes whatever
 * of the screen is left rather than vanishing under their thumbs.
 */
export function placePanel(
  trigger: Box,
  viewportHeight: number,
  inUse = false,
  // The window's own height, which a fixed element's `bottom` is measured from.
  // It differs from what is visible only while an iOS keyboard is up: there the
  // window keeps its height and the visible part shrinks.
  windowHeight = viewportHeight,
): PanelPlace | null {
  if (trigger.bottom <= 0 || trigger.top >= viewportHeight) {
    if (!inUse) return null;
    return { left: trigger.left, width: trigger.width, top: EDGE, maxHeight: Math.max(viewportHeight - 2 * EDGE, MINIMUM) };
  }

  const below = viewportHeight - trigger.bottom - GAP - EDGE;
  const above = trigger.top - GAP - EDGE;
  const base = { left: trigger.left, width: trigger.width };

  // Below is the expected place for a dropdown, so it wins whenever it is
  // comfortable, and also whenever it is simply the roomier side.
  if (below >= COMFORTABLE || below >= above) {
    return { ...base, top: trigger.bottom + GAP, maxHeight: Math.max(below, MINIMUM) };
  }
  return { ...base, bottom: windowHeight - trigger.top + GAP, maxHeight: Math.max(above, MINIMUM) };
}

/** The height the visitor can actually see: less than innerHeight while a keyboard is up. */
function visibleHeight(): number {
  return window.visualViewport?.height ?? window.innerHeight;
}

/** True for a mouse or trackpad. False on a phone, and in jsdom, which has no matchMedia. */
export function hasFinePointer(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(pointer: fine)').matches;
}

export function useAnchoredPanel(
  open: boolean,
  triggerRef: RefObject<HTMLElement | null>,
  panelRef: RefObject<HTMLElement | null>,
  close: () => void,
) {
  const [place, setPlace] = useState<PanelPlace | null>(null);

  /** Call just before opening, so the first frame is already in the right place. */
  const measure = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return null;
    const inUse = !!panelRef.current && panelRef.current.contains(document.activeElement);
    const next = placePanel(el.getBoundingClientRect(), visibleHeight(), inUse, window.innerHeight);
    setPlace(next);
    return next;
  }, [triggerRef, panelRef]);

  useEffect(() => {
    if (!open) return;

    function follow(e?: Event) {
      // The option list scrolling inside the panel moves nothing outside it.
      if (e && panelRef.current && e.target instanceof Node && panelRef.current.contains(e.target)) return;
      if (!measure()) close();
    }

    window.addEventListener('scroll', follow, true);
    window.addEventListener('resize', follow);
    // iOS reports the keyboard here and nowhere else: the window is not resized.
    window.visualViewport?.addEventListener('resize', follow);
    window.visualViewport?.addEventListener('scroll', follow);
    return () => {
      window.removeEventListener('scroll', follow, true);
      window.removeEventListener('resize', follow);
      window.visualViewport?.removeEventListener('resize', follow);
      window.visualViewport?.removeEventListener('scroll', follow);
    };
  }, [open, measure, close, panelRef]);

  return { place, measure };
}
