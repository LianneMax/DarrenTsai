import { useZipLookup } from '../hooks/useZipLookup';
import JourneyTimeline from './JourneyTimeline';
import ZipFeedback from './ZipFeedback';
/**
 * What /home-equity/ looks like.
 *
 * PRESENTATION ONLY, the same split as DebtPageViews.tsx: HomeEquityCalculator
 * holds the state, the gates and the lead, and hands everything here as one
 * `view` object. Nothing here computes a figure.
 *
 * Rebuilt on 15 Oct 2026 (with Darren) as the site's main focus: three short
 * steps, mostly taps, with no income, employer, start date or co-borrower
 * questions, and Darren's calendar after them for a lead that passes. HELOC is
 * explained first, then the fixed home equity loan, cash-out refinance and a
 * home equity investment (HEI, added 15 Oct 2026: no provider named, no
 * pricing, availability varies). None of the claims awaiting Saxton's
 * approval ("approval locked in", "zero credit impact", "soft pull",
 * "tax-free", "up to $400,000+", "exact funded amount", "approved in 15
 * minutes", "7 days"): tests/home-equity.test.tsx fails on each of them.
 *
 * Wording, from docs/lead-sheet-schema.md: "Estimated Home Equity" (not
 * available equity), "Your request has been received" (not "Darren has
 * reviewed"). Never approved, qualify or available credit.
 */
import { useEffect, type ReactNode } from 'react';
import SavedLeadCalendar from './SavedLeadCalendar';
import { formatCurrency } from '../utils/formatters';
import { type EmailSuggestion, emailHintMessage, hintAfterBlur } from '../utils/emailSuggest';
import { EQUITY_GOALS, CREDIT_RANGES, CASH_RANGES, EQUITY_OPTIONS, PROPERTY_TYPES, PROPERTY_USES } from '../utils/homeEquity';
import { PROPERTY_STATES, PROPERTY_STATE_LABELS, serviceArea } from '../utils/serviceArea';
import InquiryMessage from './InquiryMessage';
import { BOOKING_CALENDAR_READY } from '../utils/booking';
import { Arrow, Check, Row, StepNav, EquitySnapshot, Chips, MoneyInput } from './PageParts';
import ComplianceDisclosure from './ComplianceDisclosure';
import { HouseOptions } from './Marketing';
import { formatUsPhone } from '../utils/phone';

export const EQUITY_FORM_ID = 'home-equity-calculator';

/** Everything the page shows, held by HomeEquityCalculator. */
export interface EquityPageView {
  step: number;
  goStep: (n: number) => void;
  next: () => void;

  homeValue: string; setHomeValue: (v: string) => void;
  mtgBalance: string; setMtgBalance: (v: string) => void;
  hv: number; mb: number;
  /** A value and a balance (0 counts) have been entered. */
  hasHome: boolean;
  equity: number;

  propertyType: string; setPropertyType: (v: string) => void;
  propertyUse: string; setPropertyUse: (v: string) => void;
  zip: string; setZip: (v: string) => void;
  propertyState: string; setPropertyState: (v: string) => void;

  goal: string; setGoal: (v: string) => void;
  creditRange: string; setCreditRange: (v: string) => void;
  cashRange: string; setCashRange: (v: string) => void;
  mortgageCurrent: string; setMortgageCurrent: (v: string) => void;
  bankruptcy: string; setBankruptcy: (v: string) => void;
  preference: string; setPreference: (v: string) => void;

  fname: string; setFname: (v: string) => void;
  lname: string; setLname: (v: string) => void;
  phone: string; setPhone: (v: string) => void;
  email: string; setEmail: (v: string) => void;
  message: string; setMessage: (v: string) => void;
  emailHint: EmailSuggestion | null; setEmailHint: (h: EmailSuggestion | null) => void;
  sending: boolean;
  submitted: boolean;
  /** '' while the visitor is still in, otherwise why the flow stopped. */
  declined: '' | 'property-type' | 'knockout';
  submitLead: () => void;
}

const STEPS = [['Your home','Value, mortgage and property'],['Your goal','What you have in mind'],['Talk to Darren','A personal next step']] as const;

