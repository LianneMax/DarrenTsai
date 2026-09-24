// Shared between the /api/rates reader and the scheduled refresher.
//
// WHY THE FETCH IS NOT DONE PER REQUEST. FRED is slow and wildly inconsistent.
// Measured from production on 24 Sep 2026, five consecutive calls to
// MORTGAGE30US: 11.2s, 11.0s, 1.6s, 5.9s, 10.7s time-to-first-byte. Connect
// time was 0.03s every time, so this is FRED's own response latency, not the
// network. Netlify kills a synchronous function at 10 seconds, so a naive
// "fetch FRED when a visitor asks" endpoint fails more often than it succeeds
// — and each failure means a visitor sees the static fallback rates.
//
// So the slow, unreliable half runs on a schedule (refresh-rates.mts) and
// writes to a Netlify Blobs store. The half a visitor waits on (rates.mts)
// only reads that store, which is fast and cannot fail upstream. A refresh
// that times out changes nothing: the last good value stays, and the next run
// an hour later tries again. PMMS only publishes weekly, so losing a run costs
// nothing at all.

import { getStore } from "@netlify/blobs";

export const RATES_STORE = "rates";
export const RATES_KEY = "pmms";

/** The one true description of these numbers. Client captions must match it. */
export const RATE_SOURCE_LABEL = "Freddie Mac PMMS via FRED, weekly average";

const FRED_BASE = "https://api.stlouisfed.org/fred/series/observations";

/**
 * Generous, because this runs on a schedule where nobody is waiting. The 10s
 * synchronous cap does not apply to the reader, which is what a visitor hits.
 */
const FRED_TIMEOUT_MS = 25_000;

export type StoredRates = {
  rate30: number;
  rate15: number | null;
  asOf: string;
  /** When we last successfully read this from FRED, not when PMMS published. */
  fetchedAt: string;
};

type Observation = { date: string; value: string };

/**
 * One series' latest usable observation, or null.
 *
 * FRED publishes "." for a period with no value, which parses as NaN and would
 * render as "NaN%". The plausibility bounds catch the other version of the same
 * problem: a format change on FRED's side that parses to a number but is not a
 * rate. Showing the static fallback beats showing either.
 */
export async function fetchSeries(
  seriesId: string,
  key: string,
): Promise<{ value: number; date: string } | null> {
  const url =
    `${FRED_BASE}?series_id=${encodeURIComponent(seriesId)}` +
    `&api_key=${encodeURIComponent(key)}&limit=1&sort_order=desc&file_type=json`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(FRED_TIMEOUT_MS) });
    if (!res.ok) {
      console.error(`FRED ${seriesId} returned HTTP ${res.status}`);
      return null;
    }
    const json = (await res.json()) as { observations?: Observation[] };
    const obs = json?.observations?.[0];
    if (!obs || obs.value === ".") return null;
    const value = Number.parseFloat(obs.value);
    if (!Number.isFinite(value) || value <= 0.5 || value >= 30) {
      console.error(`FRED ${seriesId} returned an unusable rate: ${obs.value}`);
      return null;
    }
    return { value, date: obs.date };
  } catch (err) {
    console.error(`FRED ${seriesId} fetch failed`, err);
    return null;
  }
}

/**
 * Fetch both series and store them, if the 30-year came back. Returns what was
 * stored, or null when nothing usable arrived — in which case the caller must
 * leave whatever is already in the store alone.
 */
export async function refreshRates(key: string): Promise<StoredRates | null> {
  const [r30, r15] = await Promise.all([
    fetchSeries("MORTGAGE30US", key),
    fetchSeries("MORTGAGE15US", key),
  ]);

  // The 30-year drives every headline number on both calculators, so without it
  // there is nothing worth storing. A missing 15-year is survivable: the client
  // keeps its own fallback for that one.
  if (!r30) return null;

  const stored: StoredRates = {
    rate30: r30.value,
    rate15: r15?.value ?? null,
    asOf: r30.date,
    fetchedAt: new Date().toISOString(),
  };

  // A store that will not accept the write must not lose the rates we just
  // fetched: the caller can still serve them, it just cannot skip the fetch
  // next time. This is the whole difference between "rates are slow" and "rates
  // are down" when Blobs is misconfigured — and it is what local `netlify dev`
  // looks like before `netlify link`, where Blobs has no siteID or token.
  try {
    await getStore(RATES_STORE).setJSON(RATES_KEY, stored);
  } catch (err) {
    console.error("storing the rates failed; serving them anyway", err);
  }
  return stored;
}

/**
 * How old a stored value may be before a reader tries to refresh it itself.
 *
 * PMMS publishes Thursday mornings, so a value more than a few hours old is
 * usually still correct. This is not about freshness, it is about not depending
 * on the scheduled function being healthy: if refresh-rates is delayed, failing
 * or never ran, nothing else would ever update the store and the site would
 * serve one week's rates indefinitely. That happened on the first deploy.
 */
export const STALE_AFTER_MS = 3 * 60 * 60 * 1000;

export function isStale(rates: StoredRates, now = Date.now()): boolean {
  const fetched = Date.parse(rates.fetchedAt);
  return isNaN(fetched) || now - fetched > STALE_AFTER_MS;
}

/** The last stored rates, or null if the store has never been written. */
export async function readRates(): Promise<StoredRates | null> {
  try {
    return (await getStore(RATES_STORE).get(RATES_KEY, { type: "json" })) as StoredRates | null;
  } catch (err) {
    console.error("reading the rates store failed", err);
    return null;
  }
}
