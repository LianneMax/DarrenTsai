import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { isValidPhoneNumber } from 'libphonenumber-js';
import { EMAIL } from '../config';
import { useLeadSubmit } from '../hooks/useLeadSubmit';
import { type EmailSuggestion } from '../utils/emailSuggest';
import { buildEquityLead, equityNumbers } from '../utils/homeEquity';
import { serviceArea, prequalPasses, outOfMarketPage } from '../utils/serviceArea';
import { stateForZip } from '../utils/zipState';
import EquityPage, { EQUITY_FORM_ID, type EquityPageView } from './HomeEquityViews';
import { ErrorDialog } from './PageParts';

const emailSchema = z.string().email();

/**
 * /home-equity/: state, gates and the lead. HomeEquityViews.tsx draws it.
 *
 * WHY THIS PAGE EXISTS. Home-equity and HELOC intent had no page: /yt/heloc
 * and /yt/equity landed on the homepage. Since 15 Oct 2026 (with Darren) it is
 * the site's main focus, rebuilt as three short steps, mostly taps, that end on
 * Darren's calendar for a lead that passes the same rules as the booking
 * prequal (public/booking-chooser.js): a licensed property state, not a mobile
 * home or land, a mortgage that is current (or none), and no bankruptcy or
 * foreclosure in the last 4 years. lead.mts enforces the same rules for this
 * form id.
 *
 * It follows the rules the debt calculator learned the hard way:
 *  - every input starts empty and no answer is pre-selected, because a
 *    pre-filled answer reaches the Sheet as the visitor's own;
 *  - the steps are gated forwards only, the step tabs included;
 *  - a double submit is stopped by a ref as well as by state;
 *  - success is shown only once /api/lead has confirmed the save.
 */
export default function HomeEquityCalculator() {
  const [step, setStep] = useState(1);

  const [homeValue, setHomeValue] = useState('');
  const [mtgBalance, setMtgBalance] = useState('');
  const [propertyType, setPropertyType] = useState('');
  const [propertyUse, setPropertyUse] = useState('');
  const [zip, setZipRaw] = useState('');
  const [propertyState, setPropertyState] = useState('');

  const [goal, setGoal] = useState('');
  const [creditRange, setCreditRange] = useState('');
  const [cashRange, setCashRange] = useState('');
  const [mortgageCurrent, setMortgageCurrent] = useState('');
  const [bankruptcy, setBankruptcy] = useState('');

  const [fname, setFname] = useState('');
  const [lname, setLname] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [emailHint, setEmailHint] = useState<EmailSuggestion | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [declined, setDeclined] = useState<'' | 'property-type' | 'knockout'>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  // State is read from the render already on screen, so two clicks in one tick
  // both pass it. The ref is written synchronously (see DebtSavingsCalculator).
  const inFlight = useRef(false);

  const postLead = useLeadSubmit({
    formId: EQUITY_FORM_ID,
    thankYouPath: '/thank-you/home-equity',
    thankYouTitle: 'Thank You — Home Equity',
    omitUserData: true,
  });

  // The ZIP proposes the state; the visitor can still change it.
  const setZip = (value: string) => {
    setZipRaw(value);
    setPropertyState(stateForZip(value));
  };

  // ── Derived values ─────────────────────────────────────────────────────────

  const hv = parseFloat(homeValue) || 0;
  // A balance of 0 is a real answer (a paid-off home), so "entered" is tested
  // on the string, not on the number.
  const balanceGiven = mtgBalance.trim() !== '' && (parseFloat(mtgBalance) || 0) >= 0;
  const mb = balanceGiven ? (parseFloat(mtgBalance) || 0) : 0;
  const hasHome = hv > 0 && balanceGiven;
  const { equity } = equityNumbers(hv, mb, 0);

  const scrollToFlow = () => {
    setTimeout(() => {
      document.getElementById('equity')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);
  };

  // Back only, from the step tabs. Forwards goes through next(), which checks.
  const goStep = (n: number) => {
    if (n >= step) return;
    setStep(n);
    scrollToFlow();
  };

  const next = () => {
    if (step === 1) {
      if (!hasHome) {
        setErrorMsg('Enter your home value and your mortgage balance (0 if the home is paid off), so the estimate is about your home and not an example.');
        return;
      }
      if (!propertyType || !propertyUse || !/^\d{5}$/.test(zip) || !propertyState) {
        setErrorMsg('Please choose the property type and how you use the home, and enter the ZIP of the home you’re borrowing against.');
        return;
      }
      if (propertyType === 'mobile-land') { setDeclined('property-type'); scrollToFlow(); return; }
      const area = serviceArea(propertyUse, propertyState, 'home-equity');
      if (area === 'out-of-market') {
        window.location.assign(outOfMarketPage(propertyUse));
        return;
      }
      if (area !== 'supported') { setErrorMsg('Please check the property state.'); return; }
      setStep(2);
      scrollToFlow();
      return;
    }
    if (step === 2) {
      if (!goal || !creditRange || !cashRange || !mortgageCurrent || !bankruptcy) {
        setErrorMsg('Please answer each question to continue.');
        return;
      }
      if (!prequalPasses({ propertyType, mortgageCurrent, recentBankruptcyForeclosure: bankruptcy })) {
        setDeclined('knockout');
        scrollToFlow();
        return;
      }
      setStep(3);
      scrollToFlow();
    }
  };

  // A declined visitor is counted, never identified.
  useEffect(() => {
    if (!declined) return;
    try {
      const dt = (window as Window & { DT?: { track: (e: string, p: object) => void } }).DT;
      dt?.track('booking_prequal_declined', { reason: declined, page_path: window.location.pathname });
    } catch { /* analytics must never break the page */ }
  }, [declined]);

  const submitLead = async () => {
    if (inFlight.current || sending) return;
    if (!fname || !lname || !phone || !email) {
      setErrorMsg('Please fill in your name, phone and email.');
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
      firstName: fname, lastName: lname, phone, email,
      homeValue: hv, mortgageBalance: mb,
      propertyType, propertyUse, propertyZip: zip, propertyState,
      goal, creditRange, cashRange, mortgageCurrent, recentBankruptcyForeclosure: bankruptcy,
    }));
    if (!result.ok) {
      inFlight.current = false;
      setSending(false);
    }
    if (!result.ok && result.kind === 'fieldError') {
      if (result.field === 'propertyState') {
        window.location.assign(outOfMarketPage(propertyUse));
        return;
      }
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
    scrollToFlow();
  };

  const view: EquityPageView = {
    step, goStep, next,
    homeValue, setHomeValue, mtgBalance, setMtgBalance, hv, mb, hasHome, equity,
    propertyType, setPropertyType, propertyUse, setPropertyUse, zip, setZip, propertyState, setPropertyState,
    goal, setGoal, creditRange, setCreditRange, cashRange, setCashRange,
    mortgageCurrent, setMortgageCurrent, bankruptcy, setBankruptcy,
    fname, setFname, lname, setLname, phone, setPhone, email, setEmail,
    emailHint, setEmailHint,
    sending, submitted, declined, submitLead: () => { void submitLead(); },
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

  const overlays = <ErrorDialog message={errorMsg} onClose={() => setErrorMsg(null)} id="he-error-title" />;

  return <EquityPage v={view} overlays={overlays} disclosure={disclosure} />;
}
