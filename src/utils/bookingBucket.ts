/** The chosen goal owns the bucket; the entry page remains attribution. */
export function bookingBucket(goal: unknown, entrySource: unknown): string {
  const entry = String(entrySource || '');
  if (goal === 'equity') return entry === 'adu-contact' || entry === 'adu' ? 'adu' : 'home-equity';
  if (goal === 'dscr') return 'dscr';
  if (goal === 'commercial') return 'commercial';
  if (goal === 'own-home') return entry === 'fha-contact' || entry === 'fha' ? 'fha'
    : entry === 'mortgage-calculator-contact' || entry === 'mortgage-review' ? 'mortgage-review' : 'home-purchase-refinance';
  return 'needs-guidance';
}
