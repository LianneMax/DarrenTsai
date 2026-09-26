import { useState, useEffect, useRef } from 'react';
import { z } from 'zod';
import { isValidPhoneNumber, AsYouType } from 'libphonenumber-js';
import { useScrollReveal } from '../hooks/useScrollReveal';
import { RATES_ENDPOINT, EMAIL, SAVINGS_RANGE, LICENSED_STATES, isLicensedState } from '../config';
import { useLeadSubmit } from '../hooks/useLeadSubmit';
import { openCalendly as openCalendlyPopup } from '../utils/calendly';
import CustomSelect from './CustomSelect';
import StateSelect from './StateSelect';
import { checkEmail, emailHintMessage, type EmailSuggestion } from '../utils/emailSuggest';

const emailSchema = z.string().email();

// Fallback rates — overridden by live FRED data on mount
const _RATE_30YR = 6.41;
const _RATE_15YR = 6.01;

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

// Was a second local copy of the shared helper, which assumed the widget had
// been eagerly loaded in <head>. Re-exported here so the call sites below are
// untouched.
const openCalendly = openCalendlyPopup;

// ─── Shared sub-components ───────────────────────────────────────────────────

function Chip({ label, value, bg }: { label: string; value: string; bg: string }) {
  return (
    <div style={{
      background: '#fff', padding: '10px 18px',
      borderRadius: 10, flex: 1, minWidth: 140,
      border: '2px solid #e2e5ed',
      boxShadow: '0 2px 10px rgba(0,0,0,0.07)',
    }}>
      <div style={{ fontSize: 11, marginBottom: 3, color: 'var(--text-muted)' }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: bg }}>{value}</div>
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
      color: green ? '#35785C' : 'inherit',
    }}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

const FRED_FALLBACK_30 = _RATE_30YR;
const FRED_FALLBACK_15 = _RATE_15YR;

/**
 * Current rates, from our own /api/rates function.
 *
 * It used to call api.stlouisfed.org directly, which cannot work from a
 * browser: FRED sends no CORS headers, so the request is blocked. The server
 * makes the call now, which also keeps the API key out of this bundle.
 *
 * Returns null on any failure, and the caller keeps the static fallbacks and
 * says as much in the caption. Rates are decision-shaped information, so a
 * wrong number is worse than an openly stale one.
 */
async function fetchRates(): Promise<{ rate30: number; rate15: number | null; asOf: string } | null> {
  try {
    const res = await fetch(RATES_ENDPOINT);
    if (!res.ok) return null;
    const json = await res.json();
    if (typeof json?.rate30 !== 'number') return null;
    return {
      rate30: json.rate30,
      rate15: typeof json.rate15 === 'number' ? json.rate15 : null,
      asOf: typeof json.asOf === 'string' ? json.asOf : '',
    };
  } catch {
    return null;
  }
}

