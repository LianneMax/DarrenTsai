import { useEffect, useRef, type ReactNode } from 'react';
import { formatCurrency, formatRate } from '../utils/formatters';
import { type EmailSuggestion } from '../utils/emailSuggest';
import { ADU_PURPOSES } from '../utils/adu';
import { COMMON_CLTV_LIMIT } from '../utils/homeEquity';
import { PROPERTY_STATES, PROPERTY_STATE_LABELS, serviceArea, OUT_OF_MARKET_MESSAGE } from '../utils/serviceArea';
import { Arrow, Check, Row, EquitySnapshot, MoneyInput, LeadContactStep } from './PageParts';
import AduHouseExplorer from './AduHouseExplorer';
import { MarketingFaq } from './Marketing';
import JourneyTimeline from './JourneyTimeline';

export interface AduPageView {
  step: number; goStep: (n: number) => void;
  homeValue: string; setHomeValue: (v: string) => void; mtgBalance: string; setMtgBalance: (v: string) => void;
  projectCost: string; setProjectCost: (v: string) => void; toFinance: string; setToFinance: (v: string) => void;
  hv: number; mb: number; cost: number; fin: number; hasHome: boolean; equity: number; ltv: number; cltv: number; gap: number;
  purpose: string; setPurpose: (p: string) => void; propertyUse: string; setPropertyUse: (p: string) => void;
  fname: string; setFname: (v: string) => void; lname: string; setLname: (v: string) => void;
  phone: string; setPhone: (v: string) => void; email: string; setEmail: (v: string) => void;
  emailHint: EmailSuggestion | null; setEmailHint: (h: EmailSuggestion | null) => void;
  usState: string; setUsState: (v: string) => void; sending: boolean; submitted: boolean;
  submitLead: () => void; openBooking: () => void; errorMsg: string | null;
}
const STEPS = [['Your project','What you have in mind'],['Your home','The home behind the plan'],['Your snapshot','Bring the numbers together'],['Talk to Darren','A personal next step']] as const;
const PURPOSE_NOTES = ['Make room for someone close.','Explore a space for tenants.','Improve the home you have.','Talk through a different project.'];

function ProjectIcon({ index }: { index: number }) {
  return <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
    {index===0?<><path d="m4 14 12-9 12 9v13H4V14Z"/><path d="M12 27V17h8v10M2 15l14-11 14 11"/></>
      :index===1?<><path d="M6 28V5h20v23M3 28h26M11 10h3m4 0h3m-10 6h3m4 0h3M13 28v-6h6v6"/></>
      :index===2?<><path d="m4 17 11-11 5 5L9 22l-6 2 1-7ZM18 8l4-4 6 6-4 4M17 22l7-7m-7 7 7 7 5-5-7-7M7 4l4 4M4 7l4 4"/></>
      :<><path d="M7 6h18v22H7zM11 3h10v6H11zM12 15h8m-8 5h8"/></>}
  </svg>;
}

export function AduPageHero() {
  return <header className="adu-hero-surface"><div className="adu-opening design-wrap">
    <div className="adu-opening-copy"><h1>More room for <em>your plans.</em></h1>
      <p>Explore how your home equity could support a renovation or an ADU.</p>
      <a href="#project" className="design-primary large">Start my project <Arrow/></a>
      <span className="adu-opening-note">Your numbers first. A conversation when you’re ready.</span>
    </div>
    <AduHouseExplorer/>
  </div></header>;
}

function Next({v,next,label,back}:{v:AduPageView;next:number;label:string;back?:number}) {
  return <div className="adu-actions">{back?<button type="button" className="adu-back" onClick={()=>v.goStep(back)}>← Back</button>:<span className="adu-action-note">No contact details to see your snapshot.</span>}
    <button type="button" className="design-primary" onClick={()=>v.goStep(next)}>{label} <Arrow/></button></div>;
}

export function StepAduProject({v}:{v:AduPageView}) {
  return <div className="adu-stage"><h2 id="adu-step-heading" tabIndex={-1}>What are you planning?</h2>
    <p className="adu-stage-intro">Choose the closest fit. You can change your answers.</p>
    <div className="adu-purpose-choices" role="group" aria-label="Project purpose">{ADU_PURPOSES.map((purpose,i)=><button key={purpose} type="button" className="adu-purpose" aria-pressed={v.purpose===purpose} onClick={()=>v.setPurpose(purpose)}>
      <ProjectIcon index={i}/><span><strong>{purpose}</strong><small>{PURPOSE_NOTES[i]}</small></span><span className="adu-choice-mark" aria-hidden="true">{v.purpose===purpose&&<Check/>}</span>
    </button>)}</div>
    <div className="adu-question-block"><h3>A first look at your budget.</h3><p>Estimates are fine. Include design, permits, utility work and a contingency in the project cost.</p>
      <div className="dcp-grid-2"><MoneyInput id="adu-cost" label="Estimated project cost" value={v.projectCost} onChange={v.setProjectCost} placeholder="e.g. 175,000"/>
        <MoneyInput id="adu-finance" label="Amount you’d like to finance" value={v.toFinance} onChange={v.setToFinance} placeholder="e.g. 75,000"/></div>
    </div><Next v={v} next={2} label="Add my home"/>
  </div>;
}

