# Before Google Ads: what is left

The one living list of what still stands between the site and paid traffic. Code, accounts and decisions are all here, so a new session or a new person can pick it up from this file alone.

**How to keep it current**

- When an item is done, **delete it** and add one line to "Done" at the bottom: the date, what was done and the commit or version. Keep only the last 15 lines of "Done"; older history lives in `git log` and `audit.md`.
- A new item gets an owner and a reason. If it is blocked, say on what.
- Never put keys, tokens, IP addresses, private phone numbers or lead details here. This file is committed. Account-side detail lives in `SESSION_HANDOFF_PRIVATE.md` (git-ignored).

Owners: **Max** (site, tracking, accounts), **Darren**, **Kocah** (Niko, Google Ads and HubSpot admin), **Claude Code** (code in this repo).

Last updated: 10 Oct 2026, after R1 reached `main` and `docs/go-live-checklist.md` was folded in here. All work is on `main`; there are no side branches.

---

## 1. Must be done before the first ad goes live

- [ ] **Call and text consent line on every form** (audit L5). Blocked on Darren and Saxton approving the wording. Bonzo texts leads, so this is the item an Ads or compliance review is most likely to ask about. Once approved, Claude Code adds the same text under every submit button, the three static pages included.
- [ ] **Ad final URLs and form ids to Kocah** (Max). Debt ads to `/debt-consolidation/`, HELOC and equity ads to `/home-equity/`, ADU ads to `/adu/`. Each service ad group goes to its own page and that page's existing calculator; there is no calculator for the case-study offer and none should be invented. Tell them the form ids in case a GTM trigger or Ads report filters on form id, `fha-payment-review` included. No ads point at `/`, so the homepage hub touches no ad. Send the list only after the per-page acceptance below; Max sends it, not Claude. Final campaign names, budgets, states and URLs come from Kocah's completed build, not received yet.
- [ ] **Loan Type options in HubSpot cover the new funnels** (Kocah). HELOC, home equity loan, cash-out refinance, ADU/renovation.
- [ ] **Google Ads tracking template and final URL suffix audit** (Kocah or Darren). The account's existing values were left untouched on purpose (24 Sep). Read them before campaigns are built so nothing overwrites the UTMs the site depends on.
- [ ] **Live test of the merged site and Apps Script @46** (Max, or Claude Code once its environment allows `realdarrentsai.com` and `script.google.com`). @46 holds both the formula guard and the four email contexts (deployed 10 Oct, 03:04, same deployment `AKfycbybhK2j...`). Use only fake details: email `delivered@resend.dev` (Resend's test inbox, which accepts and discards), phone `(714) 555-0146` (the 555-01xx range marks a test lead, so Bonzo and HubSpot skip it), first name `=UPPER("guard")`. Submit once each on `/debt-consolidation/`, `/home-equity/`, `/adu/` and one contact modal. Then in the Sheet: each row on its own tab ("Debt Consolidation", "Home Equity", "ADU", "Leads"), First Name reading `=UPPER("guard")` as text (not `GUARD`), Test? = TEST; Follow-ups rows `done`; Debug has `sendContactConfirmation ... response 200` for each. Also click the homepage goal cards and the `/fha/` review button. Delete the test rows after.
- [ ] **Per-page acceptance** (Max, with Claude Code for the local half). Done on 10 Oct for all eight pages, live: canonical URL right, numeric inputs empty, CallRail's swapped number in the call link, and GTM and CallRail scripts present on ADU, DSCR, FHA and REI. Still to do per page before Kocah points an ad at it: one real fake-detail submit, recording source, form id, Sheet tab, Test? flag, Follow-ups status, email, CRM result, one `generate_lead` and no PII in GA4; a real iPhone; canonical, sitemap and redirects. Test leads must be skipped by Bonzo: prove tags and campaigns in the tests or with an approved non-nurture test, never by enrolling a test borrower.
- [ ] **Tracking read-through** (Max, with Kocah). GTM, GA4, Ads and CallRail as they stand, read and not changed: one `generate_lead` per successful submit, no PII in GA4 parameters, the internal-traffic filter catching current test traffic, the CallRail swap, and the actual conversion goals. Kocah's `calendly_booking` import (possibly Primary) is theirs; read it, do not change it. `phone_click` stays observation-only.
- [ ] **CallRail qualified-call length** (Max, Kocah). The business rule is 90 seconds or more (recorded 10 Oct); the repo's notes and the CallRail setup said "over 60 seconds". Read the rule actually set in CallRail and its boundary (is 90 itself counted?), then set it and fix the wording here and in `CLAUDE.md`.
- [ ] **PageSpeed on the new pages** (Max). Three mobile runs of the new homepage (its hero changed, twice, so the 8 Oct numbers no longer apply), and one each of `/home-equity/`, `/adu/` and `/debt-consolidation/`. Decide then whether the homepage still needs L11 fix 2.
- [ ] **Search Console** (Max). Resubmit `sitemap.xml`, which now lists `/home-equity/` and `/adu/`. Keep monitoring `/dscr/`, `/fha/` and `/realestateinvesting/`; do not resubmit them repeatedly.

## 2. Code still to build (Claude Code)

- [ ] **R1, the Sheet schema release: run the migration window.** The code is on `main` (10 Oct), Home Equity and ADU included, checked against the live Sheet's header rows (see `docs/revamp/BRANCHES.md`). The site half ships with `main` and is safe with the live @46 script. Left, by hand, in one quiet window: copy the spreadsheet, deploy @47 in place (`docs/APPS-SCRIPT-DEPLOY.md`), `auditLeadTabs()`, `migrateLeadTabs()`, one fake test lead per tab. Steps in `docs/MANUAL-TEST-RUNBOOK.md` section 0.5. Owner: Max (Sheet and deploy), Claude Code (checks).
- [ ] **HubSpot loan fields** (audit L12). Loan Amount, Loan Type and Property Use reach HubSpot empty. Names received from Niko (10 Oct): `loan_amount`, `loan_type`, `property_use`, `lead_source_detail`, all hidden fields on the form. Repeat submissions (Max, 10 Oct): the latest known Loan Amount, Loan Type and Property Use win; a blank or unknown answer is omitted so it never clears a value, and no "Unknown" placeholder is sent; every submission stays in the contact's history; owner, lifecycle stage and deal progress are never reset. The current mapper already omits blanks; keep that. Build it as a narrow change to the existing HubSpot field mapper, with a case per funnel, numbers normalised, an unknown source protected, and a repeat-submission test, and without touching R1 or the email contexts. Blocked on the final field types: on 10 Oct `loan_amount` was Number and the other three Single-line text, and Niko means to change them; if one becomes a dropdown, its exact option values are needed first.

## 3. Accounts and settings (outside the code)

- [ ] **HubSpot plan tier** (H1, Darren or Kocah). Ad conversion events need Marketing Hub Starter or above.
- [ ] **HubSpot lifecycle sync** (H2, Kocah). Application Submitted to Opportunity and Funded to Customer need workflows, which this account does not have, or the pipeline's built-in lifecycle setting.
- [ ] **HubSpot permissions for Max's seat** (Darren or the HubSpot admin). The seat is active, but on 10 Oct it could not edit tracking settings ("you must be an authorized user"), property settings (the `loan_amount` panel asks for Edit property settings) or forms (Forms is missing from Marketing, and the form settings pages show no controls). Ask for Forms view and edit, Edit property settings, and the tracking settings permission, keeping Kocah's access as it is. Do not create a developer app or a private-app token to get around it.
- [ ] **The three HubSpot switches** (Max, once the permissions are there). Ads pixel: keep it. Non-HubSpot form capture: turn it off, recording the setting before and after, so leads have one collection path (it does not necessarily duplicate every lead, so test it). Cookie banner: waits on Darren.
- [ ] **The H3 API form, read through** (Max). Every field on the form the server posts to, Email required, the exact internal Yes/No values, the property types and the loan option values. Niko says the hidden fields are there.
- [ ] **HubSpot end-to-end test** (Max, with Claude Code). Note the current `HUBSPOT_SEND_TESTS` setting, turn it on for one controlled fake-detail test, check the contact, the submission, the attribution and the fields, then put the setting back as it was, even if the test fails.
- [ ] **HubSpot connections and policy** (Kocah). CallRail and Google Ads connections still active, the plan's entitlements (see H1), lead owner and notifications, and the lifecycle and deal policy. Read them; do not assume a workflow exists.
- [ ] **HubSpot test clean-up** (Niko, Max to check). Niko reports the `TEST H3 Live` contact removed. Check that any remaining test identities are disposable before deleting them, one by one, never a broad "TEST" search result.
- [ ] **YouTube copy for the moved buckets** (Max). `/yt/heloc` and `/yt/equity` now land on `/home-equity/`, but the description and pinned-comment text still say "Request your Private Debt Analysis", which is the old homepage offer. Update those videos' text to match the equity page, and use `/yt/adu` and `/yt/adu-c` on ADU videos.
- [ ] **Dedicated Bonzo campaigns** (optional, Max). `BONZO_HOME_EQUITY_CAMPAIGN_ID` and `BONZO_ADU_CAMPAIGN_ID`; until set, both funnels enroll in the default campaign.
- [ ] **Update the SOP and the private handoff** (Max). The Google Doc SOP and `SESSION_HANDOFF_PRIVATE.md` (last updated 24 Sep) predate HubSpot H3 and the whole revamp.

## 4. After launch, with real traffic

- [ ] First real Google Ads form conversion (`generate_lead`) appears in Ads.
- [ ] First eligible paid call (website pool, at the length settled above) appears in Ads from CallRail.
- [ ] First real Calendly booking shows `calendly_booking` in GA4.
- [ ] A returning Bonzo prospect is still not enrolled in the new campaign or re-tagged. Needs the v3 update-by-email behaviour verified live first.
- [ ] Bonzo retirement, as a separate switch once HubSpot is proven complete.

## Rules that stay true (not tasks)

- GTM is the only tag path. Never add the raw `AW-18451324434` snippet, a second GTM install or a direct gtag.
- GA4 `generate_lead` is the only website form conversion. CallRail owns paid calls. `phone_click` is never imported. `calendly_booking` is imported by Kocah's decision (8 Oct).
- No PII in GA4 parameters. No enhanced conversions without a consent review.
- Do not rename CallRail's `Phone Call` conversion or change its "Import from clicks" source.
- Apps Script: update the existing deployment in place, never a new one.
- No Splitero or home equity investment content anywhere on the site yet.

## Rollback for the 9 Oct release

- Site: revert `3430fd2` (homepage hub) and/or `012f08e` (`/adu/`) on `main` with a revert commit; Netlify redeploys.
- Apps Script: point the existing deployment back at version 43. Only do this after the site no longer links to `/adu/`, or ADU leads land on the generic Leads tab.

## Already done (were open in the 24 Sep handoff)

These were still listed as open in `SESSION_HANDOFF_PRIVATE.md`, but have since been done. Listed once here so nobody redoes them:

- GA4 internal-traffic filter set to Active, retention 14 months (29 Sep).
- HubSpot tracking code through GTM, container version 6 (29 Sep).
- Server-side HubSpot lead push (H3), live since 7 Oct; Niko confirmed the `rdt_` fields fill.
- Real Calendly booking tracking: `calendly_booking`, origin-checked, in GTM container version 5 (29 Sep).
- YouTube description and pinned-comment sweep (29 Sep). The heloc/equity text now needs the update in section 3.
- The contact modal's confirmation email is live (per `docs/revamp/BRANCHES.md`).

## Done

- 10 Oct: the React pages (hub, debt, home equity, ADU) restyled to match `/dscr/` and `/realestateinvesting/`: shared palette, header buttons, accent headline word, teal hub hero, licensed strip, closing band, scroll reveal, hover lift and the phone action bar. Content and lead payloads unchanged; checked in Chromium on all eight pages at nine widths.
- 10 Oct: R1 merged into `main` and the side branches retired: all work now happens on `main` (Max). `docs/go-live-checklist.md` folded into this file and removed; its live page checks, HubSpot permission findings, the 90-second call rule and the repeat-submission policy are in the items above.
- 10 Oct: three tests compare scripts with line endings normalised, so a Windows (CRLF) checkout no longer fails them (`e231d38`, Max). Email preview menu no longer labels Home Equity and ADU "page not built yet".
- 10 Oct: R1 rebuilt on current `main`, on `claude/wizardly-ramanujan-1dww99`: rows written by header name through the formula guard, the migration and audit functions, Home Equity and ADU in the standard order, and the debt page's R1 fields. Checked with real payloads captured in Chromium and run through the real Apps Script, and with the live Sheet's header rows. Not merged, deployed or migrated (item above).
- 10 Oct: CallRail pool settled. Niko's "1 number" meant one number type for ads, not a pool of one: the website pool stays at 4 numbers, so each call still ties to its ad click. No separate Google Business Profile number for now (Max).
- 10 Oct: rate limit on `/api/lead`, in code: 10 posts per address per 15 minutes, counted in Netlify Blobs with the address hashed, failing open on any Blobs error or a reply slower than 600ms. A refused post gets a 429 before its body is read, so it sends no rescue email; the static pages show its message instead of "your details were passed to Darren". Checked in Chromium on all three static pages. On `main` from 10 Oct; an ordinary lead going through in the live test above confirms it lets real posts by.
- 10 Oct: honeypot decided: no hidden field. Browser autofill can fill one, and a filled honeypot gets a silent 200, which is a lost lead nobody hears about; the rate limit covers the flood case instead. The server's `company` check stays, harmless with nothing sending it.
- 10 Oct: Apps Script @46 deployed by Max (formula guard and the four confirmation email contexts), code checked against `main`. Live test still to run (above).
- 10 Oct: merged to `main` (11 commits: nav, email hint, old layout removed, FHA review, security pass, debt math, homepage title, confirmation emails). Apps Script @45 deployed by Max with the formula guard.
- 10 Oct: R2, the four confirmation emails (debt, home equity, ADU, mortgage-calculator review), approved by Max and wired: `c8967bb`'s template contexts applied, and `confirmationContext` in the Apps Script names them. Contact leads' email is unchanged byte for byte. Live after the site merge and Apps Script @46.
- 10 Oct: debt page math corrected (Max's decisions). A capped HELOAN now counts the payments on the debt it leaves, by balance share (example: $3,139 combined and $661 saved, where it used to claim $1,595); a cash-out refinance past 80% of the home's value says many lenders stop there, without capping the figure; a paid-off home (balance 0) gets a comparison. Homepage title is now "Darren Tsai | Mortgage & Real Estate Guidance" with a hub description.
- 10 Oct: security pass. Sheet formula injection fixed in code (needs the Apps Script deploy above); 11 build-time dependency advisories fixed with `npm audit fix` (production had none); confirmed no keys in the client bundle, email templates escape visitor text, the guide senders require their key, and the X-Frame-Options, nosniff and Referrer-Policy headers are in place (now pinned by a test). Not done: a Content-Security-Policy (GTM loads tags chosen in its UI, so it needs a Report-Only run on the live site first), and narrowing `/api/lead`'s `*.netlify.app` origin allowance, which needs the Netlify site name.
- 10 Oct: `/fha/` "Have Darren Review My Payment". The estimate's button opens the contact modal as form `fha-payment-review` with the financed loan and rate prefilled (it used to scroll to the guide form); leads go to the Leads tab as `fha-contact`. The guide form and its Credit Score are unchanged. Tell Kocah about the new form id.
- 10 Oct: the old homepage layout of the debt calculator removed (about 650 lines and its `dsc-` CSS), with the unused `SAVINGS_RANGE`; the guard tests now scan `DebtPageViews.tsx`, the page visitors see.
- 10 Oct: the email typo hint no longer swallows the next click. It now appears once that click has landed (`afterPress` in `public/email-suggest.js`, shared by React and the static pages). Reproduced on the old build at 1280px, fixed on the new.
