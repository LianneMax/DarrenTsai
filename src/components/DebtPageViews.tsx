import ServiceAreaFields from './ServiceAreaFields';
import JourneyTimeline from './JourneyTimeline';
import ComplianceDisclosure from './ComplianceDisclosure';
/**
 * The "Pay off high-interest debt" comparison on /home-equity/ (moved from the
 * retired /debt-consolidation/ on 15 Oct 2026; first drawn in revamp phase 2).
 *
 * PRESENTATION ONLY. Every number on this page is computed in
 * DebtSavingsCalculator.tsx, which also owns the gates, the validation and the
 * lead it posts, and hands all of it to these components as one `view` object.
 * Nothing here adds, rounds or prices anything. That split is deliberate:
 *
 *  - The homepage still shows the calculator in its old layout until phase 4,
 *    and two layouts over one set of formulas cannot disagree about a payment.
 *  - The lead is identical from both, so nothing downstream forks.
 *  - A step that sits behind two gates can be rendered here from plain props,
 *    which is how the tests read steps 2 to 4 without a browser.
 *
 * The layout, copy and flow follow the design preview (v4). Where the preview
 * and the site's rules differed, the rules won, as agreed on 8 Oct: every input
 * starts empty with an "e.g." placeholder, the HELOAN tier and term start
 * unchosen, rates and tiers are the calculator's own, amounts are computed,
 * and a payment that goes up is said in those words.
 */
import { formatUsPhone } from '../utils/phone';
import type { ReactNode } from 'react';
import { serviceArea } from '../utils/serviceArea';
import { BOOKING_CALENDAR_READY } from '../utils/booking';
import SavedLeadCalendar from './SavedLeadCalendar';
import { formatCurrency, formatRate } from '../utils/formatters';
import { savingsText, savingsRowText, RESULT_ROW_LABEL, BLENDED_ROW_LABEL } from '../utils/savingsText';
import { emailHintMessage, hintAfterBlur, type EmailSuggestion } from '../utils/emailSuggest';
import CustomSelect from './CustomSelect';
import AprEstimate from './AprEstimate';
import InquiryMessage from './InquiryMessage';
import { COMMON_CLTV_LIMIT } from '../utils/homeEquity';
import { DEBT_TYPES, HELOAN_TIERS, HELOAN_TERMS, type DebtOption } from './debtOptions';
import { Arrow, Check, Row, StepNav, EquitySnapshot } from './PageParts';

export interface DebtRow {
  id: number;
  type: string;
  bal: number;
  pmt: number;
  rate: number;
}

/** Everything the page shows, computed by DebtSavingsCalculator. */
export interface DebtPageView {
  step: number;
  goStep: (n: number) => void;

  debts: DebtRow[];
  addDebt: () => void;
  removeDebt: (id: number) => void;
  updateDebt: (id: number, field: 'type' | 'bal' | 'pmt' | 'rate', raw: string) => void;
  totPmt: number;
  totBal: number;
  wtRate: number;
  hasDebt: boolean;

  homeValue: string; setHomeValue: (v: string) => void;
  mtgBalance: string; setMtgBalance: (v: string) => void;
  mtgPayment: string; setMtgPayment: (v: string) => void;
  mtgRate: string; setMtgRate: (v: string) => void;
  mtgTerm: string; setMtgTerm: (v: string) => void;
  hv: number; mb: number; mp: number; mr: number; mt: number;
  hasHome: boolean;
  /** A balance was entered; 0 counts (a paid-off home). */
  balanceGiven: boolean;

  rate30: number;
  refiTerm: '30' | 'same'; setRefiTerm: (term: '30' | 'same') => void;
  aprFees: { heloan: string; refi: string }; setAprFee: (option: 'heloan' | 'refi', fees: string) => void;
  todayTotal: number;
  newLoan: number;
  refiPmt: number;
  refiSave: number;
  /** The cash-out loan as a % of the home's value. */
  refiLtv: number;
  sameTermYears: number;
  refiSameTermPmt: number;
  refiSameTermSave: number;
  yearsAdded: number;

