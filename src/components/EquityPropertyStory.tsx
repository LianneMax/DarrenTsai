import { useEffect } from 'react';
import { GOALS } from './equityGoals';

function MoneyIcon() {
  return <svg viewBox="0 0 32 24" aria-hidden="true"><rect x="2" y="3" width="28" height="18" rx="3" /><circle cx="16" cy="12" r="4" /><path d="M6 7h2M24 17h2M6 17h2M24 7h2" /></svg>;
}

/**
 * Concept only: the actual calculator remains empty until the visitor answers.
 * No pause/play button (Max, 20 Oct): property-stories.js still stops the
 * motion offscreen, in a hidden tab and under prefers-reduced-motion.
 */
export default function EquityPropertyStory() {
  useEffect(() => { document.dispatchEvent(new Event('dt:property-story-mounted')); }, []);
  return <figure className="property-story property-story-equity" data-house-story="equity">
    <div className="property-story-stage">
      <img src="/property-scenes/home-equity.webp" width="840" height="840" alt="Illustrative cream craftsman home with a timber porch and slate roof" />
      <span className="property-story-value">Your home’s value</span>
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
