# Branches (10 Oct 2026)

**All work happens on `main`. There are no side branches.** Decided by Max on 10 Oct. Do not start a branch to hold work back; anything not ready to reach visitors or the Sheet is held back by its deploy step (the Apps Script is only ever deployed by hand), not by a branch.

## What the old branches held, and where it went

| Branch | Where its work is now |
| --- | --- |
| `r0-debt-consolidation`, `debt-page-redesign` | Fully in `main`, deleted. |
| `debt-consolidation-page` | R2 (the confirmation email contexts, the copy and the wording decision) is in `main` and live since Apps Script @46. Its R1 commit `4f56832` was the reference for the R1 rebuild below. Deleted. |
| `claude/wizardly-ramanujan-1dww99` | Phases 2 to 6, the security pass and R1, all merged into `main` (R1 on 10 Oct). Deleted. |

## R1 on `main`: what changed against `4f56832`

`4f56832` was merged three ways onto `main` at `8740407`, keeping everything `main` added since: `CONTACT_SOURCES`, `FUNNEL_CAMPAIGNS`, the formula guard (`safeCell` / `appendSafeRow`), the `preference:` tag, the confirmation contexts, the rate limit. What changed on the way:

- **The Home Equity and ADU tabs are in the standard order**, built from `main`'s live columns. The equity field is `estimatedEquity` on every tab; R1 called it `estimatedHomeEquity` on the debt tab, which would have left that column blank.
- **Rows go through `safeCell()`** in `appendByHeader()`, and so does text copied by the migration: a name stored as text since @45 comes back from `getValues()` as a bare `=...` string and would be a live formula again if written back as it is. The test harness models Sheets value entry (an apostrophe is consumed, a bare `=` becomes a formula, also in a plain-text cell, since that is not verified), and the migration test fails with the guard removed.
- **The debt page sends the R1 fields from the new layout**: signed savings, `estimatedEquity`, `currentLtv`, `currentMonthlyPayment`, `weightedAvgRate`, the same-payoff refi and `rateSourceDate`; Best Time to Call and Lead Source are gone from the payload and the rescue email. Checked by capturing the real payload in Chromium for four cases (saves, costs more, paid-off home, rates down) and running it through the real Apps Script. Safe against the live @46 script too: @46 writes the two removed fields as blank (they already were) and ignores the new ones.
- **Run against the live Sheet's header rows** (read 10 Oct): the audit says all five tabs need migrating, and every value moved under its own header, with only the two dropped debt columns left behind in the "(old ...)" tab.

**What is left**: the migration window, `docs/MANUAL-TEST-RUNBOOK.md` section 0.5 (copy the spreadsheet, deploy @47 in place, `auditLeadTabs()`, `migrateLeadTabs()`, one fake test lead per tab). The two questions it waited on are answered (10 Oct): no filters or saved views on the lead tabs, and Darren does not use Best Time to Call.

## Things only on someone's machine

- `SESSION_HANDOFF_PRIVATE.md` is git-ignored and is not in this repository. It is the account-side record (GTM, GA4, Google Ads, CallRail, Search Console, HubSpot), last updated 24 Sep 2026, so it predates HubSpot H3 and the whole revamp.
- `docs/revamp/DarrenTsai_Frontend_Revamp_Brief.md` and `docs/revamp/darren-frontend-preview-v4.html` are excluded locally (`.git/info/exclude`) on purpose. The brief's appendix carries internal strategy notes. `docs/frontend-revamp-review.md` is the public summary of both.

## Standing facts a new session needs

- No Google Ads are running as of 9 Oct 2026 (Max). When they start: debt ads to `/debt-consolidation/`, equity to `/home-equity/`, ADU to `/adu/`.
- Apps Script deploys go through `clasp`, updating the existing deployment in place. Never a new deployment: that changes the `/exec` URL.
- Max wants to be asked before anything is pushed to `main`, and all work goes to `main` (10 Oct).
