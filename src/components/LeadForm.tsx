import { calculateMortgage } from '../utils/mortgageCalc';
import ServiceAreaFields from './ServiceAreaFields';
import ComplianceDisclosure from './ComplianceDisclosure';
import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { isValidPhoneNumber } from 'libphonenumber-js';
import { formatUsPhone } from '../utils/phone';
import type { MortgageInputs } from '../types/mortgage';
import { EMAIL } from '../config';
import { outOfMarketPage } from '../utils/serviceArea';
import CustomSelect from './CustomSelect';
import { openBooking } from '../utils/booking';
import { milestone } from '../utils/attribution';
import { useLeadSubmit } from '../hooks/useLeadSubmit';
import { emailHintMessage, hintAfterBlur, type EmailSuggestion } from '../utils/emailSuggest';

const emailSchema = z.string().email();

interface Props {
  currentInputs: MortgageInputs;
  onClose: () => void;
  /**
   * Where this copy of the modal lives. Every contact lead used to post
   * the source 'MortgageCalculator' from every page, so the Sheet, the Bonzo tags
   * and GA4 could not tell an equity lead on the homepage from a DSCR lead on
   * `/dscr/`. One value per page and form, and Apps Script has a tag branch for
   * each of them.
   */
  leadSource: string;
  /** GA4 / dataLayer form id, likewise one per page. */
  formId: string;
  /**
   * Only `/mortgage-calculator/` pre-fills the optional loan numbers, because
   * there they are numbers the visitor typed themselves. Everywhere else they
   * were the calculator's own defaults, and a real May lead is on record at
   * $330,000 / 6.41% because of it: figures nobody gave us, logged as theirs.
   */
  prefillNumbers?: boolean;
  /** What to point the visitor at afterwards. Was "the savings calculator above" on every page. */
  nextStep: string;
}

interface FormState {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  state: string;
  propertyUse: string;
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
  // /yt/heloc and /yt/equity send real traffic here, and until 26 Sep 2026 a
  // viewer who had just watched a HELOC video had no option that matched what
  // they came for. Until a dedicated page exists, this is how that intent is
  // recorded: it reaches the Sheet and HubSpot as target access-equity and is filterable.
  { value: 'access-equity', label: 'Access my home equity' },
  { value: 'buy-home', label: 'Purchase a home' },
  { value: 'refinance', label: 'Refinance my existing mortgage' },
  { value: 'invest', label: 'Investment property' },
  { value: 'other', label: 'Other' },
];

