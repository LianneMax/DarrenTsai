import { useState, useEffect, useRef } from 'react';
import { z } from 'zod';
import { isValidPhoneNumber } from 'libphonenumber-js';
import { RATES_ENDPOINT, EMAIL } from '../config';
import { useLeadSubmit } from '../hooks/useLeadSubmit';
import { openCalendly as openCalendlyPopup } from '../utils/calendly';
import { type EmailSuggestion } from '../utils/emailSuggest';
import DebtPage, { type DebtPageView } from './DebtPageViews';
import { type DebtOption } from './debtOptions';

const emailSchema = z.string().email();

// Fallback rates — overridden by live FRED data on mount
const _RATE_30YR = 6.41;
const _RATE_15YR = 6.01;

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

// Was a second local copy of the shared helper, which assumed the widget had
// been eagerly loaded in <head>. Re-exported here so the call sites below are
// untouched.
const openCalendly = openCalendlyPopup;

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

/**
 * The debt consolidation calculator on /debt-consolidation/: its state, rates,
 * gates and lead. DebtPageViews.tsx draws it from the `view` built below and
 * computes nothing, so the layout cannot disagree with the numbers.
 *
 * Until revamp phase 4 (9 Oct) the homepage drew this same component in a
 * layout of its own, sticky savings bar included. The homepage became the goal
 * hub and that layout was removed on 10 Oct; the lead is unchanged (source
 * DebtConsolidation, form id debt-savings-calculator).
 */
