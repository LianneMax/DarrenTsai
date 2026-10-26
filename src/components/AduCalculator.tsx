import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { isValidPhoneNumber } from 'libphonenumber-js';
import { EMAIL } from '../config';
import { useLeadSubmit } from '../hooks/useLeadSubmit';
import { openBooking } from '../utils/booking';
import { type EmailSuggestion } from '../utils/emailSuggest';
import { aduNumbers, buildAduLead } from '../utils/adu';
import AduPage, { type AduPageView } from './AduViews';
import { serviceArea, outOfMarketPage } from '../utils/serviceArea';
import { milestone } from '../utils/attribution';

const emailSchema = z.string().email();

/**
 * /adu/ (frontend revamp, phase 5): state, gates and the lead. AduViews.tsx
 * draws it.
 *
 * WHY THIS PAGE EXISTS. Someone planning an ADU or a renovation arrives with a
 * project cost, not a debt or an equity goal, and the homepage's goal hub
 * (phase 4) needs a real page to send them to: the plan's rule is never to link
 * to a page that does not exist. The lead carries the project's numbers and
 * purpose to its own tab, so Darren starts the call knowing the budget gap.
 *
 * The same rules as the other revamp calculators: empty inputs, no pre-chosen
 * project type, forward-only gates, a ref against the double submit, and a
 * success state only after /api/lead confirms the save.
 */
export default function AduCalculator() {
  const [step, setStep] = useState(1);
  const validationError = (message: string) => { if (message) milestone('form_error', {form_id:'adu-calculator',error_code:'validation'}); setErrorMsg(message); };
  useEffect(() => { window.DTLead?.begin('adu-calculator'); }, []);

  const [homeValue, setHomeValue] = useState('');
  const [mtgBalance, setMtgBalance] = useState('');
  const [projectCost, setProjectCost] = useState('');
  const [toFinance, setToFinance] = useState('');
  const [purpose, setPurpose] = useState('');
  const [propertyUse, setPropertyUse] = useState('');

  const [fname, setFname] = useState('');
  const [lname, setLname] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [emailHint, setEmailHint] = useState<EmailSuggestion | null>(null);
  const [usState, setUsState] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const inFlight = useRef(false);

  const postLead = useLeadSubmit({
    formId: 'adu-calculator',
    thankYouPath: '/thank-you/adu',
    thankYouTitle: 'Thank You — ADU',
  });

  // ── Derived values ─────────────────────────────────────────────────────────

  const hv = parseFloat(homeValue) || 0;
  // 0 is a real balance (a paid-off home), so "entered" is tested on the string.
  const balanceGiven = mtgBalance.trim() !== '' && (parseFloat(mtgBalance) || 0) >= 0;
  const mb = balanceGiven ? (parseFloat(mtgBalance) || 0) : 0;
  const cost = parseFloat(projectCost) || 0;
  const fin = parseFloat(toFinance) || 0;
  const hasHome = hv > 0 && balanceGiven;
  const { equity, ltv, cltv, gap } = aduNumbers(hv, mb, cost, fin);

  /**
   * All four numbers and the project type before the contact step: the
   * snapshot and the budget gap are made of them, and the lead is not much use
   * to Darren without the project's cost and the amount to finance.
   */
  const goStep = (n: number) => {
    if (inFlight.current || n < 1 || n > 4) return;
    if (n > step) {
      if (!purpose || cost <= 0 || fin <= 0) {
        validationError('Choose your project and enter its estimated cost and the amount you would like to finance.'); return;
      }
      if (n >= 3 && !hasHome) {
        validationError('Enter your home value and mortgage balance. Enter 0 if your home is paid off.'); return;
      }
      if (n >= 3 && serviceArea(propertyUse, usState, 'adu') === 'incomplete') {
        milestone('form_error', {form_id:'adu-calculator',error_code:propertyUse && usState ? 'policy_exit':'validation',field_category:'property'});
        setErrorMsg('Choose how you use the home and the state it is in.'); return;
      }
    }
    if (n > step) milestone('form_step', { form_id: 'adu-calculator', step_id: step });
    setErrorMsg(null); setStep(n);
    setTimeout(() => document.getElementById('project')?.scrollIntoView({behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block:'start'}), 0);
  };

  const submitLead = async () => {
    if (inFlight.current || sending) return;
    if (!fname || !phone || !email || !usState) {
      validationError('Please fill in your name, phone, email, and state.');
      return;
    }
    if (!emailSchema.safeParse(email.trim()).success) {
      validationError('Please enter a valid email address.');
      return;
    }
    if (!isValidPhoneNumber(phone.trim(), 'US')) {
      validationError('Please enter a valid US phone number.');
      return;
    }
    setErrorMsg(null);

    inFlight.current = true;
    setSending(true);
    const result = await postLead({ ...buildAduLead({
      firstName: fname, lastName: lname, phone, email, state: usState,
      homeValue: hv, mortgageBalance: mb, projectCost: cost, amountToFinance: fin, purpose,
    }), propertyUse, propertyState: usState, message });
    if (!result.ok) {
      inFlight.current = false;
      setSending(false);
    }
    if (!result.ok && result.kind === 'fieldError') {
      setErrorMsg(result.message);
      return;
    }
    if (!result.ok) {
      setErrorMsg(
        "We couldn't confirm whether your request was saved. " +
        `Retry here with the same details, or email ${EMAIL} for help.`
      );
      return;
    }
    if (result.disposition === 'sheet-only') { window.location.assign(outOfMarketPage(propertyUse) + '#recorded'); return; }
    setSubmitted(true);
  };

  const view: AduPageView = {
    step, goStep,
    homeValue, setHomeValue, mtgBalance, setMtgBalance, projectCost, setProjectCost, toFinance, setToFinance,
    hv, mb, cost, fin, hasHome, equity, ltv, cltv, gap,
    purpose, setPurpose, propertyUse, setPropertyUse, errorMsg,
    fname, setFname, lname, setLname, phone, setPhone, email, setEmail,
    emailHint, setEmailHint, usState, setUsState, message, setMessage,
    sending, submitted, submitLead: () => { void submitLead(); }, openBooking,
  };

  const disclosure = (
    <p className="dcp-caption">
      <strong>Important Disclosures:</strong> This tool provides estimates for educational purposes
      only. It is not an appraisal, a loan application, an approval, a statement of available credit,
      or a confirmation that a project can be permitted, built or rented. Actual rates, terms and
      amounts depend on creditworthiness, property appraisal, combined loan-to-value, other liens and
      lender approval. Not a commitment to lend. All loans subject to underwriting approval.
      Borrowing against your home can put your home at risk. Equal Housing Opportunity.
      <br /><br />
      <strong>Darren Tsai</strong> · Senior Loan Officer · NMLS# 2438102 · DRE# 02103705
      · Licensed with Saxton Mortgage. For licensing information, visit{' '}
      <a href="https://www.nmlsconsumeraccess.org" target="_blank" rel="noopener noreferrer">
        nmlsconsumeraccess.org
      </a>.
    </p>
  );

  return (
    <AduPage
      v={view}
      disclosure={disclosure}
    />
  );
}
