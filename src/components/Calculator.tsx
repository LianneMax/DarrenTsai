import { useEffect, useRef, useState } from 'react';
import type { MortgageInputs, MortgageSummary } from '../types/mortgage';
import { formatCurrency } from '../utils/formatters';
import { useScrollReveal } from '../hooks/useScrollReveal';
import { useCountUp } from '../hooks/useCountUp';
import AmortizationChart from './AmortizationChart';
import AmortizationTable from './AmortizationTable';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

interface Props {
  inputs: MortgageInputs;
  setInputs: React.Dispatch<React.SetStateAction<MortgageInputs>>;
  summary: MortgageSummary;
}

function StatCard({
  label,
  value,
  color,
  size,
  isString,
}: {
  label: string;
  value: number | string;
  color: string;
  size?: string;
  isString?: boolean;
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
    <div className="stat-card">
      <span className="stat-label">{label}</span>
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

export default function Calculator({ inputs, setInputs, summary }: Props) {
  const sectionRef = useScrollReveal<HTMLDivElement>();
  const panelRef = useScrollReveal<HTMLDivElement>(80);
  const resultsRef = useScrollReveal<HTMLDivElement>(160);

  const currentYear = new Date().getFullYear();
  const years = [currentYear, currentYear + 1, currentYear + 2];

  const [loanDisplay, setLoanDisplay] = useState(
    inputs.loanAmount.toLocaleString('en-US')
  );

  const interestRatio = summary.totalInterest / inputs.loanAmount;
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
    document.getElementById('contact')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <section id="calculator" className="section section-light">
      <div className="container">
        <div ref={sectionRef} className="section-header reveal">
          <h2 className="section-title">Mortgage Calculator</h2>
          <p className="section-sub">Adjust any input to see your full payment breakdown instantly.</p>
        </div>

        <div className="calc-grid">
          {/* Input Panel */}
          <div ref={panelRef} className="card reveal">
            <h3 className="card-heading">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <rect x="4" y="2" width="16" height="20" rx="2" stroke="currentColor" strokeWidth="2"/>
                <path d="M9 7h6M9 12h6M9 17h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              Loan Details
            </h3>

            <div className="input-group">
              <label htmlFor="loanAmount" className="input-label">Loan Amount</label>
              <div className="input-prefix-wrap">
                <span className="input-prefix">$</span>
                <input
                  id="loanAmount"
                  type="text"
                  inputMode="numeric"
                  className="form-input input-has-prefix"
                  value={loanDisplay}
                  onChange={handleLoanChange}
                  onBlur={handleLoanBlur}
                  placeholder="330,000"
                />
              </div>
            </div>

            <div className="input-group">
              <label htmlFor="termYears" className="input-label">Loan Term</label>
              <div className="select-wrap">
                <select
                  id="termYears"
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
                  type="number"
                  step="0.01"
                  min="0.1"
                  max="30"
                  className="form-input input-has-suffix"
                  value={inputs.annualRate}
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
          <div ref={resultsRef} className="card card-results reveal">
            <h3 className="card-heading">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" stroke="currentColor" strokeWidth="2"/>
                <path d="M12 6v6l4 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              Payment Summary
            </h3>

            <div className="stats-grid">
              <StatCard
                label="Monthly Payment (P&I)"
                value={summary.monthlyPayment}
                color="var(--navy)"
                size="2.4rem"
              />
              <StatCard
                label="Total Interest Paid"
                value={summary.totalInterest}
                color="var(--rose)"
                size="1.55rem"
              />
              <StatCard
                label="Total Cost of Loan"
                value={summary.totalCost}
                color="var(--navy)"
                size="1.55rem"
              />
              <StatCard
                label="Payoff Date"
                value={summary.payoffDate}
                color="var(--teal)"
                size="1.55rem"
                isString
              />
            </div>

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

            <a
              href="#contact"
              onClick={scrollToContact}
              className="btn btn-teal btn-full calc-cta"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M20 12V22H4V12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M22 7H2v5h20V7z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M12 22V7M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Want Darren to review these numbers?
            </a>
          </div>
        </div>

        {/* Chart */}
        <AmortizationChart schedule={summary.schedule} yearlyData={summary.yearlyData} />

        {/* Table */}
        <AmortizationTable schedule={summary.schedule} yearlyData={summary.yearlyData} />
      </div>
    </section>
  );
}