export default function DebtSavingsCalculator() {
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
  // No type either. Pre-labelling the rows "Credit Card" and "Auto Loan" meant
  // someone with two cards typed their second card into a row that says Auto
  // Loan, and the type travels in the payload and the rescue email.
  const [debts, setDebts] = useState<Debt[]>([
    { id: 1, type: '', bal: 0, pmt: 0, rate: 0 },
    { id: 2, type: '', bal: 0, pmt: 0, rate: 0 },
  ]);

  // Home
  const [homeValue,  setHomeValue]  = useState('');
  const [mtgBalance, setMtgBalance] = useState('');
  const [mtgPayment, setMtgPayment] = useState('');
  const [mtgRate,    setMtgRate]    = useState('');
  const [mtgTerm,    setMtgTerm]    = useState('');

  // HELOAN options
  //
  // Empty, not 8.99 and 10. They opened pre-answered at the best credit tier
  // (680+) and a 10-year term, so a visitor who never looked at them was shown
  // a saving priced at a credit score nobody asked about, and that figure went
  // to the Sheet as Monthly Savings. Someone at 600 would have seen a very
  // different number. Strings because "not chosen" has no numeric value.
  const [heloanTier, setHeloanTier] = useState('');
  const [heloanTerm, setHeloanTerm] = useState('');

  // Which option the visitor wants to talk about, on /debt-consolidation/ only.
  // It is shown back to them on the confirmation and is NOT in the lead: the
  // payload below is deliberately unchanged by the redesign, so the page works
  // against the Sheet as it is today and as it will be after the migration.
  const [chosen, setChosen] = useState<DebtOption>('');

  // Lead form
  const [fname,     setFname]     = useState('');
  const [lname,     setLname]     = useState('');
  const [phone,     setPhone]     = useState('');
  const [email,     setEmail]     = useState('');
  const [emailHint, setEmailHint] = useState<EmailSuggestion | null>(null);
  // Both empty. They opened on "Morning" and "YouTube", and both were written
  // to the Sheet as the visitor's answer: Best Time to Call and Lead Source
  // were the form's own defaults on every untouched submit. They stay optional,
  // so an untouched dropdown sends blank rather than blocking the lead.
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
  // A balance of 0 is a real answer: the home is paid off (10 Oct). So whether
  // a balance was given is read from the field, not from mb, which is 0 either
  // way. The equity and ADU pages already worked like this; this page refused
  // a paid-off home outright.
  const balanceGiven = mtgBalance.trim() !== '' && (parseFloat(mtgBalance) || 0) >= 0;

  const todayTotal = totPmt + mp;
  const newLoan    = mb + totBal;
  const refiPmt    = calcPmt(newLoan, rate30, 30);
  const refiSave   = todayTotal - refiPmt;
  /**
   * The cash-out loan as a share of the home's value. The refi above rolls every
   * debt into the new mortgage whatever that comes to, and many lenders stop a
   * cash-out refinance at 80%. The page says so past that line rather than
   * capping the figure (Max, 10 Oct): the cap varies by lender and program, and
   * Darren is the one who knows it.
   */
  const refiLtv    = hv > 0 ? newLoan / hv * 100 : 0;

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

  // Nothing is priced until the visitor says at what credit and over how long.
  // Both are 0 while unchosen, calcPmt returns 0 for a 0 rate or a 0 term, and
  // every figure below is guarded on that, so the HELOAN column shows no
  // payment and no saving rather than the best-case one.
  const tierRate  = parseFloat(heloanTier) || 0;
  const tierYears = parseInt(heloanTerm, 10) || 0;
  const heloanPriced = tierRate > 0 && tierYears > 0;

  const heloanAmt   = hv > 0 && balanceGiven ? Math.max(Math.min(totBal, hv * 0.85 - mb), 0) : 0;
  const heloanPmt   = heloanPriced ? calcPmt(heloanAmt, tierRate, tierYears) : 0;
  /**
   * What stays when the HELOAN cannot reach all the debt.
   *
   * WHY. The 85% limit can leave the loan short of the debts, and the combined
   * payment used to be the mortgage plus the HELOAN alone: the debts it did not
   * pay off simply vanished from the comparison, so the "saving" was overstated
   * by their whole payment. Those debts keep their payments, so they are added
   * back, in proportion to the balance the loan leaves (Max, 10 Oct; the
   * revamp brief's formula guide says the same). Which debts would actually be
   * cleared is Darren's conversation; a share of the balance is the neutral
   * assumption.
   */
  const heloanLeftShare = heloanAmt > 0 && totBal > heloanAmt ? (totBal - heloanAmt) / totBal : 0;
  const leftoverPmt = totPmt * heloanLeftShare;
  const heloanTotal = heloanPmt > 0 ? mp + heloanPmt + leftoverPmt : 0;
  const heloanSave  = heloanPmt > 0 ? todayTotal - heloanTotal : 0;
  const cltv        = hv > 0 ? (mb + heloanAmt) / hv * 100 : 0;

  /**
   * The better of the priced options, SIGNED, for the Sheet's Monthly Savings
   * (R1). It used to be floored at 0, which made a visitor whose every option
   * costs more look the same as one who never reached the comparison.
   * Negative means the payment goes up by that much. The HELOAN only counts
   * once it has been priced.
   */
  const bestSigned = heloanPmt > 0 ? Math.max(refiSave, heloanSave) : refiSave;

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
  // A mortgage needs its payment; a paid-off home (balance 0) has none to give.
  const hasHome = hv > 0 && balanceGiven && (mb === 0 || mp > 0);
  const furthestStep = !hasDebt ? 1 : !hasHome ? 2 : 4;
  const gateMessage = !hasDebt
    ? 'Add at least one debt with a balance and a monthly payment, so the comparison is about your money and not an example.'
    : 'Enter your home value, your mortgage balance (0 if the home is paid off) and, if you have a mortgage, its monthly payment. Without them there is nothing to compare your debts against.';

  // ── Handlers ───────────────────────────────────────────────────────────────

  const addDebt = () =>
    setDebts(prev => [...prev, { id: uid(), type: '', bal: 0, pmt: 0, rate: 0 }]);

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
      // Signed: negative means the best priced option still raises the payment.
      // It used to be sent only when positive, so "costs more" and "never
      // computed" were the same blank cell. (Best Time to Call and Lead Source
      // are no longer sent: R1 drops their columns.)
      monthlySavings: Math.round(bestSigned),
      homeValue: hv, mortgageBalance: mb, mortgagePayment: mp,
      // The equity snapshot step 2 shows, so Darren reads the same two numbers
      // the visitor saw. Named as the equity and ADU pages name them, so one
      // header reads one field on every tab. A paid-off home (balance 0) has
      // its whole value as equity and an LTV of 0, both real answers.
      estimatedEquity: hv > 0 && balanceGiven ? Math.round(hv - mb) : '',
      currentLtv: hv > 0 && balanceGiven ? Math.round(mb / hv * 1000) / 10 : '',
      // The "Today" figure: mortgage payment plus every debt payment.
      currentMonthlyPayment: Math.round(todayTotal),
      // Balance-weighted, the figure on the step 1 chip. Blank when no debt
      // carries a rate, since 0% is not what "no rate entered" means.
      weightedAvgRate: wtRate > 0 ? Math.round(wtRate * 100) / 100 : '',
      // Optional, and sent as 0 when not given. Darren reads these before he
      // calls: the rate they are giving up and the years they have left are the
      // first two things that decide whether a consolidation is worth doing.
      // Blank, not 0. A 0% mortgage rate and a 0-year term read as answers,
      // and both fields are optional.
      mortgageRate: mr > 0 ? mr : '', mortgageTerm: mt > 0 ? mt : '',
      totalDebtBalance: totBal, totalDebtPayment: totPmt,
      refiMonthlyPayment: Math.round(refiPmt),
      refiMonthlySavings: Math.round(refiSave),
      // The same-payoff option. Blank unless the visitor gave a remaining term
      // to price it at.
      refiSameTermPayment: refiSameTermPmt > 0 ? Math.round(refiSameTermPmt) : '',
      refiSameTermSavings: refiSameTermPmt > 0 ? Math.round(refiSameTermSave) : '',
      heloanMonthlyPayment: heloanPmt > 0 ? Math.round(heloanPmt) : '',
      // Signed once priced, blank until then.
      heloanMonthlySavings: heloanPmt > 0 ? Math.round(heloanSave) : '',
      // The two answers the HELOAN figures were priced at, so Darren can see
      // what assumption produced them. Without these a saving quoted at 680+
      // is indistinguishable from one quoted at 580.
      heloanCreditTier: heloanTier, heloanTermYears: heloanTerm,
      // The PMMS week the refi figures were priced from. Blank when the rates
      // call failed and the static fallback did the pricing.
      rateSourceDate: ratesLive ? rateDate : '',
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

  // ── Handed to the page: where the rates came from, the full disclosure,
  // and the error dialog.

  const rateBadge = (
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
  );

  const disclosure = (
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
        style={{ color: 'var(--navy)', textDecoration: 'underline' }}>
        nmlsconsumeraccess.org
      </a>.
    </p>
  );

  const overlays = (
    <>
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
                className="btn btn-teal btn-full"
                onClick={() => setErrorMsg(null)}
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );

  // ── Render: /debt-consolidation/ ────────────────────────────────────────────

  const view: DebtPageView = {
    step, goStep,
    debts, addDebt, removeDebt, updateDebt,
    totPmt, totBal, wtRate, hasDebt,
    homeValue, setHomeValue, mtgBalance, setMtgBalance, mtgPayment, setMtgPayment,
    mtgRate, setMtgRate, mtgTerm, setMtgTerm,
    hv, mb, mp, mr, mt, hasHome, balanceGiven,
    rate30, todayTotal, newLoan, refiPmt, refiSave, refiLtv,
    sameTermYears, refiSameTermPmt, refiSameTermSave, yearsAdded,
    heloanTier, setHeloanTier, heloanTerm, setHeloanTerm,
    tierRate, tierYears, heloanPriced, heloanAmt, heloanPmt, leftoverPmt, heloanTotal, heloanSave, cltv,
    chosen, setChosen,
    fname, setFname, lname, setLname, phone, setPhone, email, setEmail,
    emailHint, setEmailHint, usState, setUsState,
    sending, submitted, submitLead, openCalendly,
    rateBadge, disclosure,
  };
  return <DebtPage v={view} overlays={overlays} />;


}
