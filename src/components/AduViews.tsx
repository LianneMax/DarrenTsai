/**
 * What /adu/ looks like (frontend revamp, phase 5).
 *
 * PRESENTATION ONLY, the same split as the debt and home-equity pages:
 * AduCalculator holds the state, the gates and the lead; this draws it.
 *
 * Layout and copy follow Max's design preview v4 (ADU page), with the site's
 * rules where the two differ: inputs start empty with "e.g." placeholders, no
 * project type is pre-selected, and nothing is priced. The page connects the
 * budget to a funding plan and says plainly that financing and permits are
 * two separate checks: financing does not confirm an ADU can be built or
 * rented, and the page must never read as if it did.
 */
import type { ReactNode } from 'react';
import { PHONE } from '../config';
import { formatCurrency, formatRate } from '../utils/formatters';
import { type EmailSuggestion } from '../utils/emailSuggest';
import { ADU_PURPOSES } from '../utils/adu';
import { COMMON_CLTV_LIMIT } from '../utils/homeEquity';
import { Arrow, Check, Row, EquitySnapshot, LicensedStrip, Chips, MoneyInput, LeadContactStep } from './PageParts';

/** Everything the page shows, held by AduCalculator. */
export interface AduPageView {
  step: number;
  goStep: (n: number) => void;

  homeValue: string; setHomeValue: (v: string) => void;
  mtgBalance: string; setMtgBalance: (v: string) => void;
  projectCost: string; setProjectCost: (v: string) => void;
  toFinance: string; setToFinance: (v: string) => void;
  hv: number; mb: number; cost: number; fin: number;
  /** A value and a balance (0 counts) have been entered. */
  hasHome: boolean;
  equity: number; ltv: number; cltv: number; gap: number;

