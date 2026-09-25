/**
 * The half of a lead submit that is the same on every form: post it, read the
 * status, and fire the two dataLayer events on success.
 *
 * WHY THIS IS A SEAM AND NOT A COMPONENT. The two React forms present failure
 * completely differently and should keep doing so: the contact modal keeps the
 * visitor on the form with the message against the email field, while the debt
 * calculator raises a modal. What they share is everything between the button
 * press and that decision, and that part is where the expensive mistakes live:
 *
 *  - The 422 branch is the only failure a visitor can fix. Every other status
 *    has already been emailed to Darren, which is why the generic copy tells
 *    them not to resubmit, and why a 422 must never reach it.
 *  - generate_lead is the single website form conversion Google Ads imports.
 *    It has to fire exactly once, after a confirmed save, never on a failure.
 *  - user_data stays nested. It is carried for internal use only and must not
 *    be flattened into GA4 event parameters.
 *
 * So the caller hands over a payload and gets back a decision, and keeps its own
 * rendering.
 */
import { LEAD_ENDPOINT } from '../config';
import { getAttribution, track } from '../utils/attribution';

/**
 * The fields every form supplies. The index signature carries the rest, which
 * differs per funnel (the calculator sends its debt rows, the modal its loan
 * terms) and is forwarded untouched.
 */
export type LeadPayload = {
  source: string;
  email: string;
  phone: string;
  firstName: string;
  lastName: string;
  state: string;
  [key: string]: unknown;
};

export type SubmitResult =
  /** Saved. The caller shows its success state. */
  | { ok: true }
  /**
   * The one failure the visitor can act on: the email domain has no mail
   * server and nothing was saved. The caller keeps them on the form.
   */
  | { ok: false; kind: 'fieldError'; field: string; message: string }
  /** Anything else. A rescue email has already gone out on a 502. */
  | { ok: false; kind: 'failed' };

export type LeadSubmitConfig = {
  /** Distinguishes the eight submit paths in GA4. */
  formId: string;
  thankYouPath: string;
  thankYouTitle: string;
};

export function useLeadSubmit({ formId, thankYouPath, thankYouTitle }: LeadSubmitConfig) {
  return async function submitLead(payload: LeadPayload): Promise<SubmitResult> {
    try {
      // Same-origin, so unlike the old no-cors post the status is readable and
      // a failure actually reaches the visitor instead of showing a checkmark.
      const res = await fetch(LEAD_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, ...getAttribution() }),
      });

      if (!res.ok) {
        if (res.status === 422) {
          const fix = await res.json().catch(() => null);
          if (fix && fix.field === 'email' && fix.message) {
            return { ok: false, kind: 'fieldError', field: 'email', message: String(fix.message) };
          }
        }
        throw new Error(`lead-endpoint-${res.status}`);
      }

      track('generate_lead', {
        lead_source: payload.source,
        form_id: formId,
        page_path: window.location.pathname,
        user_data: {
          email: payload.email,
          phone_number: payload.phone,
          address: { first_name: payload.firstName, last_name: payload.lastName, region: payload.state },
        },
      });
      track('virtual_page_view', {
        page_path: thankYouPath,
        page_title: thankYouTitle,
      });

      return { ok: true };
    } catch {
      return { ok: false, kind: 'failed' };
    }
  };
}
