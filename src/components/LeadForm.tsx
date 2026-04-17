import { useRef, useState } from 'react';
import type { MortgageInputs } from '../types/mortgage';
import { GOOGLE_SHEET_WEBHOOK_URL, EMAIL, NMLS, DRE } from '../config';

interface Props {
  currentInputs: MortgageInputs;
  onClose: () => void;
}

interface FormState {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
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
  goals?: string;
  timeline?: string;
  target?: string;
}

const TERM_OPTIONS = [
  { value: '30', label: '30 Years' },
  { value: '20', label: '20 Years' },
  { value: '15', label: '15 Years' },
  { value: '10', label: '10 Years' },
];

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

const SUBMITTED_KEY = 'dt_lead_submitted';

function getSubmitted(): { firstName: string } | null {
  try {
    const raw = localStorage.getItem(SUBMITTED_KEY);
    return raw ? (JSON.parse(raw) as { firstName: string }) : null;
  } catch {
    return null;
  }
}

export default function LeadForm({ currentInputs, onClose }: Props) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>(
    () => (getSubmitted() ? 'success' : 'idle')
  );

  const [form, setForm] = useState<FormState>(() => ({
    firstName: getSubmitted()?.firstName ?? '',
    lastName: '',
    email: '',
    phone: '',
    loanAmount: currentInputs.loanAmount.toLocaleString('en-US'),
    annualRate: currentInputs.annualRate.toString(),
    termYears: currentInputs.termYears.toString(),
    goals: '',
    timeline: '',
    target: '',
  }));

  const [errors, setErrors] = useState<FieldErrors>({});
  const formRef = useRef<HTMLFormElement>(null);

  const set = (key: keyof FormState) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    setForm((prev) => ({ ...prev, [key]: e.target.value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const validate = (): boolean => {
    const errs: FieldErrors = {};
    if (!form.firstName.trim()) errs.firstName = 'Required';
    if (!form.lastName.trim())  errs.lastName  = 'Required';
    if (!form.email.trim()) {
      errs.email = 'Required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      errs.email = 'Enter a valid email';
    }
    if (!form.phone.trim())    errs.phone    = 'Required';
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
      loanAmount: parseFloat(form.loanAmount.replace(/[^0-9.]/g, '')) || 0,
      termYears:  parseInt(form.termYears) || 30,
      annualRate: parseFloat(form.annualRate) || 0,
      goals:    form.goals.trim(),
      timeline: form.timeline,
      target:   form.target,
      source: 'MortgageCalculator',
      timestamp: new Date().toISOString(),
    };

    try {
      if (!GOOGLE_SHEET_WEBHOOK_URL) {
        await new Promise((r) => setTimeout(r, 800));
        localStorage.setItem(SUBMITTED_KEY, JSON.stringify({ firstName: form.firstName.trim() }));
        setStatus('success');
        return;
      }

      await fetch(GOOGLE_SHEET_WEBHOOK_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(payload),
      });

      localStorage.setItem(SUBMITTED_KEY, JSON.stringify({ firstName: form.firstName.trim() }));
      setStatus('success');
    } catch {
      setStatus('error');
    }
  };

  if (status === 'success') {
    return (
      <div className="success-state" style={{ padding: '16px 0 8px' }}>
        <svg className="success-check" viewBox="0 0 52 52" fill="none" aria-label="Success">
          <circle cx="26" cy="26" r="24" stroke="#2ecc71" strokeWidth="3" />
          <path d="M14 26l9 9 16-16" stroke="#2ecc71" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <h3 className="success-heading">You're all set, {form.firstName}!</h3>
        <p className="success-body">
          Darren will review your numbers and be in touch shortly. In the meantime,
          check out the savings calculator above to see your full breakdown.
        </p>
        <button
          onClick={onClose}
          className="btn btn-teal"
          style={{ marginTop: 24 }}
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
        <strong>* Required</strong> — All starred fields must be filled in before submitting.
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
            value={form.email} onChange={set('email')}
            autoComplete="email"
          />
          {errors.email && <span className="field-error">{errors.email}</span>}
        </div>
        <div className="input-group" style={{ marginBottom: 0 }}>
          <label htmlFor="lf-phone" className="input-label">
            Phone <span style={{ color: 'var(--rose)' }}>*</span>
          </label>
          <input
            id="lf-phone" type="tel"
            className={`form-input${errors.phone ? ' input-error' : ''}`}
            value={form.phone} onChange={set('phone')}
            autoComplete="tel"
          />
          {errors.phone && <span className="field-error">{errors.phone}</span>}
        </div>
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
          <div className="select-wrap">
            <select
              id="lf-target"
              className={`form-select${errors.target ? ' input-error' : ''}`}
              value={form.target} onChange={set('target')}
            >
              {TARGET_OPTIONS.map((o) => (
                <option key={o.value} value={o.value} disabled={!o.value}>{o.label}</option>
              ))}
            </select>
            <svg className="select-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          {errors.target && <span className="field-error">{errors.target}</span>}
        </div>
        <div className="input-group" style={{ marginBottom: 0 }}>
          <label htmlFor="lf-timeline" className="input-label">
            Timeline <span style={{ color: 'var(--rose)' }}>*</span>
          </label>
          <div className="select-wrap">
            <select
              id="lf-timeline"
              className={`form-select${errors.timeline ? ' input-error' : ''}`}
              value={form.timeline} onChange={set('timeline')}
            >
              {TIMELINE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value} disabled={!o.value}>{o.label}</option>
              ))}
            </select>
            <svg className="select-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
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
