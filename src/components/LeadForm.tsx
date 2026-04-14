import { useRef, useState } from 'react';
import type { MortgageInputs } from '../types/mortgage';
import { GOOGLE_SHEET_WEBHOOK_URL, EMAIL, NMLS, DRE } from '../config';
import { useScrollReveal } from '../hooks/useScrollReveal';

interface Props {
  currentInputs: MortgageInputs;
}

interface FormState {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  loanAmount: string;
  annualRate: string;
  termYears: string;
  message: string;
  subscribeNewsletter: boolean;
}

interface FieldErrors {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  loanAmount?: string;
  annualRate?: string;
}

const TERM_OPTIONS = [
  { value: '30', label: '30 Years' },
  { value: '20', label: '20 Years' },
  { value: '15', label: '15 Years' },
  { value: '10', label: '10 Years' },
];

const SUBMITTED_KEY = 'dt_lead_submitted';

export default function LeadForm({ currentInputs }: Props) {
  const headingRef = useScrollReveal<HTMLDivElement>();
  const formCardRef = useScrollReveal<HTMLDivElement>(120);

  const saved = localStorage.getItem(SUBMITTED_KEY);
  const savedName = saved ? JSON.parse(saved).firstName : '';

  const [form, setForm] = useState<FormState>({
    firstName: savedName,
    lastName: '',
    email: '',
    phone: '',
    loanAmount: currentInputs.loanAmount.toLocaleString('en-US'),
    annualRate: currentInputs.annualRate.toString(),
    termYears: currentInputs.termYears.toString(),
    message: '',
    subscribeNewsletter: true,
  });

  const [errors, setErrors] = useState<FieldErrors>({});
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>(
    saved ? 'success' : 'idle'
  );
  const formRef = useRef<HTMLFormElement>(null);

  const set = (key: keyof FormState) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const value = e.target.type === 'checkbox'
      ? (e.target as HTMLInputElement).checked
      : e.target.value;
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const validate = (): boolean => {
    const errs: FieldErrors = {};
    if (!form.firstName.trim()) errs.firstName = 'First name is required';
    if (!form.lastName.trim()) errs.lastName = 'Last name is required';
    if (!form.email.trim()) {
      errs.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      errs.email = 'Please enter a valid email';
    }
    if (!form.phone.trim()) errs.phone = 'Phone number is required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setStatus('loading');

    const payload = {
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      loanAmount: parseFloat(form.loanAmount.replace(/[^0-9.]/g, '')) || 0,
      termYears: parseInt(form.termYears) || 30,
      annualRate: parseFloat(form.annualRate) || 0,
      message: form.message.trim(),
      subscribeNewsletter: form.subscribeNewsletter,
      source: 'SimpleMortgageCalculator',
      timestamp: new Date().toISOString(),
    };

    try {
      if (!GOOGLE_SHEET_WEBHOOK_URL) {
        // Simulate a short delay when no webhook is configured
        await new Promise((r) => setTimeout(r, 800));
        localStorage.setItem(SUBMITTED_KEY, JSON.stringify({ firstName: form.firstName.trim() }));
        setStatus('success');
        return;
      }

      // Google Apps Script requires no-cors — response will be opaque but data is written
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

  return (
    <section id="contact" className="section section-navy">
      <div className="container">
        <div ref={headingRef} className="section-header reveal">
          <h2 className="section-title section-title-white">
            Want Darren to review your numbers?
          </h2>
          <p className="section-sub section-sub-teal">
            No credit pull. No pressure. Just your real numbers,
            reviewed by a licensed pro.
          </p>
        </div>

        <div ref={formCardRef} className="form-card reveal">
          {status === 'success' ? (
            <div className="success-state">
              <svg className="success-check" viewBox="0 0 52 52" fill="none" aria-label="Success">
                <circle cx="26" cy="26" r="24" stroke="#2ecc71" strokeWidth="3" />
                <path d="M14 26l9 9 16-16" stroke="#2ecc71" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <h3 className="success-heading">You're all set, {form.firstName}!</h3>
              <p className="success-body">
                Darren will review your numbers and be in touch shortly.
                In the meantime, check out the amortization schedule above
                to see your full payment breakdown.
              </p>
            </div>
          ) : (
            <form ref={formRef} onSubmit={handleSubmit} noValidate>
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

              <div className="form-row-2">
                <div className="input-group">
                  <label htmlFor="lf-firstName" className="input-label">First Name</label>
                  <input
                    id="lf-firstName"
                    type="text"
                    className={`form-input${errors.firstName ? ' input-error' : ''}`}
                    value={form.firstName}
                    onChange={set('firstName')}
                    autoComplete="given-name"
                  />
                  {errors.firstName && <span className="field-error">{errors.firstName}</span>}
                </div>
                <div className="input-group">
                  <label htmlFor="lf-lastName" className="input-label">Last Name</label>
                  <input
                    id="lf-lastName"
                    type="text"
                    className={`form-input${errors.lastName ? ' input-error' : ''}`}
                    value={form.lastName}
                    onChange={set('lastName')}
                    autoComplete="family-name"
                  />
                  {errors.lastName && <span className="field-error">{errors.lastName}</span>}
                </div>
              </div>

              <div className="input-group">
                <label htmlFor="lf-email" className="input-label">Email</label>
                <input
                  id="lf-email"
                  type="email"
                  className={`form-input${errors.email ? ' input-error' : ''}`}
                  value={form.email}
                  onChange={set('email')}
                  autoComplete="email"
                />
                {errors.email && <span className="field-error">{errors.email}</span>}
              </div>

              <div className="input-group">
                <label htmlFor="lf-phone" className="input-label">Phone</label>
                <input
                  id="lf-phone"
                  type="tel"
                  className={`form-input${errors.phone ? ' input-error' : ''}`}
                  value={form.phone}
                  onChange={set('phone')}
                  autoComplete="tel"
                />
                {errors.phone && <span className="field-error">{errors.phone}</span>}
              </div>

              <div className="form-row-2">
                <div className="input-group">
                  <label htmlFor="lf-loanAmount" className="input-label">Loan Amount</label>
                  <div className="input-prefix-wrap">
                    <span className="input-prefix">$</span>
                    <input
                      id="lf-loanAmount"
                      type="text"
                      className="form-input input-has-prefix"
                      value={form.loanAmount}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/[^0-9]/g, '');
                        const num = parseInt(raw, 10) || 0;
                        setForm((prev) => ({
                          ...prev,
                          loanAmount: num ? num.toLocaleString('en-US') : '',
                        }));
                      }}
                    />
                  </div>
                </div>
                <div className="input-group">
                  <label htmlFor="lf-rate" className="input-label">Interest Rate</label>
                  <div className="input-suffix-wrap">
                    <input
                      id="lf-rate"
                      type="number"
                      step="0.01"
                      min="0.1"
                      max="30"
                      className="form-input input-has-suffix"
                      value={form.annualRate}
                      onChange={set('annualRate')}
                    />
                    <span className="input-suffix">%</span>
                  </div>
                </div>
              </div>

              <div className="input-group">
                <label htmlFor="lf-term" className="input-label">Loan Term</label>
                <div className="select-wrap">
                  <select
                    id="lf-term"
                    className="form-select"
                    value={form.termYears}
                    onChange={set('termYears')}
                  >
                    {TERM_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                  <svg className="select-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
              </div>

              <div className="input-group">
                <label htmlFor="lf-message" className="input-label">
                  Message <span className="optional-tag">(optional)</span>
                </label>
                <textarea
                  id="lf-message"
                  className="form-input form-textarea"
                  rows={3}
                  value={form.message}
                  onChange={set('message')}
                  placeholder="What's your situation? (optional)"
                />
              </div>

              <label className="checkbox-label">
                <input
                  type="checkbox"
                  className="checkbox-input"
                  checked={form.subscribeNewsletter}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, subscribeNewsletter: e.target.checked }))
                  }
                />
                <span className="checkbox-custom">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M20 6L9 17l-5-5" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </span>
                Keep me updated with Darren's mortgage &amp; market insights
              </label>

              <button
                type="submit"
                className="btn btn-rose btn-full submit-btn"
                disabled={status === 'loading'}
              >
                {status === 'loading' ? (
                  <>
                    <span className="btn-spinner" aria-hidden="true" />
                    Sending...
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
            </form>
          )}
        </div>

        <div className="form-footnote">
          <p>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <rect x="3" y="11" width="18" height="11" rx="2" stroke="currentColor" strokeWidth="2"/>
              <path d="M7 11V7a5 5 0 0110 0v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            Your info is never sold or shared.
          </p>
          <p>NMLS# {NMLS} · DRE# {DRE} · Equal Housing Opportunity</p>
        </div>
      </div>
    </section>
  );
}
