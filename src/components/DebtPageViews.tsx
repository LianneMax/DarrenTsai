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
import { PHONE } from '../config';
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
          <label className="input-label">Current Home Value</label>
          <div className="input-prefix-wrap">
            <span className="input-prefix">$</span>
            <input type="number" className="form-input input-has-prefix"
              placeholder="e.g. 650,000" value={v.homeValue}
              onChange={(e) => v.setHomeValue(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="input-label">Current Mortgage Balance</label>
          <div className="input-prefix-wrap">
            <span className="input-prefix">$</span>
            <input type="number" className="form-input input-has-prefix"
              placeholder="e.g. 350,000" value={v.mtgBalance}
              onChange={(e) => v.setMtgBalance(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="dcp-grid-3">
        <div>
          <label className="input-label">Monthly Payment (P&amp;I)</label>
          <div className="input-prefix-wrap">
            <span className="input-prefix">$</span>
            <input type="number" className="form-input input-has-prefix"
              placeholder="e.g. 2,200" value={v.mtgPayment}
              onChange={(e) => v.setMtgPayment(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="input-label">Mortgage Rate <span className="dcp-optional">· optional</span></label>
          <div className="input-suffix-wrap">
            <input type="number" step="0.1" className="form-input input-has-suffix"
              placeholder="e.g. 3.5" value={v.mtgRate}
              onChange={(e) => v.setMtgRate(e.target.value)} />
            <span className="input-suffix">%</span>
          </div>
        </div>
        <div>
          <label className="input-label">Remaining Term <span className="dcp-optional">· optional</span></label>
          <div className="input-suffix-wrap">
            <input type="number" className="form-input input-has-suffix"
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

function OptionCard({ id, title, v, payment, scope, save, children, unavailable }: {
  id: Exclude<DebtOption, ''>;
  title: string;
  v: DebtPageView;
  /** Null when the option cannot be priced yet. */
  payment: number | null;
  scope: string;
  save: number;
  children: ReactNode;
  unavailable?: ReactNode;
}) {
  const selected = v.chosen === id;
  if (payment === null) {
    return (
      <div className="dcp-option dcp-option-wait">
        <span className="dcp-option-title">{title}</span>
        <span className="dcp-option-pay dcp-option-pay-text">{id === 'heloan' && v.hasHome && v.heloanAmt <= 0 ? 'No room at these figures' : id === 'refiSame' ? 'Term needed' : 'Choose assumptions'}</span>
        <span className="dcp-option-scope">Monthly payment not estimated</span>
        <span className="dcp-verdict">Payment difference pending</span>
        <div className="dcp-option-body">{unavailable}</div>
      </div>
    );
  }
  return (
    <div className={`dcp-option${selected ? ' dcp-option-selected' : ''}`}>
      <span className="dcp-option-title">{title}</span>
      <span className="dcp-option-pay">{formatCurrency(payment)}</span>
      <span className="dcp-option-scope">{scope}</span>
      <Verdict save={save} />
      <div className="dcp-option-body">{children}</div>
      {/* The visitor chooses the discussion. The snapshot records intent,
          rather than a qualified loan program. */}
      <button
        type="button"
        className="dcp-pick"
        aria-pressed={selected}
        onClick={() => v.setChosen(selected ? '' : id)}
      >
        {selected ? <><Check /> I want to discuss this</> : 'Discuss this option'}
      </button>
    </div>
  );
}

export function StepCompare({ v }: { v: DebtPageView }) {
  const rateChange = v.mr > 0
    ? `Rate: ${v.mr.toFixed(2)}% to about ${v.rate30.toFixed(2)}%.`
    : `New rate: about ${v.rate30.toFixed(2)}%.`;
  // The home equity loan is capped at 85% combined loan-to-value, so it may not
  // reach the whole of the debt, or any of it. Said on its card, because the
  // copy above otherwise claims every option clears the same amount.
  //
  // `heloanNoRoom` is its own case. With the mortgage already at 85% of the
  // value or more, heloanAmt is 0, so no tier or term can price it, and the card
  // used to keep asking for a credit range the visitor had already picked.
  const heloanNoRoom = v.hasHome && v.heloanAmt <= 0;
  const heloanShort = v.heloanAmt > 0 && v.heloanAmt < v.totBal;
  // A paid-off home (balance 0): nothing to replace, keep or keep the date of.
  const paidOff = v.mb === 0;
  // Past 80% of the home's value, many lenders will not do a cash-out refinance.
  // Said on both refi cards; the figure itself is not capped (Max, 10 Oct).
  const refiOverLimit = v.refiLtv > CASH_OUT_LIMIT
    ? <> That is a new loan of about {Math.round(v.refiLtv)}% of your home&apos;s value; many lenders
        cap a cash-out refinance at {CASH_OUT_LIMIT}%. Darren can tell you what may be possible.</>
    : null;

  return (
    <div className="dcp-panel">
      <h2 className="dcp-h2">Your Side-by-Side Comparison</h2>

      <div className="dcp-note">
        <h3>Compare monthly relief and repayment tradeoffs.</h3>
        <p>
          {heloanShort || heloanNoRoom
            ? <>The refinance options pay off all {formatCurrency(v.totBal)} of your debts. </>
            : <>Compare options for your {formatCurrency(v.totBal)} of debts. </>}
          Compare the combined mortgage P&amp;I and debt payments. Taxes, insurance, HOA and closing
          costs are excluded.
        </p>
        <p>
          <strong>A lower monthly payment is not a calculation of total savings.</strong> This tool
          does not work out which option costs less over its full life.
        </p>
      </div>

      {v.rateBadge}

        <div className="dcp-option dcp-option-today">
          <span className="dcp-option-title">Today</span>
          <span className="dcp-option-pay">{formatCurrency(v.todayTotal)}</span>
          <span className="dcp-option-scope">{paidOff ? 'All debts (no mortgage)' : <>Mortgage P&amp;I + all debts</>}</span>
          <div className="dcp-option-body">
            {paidOff ? 'Keeps your separate debts.' : 'Keeps your current mortgage and separate debts.'}{' '}
            Debt payoff dates depend on your existing repayment plans.
          </div>
        </div>

      {!heloanNoRoom && <div className="dcp-loan-controls">
        <h3>Fixed home equity loan assumptions</h3>
        <div className="dcp-grid-2">
          <div>
            <label className="input-label" htmlFor="heloan-tier">Credit range</label>
            <CustomSelect id="heloan-tier" value={v.heloanTier} options={HELOAN_TIERS}
              onChange={v.setHeloanTier} placeholder="Select range…" />
          </div>
          <div>
            <label className="input-label" htmlFor="heloan-term">Loan term</label>
            <CustomSelect id="heloan-term" value={v.heloanTerm} options={HELOAN_TERMS}
              onChange={v.setHeloanTerm} placeholder="Select term…" />
          </div>
        </div>
        <p className="dcp-hint">See how different assumptions change the estimate. A selected range is not a credit check.</p>
      </div>}

      <div className="dcp-options dcp-primary-options">
        {/* The line-size illustration is not monthly pricing. Do not put its
            amount into a savings verdict or treat 85% as a lender offer. */}
        <div className={`dcp-option dcp-option-heloc${v.chosen === 'heloc' ? ' dcp-option-selected' : ''}`}>
          <span className="dcp-option-title">HELOC</span>
          <span className={`dcp-option-pay${v.helocRoom === null ? ' dcp-option-pay-text' : ''}`}>{v.helocRoom === null ? 'Add home details' : formatCurrency(v.helocRoom)}</span>
          <span className="dcp-option-scope">Illustrative borrowing room<br />Not a monthly payment</span>
          <span className="dcp-verdict">Example at {COMMON_CLTV_LIMIT}% combined loan-to-value</span>
          <div className="dcp-option-body">
            {v.helocRoom === null ? 'Enter your home value and mortgage details to see an example.'
              : <>{COMMON_CLTV_LIMIT}% of {formatCurrency(v.hv)}, less {formatCurrency(v.mb)} owed.
                {v.helocRoom === 0 && <> No borrowing room at this assumption.</>} Other property liens reduce this amount. Illustration only; lender limits and eligibility vary.</>}
            <p>{paidOff ? 'No mortgage to replace.' : 'Keeps your mortgage.'} The payment depends on your draw, rate and repayment terms.</p>
          </div>
          <button type="button" className="dcp-pick" onClick={() => {
            if (v.helocRoom === null) { v.goStep(2); return; }
            v.setChosen('heloc'); v.goStep(4);
          }}>{v.helocRoom === null ? 'Add home details' : 'Discuss a HELOC'} <Arrow /></button>
        </div>

        <OptionCard id="heloan" title="Fixed home equity loan" v={v}
          payment={v.heloanPriced && v.heloanPmt > 0 ? v.heloanTotal : null}
          scope={heloanShort
            ? (paidOff ? 'HELOAN + remaining debts' : 'Mortgage + HELOAN + remaining debts')
            : (paidOff ? 'HELOAN, the only loan on the home' : 'Combined mortgage + HELOAN')}
          save={v.heloanSave}
          unavailable={heloanNoRoom
            ? <>At these numbers there is no room under the 85% combined loan-to-value limit,
                so a home equity loan cannot be priced. Darren can look at what else may work.</>
            // A HELOAN rate is a credit-score question and the tiers span five
            // points. A price before the visitor has said is a quote for a
            // different person.
            : <>Pick your credit range and a term above to price this option.</>
          }>
          {paidOff
            ? <>No mortgage to keep. </>
            : <>Mortgage: kept{v.mr > 0 ? ` at ${v.mr.toFixed(2)}%` : ''}
              {v.mt > 0 ? ` with ${years(v.mt)} remaining` : ''}. </>}
          New loan: {v.tierRate.toFixed(2)}% over {years(v.tierYears)}.
          {heloanShort && (
            <> Limited to {formatCurrency(v.heloanAmt)} by an 85% combined loan-to-value, which is
              less than your {formatCurrency(v.totBal)} in debts. The rest stays with its current
              lenders, about {formatCurrency(v.leftoverPmt)}/mo, and is included in the payment above.</>
          )}
        </OptionCard>
        <OptionCard id="refi" title="Est. Cash-Out Refi" v={v}
          payment={v.refiPmt > 0 ? v.refiPmt : null}
          scope="Estimated P&I · new 30YR fixed" save={v.refiSave}>
          {paidOff
            ? <>New mortgage of {formatCurrency(v.newLoan)} for your debts, about {v.rate30.toFixed(2)}% over 30 years.</>
            : <>Mortgage: replaced. {rateChange} Repayment: new 30 years
              {v.yearsAdded > 0 ? `, about ${years(v.yearsAdded)} longer.` : '.'}</>}
          {refiOverLimit}
        </OptionCard>

        <OptionCard id="refiSame" title="Refi, Same Payoff Date" v={v}
          payment={v.refiSameTermPmt > 0 ? v.refiSameTermPmt : null}
          scope={`Estimated P&I · new ${v.sameTermYears}YR fixed`} save={v.refiSameTermSave}
          unavailable={paidOff
            ? <>With no mortgage there is no payoff date to keep, so this option does not apply.</>
            : <>
              Add your remaining term to see a refinance that keeps your current payoff date.
              <button type="button" className="dcp-link" onClick={() => v.goStep(2)}>Add mortgage details</button>
            </>
          }>
          Mortgage: replaced. {rateChange} Repayment: about {years(v.sameTermYears)}, keeping your
          current payoff date.
          {refiOverLimit}
        </OptionCard>

      </div>

      <div className="dcp-note">
        <h3>Before choosing, check the full cost.</h3>
        <p>
          Compare closing costs, interest over time and when each debt is paid off. A refinance
          changes the rate on your entire mortgage. A HELOAN preserves it but adds a separate
          secured loan. Debt previously unsecured becomes secured by your home.
        </p>
      </div>

      <details className="dcp-details">
        <summary>Cash-out refinance calculation details</summary>
        <Row label="New Loan Amount" value={v.newLoan > 0 ? formatCurrency(v.newLoan) : '—'} />
        <Row label="Rate (30YR fixed)" value={formatRate(v.rate30)} />
        <Row label="Estimated APR" value={<AprEstimate principal={v.newLoan} rate={v.rate30} years={30} />} />
        <Row label="Monthly P&I Payment" value={v.refiPmt > 0 ? formatCurrency(v.refiPmt) : '—'} />
        <Row strong label={RESULT_ROW_LABEL} value={v.newLoan > 0 ? savingsRowText(v.refiSave) : '—'} />
      </details>

      <details className="dcp-details">
        <summary>Fixed home equity loan calculation details</summary>
        <Row label="HELOAN Amount" value={v.heloanAmt > 0 ? formatCurrency(v.heloanAmt) : '—'} />
        <Row label="HELOAN Rate / Term"
          value={v.heloanPriced && v.heloanAmt > 0 ? `${formatRate(v.tierRate)} / ${v.tierYears} yr` : '—'} />
        <Row label="Estimated APR" value={<AprEstimate principal={v.heloanPriced ? v.heloanAmt : 0} rate={v.tierRate} years={v.tierYears} />} />
        <Row label="HELOAN Monthly Payment" value={v.heloanPmt > 0 ? formatCurrency(v.heloanPmt) : '—'} />
        <Row label="Existing Mortgage Payment" value={v.mp > 0 ? formatCurrency(v.mp) : '—'} />
        <Row label="Illustrative CLTV" value={v.cltv > 0 ? formatRate(v.cltv) : '—'} />
        {/* A verdict needs a rate: nothing is said until a tier and a term are chosen. */}
        <Row strong label={BLENDED_ROW_LABEL}
          value={v.heloanPriced && v.heloanPmt > 0 ? savingsRowText(v.heloanSave) : '—'} />
      </details>

      <p id="dsc-cost-assumptions" className="dcp-caption">
        <strong>Cost assumptions:</strong> payments show principal and interest only, excluding taxes,
        insurance and fees. Estimated APR assumes $0 upfront finance charges unless you enter them
        using the info icon. Actual costs and APR require a lender's Loan Estimate.
      </p>
      <p className="dcp-caption">
        Lower monthly payments do not necessarily mean lower total borrowing costs. Paying off
        unsecured debt with a loan secured by your home can put your home at risk.
      </p>

      <StepNav
        back="← Back" onBack={() => v.goStep(2)}
        next={<>Have Darren Compare Full Costs <Arrow /></>} onNext={() => v.goStep(4)}
      />
    </div>
  );
}

// ─── Step 4: contact ──────────────────────────────────────────────────────────

export function StepContact({ v }: { v: DebtPageView }) {
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
      <StepNav
        back="← Back" onBack={() => v.goStep(3)}
        disabled={v.sending}
        next={v.sending
          ? <><span className="btn-spinner" aria-hidden="true" /> Sending…</>
          : <>Send My Numbers to Darren <Arrow /></>}
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
      <div className="success-check" role="img" aria-label="Success">✓</div>
      <h2 className="dcp-h2 dcp-h2-lg">Your request has been received.</h2>
      <p className="dcp-lead">
        Your numbers were sent with it, so you will not need to start over. Darren will be in
        touch.
      </p>

      <div className="dcp-recap-rows">
        <span className="dcp-eyebrow dcp-eyebrow-dark">Your summary</span>
        <Row label="Total debt" value={formatCurrency(v.totBal)} />
        <Row label="Today's payment" value={`${formatCurrency(v.todayTotal)}/mo`} />
        <div className="dcp-row">
          <span>Option you want to discuss</span>
          <span><strong>{option.label}</strong><small>{option.detail}</small></span>
        </div>
      </div>

      {/* Booking lives here, after the save, so every booked call arrives with
          its numbers. The button opens the inline chooser (booking-chooser.js),
          which is what makes a completed booking countable. The call link is a
          real tel: anchor, so CallRail swaps the number and phone_click fires. */}
      <div className="dcp-recap-actions">
        <button type="button" className="btn btn-teal" onClick={v.openBooking}>Schedule a Time</button>
        <a href={`tel:${PHONE.replace(/\D/g, '')}`} className="btn dcp-back">Call Darren {PHONE}</a>
      </div>
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
