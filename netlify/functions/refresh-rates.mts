// Scheduled function: refresh-rates
//
// Fetches the weekly PMMS rates from FRED and stores them, so /api/rates can
// answer a visitor instantly instead of waiting on an API whose time-to-first-
// byte was measured at 1.6s to 11.2s. See rates-shared.mts for the numbers.
//
// Hourly, not weekly, despite PMMS publishing once a week on Thursday. The
// point is not freshness, it is attempts: individual FRED calls fail often
// enough that one scheduled try per week would regularly leave the site a week
// behind. A failed run is a no-op — the previous value stays — so the cost of
// running often is nothing, and 24 tries a day makes a missed release
// effectively impossible.
//
// Netlify runs this on its own; no trigger to install and nothing to remember.

import type { Config } from "@netlify/functions";
import { refreshRates } from "./rates-shared.mts";

export default async () => {
  const key = Netlify.env.get("FRED_API_KEY");
  if (!key) {
    console.error("FRED_API_KEY is not set; rates cannot be refreshed");
    return;
  }

  const rates = await refreshRates(key);
  if (!rates) {
    // Deliberately not an alert. FRED being slow is routine, the stored value
    // is untouched, and the next run is an hour away.
    console.warn("rate refresh found nothing usable; keeping the stored rates");
    return;
  }
  console.log(`rates refreshed: 30yr ${rates.rate30}%, 15yr ${rates.rate15}%, as of ${rates.asOf}`);
};

export const config: Config = {
  schedule: "@hourly",
};
