/**
 * What /home-equity/ looks like (frontend revamp, phase 3).
 *
 * PRESENTATION ONLY, the same split as DebtPageViews.tsx: HomeEquityCalculator
 * holds the state, the gates and the lead, and hands everything here as one
 * `view` object. Nothing here computes a figure.
 *
 * Layout and copy follow Max's design preview v4 (Home Equity page), with the
 * site's rules where the two differ: every input starts empty with an "e.g."
 * placeholder, no goal or preference is pre-selected, and no payment, rate or
 * borrowing amount is quoted anywhere. The page explains the products and
 * hands the visitor to Darren; it does not say what anyone can borrow.
 *
 * Wording, from docs/lead-sheet-schema.md: "Estimated Home Equity" (not
 * available equity), "Illustrative CLTV" (not available credit), "Your request
 * has been received" (not "Darren has reviewed"). Never approved, qualify or
 * available credit.
 */
import { AsYouType } from 'libphonenumber-js';
import type { ReactNode } from 'react';
import { LICENSED_STATES, PHONE, isLicensedState } from '../config';
import { formatCurrency, formatRate } from '../utils/formatters';
import { checkEmail, emailHintMessage, type EmailSuggestion } from '../utils/emailSuggest';
import { EQUITY_GOALS, EQUITY_PREFERENCES, COMMON_CLTV_LIMIT } from '../utils/homeEquity';
import StateSelect from './StateSelect';
import { Arrow, Check, Row, StepNav, EquitySnapshot, LicensedStrip } from './PageParts';

/** Everything the page shows, held by HomeEquityCalculator. */
export interface EquityPageView {
  step: number;
  goStep: (n: number) => void;

  homeValue: string; setHomeValue: (v: string) => void;
  mtgBalance: string; setMtgBalance: (v: string) => void;
  amount: string; setAmount: (v: string) => void;
  hv: number; mb: number; amt: number;
  /** A value and a balance (0 counts) have been entered. */
  hasHome: boolean;
  equity: number; ltv: number; cltv: number;

  goal: string; setGoal: (g: string) => void;
  preference: string; setPreference: (p: string) => void;

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
}

const STEPS = ['Your Home', 'Your Options', 'Talk to Darren'];

// ─── Hero ─────────────────────────────────────────────────────────────────────

/**
 * The top of the page, pre-rendered into home-equity/index.html at build time
 * (src/prerender.tsx), so it paints with the first frame and is the LCP
 * element. Static on purpose, as on /debt-consolidation/: no JavaScript, no
 * fade-in, no phone number for CallRail to swap. The button is a real anchor.
 */
export function EquityPageHero() {
  return (
    <>
      <div className="dcp-hero">
        <div className="dcp-hero-inner">
          <div>
            <span className="dcp-eyebrow">Home Equity</span>
            <h1 className="dcp-h1">See what your home equity could help you do.</h1>
            <p className="dcp-hero-sub">
              A quick estimate. Clear explanations. A starting point for a personal conversation.
            </p>
            <a href="#equity" className="btn dcp-hero-btn">
              Check My Home Equity
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 5v14M6 13l6 6 6-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </a>
            <p className="dcp-hero-note">No cost and no application to see your estimate.</p>
          </div>

          <div className="dcp-how">
            <span className="dcp-eyebrow">Start with your goal</span>
            <p className="dcp-how-title">Know your numbers. Understand your options.</p>
            <dl>
              <div><dt>01</dt><dd>Estimate equity &amp; LTV</dd></div>
              <div><dt>02</dt><dd>Explore how the structures differ</dd></div>
              <div><dt>03</dt><dd>Have Darren review your situation</dd></div>
            </dl>
          </div>
        </div>
      </div>

      <LicensedStrip />
    </>
  );
}

// ─── Small pieces ─────────────────────────────────────────────────────────────

/** A row of single-choice buttons. Clicking the chosen one again clears it. */
function Chips({ options, value, onChange, label }: {
  options: readonly string[]; value: string; onChange: (v: string) => void; label: string;
}) {
  return (
    <div className="dcp-chips" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o} type="button" className="dcp-chip" aria-pressed={value === o}
          onClick={() => onChange(value === o ? '' : o)}>
          {o}
        </button>
      ))}
    </div>
  );
}

function MoneyInput({ id, label, value, onChange, placeholder, optional }: {
  id: string; label: ReactNode; value: string; onChange: (v: string) => void; placeholder: string; optional?: boolean;
}) {
  return (
    <div>
      <label className="input-label" htmlFor={id}>
        {label}{optional && <span className="dcp-optional"> · optional</span>}
      </label>
      <div className="input-prefix-wrap">
        <span className="input-prefix">$</span>
        <input id={id} type="number" inputMode="decimal" className="form-input input-has-prefix"
          placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
      </div>
    </div>
  );
}

// ─── Step 1: home ─────────────────────────────────────────────────────────────

