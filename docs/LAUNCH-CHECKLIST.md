# Before Google Ads: what is left

The one living list of what still stands between the site and paid traffic. Code, accounts and decisions are all here, so a new session or a new person can pick it up from this file alone.

**How to keep it current**

- When an item is done, **delete it** and add one line to "Done" at the bottom: the date, what was done and the commit or version. Keep only the last 15 lines of "Done"; older history lives in `git log` and `audit.md`.
- A new item gets an owner and a reason. If it is blocked, say on what.
- Never put keys, tokens, IP addresses, private phone numbers or lead details here. This file is committed. Account-side detail lives in `SESSION_HANDOFF_PRIVATE.md` (git-ignored).

Owners: **Max** (site, tracking, accounts), **Darren**, **Kocah** (Niko, Google Ads and HubSpot admin), **Claude Code** (code in this repo).

Last updated: 10 Oct 2026, after the phase 4 and 5 deploy (`3430fd2`, Apps Script @44).

---

## 1. Must be done before the first ad goes live

- [ ] **Call and text consent line on every form** (audit L5). Blocked on Darren and Saxton approving the wording. Bonzo texts leads, so this is the item an Ads or compliance review is most likely to ask about. Once approved, Claude Code adds the same text under every submit button, the three static pages included.
- [ ] **Ad final URLs and form ids to Kocah** (Max). Debt ads to `/debt-consolidation/`, HELOC and equity ads to `/home-equity/`, ADU ads to `/adu/`. Tell them the new form ids in case a GTM trigger or Ads report filters on form id. No ads point at `/`, so the homepage hub touches no ad.
- [ ] **Loan Type options in HubSpot cover the new funnels** (Kocah). HELOC, home equity loan, cash-out refinance, ADU/renovation.
- [ ] **Google Ads tracking template and final URL suffix audit** (Kocah or Darren). The account's existing values were left untouched on purpose (24 Sep). Read them before campaigns are built so nothing overwrites the UTMs the site depends on.
- [ ] **Live test of the merged site and Apps Script @46** (Max, or Claude Code once its environment allows `realdarrentsai.com` and `script.google.com`). @46 holds both the formula guard and the four email contexts (deployed 10 Oct, 03:04, same deployment `AKfycbybhK2j...`). Use only fake details: email `delivered@resend.dev` (Resend's test inbox, which accepts and discards), phone `(714) 555-0146` (the 555-01xx range marks a test lead, so Bonzo and HubSpot skip it), first name `=UPPER("guard")`. Submit once each on `/debt-consolidation/`, `/home-equity/`, `/adu/` and one contact modal. Then in the Sheet: each row on its own tab ("Debt Consolidation", "Home Equity", "ADU", "Leads"), First Name reading `=UPPER("guard")` as text (not `GUARD`), Test? = TEST; Follow-ups rows `done`; Debug has `sendContactConfirmation ... response 200` for each. Also click the homepage goal cards and the `/fha/` review button. Delete the test rows after.
- [ ] **PageSpeed on the new pages** (Max). Three mobile runs of the new homepage (its hero changed, so the 8 Oct numbers no longer apply), and one each of `/home-equity/`, `/adu/` and `/debt-consolidation/`. Decide then whether the homepage still needs L11 fix 2.
- [ ] **Search Console** (Max). Resubmit `sitemap.xml`, which now lists `/home-equity/` and `/adu/`. Keep monitoring `/dscr/`, `/fha/` and `/realestateinvesting/`; do not resubmit them repeatedly.

## 2. Code still to build (Claude Code)

- [ ] **R1, the Sheet schema release.** Reference implementation is `4f56832` on `debt-consolidation-page`; redo it on current `main` and include the Home Equity and ADU tabs. See `docs/revamp/BRANCHES.md` and `docs/lead-sheet-schema.md`. Both questions are answered (10 Oct): no filters or saved views on the lead tabs, and Darren does not use Best Time to Call. Ready to build; it still needs a Sheet backup, a formula check and a verified migration in its own quiet window.
- [ ] **HubSpot loan fields** (audit L12). Loan Amount, Loan Type and Property Use reach HubSpot empty. Names received from Niko (10 Oct): `loan_amount`, `loan_type`, `property_use`, `lead_source_detail`, all hidden fields on the form. Repeat submissions: latest known answer wins, blanks are omitted, history stays. Blocked on the final field types: Loan Amount was a number and the other three text, and Niko is still changing them, so the dropdown values are not settled.

## 3. Accounts and settings (outside the code)

- [ ] **HubSpot plan tier** (H1, Darren or Kocah). Ad conversion events need Marketing Hub Starter or above.
- [ ] **HubSpot lifecycle sync** (H2, Kocah). Application Submitted to Opportunity and Funded to Customer need workflows, which this account does not have, or the pipeline's built-in lifecycle setting.
- [ ] **Max's new HubSpot seat** (Darren), then the three HubSpot switches (Max): Google Ads pixel, non-HubSpot form capture, cookie banner.
- [ ] **HubSpot test clean-up** (Niko). Delete the `TEST H3 Live` contact.
- [ ] **YouTube copy for the moved buckets** (Max). `/yt/heloc` and `/yt/equity` now land on `/home-equity/`, but the description and pinned-comment text still say "Request your Private Debt Analysis", which is the old homepage offer. Update those videos' text to match the equity page, and use `/yt/adu` and `/yt/adu-c` on ADU videos.
- [ ] **Dedicated Bonzo campaigns** (optional, Max). `BONZO_HOME_EQUITY_CAMPAIGN_ID` and `BONZO_ADU_CAMPAIGN_ID`; until set, both funnels enroll in the default campaign.
- [ ] **Update the SOP and the private handoff** (Max). The Google Doc SOP and `SESSION_HANDOFF_PRIVATE.md` (last updated 24 Sep) predate HubSpot H3 and the whole revamp.

## 4. After launch, with real traffic

- [ ] First real Google Ads form conversion (`generate_lead`) appears in Ads.
- [ ] First eligible paid call (website pool, over 60 seconds) appears in Ads from CallRail.
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
- 10 Oct: revamp phase 6, navigation. The hub and mortgage calculator nav has About Me, Reviews, Calculators (now with Home Equity and ADU), Contact and Book a Call; the three ad pages show only Contact and Book a Call; the static pages' logo goes to `/` directly.
- 10 Oct: the copy decisions document and email previews brought to `main` from `debt-consolidation-page` (`fba2134`); `r0-debt-consolidation` and `debt-page-redesign` confirmed fully in `main`.
- 9 Oct: homepage goal hub, revamp phase 4 (`3430fd2`).
- 9 Oct: `/adu/`, revamp phase 5 (`012f08e`), Apps Script @44 with the `adu` route.
- 9 Oct: `/home-equity/`, revamp phase 3 (`3419e61`), Apps Script @43.
- 9 Oct: `/debt-consolidation/` redesign, revamp phase 2 (`7dfe9f1` to `cd9eddc`).