// ─── Hero ─────────────────────────────────────────────────────────────────────

/**
 * The top of the page, pre-rendered into home-equity/index.html at build time
 * (src/prerender.tsx), so it paints with the first frame and is the LCP
 * element. Static on purpose, as on /debt-consolidation/: no JavaScript, no
 * fade-in, no phone number for CallRail to swap. The button is a real anchor.
 */
export function EquityPageHero({path='equity',onPath}:{path?:EquityPath;onPath?:(p:EquityPath)=>void}) {
 return <div className="equity-opening wrap"><div><h1>What could your <em>home equity</em> help you do?</h1><PathSwitch path={path} onPath={onPath || (()=>{})}/><p className="intent-context"><span className="hv-equity">Enter your home value and mortgage balance below to see your estimated equity.</span><span className="hv-payoff">Start with your current debts below. Then compare using home equity to pay them off.</span></p></div><div><HouseOptions large/></div></div>;
}

export type EquityPath = 'equity' | 'payoff';

/** The two ways into the page. A real choice, never pre-answered by anything but the URL. */
export function PathSwitch({ path, onPath }: { path: EquityPath; onPath: (p: EquityPath) => void }) {
  return (
    <div className="dcp-path" role="group" aria-label="What would you like to do?">
      <button type="button" className="dcp-chip" aria-pressed={path === 'equity'} data-early="equity-path-access" onClick={() => onPath('equity')}><strong>Access my home equity</strong><small>Start with your home’s value</small></button>
      <button type="button" className="dcp-chip" aria-pressed={path === 'payoff'} data-early="equity-path-payoff" onClick={() => onPath('payoff')}><strong>Pay off high-interest debt</strong><small>Compare your payment options</small></button>
    </div>
  );
}

// ─── Small pieces ─────────────────────────────────────────────────────────────

/** Single-choice taps whose stored value differs from the label. */
function Choices({ options, value, onChange, label }: {
  options: ReadonlyArray<readonly [string, string]>; value: string; onChange: (v: string) => void; label: string;
}) {
  return (
    <div className="dcp-chips" role="group" aria-label={label}>
      {options.map(([v, text]) => (
        <button key={v} type="button" className="dcp-chip" aria-pressed={value === v}
          onClick={() => onChange(value === v ? '' : v)}>
          {text}
        </button>
      ))}
    </div>
  );
}

const YES_NO_NONE = [['yes', 'Yes'], ['no', 'No'], ['no-mortgage', 'No mortgage']] as const;
const NO_YES = [['no', 'No'], ['yes', 'Yes']] as const;

// ─── Step 1: home ─────────────────────────────────────────────────────────────

