import { useId, useState } from 'react';
import { estimateApr } from '../utils/apr';

/** Same disclosure and editable fee assumption wherever an APR is displayed. */
export default function AprEstimate({ principal, rate, years, fees: controlledFees, onFeesChange }: { principal: number; rate: number; years: number; fees?: string; onFeesChange?: (fees: string) => void }) {
  const id = useId();
  const [localFees, setFees] = useState('');
  const fees = controlledFees ?? localFees;
  const feeAmount = fees === '' ? 0 : Number(fees);
  const apr = estimateApr(principal, rate, years, feeAmount);
  return <span className="apr-estimate" data-apr-principal={principal} data-apr-rate={rate} data-apr-years={years} data-apr-fees={feeAmount} data-apr-result={apr ?? ""}>
    <span className="apr-number">{apr === null ? '—' : `${apr.toFixed(2)}%`}</span>
    <details className="apr-info">
      <summary aria-label="About this estimated APR">ⓘ</summary>
      <span className="apr-tooltip">
        Estimate from loan amount, rate, term and the fees below. Actual APR also depends on lender charges, mortgage insurance and payment timing. Not a quote.
        <label htmlFor={id}>Prepaid finance charges ($)</label>
        <input id={id} type="number" min="0" max={Math.max(0, principal - 1)} step="1" inputMode="decimal" placeholder="e.g. 2,000" value={fees} onChange={e => { setFees(e.target.value); onFeesChange?.(e.target.value); }} />
        <small>Only APR-included charges paid upfront, not taxes, escrow or all closing costs.</small>
        {apr === null && <small role="alert">Enter fees below the loan amount.</small>}
      </span>
    </details>
    <small className="apr-assumption">{fees === '' ? '$0 upfront fees assumed' : `$${Number.isFinite(feeAmount) ? feeAmount.toLocaleString('en-US') : '—'} upfront fees entered`}</small>
  </span>;
}
