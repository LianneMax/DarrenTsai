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
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { PHONE } from '../config';
import { formatCurrency } from '../utils/formatters';
import { type EmailSuggestion, emailHintMessage, hintAfterBlur } from '../utils/emailSuggest';
import { EQUITY_GOALS, CREDIT_RANGES, CASH_RANGES, EQUITY_OPTIONS, PROPERTY_TYPES, PROPERTY_USES } from '../utils/homeEquity';
import { PROPERTY_STATES, PROPERTY_STATE_LABELS } from '../utils/serviceArea';
import { BOOKING_CALENDAR_READY } from '../utils/booking';
import { Arrow, Check, Row, StepNav, EquitySnapshot, LicensedStrip, Chips, MoneyInput } from './PageParts';
import ComplianceDisclosure from './ComplianceDisclosure';
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
  emailHint: EmailSuggestion | null; setEmailHint: (h: EmailSuggestion | null) => void;
  sending: boolean;
  submitted: boolean;
  /** '' while the visitor is still in, otherwise why the flow stopped. */
  declined: '' | 'property-type' | 'knockout';
  submitLead: () => void;
}

const STEPS = ['Your Home', 'Your Goal', 'Talk to Darren'];

// ─── Hero ─────────────────────────────────────────────────────────────────────

/**
 * The top of the page, pre-rendered into home-equity/index.html at build time
 * (src/prerender.tsx), so it paints with the first frame and is the LCP
 * element. Static on purpose, as on /debt-consolidation/: no JavaScript, no
 * fade-in, no phone number for CallRail to swap. The button is a real anchor.
 */
export function EquityPageHero() {
  // Both paths' words are in the pre-rendered HTML; the html.goal-payoff class,
  // set by an inline script in home-equity/index.html before first paint (and
  // by the path switch after), shows one. So an ad landing on ?goal=payoff
  // never sees the other heading flash or the layout move.
  return (
    <>
      <div className="dcp-hero">
        <div className="dcp-hero-inner">
          <div>
            <span className="dcp-eyebrow">
              <span className="hv-equity">Home Equity · HELOC</span>
              <span className="hv-payoff">Home Equity · Pay off debt</span>
            </span>
            <h1 className="dcp-h1">
              <span className="hv-equity">See what your home <em>equity</em> could help you do.</span>
              <span className="hv-payoff">Compare paying off high-interest debt with home <em>equity</em></span>
            </h1>
            <p className="dcp-hero-sub">
              <span className="hv-equity">Three quick steps, mostly taps. See your estimated equity, then talk it through with Darren.</span>
              <span className="hv-payoff">See today&apos;s debt payments next to a HELOC, a fixed home equity loan and a cash-out refinance, with the tradeoffs in plain words.</span>
            </p>
            <a href="#equity" className="btn dcp-hero-btn">
              <span className="hv-equity">Check My Home Equity</span>
              <span className="hv-payoff">See My Comparison</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 5v14M6 13l6 6 6-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </a>
            <p className="dcp-hero-note">No cost and no application to see your estimate.</p>
          </div>

          <div className="dcp-how">
            <span className="dcp-eyebrow">How it works</span>
            <p className="dcp-how-title">Know your numbers. Understand your options.</p>
            <dl className="hv-equity">
              <div><dt>01</dt><dd>Your home and its estimated equity</dd></div>
              <div><dt>02</dt><dd>What the equity is for</dd></div>
              <div><dt>03</dt><dd>{BOOKING_CALENDAR_READY ? 'Pick a time with Darren' : 'Darren calls you'}</dd></div>
            </dl>
            <dl className="hv-payoff">
              <div><dt>Today</dt><dd>Mortgage P&amp;I + your debts</dd></div>
              <div><dt>HELOC</dt><dd>Keeps your mortgage</dd></div>
              <div><dt>Fixed loan</dt><dd>Keeps your mortgage</dd></div>
              <div><dt>Cash-out</dt><dd>Replaces your mortgage</dd></div>
            </dl>
          </div>
        </div>
      </div>

      <LicensedStrip />
    </>
  );
}

export type EquityPath = 'equity' | 'payoff';