// There was a sessionStorage "already submitted" flag here. It meant anyone who
// reopened the modal in the same tab was shown a success screen they had not
// earned and could not submit again, which silently suppressed second leads.
// Success now lives purely in component state.
export default function LeadForm({
  currentInputs,
  onClose,
  leadSource,
  formId,
  prefillNumbers = false,
  nextStep,
}: Props) {
  useEffect(() => { window.DTLead?.begin(formId); }, [formId]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [formError, setFormError] = useState<string | null>(null);

  const [form, setForm] = useState<FormState>(() => ({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    state: '',
    propertyUse: '',
    loanAmount: prefillNumbers ? currentInputs.loanAmount.toLocaleString('en-US') : '',
    annualRate: prefillNumbers ? currentInputs.annualRate.toString() : '',
    termYears: currentInputs.termYears.toString(),
    goals: '',
    timeline: '',
    target: '',
  }));

  const [emailHint, setEmailHint] = useState<EmailSuggestion | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});

  const submitLead = useLeadSubmit({
    formId,
    thankYouPath: '/thank-you/contact',
    thankYouTitle: 'Thank You — Contact',
  });
  const formRef = useRef<HTMLFormElement>(null);

  const set = (key: keyof FormState) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    setForm((prev) => ({ ...prev, [key]: e.target.value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatUsPhone(e.target.value);
    setForm((prev) => ({ ...prev, phone: formatted }));
    setErrors((prev) => ({ ...prev, phone: undefined }));
  };

  const validate = (): boolean => {
    const errs: FieldErrors = {};
    // Required: first name, email, phone, state. Nothing else.
    //
    // It used to be eight, including a free-text "Your Goals" paragraph, a
    // target and a timeline. Every one of those is a reason to close the modal,
    // and none of them is needed to call someone back: Darren asks them on the
    // call, better, in thirty seconds. They are still here and still sent when
    // filled in, because a lead who volunteers their goal is a better lead.
    if (!form.firstName.trim()) errs.firstName = 'Required';
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
    setErrors(errs);
    if (Object.keys(errs).length) milestone('form_error', {form_id:formId,error_code:'validation',field_category:'contact'});
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setStatus('loading');
    setFormError(null);

    const payload = {
      firstName: form.firstName.trim(),
      lastName:  form.lastName.trim(),
      email:     form.email.trim(),
      phone:     form.phone.trim(),
      state:     form.state,
      propertyState: form.state, propertyUse: form.propertyUse,
      // Blank, not 0 and not 30.
      //
      // No Contact form on this site asks for a term, and `|| 30` wrote 30 into
      // the Leads tab for every one of them. The term only means something here
      // when the visitor has actually used the mortgage calculator, which is
      // what prefillNumbers says. Loan and rate are optional fields: a blank one
      // is a question nobody answered, not a $0 loan at 0%.
      loanAmount: parseFloat(form.loanAmount.replace(/[^0-9.]/g, '')) || '',
      termYears:  prefillNumbers ? (parseInt(form.termYears) || '') : '',
      annualRate: parseFloat(form.annualRate) || '',
      message:  form.goals.trim(),
      target:   form.target,
      timeline: form.timeline,
      ...(prefillNumbers ? (() => { const result = calculateMortgage(currentInputs); return { calculatorInputs: currentInputs, calculatorResults: { monthlyPrincipalAndInterest: result.monthlyPayment, totalInterest: result.totalInterest, totalPrincipalAndInterest: result.totalCost, payoffDate: result.payoffDate, estimateOnly: true, excludesTaxesInsuranceFees: true } }; })() : {}),
      source: leadSource,
      timestamp: new Date().toISOString(),
    };

    const result = await submitLead(payload);

    // A 422 on the email keeps the visitor on the form with the message against
    // the field, rather than the generic failure state, which tells them not to
    // resubmit. Nothing was saved in that case, so resubmitting is the fix.
    if (!result.ok && result.kind === 'fieldError') {
      if (['firstName', 'lastName', 'email', 'phone', 'state'].includes(result.field)) setErrors((prev) => ({ ...prev, [result.field]: result.message }));
      else setFormError(result.message);
      setStatus('idle');
      return;
    }

    if (result.ok && result.disposition === 'sheet-only') { window.location.assign(outOfMarketPage(form.propertyUse) + '#recorded'); return; }
    setStatus(result.ok ? 'success' : 'error');
  };

  if (status === 'success') {
    return (
      <div className="success-state" style={{ padding: '16px 0 8px' }}>
        <div className="success-check" role="img" aria-label="Success">✓</div>
        <h3 className="success-heading">You're all set, {form.firstName}!</h3>
        {/* Only claim numbers when numbers were sent. The four-field submit is
            the common case and it says "your numbers" to someone who gave
            none, which is the same promise the page could not keep elsewhere. */}
        <p className="success-body">
          {form.loanAmount.trim() || form.annualRate.trim()
            ? `Your numbers were sent with your request. Darren will be in touch. ${nextStep}`
            : 'Darren will be in touch.'}
        </p>
        <button
          onClick={openBooking}
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
    <form ref={formRef} onSubmit={handleSubmit} noValidate data-dt-form={formId}>
      <ServiceAreaFields formId={formId} propertyUse={form.propertyUse} propertyState={form.state}
        onUseChange={value => setForm(previous => ({...previous, propertyUse:value}))}
        onStateChange={value => {setForm(previous => ({...previous, state:value}));setErrors(previous => ({...previous,state:undefined}));}} deferScreening />
      {/* Note */}
      <p className="modal-note">
        <strong>* Required</strong>: name, email, phone and state. The rest is optional.
      </p>

      {(status === 'error' || formError) && (
        <div className="error-banner" role="alert">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
            <path d="M12 8v4M12 16h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          {formError || 'We couldn’t confirm whether your request was saved. Keep this page open and retry here with the same details, or email'}{' '}
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
            Last Name <span className="optional-tag">(optional)</span>
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
            onBlur={(e) => hintAfterBlur(e.target.value, setEmailHint)}
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

      {/* Goals */}
      <div className="input-group">
        <label htmlFor="lf-goals" className="input-label">
          Your Goals <span className="optional-tag">(optional)</span>
        </label>
        <textarea
          id="lf-goals"
          className={`form-input form-textarea${errors.goals ? ' input-error' : ''}`}
          rows={3}
          maxLength={2000}
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
            Target Outcome <span className="optional-tag">(optional)</span>
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
            Timeline <span className="optional-tag">(optional)</span>
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
              placeholder="e.g. 400,000"
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
              placeholder="e.g. 6.5"
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

      <ComplianceDisclosure formId={formId} />
    </form>
  );
}
