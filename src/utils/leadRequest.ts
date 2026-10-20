import '../../public/lead-request.js';

/** The same runtime is loaded as a classic script by the static landing pages. */
export function submitLeadRequest(formId: string, payload: object, endpoint?: string): Promise<Response> {
  if (!window.DTLead) return Promise.reject(new Error('Submission recovery could not load. Please refresh before sending.'));
  return window.DTLead.submit(formId, payload, endpoint);
}

export function claimLeadConversion(formId: string, response: Response): boolean {
  return window.DTLead?.claimConversion(formId, response) === true;
}

export function confirmedAttribution(formId: string, response: Response): Record<string, string> {
  return window.DTLead?.attribution(formId, response) ?? {};
}
