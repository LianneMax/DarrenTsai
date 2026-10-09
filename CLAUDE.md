# CLAUDE.md

Guidance for Claude Code working in this repository.

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
| Routing | None. Five HTML entries (`index.html`, `debt-consolidation/index.html`, `home-equity/index.html`, `adu/index.html`, `mortgage-calculator/index.html`). Netlify serves a real 404 for anything else. The first screen of `/` (nav and hero) and of `/debt-consolidation/`, `/home-equity/` and `/adu/` (nav and the page hero) is pre-rendered into its HTML at build and its CSS inlined (`src/prerender.tsx`, `PRERENDERED` in `vite.config.ts`); React replaces it on load, and early clicks on it are queued and replayed (`data-early`, the inline script in each entry, `App.tsx` and `DebtConsolidationApp.tsx`) |
| Landing pages | Hand-written static HTML in `public/dscr/`, `public/fha/`, `public/realestateinvesting/`. No build step, ~2000 lines each, inline `<script>` |
| Server | Netlify Functions (`.mts`, `Netlify.env.get`), routes declared via `export const config.path` |
| Storage of record | Google Sheet `1DZ98FIyaF8hYi-c3FPMLVF71dVVnJWyejg4_J2ZkepI`, driven by `google-apps-script.js` |
| CRM | Bonzo v3 API (`app.getbonzo.com/api/v3`), campaign-routed per source |
| Email | Resend, from `darren@realdarrentsai.com` |
| Rates | FRED (Freddie Mac PMMS), cached in Netlify Blobs, refreshed hourly |
| Tests | Vitest + jsdom, 29 files / 1036 tests, all passing |
| Validation | zod, libphonenumber-js |
| PDF | pdf-lib at runtime; reportlab (`scripts/build_dscr_pdf.py`) to build the static template |

## Commands

```bash
npm run dev      # vite only; /api/* proxies to :8888 and 404s without netlify dev
netlify dev      # what you actually want: functions + vite together
npm run build    # tsc -b && vite build
npm test         # vitest run (1036 tests)
npm run lint     # eslint . (clean)
npm run images   # regenerate favicon/avatar derivatives from public/darren.jpg
npm run test:layout  # real-browser layout check, by hand, before a layout push
```

**Run `npm run test:layout` before pushing any change to a page or the CSS.** It
builds the site, serves it with `vite preview`, and drives Chromium over all eight
pages at 320, 360, 375, 414, 768, 850, 1024, 1280 and 1440px, failing on any
sideways scroll or any focusable field under 16px at phone widths. Everything
that is not localhost is blocked, so a run does not depend on Calendly, CallRail
or Google Fonts being up, at the cost of laying text out in fallback fonts.

It is deliberately outside `npm test` and the Netlify build: it needs a browser
binary and a build, and a deploy that fails for want of Chromium is a worse
outcome than the bug it looks for. `npm test` cannot do this job at all, because
jsdom has no layout engine: `scrollWidth` and `clientWidth` are both 0 at every
width, which is exactly how the R8 round's six overflows passed a full suite.
`tests/layout-overflow.test.ts` pins the RULE behind each one, which is what a
source scan can do; `scripts/layout-check.mjs` is the measurement, which is what
finds the next one.

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

**Every font stack is `'Outfit', 'Outfit Fallback', sans-serif`.** Pages paint
before Outfit arrives (since L10), and in plain Arial the hero headline took
different lines, so it re-flowed on the swap: CLS 0.106 on the homepage at phone
width with the font held back a second. `Outfit Fallback` is Arial with metric
overrides measured from the Outfit files, declared in `src/index.css` and in each
static page's `<style>`. A stack that leaves it out brings the shift back for
that element only, and looks fine once the font is in.
`tests/font-fallback.test.ts` scans for it; the overrides are measurements, so
do not tune them by eye (audit L11).

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

- All 1036 tests pass, `npm run build` succeeds, and `npm run lint` is clean.
- **`docs/LAUNCH-CHECKLIST.md` is the living list of what is left before Google
  Ads**: code, accounts and decisions, each with an owner. When an item is done,
  delete it there and add a line to its "Done" section in the same commit.
  `docs/revamp/BRANCHES.md` says what exists only on side branches
  (`debt-consolidation-page` holds R1 and the R2 email contexts, unmerged).
