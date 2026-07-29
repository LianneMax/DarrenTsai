import { useState, type ReactNode } from 'react';
import { z } from 'zod';
import { isValidPhoneNumber, AsYouType } from 'libphonenumber-js';
import { GOOGLE_SHEET_WEBHOOK_URL, EMAIL, NMLS, DRE } from '../config';
import Footer from './Footer';

const emailSchema = z.string().email();

export interface LandingConfig {
  source: string;            // maps to Apps Script source + Bonzo tag routing
  headline: string;
  subheadline: string;
  body?: string;
  bullets?: string[];
  magnetName: string;        // what they're opting in to receive
  ctaLabel?: string;         // submit button text (or link label when ctaHref set)
  ctaHref?: string;          // if set, CTA links here instead of showing the form
                             // (used when a downstream page — e.g. the DSCR calculator — captures the lead)
  successBody?: string;
  extra?: ReactNode;         // optional block above the form (e.g. home value search)
}

interface FormState { firstName: string; lastName: string; email: string; phone: string; }
type Errors = Partial<Record<keyof FormState, string>>;

export default function LandingPage({ config }: { config: LandingConfig }) {
  const submittedKey = `dt_landing_${config.source}`;
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>(() => {
    try { return sessionStorage.getItem(submittedKey) ? 'success' : 'idle'; } catch { return 'idle'; }
  });
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<FormState>({ firstName: '', lastName: '', email: '', phone: '' });
  const [errors, setErrors] = useState<Errors>({});

  const set = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((p) => ({ ...p, [key]: e.target.value }));
    setErrors((p) => ({ ...p, [key]: undefined }));
  };
  const handlePhone = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((p) => ({ ...p, phone: new AsYouType('US').input(e.target.value) }));
    setErrors((p) => ({ ...p, phone: undefined }));
  };

  const validate = (): boolean => {
    const errs: Errors = {};
    if (!form.firstName.trim()) errs.firstName = 'Required';
    if (!form.lastName.trim()) errs.lastName = 'Required';
    if (!form.email.trim()) errs.email = 'Required';
    else if (!emailSchema.safeParse(form.email.trim()).success) errs.email = 'Enter a valid email';
    if (!form.phone.trim()) errs.phone = 'Required';
    else if (!isValidPhoneNumber(form.phone.trim(), 'US')) errs.phone = 'Enter a valid US phone number';
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
      magnet: config.magnetName,
      source: config.source,
      timestamp: new Date().toISOString(),
    };
    try {
      if (GOOGLE_SHEET_WEBHOOK_URL) {
        await fetch(GOOGLE_SHEET_WEBHOOK_URL, {
          method: 'POST', mode: 'no-cors',
          headers: { 'Content-Type': 'text/plain' },
          body: JSON.stringify(payload),
        });
      } else {
        await new Promise((r) => setTimeout(r, 700));
      }
      try { sessionStorage.setItem(submittedKey, '1'); } catch { /* ignore */ }
      setStatus('success');
    } catch {
      setStatus('error');
    }
  };

  const closeModal = () => {
    setModalOpen(false);
    if (status === 'error') setStatus('idle');
  };

  return (
    <>
      <main style={{ maxWidth: 640, margin: '0 auto', padding: '40px 20px' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <img
            src="/darren-headshot.jpg"
            alt="Darren Tsai"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
            style={{ width: 96, height: 96, borderRadius: '50%', objectFit: 'cover', margin: '0 auto' }}
          />
        </div>

        {status === 'success' && !modalOpen ? (
          <div className="success-state" style={{ padding: '32px 0', textAlign: 'center' }}>
            <svg className="success-check" viewBox="0 0 52 52" fill="none" aria-label="Success" style={{ width: 60, margin: '0 auto' }}>
              <circle cx="26" cy="26" r="24" stroke="#2ecc71" strokeWidth="3" />
              <path d="M14 26l9 9 16-16" stroke="#2ecc71" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <h1 className="success-heading" style={{ marginTop: 20 }}>You're in!</h1>
            <p className="success-body">
              {config.successBody ?? `Check your email for the ${config.magnetName}. If you don't see it, check promotions or spam.`}
            </p>
          </div>
        ) : (
          <>
            <h1 style={{ color: 'var(--navy)', marginBottom: 8, textAlign: 'center' }}>{config.headline}</h1>
            <p style={{ color: 'var(--text-muted)', marginBottom: 20, textAlign: 'center', fontSize: '1.05rem' }}>
              {config.subheadline}
            </p>
            {config.body && <p style={{ color: 'var(--text-dark)', marginBottom: 20 }}>{config.body}</p>}
            {config.bullets && config.bullets.length > 0 && (
              <ul style={{ margin: '0 0 24px', paddingLeft: 20, lineHeight: 1.9 }}>
                {config.bullets.map((b, i) => <li key={i}>{b}</li>)}
              </ul>
            )}

            {config.extra}

            <div style={{ textAlign: 'center', marginTop: 8 }}>
              {config.ctaHref ? (
                <a href={config.ctaHref} className="btn btn-rose btn-full submit-btn"
                   style={{ display: 'inline-flex', justifyContent: 'center', textDecoration: 'none' }}>
                  {config.ctaLabel ?? 'Continue'}
                </a>
              ) : (
                <button type="button" className="btn btn-rose btn-full submit-btn" onClick={() => setModalOpen(true)}>
                  {config.ctaLabel ?? 'Get Instant Access'}
                </button>
              )}
              {config.ctaHref && (
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 14, lineHeight: 1.6 }}>
                  US residents only. Your info is never sold or shared. NMLS# {NMLS} · DRE# {DRE} · Equal Housing Opportunity.
                </p>
              )}
            </div>
          </>
        )}
      </main>
      <Footer />

      {/* Lead capture modal — matches site-wide modal styling (see App.tsx contact modal) */}
      {modalOpen && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="landing-modal-title"
          onClick={closeModal}
        >
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            {status === 'success' ? (
              <div className="modal-body">
                <div className="success-state" style={{ padding: '8px 0' }}>
                  <svg className="success-check" viewBox="0 0 52 52" fill="none" aria-label="Success">
                    <circle cx="26" cy="26" r="24" stroke="#2ecc71" strokeWidth="3" />
                    <path d="M14 26l9 9 16-16" stroke="#2ecc71" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <h3 className="success-heading">You're in!</h3>
                  <p className="success-body">
                    {config.successBody ?? `Check your email for the ${config.magnetName}. If you don't see it, check promotions or spam.`}
                  </p>
                  <button className="btn btn-teal" style={{ marginTop: 24 }} onClick={() => setModalOpen(false)}>
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="modal-header">
                  <h2 id="landing-modal-title" className="modal-title">{config.magnetName}</h2>
                  <button className="modal-close" onClick={closeModal} aria-label="Close">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                    </svg>
                  </button>
                </div>
                <div className="modal-body">
                  <p className="modal-sub">Enter your info below and we'll send it right over.</p>

                  {status === 'error' && (
                    <div className="error-banner" role="alert" style={{ marginBottom: 16 }}>
                      Something went wrong. Please email <a href={`mailto:${EMAIL}`}>{EMAIL}</a> directly.
                    </div>
                  )}

                  <form onSubmit={handleSubmit} noValidate>
                    <div className="form-row-2" style={{ marginBottom: 16 }}>
                      <div className="input-group" style={{ marginBottom: 0 }}>
                        <label htmlFor="l-firstName" className="input-label">First Name <span style={{ color: 'var(--rose)' }}>*</span></label>
                        <input id="l-firstName" type="text" className={`form-input${errors.firstName ? ' input-error' : ''}`}
                          value={form.firstName} onChange={set('firstName')} autoComplete="given-name" />
                        {errors.firstName && <span className="field-error">{errors.firstName}</span>}
                      </div>
                      <div className="input-group" style={{ marginBottom: 0 }}>
                        <label htmlFor="l-lastName" className="input-label">Last Name <span style={{ color: 'var(--rose)' }}>*</span></label>
                        <input id="l-lastName" type="text" className={`form-input${errors.lastName ? ' input-error' : ''}`}
                          value={form.lastName} onChange={set('lastName')} autoComplete="family-name" />
                        {errors.lastName && <span className="field-error">{errors.lastName}</span>}
                      </div>
                    </div>
                    <div className="form-row-2" style={{ marginBottom: 16 }}>
                      <div className="input-group" style={{ marginBottom: 0 }}>
                        <label htmlFor="l-email" className="input-label">Email <span style={{ color: 'var(--rose)' }}>*</span></label>
                        <input id="l-email" type="email" className={`form-input${errors.email ? ' input-error' : ''}`}
                          value={form.email} onChange={set('email')} autoComplete="email" />
                        {errors.email && <span className="field-error">{errors.email}</span>}
                      </div>
                      <div className="input-group" style={{ marginBottom: 0 }}>
                        <label htmlFor="l-phone" className="input-label">Phone <span style={{ color: 'var(--rose)' }}>*</span></label>
                        <input id="l-phone" type="tel" className={`form-input${errors.phone ? ' input-error' : ''}`}
                          value={form.phone} onChange={handlePhone} autoComplete="tel" placeholder="(555) 555-5555" />
                        {errors.phone && <span className="field-error">{errors.phone}</span>}
                      </div>
                    </div>
                    <button type="submit" className="btn btn-rose btn-full submit-btn" style={{ marginTop: 8 }} disabled={status === 'loading'}>
                      {status === 'loading' ? (<><span className="btn-spinner" aria-hidden="true" />Sending…</>) : (config.ctaLabel ?? 'Get Instant Access')}
                    </button>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 14, textAlign: 'center', lineHeight: 1.6 }}>
                      US residents only. Your info is never sold or shared. NMLS# {NMLS} · DRE# {DRE} · Equal Housing Opportunity.
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
