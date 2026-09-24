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
