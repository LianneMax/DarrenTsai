# realdarrentsai.com lead-path audit

Last updated 26 Sep 2026 · Max (with Claude) · checked against `origin/main` at `40d4628`, Apps Script deployment @36

The pipes work: test leads from YouTube short links save to the Sheet, fire `generate_lead` in GA4, land in the right Bonzo campaign, and the three guide emails arrive within a minute. What still loses or corrupts leads sits on top of that: contradictory savings numbers, calculators that submit example numbers as if the visitor typed them, an 8-field contact form with no confirmation email, bookings that never reach GA4, and a CallRail pool that is overloaded before ads start.

This file is written for people and for Claude Code. Every open item has a file and line (or a tool and setting), a fix, and a way to check it. Line numbers are as of `40d4628`; search for the quoted code if they have moved.

**Scope covered:** every landing page and form (`/`, `/dscr/`, `/fha/`, `/realestateinvesting/`, `/mortgage-calculator/`), all 10 `/yt/*` short links, the 30 most recent YouTube descriptions and pinned comments, the lead Sheet, Gmail inboxes, Resend, CallRail, GTM, GA4, Google Ads, Bonzo, Calendly, Search Console, and a code read of the lead path.

**Status key:** Open · Partly fixed · Fixed (verified 26 Sep).

---

## Fix first

Ranked by how many YouTube leads each one loses or mislabels. P1 items should be done before ad spend starts.

**Worked through on 27 Sep 2026** (commits `774b7f7..125c445`). Every item that
code could reach is marked **Fixed in code**, meaning: committed, 541 tests
pass, lint, tsc and build clean, and **not yet deployed** — nothing has been
pushed to GitHub or Netlify, and the Apps Script has not been clasp pushed.
Each one still needs its live check from the How to verify column.

Five items are not code and are still **Open**: #6 and #16 are GTM tags and
parameters, #8 is the CallRail pool, #14 is four YouTube descriptions, and the
rest of #10 is Darren's call on whether a dedicated `/heloc` page ships.

Two carry a caveat:

- **#10 is partly fixed.** "Access my home equity" is now an option on every
  form and reaches Bonzo as `target:access-equity`, and the homepage names the
  two products it actually prices. Whether `/heloc` gets built is not a code
  decision.
- **#21 is partly fixed.** The panel is 720px on desktop and the calendar is
  prefilled with the name and email when a form has just collected them. The
  widths were chosen without a browser to check them in, so this one wants
  eyes before it is called done.

One thing #4 needs before it does anything: the confirmation email is built and
wired, but it stays silent until these three exist.

```
Netlify env var   CONTACT_CONFIRM_API_KEY      = <new random string>
Script Property   NETLIFY_CONTACT_CONFIRM_URL  = https://realdarrentsai.com/api/send-contact-confirmation
Script Property   NETLIFY_CONTACT_CONFIRM_KEY  = <same random string>
```

The Apps Script skips rather than fails without them, so deploying in either
order is safe and no alert fires in the meantime.

