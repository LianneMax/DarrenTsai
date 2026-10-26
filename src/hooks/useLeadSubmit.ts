import { serviceArea, SERVICE_AREA_VERSION, OUT_OF_MARKET_MESSAGE, isCaptureInquiry, propertyUses } from '../utils/serviceArea';
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
 *  - Actionable validation stays on the form. Unknown saves retain their
 *    submission identity for retry; the endpoint's rescue alerts go to Max.
 *  - generate_lead is the single website form conversion Google Ads imports.
 *    It has to fire exactly once, after a confirmed save, never on a failure.
 *  - user_data stays nested. It is carried for internal use only and must not
 *    be flattened into GA4 event parameters.
 *
 * So the caller hands over a payload and gets back a decision, and keeps its own
 * rendering.
 */
import { LEAD_ENDPOINT } from '../config';
import { getAttribution, track, milestone } from '../utils/attribution';
import { submitLeadRequest, claimLeadConversion, confirmedAttribution } from '../utils/leadRequest';

/** booking-chooser.js, when it is on the page. Absent in tests and on a cold load. */
type BookingWindow = Window & {
  DTBooking?: { identify?: (lead: { name?: string; email?: string }) => void };
};

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
  | { ok: true; disposition?: 'sheet-only' }
  /**
   * The one failure the visitor can act on: the email domain has no mail
   * server and nothing was saved. The caller keeps them on the form.
   */
  | { ok: false; kind: 'fieldError'; field: string; message: string }
  /** Anything else. Keep the uncertain request recoverable on the form. */
  | { ok: false; kind: 'failed' };

export type LeadSubmitConfig = {
  /** Distinguishes the eight submit paths in GA4. */
  formId: string;
  thankYouPath: string;
  thankYouTitle: string;
  /**
   * Attach user_data to generate_lead only once optional tracking is accepted,
   * normalised for the Google tag's user-provided data variable to hash
   * (DT.userData in public/attribution.js). /home-equity/ and the booking
   * prequal use this (15 Oct 2026); the older forms still carry the nested
   * user_data described in AGENTS.md.
   */
  consentGatedUserData?: boolean;
};

/** user_data from DT.userData, or nothing before consent or if the script is missing. */
function gatedUserData(payload: LeadPayload): Record<string, unknown> {
  try {
    const dt = (window as Window & { DT?: { userData?: (l: object) => unknown } }).DT;
    const ud = dt?.userData?.({ email: payload.email, phone: payload.phone, firstName: payload.firstName, lastName: payload.lastName, state: payload.state });
    return ud ? { user_data: ud } : {};
  } catch {
    return {};
  }
}

