/**
 * What /debt-consolidation/ looks like (frontend revamp, phase 2, 9 Oct 2026).
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
import { AsYouType } from 'libphonenumber-js';
import type { ReactNode } from 'react';
import { LICENSED_STATES, NMLS, DRE, PHONE, isLicensedState } from '../config';
import { formatCurrency, formatRate } from '../utils/formatters';
import { savingsText, savingsRowText } from '../utils/savingsText';
import { checkEmail, emailHintMessage, type EmailSuggestion } from '../utils/emailSuggest';
import CustomSelect from './CustomSelect';
import StateSelect from './StateSelect';
import { DEBT_TYPES, HELOAN_TIERS, HELOAN_TERMS, type DebtOption } from './debtOptions';

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

  rate30: number;
  todayTotal: number;
  newLoan: number;
  refiPmt: number;
  refiSave: number;
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
  heloanTotal: number;
  heloanSave: number;
  cltv: number;

  /** The option the visitor wants to talk about. Shown on the recap; not part of the lead. */
  chosen: DebtOption;
  setChosen: (o: DebtOption) => void;

  fname: string; setFname: (v: string) => void;
  lname: string; setLname: (v: string) => void;
  phone: string; setPhone: (v: string) => void;
  email: string; setEmail: (v: string) => void;
  emailHint: EmailSuggestion | null; setEmailHint: (h: EmailSuggestion | null) => void;
  usState: string; setUsState: (v: string) => void;
  sending: boolean;
  submitted: boolean;
  submitLead: () => void;
  openCalendly: () => void;

  /** The rate-source line and the full disclosure, the same elements the homepage shows. */
  rateBadge: ReactNode;
  disclosure: ReactNode;
}

const STEPS = ['Your Debts', 'Your Home', 'Comparison', 'Talk to Darren'];

const Arrow = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const Check = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// ─── Hero ─────────────────────────────────────────────────────────────────────

/**
 * The top of the page: the <h1>, what the tool does, and how to read it.
 *
 * Static on purpose. It is pre-rendered into the HTML at build time
 * (src/prerender.tsx), so it paints with the first frame and is the page's LCP
 * element; nothing in it may wait for JavaScript, fade in, or carry a phone
 * number for CallRail to swap. The main button is a real anchor to the
 * calculator for the same reason: it works before React has loaded.
 *
 * The one real button is the HELOC way out. /yt/heloc and /yt/equity land here,
 * and someone who wants a revolving line of credit is not served by a tool that
 * prices the two fixed alternatives. Until /home-equity/ exists (revamp phase
 * 3, which should take this link over) the useful next step is Darren himself,
 * so it opens the same call-or-schedule chooser as every "Book a Call". It
 * carries `data-early`, so a tap before React loads is queued and replayed
 * (debt-consolidation/index.html, DebtConsolidationApp.tsx) rather than lost.
 */
export function DebtPageHero({ onAskHeloc }: { onAskHeloc: () => void }) {
  return (
    <>
      <div className="dcp-hero">
        <div className="dcp-hero-inner">
          <div>
            <span className="dcp-eyebrow">Monthly Reset · Debt Consolidation</span>
            <h1 className="dcp-h1">Boost Your Monthly Cashflow</h1>
            <p className="dcp-hero-sub">
              You have a low mortgage rate but expensive credit card and other debt. Compare a
              fixed home equity loan with cash-out refinancing to understand your monthly payment
              and the tradeoffs.
            </p>
            <a href="#savings" className="btn dcp-hero-btn">
              See My Comparison
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 5v14M6 13l6 6 6-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </a>
            <p className="dcp-hero-note">No cost to see your numbers. Results before contact.</p>
          </div>

          <div className="dcp-how">
            <span className="dcp-eyebrow">How the comparison works</span>
            <dl>
              <div><dt>Today</dt><dd>Mortgage P&amp;I + your debts</dd></div>
              <div><dt>Cash-out refinance</dt><dd>Replaces your mortgage</dd></div>
              <div><dt>Fixed HELOAN</dt><dd>Keeps your mortgage</dd></div>
            </dl>
            {/* Said plainly. A HELOC is a revolving line and this prices the two
                fixed alternatives; /yt/heloc and /yt/equity viewers land on this
                funnel and need to know that within a second. */}
            <p>
              Looking at a HELOC? This compares the two fixed alternatives, not a revolving
              line of credit.{' '}
              <button type="button" className="dcp-hero-link" data-early="hero-heloc" onClick={onAskHeloc}>
                Ask Darren about a HELOC →
              </button>
            </p>
          </div>
        </div>
      </div>

      <div className="dcp-licensed">
        <span>Licensed in {LICENSED_STATES.join(' · ')}</span>
        <span>NMLS #{NMLS}</span>
        <span>CA DRE #{DRE}</span>
        <span>Equal Housing Opportunity</span>
      </div>
    </>
  );
}