export function StepEquityHome({ v }: { v: EquityPageView }) {
  const zipDone = /^\d{5}$/.test(v.zip);
  const zipCheck = useZipLookup(v.zip);
  const { setPropertyState } = v;
  const { status: zipStatus, state: zipState, needsConfirmation } = zipCheck;
  useEffect(() => {
    if (zipStatus === 'found') setPropertyState(zipState || '');
    else if (needsConfirmation || zipStatus === 'invalid') setPropertyState('');
  }, [zipStatus, zipState, needsConfirmation, setPropertyState]);
  return (
    <div className="dcp-panel">
      <h2 className="dcp-h2 dcp-h2-lg">Your home, at a glance.</h2>
      <p className="dcp-lead">Two numbers for your estimated equity, then three taps about the property.</p>

      <div className="dcp-grid-2">
        <MoneyInput id="he-value" label="Current Home Value" value={v.homeValue}
          onChange={v.setHomeValue} placeholder="e.g. 650,000" />
        <MoneyInput id="he-balance" label="Current Mortgage Balance" value={v.mtgBalance}
          onChange={v.setMtgBalance} placeholder="e.g. 350,000" />
      </div>
      <p className="dcp-hint">Enter 0 if the home is paid off. The grey numbers are examples, not your figures.</p>

      {v.hasHome && <EquitySnapshot hv={v.hv} mb={v.mb} />}

      <h3 className="dcp-h3">What type of property is it?</h3>
      <Choices options={PROPERTY_TYPES} value={v.propertyType} onChange={v.setPropertyType} label="Property type" />

      <h3 className="dcp-h3">How do you use the home you&apos;re borrowing against?</h3>
      <Choices options={PROPERTY_USES} value={v.propertyUse} onChange={v.setPropertyUse} label="Property use" />

      <div className="dcp-grid-2">
        <div>
          <label className="input-label" htmlFor="he-zip">ZIP of the home you&apos;re borrowing against</label>
          <input id="he-zip" className="form-input" inputMode="numeric" autoComplete="postal-code"
            maxLength={5} placeholder="e.g. 92646" value={v.zip} aria-describedby="he-zip-feedback" aria-invalid={zipCheck.status === 'invalid'}
            onChange={(e) => v.setZip(e.target.value.replace(/\D/g, '').slice(0, 5))} />
          <ZipFeedback check={zipCheck} />
        </div>
        {(zipDone || v.propertyState) && (
          <div>
            <label className="input-label" htmlFor="he-state">State of the home you&apos;re borrowing against</label>
            <select id="he-state" className="form-input" value={v.propertyState}
              onChange={(e) => {
                const state = e.target.value;
                // A state has many ZIPs. Never invent one when the visitor
                // corrects the state; clear the old known/pending ZIP instead.
                if (state !== v.propertyState && v.zip && !zipCheck.needsConfirmation) v.setZip('');
                v.setPropertyState(state);
              }}>
              <option value="">Choose the property state</option>
              {PROPERTY_STATES.map((s) => <option key={s} value={s}>{PROPERTY_STATE_LABELS[s]}</option>)}
            </select>
          </div>
        )}
      </div>
      <p className="dcp-hint">ZIP of the home you&apos;re borrowing against. It checks that Darren can lend on it; where you use the cash doesn&apos;t matter.</p>

      <div className="dcp-actions">
        <small className="dcp-caption dcp-actions-note">No application required to see this estimate.</small>
        <button type="button" className="btn btn-teal" disabled={!zipCheck.canContinue} onClick={v.next}>
          Continue <Arrow />
        </button>
      </div>
    </div>
  );
}

// ─── Step 2: goal and the two questions ───────────────────────────────────────

export function StepEquityGoal({ v }: { v: EquityPageView }) {
  return (
    <div className="dcp-panel">
      <h2 className="dcp-h2 dcp-h2-lg">What is the equity for?</h2>
      <Chips options={EQUITY_GOALS} value={v.goal} onChange={v.setGoal} label="Goal" />

      <h3 className="dcp-h3">Your credit, roughly</h3>
      <Chips options={CREDIT_RANGES} value={v.creditRange} onChange={v.setCreditRange} label="Credit range" />

      <h3 className="dcp-h3">How much cash would you like to access?</h3>
      <Chips options={CASH_RANGES} value={v.cashRange} onChange={v.setCashRange} label="Cash range" />

      <h3 className="dcp-h3">Is your mortgage current?</h3>
      <Choices options={YES_NO_NONE} value={v.mortgageCurrent} onChange={v.setMortgageCurrent} label="Mortgage current" />

      <h3 className="dcp-h3">Any bankruptcy or foreclosure in the last 4 years?</h3>
      <Choices options={NO_YES} value={v.bankruptcy} onChange={v.setBankruptcy} label="Bankruptcy or foreclosure" />

      <h3 className="dcp-h3">Which option interests you most? <span className="dcp-optional">· optional</span></h3>
      <Chips options={EQUITY_OPTIONS} value={v.preference} onChange={v.setPreference} label="Option of interest" />
      <p className="dcp-hint">Each one is explained below.</p>

      <StepNav back="← Your Home" onBack={() => v.goStep(1)} next={<>Continue <Arrow /></>} onNext={v.next} />
    </div>
  );
}

// ─── Step 3: contact ──────────────────────────────────────────────────────────

/**
 * Contact and consent. Property use and state were asked in step 1, so the
 * shared select pair is not drawn here; the empty data-service-area marker
 * tells service-area.js not to add it, and the answers travel in the payload.
 */