export function StepEquityHome({ v }: { v: EquityPageView }) {
  return (
    <div className="dcp-panel">
      <h2 className="dcp-h2 dcp-h2-lg">Your home, at a glance.</h2>
      <p className="dcp-lead">Start with two numbers to estimate your home equity.</p>

      <div className="dcp-grid-2">
        <MoneyInput id="he-value" label="Current Home Value" value={v.homeValue}
          onChange={v.setHomeValue} placeholder="e.g. 650,000" />
        <MoneyInput id="he-balance" label="Current Mortgage Balance" value={v.mtgBalance}
          onChange={v.setMtgBalance} placeholder="e.g. 350,000" />
      </div>
      <p className="dcp-hint">Enter 0 if the home is paid off. The grey numbers are examples, not your figures.</p>

      {v.hasHome && <EquitySnapshot hv={v.hv} mb={v.mb} />}

      <h3 className="dcp-h3">What would you use your equity for?</h3>
      <Chips options={EQUITY_GOALS} value={v.goal} onChange={v.setGoal} label="Goal" />

      <div className="dcp-field">
        <MoneyInput id="he-amount" label="About how much would you like to access?" optional
          value={v.amount} onChange={v.setAmount} placeholder="e.g. 75,000" />
      </div>

      <div className="dcp-actions">
        <small className="dcp-caption dcp-actions-note">No application required to see this estimate.</small>
        <button type="button" className="btn btn-teal" onClick={() => v.goStep(2)}>
          Explore My Options <Arrow />
        </button>
      </div>
    </div>
  );
}

// ─── Step 2: options ──────────────────────────────────────────────────────────

/**
 * The products, described rather than priced. The preview's cards, its "Learn
 * more" (which expands in place: docs/frontend-revamp-review.md asks that it
 * never links to a page that does not exist) and its cash-out note.
 */
export function StepEquityOptions({ v }: { v: EquityPageView }) {
  const overLimit = v.cltv > COMMON_CLTV_LIMIT;
  return (
    <div className="dcp-panel">
      <span className="dcp-eyebrow dcp-eyebrow-dark">Your equity snapshot</span>
      <h2 className="dcp-h2 dcp-h2-lg">Understand the possibilities.</h2>

      <EquitySnapshot hv={v.hv} mb={v.mb} />

      {v.amt > 0 && (
        <>
          <Row label="Amount you're exploring" value={formatCurrency(v.amt)} />
          <Row label="Illustrative CLTV after requested amount" value={formatRate(v.cltv)} />
          <p className="dcp-caption">
            Simplified illustration excluding other liens and costs. Not an approval or available credit.
            {overLimit && <> That is above the {COMMON_CLTV_LIMIT}% combined loan-to-value many lenders
              use as a limit for a second loan. Darren can tell you what may be possible.</>}
          </p>
        </>
      )}

      <div className="dcp-note">
        <h3>Equity is a starting point, not a borrowing limit.</h3>
        <p>
          Your estimated equity includes value you may need to leave in the home. Lenders also review
          credit, income, property value, other liens and their maximum combined loan-to-value limit.
        </p>
        <p>
          <strong>Next:</strong> choose what matters to you, then ask Darren to review eligibility,
          available amounts and terms. No payment or approval is being quoted here.
        </p>
      </div>

      <div className="dcp-products">
        <article className="dcp-product">
          <h3>Home Equity Line of Credit</h3>
          <p>Access funds as needed while keeping your existing mortgage.</p>
          <ul>
            <li>Flexible access over time</li>
            <li>Usually a variable rate</li>
          </ul>
          <details>
            <summary>Learn more</summary>
            <p>Draw and repayment periods affect payments. Rates, fees and terms depend on the lender and your situation.</p>
          </details>
        </article>
        <article className="dcp-product">
          <h3>Fixed Home Equity Loan</h3>
          <p>Receive a lump sum alongside your existing mortgage.</p>
          <ul>
            <li>Predictable loan payments</li>
            <li>A separate monthly payment</li>
          </ul>
          <details>
            <summary>Learn more</summary>
            <p>A fixed-rate second loan can preserve your first mortgage&apos;s rate. The term affects the monthly payment and total interest.</p>
          </details>
        </article>
      </div>

      <details className="dcp-details">
        <summary>What about a cash-out refinance?</summary>
        <p className="dcp-caption">
          A new, larger mortgage replaces the existing mortgage. Your current rate and loan terms change,
          and closing costs may apply.
        </p>
      </details>

      <h3 className="dcp-h3">What matters most to you? <span className="dcp-optional">· optional</span></h3>
      <Chips options={EQUITY_PREFERENCES} value={v.preference} onChange={v.setPreference} label="Preference" />

      <StepNav
        back="← Your Home" onBack={() => v.goStep(1)}
        next={<>Ask Darren to Review Eligibility <Arrow /></>} onNext={() => v.goStep(3)}
      />
    </div>
  );
}

// ─── Step 3: contact ──────────────────────────────────────────────────────────

