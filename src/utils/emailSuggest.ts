/**
 * Typed access to the shared checker in public/email-suggest.js, which the three
 * static landing pages use too. Kept as one file so the rule can't drift; React
 * renders the hint itself rather than letting that script touch its DOM.
 */
export type EmailSuggestion =
  | { kind: 'typo'; suggestion: string; email: string }
  | { kind: 'undeliverable'; suggestion: null; email: null };

type Api = {
  check: (value: string) => EmailSuggestion | null;
  message: (result: EmailSuggestion | null) => string;
  afterPress?: (fn: () => void) => void;
};

function api(): Api | null {
  return (window as unknown as { dtEmailSuggest?: Api }).dtEmailSuggest ?? null;
}

/** null when there is nothing to say, or the script hasn't loaded. */
export function checkEmail(value: string): EmailSuggestion | null {
  try { return api()?.check(value) ?? null; } catch { return null; }
}

/** What the forms say when they refuse an address that can never get mail. */
export const UNDELIVERABLE_EMAIL_MESSAGE = "That address can't receive email. Please use an email address you check.";

/**
 * True for an address mail can never reach (example.com, a .test domain and
 * the like). 28 Nov 2026 (Max): the forms now refuse these on Continue instead
 * of only hinting, so a visitor fixes it while they are still on the page. The
 * server refuses them too (netlify/functions/lead.mts), in case this script
 * has not loaded.
 */
export function cannotReceiveEmail(value: string): boolean {
  return checkEmail(value)?.kind === 'undeliverable';
}

export function emailHintMessage(result: EmailSuggestion | null): string {
  try { return api()?.message(result) ?? ''; } catch { return ''; }
}

/**
 * Checks the address and hands the hint to `show` once the tap that took focus
 * away has landed (see afterPress in public/email-suggest.js): drawing it on the
 * press moved the layout under the visitor's finger and the tap was lost.
 */
export function hintAfterBlur(value: string, show: (hint: EmailSuggestion | null) => void): void {
  const hint = checkEmail(value);
  const a = api();
  if (a?.afterPress) a.afterPress(() => show(hint));
  else show(hint);
}