  heloanTier: string; setHeloanTier: (v: string) => void;
  heloanTerm: string; setHeloanTerm: (v: string) => void;
  tierRate: number;
  tierYears: number;
  heloanPriced: boolean;
  heloanAmt: number;
  heloanPmt: number;
  /** Payments on the debt the HELOAN cannot reach, already inside heloanTotal. */
  leftoverPmt: number;
  heloanTotal: number;
  heloanSave: number;
  cltv: number;

  /** Illustration of borrowing room, distinct from a payment or approved limit. */
  helocRoom: number | null;
  /** The discussion choice is retained in the submission snapshot and recap. */
  chosen: DebtOption;
  setChosen: (o: DebtOption) => void;

  fname: string; setFname: (v: string) => void;
  lname: string; setLname: (v: string) => void;
  phone: string; setPhone: (v: string) => void;
  email: string; setEmail: (v: string) => void;
  emailHint: EmailSuggestion | null; setEmailHint: (h: EmailSuggestion | null) => void;
  propertyState: string; setPropertyState: (v: string) => void;
  propertyUse: string; setPropertyUse: (v: string) => void;
  message: string; setMessage: (v: string) => void;
  sending: boolean;
  submitted: boolean;
  submitLead: () => void;
  openBooking: () => void;

  /** The rate-source line and the full disclosure, the same elements the homepage shows. */
  rateBadge: ReactNode;
  disclosure: ReactNode;
}

/** The loan-to-value many lenders stop a cash-out refinance at. Said, not enforced. */
const CASH_OUT_LIMIT = 80;

const STEPS = [['Your debts','Start with your payments'],['Your home','The home behind the plan'],['Compare','Understand the tradeoffs'],['Talk to Darren','A personal next step']] as const;

// ─── Small pieces ─────────────────────────────────────────────────────────────

function Stat({ label, value, tone }: { label: string; value: string; tone: 'teal' | 'navy' }) {
  return (
    <div className="dcp-stat">
      <span className="dcp-stat-label">{label}</span>
      <span className={`dcp-stat-value dcp-${tone}`}>{value}</span>
    </div>
  );
}

function Verdict({ save }: { save: number }) {
  const saves = Math.round(save) > 0;
  // Green only for a saving. An increase is information, not an error, so it
  // is neutral rather than red.
  return <span className={`dcp-verdict${saves ? ' dcp-verdict-save' : ''}`}>{savingsText(save)}</span>;
}

const years = (n: number) => `${n} ${n === 1 ? 'year' : 'years'}`;

// ─── Step 1: debts ────────────────────────────────────────────────────────────

