import type { MortgageInputs } from '../types/mortgage';
import LeadForm from './LeadForm';

interface Props {
  currentInputs: MortgageInputs;
  onClose: () => void;
}

// Lifted out of App.tsx unchanged so the homepage and the mortgage calculator
// page open the identical modal rather than drifting apart.
export default function ContactModal({ currentInputs, onClose }: Props) {
  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      onClick={onClose}
    >
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 id="modal-title" className="modal-title">Want Darren to Review Your Numbers?</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
        <div className="modal-body">
          <p className="modal-sub">
            No credit pull. No pressure. Just your real numbers, reviewed by a licensed pro.
          </p>
          <LeadForm currentInputs={currentInputs} onClose={onClose} />
        </div>
      </div>
    </div>
  );
}
