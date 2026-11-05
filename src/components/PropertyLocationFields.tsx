import { useEffect } from 'react';
import { type useZipLookup } from '../hooks/useZipLookup';
import { PROPERTY_STATES, PROPERTY_STATE_LABELS } from '../utils/serviceArea';
import ZipFeedback from './ZipFeedback';

/**
 * The property ZIP and state, shared by /home-equity/ and the payoff
 * comparison (6 Nov 2026, Max: "copy home equity for the payoff").
 *
 * The ZIP proposes the state from the local lookup and the visitor can still
 * correct it. The parent calls useZipLookup and passes the result in, so it
 * can hold its Continue button until the ZIP is found or confirmed.
 */
export function PropertyZipState({ idPrefix, zip, setZip, propertyState, setPropertyState, check }: {
  idPrefix: string;
  zip: string; setZip: (v: string) => void;
  propertyState: string; setPropertyState: (v: string) => void;
  check: ReturnType<typeof useZipLookup>;
}) {
  const zipDone = /^\d{5}$/.test(zip);
  const { status, state: zipState, needsConfirmation } = check;
  useEffect(() => {
    if (status === 'found') setPropertyState(zipState || '');
    else if (needsConfirmation || status === 'invalid') setPropertyState('');
  }, [status, zipState, needsConfirmation, setPropertyState]);
  const feedbackId = `${idPrefix}-zip-feedback`;
  return (
    <>
      <div className="dcp-grid-2">
        <div>
          <label className="input-label" htmlFor={`${idPrefix}-zip`}>ZIP of the home you&apos;re borrowing against</label>
          <input id={`${idPrefix}-zip`} className="form-input" inputMode="numeric" autoComplete="postal-code"
            maxLength={5} placeholder="e.g. 92646" value={zip} aria-describedby={feedbackId} aria-invalid={status === 'invalid'}
            onChange={(e) => setZip(e.target.value.replace(/\D/g, '').slice(0, 5))} />
          <ZipFeedback check={check} id={feedbackId} />
        </div>
        {(zipDone || propertyState) && (
          <div>
            <label className="input-label" htmlFor={`${idPrefix}-state`}>State of the home you&apos;re borrowing against</label>
            <select id={`${idPrefix}-state`} className="form-input" value={propertyState}
              onChange={(e) => {
                const state = e.target.value;
                // A state has many ZIPs. Never invent one when the visitor
                // corrects the state; clear the old known/pending ZIP instead.
                if (state !== propertyState && zip && !needsConfirmation) setZip('');
                setPropertyState(state);
              }}>
              <option value="">Choose the property state</option>
              {PROPERTY_STATES.map((s) => <option key={s} value={s}>{PROPERTY_STATE_LABELS[s]}</option>)}
            </select>
          </div>
        )}
      </div>
      <p className="dcp-hint">The ZIP checks that Darren lends in that area. It is not an address or eligibility check, and where you use the cash doesn&apos;t matter.</p>
    </>
  );
}

/** Tap-to-choose buttons; tapping the chosen one again clears it. */
export function Choices({ options, value, onChange, label }: {
  options: ReadonlyArray<readonly [string, string]>; value: string; onChange: (v: string) => void; label: string;
}) {
  return (
    <div className="dcp-chips" role="group" aria-label={label}>
      {options.map(([v, text]) => (
        <button key={v} type="button" className="dcp-chip" aria-pressed={value === v}
          onClick={() => onChange(value === v ? '' : v)}>
          {text}
        </button>
      ))}
    </div>
  );
}
