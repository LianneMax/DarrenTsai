import { useEffect, useRef } from 'react';

/**
 * After a step change, move keyboard and screen-reader focus to the new step's
 * heading, so NVDA/VoiceOver announce where the visitor now is. Found in the
 * 28 Nov 2026 NVDA pass: Continue was silent on home equity and payoff (/adu/
 * already did this). The first render is skipped so a page load never steals
 * focus. `key` is anything that changes when the visible step changes.
 */
export function useStepHeadingFocus(containerId: string, key: unknown) {
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const id = window.requestAnimationFrame(() => {
      const heading = document.getElementById(containerId)?.querySelector<HTMLElement>('h2');
      if (!heading) return;
      if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
      heading.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(id);
  }, [containerId, key]);
}