export function StepDebts({ v }: { v: DebtPageView }) {
  return (
    <div className="dcp-panel">
      <h2 className="dcp-h2">Your Current Monthly Debts</h2>

      {v.debts.map((d) => (
        <div key={d.id} className="dcp-debt">
          <div>
            <label className="input-label" htmlFor={`debt-type-${d.id}`}>Debt Type</label>
            <CustomSelect
              id={`debt-type-${d.id}`}
              value={d.type}
              options={DEBT_TYPES.map((t) => ({ value: t, label: t }))}
              onChange={(val) => v.updateDebt(d.id, 'type', val)}
              placeholder="Choose debt"
            />
          </div>
          <div>
            <label className="input-label" htmlFor={`debt-balance-${d.id}`}>Balance ($)</label>
            <div className="input-prefix-wrap">
              <span className="input-prefix">$</span>
              <input
                id={`debt-balance-${d.id}`} type="number" className="form-input input-has-prefix"
                value={d.bal || ''} placeholder="e.g. 5,000"
                onChange={(e) => v.updateDebt(d.id, 'bal', e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className="input-label" htmlFor={`debt-payment-${d.id}`}>Monthly Payment</label>
            <div className="input-prefix-wrap">
              <span className="input-prefix">$</span>
              <input
                id={`debt-payment-${d.id}`} type="number" className="form-input input-has-prefix"
                value={d.pmt || ''} placeholder="e.g. 150"
                onChange={(e) => v.updateDebt(d.id, 'pmt', e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className="input-label" htmlFor={`debt-rate-${d.id}`}>Interest Rate (%)</label>
            <div className="input-suffix-wrap">
              <input
                id={`debt-rate-${d.id}`} type="number" step="0.1" className="form-input input-has-suffix"
                value={d.rate || ''} placeholder="e.g. 24.99"
                onChange={(e) => v.updateDebt(d.id, 'rate', e.target.value)}
              />
              <span className="input-suffix">%</span>
            </div>
          </div>
          <button type="button" className="dcp-remove" onClick={() => v.removeDebt(d.id)} aria-label="Remove debt">
            ×
          </button>
        </div>
      ))}

      <button type="button" className="dcp-add" onClick={v.addDebt}>+ Add Another Debt</button>

      {v.debts.length > 0 && (
        <div className="dcp-stats">
          <Stat label="Total Monthly Payments" value={formatCurrency(v.totPmt)} tone="teal" />
          <Stat label="Total Debt Balance" value={formatCurrency(v.totBal)} tone="navy" />
          {/* Balance-weighted, which is what the label claims. */}
          <Stat label="Weighted Avg Interest Rate" value={formatRate(v.wtRate)} tone="navy" />
        </div>
      )}

      {!v.hasDebt && (
        <p className="dcp-hint">
          Enter at least one debt to continue. The grey numbers are examples, not your figures.
        </p>
      )}

      <button type="button" className="btn btn-teal btn-full" onClick={() => v.goStep(2)}>
        Continue to Home Info <Arrow />
      </button>
    </div>
  );
}

// ─── Step 2: home ─────────────────────────────────────────────────────────────

export function StepHome({ v }: { v: DebtPageView }) {
  return (
    <div className="dcp-panel">
      <h2 className="dcp-h2">Your Home &amp; Mortgage</h2>

      <div className="dcp-grid-2">
        <div>
          <label className="input-label" htmlFor="payoff-home-value">Current Home Value</label>
          <div className="input-prefix-wrap">
            <span className="input-prefix">$</span>
            <input id="payoff-home-value" type="number" className="form-input input-has-prefix"
              placeholder="e.g. 650,000" value={v.homeValue}
              onChange={(e) => v.setHomeValue(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="input-label" htmlFor="payoff-mortgage-balance">Current Mortgage Balance</label>
          <div className="input-prefix-wrap">
            <span className="input-prefix">$</span>
            <input id="payoff-mortgage-balance" type="number" className="form-input input-has-prefix"
              placeholder="e.g. 350,000" value={v.mtgBalance}
              onChange={(e) => v.setMtgBalance(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="dcp-grid-3">
        <div>
          <label className="input-label" htmlFor="payoff-mortgage-payment">Monthly Payment (P&amp;I)</label>
          <div className="input-prefix-wrap">
            <span className="input-prefix">$</span>
            <input id="payoff-mortgage-payment" type="number" className="form-input input-has-prefix"
              placeholder="e.g. 2,200" value={v.mtgPayment}
              onChange={(e) => v.setMtgPayment(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="input-label" htmlFor="payoff-mortgage-rate">Mortgage Rate <span className="dcp-optional">· optional</span></label>
          <div className="input-suffix-wrap">
            <input id="payoff-mortgage-rate" type="number" step="0.1" className="form-input input-has-suffix"
              placeholder="e.g. 3.5" value={v.mtgRate}
              onChange={(e) => v.setMtgRate(e.target.value)} />
            <span className="input-suffix">%</span>
          </div>
        </div>
        <div>
          <label className="input-label" htmlFor="payoff-mortgage-term">Remaining Term <span className="dcp-optional">· optional</span></label>
          <div className="input-suffix-wrap">
            <input id="payoff-mortgage-term" type="number" className="form-input input-has-suffix"
              placeholder="e.g. 27" value={v.mtgTerm}
              onChange={(e) => v.setMtgTerm(e.target.value)} />
            <span className="input-suffix">yrs</span>
          </div>
        </div>
      </div>

      <p className="dcp-hint">
        Home value, mortgage balance and monthly payment establish your comparison. If the home is
        paid off, enter 0 for the balance and leave the payment blank. Rate and remaining term add
        refinance context. The grey numbers are examples.
      </p>

      {v.hv > 0 && v.balanceGiven && <EquitySnapshot hv={v.hv} mb={v.mb} />}

      <StepNav
        back="← Back" onBack={() => v.goStep(1)}
        next={<>See My Comparison <Arrow /></>} onNext={() => v.goStep(3)}
      />
    </div>
  );
}

// ─── Step 3: comparison ───────────────────────────────────────────────────────

function OptionCard({ id, title, v, payment, scope, save, children, controls, unavailable, action }: {
  id: Exclude<DebtOption, ''>; title: string; v: DebtPageView;
  payment: number | null; scope: string; save: number;
  children: ReactNode; controls?: ReactNode; unavailable?: ReactNode; action: string;
}) {
  const selected = v.chosen === id;
  return <div className={`dcp-option${payment === null ? ' dcp-option-wait' : ''}${selected ? ' dcp-option-selected' : ''}`}>
    <span className="dcp-option-title">{title}</span>
    <span className={`dcp-option-pay${payment === null ? ' dcp-option-pay-text' : ''}`}>
      {payment === null ? (id === 'heloan' && v.hasHome && v.heloanAmt <= 0 ? 'No room at these figures' : id === 'refiSame' ? 'Term needed' : id === 'heloan' ? 'Choose assumptions' : 'Rate unavailable') : <>{formatCurrency(payment)}<small>/month</small></>}
    </span>
    <span className="dcp-option-scope">{scope}</span>
    {payment === null ? <span className="dcp-verdict">Payment difference pending</span> : <Verdict save={save} />}
    <div className="dcp-option-controls">{controls}</div>
    <div className="dcp-option-body">{payment === null ? unavailable : children}</div>
    <button type="button" className="dcp-pick" aria-pressed={selected}
      onClick={() => { v.setChosen(id); v.goStep(4); }}>{action} <Arrow /></button>
  </div>;
}

export function StepCompare({ v }: { v: DebtPageView }) {
  // A term toggle changes the illustration, not the visitor's expressed intent.
  // Only Discuss records refi/refiSame; the existing snapshot retains both calculations.
  const same = v.refiTerm === 'same';
  const refiYears = same ? v.sameTermYears : 30;
  const refiPayment = same ? v.refiSameTermPmt : v.refiPmt;
  const refiDifference = same ? v.refiSameTermSave : v.refiSave;
  const heloanNoRoom = v.hasHome && v.heloanAmt <= 0;
  const heloanShort = v.heloanAmt > 0 && v.heloanAmt < v.totBal;
  const paidOff = v.mb === 0;
  const refiOverLimit = v.refiLtv > CASH_OUT_LIMIT
    ? <>That is a new loan of about {Math.round(v.refiLtv)}% of your home&apos;s value; many lenders cap a cash-out refinance at {CASH_OUT_LIMIT}%. Darren can review what may be possible.</> : null;
  return <div className="dcp-panel">
    <h2 className="dcp-h2">Your Side-by-Side Comparison</h2>
    <div className="dcp-option dcp-option-today">
      <span className="dcp-option-title">Today</span>
      <span className="dcp-option-pay">{formatCurrency(v.todayTotal)}<small>/month</small></span>
      <span className="dcp-option-scope">{paidOff ? 'All debts (no mortgage)' : 'Mortgage P&I + all debts'}</span>
    </div>
    <p className="dcp-comparison-note">Compare your combined monthly payments. Taxes, insurance, HOA and closing costs are excluded; your actual obligation will be greater.</p>
    <p className="dcp-comparison-note"><strong>A lower monthly payment is not a calculation of total savings.</strong> A loan secured by your home can put your home at risk.</p>
    {v.rateBadge}
    <div className="dcp-options dcp-primary-options">
      <div className={`dcp-option dcp-option-heloc${v.chosen === 'heloc' ? ' dcp-option-selected' : ''}`}>
        <span className="dcp-option-title">HELOC</span>
        <span className={`dcp-option-pay${v.helocRoom === null ? ' dcp-option-pay-text' : ''}`}>{v.helocRoom === null ? 'Add home details' : formatCurrency(v.helocRoom)}</span>
        <span className="dcp-option-scope">Illustrative borrowing room<br />Not a monthly payment</span>
        <span className="dcp-verdict">Example at {COMMON_CLTV_LIMIT}% combined loan-to-value</span>
        <div className="dcp-option-controls"><p>{paidOff ? 'No mortgage to replace.' : 'Keeps your mortgage.'}<br />Usually a variable rate.</p></div>
        <div className="dcp-option-body">
          <p>Monthly payment needs a draw amount, rate and repayment terms.</p>
          <details className="dcp-card-details"><summary>How this amount is estimated</summary>
            <p>{v.helocRoom === null ? 'Enter your home value and mortgage details to see an example.' : <>{COMMON_CLTV_LIMIT}% of {formatCurrency(v.hv)}, less {formatCurrency(v.mb)} owed. {v.helocRoom === 0 && 'No borrowing room at this assumption. '}Other property liens reduce this amount. Illustration only; lender limits and eligibility vary.</>}</p>
          </details>
        </div>
        <button type="button" className="dcp-pick" aria-pressed={v.chosen === 'heloc'} onClick={() => {
          if (v.helocRoom === null) { v.goStep(2); return; }
          v.setChosen('heloc'); v.goStep(4);
        }}>{v.helocRoom === null ? 'Add home details' : 'Discuss a HELOC'} <Arrow /></button>
      </div>
      <OptionCard id="heloan" title="Fixed home equity loan" v={v}
        payment={v.heloanPriced && v.heloanPmt > 0 ? v.heloanTotal : null}
        scope={heloanShort ? (paidOff ? 'HELOAN + remaining debts' : 'Mortgage + HELOAN + remaining debts') : (paidOff ? 'HELOAN, the only loan on the home' : 'Combined mortgage + HELOAN')}
        save={v.heloanSave} action="Discuss equity loan"
        controls={!heloanNoRoom && <div className="dcp-loan-controls">
          <label className="input-label" htmlFor="heloan-tier">Credit range</label>
          <CustomSelect id="heloan-tier" value={v.heloanTier} options={HELOAN_TIERS} onChange={v.setHeloanTier} placeholder="Select range…" />
          <label className="input-label" htmlFor="heloan-term">Loan term</label>
          <CustomSelect id="heloan-term" value={v.heloanTerm} options={HELOAN_TERMS} onChange={v.setHeloanTerm} placeholder="Select term…" />
        </div>}
        unavailable={heloanNoRoom ? <>At these numbers there is no room under the 85% combined loan-to-value limit. Darren can review alternatives.</> : <>Pick your credit range and a term to estimate this option. A selected range is not a credit check.</>}>
        <p>{paidOff ? 'No mortgage to keep.' : 'Keeps your mortgage.'} New loan: {formatCurrency(v.heloanPmt)}/month for {years(v.tierYears)} at {formatRate(v.tierRate)} fixed.</p>
        <div className="dcp-card-apr">Estimated APR <AprEstimate principal={v.heloanAmt} rate={v.tierRate} years={v.tierYears} fees={v.aprFees.heloan} onFeesChange={fees => v.setAprFee('heloan', fees)} /></div>
        {heloanShort && <p>Only {formatCurrency(v.heloanAmt)} of your {formatCurrency(v.totBal)} debt is covered. The rest stays with its current lenders, about {formatCurrency(v.leftoverPmt)}/mo, and is included in the payment above.</p>}
      </OptionCard>
      <OptionCard id={same ? 'refiSame' : 'refi'} title="Cash-out refinance" v={v}
        payment={refiPayment > 0 ? refiPayment : null}
        scope={`Estimated P&I · new ${refiYears || '—'}YR fixed`} save={refiDifference} action="Discuss this refinance"
        controls={<div className="dcp-loan-controls">
          <label className="input-label" htmlFor="refi-comparison-term">Repayment term</label>
          <CustomSelect id="refi-comparison-term" value={v.refiTerm} onChange={term => v.setRefiTerm(term === 'same' ? 'same' : '30')} placeholder="Choose term"
            options={[{value:'30',label:'New 30 years'},{value:'same',label:'Same payoff date'}]} />
          {paidOff && <p className="dcp-hint">With no mortgage there is no payoff date to keep.</p>}
        </div>}
        unavailable={same && !paidOff ? <>Add your remaining term to see a refinance that keeps your current payoff date.<button type="button" className="dcp-link" onClick={() => v.goStep(2)}>Add mortgage details</button></> : <>A rate and repayment term are needed to estimate this payment.</>}>
        <p>{paidOff ? <>New mortgage of {formatCurrency(v.newLoan)} for your debts.</> : 'Mortgage: replaced.'} {formatRate(v.rate30)} fixed for {years(refiYears)}{!same && v.yearsAdded > 0 ? `, about ${years(v.yearsAdded)} longer` : ''}.</p>
        <div className="dcp-card-apr">Estimated APR <AprEstimate principal={v.newLoan} rate={v.rate30} years={refiYears} fees={v.aprFees.refi} onFeesChange={fees => v.setAprFee('refi', fees)} /></div>
        {refiOverLimit && <p>{refiOverLimit}</p>}
      </OptionCard>
    </div>
    <details className="dcp-details">
      <summary>What to compare beyond the monthly payment</summary>
      <p>Lower monthly payments do not necessarily mean lower total borrowing costs. Compare closing costs, interest over time and payoff dates. A refinance changes the rate on your entire mortgage. Debt previously unsecured becomes secured by your home.</p>
      {(heloanShort || heloanNoRoom) && <p>The refinance options pay off all {formatCurrency(v.totBal)} of your debts. The home equity loan may cover less.</p>}
    </details>
    <details className="dcp-details">
      <summary>Cash-out refinance calculation details</summary>
      <Row label="New Loan Amount" value={v.newLoan > 0 ? formatCurrency(v.newLoan) : '—'} />
      <Row label="Rate / term" value={`${formatRate(v.rate30)} / ${refiYears || '—'} yr`} />
      <Row label="Monthly P&I Payment" value={refiPayment > 0 ? formatCurrency(refiPayment) : '—'} />
      <Row strong label={RESULT_ROW_LABEL} value={refiPayment > 0 ? savingsRowText(refiDifference) : '—'} />
    </details>
    <details className="dcp-details">
      <summary>Fixed home equity loan calculation details</summary>
      <Row label="HELOAN Amount" value={v.heloanAmt > 0 ? formatCurrency(v.heloanAmt) : '—'} />
      <Row label="HELOAN Rate / Term" value={v.heloanPriced && v.heloanAmt > 0 ? `${formatRate(v.tierRate)} / ${v.tierYears} yr` : '—'} />
      <Row label="HELOAN Monthly Payment" value={v.heloanPmt > 0 ? formatCurrency(v.heloanPmt) : '—'} />
      <Row label="Existing Mortgage Payment" value={v.mp > 0 ? formatCurrency(v.mp) : '—'} />
      <Row label="Illustrative CLTV" value={v.cltv > 0 ? formatRate(v.cltv) : '—'} />
      <Row strong label={BLENDED_ROW_LABEL} value={v.heloanPriced && v.heloanPmt > 0 ? savingsRowText(v.heloanSave) : '—'} />
    </details>
    <p id="dsc-cost-assumptions" className="dcp-caption"><strong>Cost assumptions:</strong> payments show principal and interest only, excluding taxes, insurance and fees. Estimated APR assumes $0 upfront finance charges unless you enter them using the info icon. Actual costs and APR require a lender's Loan Estimate.</p>
    <StepNav back="← Back" onBack={() => v.goStep(2)} next={<>Compare with Darren <Arrow /></>} onNext={() => v.goStep(4)} />
  </div>;
}

// ─── Step 4: contact ──────────────────────────────────────────────────────────

export function StepContact({ v }: { v: DebtPageView }) {
  const outside = serviceArea(v.propertyUse, v.propertyState, 'debt-savings-calculator') === 'out-of-market';
  return (
    <div className="dcp-panel">
      <h2 className="dcp-h2 dcp-h2-lg">Talk through your comparison.</h2>
      {v.chosen === 'heloc' && <p className="dcp-hint">You’d like to discuss a HELOC. Darren can review the possible line amount, rate and payment with you.</p>}
      <ServiceAreaFields formId="debt-savings-calculator" propertyUse={v.propertyUse} propertyState={v.propertyState}
        onUseChange={v.setPropertyUse} onStateChange={v.setPropertyState} deferScreening />
      <p className="dcp-lead">
        Your estimate is a starting point. A personal review helps you understand which options
        may fit your goals. No hard pull, no obligation.
      </p>

      <div className="dcp-grid-2">
        <div>
          <label className="input-label" htmlFor="payoff-fname">First Name</label>
          <input id="payoff-fname" type="text" className="form-input" placeholder="First name"
            value={v.fname} onChange={(e) => v.setFname(e.target.value)} />
        </div>
        <div>
          <label className="input-label" htmlFor="payoff-lname">Last Name</label>
          <input id="payoff-lname" type="text" className="form-input" placeholder="Last name"
            value={v.lname} onChange={(e) => v.setLname(e.target.value)} />
        </div>
      </div>

      <div className="dcp-grid-2">
        <div>
          <label className="input-label" htmlFor="payoff-email">Email Address</label>
          <input id="payoff-email" type="email" className="form-input" placeholder="you@email.com"
            value={v.email}
            onChange={(e) => { v.setEmailHint(null); v.setEmail(e.target.value); }}
            onBlur={(e) => hintAfterBlur(e.target.value, v.setEmailHint)} />
          {/* Suggests, never blocks: a wrong guess must not stop a real address. */}
          {v.emailHint && (v.emailHint.kind === 'typo' ? (
            <button type="button" className="email-hint"
              onClick={() => { const hint = v.emailHint; if (hint && hint.kind === 'typo') { v.setEmail(hint.email); v.setEmailHint(null); } }}>
              {emailHintMessage(v.emailHint)}
            </button>
          ) : (
            <span className="email-hint">{emailHintMessage(v.emailHint)}</span>
          ))}
        </div>
        <div>
          <label className="input-label" htmlFor="payoff-phone">Phone Number</label>
          <input id="payoff-phone" type="tel" className="form-input" placeholder="(714) 000-0000"
            value={v.phone} onChange={(e) => v.setPhone(formatUsPhone(e.target.value))} />
        </div>
      </div>

      <InquiryMessage id="payoff-inquiry-message" value={v.message} onChange={v.setMessage} />

      <ComplianceDisclosure formId="debt-savings-calculator" />
      {v.sending && <p className="dcp-hint" role="status">Saving your details. Your calendar will open after the save is confirmed. This can take a few seconds.</p>}
      <StepNav
        back="← Back" onBack={() => v.goStep(3)}
        disabled={v.sending}
        next={v.sending
          ? <><span className="btn-spinner" aria-hidden="true" /> Sending…</>
          : <>{outside ? 'Record my inquiry' : BOOKING_CALENDAR_READY ? 'See Darren’s Calendar' : 'Send my request'} <Arrow /></>}
        onNext={v.submitLead}
      />
    </div>
  );
}

// ─── Confirmation ─────────────────────────────────────────────────────────────

/** What the visitor chose to discuss, in the words the card used. */
function chosenLine(v: DebtPageView): { label: string; detail: string } {
  if (v.chosen === 'heloc') {
    return { label: 'HELOC', detail: v.helocRoom === null ? 'Line amount and payment need a personal review.' : `${formatCurrency(v.helocRoom)} illustrative borrowing room at ${COMMON_CLTV_LIMIT}% combined loan-to-value. Not approved credit.` };
  }
  if (v.chosen === 'refi' && v.refiPmt > 0) {
    return { label: 'Cash-out refinance', detail: `${formatCurrency(v.refiPmt)}/mo est. P&I · ${savingsText(v.refiSave)}` };
  }
  if (v.chosen === 'refiSame' && v.refiSameTermPmt > 0) {
    return { label: 'Refinance, same payoff date', detail: `${formatCurrency(v.refiSameTermPmt)}/mo est. P&I · ${savingsText(v.refiSameTermSave)}` };
  }
  if (v.chosen === 'heloan' && v.heloanPriced && v.heloanPmt > 0) {
    return { label: 'Fixed home equity loan', detail: `${formatCurrency(v.heloanTotal)}/mo combined · ${savingsText(v.heloanSave)}` };
  }
  return { label: 'None selected', detail: 'Darren can go through each option with you.' };
}

/**
 * Shown only after the server has confirmed the save. It says the request was
 * received, not that anyone has reviewed it, and promises no time.
 *
 * The option row is the visitor's discussion choice, also retained in the
 * submission snapshot. It does not establish product eligibility, an approved
 * line size or a quoted payment. The HELOC example must stay labelled here too.
 */
export function DebtRecap({ v }: { v: DebtPageView }) {
  const option = chosenLine(v);
  return (
    <div className="dcp-panel dcp-recap">
      <SavedLeadCalendar firstName={v.fname} />
      <details className="dcp-recap-details"><summary>View your saved numbers</summary>
      <div className="dcp-recap-rows">
        <Row label="Total debt" value={formatCurrency(v.totBal)} />
        <Row label="Today's payment" value={`${formatCurrency(v.todayTotal)}/mo`} />
        <div className="dcp-row">
          <span>Option you want to discuss</span>
          <span><strong>{option.label}</strong><small>{option.detail}</small></span>
        </div>
      </div></details>
      <p className="dcp-caption">Estimates only. Actual options depend on a personal review.</p>
    </div>
  );
}

// ─── The flow ─────────────────────────────────────────────────────────────────

/**
 * The comparison itself, without a hero: /home-equity/ hosts it as the "Pay
 * off high-interest debt" path (15 Oct 2026), under its own hero and heading.
 * /debt-consolidation/ is retired and redirects there. `flowId` is what the
 * hero button and the step buttons scroll to.
 */
export default function DebtPage({ v, overlays, flowId = 'savings' }: { v: DebtPageView; overlays: ReactNode; flowId?: string }) {
  return (
    <div className="dcp-payoff">
      <div id={flowId} className="dcp-flow" data-dt-form="debt-savings-calculator">
        <ul className="dcp-trust">
          <li><Check /> No cost to see your numbers</li>
          <li><Check /> Educational estimates</li>
          <li><Check /> Results before contact</li>
        </ul>

        <div className={v.submitted ? '' : `equity-journey-layout${v.step === 3 ? ' payoff-comparison-layout' : ''}`}>
        {!v.submitted&&<JourneyTimeline steps={STEPS} current={v.step} disabled={v.sending} onStep={v.goStep}/>}
        <div className="equity-journey-content">
        {v.submitted && <DebtRecap v={v} />}
        {!v.submitted && v.step === 1 && <StepDebts v={v} />}
        {!v.submitted && v.step === 2 && <StepHome v={v} />}
        {!v.submitted && v.step === 3 && <StepCompare v={v} />}
        {!v.submitted && v.step === 4 && <StepContact v={v} />}

        <div className="dcp-disclosure">{v.disclosure}</div>
        </div></div>
      </div>

      {overlays}
    </div>
  );
}