- **`/debt-consolidation/` is the debt ads' URL (revamp phase 0, 8 Oct).** It
  serves what was the homepage's calculator, the same component, so
  the lead is identical: source `DebtConsolidation`, form id
  `debt-savings-calculator`, same Sheet tab, same GA4 conversion, and
  `page_path` tells the two pages apart. It exists ahead of the revamp because
  the revamp moves the calculator off the homepage and an ad's final URL cannot
  follow it. Since phase 4 the homepage no longer has the calculator, and
  each page is canonical to itself.
  The plan for the remaining phases, and the Sheet schema migration that
  replaces the append-only rule, are in `docs/frontend-revamp-review.md` and
  `docs/lead-sheet-schema.md`; neither is built yet, so append-only still
  holds.
- **The homepage is the goal hub (revamp phase 4, 9 Oct; not live).**
  `HomeHub.tsx`: a static hero (pre-rendered, its one CTA an anchor to
  `#goals`), five goal cards, About Me, the reviews, Calculators & Tools and
  Education. Pay Off Debt, Access Home Equity, Renovate / ADU and Buy a Home are
  plain links to `/debt-consolidation/`, `/home-equity/`, `/adu/` and `/fha/`;
  Invest asks first (DSCR calculator or Real Estate Investing); "Not sure where
  to start?" opens the contact modal (`home-contact`, Leads tab). The homepage
  hosts no calculator, so every `/#savings` link now points at
  `/debt-consolidation/`, and `tests/home-hub.test.tsx` fails on any link to a
  page that is not served. The homepage's own layout of the debt calculator,
  sticky bar included, was removed on 10 Oct; `DebtSavingsCalculator` now has
  one layout, `DebtPageViews.tsx`.
- **`/debt-consolidation/` has its own layout (revamp phase 2, 9 Oct; not
  live).** `DebtPageViews.tsx` draws the hero, four steps and the recap from Max's
  design preview v4, and computes nothing: `DebtSavingsCalculator` builds one
  `view` object from the formulas, gates and lead, so the layout cannot
  disagree with the numbers and the payload is unchanged. The option a visitor picks to discuss (`chosen`) is shown on the
  recap only; it is not in the lead until the Sheet migration gives it a column.
  Styles are the `dcp-` block at the end of `src/index.css`. There is no rose
  sticky savings bar: it named the larger saving "your result", which picks a
  winner on a page built to have no "best option".
  `tests/debt-page-views.test.tsx` renders each step from props.
- **`/home-equity/` (revamp phase 3, 9 Oct; not live).** Three steps (your home,
  your options, talk to Darren) and a recap, from design preview v4.
  `HomeEquityCalculator` holds state, gates and the lead; `HomeEquityViews`
  draws it; `src/utils/homeEquity.ts` builds the payload. It quotes no payment,
  rate or borrowing amount: equity, LTV and an illustrative CLTV, with a note
  past the 85% CLTV lenders commonly use. A mortgage balance of 0 is a real
  answer here (a paid-off home) and is stored as 0; a skipped amount or
  preference is blank. **Ship order:** deploy the Apps Script version with the
  `home-equity` route first, then the site (until then its leads land on the
  generic Leads tab, saved but without their equity columns). It enrolls in
  `BONZO_CAMPAIGN_ID`; set `BONZO_HOME_EQUITY_CAMPAIGN_ID` to give it its own
  campaign without a deploy. HELOC/equity ads move to it with Kocah.
- **`/adu/` (revamp phase 5, 9 Oct; not live).** Two steps (your project,
  talk to Darren) and a recap, from design preview v4. `AduCalculator` holds
  state, gates and the lead; `AduViews` draws it; `src/utils/adu.ts` builds the
  payload. Four numbers (home value, balance, project cost, amount to finance)
  and a purpose (ADU for family, Rental ADU, Renovation, Other), all required
  before the contact step. It shows equity, LTV, an illustrative CLTV and how
  much of the budget the financing leaves uncovered, and says plainly that
  financing does not confirm an ADU can be permitted, built or rented. Source
  `adu`, its own "ADU" tab, Bonzo tags `adu`, `HELOC/cash-out interest` and
  `purpose:`; `/yt/adu` and `/yt/adu-c` point there. The chips, money input,
  contact step and error dialog are shared with `/home-equity/` through
  `PageParts.tsx`. **Ship order:** deploy the Apps Script version with the
  `adu` route first, then the site. It enrolls in `BONZO_CAMPAIGN_ID` until
  `BONZO_ADU_CAMPAIGN_ID` is set.
