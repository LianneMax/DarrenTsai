/**
 * Educational APR for a regular, fully amortizing fixed-rate loan, paid monthly.
 * Solve the payment stream against proceeds after prepaid finance charges.
 * A flat addition to the note rate ignores amount and term and was the reason
 * APR was removed previously. Max approved a calculated estimate on 10 Oct.
 * This excludes mortgage insurance and irregular first-payment timing; a
 * lender's Loan Estimate is authoritative. Never treat all closing costs as
 * finance charges, or silently assume a lender's fees.
 */
export function estimateApr(principal: number, rate: number, years: number, fees: number): number | null {
  if (![principal, rate, years, fees].every(Number.isFinite) || principal <= 0 || rate < 0 || years <= 0 || fees < 0 || fees >= principal) return null;
  const months = Math.round(years * 12);
  if (months < 1) return null;
  if (fees === 0) return rate;
  const monthly = rate / 1200;
  const payment = monthly === 0 ? principal / months : principal * monthly / -Math.expm1(-months * Math.log1p(monthly));
  const proceeds = principal - fees;
  const presentValue = (r: number) => r === 0 ? payment * months : payment * -Math.expm1(-months * Math.log1p(r)) / r;
  let low = 0;
  let high = Math.max(monthly, 0.01);
  while (presentValue(high) > proceeds) high *= 2;
  for (let i = 0; i < 100; i++) {
    const mid = (low + high) / 2;
    if (presentValue(mid) > proceeds) low = mid;
    else high = mid;
  }
  return (low + high) / 2 * 1200;
}
