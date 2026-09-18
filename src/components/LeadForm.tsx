import { useRef, useState } from 'react';
import { z } from 'zod';
import { isValidPhoneNumber, AsYouType } from 'libphonenumber-js';
import type { MortgageInputs } from '../types/mortgage';
import { LEAD_ENDPOINT, EMAIL, NMLS, DRE } from '../config';
import StateSelect from './StateSelect';
import CustomSelect from './CustomSelect';
import { openCalendly } from '../utils/calendly';
import { getAttribution, track } from '../utils/attribution';
import { checkEmail, emailHintMessage, type EmailSuggestion } from '../utils/emailSuggest';

const emailSchema = z.string().email();

interface Props {
  currentInputs: MortgageInputs;
  onClose: () => void;
}

interface FormState {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  state: string;
  loanAmount: string;
  annualRate: string;
  termYears: string;
  goals: string;
  timeline: string;
  target: string;
}

interface FieldErrors {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  state?: string;
  goals?: string;
  timeline?: string;
  target?: string;
}


const TIMELINE_OPTIONS = [
  { value: '', label: 'Select a timeframe…' },
  { value: 'immediately', label: 'As soon as possible' },
  { value: '1-3mo', label: '1 – 3 months' },
  { value: '3-6mo', label: '3 – 6 months' },
  { value: '6-12mo', label: '6 – 12 months' },
  { value: '12mo+', label: 'More than 12 months' },
];

const TARGET_OPTIONS = [
  { value: '', label: 'Select a target…' },
  { value: 'lower-payment', label: 'Lower my monthly payment' },
  { value: 'pay-off-debt', label: 'Pay off high-interest debt' },
  { value: 'buy-home', label: 'Purchase a home' },
  { value: 'refinance', label: 'Refinance my existing mortgage' },
  { value: 'invest', label: 'Investment property' },
  { value: 'other', label: 'Other' },
];