  purpose: string; setPurpose: (p: string) => void;

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

const STEPS = ['Your Project', 'Talk to Darren'];

// ─── Hero ─────────────────────────────────────────────────────────────────────

/**
 * Pre-rendered into adu/index.html (src/prerender.tsx), like the other revamp
 * pages' heroes: the LCP element, static, no phone number, a real anchor.
 */
export function AduPageHero() {
  return (
    <>
      <div className="dcp-hero">
        <div className="dcp-hero-inner">
          <div>
            <span className="dcp-eyebrow">Renovation / ADU</span>
            <h1 className="dcp-h1">Make room for your <em>next chapter.</em></h1>
            <p className="dcp-hero-sub">
              Explore how your home equity could support a renovation or an ADU.
            </p>
            <a href="#project" className="btn dcp-hero-btn">
              Explore My Project
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 5v14M6 13l6 6 6-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </a>
            <p className="dcp-hero-note">Start with your project. Understand the funding possibilities.</p>
          </div>

          <div className="dcp-hero-card">
            <span className="dcp-eyebrow dcp-eyebrow-dark">Your project starts with a snapshot</span>
            <p className="dcp-hero-card-title">Home equity. Project cost. Amount to finance.</p>
            <p className="dcp-caption">Bring the numbers together before choosing a loan product.</p>
            <div className="dcp-row"><span>Your home</span><span>Value &amp; mortgage balance</span></div>
            <div className="dcp-row"><span>Your project</span><span>Estimated cost</span></div>
            <div className="dcp-row"><span>Your next step</span><span>A review with Darren</span></div>
          </div>
        </div>
      </div>

      <LicensedStrip />
    </>
  );
}

// ─── Step 1: the project ──────────────────────────────────────────────────────

/** What the financing leaves of the budget, or adds beyond it, in words. */
function gapLine(gap: number): ReactNode {
  if (gap > 0) {
    return <>The remaining {formatCurrency(gap)} of the budget needs a separate plan, such as cash
      or other confirmed funding.</>;
  }
  if (gap < 0) {
    return <>The amount to finance is {formatCurrency(-gap)} more than the estimated project cost.
      Darren can talk through whether that fits your plan.</>;
  }
  return <>The amount to finance covers the estimated project cost.</>;
}

export function StepAduProject({ v }: { v: AduPageView }) {
  const ready = v.hasHome && v.cost > 0 && v.fin > 0;
  return (
    <div className="dcp-panel">
      <h2 className="dcp-h2 dcp-h2-lg">A starting point for your project.</h2>
      <p className="dcp-lead">Four numbers connect your home, your project and the amount you would finance.</p>

      <div className="dcp-grid-2">
        <MoneyInput id="adu-value" label="Current Home Value" value={v.homeValue}
          onChange={v.setHomeValue} placeholder="e.g. 650,000" />
        <MoneyInput id="adu-balance" label="Current Mortgage Balance" value={v.mtgBalance}
          onChange={v.setMtgBalance} placeholder="e.g. 350,000" />
        <MoneyInput id="adu-cost" label="Estimated Project Cost" value={v.projectCost}
          onChange={v.setProjectCost} placeholder="e.g. 175,000" />
        <MoneyInput id="adu-finance" label="Amount to Finance" value={v.toFinance}
          onChange={v.setToFinance} placeholder="e.g. 75,000" />
      </div>
      <p className="dcp-hint">Enter 0 for the balance if the home is paid off. The grey numbers are examples, not your figures.</p>

      <h3 className="dcp-h3">What are you planning?</h3>
      <Chips options={ADU_PURPOSES} value={v.purpose} onChange={v.setPurpose} label="Project purpose" />

      {v.hasHome && <EquitySnapshot hv={v.hv} mb={v.mb} />}

      {ready && (
        <>
          <Row label="Requested project financing" value={formatCurrency(v.fin)} />
          <Row label="Illustrative CLTV" value={formatRate(v.cltv)} />
          <p className="dcp-caption">
            Project cost is an estimate. This snapshot does not establish financing approval, permit
            feasibility or future property value.
            {v.cltv > COMMON_CLTV_LIMIT && <> That is above the {COMMON_CLTV_LIMIT}% combined loan-to-value
              many lenders use as a limit for a second loan. Darren can tell you what may be possible.</>}
          </p>

          <div className="dcp-note">
            <h3>Connect the project budget to a funding plan.</h3>
            <div className="dcp-row"><span>Project budget</span><span>{formatCurrency(v.cost)}</span></div>
            <div className="dcp-row"><span>Amount exploring through financing</span><span>{formatCurrency(v.fin)}</span></div>
            <p>{gapLine(v.gap)} Include contingency, design, permits and utility work in your budget.</p>
            <details>
              <summary>Which financing paths could fit?</summary>
              <p>
                A fixed home equity loan may suit a known one-time budget. A HELOC may suit staged draws,
                with variable-rate and repayment risks. A cash-out refinance replaces the first mortgage.
                Construction financing may require a separate project review. These are discussion paths,
                not eligibility results.
              </p>
            </details>
          </div>
        </>
      )}

      <div className="dcp-note">
        <h3>Two separate checks before moving forward</h3>
        <p><strong>Financing:</strong> Darren reviews your borrowing profile, funding amount and terms.</p>
        <p>
          <strong>Project feasibility:</strong> your local planning department and project professionals
          confirm zoning, permits, site conditions, costs and timing. Financing does not confirm the ADU
          can be built or rented.
        </p>
      </div>

      <div className="dcp-actions">
        <small className="dcp-caption dcp-actions-note">Explore funding before choosing a loan product.</small>
        <button type="button" className="btn btn-teal" onClick={() => v.goStep(2)}>
          Review My Project Funding Plan <Arrow />
        </button>
      </div>
    </div>
  );
}

// ─── Step 2: contact ──────────────────────────────────────────────────────────

export function StepAduContact({ v }: { v: AduPageView }) {
  return (
    <LeadContactStep
      v={v}
      title="Let’s review the possibilities."
      lead="Share your project with Darren. A personal review connects your budget, your home and the financing paths that may fit. No hard pull, no obligation."
      caption="Darren will review your project, funding amount and home snapshot, then discuss financing options and lender terms. This request is not a loan application and does not confirm permits or feasibility."
      submitLabel="Send My Project to Darren"
      onBack={() => v.goStep(1)}
    />
  );
}

// ─── Confirmation ─────────────────────────────────────────────────────────────

/** Shown only after the server has confirmed the save. Every row is in the lead. */
export function AduRecap({ v }: { v: AduPageView }) {
  return (
    <div className="dcp-panel dcp-recap">
      <div className="success-check" role="img" aria-label="Success">✓</div>
      <h2 className="dcp-h2 dcp-h2-lg">Your request has been received.</h2>
      <p className="dcp-lead">
        Your project and estimate were sent with it, so you will not need to start over. Darren will
        be in touch.
      </p>

      <div className="dcp-recap-rows">
        <span className="dcp-eyebrow dcp-eyebrow-dark">Your summary</span>
        <Row label="Project" value={v.purpose} />
        <Row label="Project cost" value={formatCurrency(v.cost)} />
        <Row label="Amount to finance" value={formatCurrency(v.fin)} />
        <Row label="Estimated equity" value={v.equity >= 0 ? formatCurrency(v.equity) : 'None at these numbers'} />
      </div>

      <div className="dcp-recap-actions">
        <button type="button" className="btn btn-teal" onClick={v.openCalendly}>Schedule a Time</button>
        <a href={`tel:${PHONE.replace(/\D/g, '')}`} className="btn dcp-back">Call Darren {PHONE}</a>
      </div>
      <p className="dcp-caption">Estimates only. Actual options depend on a personal review.</p>
    </div>
  );
}

// ─── The page ─────────────────────────────────────────────────────────────────

/** Hero, then the flow. `id="project"` is what the hero button and goStep scroll to. */
export default function AduPage({ v, overlays, disclosure }: {
  v: AduPageView; overlays: ReactNode; disclosure: ReactNode;
}) {
  return (
    <section className="dcp">
      <AduPageHero />

      <div id="project" className="dcp-flow">
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

        {v.submitted && <AduRecap v={v} />}
        {!v.submitted && v.step === 1 && <StepAduProject v={v} />}
        {!v.submitted && v.step === 2 && <StepAduContact v={v} />}

        <div className="dcp-disclosure">{disclosure}</div>
      </div>

      {overlays}
    </section>
  );
}