export function StepEquityContact({ v }: { v: EquityPageView }) {
  const outside = serviceArea(v.propertyUse, v.propertyState, 'home-equity') === 'out-of-market';
  return (
    <div className="dcp-panel">
      <h2 className="dcp-h2 dcp-h2-lg">Where should Darren reach you?</h2>
      <p className="dcp-lead">Your estimate and answers go with your request. {outside
        ? <>You can record your inquiry, but a call is unavailable for this property’s state and use.</>
        : BOOKING_CALENDAR_READY
        ? <>Next, you can pick a time on Darren&apos;s calendar.</>
        : <>Darren will call you to set a time.</>}</p>
      <span data-service-area={EQUITY_FORM_ID} hidden />

      <div className="dcp-grid-2">
        <div>
          <label className="input-label" htmlFor="lead-fname">First Name</label>
          <input id="lead-fname" type="text" className="form-input" placeholder="First name" autoComplete="given-name"
            value={v.fname} onChange={(e) => v.setFname(e.target.value)} />
        </div>
        <div>
          <label className="input-label" htmlFor="lead-lname">Last Name</label>
          <input id="lead-lname" type="text" className="form-input" placeholder="Last name" autoComplete="family-name"
            value={v.lname} onChange={(e) => v.setLname(e.target.value)} />
        </div>
      </div>

      <div className="dcp-grid-2">
        <div>
          <label className="input-label" htmlFor="lead-email">Email Address</label>
          <input id="lead-email" type="email" className="form-input" placeholder="you@email.com" autoComplete="email"
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
          <label className="input-label" htmlFor="lead-phone">Phone Number</label>
          <input id="lead-phone" type="tel" className="form-input" placeholder="(714) 000-0000" autoComplete="tel"
            value={v.phone} onChange={(e) => v.setPhone(formatUsPhone(e.target.value))} />
        </div>
      </div>

      <InquiryMessage id="equity-inquiry-message" value={v.message} onChange={v.setMessage} />
      <ComplianceDisclosure formId={EQUITY_FORM_ID} />

      <StepNav
        back="← Your Goal" onBack={() => v.goStep(2)}
        disabled={v.sending}
        next={v.sending
          ? <><span className="btn-spinner" aria-hidden="true" /> Sending…</>
          : <>{outside ? 'Record my inquiry' : BOOKING_CALENDAR_READY ? <>See Darren&apos;s Calendar</> : <>Send my request</>} <Arrow /></>}
        onNext={v.submitLead}
      />
    </div>
  );
}

// ─── Stopped ──────────────────────────────────────────────────────────────────

/** A knockout. No calendar and no phone number, on purpose. */
export function EquityDeclined({ v }: { v: EquityPageView }) {
  return (
    <div className="dcp-panel dcp-recap">
      <h2 className="dcp-h2 dcp-h2-lg">Thanks for checking.</h2>
      <p className="dcp-lead">
        {v.declined === 'property-type'
          ? 'Darren does not finance mobile homes or land, so a call would not be the best use of your time.'
          : 'Based on your answers, a call with Darren is not the right next step just yet.'}
        {' '}You are welcome to keep exploring your numbers with the free calculators.
      </p>
      <div className="dcp-recap-actions">
        <a href="/" className="btn btn-teal">Explore the calculators</a>
      </div>
    </div>
  );
}

// ─── Confirmation ─────────────────────────────────────────────────────────────

/**
 * Shown only after the server has confirmed the save, then the calendar, drawn
 * by booking-chooser.js (DTBooking.calendar) so it is the same embed and the
 * same events as every other booking.
 */
export function EquityRecap({ v }: { v: EquityPageView }) {
  return (
    <div className="dcp-panel dcp-recap">
      <SavedLeadCalendar firstName={v.fname} />
      <details className="dcp-recap-details"><summary>View your saved answers</summary>
      <div className="dcp-recap-rows">
        <Row label="Estimated equity" value={v.equity >= 0 ? formatCurrency(v.equity) : 'None at these numbers'} />
        <Row label="Goal" value={v.goal} />
        <Row label="Cash you’d like to access" value={v.cashRange} />
        {v.preference && <Row label="Option of interest" value={v.preference} />}
      </div></details>
      <p className="dcp-caption">Estimates only. Actual options depend on a personal review.</p>
    </div>
  );
}

