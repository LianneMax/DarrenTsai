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

// One savings claim for the whole site.
//
// WHY THIS IS A CONSTANT. The 26 Sep audit found three different numbers on the
// homepage at once: the hero card said $1,500–$3,000/mo, the sticky bar and the
// calculator's step 4 said $900–$1,500/mo, and the tool's own default result was
// $334/mo. A visitor who has just been shown $334 and is then told a call could
// free up $900–$1,500 has been given a reason to distrust the number they came
// for. Every hard-coded range on the marketing surfaces now reads from here, so
// they cannot drift apart again.
//
// The conservative range was kept. The figure itself still needs Saxton sign-off;
// change it in this one place when it lands.
export const SAVINGS_RANGE = "$900 – $1,500";
export const SAVINGS_RANGE_BASIS =
  "Typical range for the debt loads this calculator was built around. Your own figure is calculated below. Individual results will vary.";
