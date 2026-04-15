import { useState } from 'react';
import { ZAPIER_WEBHOOK_URL } from '../config';

// Calendly URL — matches the one used across the site
const CALENDLY_URL = 'https://calendly.com/realdarrentsai/15min';

const RATE_30YR = 6.41;
const RATE_15YR = 6.01;

const DEBT_TYPES = [
  'Credit Card',
  'Auto Loan',
  'Personal Loan',
  'Medical',
  'Student Loan',
  'Other',
];

interface Debt {
  id: number;
  type: string;
  bal: number;
  pmt: number;
  rate: number;
}

let _uid = 3;
function uid() { return _uid++; }

function calcPmt(principal: number, annualRate: number, years: number): number {
  if (!principal || !annualRate || !years) return 0;
  const r = annualRate / 100 / 12;
  const n = years * 12;
  return principal * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

function fmt(n: number) {
  return '$' + Math.round(n).toLocaleString();
}

function pct(n: number) {
  return n.toFixed(2) + '%';
}

function openCalendly() {
  const cal = (window as Window & { Calendly?: { initPopupWidget: (o: { url: string }) => void } }).Calendly;
  if (cal) {
    cal.initPopupWidget({ url: CALENDLY_URL });
  } else {
    window.open(CALENDLY_URL, '_blank', 'noopener,noreferrer');
  }
}

// ─── Shared sub-components ───────────────────────────────────────────────────

function Chip({ label, value, bg }: { label: string; value: string; bg: string }) {
  return (
    <div style={{
      background: bg, color: '#fff', padding: '10px 18px',
      borderRadius: 10, flex: 1, minWidth: 140,
    }}>
      <div style={{ fontSize: 11, opacity: 0.75, marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

function BreakdownRow({
  label,
  value,
  green,
  bold,
}: {
  label: string;
  value: string;
  green?: boolean;
  bold?: boolean;
}) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '8px 0', borderBottom: bold ? 'none' : '1px solid #e2e5ed',
      fontSize: 13, fontWeight: bold ? 600 : 400,
      color: green ? '#059669' : 'inherit',
    }}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function DebtSavingsCalculator() {
  const [step, setStep] = useState(1);

  // Debts
  const [debts, setDebts] = useState<Debt[]>([
    { id: 1, type: 'Credit Card', bal: 8500,  pmt: 250, rate: 24.99 },
    { id: 2, type: 'Auto Loan',   bal: 18000, pmt: 420, rate: 7.5  },
  ]);

  // Home
  const [homeValue,  setHomeValue]  = useState('');
  const [mtgBalance, setMtgBalance] = useState('');
  const [mtgPayment, setMtgPayment] = useState('');
  const [mtgRate,    setMtgRate]    = useState('');
  const [mtgTerm,    setMtgTerm]    = useState('');

  // HELOAN options
  const [heloanTier, setHeloanTier] = useState(8.99);
  const [heloanTerm, setHeloanTerm] = useState(10);

  // Lead form
  const [fname,     setFname]     = useState('');
  const [lname,     setLname]     = useState('');
  const [phone,     setPhone]     = useState('');
  const [email,     setEmail]     = useState('');
  const [bestTime,  setBestTime]  = useState('Morning (8am–12pm)');
  const [leadSrc,   setLeadSrc]   = useState('YouTube');
  const [submitted, setSubmitted] = useState(false);

  // ── Derived values ─────────────────────────────────────────────────────────

  const totPmt = debts.reduce((s, d) => s + (d.pmt || 0), 0);
  const totBal = debts.reduce((s, d) => s + (d.bal || 0), 0);
  const wtRate = totBal > 0
    ? debts.reduce((s, d) => s + (d.bal || 0) * (d.rate || 0), 0) / totBal
    : 0;

  const hv = parseFloat(homeValue)  || 0;
  const mb = parseFloat(mtgBalance) || 0;
  const mp = parseFloat(mtgPayment) || 0;

  const todayTotal = totPmt + mp;
  const newLoan    = mb + totBal;
  const refiPmt    = calcPmt(newLoan, RATE_30YR, 30);
  const refiSave   = todayTotal - refiPmt;

  const heloanAmt   = hv > 0 && mb > 0 ? Math.max(Math.min(totBal, hv * 0.85 - mb), 0) : 0;
  const heloanPmt   = calcPmt(heloanAmt, heloanTier, heloanTerm);
  const heloanTotal = mp + heloanPmt;
  const heloanSave  = todayTotal - heloanTotal;
  const cltv        = hv > 0 ? (mb + heloanAmt) / hv * 100 : 0;

  const bestSave = Math.max(refiSave > 0 ? refiSave : 0, heloanSave > 0 ? heloanSave : 0);

  // ── Handlers ───────────────────────────────────────────────────────────────

  const addDebt = () =>
    setDebts(prev => [...prev, { id: uid(), type: 'Credit Card', bal: 0, pmt: 0, rate: 0 }]);

  const removeDebt = (id: number) =>
    setDebts(prev => prev.filter(d => d.id !== id));

  const updateDebt = (id: number, field: keyof Omit<Debt, 'id'>, raw: string) => {
    const value = field === 'type' ? raw : (parseFloat(raw) || 0);
    setDebts(prev => prev.map(d => d.id === id ? { ...d, [field]: value } : d));
  };

  const goStep = (n: number) => {
    setStep(n);
    setTimeout(() => {
      document.getElementById('savings')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);
  };

  const submitLead = () => {
    if (!fname || !phone || !email) {
      alert('Please fill in your name, phone, and email.');
      return;
    }
    const payload = {
      first_name: fname, last_name: lname, phone, email,
      best_time_to_call: bestTime, lead_source: leadSrc,
      monthly_savings: Math.round(bestSave),
      home_value: hv, mortgage_balance: mb, mortgage_payment: mp,
      total_debt_balance: totBal, total_debt_payment: totPmt,
      refi_monthly_payment: Math.round(refiPmt),
      refi_monthly_savings:  Math.round(refiSave),
      heloan_monthly_payment: Math.round(heloanPmt),
      heloan_monthly_savings:  Math.round(heloanSave),
      debts,
      loan_officer: 'Darren Tsai', nmls: '2438102', company: 'Saxton Mortgage',
    };
    if (ZAPIER_WEBHOOK_URL) {
      fetch(ZAPIER_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch(() => {});
    }
    setSubmitted(true);
  };

  // ── Step tab bar ───────────────────────────────────────────────────────────

  const STEPS = [
    { n: 1, label: 'Your Debts' },
    { n: 2, label: 'Your Home' },
    { n: 3, label: 'Comparison' },
    { n: 4, label: 'Talk to Darren' },
  ];

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <section id="savings" className="section section-light">
      <div className="container">

        {/* Section header */}
        <div className="section-header">
          <span className="section-eyebrow">Debt Consolidation Analysis</span>
          <h2 className="section-title">See How Much You Could Save Each Month</h2>
          <p className="section-sub">
            You've built equity in your home. Let's put it to work. Compare your options
            side-by-side in under 3 minutes — no credit pull, no obligation.
          </p>
          {bestSave > 0 && (
            <span style={{
              display: 'inline-block', marginTop: 14,
              background: 'var(--rose)', color: '#fff',
              padding: '6px 22px', borderRadius: 20, fontSize: 14, fontWeight: 600,
            }}>
              You could save {fmt(bestSave)}/mo
            </span>
          )}
        </div>

        {/* Step indicator — PawSync style */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'center', marginBottom: 36 }}>
          {STEPS.map(({ n, label }, i) => {
            const isDone   = step > n;
            const isActive = step === n;
            const circleBg = isDone
              ? 'var(--teal)'
              : isActive
                ? 'var(--navy)'
                : '#e5e7eb';
            const numColor = isDone || isActive ? '#fff' : '#9ca3af';
            const labelColor = isActive ? 'var(--navy)' : isDone ? 'var(--teal)' : '#9ca3af';
            const labelWeight = isActive ? 700 : 500;

            return (
              <div key={n} style={{ display: 'flex', alignItems: 'flex-start' }}>
                {/* Circle + label */}
                <button
                  onClick={() => goStep(n)}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                    gap: 8, background: 'none', border: 'none', cursor: 'pointer',
                    padding: 0, fontFamily: 'inherit',
                  }}
                >
                  <div style={{
                    width: 48, height: 48, borderRadius: '50%',
                    background: circleBg,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'background 0.4s ease',
                    boxShadow: isActive ? '0 4px 14px rgba(34,61,85,0.25)' : 'none',
                  }}>
                    {isDone ? (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path d="M5 13l4 4L19 7" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    ) : (
                      <span style={{ color: numColor, fontWeight: 700, fontSize: 16, transition: 'color 0.4s ease' }}>
                        {n}
                      </span>
                    )}
                  </div>
                  <span style={{
                    fontSize: 12, fontWeight: labelWeight, color: labelColor,
                    transition: 'color 0.4s ease', whiteSpace: 'nowrap',
                  }}>
                    {label}
                  </span>
                </button>

                {/* Connector line (not after last step) */}
                {i < STEPS.length - 1 && (
                  <div style={{
                    height: 3, width: 64, marginTop: 22, flexShrink: 0,
                    background: step > n ? 'var(--teal)' : '#e5e7eb',
                    transition: 'background 0.4s ease',
                    borderRadius: 2,
                  }} />
                )}
              </div>
            );
          })}
        </div>

        {/* ── STEP 1: Your Debts ─────────────────────────────────────────── */}
        {step === 1 && (
          <div className="card">
            <h3 className="card-heading">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <rect x="2" y="5" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="2"/>
                <path d="M2 10h20" stroke="currentColor" strokeWidth="2"/>
              </svg>
              Your Current Monthly Debts
            </h3>

            {debts.map((d) => (
              <div key={d.id} style={{
                background: 'var(--light-bg)', border: '1px solid #e2e5ed',
                borderRadius: 10, padding: 14, marginBottom: 10,
              }}>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1.4fr 1fr 1fr 1fr 28px',
                  gap: 10, alignItems: 'end',
                }}>
                  {/* Type */}
                  <div>
                    <label className="input-label">Debt Type</label>
                    <div className="select-wrap">
                      <select
                        className="form-select"
                        value={d.type}
                        onChange={(e) => updateDebt(d.id, 'type', e.target.value)}
                      >
                        {DEBT_TYPES.map(t => <option key={t}>{t}</option>)}
                      </select>
                      <svg className="select-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                  </div>

                  {/* Balance */}
                  <div>
                    <label className="input-label">Balance ($)</label>
                    <div className="input-prefix-wrap">
                      <span className="input-prefix">$</span>
                      <input
                        type="number" className="form-input input-has-prefix"
                        value={d.bal || ''} placeholder="5000"
                        onChange={(e) => updateDebt(d.id, 'bal', e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Monthly payment */}
                  <div>
                    <label className="input-label">Monthly Payment</label>
                    <div className="input-prefix-wrap">
                      <span className="input-prefix">$</span>
                      <input
                        type="number" className="form-input input-has-prefix"
                        value={d.pmt || ''} placeholder="150"
                        onChange={(e) => updateDebt(d.id, 'pmt', e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Rate */}
                  <div>
                    <label className="input-label">Interest Rate</label>
                    <div className="input-suffix-wrap">
                      <input
                        type="number" step="0.1" className="form-input input-has-suffix"
                        value={d.rate || ''} placeholder="24.99"
                        onChange={(e) => updateDebt(d.id, 'rate', e.target.value)}
                      />
                      <span className="input-suffix">%</span>
                    </div>
                  </div>

                  {/* Remove */}
                  <button
                    onClick={() => removeDebt(d.id)}
                    aria-label="Remove debt"
                    style={{
                      background: 'none', border: 'none', fontSize: 20,
                      color: '#ccc', cursor: 'pointer', lineHeight: 1, padding: 0,
                      alignSelf: 'flex-end', paddingBottom: 6,
                    }}
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}

            {/* Add debt */}
            <button
              onClick={addDebt}
              style={{
                background: 'none', border: '2px dashed var(--rose)',
                color: 'var(--rose)', padding: '9px 16px', borderRadius: 8,
                cursor: 'pointer', fontSize: 13, fontWeight: 600,
                width: '100%', fontFamily: 'inherit', marginBottom: 16,
              }}
            >
              + Add Another Debt
            </button>

            {/* Totals chips */}
            {debts.length > 0 && (
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
                <Chip label="Total Monthly Payments" value={fmt(totPmt)} bg="var(--navy)" />
                <Chip label="Total Debt Balance"      value={fmt(totBal)} bg="var(--rose)" />
                <Chip label="Avg Interest Rate"       value={pct(wtRate)} bg="var(--teal)" />
              </div>
            )}

            <button className="btn btn-teal btn-full" onClick={() => goStep(2)}>
              Continue to Home Info
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
        )}

        {/* ── STEP 2: Your Home ──────────────────────────────────────────── */}
        {step === 2 && (
          <div className="card">
            <h3 className="card-heading">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
                <path d="M9 21V12h6v9" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
              </svg>
              Your Home &amp; Mortgage
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
              <div>
                <label className="input-label">Current Home Value</label>
                <div className="input-prefix-wrap">
                  <span className="input-prefix">$</span>
                  <input type="number" className="form-input input-has-prefix"
                    placeholder="650000" value={homeValue}
                    onChange={(e) => setHomeValue(e.target.value)} />
                </div>
              </div>
              <div>
                <label className="input-label">Current Mortgage Balance</label>
                <div className="input-prefix-wrap">
                  <span className="input-prefix">$</span>
                  <input type="number" className="form-input input-has-prefix"
                    placeholder="350000" value={mtgBalance}
                    onChange={(e) => setMtgBalance(e.target.value)} />
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 16 }}>
              <div>
                <label className="input-label">Monthly Payment (P&amp;I)</label>
                <div className="input-prefix-wrap">
                  <span className="input-prefix">$</span>
                  <input type="number" className="form-input input-has-prefix"
                    placeholder="2200" value={mtgPayment}
                    onChange={(e) => setMtgPayment(e.target.value)} />
                </div>
              </div>
              <div>
                <label className="input-label">Current Mortgage Rate</label>
                <div className="input-suffix-wrap">
                  <input type="number" step="0.1" className="form-input input-has-suffix"
                    placeholder="3.5" value={mtgRate}
                    onChange={(e) => setMtgRate(e.target.value)} />
                  <span className="input-suffix">%</span>
                </div>
              </div>
              <div>
                <label className="input-label">Remaining Term (yrs)</label>
                <input type="number" className="form-input"
                  placeholder="27" value={mtgTerm}
                  onChange={(e) => setMtgTerm(e.target.value)} />
              </div>
            </div>

            {/* Equity chips */}
            {hv > 0 && mb > 0 && (
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
                <Chip label="Available Equity" value={fmt(hv - mb)} bg="var(--navy)" />
                <Chip label="Current LTV"      value={pct(mb / hv * 100)} bg="var(--teal)" />
              </div>
            )}

            <button className="btn btn-teal btn-full" onClick={() => goStep(3)}>
              See My Comparison
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
        )}

        {/* ── STEP 3: Comparison ────────────────────────────────────────── */}
        {step === 3 && (
          <div className="card">
            <h3 className="card-heading">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M3 3v18h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                <path d="M8 17l4-8 4 4 4-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Your Side-by-Side Comparison
            </h3>

            {/* Rate info badge */}
            <div style={{
              background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 6,
              padding: '8px 14px', fontSize: 12, color: '#0369a1', marginBottom: 18,
            }}>
              Using today's 30YR fixed rate: <strong>{RATE_30YR}%</strong> · 15YR: <strong>{RATE_15YR}%</strong>{' '}
              (source: MortgageNewsDaily, Apr 3 2026) — update as rates change
            </div>

            {/* Compare cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 18 }}>
              {/* Today */}
              <div style={{
                border: '2px solid var(--rose)', borderRadius: 10, padding: 18, textAlign: 'center',
              }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', color: 'var(--rose)', marginBottom: 8 }}>Today</div>
                <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--navy)' }}>{fmt(todayTotal)}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>Mortgage + all debts</div>
              </div>

              {/* Cash-out Refi */}
              <div style={{
                border: '2px solid var(--teal)', borderRadius: 10, padding: 18, textAlign: 'center',
              }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', color: 'var(--teal)', marginBottom: 8 }}>Est. Cash-Out Refi</div>
                <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--navy)' }}>{fmt(refiPmt)}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>New 30YR fixed</div>
                {refiSave > 0 && (
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#059669', marginTop: 6 }}>
                    Save {fmt(refiSave)}/mo
                  </div>
                )}
              </div>

              {/* HELOAN */}
              <div style={{
                border: '2px solid var(--navy)', borderRadius: 10, padding: 18, textAlign: 'center',
              }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', color: 'var(--navy)', marginBottom: 8 }}>Est. Fixed HELOAN</div>
                <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--navy)' }}>{fmt(heloanTotal)}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>Keep mortgage + HELOAN</div>
                {heloanSave > 0 && (
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#059669', marginTop: 6 }}>
                    Save {fmt(heloanSave)}/mo
                  </div>
                )}
              </div>
            </div>

            {/* HELOAN options */}
            <div style={{ display: 'flex', gap: 14, marginBottom: 18, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <label className="input-label">HELOAN Credit Tier</label>
                <div className="select-wrap">
                  <select className="form-select" value={heloanTier}
                    onChange={(e) => setHeloanTier(parseFloat(e.target.value))}>
                    <option value="13.99">580–619 (est. 13.99%)</option>
                    <option value="11.99">620–659 (est. 11.99%)</option>
                    <option value="10.49">660–679 (est. 10.49%)</option>
                    <option value="8.99">680+ (est. 8.99%)</option>
                  </select>
                  <svg className="select-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
              </div>
              <div style={{ flex: 1, minWidth: 200 }}>
                <label className="input-label">HELOAN Term</label>
                <div className="select-wrap">
                  <select className="form-select" value={heloanTerm}
                    onChange={(e) => setHeloanTerm(parseInt(e.target.value))}>
                    <option value="5">5 Years</option>
                    <option value="10">10 Years</option>
                    <option value="15">15 Years</option>
                    <option value="30">30 Years</option>
                  </select>
                  <svg className="select-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
              </div>
            </div>

            {/* Refi breakdown */}
            <div style={{ background: 'var(--light-bg)', borderRadius: 10, padding: 16, marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)', marginBottom: 10 }}>
                Estimated Cash-Out Refinance Breakdown
              </div>
              <BreakdownRow label="New Loan Amount"       value={newLoan > 0 ? fmt(newLoan)    : '—'} />
              <BreakdownRow label="Rate (30YR fixed)"     value={pct(RATE_30YR)} />
              <BreakdownRow label="Monthly P&I Payment"   value={refiPmt > 0 ? fmt(refiPmt)    : '—'} />
              <BreakdownRow
                label="Monthly Savings vs. Today"
                value={refiSave > 0 ? fmt(refiSave) + '/mo' : newLoan > 0 ? 'No savings at this rate' : '—'}
                green bold
              />
            </div>

            {/* HELOAN breakdown */}
            <div style={{ background: 'var(--light-bg)', borderRadius: 10, padding: 16, marginBottom: 22 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)', marginBottom: 10 }}>
                Estimated Fixed-Rate HELOAN Breakdown
              </div>
              <BreakdownRow label="HELOAN Amount (total debt)" value={heloanAmt > 0 ? fmt(heloanAmt) : '—'} />
              <BreakdownRow
                label="HELOAN Rate / Term"
                value={heloanAmt > 0 ? `${pct(heloanTier)} / ${heloanTerm} yr` : '—'}
              />
              <BreakdownRow label="HELOAN Monthly Payment"    value={heloanPmt > 0 ? fmt(heloanPmt)   : '—'} />
              <BreakdownRow label="Existing Mortgage Payment" value={mp > 0 ? fmt(mp) : '—'} />
              <BreakdownRow label="Combined CLTV"             value={cltv > 0 ? pct(cltv) : '—'} />
              <BreakdownRow
                label="Blended Monthly Savings vs. Today"
                value={heloanSave > 0 ? fmt(heloanSave) + '/mo' : heloanAmt > 0 ? 'No savings at this rate' : '—'}
                green bold
              />
            </div>

            <button className="btn btn-rose btn-full" onClick={() => goStep(4)}>
              I Want to See My Actual Numbers
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
        )}

        {/* ── STEP 4: Lead form ─────────────────────────────────────────── */}
        {step === 4 && !submitted && (
          <div className="card">
            <h3 className="card-heading" style={{ fontSize: 20, marginBottom: 6 }}>
              Let's Get You Real Numbers
            </h3>
            <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 22 }}>
              {bestSave > 0
                ? `A 15-minute call could free up ${fmt(bestSave)} every month — no hard pull, no obligation.`
                : 'A 15-minute call could free up real money every month — no hard pull, no obligation.'}
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label className="input-label">First Name</label>
                <input type="text" className="form-input" placeholder="First name"
                  value={fname} onChange={(e) => setFname(e.target.value)} />
              </div>
              <div>
                <label className="input-label">Last Name</label>
                <input type="text" className="form-input" placeholder="Last name"
                  value={lname} onChange={(e) => setLname(e.target.value)} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label className="input-label">Phone Number</label>
                <input type="tel" className="form-input" placeholder="(714) 000-0000"
                  value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
              <div>
                <label className="input-label">Email Address</label>
                <input type="email" className="form-input" placeholder="you@email.com"
                  value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
              <div>
                <label className="input-label">Best Time to Call</label>
                <div className="select-wrap">
                  <select className="form-select" value={bestTime}
                    onChange={(e) => setBestTime(e.target.value)}>
                    <option>Morning (8am–12pm)</option>
                    <option>Afternoon (12pm–5pm)</option>
                    <option>Evening (5pm–8pm)</option>
                  </select>
                  <svg className="select-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
              </div>
              <div>
                <label className="input-label">How Did You Find Me?</label>
                <div className="select-wrap">
                  <select className="form-select" value={leadSrc}
                    onChange={(e) => setLeadSrc(e.target.value)}>
                    <option>YouTube</option>
                    <option>Google</option>
                    <option>Referral</option>
                    <option>Other</option>
                  </select>
                  <svg className="select-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
              </div>
            </div>

            {/* Book a call block */}
            <div style={{
              background: 'var(--light-bg)', border: '1px solid #e2e5ed',
              borderRadius: 10, padding: 18, marginBottom: 18,
            }}>
              <strong style={{ color: 'var(--navy)', display: 'block', marginBottom: 6 }}>
                Book a call with Darren
              </strong>
              <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 12 }}>
                Skip the wait — pick a time that works for you and get your personalized
                savings review in 15 minutes.
              </p>
              <button onClick={openCalendly} className="btn btn-rose btn-sm">
                Schedule a Free 15-Min Call
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2"/>
                  <path d="M16 2v4M8 2v4M3 10h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </button>
            </div>

            <button className="btn btn-rose btn-full" onClick={submitLead}>
              Get My Free Savings Analysis
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M22 2L11 13M22 2L15 22l-4-9-9-4 20-7z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
        )}

        {/* ── Success state ─────────────────────────────────────────────── */}
        {submitted && (
          <div style={{
            background: '#f0fdf4', border: '1px solid #86efac',
            borderRadius: 12, padding: 28, textAlign: 'center',
          }}>
            <svg viewBox="0 0 52 52" fill="none" style={{ width: 52, height: 52, margin: '0 auto 14px' }}>
              <circle cx="26" cy="26" r="24" stroke="#2ecc71" strokeWidth="3"/>
              <path d="M14 26l9 9 16-16" stroke="#2ecc71" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <h3 style={{ color: '#166534', fontSize: 20, fontWeight: 700, marginBottom: 8 }}>
              You're all set!
            </h3>
            <p style={{ color: '#166534', marginBottom: 8, fontSize: 14 }}>
              Thanks! Darren will reach out within 1 business day to review your personalized savings estimate.
            </p>
            <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Questions? Call or text:{' '}
              <a href="tel:7148875432" style={{ color: 'var(--navy)', fontWeight: 600 }}>
                (714) 887-5432
              </a>
            </p>
          </div>
        )}

        {/* Disclaimer */}
        <p style={{
          fontSize: 11, color: 'var(--text-muted)', marginTop: 24, lineHeight: 1.6,
          borderTop: '1px solid #e2e5ed', paddingTop: 14,
        }}>
          <strong>Important Disclosures:</strong> This tool provides estimates for educational
          purposes only. Actual rates, terms, and monthly payments depend on creditworthiness,
          property appraisal, loan-to-value ratio, and lender approval. Not a commitment to
          lend. HELOAN parameters based on Figure Wholesale guidelines and are subject to
          change. Rates shown reflect MortgageNewsDaily index data and are not guaranteed.
          All loans subject to underwriting approval. Equal Housing Opportunity.
          <br /><br />
          <strong>Darren Tsai</strong> · Senior Loan Officer · NMLS# 2438102 · DRE# 02103705
          · Licensed with Saxton Mortgage. For licensing information, visit{' '}
          <a href="https://www.nmlsconsumeraccess.org" target="_blank" rel="noopener noreferrer"
            style={{ color: 'var(--navy)' }}>
            nmlsconsumeraccess.org
          </a>.
        </p>

      </div>

      {/* Sticky savings bar */}
      {bestSave > 0 && (
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0,
          background: 'var(--rose)', color: '#fff',
          textAlign: 'center', padding: '12px 16px',
          fontSize: 13, fontWeight: 600, zIndex: 99,
          boxShadow: '0 -2px 12px rgba(0,0,0,0.15)',
        }}>
          Best estimate: save {fmt(bestSave)}/month — talk to Darren today
        </div>
      )}
    </section>
  );
}