// ─── Products ─────────────────────────────────────────────────────────────────

/** The three ways to use equity, in plain words, HELOC first. Never priced. */
export function EquityProducts() {
  return (
    <div className="dcp-panel">
      <span className="dcp-eyebrow dcp-eyebrow-dark">Your options, in plain words</span>
      <h2 className="dcp-h2">Four ways to use your equity.</h2>
      <div className="dcp-products">
        <article className="dcp-product">
          <h3>HELOC (home equity line of credit)</h3>
          <p>A credit line against your home. You draw what you need, when you need it, and keep your current mortgage.</p>
          <ul>
            <li>Pay interest only on what you use</li>
            <li>Usually a variable rate</li>
          </ul>
        </article>
        <article className="dcp-product">
          <h3>Fixed home equity loan</h3>
          <p>One lump sum at a fixed rate, paid back on a set schedule, alongside your current mortgage.</p>
          <ul>
            <li>The same payment every month</li>
            <li>A second payment next to your mortgage</li>
          </ul>
        </article>
        <article className="dcp-product">
          <h3>Cash-out refinance</h3>
          <p>A new, larger mortgage replaces the one you have, and you take the difference in cash.</p>
          <ul>
            <li>One mortgage payment</li>
            <li>Your current rate and terms change, and closing costs may apply</li>
          </ul>
        </article>
        <article className="dcp-product">
          <h3>Home equity investment (HEI)</h3>
          <p>Cash now with no monthly payment. In exchange, the investor gets a share of your home&apos;s future value when you sell, refinance or the term ends.</p>
          <ul>
            <li>No monthly payment</li>
            <li>It can cost more than a loan over time, especially if your home gains value</li>
          </ul>
          <p className="dcp-caption">Availability varies by state and property.</p>
        </article>
      </div>
      <p className="dcp-caption">
        Which one fits depends on your rate today, how you will use the money and how long you plan to
        stay. Rates, fees, terms and amounts depend on the lender and a personal review.
      </p>
    </div>
  );
}

// ─── The page ─────────────────────────────────────────────────────────────────

/** Hero, then the flow. `id="equity"` is what the hero button and goStep scroll to. */
export default function EquityPage({ v, overlays, disclosure, path = 'equity', onPath, payoff }: {
  v: EquityPageView; overlays: ReactNode; disclosure: ReactNode;
  /** 'payoff' shows the debt comparison (moved from /debt-consolidation/). */
  path?: EquityPath; onPath?: (p: EquityPath) => void; payoff?: ReactNode;
}) {
  const done = v.submitted || !!v.declined;
  if (path === 'payoff') {
    return (
      <section className="dcp">
        <div className="equity-opening-surface"><EquityPageHero path={path} onPath={onPath} /></div>
        {payoff}
        {overlays}
      </section>
    );
  }
  return (
    <section className="dcp equity-estimate-surface equity-revamp">
      <div className="equity-opening-surface"><EquityPageHero path={path} onPath={onPath} /></div>

      <div id="equity" className="dcp-flow" data-dt-form="home-equity-calculator">
        <ul className="dcp-trust">
          <li><Check /> Educational estimate</li>
          <li><Check /> Mostly taps</li>
          <li><Check /> Personal guidance</li>
        </ul>

        <div className={done?'':'equity-journey-layout'}>
        {!done&&<JourneyTimeline steps={STEPS} current={v.step} disabled={v.sending} onStep={v.goStep}/>}
        <div className="equity-journey-content">
        {!done && <p className="equity-stage-state">{v.step} of 3</p>}
        {v.submitted && <EquityRecap v={v} />}
        {!v.submitted && v.declined && <EquityDeclined v={v} />}
        {!done && v.step === 1 && <StepEquityHome v={v} />}
        {!done && v.step === 2 && <StepEquityGoal v={v} />}
        {!done && v.step === 3 && <StepEquityContact v={v} />}

        {/* Product education follows the calculator in the shared options section. */}

        <div className="dcp-disclosure">{disclosure}</div>
        </div></div>
      </div>

      {overlays}
    </section>
  );
}
