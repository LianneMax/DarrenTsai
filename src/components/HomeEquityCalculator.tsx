import { useRef, useState } from 'react';
import { z } from 'zod';
import { isValidPhoneNumber } from 'libphonenumber-js';
import { EMAIL } from '../config';
import { useLeadSubmit } from '../hooks/useLeadSubmit';
import { openCalendly } from '../utils/calendly';
import { type EmailSuggestion } from '../utils/emailSuggest';
import { buildEquityLead, equityNumbers } from '../utils/homeEquity';
import EquityPage, { type EquityPageView } from './HomeEquityViews';

const emailSchema = z.string().email();

/**
 * /home-equity/ (frontend revamp, phase 3): state, gates and the lead.
 * HomeEquityViews.tsx draws it.
 *
 * WHY THIS PAGE EXISTS. Home-equity and HELOC intent had no page: /yt/heloc
 * and /yt/equity landed on the homepage, and the debt calculator, which prices
 * the two fixed alternatives to a HELOC, was the closest thing. Someone who
 * wants to renovate or invest with their equity is not consolidating debt, and
 * arrived in the Sheet and Bonzo looking like someone who was. This page asks
 * what the equity is for and sends that with the lead, to its own tab.
 *
 * It follows the rules the debt calculator learned the hard way:
 *  - every input starts empty, and no goal or preference is pre-selected,
 *    because a pre-filled answer reaches the Sheet as the visitor's own;
 *  - the steps are gated forwards only, the step tabs included;
 *  - a double submit is stopped by a ref as well as by state;
 *  - success is shown only once /api/lead has confirmed the save.
 */
export default function HomeEquityCalculator() {
  const [step, setStep] = useState(1);

  const [homeValue, setHomeValue] = useState('');
  const [mtgBalance, setMtgBalance] = useState('');
  const [amount, setAmount] = useState('');
  const [goal, setGoal] = useState('');
  const [preference, setPreference] = useState('');

  const [fname, setFname] = useState('');
  const [lname, setLname] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [emailHint, setEmailHint] = useState<EmailSuggestion | null>(null);
  const [usState, setUsState] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  // State is read from the render already on screen, so two clicks in one tick
  // both pass it. The ref is written synchronously (see DebtSavingsCalculator).
  const inFlight = useRef(false);

  const postLead = useLeadSubmit({
    formId: 'home-equity-calculator',
    thankYouPath: '/thank-you/home-equity',
    thankYouTitle: 'Thank You — Home Equity',
  });

  // ── Derived values ─────────────────────────────────────────────────────────

  const hv = parseFloat(homeValue) || 0;
  // A balance of 0 is a real answer (a paid-off home), unlike on the debt page,
  // so "entered" is tested on the string, not on the number.
  const balanceGiven = mtgBalance.trim() !== '' && (parseFloat(mtgBalance) || 0) >= 0;
  const mb = balanceGiven ? (parseFloat(mtgBalance) || 0) : 0;
  const amt = parseFloat(amount) || 0;
  const hasHome = hv > 0 && balanceGiven;
  const { equity, ltv, cltv } = equityNumbers(hv, mb, amt);

  /**
   * How far the visitor may go. The snapshot on step 2 is made of the value and
   * the balance, so it waits for both; the goal is the one question this page
   * exists to ask, and it is one tap. The amount and the preference stay
   * optional and are sent blank when skipped.
   */
  const furthestStep = !hasHome || !goal ? 1 : 3;
  const gateMessage = !hasHome
    ? 'Enter your home value and your mortgage balance (0 if the home is paid off), so the estimate is about your home and not an example.'
    : 'Choose what you would use your equity for, so Darren knows where to start.';

  const goStep = (n: number) => {
    if (n > step && n > furthestStep) {
      setErrorMsg(gateMessage);
      return;
    }
    setStep(n);
    setTimeout(() => {
      document.getElementById('equity')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);
  };

  const submitLead = async () => {
    if (inFlight.current || sending) return;
    if (!fname || !phone || !email || !usState) {
      setErrorMsg('Please fill in your name, phone, email, and state.');
      return;
    }
    if (!emailSchema.safeParse(email.trim()).success) {
      setErrorMsg('Please enter a valid email address.');
      return;
    }
    if (!isValidPhoneNumber(phone.trim(), 'US')) {
      setErrorMsg('Please enter a valid US phone number.');
      return;
    }
    setErrorMsg(null);

    inFlight.current = true;
    setSending(true);
    const result = await postLead(buildEquityLead({
      firstName: fname, lastName: lname, phone, email, state: usState,
      homeValue: hv, mortgageBalance: mb, goal, amountExploring: amt, preference,
    }));
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
        "We couldn't save your details on our end. " +
        `Please try again in a moment, or email ${EMAIL} and Darren will pick it up.`
      );
      return;
    }
    setSubmitted(true);
  };

  const view: EquityPageView = {
    step, goStep,
    homeValue, setHomeValue, mtgBalance, setMtgBalance, amount, setAmount,
    hv, mb, amt, hasHome, equity, ltv, cltv,
    goal, setGoal, preference, setPreference,
    fname, setFname, lname, setLname, phone, setPhone, email, setEmail,
    emailHint, setEmailHint, usState, setUsState,
    sending, submitted, submitLead: () => { void submitLead(); }, openCalendly,
  };

  const disclosure = (
    <p className="dcp-caption">
      <strong>Important Disclosures:</strong> This tool provides estimates for educational purposes
      only. It is not an appraisal, a loan application, an approval or a statement of available
      credit. Actual rates, terms and amounts depend on creditworthiness, property appraisal,
      combined loan-to-value, other liens and lender approval. Not a commitment to lend. All loans
      subject to underwriting approval. Borrowing against your home can put your home at risk.
      Equal Housing Opportunity.
      <br /><br />
      <strong>Darren Tsai</strong> · Senior Loan Officer · NMLS# 2438102 · DRE# 02103705
      · Licensed with Saxton Mortgage. For licensing information, visit{' '}
      <a href="https://www.nmlsconsumeraccess.org" target="_blank" rel="noopener noreferrer">
        nmlsconsumeraccess.org
      </a>.
    </p>
  );

  const overlays = errorMsg && (
    <div className="modal-overlay" role="alertdialog" aria-modal="true" aria-labelledby="he-error-title"
      onClick={() => setErrorMsg(null)}>
      <div className="modal-panel" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 id="he-error-title" className="modal-title" style={{ fontSize: '1.15rem' }}>Something&apos;s missing</h2>
          <button className="modal-close" onClick={() => setErrorMsg(null)} aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="modal-body">
          <p className="modal-sub" style={{ marginBottom: 24 }}>{errorMsg}</p>
          <button className="btn btn-rose btn-full" onClick={() => setErrorMsg(null)}>Got it</button>
        </div>
      </div>
    </div>
  );

  return <EquityPage v={view} overlays={overlays} disclosure={disclosure} />;
}