export function StepAduHome({v}:{v:AduPageView}) {
  return <div className="adu-stage"><h2 id="adu-step-heading" tabIndex={-1}>The home behind your plan.</h2>
    <p className="adu-stage-intro">Tell us about the home you would borrow against, even if the project is somewhere else.</p>
    <div className="dcp-grid-2"><MoneyInput id="adu-value" label="Current home value" value={v.homeValue} onChange={v.setHomeValue} placeholder="e.g. 650,000"/>
      <MoneyInput id="adu-balance" label="Current mortgage balance" value={v.mtgBalance} onChange={v.setMtgBalance} placeholder="e.g. 350,000"/></div>
    <p className="adu-help">Enter 0 if your home is paid off. Grey numbers are examples, not your figures.</p>
    {v.hasHome&&<EquitySnapshot hv={v.hv} mb={v.mb}/>}
    <fieldset className="adu-home-location"><legend>Where is that home?</legend><div className="dcp-grid-2">
      <div><label className="input-label" htmlFor="adu-calculator-property-use">How do you use that home?</label><select id="adu-calculator-property-use" className="form-input" value={v.propertyUse} onChange={e=>v.setPropertyUse(e.target.value)}>
        <option value="">Choose one</option><option value="primary">Primary home</option><option value="second-home">Second home</option><option value="investment">Rental / investment</option></select></div>
      <div><label className="input-label" htmlFor="adu-calculator-property-state">State of the home you’re borrowing against</label><select id="adu-calculator-property-state" className="form-input" value={v.usState} onChange={e=>v.setUsState(e.target.value)}>
        <option value="">Choose the state</option>{PROPERTY_STATES.map(s=><option key={s} value={s}>{PROPERTY_STATE_LABELS[s]}</option>)}</select></div>
    </div><p className="adu-help">This checks service area only, not loan approval.</p></fieldset>
    <Next v={v} next={3} back={1} label="See my snapshot"/>
  </div>;
}

function Gap({v}:{v:AduPageView}) {
  if(v.gap>0)return <p>The remaining <strong>{formatCurrency(v.gap)}</strong> of the budget needs a separate plan, such as cash or other confirmed funding.</p>;
  if(v.gap<0)return <p>The amount to finance is <strong>{formatCurrency(-v.gap)}</strong> more than the estimated project cost. Darren can talk through whether that fits your plan.</p>;
  return <p>The amount to finance covers the estimated project cost.</p>;
}

export function StepAduSnapshot({v}:{v:AduPageView}) {
  const share=Math.min(100,Math.max(0,v.fin/v.cost*100));
  return <div className="adu-stage"><h2 id="adu-step-heading" tabIndex={-1}>Your project, in perspective.</h2>
    <p className="adu-stage-intro">{v.purpose}. Your estimates brought together before choosing a loan product.</p>
    <div className="adu-budget-snapshot"><div className="adu-budget-head"><span>Estimated project cost</span><strong>{formatCurrency(v.cost)}</strong></div>
      <div className="adu-funding-bar" role="img" aria-label={`Requested financing covers ${share.toFixed(0)} percent of the estimated project cost. This is not approved credit.`}><span style={{width:`${share}%`}}/></div>
      <div className="adu-budget-key"><span><i/>Amount to finance<strong>{formatCurrency(v.fin)}</strong></span><span><i/>Remaining budget<strong>{formatCurrency(Math.max(0,v.gap))}</strong></span></div><Gap v={v}/>
    </div>
    <details className="adu-equity-details"><summary><span>Your home equity estimate<strong>{v.equity>=0?formatCurrency(v.equity):'None at these numbers'}</strong></span></summary>
      <EquitySnapshot hv={v.hv} mb={v.mb}/><Row label="Illustrative combined loan-to-value" value={formatRate(v.cltv)}/>
      <p className="adu-help">Includes your current mortgage and the amount you want to finance. This is not available credit.
        {v.cltv>COMMON_CLTV_LIMIT&&<> That is above the {COMMON_CLTV_LIMIT}% combined loan-to-value many lenders use as a limit for a second loan. Darren can tell you what may be possible.</>}</p>
    </details>
    <details className="adu-path-details"><summary>Which financing paths could fit?</summary><ul className="adu-financing-paths"><li>A fixed home equity loan may suit a known one-time budget.</li><li>A HELOC may suit staged draws, with variable-rate and repayment risks.</li><li>A cash-out refinance replaces the first mortgage.</li><li>Construction financing may require a separate project review.</li></ul><p className="adu-help">These are discussion paths, not eligibility results.</p></details>
    <p className="adu-estimate-note">Financing does not confirm the ADU can be built or rented. An educational snapshot, not an appraisal, loan approval or confirmation that the project can be permitted, built or rented. Borrowing against your home can put your home at risk.</p>
    {serviceArea(v.propertyUse,v.usState,'adu')==='out-of-market'&&<p className="adu-inline-error" role="status">{OUT_OF_MARKET_MESSAGE}</p>}
    <Next v={v} next={4} back={2} label="Talk through my plan"/>
  </div>;
}

