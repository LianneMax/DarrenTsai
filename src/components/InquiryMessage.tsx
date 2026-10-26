import { INQUIRY_MESSAGE_LIMIT } from '../utils/serviceArea';

/** Plain text only; the writer also limits length and escapes Sheet formulas. */
export default function InquiryMessage({ id, value, onChange }: {
  id: string; value: string; onChange: (value: string) => void;
}) {
  return <div className="inquiry-message">
    <label className="input-label" htmlFor={id}>Anything you’d like Darren to know? <span>(optional)</span></label>
    <textarea id={id} className="form-input" rows={3} maxLength={INQUIRY_MESSAGE_LIMIT}
      value={value} onChange={e => onChange(e.target.value)} aria-describedby={`${id}-help`} />
    <p id={`${id}-help`} className="dcp-hint">Please leave out account numbers, Social Security numbers and other sensitive details. {value.length.toLocaleString()} / 2,000 characters.</p>
  </div>;
}
