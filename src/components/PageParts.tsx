/**
 * Pieces shared by the revamp pages (/debt-consolidation/ since phase 2,
 * /home-equity/ since phase 3), so the two draw a row, a step button or the
 * equity picture the same way. Presentation only, like the page views that use
 * them. Styles are the dcp- block in src/index.css, which both pages share.
 */
import type { ReactNode } from 'react';
import { LICENSED_STATES, NMLS, DRE } from '../config';
import { formatCurrency } from '../utils/formatters';

export const Arrow = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const Check = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`dcp-row${strong ? ' dcp-row-strong' : ''}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

export function StepNav({ back, next, onBack, onNext, disabled }: {
  back?: string; next: ReactNode; onBack?: () => void; onNext: () => void; disabled?: boolean;
}) {
  return (
    <div className="dcp-actions">
      {back
        ? <button type="button" className="btn dcp-back" onClick={onBack}>{back}</button>
        : <span />}
      <button type="button" className="btn btn-teal dcp-next" onClick={onNext} disabled={disabled}>
        {next}
      </button>
    </div>
  );
}

/**
 * The equity picture, shown only once there is a value and a balance to draw.
 *
 * The bar is the same two numbers the old chips showed, not a new calculation.
 * A balance above the value is said in words: a bar cannot draw negative equity,
 * and clamping it to zero would hide the one thing that visitor needs to know.
 */
export function EquitySnapshot({ hv, mb }: { hv: number; mb: number }) {
  const equity = hv - mb;
  const ltv = (mb / hv) * 100;
  const mortgageShare = Math.min(Math.max(ltv, 0), 100);
  return (
    <div className="dcp-snapshot">
      <div className="dcp-snapshot-head">
        <span className="dcp-eyebrow dcp-eyebrow-dark">Estimated Home Equity</span>
        <span className="dcp-ltv">Current LTV <strong>{ltv.toFixed(1)}%</strong></span>
      </div>
      <div className="dcp-snapshot-number">
        {equity >= 0 ? formatCurrency(equity) : 'None at these numbers'}
      </div>
      <div className="dcp-bar" role="img" aria-label={`Mortgage is ${mortgageShare.toFixed(1)} percent of the home value`}>
        <span style={{ width: `${mortgageShare}%` }} />
      </div>
      <div className="dcp-bar-labels">
        <span>Mortgage balance<strong>{formatCurrency(mb)}</strong></span>
        <span>Estimated equity<strong>{equity >= 0 ? formatCurrency(equity) : 'None'}</strong></span>
      </div>
      <p className="dcp-caption">
        {equity >= 0
          ? 'Based on the values entered. This is not an appraisal or available credit.'
          : 'The mortgage balance entered is higher than the home value, so there is no equity to borrow against at these numbers.'}
      </p>
    </div>
  );
}

/** Where Darren is licensed, under each page's hero. Pre-rendered with it. */
export function LicensedStrip() {
  return (
    <div className="dcp-licensed">
      <span>Licensed in {LICENSED_STATES.join(' · ')}</span>
      <span>NMLS #{NMLS}</span>
      <span>CA DRE #{DRE}</span>
      <span>Equal Housing Opportunity</span>
    </div>
  );
}