| # | Priority | Status | What's wrong | Where | Fix | How to verify |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | P1 | Fixed in code | **"Boost Your Monthly Cashflow" submits example debts as real data.** Step 1 loads two filled-in debts (Credit Card $8,500 / $250 / 24.99%, Auto Loan $18,000 / $420 / 7.5%). Visitors who don't replace them send $26,500 total debt and $670/mo to the Sheet and to Darren as if they typed it. Both of my 26 Sep test leads did exactly this without touching step 1 | `src/components/DebtSavingsCalculator.tsx` lines 164–167 (`useState<Debt[]>` defaults) | Start both debt rows at `bal: 0, pmt: 0, rate: 0`. The inputs already render `value={d.bal \|\| ''}` with placeholders `5000` / `150` / `24.99` (lines 454, 467, 479), so they will show as grey examples. Block "Continue to Home Info" until at least one debt has a balance and payment | Load `/`, don't touch step 1, try to continue: it should stop you. Fill one debt, submit: the Debt Consolidation row shows your numbers, not 26,500 / 670 |
| 2 | P1 | Fixed in code | **Calculator shows results on empty input.** Step 2 (home value, balance, payment, rate, term) can be left blank; the comparison then shows HELOAN **$0/mo** and "Save $670/mo". Grey placeholders (650000, 350000…) look like pre-filled values | `DebtSavingsCalculator.tsx` line 600 (`goStep(3)` with no validation), placeholders lines 550–587 | Require home value, balance and payment before `goStep(3)`; prefix placeholders with "e.g." | Leave step 2 blank and click "See My Comparison": it should refuse |
| 3 | P1 | Fixed in code | **Three different savings claims on one page.** Hero card **$1,500–$3,000/mo**; sticky bar and step 4 **$900–$1,500/mo**; the tool's own default result **$334/mo**. A viewer who just saw $334 is told a call "could free up $900–$1,500" | `src/components/Hero.tsx` line 69; `DebtSavingsCalculator.tsx` lines 819 and 1008 | Pick one claim Saxton signs off on, or drop the ranges. Step 4 should repeat the visitor's own result | Only one savings figure appears on `/`, and step 4 echoes the computed number |
| 4 | P1 | Fixed in code | **Contact form: 8 required fields, pre-filled optional numbers, and no confirmation email.** On every page except `/mortgage-calculator/` the optional Loan Amount and Rate carry the mortgage-calculator defaults **$330,000 / 6.41%**; a real May lead is logged at 6.41%. "Send My Info to Darren" sends no email to the visitor | `src/components/LeadForm.tsx` line 77 (prefill), defaults `src/hooks/useMortgageInputs.ts` lines 15–17; same modal copied into `public/dscr/`, `public/fha/`, `public/realestateinvesting/` `index.html` | Cut to name, email, phone, state; leave the optional fields blank outside `/mortgage-calculator/`; send an instant reply with Darren's calendar link | Open Contact on `/`: fields blank. Submit: a confirmation lands in the inbox |
| 5 | P1 | Fixed in code | **Every Contact-modal lead is labelled `MortgageCalculator`**, on any page, so Sheet, Bonzo tags and GA4 can't tell an equity lead from a DSCR lead | `LeadForm.tsx` line 148; `public/fha/index.html` 2133; `public/realestateinvesting/index.html` 2041; `public/dscr/index.html` 1983 | One `lead_source` per page and form (e.g. `home-contact`, `dscr-contact`) | Submit Contact on `/dscr/`: Sheet Source and Bonzo tag say dscr-contact |
| 6 | P1 | Open | **Bookings never reach GA4.** `calendly_open` and `calendly_booking` fire into the dataLayer (verified with a real booking) but GTM has no tags for them, so GA4 Realtime shows neither | GTM container `GTM-N7Z8Q4QF` | Add GA4 event tags for both (observation only, not imported to Ads) and publish | Book a slot: `calendly_booking` appears in GA4 Realtime |
| 7 | P1 | Fixed in code | **No fallback if the calendar stalls.** In the Claude app browser Calendly sat on its spinner for 20+ s, twice, with no way out. In Chrome it loaded in 3–5 s | `public/booking-chooser.js` | After ~8 s show "Open the calendar in a new tab" and the Call option | Block `calendly.com` in DevTools, pick Schedule: the fallback appears |
| 8 | P1 | Open | **CallRail pool is already "swapping too fast"** (live alert) because Tracking sources = All, so every YouTube and organic visitor takes one of 4 numbers | CallRail → Numbers → Website pool | Limit the pool to paid sources, or add numbers before launch | The CallRail alert clears |
| 9 | P1 | Fixed in code | **Returning leads fail.** Bonzo answers 422 "already exists" for a known email and Darren gets a LEAD PIPELINE FAILURE instead of an updated contact. Any viewer who downloads a second guide hits this | `google-apps-script.js` Bonzo push | Upsert by email in whichever CRM stays (HubSpot) | Submit twice with one email: one contact, updated, no alert |
| 10 | P1 | Partly fixed | **HELOC and equity viewers land on a debt-consolidation page**, and Target Outcome has no equity option | `/yt/heloc`, `/yt/equity` → `/` | Build `/heloc` (Darren's decision); meanwhile add "Access my home equity" to Target Outcome and HELOC wording | — |
| 11 | P2 | Fixed in code | **Double submit.** Button now disables and reads "Sending…", but two clicks in the same tick still sent two requests: two Sheet rows 2 ms apart, two Follow-ups, and a 422 failure alert | `DebtSavingsCalculator.tsx` lines 194, 279, 314 (`sending` is state, read before React re-renders) | Guard with a `useRef` set synchronously before the request | In DevTools: `b.click(); b.click()` sends one `/api/lead` |
| 12 | P2 | Fixed in code | **Calendly origin check is loose.** `indexOf('calendly.com')` accepts `calendly.com.anything.example`, so a forged booking could be counted | `public/booking-chooser.js` line 303 | `if (e.origin !== 'https://calendly.com') return;` | Unit test with a lookalike origin is rejected |
| 13 | P2 | Fixed in code | **DSCR calculator loads with sample numbers** ($2,400 rent, $320,000 price) and already says "Qualifies, 1.12". 3 of 5 DSCR Sheet rows are the untouched sample | `public/dscr/index.html` inputs `rent`, `price`, `tax`, `insurance` | Same as #1: placeholders, result hidden until the visitor enters rent and price | Fresh load shows no result |
| 14 | P2 | Open | **Four recent video descriptions link the bare homepage** (no campaign), three below the "…more" fold; the ARM video's pinned comment sends viewers to FHA | YouTube: `xEEcVDxgc5k`, `Nw_UqwLkrpM`, `6Wj7FaqlPhU`, `4Mbmp5K1zIc` | Put the bucket short link on line 1 (see YouTube section) | Descriptions contain `/yt/...` |
| 15 | P2 | Fixed in code | **Sheet can't separate tests from leads:** 4 real leads ever vs 20+ test rows | Lead Sheet | Add a Test flag (or route test emails to a Tests tab) plus Status / Contacted columns until HubSpot is live | Filter hides all tests |
| 16 | P2 | Open | **GA4 can't tell which form converted:** the `generate_lead` tag sends no parameters, though the dataLayer has them | GTM tag "GA4 – generate_lead" | Add `lead_source`, `form_id`, `page_path` (never `user_data`); register as custom dimensions | Parameters visible in GA4 DebugView |
| 17 | P2 | Fixed in code | **FHA "calculator" is an Excel attachment**; most YouTube viewers are on phones. Success copy promises a "payment breakdown" for numbers the visitor never gave | `/fha/` guide email | Link a web calculator or send a PDF | — |
| 18 | P2 | Fixed in code | Contact success message says "check out the savings calculator above" on every page | `LeadForm.tsx` line 173 | Match the next step to the page | — |
| 19 | P2 | Fixed in code | Mortgage calculator schedule counts 12 payments in the start year (Sep 2026), so it ends 2055 while the summary says Sep 2056 | `src/components/AmortizationTable.tsx`, `src/hooks/useMortgageInputs.ts` | Count only the months left in the start year | Last table year equals payoff year |
| 20 | P3 | Fixed in code | Booking chooser text runs together: "Call (714) 942-4217Straight through, no waiting", "Schedule a timeFree 15 minute call" | `public/booking-chooser.js` styles | Put the sub-line on its own line | — |
| 21 | P3 | Partly fixed | At desktop the 520 px panel gets Calendly's narrow layout, so the date grid is below the fold; name and email aren't prefilled for a lead who just submitted | `public/booking-chooser.js` sizing | Widen to ~700 px on desktop; pass name and email when known | — |
| 22 | P3 | Fixed in code | "Straight through, no waiting" promises something one forwarded cell can't always keep | `public/booking-chooser.js` copy | "Call Darren directly" | — |
| 23 | P3 | Fixed in code | REI hero HTML says "$0 Estimated value today" until an animation runs | `public/realestateinvesting/index.html` line 841 | Put `$170,000` in the HTML and animate from there | View source shows $170,000 |
| 24 | P3 | Fixed in code | FHA example uses 0.55% MIP ($177) for 5% down; the page's own text says 0.50% ($161) | `public/fha/index.html` line 962 | Correct to $161 | — |
| 25 | P3 | Fixed in code | All forms accept all 50 states with no message | Every state dropdown | Save the lead, but say where Darren lends | — |

---

## Re-test, 26 Sep: shipped fixes

Commits `fd401a8..40d4628`, five test leads from YouTube short links, one real Calendly booking (booked, checked, cancelled).

| Fix | Status | What I saw |
| --- | --- | --- |
| New Sheet columns (Mortgage Rate, Mortgage Term) | Fixed | 3.5 and 27 landed in their own columns; Total Debt Balance and the historical row (29,656.80) still aligned |
| "Refi, Same Payoff Date" card | Fixed | $2,942 at 27 years, plus "Adds 3 years to your payoff" and "Trades your 3.50% rate for about 7.03%". Math checks out |
| Double submit | Partly fixed | See Fix first #11 |
| Campaign routing (Apps Script @36) | Fixed | DSCR → DSCR Campaign, FHA → FHA Calculator Campaign: Licensed, REI → Real Estate Investing. Contact and Calculator → no campaign |
| Guide emails | Working | DSCR, FHA, REI all Delivered in Resend within a minute |
| Booking chooser | Fixed | Opens from header, sticky bar, success steps and every landing-page button. Call shows a CallRail pool number, so the swap runs on the injected link. Schedule first on desktop, Call first on phone |
| Calendar inline | Fixed | Renders in the panel, not a new tab; Back and Close work; UTMs reach Calendly (`utm_campaign=yt-heloc`) |
| `calendly_open` | Fixed | Fires exactly once per open |
| `calendly_booking` | Fires, not recorded | Fired once on confirmation; never reaches GA4 (Fix first #6) |
| FHA sticky Call button | Fixed | Real `tel:` link |
| Vanishing lead (rescue email on 500/413) | Fixed in code | Not tested live, deliberately |

---

## The YouTube viewer's path

All 10 short links redirect correctly with the right `utm_campaign` and `utm_content`. The problems start once the viewer lands.

| Short link | Lands on | What the viewer sees | Opt-in offered | Gap |
| --- | --- | --- | --- | --- |
| `/yt/heloc`, `/yt/equity` | `/` | "Most mortgages cost you money", debt-consolidation calculator with example debts filled in, three conflicting savings figures | Calculator step 4 (7 fields), Contact (8), booking chooser | No HELOC wording; HELOC and equity viewers get the same page |
| `/yt/dscr` | `/dscr/` | DSCR calculator pre-filled, result shown free | "Get My Real Rate", 4 fields | Sample numbers; static 6.75–7.50% rates; no footer, privacy or NMLS link |
| `/yt/rei` | `/realestateinvesting/` | BRRRR case study, gated PDF | 4-field form, booking chooser | Hero "$0"; page not in the site nav |
| `/yt/buyer` | `/fha/` | FHA explainer; calculator emailed after opt-in | 5-field form, booking chooser | Title says calculator, none on the page; the emailed one is .xlsx |

What works and should stay: the email typo check (caught `gmial.com`), no-credit-pull reassurance next to each form, the 4-field REI and FHA forms, the booking chooser on every success step, and a 404 page that points to the five tools. On a 375 px phone the homepage has no horizontal scroll.

### Page-by-page form tests

| Page | Form | Fields | lead_source / form_id | Email | Result |
| --- | --- | --- | --- | --- | --- |
| `/` | Savings calculator step 4 | 7 | DebtConsolidation / debt-savings-calculator | None | Saves; example debts submitted unless replaced (#1) |
| `/` | Contact modal | 8 | MortgageCalculator / home-contact-modal | None | Saves; wrong label (#5); $330,000 / 6.41% prefilled (#4) |
| `/dscr/` | "Get My Real Rate" | 4 | dscr / dscr-magnet | PDF snapshot + guide | Works; sample inputs (#13) |
| `/fha/` | "Get the Free Calculator" | 5 | fha / fha-magnet | .xlsx | Works (#17) |
| `/realestateinvesting/` | "Send Me The Case Study" | 4 | real-estate-investing / rei-magnet | PDF | Works end to end |
| `/mortgage-calculator/` | "Want Darren to review these numbers?" | 8 | MortgageCalculator | None | Works; here the prefilled numbers are the visitor's own |

### YouTube descriptions and pinned comments

30 most recent long-form videos (3 Mar – 22 Sep). No GetResponse links remain; every pinned comment uses a `-c` short link. Rechecked 26 Sep: these four are unchanged.

| Video | Published | Description link | Pinned link | Problem |
| --- | --- | --- | --- | --- |
| [The Fed Raised Rates](https://www.youtube.com/watch?v=xEEcVDxgc5k) | 22 Sep | `realdarrentsai.com/` | `/yt/equity-c` | Untracked; newest video |
| [Fixed Rate vs ARM](https://www.youtube.com/watch?v=Nw_UqwLkrpM) | 8 Sep | `realdarrentsai.com/`, line 7 | `/yt/buyer-c` (FHA) | Untracked, below the fold; ARM viewers sent to FHA |
| [HEI vs HELOC](https://www.youtube.com/watch?v=6Wj7FaqlPhU) | 25 Aug | `realdarrentsai.com/`, line 7 | `/yt/equity-c` | Untracked, below the fold |
| [How does a HELOC work?](https://www.youtube.com/watch?v=4Mbmp5K1zIc) | 18 Aug | `realdarrentsai.com/`, line 7 | `/yt/heloc-c` | Untracked, below the fold |

---

## Tracking and tools

| Tool | Confirmed | Open |
| --- | --- | --- |
| Site tags | GTM-N7Z8Q4QF loads once; GA4 G-627RJ4FDSP via GTM; no raw Ads tag; CallRail swap.js loads | swap.js loads at end of body, not `<head>` (plan item 4) |
| GTM | Tags: Google tag, generate_lead, phone_click | No Calendly tags (#6); generate_lead has no parameters (#16); container quality shows 2 issues |
| GA4 | `generate_lead` arrives as a key event within a minute | Internal-traffic filter still in Testing: test sessions (`tt=internal`) are counted |
| Google Ads 645-417-8442 | "Real Darren Tsai (web) generate_lead" Primary; Phone Call Primary | $0 spend, one Video campaign "Not eligible, no ads" (ends 28 Sep); Phone Call sits in the "Other" goal; no booked-call action; security-tasks warning. `docs/MANUAL-TEST-RUNBOOK.md` says Ads is "live and spending": confirm which account, or correct the runbook |
| Bonzo | Leads arrive within a minute with state and source tags; routing correct (@36) | Rejects returning leads (#9); Contact and Calculator leads get no campaign |
| CallRail | Swap works, including on the chooser's injected link | Pool "swapping too fast" (#8). Integrations: Google Ads, GA4, JS active; HubSpot and Business Profile not connected |
| Calendly | Inline widget, UTMs passed, booking event fires | Not in GA4 (#6); no fallback (#7) |
| Search Console | Sitemap submitted | 3 indexed / 15 not. `/investing`, `/homeowners`, `/agent-career` and a `/post/…` URL are "duplicate without canonical" and now 404. Google still shows the old title "Mortgage Calculator & Broker" |
| Business Profile | — | This login manages 0 businesses, yet Ads has a Profile "Directions" action, so it lives under another login |
| HubSpot | — | Not connected. Invite from Darren in liannemaxbalbastro@gmail.com, 24 Sep |

Quick wins: 301 the four old URLs (`/investing` → `/realestateinvesting/`, the rest → `/`) and request re-indexing of the homepage.

### CallRail setup

| Setting | Value | Note |
| --- | --- | --- |
| Pool size | 4 | Alert says too small |
| Tracking sources | All | Limit to paid, or give YouTube its own static number |
| Swap target | (714) 887-5432 | Correct; this is the number in the page HTML |
| Calls forward to | (714) 717-2245 | Recording, greeting and whisper on. California needs two-party consent: confirm the greeting says calls may be recorded |
| Texts | CallRail Messaging app | Texts to pool numbers don't reach Darren's phone |
| Other number | (714) 676-8170 | Not used on the site |

### Lead Sheet

[DarrenTsai | Calculator Leads](https://docs.google.com/spreadsheets/d/1DZ98FIyaF8hYi-c3FPMLVF71dVVnJWyejg4_J2ZkepI/edit): 4 real leads ever (May, May, Jul, Aug), none with attribution (they predate 16 Sep) and none from a short link yet.

| Tab | Notes |
| --- | --- |
| Leads (Contact modal) | Source always MortgageCalculator; real lead logged at the 6.41% default; Term always 30 |
| Debt Consolidation | Now has Mortgage Rate / Mortgage Term (aligned). Total Debt Balance / Payment are the example defaults unless replaced (#1) |
| Dscr | Rate and down payment stored as fractions (0.07, 0.25), loan amount as text ("$240,000") |
| Real Estate Investing | Three blank columns at the end of the header row |
| Follow-ups | One test accepted with `you@gmail.com`, a placeholder address |

### Emails (Gmail and Resend)

All guide emails in the last 15 days show Delivered in Resend, within about a minute.

- The Contact modal sends nothing to the visitor (#4).
- Guide email footers show Saxton's head office, (858) 925-2102 and info@saxtonmortgage.com, and "Dream Home Development Corporation DBA Saxton Mortgage, NMLS #2525913, operating only in California". A non-California lead reads that the company only operates in California.
- The Calendly link in each email has no UTMs.
- Resend lives in the `liannemaxbalbastro` workspace and failure alerts come from liannemaxbalbastro@gmail.com: lead delivery depends on personal accounts (same ownership decision as the Apps Script).
- Resend flags "link URLs don't match sending domain" (Calendly, Saxton links); minor.

### Follow-up readiness (CallRail + HubSpot; Bonzo tentative)

| Lead type | Lands in | Follow-up today | Needed |
| --- | --- | --- | --- |
| Guide form (DSCR, FHA, REI) | Sheet, Bonzo, guide email | Guide email + Bonzo campaign | `/api/lead` creates or updates the HubSpot contact by email, with attribution |
| Contact modal | Sheet, Bonzo (no campaign) | None | Same handoff, plus an instant confirmation email |
| Savings calculator | Sheet, Bonzo (no campaign) | None | Same |
| Phone call | CallRail → (714) 717-2245 | Darren answers or misses it | CallRail–HubSpot integration; missed-call text-back |
| Calendly booking | Calendly | Calendly's own emails | GA4 tags (#6); send bookings to HubSpot |

Build order once HubSpot is open: dedupe by email (#9), one lead_source per form (#5), a Test flag (#15), then the CallRail–HubSpot integration.

---

## Compliance and consistency

These need Darren and Saxton, not code.

| Item | What's live | Where |
| --- | --- | --- |
| Saxton NMLS | #1717191 in the site footer; #2525913 (Dream Home Development Corp DBA Saxton Mortgage, "operating only in California") in the DSCR disclaimer and every guide email | Footer vs `/dscr/` and emails |
| Phone | Site, Bonzo and third-party profiles use (714) 887-5432 (942-xxxx numbers are CallRail pool numbers). Guide emails show Saxton's (858) 925-2102 | Email footers |
| Title | "Senior Loan Officer" (site), "Home Loan Equity Advisor" (LinkedIn), "Senior Loan Consultant" (smarterhomebuyers.com) | Profiles |
| Location | Lake Forest, CA (Experience.com); Huntington Beach, CA (LinkedIn) | Profiles |
| SMS consent | Every form collects a phone with no consent line, while Bonzo texts | All forms |
| Privacy / licence links | `/dscr/` has no footer: no privacy policy or NMLS lookup link (also expected on Google Ads financial-services landing pages) | `/dscr/` |
| Rate figures | Homepage: live Freddie Mac rates. DSCR: static 6.75–7.50%. FHA: "market range". New "Refi, Same Payoff Date" card adds more rate figures | Sign-off with Saxton |

---

## Code-level findings (from the refactor review)

| # | Status | What | Where |
| --- | --- | --- | --- |
| C1 | Fixed in code | Failed lead could vanish with no rescue email on the 500/413 paths | `netlify/functions/lead.mts` |
| C2 | Partly fixed | Double submit (#11) | `DebtSavingsCalculator.tsx` |
| C3 | Fixed | Rate and term collected but unused; now used and saved | `DebtSavingsCalculator.tsx` |
| C4 | Fixed | `calendly_open` never fired from buttons; now fires from `booking-chooser.js` | `public/attribution.js`, `public/booking-chooser.js` |
| C5 | Fixed | FHA mobile "Call" opened Calendly; now dials | `public/fha/index.html` |

---

## Test data and cleanup

Test identities used: `liannemaxbalbastro+<case>@gmail.com`, `lmbalbastro+<case>@gmail.com`, `lianne_balbastro+<case>@dlsu.edu.ph`, phones (714) 555-01xx. Use a new `+tag` per test, because Bonzo rejects an email it has already seen (#9).

- [x] Bonzo: round 1 and round 2 test prospects deleted
- [x] Calendly: TEST R2 Booking (29 Oct 11:45am PT) cancelled
- [ ] Sheet: round 1 "Lianne TEST …" rows (Leads, Dscr, Fha, Real Estate Investing) and round 2 "TEST R2 …" rows (Debt Consolidation ×2, Leads, Dscr, Fha, Real Estate Investing), plus matching Follow-ups rows
- [ ] Work browser: clear site data for realdarrentsai.com so the old `smoke-test` ad click stops tagging tests as `ads:google`
- [ ] Accept the 24 Sep HubSpot invite, if it's for the CRM portal

Not checked: FHA email inbox placement for lmbalbastro@gmail.com (Resend shows Delivered), the Business Profile (not on this login), a real iPhone/Safari, Lighthouse scores.

Tooling note: an extension in the work Chrome (likely a password manager) opens over any focused form field and blocks automation. Run form tests in a clean profile or the Claude in-app browser.