export function useLeadSubmit({ formId, thankYouPath, thankYouTitle, consentGatedUserData }: LeadSubmitConfig) {
  return async function submitLead(payload: LeadPayload): Promise<SubmitResult> {
    // A form that asks property use and state as its own steps (/home-equity/)
    // passes them in the payload; every other form has the shared select pair.
    const fromPayload = typeof payload.propertyUse === 'string' && typeof payload.propertyState === 'string';
    const screening = fromPayload || document.querySelector('[data-service-area="' + formId + '"]');
    const propertyUse = fromPayload ? String(payload.propertyUse) : document.querySelector<HTMLSelectElement>('[data-property-use="' + formId + '"]')?.value;
    const propertyState = fromPayload ? String(payload.propertyState) : document.querySelector<HTMLSelectElement>('[data-property-state="' + formId + '"]')?.value;
    const result = serviceArea(propertyUse, propertyState, String(payload.source || formId));
    const captureInquiry = isCaptureInquiry(formId, payload.source);
    const sheetOnly = captureInquiry && result === 'out-of-market' && propertyUses(payload.source).includes(String(propertyUse));
    if (screening && result !== 'supported' && !sheetOnly) {
      milestone('form_error', { form_id: formId, error_code: result === 'out-of-market' ? 'policy_exit' : 'validation', field_category: 'property' });
      const message = result === 'incomplete' ? 'Please choose the property use and state.' : OUT_OF_MARKET_MESSAGE;
      const status = screening instanceof Element ? screening.querySelector('[role="status"]') : null; if (status) status.textContent = message;
      return { ok: false, kind: 'fieldError', field: 'propertyState', message };
    }
    const acknowledgment = document.querySelector<HTMLInputElement>('input[data-privacy-form="' + formId + '"]');
    if ((captureInquiry && !acknowledgment) || (acknowledgment && !acknowledgment.checked)) {
      milestone('form_error', { form_id: formId, error_code: 'validation', field_category: 'consent' });
      acknowledgment?.reportValidity();
      return { ok: false, kind: 'fieldError', field: 'privacyAcknowledged', message: 'Please acknowledge the Privacy Policy and Terms to continue.' };
    }
    try {
      // Same-origin, so unlike the old no-cors post the status is readable and
      // a failure actually reaches the visitor instead of showing a checkmark.
      const res = await submitLeadRequest(formId, {
        // formId goes in the body as well as the GA4 event below, because
        // HubSpot's rdt_form_id is filled server-side from what arrives here.
          ...payload, ...getAttribution(), formId,
          aprEstimates: Array.from(document.querySelectorAll<HTMLElement>('.apr-estimate[data-apr-principal]')).filter(el => Number(el.dataset.aprPrincipal) > 0).map(el => ({ principal: Number(el.dataset.aprPrincipal), noteRate: Number(el.dataset.aprRate), termYears: Number(el.dataset.aprYears), upfrontFinanceCharges: Number(el.dataset.aprFees), estimatedApr: el.dataset.aprResult ? Number(el.dataset.aprResult) : null, estimateOnly: true })),
          ...(screening ? { propertyUse, propertyState, serviceAreaResult: result, serviceAreaVersion: SERVICE_AREA_VERSION } : {}),
          smsConsent: document.querySelector<HTMLInputElement>('input[data-sms-form="' + formId + '"]')?.checked === true,
          privacyAcknowledged: acknowledgment?.checked === true, privacyVersion: '2026-10-13-v1',
          smsInformationalConsent: document.querySelector<HTMLInputElement>('input[data-sms-info-form="' + formId + '"]')?.checked === true,
          smsMarketingConsent: document.querySelector<HTMLInputElement>('input[data-sms-form="' + formId + '"]')?.checked === true,
          smsInformationalConsentText: 'By checking this box, I am agreeing to receive transactional/informational text messages from Darren Tsai (Ren Marketing Group LLC) about my inquiry and appointments. Message frequency will vary. Msg & data rates may apply. Reply HELP for help or STOP to opt-out.',
          smsConsentVersion: '2026-10-15-v5', smsConsentText: 'By checking this box, I am agreeing to receive marketing text messages from Darren Tsai (Ren Marketing Group LLC), which may be sent using automated technology. Message frequency will vary. Msg & data rates may apply. Reply HELP for help or STOP to opt-out.',
          smsConsentAt: new Date().toISOString(),
      }, LEAD_ENDPOINT);

      if (!res.ok) {
        if (res.status === 422 || res.status === 409 || res.status === 429) {
          const fix = await res.json().catch(() => null);
          if (fix && fix.field && fix.message) {
            return { ok: false, kind: 'fieldError', field: fix.field, message: String(fix.message) };
          }
        }
        throw new Error(`lead-endpoint-${res.status}`);
      }

      // DTLead already requires a matching saved submission receipt. In addition,
      // both servers must agree on the disposition before an exit or calendar is
      // shown; an older writer must not silently admit an outside-area inquiry.
      if (captureInquiry) {
        const receipt = await res.clone().json();
        if ((receipt.disposition === 'sheet-only') !== sheetOnly) throw new Error('inquiry-disposition-mismatch');
        if (sheetOnly) return { ok: true, disposition: 'sheet-only' };
      }
      if (claimLeadConversion(formId, res)) {
      track('generate_lead', {
        lead_source: payload.source,
        form_id: formId,
        page_path: window.location.pathname,
        ...confirmedAttribution(formId, res),
        ...(consentGatedUserData ? gatedUserData(payload) : {
          user_data: {
            email: payload.email,
            phone_number: payload.phone,
            address: { first_name: payload.firstName, last_name: payload.lastName, region: payload.state },
          },
        }),
      });
      track('virtual_page_view', {
        page_path: thankYouPath,
        page_title: thankYouTitle,
      });
      }

      // Every success state offers "Book a Free Strategy Call" next. Someone who
      // has just typed their name and email into this form should not be asked
      // for both again by the calendar; that retype is where a booking gets
      // abandoned. Held in memory by booking-chooser.js for this page view only,
      // and only ever used to prefill the booking prequal and its calendar.
      try {
        const booking = (window as BookingWindow).DTBooking;
        if (booking && typeof booking.identify === 'function') {
          booking.identify({
            name: [payload.firstName, payload.lastName].filter(Boolean).join(' ').trim(),
            email: payload.email,
          });
        }
      } catch { /* a booking convenience must never fail a saved lead */ }

      return { ok: true };
    } catch {
      return { ok: false, kind: 'failed' };
    }
  };
}
