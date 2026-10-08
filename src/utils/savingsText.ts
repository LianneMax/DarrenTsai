/**
 * What an option does to the monthly payment, in words.
 *
 * WHY. Every saving on the debt calculator used to be shown only when it was
 * positive, and an option that RAISED the payment showed nothing at all on its
 * card and a flat "no savings" in the breakdown. Someone trading a 3% mortgage
 * for today's rate to clear a small card balance can easily pay more each
 * month, and that is the single most useful thing the tool can tell them. So it
 * is said, and never as a negative saving: "Save -$140/mo" reads as a typo,
 * "Payment goes up $140/mo" reads as a fact. The Sheet stores the same number
 * signed (negative means up).
 *
 * Here rather than in the component, which may only export components for fast
 * refresh to work, and so the wording can be tested without rendering a step
 * that sits behind two gates.
 */
function money(n: number): string {
  return '$' + Math.round(n).toLocaleString();
}

export function savingsText(save: number): string {
  const rounded = Math.round(save);
  if (rounded > 0) return `Save ${money(rounded)}/mo`;
  if (rounded < 0) return `Payment goes up ${money(-rounded)}/mo`;
  return 'No monthly savings';
}

/** The same verdict for a breakdown row, where the label already says "Savings". */
export function savingsRowText(save: number): string {
  const rounded = Math.round(save);
  if (rounded > 0) return `${money(rounded)}/mo`;
  return savingsText(save);
}