// ─── Small pieces ─────────────────────────────────────────────────────────────

function Stat({ label, value, tone }: { label: string; value: string; tone: 'teal' | 'rose' }) {
  return (
    <div className="dcp-stat">
      <span className="dcp-stat-label">{label}</span>
      <span className={`dcp-stat-value dcp-${tone}`}>{value}</span>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`dcp-row${strong ? ' dcp-row-strong' : ''}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function Verdict({ save }: { save: number }) {
  const saves = Math.round(save) > 0;
  // Green only for a saving. An increase is information, not an error, so it
  // is neutral rather than red.
  return <span className={`dcp-verdict${saves ? ' dcp-verdict-save' : ''}`}>{savingsText(save)}</span>;
}

function StepNav({ back, next, onBack, onNext, disabled }: {
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

const years = (n: number) => `${n} ${n === 1 ? 'year' : 'years'}`;

// ─── Step 1: debts ────────────────────────────────────────────────────────────

export function StepDebts({ v }: { v: DebtPageView }) {
  return (
    <div className="dcp-panel">
      <h2 className="dcp-h2">Your Current Monthly Debts</h2>

      {v.debts.map((d) => (
        <div key={d.id} className="dcp-debt">
          <div>
            <label className="input-label">Debt Type</label>
            <CustomSelect
              id={`debt-type-${d.id}`}
              value={d.type}
              options={DEBT_TYPES.map((t) => ({ value: t, label: t }))}
              onChange={(val) => v.updateDebt(d.id, 'type', val)}
              placeholder="Select debt type…"
            />
          </div>
          <div>
            <label className="input-label">Balance ($)</label>
            <div className="input-prefix-wrap">
              <span className="input-prefix">$</span>
              <input
                type="number" className="form-input input-has-prefix"
                value={d.bal || ''} placeholder="e.g. 5,000"
                onChange={(e) => v.updateDebt(d.id, 'bal', e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className="input-label">Monthly Payment</label>
            <div className="input-prefix-wrap">
              <span className="input-prefix">$</span>
              <input
                type="number" className="form-input input-has-prefix"
                value={d.pmt || ''} placeholder="e.g. 150"
                onChange={(e) => v.updateDebt(d.id, 'pmt', e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className="input-label">Interest Rate (%)</label>
            <div className="input-suffix-wrap">
              <input
                type="number" step="0.1" className="form-input input-has-suffix"
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
          <Stat label="Total Debt Balance" value={formatCurrency(v.totBal)} tone="rose" />
          {/* Balance-weighted, which is what the label claims. */}
          <Stat label="Weighted Avg Interest Rate" value={formatRate(v.wtRate)} tone="rose" />
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

/**
 * The equity picture, shown only once there is a value and a balance to draw.
 *
 * The bar is the same two numbers the old chips showed, not a new calculation.
 * A balance above the value is said in words: a bar cannot draw negative equity,
 * and clamping it to zero would hide the one thing that visitor needs to know.
 */
function EquitySnapshot({ hv, mb }: { hv: number; mb: number }) {
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
        Home value, mortgage balance and monthly payment establish your comparison. Rate and
        remaining term add refinance context. The grey numbers are examples.
      </p>

      {v.hv > 0 && v.mb > 0 && <EquitySnapshot hv={v.hv} mb={v.mb} />}

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
      {/* No "best option" badge anywhere: the visitor says which one they want
          to talk about. It is shown back to them on the confirmation. */}
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

  return (
    <div className="dcp-panel">
      <h2 className="dcp-h2">Your Side-by-Side Comparison</h2>

      <div className="dcp-note">
        <h3>Compare monthly relief and repayment tradeoffs.</h3>
        <p>
          {heloanShort || heloanNoRoom
            ? <>The refinance options pay off all {formatCurrency(v.totBal)} of your debts. </>
            : <>Each option pays off the same {formatCurrency(v.totBal)} of debts. </>}
          Compare the combined mortgage P&amp;I and debt payments. Taxes, insurance, HOA and closing
          costs are excluded.
        </p>
        <p>
          <strong>A lower monthly payment is not a calculation of total savings.</strong> This tool
          does not work out which option costs less over its full life.
        </p>
      </div>

      {v.rateBadge}

      <div className="dcp-options">
        <div className="dcp-option dcp-option-today">
          <span className="dcp-option-title">Today</span>
          <span className="dcp-option-pay dcp-rose">{formatCurrency(v.todayTotal)}</span>
          <span className="dcp-option-scope">Mortgage P&amp;I + all debts</span>
          <div className="dcp-option-body">
            Keeps your current mortgage and separate debts. Debt payoff dates depend on your
            existing repayment plans.
          </div>
        </div>

        <OptionCard id="refi" title="Est. Cash-Out Refi" v={v}
          payment={v.refiPmt > 0 ? v.refiPmt : null}
          scope="Estimated P&I · new 30YR fixed" save={v.refiSave}>
          Mortgage: replaced. {rateChange} Repayment: new 30 years
          {v.yearsAdded > 0 ? `, about ${years(v.yearsAdded)} longer.` : '.'}
        </OptionCard>

        <OptionCard id="refiSame" title="Refi, Same Payoff Date" v={v}
          payment={v.refiSameTermPmt > 0 ? v.refiSameTermPmt : null}
          scope={`Estimated P&I · new ${v.sameTermYears}YR fixed`} save={v.refiSameTermSave}
          unavailable={
            <>
              Add your remaining term to see a refinance that keeps your current payoff date.
              <button type="button" className="dcp-link" onClick={() => v.goStep(2)}>Add mortgage details</button>
            </>
          }>
          Mortgage: replaced. {rateChange} Repayment: about {years(v.sameTermYears)}, keeping your
          current payoff date.
        </OptionCard>

        <OptionCard id="heloan" title="Est. Fixed HELOAN" v={v}
          payment={v.heloanPriced && v.heloanPmt > 0 ? v.heloanTotal : null}
          scope="Combined mortgage + HELOAN" save={v.heloanSave}
          unavailable={heloanNoRoom
            ? <>At these numbers there is no room under the 85% combined loan-to-value limit,
                so a home equity loan cannot be priced. Darren can look at what else may work.</>
            // A HELOAN rate is a credit-score question and the tiers span five
            // points. A price before the visitor has said is a quote for a
            // different person.
            : <>Pick your credit range and a term below to price this option.</>
          }>
          Mortgage: kept{v.mr > 0 ? ` at ${v.mr.toFixed(2)}%` : ''}
          {v.mt > 0 ? ` with ${years(v.mt)} remaining` : ''}. New loan: {v.tierRate.toFixed(2)}% over{' '}
          {years(v.tierYears)}.
          {heloanShort && (
            <> Limited to {formatCurrency(v.heloanAmt)} by an 85% combined loan-to-value, which is
              less than your {formatCurrency(v.totBal)} in debts. Ask Darren how the rest would be
              handled.</>
          )}
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

      <h3 className="dcp-h3">Adjust Your Home Equity Loan Estimate</h3>
      <div className="dcp-grid-2">
        <div>
          <label className="input-label">HELOAN Credit Tier</label>
          <CustomSelect id="heloan-tier" value={v.heloanTier} options={HELOAN_TIERS}
            onChange={v.setHeloanTier} placeholder="Select credit tier…" />
        </div>
        <div>
          <label className="input-label">HELOAN Term</label>
          <CustomSelect id="heloan-term" value={v.heloanTerm} options={HELOAN_TERMS}
            onChange={v.setHeloanTerm} placeholder="Select term…" />
        </div>
      </div>
      <p className="dcp-hint">See how different assumptions change the estimate. A selected range is not a credit check.</p>

      <details className="dcp-details">
        <summary>Estimated Cash-Out Refinance Breakdown · View calculation details</summary>
        <Row label="New Loan Amount" value={v.newLoan > 0 ? formatCurrency(v.newLoan) : '—'} />
        <Row label="Rate (30YR fixed)" value={formatRate(v.rate30)} />
        <Row label="APR" value="See cost assumptions" />
        <Row label="Monthly P&I Payment" value={v.refiPmt > 0 ? formatCurrency(v.refiPmt) : '—'} />
        <Row strong label="Monthly Savings vs. Today" value={v.newLoan > 0 ? savingsRowText(v.refiSave) : '—'} />
      </details>

      <details className="dcp-details">
        <summary>Estimated Fixed-Rate HELOAN Breakdown · View calculation details</summary>
        <Row label="HELOAN Amount" value={v.heloanAmt > 0 ? formatCurrency(v.heloanAmt) : '—'} />
        <Row label="HELOAN Rate / Term"
          value={v.heloanPriced && v.heloanAmt > 0 ? `${formatRate(v.tierRate)} / ${v.tierYears} yr` : '—'} />
        <Row label="APR" value="See cost assumptions" />
        <Row label="HELOAN Monthly Payment" value={v.heloanPmt > 0 ? formatCurrency(v.heloanPmt) : '—'} />
        <Row label="Existing Mortgage Payment" value={v.mp > 0 ? formatCurrency(v.mp) : '—'} />
        <Row label="Illustrative CLTV" value={v.cltv > 0 ? formatRate(v.cltv) : '—'} />
        {/* A verdict needs a rate: nothing is said until a tier and a term are chosen. */}
        <Row strong label="Blended Monthly Savings vs. Today"
          value={v.heloanPriced && v.heloanPmt > 0 ? savingsRowText(v.heloanSave) : '—'} />
      </details>

      <p id="dsc-cost-assumptions" className="dcp-caption">
        <strong>Cost assumptions:</strong> these estimates show principal and interest only. APR is
        not shown: it depends on fees and lender terms, and needs a personal quote.
      </p>
      <p className="dcp-caption">
        Lower monthly payments do not necessarily mean lower total borrowing costs. Consolidating
        debt into a loan secured by your home can put your home at risk.
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
      <h2 className="dcp-h2 dcp-h2-lg">I Want to See My Actual Numbers</h2>
      <p className="dcp-lead">
        Your estimate is a starting point. A personal review helps you understand which options
        may fit your goals. No hard pull, no obligation.
      </p>

      <div className="dcp-grid-2">
        <div>
          <label className="input-label">First Name</label>
          <input type="text" className="form-input" placeholder="First name"
            value={v.fname} onChange={(e) => v.setFname(e.target.value)} />
        </div>
        <div>
          <label className="input-label">Last Name</label>
          <input type="text" className="form-input" placeholder="Last name"
            value={v.lname} onChange={(e) => v.setLname(e.target.value)} />
        </div>
      </div>

      <div className="dcp-grid-2">
        <div>
          <label className="input-label">Email Address</label>
          <input type="email" className="form-input" placeholder="you@email.com"
            value={v.email}
            onChange={(e) => { v.setEmailHint(null); v.setEmail(e.target.value); }}
            onBlur={(e) => v.setEmailHint(checkEmail(e.target.value))} />
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
          <label className="input-label">Phone Number</label>
          <input type="tel" className="form-input" placeholder="(714) 000-0000"
            value={v.phone} onChange={(e) => v.setPhone(new AsYouType('US').input(e.target.value))} />
        </div>
      </div>

      {/* No "best time to call" and no "how did you hear": both came off this
          step on 8 Oct. Tracked attribution answers the second. */}
      <div className="dcp-field">
        <label className="input-label">State</label>
        <StateSelect id="us-state" value={v.usState} onChange={v.setUsState} placeholder="Select your state…" />
        {/* Said before they submit. The lead is still saved and Darren still
            refers it; what was missing was telling the visitor. */}
        {v.usState && !isLicensedState(v.usState) && (
          <span className="email-hint">
            Darren is licensed in {LICENSED_STATES.join(' · ')}. Send your details anyway and he
            will point you to someone who can help where you are.
          </span>
        )}
      </div>

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
 * The option row is the visitor's own choice shown back to them. It is not in
 * the lead (the payload is unchanged by the redesign), so it sits under "Your
 * summary" and the copy above it claims only the numbers were sent, which they
 * were: every option's payment and saving is in the payload.
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
        <button type="button" className="btn btn-teal" onClick={v.openCalendly}>Schedule a Time</button>
        <a href={`tel:${PHONE.replace(/\D/g, '')}`} className="btn dcp-back">Call Darren {PHONE}</a>
      </div>
      <p className="dcp-caption">Estimates only. Actual options depend on a personal review.</p>
    </div>
  );
}

// ─── The page ─────────────────────────────────────────────────────────────────

/**
 * Hero, then the calculator. `id="savings"` stays on the calculator itself:
 * the nav's "Monthly Reset" link and the step buttons both scroll to it.
 */
export default function DebtPage({ v, overlays }: { v: DebtPageView; overlays: ReactNode }) {
  return (
    <section className="dcp">
      <DebtPageHero onAskHeloc={v.openCalendly} />

      <div id="savings" className="dcp-flow">
        <ul className="dcp-trust">
          <li><Check /> No cost to see your numbers</li>
          <li><Check /> Educational estimates</li>
          <li><Check /> Results before contact</li>
        </ul>

        {!v.submitted && (
          <div className="dcp-steps">
            {STEPS.map((label, i) => {
              const n = i + 1;
              const done = v.step > n;
              return (
                <button key={n} type="button" onClick={() => v.goStep(n)}
                  className={`dcp-step${v.step === n ? ' dcp-step-active' : ''}${done ? ' dcp-step-done' : ''}`}
                  aria-current={v.step === n ? 'step' : undefined}>
                  <span className="dcp-step-num">{done ? <Check /> : n}</span>
                  <span>{label}</span>
                </button>
              );
            })}
          </div>
        )}

        {v.submitted && <DebtRecap v={v} />}
        {!v.submitted && v.step === 1 && <StepDebts v={v} />}
        {!v.submitted && v.step === 2 && <StepHome v={v} />}
        {!v.submitted && v.step === 3 && <StepCompare v={v} />}
        {!v.submitted && v.step === 4 && <StepContact v={v} />}

        <div className="dcp-disclosure">{v.disclosure}</div>
      </div>

      {overlays}
    </section>
  );
}
