import { useEffect } from 'react';

function MoneyIcon() {
  return <svg viewBox="0 0 32 24" aria-hidden="true"><rect x="2" y="3" width="28" height="18" rx="3" /><circle cx="16" cy="12" r="4" /><path d="M6 7h2M24 17h2M6 17h2M24 7h2" /></svg>;
}

const GOALS = [
  { label: 'Renovation', icon: <><path d="m3 11 9-8 9 8M5 10v11h14V10M10 21v-7h4v7" /></> },
  { label: 'Pay off debt', icon: <><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 7h6M9 11h6m-6 5 2 2 4-4" /></> },
  { label: 'Other goals', icon: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></> },
];

/** Concept only: the actual calculator remains empty until the visitor answers. */
export default function EquityPropertyStory() {
  useEffect(() => { document.dispatchEvent(new Event('dt:property-story-mounted')); }, []);
  return <figure className="property-story property-story-equity" data-house-story="equity">
    <div className="property-story-stage">
      <img src="/property-scenes/home-equity.webp" width="840" height="840" alt="Illustrative cream craftsman home with a timber porch and slate roof" />
      <span className="property-story-value">Your home’s value</span>
      <button type="button" className="property-story-toggle" data-early="equity-illustration-toggle" aria-label="Pause home equity illustration" hidden>
        <svg className="story-pause" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6v12M15 6v12" /></svg>
        <svg className="story-play" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 10 7-10 7Z" /></svg>
      </button>
    </div>
    <div className="property-story-value-bar" aria-label="A conceptual split between mortgage balance and equity, not your personal estimate"><span>Mortgage balance</span><strong>Equity</strong></div>
    <div className="equity-routing" aria-hidden="true">
      <svg className="equity-routing-lines" viewBox="0 0 360 70" preserveAspectRatio="none"><path d="M270 0V22H60V70M180 22V70M270 22H300V70" /></svg>
      {GOALS.map((goal, i) => <span key={goal.label} className={`equity-transfer equity-transfer-${i} story-motion`}><MoneyIcon /></span>)}
    </div>
    <ul className="equity-goal-examples" aria-label="Example goals to discuss with Darren">
      {GOALS.map((goal, i) => <li key={goal.label}><span className={`equity-goal-emblem equity-goal-${i} story-motion`}><svg viewBox="0 0 24 24" aria-hidden="true">{goal.icon}</svg></span><span>{goal.label}</span></li>)}
    </ul>
    <figcaption>Home value minus mortgage balance is equity.<br />Illustration only. Not all equity is available to borrow.</figcaption>
  </figure>;
}
