// Netlify Function: rates
//
// Current mortgage rates for the calculators. Reads only — the slow FRED call
// happens on a schedule in refresh-rates.mts. See rates-shared.mts for why.
//
// WHY THIS EXISTS AT ALL. The calculators used to call api.stlouisfed.org
// straight from the browser, which can never work: FRED sends no
// Access-Control-Allow-Origin header, so the request is blocked by CORS. On the
// homepage it did not even get that far — the key came from VITE_FRED_API_KEY,
// never set in Netlify, so the fetch was skipped and the visitor was shown
// hardcoded 6.41% / 6.01% fallbacks plus the literal words "add
// VITE_FRED_API_KEY for live updates". Going through the server fixes CORS and
// takes the key out of the client bundle at the same time.
//
// HOW IT STAYS CURRENT WITHOUT A DEPLOY. Nothing is baked into the bundle. The
// pages fetch this endpoint on load and the scheduled refresher keeps the store
// up to date, so a new weekly PMMS release reaches the site on its own.
//
// SETUP: Netlify → Site settings → Environment variables:
//   FRED_API_KEY = <free key from fred.stlouisfed.org/docs/api/api_key.html>
//     Deliberately NOT prefixed VITE_ — that prefix is what puts a value in the
//     client bundle, which is how the old key ended up visible.

import type { Config, Context } from "@netlify/functions";
import { RATE_SOURCE_LABEL, readRates, refreshRates } from "./rates-shared.mts";

/**
 * How long a response is reused. PMMS publishes once a week, so six hours is
 * already far fresher than the data. `stale-while-revalidate` means a visitor
 * never waits on a refresh: the CDN serves the last good value and updates
 * behind them.
 */
const CACHE_SECONDS = 6 * 60 * 60;
const STALE_SECONDS = 7 * 24 * 60 * 60;

export default async (_req: Request, _context: Context) => {
  let rates = await readRates();

  // Cold start: the store is empty because the scheduled refresher has not run
  // yet (a brand new deploy, or a new deploy context with its own store). Try
  // once inline so the site is not showing static rates until the next hour.
  // This is the one path that can be slow, and only until it succeeds once.
  if (!rates) {
    const key = Netlify.env.get("FRED_API_KEY");
    if (!key) {
      console.error("FRED_API_KEY is not set; the calculators will show static rates");
      return json(503, { error: "rates not configured" }, 0);
    }
    rates = await refreshRates(key);
  }

  if (!rates) return json(502, { error: "rates unavailable" }, 0);

  return json(
    200,
    {
      rate30: rates.rate30,
      rate15: rates.rate15,
      asOf: rates.asOf,
      source: RATE_SOURCE_LABEL,
    },
    CACHE_SECONDS,
  );
};

function json(status: number, body: unknown, cacheSeconds: number) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (cacheSeconds > 0) {
    const value = `public, max-age=${cacheSeconds}, stale-while-revalidate=${STALE_SECONDS}`;
    headers["cache-control"] = value;
    // Netlify's CDN reads its own header, so one origin call serves everyone
    // rather than one per visitor.
    headers["netlify-cdn-cache-control"] = value;
  } else {
    headers["cache-control"] = "no-store";
  }
  return new Response(JSON.stringify(body), { status, headers });
}

export const config: Config = {
  path: "/api/rates",
};
