import { useEffect, useRef, useState, lazy, Suspense } from 'react';
import type { MortgageInputs, MortgageSummary } from '../types/mortgage';
import { formatCurrency } from '../utils/formatters';
import { useCountUp } from '../hooks/useCountUp';
import AmortizationTable from './AmortizationTable';
import AprEstimate from './AprEstimate';
import './mortgage-calculator.css';

// Keep recharts in its lazy chunk, outside the initial preload graph. The
// empty calculator renders no chart; entering the visitor's own loan and rate
// loads it on demand, with the placeholder below reserving its height.
const AmortizationChart = lazy(() => import('./AmortizationChart'));

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

interface Props {
  inputs: MortgageInputs;
  setInputs: React.Dispatch<React.SetStateAction<MortgageInputs>>;
  summary: MortgageSummary;
  onOpenContact: () => void;
  // Build-time preview only. A visitor must not type into static inputs that
  // createRoot will replace and silently discard when the app arrives.
  preview?: boolean;
}

function StatCard({
  label,
  value,
  color,
  size,
  isString,
  style,
  labelStyle,
}: {
  label: string;
  value: number | string;
  color: string;
  size?: string;
  isString?: boolean;
  style?: React.CSSProperties;
  labelStyle?: React.CSSProperties;
}) {
  const animated = useCountUp(typeof value === 'number' ? value : 0);
  const [pulse, setPulse] = useState(false);
  const prevRef = useRef(value);

  useEffect(() => {
    if (prevRef.current !== value) {
      setPulse(true);
      const t = setTimeout(() => setPulse(false), 400);
      prevRef.current = value;
      return () => clearTimeout(t);
    }
  }, [value]);

  return (
    <div className="stat-card" style={style}>
      <span className="stat-label" style={labelStyle}>{label}</span>
      <span
        className={`stat-value${pulse ? ' stat-pulse' : ''}`}
        style={{ color, fontSize: size }}
      >
        {isString
          ? value
          : formatCurrency(animated)}
      </span>
    </div>
  );
}

