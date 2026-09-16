import { useEffect, useState } from 'react';

/**
 * Returns `value` after it has stopped changing for `delay` ms.
 *
 * Used to keep expensive derived work off the keystroke path: the mortgage
 * calculator rebuilds a 360-row amortization schedule and re-renders hundreds
 * of table rows from its inputs, which made every character a long task and
 * showed up as a Poor INP score.
 *
 * The input fields stay controlled by the raw state, so typing still feels
 * immediate — only the heavy derived output waits for the pause.
 */
export function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