/** Renders a FRED observation date (2026-09-18) as "18 Sep 2026". */
function formatRateDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export default function DebtSavingsCalculator() {
  const headerRef  = useScrollReveal<HTMLDivElement>();
  const stepsRef   = useScrollReveal<HTMLDivElement>(80);
  const contentRef = useScrollReveal<HTMLDivElement>(160);

  const [step, setStep] = useState(1);

  // Current rates, fetched on mount. No deploy is involved: a new weekly PMMS
  // release shows up on the site within one cache window of /api/rates.
  const [rate30, setRate30] = useState(FRED_FALLBACK_30);
  const [rate15, setRate15] = useState(FRED_FALLBACK_15);
  const [rateDate, setRateDate] = useState('');
  const [ratesLive, setRatesLive] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchRates().then((rates) => {
      if (cancelled || !rates) return; // failed: keep the static fallbacks
      setRate30(rates.rate30);
      if (rates.rate15 !== null) setRate15(rates.rate15);
      setRateDate(rates.asOf);
      setRatesLive(true);
    });
    return () => { cancelled = true; };
  }, []);

  // Debts
  //
  // WHY THESE START EMPTY. They used to load pre-filled with a $8,500 credit
  // card and an $18,000 auto loan. The inputs render `value={d.bal || ''}`, so a
  // zero shows the placeholder and reads as an example, but a real number reads
  // as the visitor's own. Both 26 Sep test leads walked straight past step 1 and
  // sent $26,500 of debt and $670/mo that nobody had typed, which reached the
  // Sheet and reached Darren as fact. An empty row cannot lie about a stranger's
  // finances; the placeholders still show what the field wants.
  const [debts, setDebts] = useState<Debt[]>([
    { id: 1, type: 'Credit Card', bal: 0, pmt: 0, rate: 0 },
    { id: 2, type: 'Auto Loan',   bal: 0, pmt: 0, rate: 0 },
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
  const [emailHint, setEmailHint] = useState<EmailSuggestion | null>(null);
  const [bestTime,  setBestTime]  = useState('Morning (8am–12pm)');
  const [leadSrc,   setLeadSrc]   = useState('YouTube');
  const [usState,   setUsState]   = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [errorMsg,  setErrorMsg]  = useState<string | null>(null);
  // The button used to stay live through the request, so a double click wrote
  // two Sheet rows and created two Bonzo prospects for one person. LeadForm has
  // always guarded this; this was the one form that did not.
  const [sending,   setSending]   = useState(false);
  // State alone was not enough. `sending` is read from the render that is already
  // on screen, and React has not re-rendered by the time a second click lands in
  // the same tick, so `b.click(); b.click()` still sent two requests: two Sheet
  // rows 2 ms apart, two Follow-ups, and a Bonzo 422 that mailed Darren a LEAD
  // PIPELINE FAILURE for a lead that had in fact arrived. A ref is written
  // synchronously, so the second click sees it. The state stays, because it is
  // what re-renders the button.
  const inFlight = useRef(false);

  const postLead = useLeadSubmit({
    formId: 'debt-savings-calculator',
    thankYouPath: '/thank-you/debt-savings',
    thankYouTitle: 'Thank You — Debt Savings',
  });

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
  const refiPmt    = calcPmt(newLoan, rate30, 30);
  const refiSave   = todayTotal - refiPmt;

  // The borrower's current mortgage, as they described it. Both are optional:
  // every number above is computed without them, because the visitor gives us
  // their current payment directly and that is all the comparison needs.
  const mr = parseFloat(mtgRate) || 0;
  const mt = parseFloat(mtgTerm) || 0;

  /**
   * The same-payoff-date option.
   *
   * WHY THIS IS HERE. The refi above re-amortises everything over a fresh 30
   * years. Someone three years into a 30-year at 3.5% has 27 years left, and
   * silently handing them 30 more at today's higher rate makes the monthly
   * saving look better than the trade really is. That is the standard and fair
   * criticism of a consolidation refi, and the two fields below were being
   * collected and then thrown away, so the tool had the answer and never used it.
   *
   * Run at the term they have left, the saving usually survives anyway: it is
   * the 24.99% card rate doing the damage, not the mortgage term. So this is the
   * stronger case to show a borrower, not the weaker one.
   *
   * Everything here stays 0 unless both fields are filled in, and every use of
   * it is guarded, so leaving them blank behaves exactly as before.
   */
  const sameTermYears   = mt > 0 ? Math.min(Math.max(mt, 5), 30) : 0;
  const refiSameTermPmt = sameTermYears > 0 ? calcPmt(newLoan, rate30, sameTermYears) : 0;
  const refiSameTermSave = refiSameTermPmt > 0 ? todayTotal - refiSameTermPmt : 0;
  /** Years the 30-year option adds back onto their payoff date. */
  const yearsAdded      = mt > 0 && mt < 30 ? 30 - mt : 0;

  const heloanAmt   = hv > 0 && mb > 0 ? Math.max(Math.min(totBal, hv * 0.85 - mb), 0) : 0;
  const heloanPmt   = calcPmt(heloanAmt, heloanTier, heloanTerm);
  const heloanTotal = mp + heloanPmt;
  const heloanSave  = todayTotal - heloanTotal;
  const cltv        = hv > 0 ? (mb + heloanAmt) / hv * 100 : 0;

  const bestSave = Math.max(refiSave > 0 ? refiSave : 0, heloanSave > 0 ? heloanSave : 0);

  /**
   * How far the visitor is allowed to go.
   *
   * WHY THIS EXISTS. With the example debts removed, an untouched tool computes
   * from nothing: step 3 used to render "HELOAN $0/mo" beside "Save $670/mo",
   * which is not a comparison, it is a contradiction shown to a stranger. The
   * grey placeholders (650000, 350000) also read as pre-filled values, so a
   * visitor could reach the comparison believing the tool had their numbers.
   *
   * The gate covers the pill tabs as well as the Continue buttons, because the
   * tabs jump to any step directly and were the easier way past this. Going
   * backwards is always allowed: re-reading what you typed is not a risk.
   */
  const hasDebt = debts.some(d => (d.bal || 0) > 0 && (d.pmt || 0) > 0);
  const hasHome = hv > 0 && mb > 0 && mp > 0;
  const furthestStep = !hasDebt ? 1 : !hasHome ? 2 : 4;
  const gateMessage = !hasDebt
    ? 'Add at least one debt with a balance and a monthly payment, so the comparison is about your money and not an example.'
    : 'Enter your home value, mortgage balance and monthly payment. Without them there is nothing to compare your debts against.';

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
    if (n > step && n > furthestStep) {
      setErrorMsg(gateMessage);
      return;
    }
    setStep(n);
    setTimeout(() => {
      document.getElementById('savings')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);
  };

  const submitLead = async () => {
    // Belt and braces with the disabled button: a keyboard repeat or a second
    // click landing in the same tick would otherwise still get through.
    if (inFlight.current || sending) return;
    if (!fname || !phone || !email || !usState) {
      setErrorMsg('Please fill in your name, phone, email, and state.');
      return;
    }
    if (!emailSchema.safeParse(email.trim()).success) {
      setErrorMsg('Please enter a valid email address.');
      return;
    }
    if (!isValidPhoneNumber(phone.trim(), 'US')) {
      setErrorMsg('Please enter a valid US phone number.');
      return;
    }
    setErrorMsg('');

    const payload = {
      firstName: fname, lastName: lname, phone, email,
      state: usState,
      bestTimeToCall: bestTime, leadSource: leadSrc,
      monthlySavings: Math.round(bestSave),
      homeValue: hv, mortgageBalance: mb, mortgagePayment: mp,
      // Optional, and sent as 0 when not given. Darren reads these before he
      // calls: the rate they are giving up and the years they have left are the
      // first two things that decide whether a consolidation is worth doing.
      mortgageRate: mr, mortgageTerm: mt,
      totalDebtBalance: totBal, totalDebtPayment: totPmt,
      refiMonthlyPayment: Math.round(refiPmt),
      refiMonthlySavings: Math.round(refiSave),
      heloanMonthlyPayment: Math.round(heloanPmt),
      heloanMonthlySavings: Math.round(heloanSave),
      debts,
      source: 'DebtConsolidation',
      timestamp: new Date().toISOString(),
    };

    inFlight.current = true;
    setSending(true);
    const result = await postLead(payload);
    // Released on every path except success, where the form is replaced by the
    // success card and there is no button left to re-enable.
    if (!result.ok) {
      inFlight.current = false;
      setSending(false);
    }

    // A dead email domain is the one failure the visitor can still fix, and the
    // only one where nothing was saved. Keep them here with the server's message.
    if (!result.ok && result.kind === 'fieldError') {
      setErrorMsg(result.message);
      return;
    }

    if (!result.ok) {
      // Say so plainly rather than showing a success state we cannot stand
      // behind. The lead endpoint mails Darren a rescue copy on its own side,
      // but the visitor should still know their details may not have landed.
      setErrorMsg(
        "We couldn't save your details on our end. " +
        `Please try again in a moment, or email ${EMAIL} and Darren will pick it up.`
      );
      return;
    }

    setSubmitted(true)
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
        <div ref={headerRef} className="section-header reveal">
          <span className="section-eyebrow" style={{ color: 'var(--navy)' }}>Monthly Reset</span>
          <h2 className="section-title" style={{ color: 'var(--teal)' }}>Boost Your Monthly Cashflow</h2>
          {/* Names the products by the words a viewer arrives with. /yt/heloc and
              /yt/equity both land here, because HELOC and home-equity intent is
              served by this funnel and has no page of its own yet, and someone
              who has just watched a HELOC video needs to recognise that within a
              second of landing. */}
          <p className="section-sub">
            You have a low mortgage rate but "expensive" credit card and other debt.
            This tool compares your options for tapping your home's equity, a HELOAN or
            a cash-out refinance, to clear those high-interest bills and keep more cash
            every month.
          </p>
          {/* Said plainly rather than implied. A HELOC is a revolving line and
              this tool prices the two fixed alternatives, so claiming to be a
              HELOC calculator would be wrong; leaving the word out entirely sent
              every HELOC viewer looking for a page that does not exist. */}
          <p className="section-sub" style={{ marginTop: 10 }}>
            Looking at a HELOC? This compares the two fixed alternatives Darren places most
            often, so you can see what each one costs before you decide.
          </p>
          <ul style={{
            listStyle: 'none', padding: 0, margin: '16px auto 0',
            display: 'inline-flex', flexDirection: 'column', gap: 6,
            textAlign: 'left', color: 'var(--navy)', fontSize: '0.95rem',
          }}>
            {['Takes under 3 minutes.', 'Zero impact on your credit score.', 'No cost to see your numbers.'].map(item => (
              <li key={item} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flexShrink: 0, color: 'var(--teal)' }}>
                  <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                {item}
              </li>
            ))}
          </ul>
        </div>

        {/* Step indicator — pill tabs */}
        <div ref={stepsRef} className="reveal dsc-steps">
          {STEPS.map(({ n, label }) => {
            const isDone   = step > n;
            const isActive = step === n;
            return (
              <button
                key={n}
                onClick={() => goStep(n)}
                className="dsc-step-btn"
                style={{
                  background: isActive ? 'var(--teal)' : isDone ? '#fff' : 'transparent',
                  color: isActive ? '#fff' : isDone ? 'var(--teal)' : '#9ca3af',
                  boxShadow: isActive ? '0 2px 8px rgba(81,118,134,0.25)' : 'none',
                }}
              >
                {isDone ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
                    <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                ) : (
                  <span
                    className="dsc-step-num"
                    style={{
                      background: isActive ? 'rgba(255,255,255,0.2)' : '#d1d5db',
                      color: isActive ? '#fff' : '#6b7280',
                    }}
                  >
                    {n}
                  </span>
                )}
                <span className="dsc-step-label">{label}</span>
              </button>
            );
          })}
        </div>

        {/* ── Step content ────────────────────────────────────────────────── */}
        <div ref={contentRef} className="reveal">

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
              <div key={d.id} className="dsc-debt-card">
                <div className="dsc-debt-row">
                  {/* Type */}
                  <div>
                    <label className="input-label">Debt Type</label>
                    <CustomSelect
                      id={`debt-type-${d.id}`}
                      value={d.type}
                      options={DEBT_TYPES.map(t => ({ value: t, label: t }))}
                      onChange={(v) => updateDebt(d.id, 'type', v)}
                      placeholder="Select debt type…"
                    />
                  </div>

                  {/* Balance */}
                  <div>
                    <label className="input-label">Balance ($)</label>
                    <div className="input-prefix-wrap">
                      <span className="input-prefix">$</span>
                      <input
                        type="number" className="form-input input-has-prefix"
                        value={d.bal || ''} placeholder="e.g. 5000"
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
                        value={d.pmt || ''} placeholder="e.g. 150"
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
                        value={d.rate || ''} placeholder="e.g. 24.99"
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
                background: 'none', border: '2px dashed #9ca3af',
                color: '#6b7280', padding: '9px 16px', borderRadius: 8,
                cursor: 'pointer', fontSize: 13, fontWeight: 600,
                width: '100%', fontFamily: 'inherit', marginBottom: 16,
              }}
            >
              + Add Another Debt
            </button>

            {/* Totals chips */}
            {debts.length > 0 && (
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
                <Chip label="Total Monthly Payments" value={fmt(totPmt)} bg="var(--teal)" />
                <Chip label="Total Debt Balance"      value={fmt(totBal)} bg="var(--rose)" />
                <Chip label="Avg Interest Rate"       value={pct(wtRate)} bg="var(--rose)" />
              </div>
            )}

            {!hasDebt && (
              <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 10 }}>
                Enter at least one debt to continue. The grey numbers are examples, not your figures.
              </p>
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

            <div className="dsc-grid-2" style={{ marginBottom: 14 }}>
              <div>
                <label className="input-label">Current Home Value</label>
                <div className="input-prefix-wrap">
                  <span className="input-prefix">$</span>
                  <input type="number" className="form-input input-has-prefix"
                    placeholder="e.g. 650000" value={homeValue}
                    onChange={(e) => setHomeValue(e.target.value)} />
                </div>
              </div>
              <div>
                <label className="input-label">Current Mortgage Balance</label>
                <div className="input-prefix-wrap">
                  <span className="input-prefix">$</span>
                  <input type="number" className="form-input input-has-prefix"
                    placeholder="e.g. 350000" value={mtgBalance}
                    onChange={(e) => setMtgBalance(e.target.value)} />
                </div>
              </div>
            </div>

            <div className="dsc-grid-3" style={{ marginBottom: 16 }}>
              <div>
                <label className="input-label">Monthly Payment (P&amp;I)</label>
                <div className="input-prefix-wrap">
                  <span className="input-prefix">$</span>
                  <input type="number" className="form-input input-has-prefix"
                    placeholder="e.g. 2200" value={mtgPayment}
                    onChange={(e) => setMtgPayment(e.target.value)} />
                </div>
              </div>
              <div>
                <label className="input-label">Current Mortgage Rate</label>
                <div className="input-suffix-wrap">
                  <input type="number" step="0.1" className="form-input input-has-suffix"
                    placeholder="e.g. 3.5" value={mtgRate}
                    onChange={(e) => setMtgRate(e.target.value)} />
                  <span className="input-suffix">%</span>
                </div>
              </div>
              <div>
                <label className="input-label">Remaining Term (yrs)</label>
                <input type="number" className="form-input"
                  placeholder="e.g. 27" value={mtgTerm}
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

            {!hasHome && (
              <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 10 }}>
                Home value, mortgage balance and monthly payment are needed for the comparison. The grey numbers are examples.
              </p>
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
              30YR fixed: <strong>{rate30.toFixed(2)}%</strong> · 15YR: <strong>{rate15.toFixed(2)}%</strong>{' '}
              &nbsp;·&nbsp;{ratesLive
                ? <>Freddie Mac PMMS via <a href="https://fred.stlouisfed.org/series/MORTGAGE30US" target="_blank" rel="noopener noreferrer" style={{ color: '#0369a1' }}>FRED®</a> · weekly average, as of {formatRateDate(rateDate)}</>
                : 'Static example range, not current market rates'
              }
            </div>

            {/* Compare cards */}
            <div className="dsc-compare-grid" style={{ marginBottom: 18 }}>
              {/* Today */}
              <div style={{
                border: '2px solid #e2e5ed', borderRadius: 10, padding: 18, textAlign: 'center', background: '#fff', boxShadow: '0 2px 10px rgba(0,0,0,0.07)',
              }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', color: 'var(--rose)', marginBottom: 8 }}>Today</div>
                <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--rose)' }}>{fmt(todayTotal)}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>Mortgage + all debts</div>
              </div>

              {/* Cash-out Refi */}
              <div style={{
                border: '2px solid #e2e5ed', borderRadius: 10, padding: 18, textAlign: 'center', background: '#fff', boxShadow: '0 2px 10px rgba(0,0,0,0.07)',
              }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', color: 'var(--teal)', marginBottom: 8 }}>Est. Cash-Out Refi</div>
                <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--teal)' }}>{fmt(refiPmt)}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>New 30YR fixed</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>
                  Est. APR: {(rate30 + 0.20).toFixed(2)}%
                </div>
                {refiSave > 0 && (
                  <div style={{
                    display: 'inline-block', marginTop: 8,
                    background: '#D5F4D2', color: '#35785C',
                    borderRadius: 20, padding: '3px 12px',
                    fontSize: 12, fontWeight: 700,
                  }}>
                    Save {fmt(refiSave)}/mo
                  </div>
                )}
                {/*
                  What the monthly saving costs. A borrower who knows they are
                  restarting the clock, and giving up a rate they will not see
                  again, can weigh this properly; one who is not told finds out
                  later. Only shown when they gave us the numbers to say it with.
                */}
                {(yearsAdded > 0 || mr > 0) && (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8, lineHeight: 1.5 }}>
                    {yearsAdded > 0 && <>Adds {yearsAdded} {yearsAdded === 1 ? 'year' : 'years'} to your payoff</>}
                    {yearsAdded > 0 && mr > 0 && <br />}
                    {mr > 0 && <>Trades your {mr.toFixed(2)}% rate for about {rate30.toFixed(2)}%</>}
                  </div>
                )}
              </div>

              {/*
                The same option without restarting the clock. Usually still shows
                a saving, because the card rates are what is doing the damage,
                not the mortgage term. Appears only once they tell us the term.
              */}
              {refiSameTermPmt > 0 && (
                <div style={{
                  border: '2px solid var(--teal)', borderRadius: 10, padding: 18, textAlign: 'center', background: '#fff', boxShadow: '0 2px 10px rgba(0,0,0,0.07)',
                }}>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', color: 'var(--teal)', marginBottom: 8 }}>Refi, Same Payoff Date</div>
                  <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--teal)' }}>{fmt(refiSameTermPmt)}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>New {sameTermYears}YR fixed</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>
                    Est. APR: {(rate30 + 0.20).toFixed(2)}%
                  </div>
                  {refiSameTermSave > 0 && (
                    <div style={{
                      display: 'inline-block', marginTop: 8,
                      background: '#D5F4D2', color: '#35785C',
                      borderRadius: 20, padding: '3px 12px',
                      fontSize: 12, fontWeight: 700,
                    }}>
                      Save {fmt(refiSameTermSave)}/mo
                    </div>
                  )}
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8, lineHeight: 1.5 }}>
                    Keeps your current payoff date
                  </div>
                </div>
              )}

              {/* HELOAN */}
              <div style={{
                border: '2px solid #e2e5ed', borderRadius: 10, padding: 18, textAlign: 'center', background: '#fff', boxShadow: '0 2px 10px rgba(0,0,0,0.07)',
              }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', color: 'var(--teal)', marginBottom: 8 }}>Est. Fixed HELOAN</div>
                <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--teal)' }}>{fmt(heloanTotal)}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>Keep mortgage + HELOAN</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>
                  Est. APR: {(heloanTier + 0.20).toFixed(2)}%
                </div>
                {heloanSave > 0 && (
                  <div style={{
                    display: 'inline-block', marginTop: 8,
                    background: '#D5F4D2', color: '#35785C',
                    borderRadius: 20, padding: '3px 12px',
                    fontSize: 12, fontWeight: 700,
                  }}>
                    Save {fmt(heloanSave)}/mo
                  </div>
                )}
              </div>
            </div>

            {/* HELOAN options */}
            <div style={{ display: 'flex', gap: 14, marginBottom: 18, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <label className="input-label">HELOAN Credit Tier</label>
                <CustomSelect
                  id="heloan-tier"
                  value={String(heloanTier)}
                  options={[
                    { value: '13.99', label: '580–619 (est. 13.99%)' },
                    { value: '11.99', label: '620–659 (est. 11.99%)' },
                    { value: '10.49', label: '660–679 (est. 10.49%)' },
                    { value: '8.99',  label: '680+ (est. 8.99%)' },
                  ]}
                  onChange={(v) => setHeloanTier(parseFloat(v))}
                  placeholder="Select credit tier…"
                />
              </div>
              <div style={{ flex: 1, minWidth: 200 }}>
                <label className="input-label">HELOAN Term</label>
                <CustomSelect
                  id="heloan-term"
                  value={String(heloanTerm)}
                  options={[
                    { value: '5',  label: '5 Years' },
                    { value: '10', label: '10 Years' },
                    { value: '15', label: '15 Years' },
                    { value: '30', label: '30 Years' },
                  ]}
                  onChange={(v) => setHeloanTerm(parseInt(v, 10))}
                  placeholder="Select term…"
                />
              </div>
            </div>

            {/* Refi breakdown */}
            <div style={{ background: 'var(--light-bg)', borderRadius: 10, padding: 16, marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)', marginBottom: 10 }}>
                Estimated Cash-Out Refinance Breakdown
              </div>
              <BreakdownRow label="New Loan Amount"       value={newLoan > 0 ? fmt(newLoan)    : '—'} />
              <BreakdownRow label="Rate (30YR fixed)"     value={pct(rate30)} />
              <BreakdownRow label="Estimated APR"         value={pct(rate30 + 0.20)} />
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
              <BreakdownRow label="Estimated APR"             value={pct(heloanTier + 0.20)} />
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
            {/* The visitor's own result, not a range. Step 3 has just shown them a
                number; quoting a different one here is what made the page read as
                sales copy rather than a tool. The range is only the fallback for
                the case where nothing could be computed. */}
            <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 22 }}>
              {bestSave > 0
                ? `Your numbers show about ${fmt(bestSave)} a month freed up. A 15-minute call confirms what is really available, no hard pull, no obligation.`
                : `A 15-minute call could free up ${SAVINGS_RANGE} every month, no hard pull, no obligation.`}
            </p>

            <div className="dsc-grid-2" style={{ marginBottom: 12 }}>
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

            <div className="dsc-grid-2" style={{ marginBottom: 12 }}>
              <div>
                <label className="input-label">Phone Number</label>
                <input type="tel" className="form-input" placeholder="(714) 000-0000"
                  value={phone} onChange={(e) => setPhone(new AsYouType('US').input(e.target.value))} />
              </div>
              <div>
                <label className="input-label">Email Address</label>
                <input type="email" className="form-input" placeholder="you@email.com"
                  value={email}
                  onChange={(e) => { setEmailHint(null); setEmail(e.target.value); }}
                  onBlur={(e) => setEmailHint(checkEmail(e.target.value))} />
                {/* Suggests, never blocks: a wrong guess must not stop a real address. */}
                {emailHint && (emailHint.kind === 'typo' ? (
                  <button type="button" className="email-hint"
                    onClick={() => { setEmail(emailHint.email); setEmailHint(null); }}>
                    {emailHintMessage(emailHint)}
                  </button>
                ) : (
                  <span className="email-hint">{emailHintMessage(emailHint)}</span>
                ))}
              </div>
            </div>

            <div className="dsc-grid-3" style={{ marginBottom: 20 }}>
              <div>
                <label className="input-label">Best Time to Call</label>
                <CustomSelect
                  id="best-time"
                  value={bestTime}
                  options={[
                    { value: 'Morning (8am–12pm)',   label: 'Morning (8am–12pm)' },
                    { value: 'Afternoon (12pm–5pm)', label: 'Afternoon (12pm–5pm)' },
                    { value: 'Evening (5pm–8pm)',    label: 'Evening (5pm–8pm)' },
                  ]}
                  onChange={setBestTime}
                  placeholder="Select a time…"
                />
              </div>
              <div>
                <label className="input-label">How Did You Find Me?</label>
                <CustomSelect
                  id="lead-src"
                  value={leadSrc}
                  options={[
                    { value: 'YouTube',  label: 'YouTube' },
                    { value: 'Google',   label: 'Google' },
                    { value: 'Referral', label: 'Referral' },
                    { value: 'Other',    label: 'Other' },
                  ]}
                  onChange={setLeadSrc}
                  placeholder="Select…"
                />
              </div>
              <div>
                <label className="input-label">State</label>
                <StateSelect id="us-state" value={usState} onChange={setUsState} placeholder="Select…" />
                {/* Said before they submit. The lead is still saved and Darren
                    still refers it; what was missing was telling the visitor. */}
                {usState && !isLicensedState(usState) && (
                  <span className="email-hint">
                    Darren is licensed in {LICENSED_STATES.join(' · ')}. Send your details anyway and
                    he will point you to someone who can help where you are.
                  </span>
                )}
              </div>
            </div>

            <button
              type="button"
              className="btn btn-rose btn-full"
              style={{ marginBottom: 18 }}
              onClick={submitLead}
              disabled={sending}
            >
              {sending ? (
                <>
                  <span className="btn-spinner" aria-hidden="true" />
                  Sending…
                </>
              ) : (
                <>
                  Get My Free Savings Analysis
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M22 2L11 13M22 2L15 22l-4-9-9-4 20-7z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </>
              )}
            </button>

            {/* Book a call block */}
            <div style={{
              background: 'var(--light-bg)', border: '1px solid #e2e5ed',
              borderRadius: 10, padding: 18,
            }}>
              <strong style={{ color: 'var(--navy)', display: 'block', marginBottom: 6 }}>
                Book a call with Darren
              </strong>
              <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 12 }}>
                Skip the wait, pick a time that works for you and get your personalized
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
          </div>
        )}

        {/* ── Success state ─────────────────────────────────────────────── */}
        {submitted && (
          <div className="success-state" style={{ padding: 28 }}>
            <div className="success-check" role="img" aria-label="Success">✓</div>
            <h3 className="success-heading">You're all set!</h3>
            <p className="success-body">
              Thanks! Darren will reach out within 1 business day to review your personalized savings estimate.
            </p>
            <button
              type="button"
              className="btn btn-outline-navy btn-full success-cta"
              onClick={openCalendly}
            >
              Book a Free Strategy Call
            </button>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 14 }}>
              Questions? Call or text:{' '}
              <a href="tel:7148875432" style={{ color: 'var(--navy)', fontWeight: 600 }}>
                (714) 887-5432
              </a>
            </p>
          </div>
        )}

        </div>{/* end step content */}

        {/* Disclaimer */}
        <p style={{
          fontSize: 11, color: 'var(--text-muted)', marginTop: 24, lineHeight: 1.6,
          borderTop: '1px solid #e2e5ed', paddingTop: 14,
        }}>
          <strong>Important Disclosures:</strong> This tool provides estimates for educational
          purposes only. Actual rates, terms, and monthly payments depend on creditworthiness,
          property appraisal, loan-to-value ratio, and lender approval. Not a commitment to
          lend. HELOAN parameters are based on current wholesale lender guidelines and are
          subject to change. Rates shown are Freddie Mac's Primary Mortgage Market Survey
          (PMMS) weekly national average, retrieved via FRED®, and are not a quote or a
          guarantee.
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
        <div
          role="button"
          tabIndex={0}
          onClick={openCalendly}
          onKeyDown={(e) => e.key === 'Enter' && openCalendly()}
          style={{
            position: 'fixed', bottom: 0, left: 0, right: 0,
            background: 'var(--rose)', color: '#fff',
            textAlign: 'center',
            padding: '12px 16px',
            paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
            fontSize: 13, fontWeight: 600, zIndex: 97,
            boxShadow: '0 -2px 12px rgba(0,0,0,0.15)',
            cursor: 'pointer',
          }}
        >
          {bestSave > 0
            ? `Your result: about ${fmt(bestSave)}/month freed up, talk to Darren today →`
            : `Most clients save ${SAVINGS_RANGE}/month, talk to Darren today →`}
        </div>
      )}

      {errorMsg && (
        <div
          className="modal-overlay"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="dsc-error-title"
          onClick={() => setErrorMsg(null)}
        >
          <div className="modal-panel" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ color: 'var(--rose)', flexShrink: 0 }}>
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
                  <path d="M12 8v4M12 16h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
                <h2 id="dsc-error-title" className="modal-title" style={{ fontSize: '1.15rem' }}>
                  Something's missing
                </h2>
              </div>
              <button
                className="modal-close"
                onClick={() => setErrorMsg(null)}
                aria-label="Close"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </button>
            </div>
            <div className="modal-body">
              <p className="modal-sub" style={{ marginBottom: 24 }}>{errorMsg}</p>
              <button
                className="btn btn-rose btn-full"
                onClick={() => setErrorMsg(null)}
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
