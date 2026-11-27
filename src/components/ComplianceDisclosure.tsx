/**
 * Consent block for every React lead form. Wording and data attributes are
 * fixed (10DLC review); only the layout moved on 28 Nov 2026 (Max approved the
 * preview): the two optional text choices and their disclosure sit together in
 * one box, then the required privacy acknowledgement on its own right above the
 * send button. No "Text messages (optional)" heading: it was removed on purpose.
 */
export default function ComplianceDisclosure({ formId }: { formId: string }) {
  return (
    <div className="compliance-disclosure">
      <div className="sms-group">
        <label className="sms-choice"><input type="checkbox" data-sms-info-form={formId} /> <span>I agree to receive texts from Darren Tsai (Ren Marketing Group LLC) about my inquiry and appointments.</span></label>
        <label className="sms-choice"><input type="checkbox" data-sms-form={formId} /> <span>I agree to receive marketing texts from Darren Tsai (Ren Marketing Group LLC), which may be sent using automated technology.</span></label>
        <p className="sms-details">Optional, and not a condition of purchase or of submitting this form. Message frequency varies. Msg &amp; data rates may apply. Reply HELP for help or STOP to opt out. <a href="/privacy-policy" target="_blank" rel="noopener noreferrer">SMS Privacy Policy</a> | <a href="/legal" target="_blank" rel="noopener noreferrer">Terms</a></p>
      </div>
      <div className="privacy-ack">
        <label className="sms-choice"><input type="checkbox" required data-privacy-form={formId} /> <span>I acknowledge the <a href="/privacy-policy" target="_blank" rel="noopener noreferrer">Privacy Policy</a> and <a href="/legal" target="_blank" rel="noopener noreferrer">Terms &amp; Legal Disclosures</a>. (Required)</span></label>
      </div>
    </div>
  );
}

/** What Darren will use to reach the visitor, on the last step. Edit goes back
 * to the details step, which keeps every answer. Built from the same label and
 * value rows as the saved-answers recap, so the two screens match (28 Nov 2026). */
export function ContactSummary({ name, email, phone, onEdit }: { name: string; email: string; phone: string; onEdit: () => void }) {
  const rows = [['Name', name], ['Email', email], ['Phone', phone]]
    .map(([label, value]) => [label, value.trim()])
    .filter(([, value]) => value);
  return (
    <div className="dcp-recap-rows contact-summary">
      <div className="contact-summary-head">
        <strong>Darren will contact you at</strong>
        <button type="button" className="contact-summary-edit" onClick={onEdit} aria-label="Edit your contact details">Edit</button>
      </div>
      {rows.map(([label, value]) => (
        <div className="dcp-row" key={label}><span>{label}</span><span>{value}</span></div>
      ))}
    </div>
  );
}