/** The two ways into the page. A real choice, never pre-answered by anything but the URL. */
export function PathSwitch({ path, onPath }: { path: EquityPath; onPath: (p: EquityPath) => void }) {
  return (
    <div className="dcp-path" role="group" aria-label="What would you like to do?">
      <button type="button" className="dcp-chip" aria-pressed={path === 'equity'} onClick={() => onPath('equity')}>Access my home equity</button>
      <button type="button" className="dcp-chip" aria-pressed={path === 'payoff'} onClick={() => onPath('payoff')}>Pay off high-interest debt</button>
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
            maxLength={5} placeholder="e.g. 92646" value={v.zip}
            onChange={(e) => v.setZip(e.target.value.replace(/\D/g, '').slice(0, 5))} />
        </div>
        {zipDone && (
          <div>
            <label className="input-label" htmlFor="he-state">State of the home you&apos;re borrowing against</label>
            <select id="he-state" className="form-input" value={v.propertyState}
              onChange={(e) => v.setPropertyState(e.target.value)}>
              <option value="">Choose the property state</option>
              {PROPERTY_STATES.map((s) => <option key={s} value={s}>{PROPERTY_STATE_LABELS[s]}</option>)}
            </select>
          </div>
        )}
      </div>
      <p className="dcp-hint">ZIP of the home you&apos;re borrowing against. It checks that Darren can lend on it; where you use the cash doesn&apos;t matter.</p>

      <div className="dcp-actions">
        <small className="dcp-caption dcp-actions-note">No application required to see this estimate.</small>
        <button type="button" className="btn btn-teal" onClick={v.next}>
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

      <h3 className="dcp-h3">About how much cash?</h3>
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
  return (
    <div className="dcp-panel">
      <h2 className="dcp-h2 dcp-h2-lg">Where should Darren reach you?</h2>
      <p className="dcp-lead">Your estimate and answers go with your request. {BOOKING_CALENDAR_READY
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

      <ComplianceDisclosure formId={EQUITY_FORM_ID} />

      <StepNav
        back="← Your Goal" onBack={() => v.goStep(2)}
        disabled={v.sending}
        next={v.sending
          ? <><span className="btn-spinner" aria-hidden="true" /> Sending…</>
          : <>{BOOKING_CALENDAR_READY ? <>See Darren&apos;s Calendar</> : <>Send my request</>} <Arrow /></>}
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
  const slot = useRef<HTMLDivElement>(null);
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    const booking = (window as Window & { DTBooking?: { calendar?: (el: Element, lead: object) => void } }).DTBooking;
    if (slot.current && booking && typeof booking.calendar === 'function') {
      booking.calendar(slot.current, { firstName: v.fname.trim(), lastName: v.lname.trim(), email: v.email.trim() });
      setDrawn(true);
    }
    // Drawn once, for the lead that was saved.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="dcp-panel dcp-recap">
      <div className="success-check" role="img" aria-label="Success">✓</div>
      <h2 className="dcp-h2 dcp-h2-lg">Your request has been received.</h2>
      <p className="dcp-lead">Your estimate and answers were sent with it, so you will not need to start over. Darren will be in touch.</p>

      <div className="dcp-recap-rows">
        <span className="dcp-eyebrow dcp-eyebrow-dark">Your summary</span>
        <Row label="Estimated equity" value={v.equity >= 0 ? formatCurrency(v.equity) : 'None at these numbers'} />
        <Row label="Goal" value={v.goal} />
        <Row label="Cash range" value={v.cashRange} />
        {v.preference && <Row label="Option of interest" value={v.preference} />}
      </div>

      {/* booking-chooser.js owns this node's contents, so React leaves it empty. */}
      <div ref={slot} className="dcp-recap-calendar" />
      {!drawn && (
        <div className="dcp-recap-actions">
          <a href={`tel:${PHONE.replace(/\D/g, '')}`} className="btn dcp-back">Call Darren {PHONE}</a>
        </div>
      )}
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
        <EquityPageHero />
        {onPath && <PathSwitch path={path} onPath={onPath} />}
        {payoff}
        {overlays}
      </section>
    );
  }
  return (
    <section className="dcp">
      <EquityPageHero />
      {onPath && <PathSwitch path={path} onPath={onPath} />}

      <div id="equity" className="dcp-flow">
        <ul className="dcp-trust">
          <li><Check /> Educational estimate</li>
          <li><Check /> Mostly taps</li>
          <li><Check /> Personal guidance</li>
        </ul>

        {!done && (
          <div className="dcp-steps">
            {STEPS.map((label, i) => {
              const n = i + 1;
              const past = v.step > n;
              return (
                <button key={n} type="button" onClick={() => v.goStep(n)}
                  className={`dcp-step${v.step === n ? ' dcp-step-active' : ''}${past ? ' dcp-step-done' : ''}`}
                  aria-current={v.step === n ? 'step' : undefined}>
                  <span className="dcp-step-num">{past ? <Check /> : n}</span>
                  <span>{label}</span>
                </button>
              );
            })}
          </div>
        )}

        {v.submitted && <EquityRecap v={v} />}
        {!v.submitted && v.declined && <EquityDeclined v={v} />}
        {!done && v.step === 1 && <StepEquityHome v={v} />}
        {!done && v.step === 2 && <StepEquityGoal v={v} />}
        {!done && v.step === 3 && <StepEquityContact v={v} />}

        <EquityProducts />

        <div className="dcp-disclosure">{disclosure}</div>
      </div>

      {overlays}
    </section>
  );
}
