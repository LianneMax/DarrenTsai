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
};

function api(): Api | null {
  return (window as unknown as { dtEmailSuggest?: Api }).dtEmailSuggest ?? null;
}

/** null when there is nothing to say, or the script hasn't loaded. */
export function checkEmail(value: string): EmailSuggestion | null {
  try { return api()?.check(value) ?? null; } catch { return null; }
}

export function emailHintMessage(result: EmailSuggestion | null): string {
  try { return api()?.message(result) ?? ''; } catch { return ''; }
}
