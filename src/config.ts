// Lead submissions go through the Netlify function at /api/lead, which forwards
// them to Apps Script server-side. Same-origin, so the response status is
// readable — unlike the old direct `mode:'no-cors'` post to /exec, where a 500
// was indistinguishable from success. The Apps Script URL now lives only in the
// APPS_SCRIPT_WEBHOOK_URL server env var, not in the client bundle.
export const LEAD_ENDPOINT = "/api/lead";

// FRED API key — get a free key at https://fred.stlouisfed.org/docs/api/api_key.html
// Add to .env as VITE_FRED_API_KEY
export const FRED_API_KEY: string =
  import.meta.env.VITE_FRED_API_KEY ?? "";

export const PHONE = "(714) 887-5432";
export const EMAIL = "darren@realdarrentsai.com";
export const NMLS = "2438102";
export const DRE = "02103705";
export const COMPANY = "Saxton Mortgage";
export const COMPANY_NMLS = "1717191";
