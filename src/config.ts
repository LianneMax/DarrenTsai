// Lead submissions go through the Netlify function at /api/lead, which forwards
// them to Apps Script server-side. Same-origin, so the response status is
// readable — unlike the old direct `mode:'no-cors'` post to /exec, where a 500
// was indistinguishable from success. The Apps Script URL now lives only in the
// APPS_SCRIPT_WEBHOOK_URL server env var, not in the client bundle.
export const LEAD_ENDPOINT = "/api/lead";

// Current mortgage rates come from the /api/rates Netlify function, not from a
// browser call to FRED. FRED sends no CORS headers, so a direct call is blocked
// in every browser — and the key it needed used to be VITE_-prefixed, which put
// it in this bundle. The key now lives only in the FRED_API_KEY server env var.
export const RATES_ENDPOINT = "/api/rates";

export const PHONE = "(714) 887-5432";
export const EMAIL = "darren@realdarrentsai.com";
export const NMLS = "2438102";
export const DRE = "02103705";
export const COMPANY = "Saxton Mortgage";
export const COMPANY_NMLS = "1717191";

// The eight states Darren is licensed in.
//
// The forms accept every state and always will: an out-of-area lead is still
// worth having, Apps Script tags it `unlicensed-state` in Bonzo, and Darren
// refers it. What was missing was telling the visitor. Someone in New York
// filled in seven fields, got a green checkmark, and found out later, which is
// a worse first impression than a sentence would have been.
export const LICENSED_STATES = ['AZ', 'CA', 'FL', 'HI', 'OR', 'PA', 'TN', 'TX'] as const;

export function isLicensedState(abbr: string): boolean {
  return (LICENSED_STATES as readonly string[]).indexOf(String(abbr || '').trim().toUpperCase()) !== -1;
}
