/**
 * Pieces shared by the revamp pages (/debt-consolidation/ since phase 2,
 * /home-equity/ since phase 3), so the two draw a row, a step button or the
 * equity picture the same way. Presentation only, like the page views that use
 * them. Styles are the dcp- block in src/index.css, which both pages share.
 */
import { Fragment, useEffect, useState, type ReactNode } from 'react';
import { AsYouType } from 'libphonenumber-js';
import { LICENSED_STATES, NMLS, DRE, PHONE, isLicensedState } from '../config';
import { formatCurrency } from '../utils/formatters';
import { emailHintMessage, hintAfterBlur, type EmailSuggestion } from '../utils/emailSuggest';
import StateSelect from './StateSelect';

export const Arrow = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const Check = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`dcp-row${strong ? ' dcp-row-strong' : ''}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

export function StepNav({ back, next, onBack, onNext, disabled }: {
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

/**
 * The equity picture, shown only once there is a value and a balance to draw.
 *
 * The bar is the same two numbers the old chips showed, not a new calculation.
 * A balance above the value is said in words: a bar cannot draw negative equity,
 * and clamping it to zero would hide the one thing that visitor needs to know.
 */
export function EquitySnapshot({ hv, mb }: { hv: number; mb: number }) {
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

/** Where Darren is licensed, under each page's hero. Pre-rendered with it. */
/**
 * The static pages' licensed strip (public/dscr and the others): five items
 * spread across the 1080px container with hairline dividers, the Equal Housing
 * mark beside its words. On a phone it wraps into two centred lines instead of
 * the static pages' five stacked rows, so the calculator stays near the top on
 * the pages ads point at.
 */
export function LicensedStrip() {
  const items: ReactNode[] = [
    'Licensed in',
    LICENSED_STATES.join(', '),
    `NMLS #${NMLS}`,
    `CA DRE #${DRE}`,
    <>
      <svg width="18" height="18" viewBox="0 0 60 60" fill="none" aria-hidden="true">
        <defs>
          <mask id="dcp-eho-mask">
            <rect width="60" height="60" fill="white" />
            <rect x="17" y="35" width="26" height="5" fill="black" />
            <rect x="17" y="44" width="26" height="5" fill="black" />
          </mask>
        </defs>
        <polygon points="30,5 56,28 4,28" fill="currentColor" />
        <rect x="10" y="28" width="40" height="27" fill="currentColor" mask="url(#dcp-eho-mask)" />
      </svg>
      Equal Housing Opportunity
    </>,
  ];
  return (
    <div className="dcp-licensed">
      <div className="dcp-licensed-inner">
        {items.map((item, i) => (
          <Fragment key={i}>
            {i > 0 && <span className="dcp-licensed-divider" aria-hidden="true" />}
            <span className="dcp-licensed-item">{item}</span>
          </Fragment>
        ))}
      </div>
    </div>
  );
}

/**
 * The static pages' mobile sticky bar (public/dscr, /realestateinvesting): the
 * page's one action and a call button, pinned to the bottom of a phone screen.
 *
 * Unlike theirs it steps aside while the calculator is on screen. Their bar
 * points at a form further down; here the calculator starts right under the
 * hero, so a bar saying "See My Comparison" over the comparison would only
 * cover its buttons. It comes back once the visitor has scrolled past (the
 * footer), where it is the way back up. Without IntersectionObserver it stays.
 *
 * The call button is a real tel: anchor, so CallRail swaps the number and GTM's
 * phone_click fires with no extra code, as on every other call link. It is
 * never in the pre-rendered HTML: the bar mounts after the shell.
 */