export default function Calculator({ inputs, setInputs, summary, onOpenContact, preview = false }: Props) {

  const currentYear = new Date().getFullYear();
  const years = [currentYear, currentYear + 1, currentYear + 2];

  // Empty when there is no loan, not "0".
  //
  // (0).toLocaleString() is the string "0", so the field opened showing a zero
  // and its `e.g. 330,000` placeholder never appeared. Nothing was sent, since
  // both the schedule and the modal's prefill need a loan AND a rate, but a
  // grey 0 in a money field is the same thing the whole round was about. Matches
  // handleLoanBlur, which already guarded this.
  const [loanDisplay, setLoanDisplay] = useState(
    inputs.loanAmount ? inputs.loanAmount.toLocaleString('en-US') : ''
  );

  // Nothing is shown until there is a loan and a rate to show it for. With
  // both empty the summary is all zeros and the payoff date is a real date,
  // which reads as a calculated answer rather than an empty form.
  const hasLoan = inputs.loanAmount > 0 && inputs.annualRate > 0;
  const interestRatio = inputs.loanAmount > 0 ? summary.totalInterest / inputs.loanAmount : 0;
  const interestPct = Math.round(interestRatio * 100);

  const handleLoanChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/[^0-9]/g, '');
    const numeric = parseInt(raw, 10) || 0;
    setLoanDisplay(numeric ? numeric.toLocaleString('en-US') : '');
    setInputs((prev) => ({ ...prev, loanAmount: numeric }));
  };

  const handleLoanBlur = () => {
    setLoanDisplay(inputs.loanAmount ? inputs.loanAmount.toLocaleString('en-US') : '');
  };

  const scrollToContact = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    onOpenContact();
  };

  return (
    <section id="calculator" className="mortgage-calculator" aria-busy={preview || undefined}>
        {/* This is the page's first screen. It must remain visible in the
            build-time HTML and after React replaces it, without waiting for
            IntersectionObserver or staggered transitions (10 Oct PSI audit). */}
        <header className="mortgage-intro">
          <div className="container">
          <h1>Mortgage Calculator</h1>
          <p className="section-sub">Estimate principal and interest and your payoff schedule. Taxes, insurance and fees are extra.</p>
          </div>
        </header>

      <div className="container mortgage-workspace">
        <div className="calc-grid" data-ui="mortgage-estimate">
          {/* Input Panel */}
          <div className="card mortgage-input-panel" role="region" aria-labelledby="mortgage-loan-heading">
            <h2 className="card-heading" id="mortgage-loan-heading">
              Loan Details
            </h2>

            <div className="input-group">
              <label htmlFor="loanAmount" className="input-label">Loan Amount</label>
              <div className="input-prefix-wrap">
                <span className="input-prefix">$</span>
                <input
                  id="loanAmount"
                  disabled={preview}
                  type="text"
                  inputMode="numeric"
                  className="form-input input-has-prefix"
                  value={loanDisplay}
                  onChange={handleLoanChange}
                  onBlur={handleLoanBlur}
                  placeholder="e.g. 330,000"
                />
              </div>
            </div>

            <div className="input-group">
              <label htmlFor="termYears" className="input-label">Loan Term</label>
              <div className="select-wrap">
                <select
                  id="termYears"
                  disabled={preview}
                  className="form-select"
                  value={inputs.termYears}
                  onChange={(e) =>
                    setInputs((prev) => ({ ...prev, termYears: parseInt(e.target.value) }))
                  }
                >
                  <option value={30}>30 Years</option>
                  <option value={20}>20 Years</option>
                  <option value={15}>15 Years</option>
                  <option value={10}>10 Years</option>
                </select>
                <svg className="select-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
            </div>

            <div className="input-group">
              <label htmlFor="annualRate" className="input-label">Annual Interest Rate</label>
              <div className="input-suffix-wrap">
                <input
                  id="annualRate"
                  disabled={preview}
                  type="number"
                  step="0.01"
                  min="0.1"
                  max="30"
                  className="form-input input-has-suffix"
                  placeholder="e.g. 6.5"
                  value={inputs.annualRate || ''}
                  onChange={(e) =>
                    setInputs((prev) => ({ ...prev, annualRate: parseFloat(e.target.value) || 0 }))
                  }
                />
                <span className="input-suffix">%</span>
              </div>
            </div>

            <div className="input-group">
              <span className="input-label">Loan Start Date</span>
              <div className="date-row">
                <div className="select-wrap">
                  <select
                    aria-label="Start month"
                    disabled={preview}
                    className="form-select"
                    value={inputs.startMonth}
                    onChange={(e) =>
                      setInputs((prev) => ({ ...prev, startMonth: parseInt(e.target.value) }))
                    }
                  >
                    {MONTH_NAMES.map((m, i) => (
                      <option key={m} value={i + 1}>{m}</option>
                    ))}
                  </select>
                  <svg className="select-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <div className="select-wrap">
                  <select
                    aria-label="Start year"
                    disabled={preview}
                    className="form-select"
                    value={inputs.startYear}
                    onChange={(e) =>
                      setInputs((prev) => ({ ...prev, startYear: parseInt(e.target.value) }))
                    }
                  >
                    {years.map((y) => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                  <svg className="select-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
              </div>
            </div>
          </div>

          {/* Results Summary */}
          <div className="card card-results" role="region" aria-labelledby="mortgage-summary-heading">
            <h2 className="card-heading" id="mortgage-summary-heading">
              Payment Summary
            </h2>

            {!hasLoan && (
              <p className="mortgage-empty">
                Enter a loan amount and an interest rate and your payment, total interest
                and payoff date appear here.
              </p>
            )}

            {hasLoan && (
            <div className="stats-grid">
              <StatCard
                label="Est. Principal &amp; Interest"
                value={summary.monthlyPayment}
                color="var(--accent)"
                size="clamp(2rem, 4vw, 2.8rem)"
              />
              <div className="stat-card">
                <span className="stat-label">Estimated APR</span>
                <AprEstimate principal={inputs.loanAmount} rate={inputs.annualRate} years={inputs.termYears} />
              </div>
              <StatCard
                label="Total Interest Paid"
                value={summary.totalInterest}
                color="var(--teal)"
                size="1.55rem"
              />
              <StatCard
                label="Total Principal &amp; Interest"
                value={summary.totalCost}
                color="var(--teal)"
                size="1.55rem"
              />
              <StatCard
                label="Payoff Date"
                value={summary.payoffDate}
                color="var(--teal)"
                size="1.55rem"
                isString
                style={{ gridColumn: 'span 2' }}
              />
            </div>
            )}

            {hasLoan && (
            <div className="insight-callout">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
                <path d="M12 8v4M12 16h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              <span>
                Over the life of this loan, you'll pay{' '}
                <strong>{interestPct}%</strong> in interest relative to the amount borrowed.
              </span>
            </div>
            )}

          </div>
        </div>

        <div className="mortgage-conversation">
          <div><h3>Have a question about your situation?</h3><p>Talk through your goals and the options you’re considering.</p></div>
          <a
            href="/book/"
            data-early="calc-contact"
            onClick={scrollToContact}
            className="btn btn-teal btn-full calc-cta"
          >
            Book a Call
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 17 17 7M7 7h10v10" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </a>
        </div>

        {/* Chart. The placeholder reserves the chart's height so loading it
            does not shove the table down the page and cost us CLS. */}
        {hasLoan && (
          <Suspense fallback={<div style={{ height: 360 }} aria-hidden="true" />}>
            <AmortizationChart schedule={summary.schedule} yearlyData={summary.yearlyData} />
          </Suspense>
        )}

        {/* Table */}
        {hasLoan && <AmortizationTable schedule={summary.schedule} yearlyData={summary.yearlyData} />}

        {/* Legal footnote */}
        <p className="mortgage-disclosure">
          <em id="cost-assumptions"><strong>Cost assumptions:</strong> the payment shown is principal and
          interest only, on the amount, rate and term you entered. It excludes taxes, insurance and
          fees. Estimated APR assumes $0 upfront finance charges unless you enter them using the
          info icon. Actual costs and APR require a lender's Loan Estimate.
          This is an estimate for educational purposes only.</em>
          <br />
          CA DRE Broker License #02103705 · This is not a commitment to lend. All loans are
          subject to credit approval.
        </p>
      </div>
    </section>
  );
}
