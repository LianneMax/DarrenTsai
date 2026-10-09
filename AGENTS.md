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

Every submit path feeds `/api/lead`: four React forms (the debt calculator,
the home-equity estimate, the ADU project snapshot and the mortgage calculator's lead form), three static
landing-page magnet forms, and the contact modal on every page.

**Every copy of the contact modal posts its own `source`**, one per page:
`home-contact`, `debt-consolidation-contact`, `home-equity-contact`, `adu-contact`,
`mortgage-calculator-contact`, `dscr-contact`, `fha-contact`, `rei-contact`. They all posted `MortgageCalculator` until 26 Sep 2026, so the
Sheet's Source column, the Bonzo tags and the GA4 event said the same thing
wherever the lead came from. They have no funnel-specific columns, so they still
fall through `doPost` to the generic Leads tab; what they must each have is a
branch in `CONTACT_SOURCES` (Apps Script) or they are all tagged
`mortgage-calculator` again. `tests/lead-flow-alignment.test.ts` reads the
`leadSource` prop as well as `source:` literals, so a page that mounts the modal
with an unrouted source fails there.

## Tech stack

| Layer | Choice |
| --- | --- |
| Frontend | React 18 + TypeScript, Vite 6, plain CSS (`src/index.css`, ~2200 lines, CSS custom properties on `:root`) |
| Routing | None. Five HTML entries (`index.html`, `debt-consolidation/index.html`, `home-equity/index.html`, `adu/index.html`, `mortgage-calculator/index.html`). Netlify serves a real 404 for anything else. The first screen of `/` and of `/debt-consolidation/` is pre-rendered into its HTML at build and its CSS inlined (`src/prerender.tsx`, `PRERENDERED` in `vite.config.ts`) |
| Landing pages | Hand-written static HTML in `public/dscr/`, `public/fha/`, `public/realestateinvesting/`. No build step, ~2000 lines each, inline `<script>` |
| Server | Netlify Functions (`.mts`, `Netlify.env.get`), routes declared via `export const config.path` |
| Storage of record | Google Sheet `1DZ98FIyaF8hYi-c3FPMLVF71dVVnJWyejg4_J2ZkepI`, driven by `google-apps-script.js` |
| CRM | Bonzo v3 API (`app.getbonzo.com/api/v3`), campaign-routed per source |
| Email | Resend, from `darren@realdarrentsai.com` |
| Rates | FRED (Freddie Mac PMMS), cached in Netlify Blobs, refreshed hourly |
| Tests | Vitest + jsdom, 33 files / 1175 tests, all passing |
| Validation | zod, libphonenumber-js |
| PDF | pdf-lib at runtime; reportlab (`scripts/build_dscr_pdf.py`) to build the static template |

## Commands

```bash
npm run dev      # vite only; /api/* proxies to :8888 and 404s without netlify dev
netlify dev      # what you actually want: functions + vite together
npm run build    # tsc -b && vite build
npm test         # vitest run (1175 tests)
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
  observation event, never imported as a conversion. One exception, decided by
  Kocah on 8 Oct 2026 and theirs to make: `calendly_booking` is imported into
  Ads as well, so a form lead who then books counts twice there (see the
  booking notes under Known state).
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
- **HELOC and home equity have their own page, `/home-equity/` (revamp phase
  3, 9 Oct; not live).** Source `home-equity`, its own "Home Equity" tab, Bonzo
  tags `home-equity` and `HELOC/cash-out interest` (the debt funnel's tag, so
  one filter finds both) plus `goal:` and `preference:`. `/yt/heloc` and
  `/yt/equity` point there. It is a new source, not a revival of the old
  `heloc-hei` route, which stays removed. Until the page existed that intent was
  served by the debt-consolidation funnel.
- **Renovation and ADU have their own page, `/adu/` (revamp phase 5, 9 Oct;
  not live).** Source `adu`, its own "ADU" tab, Bonzo tags `adu` and
  `HELOC/cash-out interest` plus `purpose:`. `/yt/adu` and `/yt/adu-c` point
  there. Deploy the Apps Script `adu` route before the site.
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

**No calculator arrives pre-filled.** All three (homepage savings, DSCR, FHA)
used to load with a worked example already in their inputs, and because an input
looks no different once filled, a visitor who walked past it submitted the
example as fact: $26,500 of debt nobody owed reached the Sheet and reached
Darren, and three of the five DSCR rows are the untouched sample. Inputs start
empty, every numeric placeholder reads `e.g. ...`, and each tool holds its
result back until it has the fields the result is made of. The debt page's steps
are gated forwards only, including the pill tabs, which were the easier way
past. `tests/debt-calculator-guards.test.ts` scans for all of it.

**No savings range, only the visitor's own figure.** The homepage once carried
three claims at once: `$1,500–$3,000/mo` in the hero, `$900–$1,500/mo` in the
sticky bar and step 4, and the tool's own default of `$334/mo`. They were folded
into one `SAVINGS_RANGE` constant, which never had Saxton's sign-off; on 10 Oct
the last surfaces that showed it (the homepage calculator and its sticky bar)
were removed, and the constant with them. A savings number now only ever comes
from the visitor's own inputs. `tests/debt-calculator-guards.test.ts` fails on a
dollar range in the debt page or the hub.

**Lead rows are written by header name; columns move only through the
migration (R1).** Every lead tab is one standard order (`LEAD_PREFIX`, the
funnel's own details, `ATTR_HEADERS`, `TRIAGE_HEADERS`;
`docs/lead-sheet-schema.md`), and `appendByHeader()` puts each value under the
live header of the same name, through `safeCell()`. This replaces the
append-only rule. That rule existed because rows were written by position: on
@38 two columns went into a list one place left of where the sheet had them,
and a TEST flag landed under Contacted with every test green. Now the sheet's
own header row decides where a value goes, so the file and the sheet cannot
disagree about position. Three things follow:

- Editing a header list in the script moves **nothing** on the sheet. A new
  column goes where it belongs in the schema, is added at the end of the live
  tab by the next lead, and is put in place by `migrateLeadTabs()`, run by hand
  after `auditLeadTabs()`. Never drag a column or rename a header in the Sheets
  UI. A renamed header needs a `HEADER_ALIASES` entry; a removed one goes in
  `DROPPED_HEADERS` and stays readable in the "(old ...)" tab.
- A tab whose columns are not the schema's is reported by email
  (`alertSheetDrift`, at most every 6 hours per tab) and the lead is saved
  regardless. That email is expected between a deploy and its migration.
- `ensureHeaders()` is positional and is only for Follow-ups, Debug and
  Newsletter. Calling it on a lead tab is the @38 incident again.

The migration copies text back through `safeCell()` too: a name stored as text
since @45 (`=IMAGE(...)`) comes back from `getValues()` as a bare string and
would otherwise become a live formula again. The test harness treats a `=`
string as a formula even in a plain-text cell, because Sheets' behaviour there
is not verified, so the guard cannot quietly depend on it.
`tests/sheet-columns.test.ts` pins the order and writes against shuffled sheets;
`tests/sheet-migration.test.ts` checks every old value arrives under the same
header name.

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
2. A `SOURCE_SCHEMAS` entry in `google-apps-script.js`: tab name, `details`
   (the funnel's own columns) and `detailValues`. The shared columns, the
   attribution block and the triage columns are added for it. Pin the new tab in
   `tests/sheet-columns.test.ts`.
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
- `/api/lead` rate-limits per address in code (10 posts per 15 minutes,
  Netlify Blobs store `lead-rate`, address hashed), failing open on any Blobs
  error or after 600ms, inside the same 9s budget. A refused post gets a 429
  with `field: "rate"` before its body is read, so no rescue email; the static
  pages show its message. No honeypot field, on purpose: autofill can fill one
  and a filled honeypot is a silent 200.
- Hosting is Netlify with the custom domain. The user prefers to be asked before
  anything is pushed.

## Known state and open work

- All 1175 tests pass, `npm run build` succeeds, and `npm run lint` is clean.
- **The Sheet schema release (R1) is on `main` and NOT yet deployed to Apps
  Script or migrated (10 Oct).** The by-header-name rule above describes it.
  The site half ships with `main` and is safe against the live @46 script (the
  two removed debt fields were already blank, and @46 ignores the new ones).
  Until the window, the live Apps Script and the live tabs are still
  positional, so no column may be moved by hand. To do, by hand, in one quiet
  window and in this order: copy the spreadsheet, deploy the Apps Script in
  place (`docs/APPS-SCRIPT-DEPLOY.md`), run `auditLeadTabs()`, run
  `migrateLeadTabs()`, send one test lead per tab with fake details. `docs/MANUAL-TEST-RUNBOOK.md` section 0.5 has the steps. Deploying
  the script without migrating is safe (rows are written by name) but mails a
  drift notice per tab every 6 hours until it is done. The debt lead now sends
  savings signed (negative means the payment goes up), the equity snapshot
  under `estimatedEquity` as the equity and ADU pages do, today's payment, the
  debts' average rate, the same-payoff refi and the PMMS date, and no longer
  sends Best Time to Call or Lead Source. Delete this bullet once migrated.
- **One look across the site (10 Oct).** The React pages (the hub,
  `/debt-consolidation/`, `/home-equity/`, `/adu/`) use the static landing
  pages' palette, which now lives in `src/index.css`'s `:root` as well
  (`--accent`, `--accent-on-teal`, `--header-text`, `--teal-deep`, `--line`;
  change both sides together, `tests/page-style.test.tsx` compares them). That
  means the white header with Contact outlined and Book a Call in slate, one
  accent word per headline (light cyan, slanted), the teal homepage hero, the
  spaced licensed strip, and the closing teal band. Pink stays only on error
  states and the contact form's submit, as on the static pages. Motion is
  theirs too: sections below the first screen fade up (`useScrollReveal`,
  which now does nothing where IntersectionObserver is missing rather than
  leaving a section invisible), cards lift on hover, and phones get the
  static pages' bottom action bar (`MobileActionBar`: the page's one action
  and a `tel:` call button), which steps aside while the calculator is on
  screen. Nothing on a first screen fades in, and the bar is never in the
  pre-rendered HTML, so LCP and the no-phone-number shell rule are unchanged.
- **`docs/LAUNCH-CHECKLIST.md` is the living list of what is left before Google
  Ads**: code, accounts and decisions, each with an owner. When an item is done,
  delete it there and add a line to its "Done" section in the same commit.
  All work happens on `main`; there are no side branches (10 Oct).
  `docs/revamp/BRANCHES.md` records what the old ones held.
- HubSpot is the largest pending piece: CRM portal access is still blocked, and
  the server-side handoff is not built. Keep the Netlify -> Apps Script -> Sheets
  -> Bonzo flow intact until a replacement is tested end to end.
- Every "Book a Call" CTA opens a chooser (`public/booking-chooser.js`): call
  now, or schedule. The call half is a real `tel:` anchor, so CallRail swaps the
  number and `phone_click` fires with no extra code, which puts urgent leads on
  the one path that is already an Ads conversion. The schedule half renders the
  calendar **inline, in the same panel**, and fires `calendly_open`.
- Inline is what makes `calendly_booking` possible. Calendly announces a booking
  by posting a message to its parent window; in its own popup, and especially in
  the new tab the old first-click fallback opened, we were not the parent, so
  completed bookings could not be counted and a paid-plan webhook looked like
  the only answer. Rendered inline the iframe is ours, so every booking is
  visible. The listener checks `e.origin` against calendly.com, which is the
  security boundary and not a nicety: without it any page could post a forged
  booking. `calendly_booking` was an observation event that must never be
  imported into Ads, for the same reason as `phone_click`, until 8 Oct 2026.
  Kocah runs the Google Ads account and has decided to import it, probably as
  Primary during launch for the extra bidding signal, with HubSpot as their
  source of truth, so a visitor who submits a form and then books is counted
  twice in Ads and that is accepted on their side. It is their call, not a
  tracking bug to fix here. The site side does not change: the event fires
  once per booking, behind the origin check, with `page_path` only.
- Tests count as passing only with the whole suite: `tests/booking-chooser.test.ts`
  loads the source once per file rather than per test, because the message
  listener is registered at evaluation and re-evaluating stacks listeners.
- The booking panel offers a way out after 8s (`STALL_MS`): Calendly has no
  failure state of its own, so a blocked iframe looks exactly like one about to
  appear, forever, and by then the Call option has been replaced by the
  calendar. The fallback is added **above** the frame rather than instead of it,
  because the embed may still be one second away. `calendly_stalled` is tracked
  so a run of stalls looks different from people simply not booking.
- `DTBooking.identify({name, email})` prefills the calendar after a form has
  already asked. In memory for the page view only: never stored, never sent
  anywhere, only ever reaches Calendly's own form. An empty call clears it, so
  one visitor's name cannot sit in the next one's calendar.
- **A returning lead is not a failure.** Bonzo answers 422 "already exists" for
  an email it already holds, which is what happens when someone who downloaded
  one guide comes back for another. That was mailed to Darren as a LEAD PIPELINE
  FAILURE until 26 Sep 2026, which is the fastest way to teach someone to ignore
  the one alert standing between a lost lead and silence. It goes to the Debug
  tab now. `isReturningProspect` matches on the status AND the wording, narrowly,
  because 422 is also how a malformed body comes back. What it does not fix: a
  returning prospect is still not enrolled in the new campaign and their tags are
  not updated. That needs an update-by-email call whose v3 behaviour must be
  verified live first, the way the Mortgage fields were.
- **The contact modal's confirmation email is live** (its properties are set;
  see `docs/revamp/BRANCHES.md`). It was built dark first. Since 10 Oct the same
  sender has four more approved contexts, named by `confirmationContext` in the
  Apps Script: `debt`, `home-equity`, `adu`, and `mortgage-review` (the mortgage
  calculator's modal, only when its numbers came with it). Ship the site before
  the Apps Script version that sends them; `npm run emails` renders all five to
  `docs/revamp/emails/`. Every magnet
  form sent the visitor something; the modal, the form that asks the most, sent
  nothing. `netlify/functions/send-contact-confirmation.mts` carries the calendar
  rather than an attachment, with UTMs on the link. It needs
  `CONTACT_CONFIRM_API_KEY` (Netlify) plus `NETLIFY_CONTACT_CONFIRM_URL` and
  `NETLIFY_CONTACT_CONFIRM_KEY` (Script Properties). `sendContactConfirmation`
  **skips** rather than fails without them, which is the one deliberate
  difference from the guide senders: a missing guide is a broken promise worth
  alerting on, this email is promised nowhere, and an unset property must not
  turn every contact lead's row red.
- `docs/MANUAL-TEST-RUNBOOK.md` is the by-hand verification pass: every funnel,
  the attribution and Ads checks, and the gotchas that read as bugs but are not.
- `audit.md` is the 26 Sep 2026 lead-path audit, ranked, with a file and line per
  item. Items 6, 8, 14 and 16 are GTM, CallRail and YouTube settings that code
  cannot reach; everything else in its Fix first table is fixed in code as of
  `125c445` and awaiting a live check.
- `/dscr/`, `/fha/` and `/realestateinvesting/` were discovered but not yet
  indexed by Google. Monitor, do not repeatedly resubmit.
- **Nothing reads the Sheet except this script.** No Zapier, no Make, no
  third-party automation subscribes to it; confirmed with Lianne on 26 Sep 2026.
  A funnel review claimed the calculator tab fed Zapier into a Saxton HELOC
  registration, which held up the Debt Consolidation column change until it was
  disproved. The claim most likely described the Figure white-label HELOC
  hand-off, a second tab carrying the visitor's name and email in the query
  string, retired in `fcb514b` along with `quoteTab.ts`.

  Worth knowing for the next audit that raises it, because grepping this repo
  cannot settle the question either way: an automation subscribes to the Sheet
  on Google's side and leaves no trace here. The live integrations are Bonzo
  (from `pushToBonzo`), Resend (via the Netlify guide senders), CallRail
  (client-side number swap) and GTM/GA4. That is the whole list.
