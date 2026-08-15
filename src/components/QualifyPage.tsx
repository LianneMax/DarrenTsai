import { useState } from 'react';
import { z } from 'zod';
import { isValidPhoneNumber, AsYouType } from 'libphonenumber-js';
import { GOOGLE_SHEET_WEBHOOK_URL, EMAIL, NMLS, DRE } from '../config';
import Footer from './Footer';
import { openCalendly } from '../utils/calendly';

const emailSchema = z.string().email();

const LOAN_TYPES = [
  { value: '', label: 'Select loan type…' },
  { value: 'purchase', label: 'Buying a home' },
  { value: 'fha', label: 'FHA loan' },
  { value: 'va', label: 'VA loan' },
  { value: 'refinance', label: 'Refinance' },
  { value: 'cash-out', label: 'Cash-out refinance / HELOC' },
  { value: 'investment', label: 'Investment property' },
  { value: 'not-sure', label: 'Not sure yet' },
];

const TIMELINES = [
  { value: '', label: 'Select a timeframe…' },
  { value: 'asap', label: 'As soon as possible' },
  { value: '1-3mo', label: '1 – 3 months' },
  { value: '3-6mo', label: '3 – 6 months' },
  { value: '6-12mo', label: '6 – 12 months' },
  { value: 'exploring', label: 'Just exploring' },
];

const PRICE_RANGES = [
  { value: '', label: 'Select a range…' },
  { value: 'under-400k', label: 'Under $400K' },
  { value: '400-600k', label: '$400K – $600K' },
  { value: '600-800k', label: '$600K – $800K' },
  { value: '800k-1m', label: '$800K – $1M' },
  { value: '1m-plus', label: '$1M+' },
  { value: 'not-sure', label: 'Not sure yet' },
];

const CREDIT_RANGES = [
  { value: '', label: 'Select a range…' },
  { value: '740-plus', label: '740+' },
  { value: '700-739', label: '700 – 739' },
  { value: '660-699', label: '660 – 699' },
  { value: '620-659', label: '620 – 659' },
  { value: 'under-620', label: 'Under 620' },
  { value: 'not-sure', label: "Don't know" },
];

const EMPLOYMENT_TYPES = [
  { value: '', label: 'Select employment type…' },
  { value: 'w2', label: 'W-2 employee' },
  { value: 'self-employed', label: 'Self-employed / 1099' },
  { value: 'retired', label: 'Retired / fixed income' },
  { value: 'mixed', label: 'Mix of W-2 and self-employed' },
  { value: 'other', label: 'Other' },
];

interface FormState {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  loanType: string;
  timeline: string;
  priceRange: string;
  creditRange: string;
  employment: string;
  notes: string;
}

type Errors = Partial<Record<keyof FormState, string>>;

const SUBMITTED_KEY = 'dt_qualify_submitted';

