export const GOOGLE_SHEET_WEBHOOK_URL: string =
  import.meta.env.VITE_GOOGLE_SHEET_WEBHOOK_URL ?? "";

// Paste your Zapier Catch Hook URL into .env as VITE_ZAPIER_WEBHOOK_URL
export const ZAPIER_WEBHOOK_URL: string =
  import.meta.env.VITE_ZAPIER_WEBHOOK_URL ?? "";

// FRED API key — get a free key at https://fred.stlouisfed.org/docs/api/api_key.html
// Add to .env as VITE_FRED_API_KEY
export const FRED_API_KEY: string =
  import.meta.env.VITE_FRED_API_KEY ?? "";

// Home-value estimate (RentCast AVM). Point this at a SERVER-SIDE proxy that
// holds the RentCast key — never expose the raw key in the client bundle.
// The proxy should accept ?address=... and return RentCast's /avm/value JSON.
// Add to .env as VITE_HOME_VALUE_PROXY_URL
export const HOME_VALUE_PROXY_URL: string =
  import.meta.env.VITE_HOME_VALUE_PROXY_URL ?? "";

export const SITE_NAME = "Darren Tsai";
export const PHONE = "(714) 887-5432";
export const EMAIL = "darren@realdarrentsai.com";
export const NMLS = "2438102";
export const DRE = "02103705";
export const COMPANY = "Saxton Mortgage";
export const COMPANY_NMLS = "1717191";