- **No APR figure and no response time, anywhere (Max, 8 Oct).** "Est. APR" was
  the rate plus a flat 0.20 that no lender had quoted; every place now reads
  "See cost assumptions" with a note that APR depends on fees and lender terms.
  Success cards said "within 1 business day" and "shortly"; they say "Darren
  will be in touch." and nothing more. `tests/copy-rules.test.ts` scans every
  page and email for both, so neither comes back with a copied template.
- **Dropdown panels follow their trigger (8 Oct).** `StateSelect` and `CustomSelect`
  used to place their panel once, always below, and close it on any scroll or
  resize. On a phone the keyboard resizes the window and a thumb scrolls the
  page, so the State field, required on every lead form, kept closing, and hung
  off the bottom of the screen when the field was low. `useAnchoredPanel`
  re-measures instead, opens upwards when that side has more room, caps the
  height, and focuses the search box for a mouse only. The three static landing
  pages carry their own two copies each (`enhanceSelect` and the contact
  modal's `enhance`), with the same rule written out inline: measured the same
  way, 36 cases, all failing before and all passing after.
- **HubSpot is an extra destination, built dark (audit H3, 29 Sep).**
  `pushToHubSpot` submits every lead to a HubSpot form (Forms API v3, portal
  247401197) from `processFollowUps`, next to Bonzo, and skips until
  `HUBSPOT_PORTAL_ID` and `HUBSPOT_FORM_GUID` are set. `lead.mts` adds the
  `hubspotutk` cookie as `hutk`. Two things to know before touching it: the
  Forms API refuses a whole submission over one field the form does not
  declare, so the push resubmits once without the named fields and emails about
  it; and a follow-up row's Status prefix says which job is still owed
  (`guide-retry`, `hubspot-retry`, or `retry` for both), so a HubSpot retry can
  never mail a guide twice. Keep the Netlify -> Apps Script -> Sheets -> Bonzo
  flow intact until HubSpot is tested end to end.
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
  already asked. Every submit path calls it, the three guide forms included:
  they did not until 27 Sep, so anyone who asked for a guide and then booked met
  an empty calendar form. Held in memory and in `sessionStorage` (`dt_known_lead`),
  per tab, because in memory alone it died on a reload and on every move to
  another page of the site. Name and email only, never sent anywhere, only ever
  handed to Calendly's own form. An empty call clears both, so one visitor's name
  cannot sit in the next one's calendar.
- **`config.prefill` alone does not arrive, and this is the one Calendly
  behaviour worth knowing before touching the booking panel.** The current
  `widget.js` puts no prefill in the iframe `src` at all, with or without `utm`.
  It posts a `calendly.prefill` message into the frame as the frame loads,
  before the booking page has a listener up, so it is dropped and the details
  step opens empty. Nothing about the call looks wrong, which is why it survived
  three rounds of auditing, and why an earlier theory in this file blamed a
  duplicate query parameter instead. `booking-chooser.js` therefore re-posts that
  same message itself, from inside the existing origin-checked listener, when
  Calendly reports `calendly.event_type_viewed` and again on
  `calendly.date_and_time_selected` (twice, 500ms apart, because the details form
  draws just after that event). It posts only into the frame the open panel
  created, checked by `e.source`, and only ever name and email. Phone cannot be
  prefilled through the embed. The query string is still the only route for the
  new-tab fallback, which has no widget and so no `prefill`.
- **The calendar's width is load-bearing.** Calendly picks its layout from the
  width of the element it is handed, not the viewport: 1100px and up is side by
  side, 650 to 1099px is stacked behind an avatar and description block, under
  650px is the phone layout. The panel was 720px, so every desktop visitor got
  the stacked one with a blank band above it and no date visible without
  scrolling inside the panel. Above 1200px the card is 1160px so the frame clears
  1100px; between 780 and 1199px it stays 720px and passes
  `hide_event_type_details=1` instead, which puts the month grid at the top.
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
  see `docs/revamp/BRANCHES.md`). It was built dark first. Every magnet
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