export default function QualifyPage() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>(() => {
    try { return sessionStorage.getItem(SUBMITTED_KEY) ? 'success' : 'idle'; } catch { return 'idle'; }
  });
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<FormState>({
    firstName: '', lastName: '', email: '', phone: '',
    loanType: '', timeline: '', priceRange: '', creditRange: '', employment: '', notes: '',
  });
  const [errors, setErrors] = useState<Errors>({});

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
    const errs: Errors = {};
    if (!form.firstName.trim()) errs.firstName = 'Required';
    if (!form.lastName.trim()) errs.lastName = 'Required';
    if (!form.email.trim()) errs.email = 'Required';
    else if (!emailSchema.safeParse(form.email.trim()).success) errs.email = 'Enter a valid email';
    if (!form.phone.trim()) errs.phone = 'Required';
    else if (!isValidPhoneNumber(form.phone.trim(), 'US')) errs.phone = 'Enter a valid US phone number';
    if (!form.loanType) errs.loanType = 'Required';
    if (!form.timeline) errs.timeline = 'Required';
    if (!form.priceRange) errs.priceRange = 'Required';
    if (!form.creditRange) errs.creditRange = 'Required';
    if (!form.employment) errs.employment = 'Required';
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
      loanType: form.loanType,
      timeline: form.timeline,
      priceRange: form.priceRange,
      creditRange: form.creditRange,
      employment: form.employment,
      notes: form.notes.trim(),
      source: 'QualifyForm',
      timestamp: new Date().toISOString(),
    };

    try {
      if (GOOGLE_SHEET_WEBHOOK_URL) {
        await fetch(GOOGLE_SHEET_WEBHOOK_URL, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'text/plain' },
          body: JSON.stringify(payload),
        });
      } else {
        await new Promise((r) => setTimeout(r, 800));
      }
      try { sessionStorage.setItem(SUBMITTED_KEY, '1'); } catch { /* ignore */ }
      setStatus('success');
    } catch {
      setStatus('error');
    }
  };

  const closeModal = () => {
    setModalOpen(false);
    if (status === 'error') setStatus('idle');
  };

  const selectField = (
    id: keyof FormState, label: string,
    options: { value: string; label: string }[]
  ) => (
    <div className="input-group" style={{ marginBottom: 0 }}>
      <label htmlFor={`q-${id}`} className="input-label">
        {label} <span style={{ color: 'var(--rose)' }}>*</span>
      </label>
      <div className="select-wrap">
        <select
          id={`q-${id}`}
          className={`form-select${errors[id] ? ' input-error' : ''}`}
          value={form[id]}
          onChange={set(id)}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value} disabled={!o.value}>{o.label}</option>
          ))}
        </select>
        <svg className="select-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
      {errors[id] && <span className="field-error">{errors[id]}</span>}
    </div>
  );

  return (
    <>
      <main style={{ maxWidth: 640, margin: '0 auto', padding: '48px 20px' }}>
        {status === 'success' && !modalOpen ? (
          <div className="success-state" style={{ padding: '48px 0', textAlign: 'center' }}>
            <div className="success-check" role="img" aria-label="Success" style={{ ['--success-check-size' as string]: '64px' }}>✓</div>
            <h1 className="success-heading" style={{ marginTop: 24 }}>You're all set!</h1>
            <p className="success-body">
              Darren will review your answers and text you your options, usually within 1 business day.
              No phone call needed.
            </p>
            <button
              type="button"
              className="btn btn-outline-navy success-cta"
              onClick={openCalendly}
            >
              Book a Free Strategy Call
            </button>
          </div>
        ) : (
          <div style={{ textAlign: 'center' }}>
            <h1 style={{ color: 'var(--navy)', marginBottom: 8 }}>Get Your Numbers, No Call Needed</h1>
            <p style={{ color: 'var(--text-muted)', marginBottom: 32 }}>
              60 seconds. Darren reviews your answers personally and sends your loan options by text or email.
              No credit pull, no pressure.
            </p>
            <button type="button" className="btn btn-rose btn-full submit-btn" onClick={() => setModalOpen(true)}>
              Get My Numbers
            </button>
          </div>
        )}
      </main>
      <Footer />

      {/* Qualify form modal — matches site-wide modal styling (see App.tsx contact modal) */}
      {modalOpen && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="qualify-modal-title"
          onClick={closeModal}
        >
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            {status === 'success' ? (
              <div className="modal-body">
                <div className="success-state" style={{ padding: '8px 0' }}>
                  <div className="success-check" role="img" aria-label="Success">✓</div>
                  <h3 className="success-heading">You're all set!</h3>
                  <p className="success-body">
                    Darren will review your answers and text you your options, usually within 1 business day.
                    No phone call needed.
                  </p>
                  <button className="btn btn-outline-navy btn-full success-cta" onClick={openCalendly}>
                    Book a Free Strategy Call
                  </button>
                  <button className="btn btn-teal btn-full" style={{ marginTop: 10 }} onClick={() => setModalOpen(false)}>
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="modal-header">
                  <h2 id="qualify-modal-title" className="modal-title">Get Your Numbers</h2>
                  <button className="modal-close" onClick={closeModal} aria-label="Close">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                    </svg>
                  </button>
                </div>
                <div className="modal-body">
                  <p className="modal-sub">No credit pull, no pressure, just your real numbers.</p>

                  {status === 'error' && (
                    <div className="error-banner" role="alert" style={{ marginBottom: 20 }}>
                      Something went wrong. Please email <a href={`mailto:${EMAIL}`}>{EMAIL}</a> directly.
                    </div>
                  )}

                  <form onSubmit={handleSubmit} noValidate>
                    <div className="form-row-2" style={{ marginBottom: 16 }}>
                      <div className="input-group" style={{ marginBottom: 0 }}>
                        <label htmlFor="q-firstName" className="input-label">
                          First Name <span style={{ color: 'var(--rose)' }}>*</span>
                        </label>
                        <input
                          id="q-firstName" type="text"
                          className={`form-input${errors.firstName ? ' input-error' : ''}`}
                          value={form.firstName} onChange={set('firstName')}
                          autoComplete="given-name"
                        />
                        {errors.firstName && <span className="field-error">{errors.firstName}</span>}
                      </div>
                      <div className="input-group" style={{ marginBottom: 0 }}>
                        <label htmlFor="q-lastName" className="input-label">
                          Last Name <span style={{ color: 'var(--rose)' }}>*</span>
                        </label>
                        <input
                          id="q-lastName" type="text"
                          className={`form-input${errors.lastName ? ' input-error' : ''}`}
                          value={form.lastName} onChange={set('lastName')}
                          autoComplete="family-name"
                        />
                        {errors.lastName && <span className="field-error">{errors.lastName}</span>}
                      </div>
                    </div>

                    <div className="form-row-2" style={{ marginBottom: 16 }}>
                      <div className="input-group" style={{ marginBottom: 0 }}>
                        <label htmlFor="q-email" className="input-label">
                          Email <span style={{ color: 'var(--rose)' }}>*</span>
                        </label>
                        <input
                          id="q-email" type="email"
                          className={`form-input${errors.email ? ' input-error' : ''}`}
                          value={form.email} onChange={set('email')}
                          autoComplete="email"
                        />
                        {errors.email && <span className="field-error">{errors.email}</span>}
                      </div>
                      <div className="input-group" style={{ marginBottom: 0 }}>
                        <label htmlFor="q-phone" className="input-label">
                          Phone <span style={{ color: 'var(--rose)' }}>*</span>
                        </label>
                        <input
                          id="q-phone" type="tel"
                          className={`form-input${errors.phone ? ' input-error' : ''}`}
                          value={form.phone} onChange={handlePhoneChange}
                          autoComplete="tel"
                        />
                        {errors.phone && <span className="field-error">{errors.phone}</span>}
                      </div>
                    </div>

                    <div className="form-row-2" style={{ marginBottom: 16 }}>
                      {selectField('loanType', 'What are you looking to do?', LOAN_TYPES)}
                      {selectField('timeline', 'Timeline', TIMELINES)}
                    </div>

                    <div className="form-row-2" style={{ marginBottom: 16 }}>
                      {selectField('priceRange', 'Price range / loan size', PRICE_RANGES)}
                      {selectField('creditRange', 'Credit score range', CREDIT_RANGES)}
                    </div>

                    <div style={{ marginBottom: 16 }}>
                      {selectField('employment', 'Employment type', EMPLOYMENT_TYPES)}
                    </div>

                    <div className="input-group">
                      <label htmlFor="q-notes" className="input-label">
                        Anything else Darren should know? <span className="optional-tag">(optional)</span>
                      </label>
                      <textarea
                        id="q-notes"
                        className="form-input form-textarea"
                        rows={3}
                        placeholder="e.g. First-time buyer, recently changed jobs, own another property…"
                        value={form.notes}
                        onChange={set('notes')}
                      />
                    </div>

                    <button
                      type="submit"
                      className="btn btn-rose btn-full submit-btn"
                      style={{ marginTop: 8 }}
                      disabled={status === 'loading'}
                    >
                      {status === 'loading' ? (
                        <><span className="btn-spinner" aria-hidden="true" />Sending…</>
                      ) : (
                        'Get My Numbers'
                      )}
                    </button>

                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 14, textAlign: 'center', lineHeight: 1.6 }}>
                      Your info is never sold or shared. NMLS# {NMLS} · DRE# {DRE} · Equal Housing Opportunity.
                    </p>
                  </form>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
