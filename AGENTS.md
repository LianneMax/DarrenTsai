# AGENTS.md

Guidance for Codex working in this repository.

## What this is

`realdarrentsai.com` is a lead-generation site for Darren Tsai (NMLS #2438102,
DRE #02103705), a mortgage and real-estate broker at Saxton Mortgage, licensed in
AZ, CA, FL, HI, OR, PA, TN and TX.

The product is the lead. Every calculator, guide and landing page exists to get a
qualified borrower into the CRM with their attribution intact. Losing a lead
silently is the worst outcome in this codebase, and most of the architecture here
is a response to a specific way that happened once.

## Goal

Keep the working lead flow intact while making attribution and lead-quality
reporting reliable across Google Ads, GA4, CallRail, Bonzo and (eventually)
HubSpot.

## The lead flow

```
Visitor (paid click / YouTube link / organic)
  -> public/attribution.js captures UTMs + click IDs into localStorage
  -> a form posts to /api/lead  (netlify/functions/lead.mts)
  -> Apps Script web app  (google-apps-script.js)
     -> writes the row to the Google Sheet, replies {success:true}   [fast path]
     -> enqueues a Follow-ups row
  -> processFollowUps(), every minute
     -> pushes the prospect to Bonzo (once)
     -> calls the matching Netlify guide function, which emails via Resend
  -> GA4 generate_lead / phone_click via GTM; CallRail owns paid calls
```

Eight submit paths feed `/api/lead`: two React forms, three static landing-page
magnet forms, and three copies of the contact modal.

## Tech stack

| Layer | Choice |
| --- | --- |
| Frontend | React 18 + TypeScript, Vite 6, plain CSS (`src/index.css`, ~2200 lines, CSS custom properties on `:root`) |
| Routing | None. Two HTML entries (`index.html`, `mortgage-calculator/index.html`). Netlify serves a real 404 for anything else |
| Landing pages | Hand-written static HTML in `public/dscr/`, `public/fha/`, `public/realestateinvesting/`. No build step, ~2000 lines each, inline `<script>` |
| Server | Netlify Functions (`.mts`, `Netlify.env.get`), routes declared via `export const config.path` |
| Storage of record | Google Sheet `1DZ98FIyaF8hYi-c3FPMLVF71dVVnJWyejg4_J2ZkepI`, driven by `google-apps-script.js` |
| CRM | Bonzo v3 API (`app.getbonzo.com/api/v3`), campaign-routed per source |
| Email | Resend, from `darren@realdarrentsai.com` |
| Rates | FRED (Freddie Mac PMMS), cached in Netlify Blobs, refreshed hourly |
| Tests | Vitest + jsdom, 12 files / 440 tests, all passing |
| Validation | zod, libphonenumber-js |
| PDF | pdf-lib at runtime; reportlab (`scripts/build_dscr_pdf.py`) to build the static template |

## Commands

```bash
npm run dev      # vite only; /api/* proxies to :8888 and 404s without netlify dev
netlify dev      # what you actually want: functions + vite together
npm run build    # tsc -b && vite build
npm test         # vitest run (440 tests)
npm run lint     # eslint . (clean)
npm run images   # regenerate favicon/avatar derivatives from public/darren.jpg
```

`eslint.config.js` is a flat config with one block per runtime, because the repo
holds six kinds of JavaScript and a single blanket config reports the wrong
globals as undefined in five of them. `google-apps-script.js` and `public/*.js`
are deliberately linted rather than ignored: they are the only files with no
compiler in front of them. Two conventions are encoded there rather than
enforced by hand: a leading underscore means "required by the signature,
deliberately unused", and an unused `catch` binding is intended, because much of
the error handling exists purely to swallow a failure that must not break a lead
submit.

## Analytics and attribution strategy

The full account-level state lives in `SESSION_HANDOFF_PRIVATE.md`, which is
gitignored. Read it before touching anything tracking-related. The rules that
constrain code:

- **One tag deployment path: GTM** (`GTM-N7Z8Q4QF`), loaded by
  `public/attribution.js`. Never add a second GTM snippet, a raw `gtag` install,
  or the `AW-18451324434` Ads snippet from the onboarding material.
- **Conversion ownership is split and must not be duplicated.** GA4
  `generate_lead` is the only website form conversion for Google Ads. CallRail
  owns paid phone calls (website pool, >60s filter). GA4 `phone_click` stays an
  observation event, never imported as a conversion.
- **No PII into GA4.** The `generate_lead` dataLayer payload carries nested
  `user_data` for internal use. Do not map names, emails, phones or messages into
  GA4 event parameters.
- **First touch is kept for 90 days** (Google's gclid lookback), last touch for
  30. A direct or internal-referrer pageview must never overwrite a stored ad
  click; that bug is the usual cause of "Ads reports conversions but the Sheet
  has no gclids". `readTouch()` returns null when there is no signal, on purpose.
- **Credit is attributed to one touch.** When a lead falls back to a first-touch
  click id, its source and campaign tags must come from that same first touch
  (`effectiveTouch()`), or a paid lead gets tagged with two origins at once.
- **`attr:none` is tagged deliberately** so a break in tracking looks different
  from a quiet week.
- **HELOC and home equity have no page of their own.** That intent is served by
  the debt-consolidation funnel on the homepage, which tags its leads
  `HELOC/cash-out interest` in Bonzo, and `/yt/heloc` and `/yt/equity` point
  there. The old `heloc-hei` Apps Script route was removed because no form sent
  it. If a dedicated page ships, add its schema alongside its form rather than
  reviving the dead route.
- The `/yt/*` redirects in `netlify.toml` are `302` on purpose: a `301` is cached
  permanently, so the destination could never be changed afterwards. One link per
  bucket plus a `-c` variant, so a description click and a pinned-comment click
  are distinguishable via `utm_content`.

## Conventions this codebase actually follows

**Comments explain why, at length.** Most non-obvious code carries a block
comment naming the failure it prevents, often with a date and measured numbers
(FRED latency, timeout budgets, verified Bonzo API behaviour). Match this. A
change that removes a guard should say why the guard is no longer needed; a
change that adds one should say what went wrong without it.

**Sheet columns are append-only.** New headers go at the *end* of a header array
and the end of the matching row builder, never inserted mid-array.
`ensureHeaders()` only writes past the sheet's current last column and never
rewrites an existing header cell. Inserting a column shifts the meaning of every
historical row to its right, with no way to tell old rows from new. This is why
`Licensed?` sits in an odd place on the Debt Consolidation tab; leave it there.

**Fail open on uncertainty, fail loudly on certainty.** The DNS email check
refuses a lead only on a definitive NXDOMAIN; a timeout or SERVFAIL lets it
through. A failed Bonzo push alerts but does not fail the Sheet write. A failed
rates refresh is a no-op that keeps the last good value.

**Never show a success state you cannot stand behind.** The whole reason
`/api/lead` exists is that the old `no-cors` post made every response opaque, so
failures rendered a green checkmark. Same-origin now, status readable, errors
shown inline. A 422 with `field:"email"` is the one failure the visitor can fix,
so it keeps them on the form instead of showing the generic error.

**Slow work goes in the queue, not in the request.** `doPost` writes the row and
replies. Bonzo and the guide email run in `processFollowUps` a minute later, with
retry backoff at 1, 5, 20, 60 then 180 minutes, orphan recovery for rows whose
run died, and a daily digest for anything the 5-minute alert throttle swallowed.
Bonzo is pushed on the first pass only, so a guide retry can never create a
duplicate prospect.

**Secrets are server-side only.** A `VITE_` prefix puts a value in the public
client bundle, which is how the FRED key and the Apps Script URL leaked before.
Netlify env vars for the functions; Apps Script Script Properties for Bonzo
tokens and campaign ids. Never hardcode either in source.

**Tests read the real source.** The Apps Script and attribution tests evaluate
the actual deployed file with the runtime stubbed, rather than a reimplementation.
`tests/lead-flow-alignment.test.ts` scans both sides of the wall so a new landing
page that forgets its Apps Script route fails on the day it is written. Keep that
property when adding a funnel.

**No em-dashes in landing page copy or designs.**

## Adding a landing page

More are planned. Each one repeats the same pattern, and all of it has to line up
or the lead lands on the generic tab with its fields dropped:

1. `public/<slug>/index.html`, copying an existing page (contact modal included).
2. A `SOURCE_SCHEMAS` entry in `google-apps-script.js`: tab name, headers, row
   builder. Headers end with `ATTR_HEADERS`.
3. Campaign routing in `pushToBonzo()` plus a `BONZO_<SOURCE>_CAMPAIGN_ID` Script
   Property, and a tag branch.
4. If it has a magnet: a `netlify/functions/send-<slug>-guide.mts`, a
   `<SLUG>_GUIDE_API_KEY` Netlify env var, `NETLIFY_<SLUG>_PDF_URL` and `_KEY`
   Script Properties, and a `send<Slug>Guide` in `sendGuideFor()`.
5. `public/sitemap.xml`, and `/yt/<bucket>` plus `/yt/<bucket>-c` redirects in
   `netlify.toml`.
6. `tests/landing-pages.test.ts` picks the page up from its `PAGES` list.

## Deployment gotchas

- **Apps Script: update the existing deployment in place.** Deploy > Manage
  deployments > edit > New version. Creating a *new* deployment mints a new
  `/exec` URL and silently breaks every form until Netlify's
  `APPS_SCRIPT_WEBHOOK_URL` is updated.
- Both `APPS_SCRIPT_WEBHOOK_URL` and `APP_SCRIPT_WEBHOOK_URL` are read, because a
  rename in either direction should not take every form on the site down.
- After changing triggers, run `installTriggers()` once by hand from the editor.
- Apps Script Cloud Logging is unreliable for web-app executions; the `Debug`
  sheet tab is the trustworthy record (trimmed to 2000 rows daily).
- Netlify kills a synchronous function at 10s. `/api/lead` budgets 9s upstream
  and leaves roughly 300ms for the rescue email.
- Hosting is Netlify with the custom domain. The user prefers to be asked before
  anything is pushed.

## Known state and open work

- All 440 tests pass, `npm run build` succeeds, and `npm run lint` is clean.
- HubSpot is the largest pending piece: CRM portal access is still blocked, and
  the server-side handoff is not built. Keep the Netlify -> Apps Script -> Sheets
  -> Bonzo flow intact until a replacement is tested end to end.
- Calendly is tracked as `calendly_open` only; real booking tracking is still to
  do.
- `/dscr/`, `/fha/` and `/realestateinvesting/` were discovered but not yet
  indexed by Google. Monitor, do not repeatedly resubmit.
