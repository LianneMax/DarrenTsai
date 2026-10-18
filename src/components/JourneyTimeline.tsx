import type { CSSProperties } from 'react';
import { Check } from './PageParts';
import './journey-timeline.css';

export default function JourneyTimeline({steps,current,complete=false,disabled=false,onStep}:{steps:readonly (readonly [string,string])[];current:number;complete?:boolean;disabled?:boolean;onStep:(step:number)=>void}) {
  return <aside className="journey-progress" aria-label="Project progress" style={{'--journey-count':steps.length} as CSSProperties}>
    <ol>{steps.map(([title,note],i)=><li key={title} className={complete||current>i+1?'complete':current===i+1?'current':''}>
      <button type="button" onClick={()=>onStep(i+1)} aria-current={!complete&&current===i+1?'step':undefined} disabled={disabled||complete}>
        <span className="journey-node" aria-hidden="true">{complete||current>i+1?<Check/>:i+1}</span><span><strong>{title}</strong><small>{note}</small></span>
      </button></li>)}</ol>
    <div className="journey-guide"><img src="/darren-96.webp" alt="Darren Tsai" width="40" height="40"/><p>Start with your numbers.<br/><strong>Talk it through with Darren.</strong></p></div>
  </aside>;
}
