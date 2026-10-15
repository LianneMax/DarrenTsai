import { useState } from 'react';
import { PROPERTY_STATES, PROPERTY_STATE_LABELS, propertyUses, serviceArea, serviceAreaWording, OUT_OF_MARKET_MESSAGE } from '../utils/serviceArea';

/**
 * The shared property question. Worded for the loan the form is about
 * (policy v3): on the equity pages it asks about the home being borrowed
 * against, since that is the state that matters; where the cash goes is not
 * asked. A form with one allowed use answers it itself.
 */
export default function ServiceAreaFields({ formId, onStateChange }: { formId: string; onStateChange?: (state: string) => void }) {
  const uses = propertyUses(formId);
  const [use, setUse] = useState(uses.length === 1 ? uses[0] : '');
  const [state, setState] = useState('');
  const result = serviceArea(use, state, formId);
  const w = serviceAreaWording(formId);
  return <fieldset className="compliance-disclosure" data-service-area={formId}>
    <legend>{w.legend}</legend>
    <label className="input-label" htmlFor={`${formId}-property-use`}>{w.use}</label>
    <select className="input-field" id={`${formId}-property-use`} data-property-use={formId} value={use} onChange={e => setUse(e.target.value)} required>
      <option value="">Choose one</option>{uses.includes('primary') && <option value="primary">Primary home</option>}{uses.includes('second-home') && <option value="second-home">Second home</option>}{uses.includes('investment') && <option value="investment">Rental / investment</option>}
    </select>
    <label className="input-label" htmlFor={`${formId}-property-state`}>{w.state}</label>
    <select className="input-field" id={`${formId}-property-state`} data-property-state={formId} value={state} onChange={e => { setState(e.target.value); onStateChange?.(e.target.value); }} required>
      <option value="">Choose the state</option>{PROPERTY_STATES.map(s => <option key={s} value={s}>{PROPERTY_STATE_LABELS[s]}</option>)}
    </select>
    <p role="status" className={result === 'out-of-market' ? 'service-area-warning' : undefined}>{result === 'out-of-market' ? OUT_OF_MARKET_MESSAGE : 'This checks service area only, not loan approval.'}</p>
  </fieldset>;
}
