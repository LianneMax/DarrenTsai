/**
 * Typed facade over public/attribution.js, which is loaded by a <script> tag in
 * index.html before the React bundle. There is deliberately only one
 * implementation: the static landing pages have no build step and cannot import
 * this, so duplicating the logic in TS would guarantee the two drift apart.
 *
 * Both functions are no-op safe if the script failed to load, so a blocked or
 * missing attribution.js degrades to an untracked lead rather than a thrown
 * error inside a form submit handler.
 */
declare global {
  interface Window {
    DT?: {
      attr: () => Record<string, string>;
      track: (event: string, params?: Record<string, unknown>) => unknown;
    };
    dataLayer?: unknown[];
  }
}

export function getAttribution(): Record<string, string> {
  try {
    return window.DT?.attr() ?? {};
  } catch {
    return {};
  }
}

export function track(event: string, params?: Record<string, unknown>): void {
  try {
    window.DT?.track(event, params);
  } catch {
    /* never let analytics break a submit */
  }
}