export function StepAduContact({v}:{v:AduPageView}) {
  return <div className="adu-contact-stage"><span data-service-area="adu-calculator" hidden/><LeadContactStep v={v} formId="adu-calculator" propertyAlreadyAsked title="Bring your plan to Darren."
    lead="Your project and numbers go with your request, so the conversation starts with your plan."
    caption="Darren will review your project, funding amount and home snapshot, then discuss financing options and lender terms. This request is not a loan application and does not confirm permits or feasibility."
    submitLabel="Send my project" onBack={()=>v.goStep(3)}/></div>;
}

export function AduRecap({v}:{v:AduPageView}) {
  return <div className="adu-stage adu-recap"><span className="adu-recap-check" aria-hidden="true"><Check/></span><h2 id="adu-step-heading" tabIndex={-1}>Your request has been received.</h2>
    <p className="adu-stage-intro">Your project and estimates have been saved. Darren will be in touch. Take the next step when you’re ready.</p>
    <div className="adu-recap-summary"><Row label="Project" value={v.purpose}/><Row label="Project cost" value={formatCurrency(v.cost)}/><Row label="Amount to finance" value={formatCurrency(v.fin)}/></div>
    <button type="button" className="design-primary" onClick={v.openBooking}>Book a Call <Arrow/></button>
  </div>;
}

function PlanningChecks() {
  return <section className="adu-planning-surface" aria-labelledby="adu-checks-title"><div className="adu-planning design-wrap"><div><h2 id="adu-checks-title">Two checks.<br/><em>One considered plan.</em></h2><p>A funding discussion and a project feasibility review answer different questions.</p></div>
    <ol className="adu-checks"><li><span className="adu-check-node" aria-hidden="true"/><div><h3>A financing conversation</h3><p>Darren reviews your borrowing profile, funding amount and loan terms.</p></div></li>
      <li><span className="adu-check-node" aria-hidden="true"/><div><h3>A project feasibility review</h3><p>Your local planning department and project professionals confirm zoning, permits, site conditions, costs and timing.</p><p className="adu-check-caption">Financing does not confirm the ADU can be built or rented.</p></div></li></ol></div>
  </section>;
}
const QUESTIONS=[
  ['Do I need an exact budget?','Use your current estimate to start. Include contingency, design, permits and utility work. Your project professionals can help refine the budget.'],
  ['What if my home is paid off?','Enter 0 for the mortgage balance. A paid-off home still needs the same property and financing review.'],
  ['Does this approve my project?','No. This is an educational funding snapshot. Loan approval and project feasibility are separate reviews.'],
  ['Do I have to choose a loan first?','No. Start with your project and your numbers. Darren can discuss a HELOC, a fixed home equity loan, cash-out refinancing or other construction financing paths with you.'],
];
const ADU_FAQ = { Planning:[QUESTIONS[0],QUESTIONS[2]], 'Your home':[QUESTIONS[1]], Financing:[QUESTIONS[3]] };

export default function AduPage({v,disclosure}:{v:AduPageView;overlays?:ReactNode;disclosure:ReactNode}) {
  const firstRender=useRef(true);
  useEffect(()=>{if(firstRender.current){firstRender.current=false;return;}document.getElementById('adu-step-heading')?.focus({preventScroll:true});},[v.step,v.submitted]);
  return <section className="dcp adu-revamp"><AduPageHero/>
    <section id="project" className="adu-workspace design-wrap" aria-label="Your project funding snapshot">
      <JourneyTimeline steps={STEPS} current={v.step} complete={v.submitted} disabled={v.sending} onStep={v.goStep}/>
      <div className="adu-work-area"><div className="adu-stage-state"><span>{v.submitted?'Request received':`${v.step} of 4`}</span></div>
        {v.errorMsg&&<div className="adu-inline-error" role="alert">{v.errorMsg}</div>}
        {v.submitted?<AduRecap v={v}/>:v.step===1?<StepAduProject v={v}/>:v.step===2?<StepAduHome v={v}/>:v.step===3?<StepAduSnapshot v={v}/>:<StepAduContact v={v}/>}</div>
    </section><PlanningChecks/>
    <div className="adu-faq-section"><MarketingFaq onOpenContact={v.openBooking} groups={ADU_FAQ} promptTitle="A project in mind?" promptDescription="Talk through the numbers and the possibilities with Darren."/></div>
    <section className="adu-disclosures design-wrap" aria-label="Important disclosures"><h2>Important disclosures</h2>{disclosure}</section>
  </section>;
}
