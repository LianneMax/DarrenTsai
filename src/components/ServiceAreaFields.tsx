import { useState } from 'react';
import { PROPERTY_STATES, PROPERTY_STATE_LABELS, propertyUses, serviceArea, OUT_OF_MARKET_MESSAGE } from '../utils/serviceArea';

export default function ServiceAreaFields({ formId, onStateChange }: { formId: string; onStateChange?: (state: string) => void }) {
  const [use, setUse] = useState('');
  const [state, setState] = useState('');
  const result = serviceArea(use, state, formId);
  return <fieldset className="compliance-disclosure" data-service-area={formId}>
    <legend>Where is the property?</legend>
    <label className="input-label" htmlFor={`${formId}-property-use`}>Property use</label>
    <select className="input-field" id={`${formId}-property-use`} data-property-use={formId} value={use} onChange={e => setUse(e.target.value)} required>
      <option value="">Choose property use</option>{propertyUses(formId).includes('primary') && <option value="primary">Primary home / owner-occupied</option>}{propertyUses(formId).includes('investment') && <option value="investment">Investment / rental</option>}
    </select>
    <label className="input-label" htmlFor={`${formId}-property-state`}>Property state (not your current residence)</label>
    <select className="input-field" id={`${formId}-property-state`} data-property-state={formId} value={state} onChange={e => { setState(e.target.value); onStateChange?.(e.target.value); }} required>
      <option value="">Choose property state</option>{PROPERTY_STATES.map(s => <option key={s} value={s}>{PROPERTY_STATE_LABELS[s]}</option>)}
    </select>
    <p role="status" className={result === 'out-of-market' ? 'service-area-warning' : undefined}>{result === 'out-of-market' ? OUT_OF_MARKET_MESSAGE : 'This checks service area only, not loan approval.'}</p>
  </fieldset>;
}