// There was a sessionStorage "already submitted" flag here. It meant anyone who
// reopened the modal in the same tab was shown a success screen they had not
// earned and could not submit again, which silently suppressed second leads.
// Success now lives purely in component state.
export default function LeadForm({ currentInputs, onClose }: Props) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  const [form, setForm] = useState<FormState>(() => ({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    state: '',
    loanAmount: currentInputs.loanAmount.toLocaleString('en-US'),
    annualRate: currentInputs.annualRate.toString(),
    termYears: currentInputs.termYears.toString(),
    goals: '',
    timeline: '',
    target: '',
  }));

  const [emailHint, setEmailHint] = useState<EmailSuggestion | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const formRef = useRef<HTMLFormElement>(null);

  const set = (key: keyof FormState) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    setForm((prev) => ({ ...prev, [key]: e.target.value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = new AsYouType('US').input(e.target.value);
    setForm((prev) => ({ ...prev, phone: formatted }));
    setErrors((prev) => ({ ...prev, phone: undefined }));
  };

  const validate = (): boolean => {
    const errs: FieldErrors = {};
    if (!form.firstName.trim()) errs.firstName = 'Required';
    if (!form.lastName.trim())  errs.lastName  = 'Required';
    if (!form.email.trim()) {
      errs.email = 'Required';
    } else if (!emailSchema.safeParse(form.email.trim()).success) {
      errs.email = 'Enter a valid email';
    }
    if (!form.phone.trim()) {
      errs.phone = 'Required';
    } else if (!isValidPhoneNumber(form.phone.trim(), 'US')) {
      errs.phone = 'Enter a valid US phone number';
    }
    if (!form.state)           errs.state    = 'Required';
    if (!form.goals.trim())    errs.goals    = 'Required';
    if (!form.timeline)        errs.timeline = 'Required';
    if (!form.target)          errs.target   = 'Required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setStatus('loading');

    const payload = {
      firstName: form.firstName.trim(),
      lastName:  form.lastName.trim(),
      email:     form.email.trim(),
      phone:     form.phone.trim(),
      state:     form.state,
      loanAmount: parseFloat(form.loanAmount.replace(/[^0-9.]/g, '')) || 0,
      termYears:  parseInt(form.termYears) || 30,
      annualRate: parseFloat(form.annualRate) || 0,
      message:  form.goals.trim(),
      target:   form.target,
      timeline: form.timeline,
      source: 'MortgageCalculator',
      timestamp: new Date().toISOString(),
    };

    try {
      const res = await fetch(LEAD_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, ...getAttribution() }),
      });
      // Same-origin, so unlike the old no-cors post the status is readable and
      // a failure actually reaches the visitor instead of showing a checkmark.
      if (!res.ok) {
        // A 422 with field:"email" is the one failure the visitor can fix: the
        // domain has no mail server, and nothing was saved. Keep them on the
        // form with the message against the email field rather than showing the
        // generic failure state, which tells them not to resubmit.
        if (res.status === 422) {
          const fix = await res.json().catch(() => null);
          if (fix && fix.field === 'email' && fix.message) {
            setErrors((prev) => ({ ...prev, email: String(fix.message) }));
            setStatus('idle');
            return;
          }
        }
        throw new Error(`lead-endpoint-${res.status}`);
      }

      track('generate_lead', {
        lead_source: payload.source,
        form_id: 'home-contact-modal',
        page_path: window.location.pathname,
        user_data: {
          email: payload.email,
          phone_number: payload.phone,
          address: { first_name: payload.firstName, last_name: payload.lastName, region: payload.state },
        },
      });
      track('virtual_page_view', {
        page_path: '/thank-you/contact',
        page_title: 'Thank You — Contact',
      });

      setStatus('success');
    } catch {
      setStatus('error');
    }
  };

  if (status === 'success') {
    return (
      <div className="success-state" style={{ padding: '16px 0 8px' }}>
        <div className="success-check" role="img" aria-label="Success">✓</div>
        <h3 className="success-heading">You're all set, {form.firstName}!</h3>
        <p className="success-body">
          Darren will review your numbers and be in touch shortly. In the meantime,
          check out the savings calculator above to see your full breakdown.
        </p>
        <button
          onClick={openCalendly}
          className="btn btn-outline-navy btn-full success-cta"
        >
          Book a Free Strategy Call
        </button>
        <button
          onClick={onClose}
          className="btn btn-teal btn-full"
          style={{ marginTop: 10 }}
        >
          Close
        </button>
      </div>
    );
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} noValidate>
      {/* Note */}
      <p className="modal-note">
        <strong>* Required</strong>: All starred fields must be filled in before submitting.
      </p>

      {status === 'error' && (
        <div className="error-banner" role="alert">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
            <path d="M12 8v4M12 16h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          Something went wrong. Please email{' '}
          <a href={`mailto:${EMAIL}`}>{EMAIL}</a> directly.
        </div>
      )}

      {/* Name row */}
      <div className="form-row-2" style={{ marginBottom: 16 }}>
        <div className="input-group" style={{ marginBottom: 0 }}>
          <label htmlFor="lf-firstName" className="input-label">
            First Name <span style={{ color: 'var(--rose)' }}>*</span>
          </label>
          <input
            id="lf-firstName" type="text"
            className={`form-input${errors.firstName ? ' input-error' : ''}`}
            value={form.firstName} onChange={set('firstName')}
            autoComplete="given-name"
          />
          {errors.firstName && <span className="field-error">{errors.firstName}</span>}
        </div>
        <div className="input-group" style={{ marginBottom: 0 }}>
          <label htmlFor="lf-lastName" className="input-label">
            Last Name <span style={{ color: 'var(--rose)' }}>*</span>
          </label>
          <input
            id="lf-lastName" type="text"
            className={`form-input${errors.lastName ? ' input-error' : ''}`}
            value={form.lastName} onChange={set('lastName')}
            autoComplete="family-name"
          />
          {errors.lastName && <span className="field-error">{errors.lastName}</span>}
        </div>
      </div>

      {/* Contact row */}
      <div className="form-row-2" style={{ marginBottom: 16 }}>
        <div className="input-group" style={{ marginBottom: 0 }}>
          <label htmlFor="lf-email" className="input-label">
            Email <span style={{ color: 'var(--rose)' }}>*</span>
          </label>
          <input
            id="lf-email" type="email"
            className={`form-input${errors.email ? ' input-error' : ''}`}
            value={form.email} onChange={(e) => { setEmailHint(null); set('email')(e); }}
            onBlur={(e) => setEmailHint(checkEmail(e.target.value))}
            autoComplete="email"
          />
          {errors.email && <span className="field-error">{errors.email}</span>}
          {/* Suggests, never blocks: a wrong guess must not stop a real address. */}
          {!errors.email && emailHint && (
            emailHint.kind === 'typo' ? (
              <button
                type="button" className="email-hint"
                onClick={() => { setForm((f) => ({ ...f, email: emailHint.email })); setEmailHint(null); }}
              >
                {emailHintMessage(emailHint)}
              </button>
            ) : (
              <span className="email-hint">{emailHintMessage(emailHint)}</span>
            )
          )}
        </div>
        <div className="input-group" style={{ marginBottom: 0 }}>
          <label htmlFor="lf-phone" className="input-label">
            Phone <span style={{ color: 'var(--rose)' }}>*</span>
          </label>
          <input
            id="lf-phone" type="tel"
            className={`form-input${errors.phone ? ' input-error' : ''}`}
            value={form.phone} onChange={handlePhoneChange}
            autoComplete="tel"
          />
          {errors.phone && <span className="field-error">{errors.phone}</span>}
        </div>
      </div>

      {/* State */}
      <div className="input-group" style={{ marginBottom: 16 }}>
        <label htmlFor="lf-state" className="input-label">
          State <span style={{ color: 'var(--rose)' }}>*</span>
        </label>
        <StateSelect
          id="lf-state"
          value={form.state}
          hasError={!!errors.state}
          onChange={(abbr) => {
            setForm((prev) => ({ ...prev, state: abbr }));
            setErrors((prev) => ({ ...prev, state: undefined }));
          }}
        />
        {errors.state && <span className="field-error">{errors.state}</span>}
      </div>

      {/* Goals */}
      <div className="input-group">
        <label htmlFor="lf-goals" className="input-label">
          Your Goals <span style={{ color: 'var(--rose)' }}>*</span>
        </label>
        <textarea
          id="lf-goals"
          className={`form-input form-textarea${errors.goals ? ' input-error' : ''}`}
          rows={3}
          placeholder="e.g. Lower my monthly payments, pay off credit card debt, save for a rental property…"
          value={form.goals}
          onChange={set('goals')}
        />
        {errors.goals && <span className="field-error">{errors.goals}</span>}
      </div>

      {/* Target + Timeline */}
      <div className="form-row-2" style={{ marginBottom: 16 }}>
        <div className="input-group" style={{ marginBottom: 0 }}>
          <label htmlFor="lf-target" className="input-label">
            Target Outcome <span style={{ color: 'var(--rose)' }}>*</span>
          </label>
          <CustomSelect
            id="lf-target"
            value={form.target}
            hasError={!!errors.target}
            placeholder={TARGET_OPTIONS[0].label}
            options={TARGET_OPTIONS.filter((o) => o.value)}
            onChange={(v) => {
              setForm((prev) => ({ ...prev, target: v }));
              setErrors((prev) => ({ ...prev, target: undefined }));
            }}
          />
          {errors.target && <span className="field-error">{errors.target}</span>}
        </div>
        <div className="input-group" style={{ marginBottom: 0 }}>
          <label htmlFor="lf-timeline" className="input-label">
            Timeline <span style={{ color: 'var(--rose)' }}>*</span>
          </label>
          <CustomSelect
            id="lf-timeline"
            value={form.timeline}
            hasError={!!errors.timeline}
            placeholder={TIMELINE_OPTIONS[0].label}
            options={TIMELINE_OPTIONS.filter((o) => o.value)}
            onChange={(v) => {
              setForm((prev) => ({ ...prev, timeline: v }));
              setErrors((prev) => ({ ...prev, timeline: undefined }));
            }}
          />
          {errors.timeline && <span className="field-error">{errors.timeline}</span>}
        </div>
      </div>

      {/* Loan details (pre-filled, optional) */}
      <div className="form-row-2" style={{ marginBottom: 16 }}>
        <div className="input-group" style={{ marginBottom: 0 }}>
          <label htmlFor="lf-loanAmount" className="input-label">
            Loan Amount <span className="optional-tag">(optional)</span>
          </label>
          <div className="input-prefix-wrap">
            <span className="input-prefix">$</span>
            <input
              id="lf-loanAmount" type="text"
              className="form-input input-has-prefix"
              value={form.loanAmount}
              onChange={(e) => {
                const raw = e.target.value.replace(/[^0-9]/g, '');
                const num = parseInt(raw, 10) || 0;
                setForm((prev) => ({ ...prev, loanAmount: num ? num.toLocaleString('en-US') : '' }));
              }}
            />
          </div>
        </div>
        <div className="input-group" style={{ marginBottom: 0 }}>
          <label htmlFor="lf-rate" className="input-label">
            Interest Rate <span className="optional-tag">(optional)</span>
          </label>
          <div className="input-suffix-wrap">
            <input
              id="lf-rate" type="number" step="0.01" min="0.1" max="30"
              className="form-input input-has-suffix"
              value={form.annualRate} onChange={set('annualRate')}
            />
            <span className="input-suffix">%</span>
          </div>
        </div>
      </div>

      <button
        type="submit"
        className="btn btn-rose btn-full submit-btn"
        style={{ marginTop: 8 }}
        disabled={status === 'loading'}
      >
        {status === 'loading' ? (
          <>
            <span className="btn-spinner" aria-hidden="true" />
            Sending…
          </>
        ) : (
          <>
            Send My Info to Darren
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M22 2L11 13M22 2L15 22l-4-9-9-4 20-7z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </>
        )}
      </button>

      <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 14, textAlign: 'center', lineHeight: 1.6 }}>
        Your info is never sold or shared. NMLS# {NMLS} · DRE# {DRE} · Equal Housing Opportunity.
      </p>
    </form>
  );
}