export function StepEquityContact({ v }: { v: EquityPageView }) {
  return (
    <div className="dcp-panel">
      <h2 className="dcp-h2 dcp-h2-lg">Find out which equity options may fit.</h2>
      <p className="dcp-lead">
        Your estimate is a starting point. A personal review helps you understand which options may
        fit your goals. No hard pull, no obligation.
      </p>

      <div className="dcp-grid-2">
        <div>
          <label className="input-label" htmlFor="he-fname">First Name</label>
          <input id="he-fname" type="text" className="form-input" placeholder="First name"
            value={v.fname} onChange={(e) => v.setFname(e.target.value)} />
        </div>
        <div>
          <label className="input-label" htmlFor="he-lname">Last Name</label>
          <input id="he-lname" type="text" className="form-input" placeholder="Last name"
            value={v.lname} onChange={(e) => v.setLname(e.target.value)} />
        </div>
      </div>

      <div className="dcp-grid-2">
        <div>
          <label className="input-label" htmlFor="he-email">Email Address</label>
          <input id="he-email" type="email" className="form-input" placeholder="you@email.com"
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
          <label className="input-label" htmlFor="he-phone">Phone Number</label>
          <input id="he-phone" type="tel" className="form-input" placeholder="(714) 000-0000"
            value={v.phone} onChange={(e) => v.setPhone(new AsYouType('US').input(e.target.value))} />
        </div>
      </div>

      <div className="dcp-field">
        <label className="input-label" htmlFor="us-state">State</label>
        <StateSelect id="us-state" value={v.usState} onChange={v.setUsState} placeholder="Select your state…" />
        {v.usState && !isLicensedState(v.usState) && (
          <span className="email-hint">
            Darren is licensed in {LICENSED_STATES.join(' · ')}. Send your details anyway and he
            will point you to someone who can help where you are.
          </span>
        )}
      </div>

      <p className="dcp-caption">
        Darren will review your goal, requested amount and home snapshot, then discuss eligibility and
        lender terms. This request is not a loan application.
      </p>

      <StepNav
        back="← Back" onBack={() => v.goStep(2)}
        disabled={v.sending}
        next={v.sending
          ? <><span className="btn-spinner" aria-hidden="true" /> Sending…</>
          : <>Send My Request to Darren <Arrow /></>}
        onNext={v.submitLead}
      />
    </div>
  );
}

// ─── Confirmation ─────────────────────────────────────────────────────────────

/**
 * Shown only after the server has confirmed the save. Every row here is in the
 * lead (unlike the debt page's chosen option), so "sent with it" is true of all
 * of them.
 */
export function EquityRecap({ v }: { v: EquityPageView }) {
  return (
    <div className="dcp-panel dcp-recap">
      <div className="success-check" role="img" aria-label="Success">✓</div>
      <h2 className="dcp-h2 dcp-h2-lg">Your request has been received.</h2>
      <p className="dcp-lead">
        Your estimate and goal were sent with it, so you will not need to start over. Darren will be
        in touch.
      </p>

      <div className="dcp-recap-rows">
        <span className="dcp-eyebrow dcp-eyebrow-dark">Your summary</span>
        <Row label="Estimated equity" value={v.equity >= 0 ? formatCurrency(v.equity) : 'None at these numbers'} />
        {v.amt > 0 && <Row label="Amount exploring" value={formatCurrency(v.amt)} />}
        <Row label="Goal" value={v.goal} />
        {v.preference && <Row label="What matters most" value={v.preference} />}
      </div>

      {/* Booking after the save, so every booked call arrives with its numbers.
          The call link is a real tel: anchor, so CallRail swaps the number. */}
      <div className="dcp-recap-actions">
        <button type="button" className="btn btn-teal" onClick={v.openCalendly}>Schedule a Time</button>
        <a href={`tel:${PHONE.replace(/\D/g, '')}`} className="btn dcp-back">Call Darren {PHONE}</a>
      </div>
      <p className="dcp-caption">Estimates only. Actual options depend on a personal review.</p>
    </div>
  );
}

// ─── The page ─────────────────────────────────────────────────────────────────

/** Hero, then the flow. `id="equity"` is what the hero button and goStep scroll to. */
export default function EquityPage({ v, overlays, disclosure }: {
  v: EquityPageView; overlays: ReactNode; disclosure: ReactNode;
}) {
  return (
    <section className="dcp">
      <EquityPageHero />

      <div id="equity" className="dcp-flow">
        <ul className="dcp-trust">
          <li><Check /> Educational estimate</li>
          <li><Check /> Results before contact</li>
          <li><Check /> Personal guidance</li>
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

        {v.submitted && <EquityRecap v={v} />}
        {!v.submitted && v.step === 1 && <StepEquityHome v={v} />}
        {!v.submitted && v.step === 2 && <StepEquityOptions v={v} />}
        {!v.submitted && v.step === 3 && <StepEquityContact v={v} />}

        <div className="dcp-disclosure">{disclosure}</div>
      </div>

      {overlays}
    </section>
  );
}
