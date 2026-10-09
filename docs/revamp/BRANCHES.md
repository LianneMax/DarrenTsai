# Branches outside `main`, and what is still only on them (10 Oct 2026)

Written so a session that can only see GitHub knows what exists beyond `main`, what is safe to delete, and what must not be merged as it stands.

## Summary

| Branch | On GitHub | Status |
| --- | --- | --- |
| `r0-debt-consolidation` | No (local only) | Fully in `main`. Safe to delete. |
| `debt-page-redesign` | No (local only) | Fully in `main`. Safe to delete. |
| `claude/wizardly-ramanujan-1dww99` | Yes | Eight new commits outside `main`, through `997054f` (verified after fetch, 10 Oct). Do not delete. |
| `debt-consolidation-page` | **Yes, pushed 10 Oct** | **Five commits not in `main`. Do not delete, do not merge as it is.** |

The cloud branch was previously fully in main, but has since gained eight commits: launch checklist, phase 6 nav, email-hint click fix, legacy calculator removal, FHA payment review, Sheet formula guard/build dependency fixes, debt comparison fixes, and homepage metadata. Cloud reports 1,040 passing tests, lint, build and layout checks; these results have not been independently rerun here. Main and deployed Apps Script have not been changed by this cross-check. See `docs/go-live-checklist.md` for newer decisions and verification evidence.

## `debt-consolidation-page`: what it holds

Five commits on top of `aef60d3` (the R0 release), oldest first:

| Commit | What |
| --- | --- |
| `4f56832` | **R1, the Sheet schema release.** One standard column order for every lead tab, rows written by header name (`appendByHeader`), `Submission ID` / `Form ID` / `Page` / `First Touch Medium`, the DSCR scenario columns, signed savings on the debt tab, `auditLeadTabs()` and `migrateLeadTabs()`, Best Time to Call and Lead Source removed from the debt form. Tests: `tests/sheet-columns.test.ts` rewritten, `tests/sheet-migration.test.ts` new. |
| `7d6e954` | A CLAUDE.md note that the contact confirmation email is live. |
| `4597c60` | `docs/revamp/confirmation-email-copy.md`, the email copy for sign-off. |
| `c8967bb` | Four contexts added to `netlify/functions/send-contact-confirmation.mts` (debt, home-equity, adu, mortgage-review), `scripts/build-email-previews.mjs`, `npm run emails`, `tests/confirmation-email.test.ts`, and the rendered previews. |
| `3b939da` | The decision that emails say "I will be in touch." and the site says "Darren will be in touch." |

Copied into `main` with this file, as documents only: `docs/revamp/confirmation-email-copy.md` and `docs/revamp/emails/`. The code they describe is **not** in `main`.

## Why it cannot simply be merged

- **It predates phases 2 to 5.** `main` has since rebuilt the debt page, added `/home-equity/` and `/adu/`, and turned the homepage into the hub. `src/components/DebtSavingsCalculator.tsx`, `google-apps-script.js` and several tests conflict.
- **`main`'s Apps Script is still positional.** The `home-equity` and `adu` schemas in `main` were added in the old append-only style (`COMMON_LEAD.concat(...)`, `row: function`). R1 replaces that whole mechanism, so R1 has to be redone on top of current `main` and must then include those two tabs.
- **The Apps Script live today is @44**, deployed from `main`. Nothing from R1 has ever been deployed and no tab has been migrated.
- **The contact confirmation email is live.** The contexts in `c8967bb` leave it byte for byte unchanged and nothing sends a context, but that guarantee is a test on the branch, not on `main`.

## How to pick each piece up

**R1 (Sheet schema).** Treat `4f56832` as the reference implementation, not as a patch to apply. The design is in `docs/lead-sheet-schema.md`; the order of work for the migration window is in the branch's `docs/MANUAL-TEST-RUNBOOK.md`, section 0.5. Decided by Max on 8 Oct: rows are written by header name, a tab out of schema order is reported by email and never refuses a lead, and the migration runs in its own quiet window after R0. Max resolved the questions on 10 Oct: neither Darren nor Kocah uses filters or saved views on the lead tabs, and Darren does not use the best-time answer. Audit formulas separately; preparation is unblocked, production migration still needs its backup and verified release plan.

**Confirmation emails (R2).** Waiting on Max's sign-off of the copy. `docs/revamp/emails/index.html` shows the four drafts beside the live email. When approved, re-apply `c8967bb` to current `main` (the template file has not changed on `main` since, so it should apply cleanly), keep the hash test, and only then make the Apps Script send a `context`. That last step is what turns an email on, and it starts reaching borrowers on deploy.

**Signed savings on the debt page.** `main`'s debt page already shows "Payment goes up $X/mo" through `src/utils/savingsText.ts`, but the lead still sends savings only when positive. The signed payload is part of R1.

## Things only on someone's machine

- `SESSION_HANDOFF_PRIVATE.md` is git-ignored and is not in this repository. It is the account-side record (GTM, GA4, Google Ads, CallRail, Search Console, HubSpot), last updated 24 Sep 2026, so it predates HubSpot H3 and the whole revamp.
- `docs/revamp/DarrenTsai_Frontend_Revamp_Brief.md` and `docs/revamp/darren-frontend-preview-v4.html` are excluded locally (`.git/info/exclude`) on purpose. The brief's appendix carries internal strategy notes. `docs/frontend-revamp-review.md` is the public summary of both.

## Standing facts a new session needs

- No Google Ads are running as of 9 Oct 2026 (Max). When they start: debt ads to `/debt-consolidation/`, equity to `/home-equity/`, ADU to `/adu/`.
- Apps Script deploys go through `clasp`, updating the existing deployment in place. Never a new deployment: that changes the `/exec` URL.
- Max wants to be asked before anything is pushed to `main`.