export function MobileActionBar({ target, label }: { target: string; label: string }) {
  const [toolInView, setToolInView] = useState(false);
  useEffect(() => {
    const el = document.getElementById(target);
    if (!el || typeof IntersectionObserver === 'undefined') return;
    // The bottom 40% of the screen does not count: on the shorter heroes the
    // tool's first line peeks in at the bottom of a phone's first screen, and
    // that is exactly when the bar is most useful.
    const io = new IntersectionObserver(([e]) => setToolInView(e.isIntersecting),
      { threshold: 0, rootMargin: '0px 0px -40% 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [target]);
  return (
    <>
      <div className="dcp-mobile-bar-space" aria-hidden="true" />
      <div className={`dcp-mobile-bar${toolInView ? ' is-away' : ''}`} aria-hidden={toolInView}>
        <a href={`#${target}`} className="btn btn-accent dcp-mobile-bar-cta" tabIndex={toolInView ? -1 : undefined}>
          {label}
        </a>
        <a href={`tel:${PHONE.replace(/\D/g, '')}`} className="dcp-mobile-bar-call"
          aria-label="Call Darren Tsai" tabIndex={toolInView ? -1 : undefined}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.8 19.79 19.79 0 01.07 1.18 2 2 0 012.07 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </a>
      </div>
    </>
  );
}

/** A row of single-choice buttons. Clicking the chosen one again clears it. */
export function Chips({ options, value, onChange, label }: {
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

export function MoneyInput({ id, label, value, onChange, placeholder, optional }: {
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

/** The contact fields every revamp page's last step asks for. */
export interface ContactView {
  fname: string; setFname: (v: string) => void;
  lname: string; setLname: (v: string) => void;
  phone: string; setPhone: (v: string) => void;
  email: string; setEmail: (v: string) => void;
  emailHint: EmailSuggestion | null; setEmailHint: (h: EmailSuggestion | null) => void;
  usState: string; setUsState: (v: string) => void;
  sending: boolean;
  submitLead: () => void;
}

/**
 * The "talk to Darren" step of /home-equity/ and /adu/: name, email, phone and
 * state, nothing else (no best time to call, no "how did you hear": tracked
 * attribution answers the second, and both came off the debt form on 8 Oct).
 */
export function LeadContactStep({ v, title, lead, caption, submitLabel, onBack }: {
  v: ContactView; title: string; lead?: string; caption: string; submitLabel: string; onBack: () => void;
}) {
  return (
    <div className="dcp-panel">
      <h2 className="dcp-h2 dcp-h2-lg">{title}</h2>
      <p className="dcp-lead">
        {lead ?? 'Your estimate is a starting point. A personal review helps you understand which options may fit your goals. No hard pull, no obligation.'}
      </p>

      <div className="dcp-grid-2">
        <div>
          <label className="input-label" htmlFor="lead-fname">First Name</label>
          <input id="lead-fname" type="text" className="form-input" placeholder="First name"
            value={v.fname} onChange={(e) => v.setFname(e.target.value)} />
        </div>
        <div>
          <label className="input-label" htmlFor="lead-lname">Last Name</label>
          <input id="lead-lname" type="text" className="form-input" placeholder="Last name"
            value={v.lname} onChange={(e) => v.setLname(e.target.value)} />
        </div>
      </div>

      <div className="dcp-grid-2">
        <div>
          <label className="input-label" htmlFor="lead-email">Email Address</label>
          <input id="lead-email" type="email" className="form-input" placeholder="you@email.com"
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
          <input id="lead-phone" type="tel" className="form-input" placeholder="(714) 000-0000"
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

      <p className="dcp-caption">{caption}</p>

      <StepNav
        back="← Back" onBack={onBack}
        disabled={v.sending}
        next={v.sending
          ? <><span className="btn-spinner" aria-hidden="true" /> Sending…</>
          : <>{submitLabel} <Arrow /></>}
        onNext={v.submitLead}
      />
    </div>
  );
}

/** The "Something's missing" dialog behind every gate and every failed submit. */
export function ErrorDialog({ message, onClose, id }: { message: string | null; onClose: () => void; id: string }) {
  if (!message) return null;
  return (
    <div className="modal-overlay" role="alertdialog" aria-modal="true" aria-labelledby={id} onClick={onClose}>
      <div className="modal-panel" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 id={id} className="modal-title" style={{ fontSize: '1.15rem' }}>Something&apos;s missing</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="modal-body">
          <p className="modal-sub" style={{ marginBottom: 24 }}>{message}</p>
          <button className="btn btn-teal btn-full" onClick={onClose}>Got it</button>
        </div>
      </div>
    </div>
  );
}
