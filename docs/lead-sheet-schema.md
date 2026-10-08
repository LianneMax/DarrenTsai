# Lead Sheet schema (proposal, 8 Oct 2026, revised)

Decision (Max, 8 Oct): new columns go beside the columns they belong with, not at the end. This replaces the repo's append-only rule, so it must be done as one planned migration, never by editing headers in place (the 27 Sep @38 incident: inserting mid-array without migrating the sheet put TEST flags under Contacted).

Decision (Max, 8 Oct): keep the word "Savings" (site and Sheet) because it reads better for visitors. This overrides the revamp spec's "Monthly Difference" wording and the preview's "$X/mo lower payment" card text. Guardrail: when an option raises the payment, don't show a negative "savings"; show it as a payment increase (e.g. "Payment goes up $X/mo") or "No monthly savings". Store the signed value in the Sheet so increases are visible.

Decision (Max, 8 Oct): remove "Best Time to Call" and "Lead Source" ("How did you hear about us?") from the debt consolidation form and from the Debt Consolidation tab. The Codex preview v4 still shows both on step 4; they come out. Tracked attribution (UTMs, click ID, referrer, first touch) covers where the lead came from. Trade-off: word of mouth and other untracked visits will show as direct/blank instead of a self-reported answer. Old values (e.g. "Evening (5pm-8pm)", "YouTube") stay in the "(old)" tab the migration keeps. Before removing, Claude Code checks every place that reads these fields: Bonzo payload, contact and guide emails, HubSpot fields, lead.mts validation, tests and the runbook.

Decision (Max, 8 Oct, on the build plan): rows are written **by header name**, not by position. This replaces step 5's "ensureHeaders refuses a sheet whose headers don't match the schema": a mismatch is alerted, never a reason to refuse a lead. Columns still move only through the migration function.

## Standard order for every lead tab
Timestamp | Submission ID | First Name | Last Name | Email | Phone | State | Licensed? | Source | Magnet/Goal | Form ID | Page | [funnel details] | UTM Source | UTM Medium | UTM Campaign | UTM Term | UTM Content | Click ID | Click ID Type | Landing Page | Referrer | First Touch Source | First Touch Medium | First Touch Campaign | First Click ID | First Click ID Type | First Touch At | Test? | Status | Contacted

Form ID tells apart two forms on one page (e.g. the FHA guide form vs the "Have Darren review my payment" form). New fields in future go into their logical block, through the same migration function.

## Funnel details per tab
- DSCR: Purchase Price | Down Payment | Loan Amount | Rate | Monthly Rent | Annual Tax | Annual Insurance | Monthly HOA | Monthly P&I | Monthly PITIA | DSCR
- FHA: Credit Score | Purchase Price | Down Payment % | Rate | Annual Tax | Annual Insurance | Monthly HOA | Est. Monthly Payment
- Real Estate Investing: none (Magnet covers it)
- Leads (contact/review forms on DSCR, FHA, REI, Mortgage Calculator): Loan Amount | Term (Years) | Rate (%) | Goals | Target Outcome | Timeline
- Debt Consolidation: Debts | Total Debt Balance | Total Debt Payment | Weighted Avg Rate | Home Value | Mortgage Balance | Mortgage Payment | Mortgage Rate | Mortgage Term | Estimated Home Equity | Current LTV | Current Monthly Payment | Monthly Savings | Refi Monthly Payment | Refi Monthly Savings | Same-Payoff Refi Payment | Same-Payoff Refi Savings | HELOAN Credit Tier | HELOAN Term | HELOAN Monthly Payment | HELOAN Monthly Savings | Rate Source Date
- Home Equity (new): Home Value | Mortgage Balance | Estimated Home Equity | Current LTV | Goal | Amount Exploring | Illustrative CLTV | Preference
- ADU (new): Home Value | Mortgage Balance | Estimated Home Equity | Current LTV | Project Cost | Amount to Finance | Illustrative CLTV | Project Purpose

Values from the preview (v4):
- Home Equity Goal: Pay Off Debt, Renovation / ADU, Investment, Major Expense, Something Else.
- Home Equity Preference (optional): Flexible access, Predictable payments, Keeping my current mortgage, Lowest monthly payment, I'm not sure.
- ADU Project Purpose: ADU for family, Rental ADU, Renovation, Other.
- Debt "Current Monthly Payment" is the "Today" card (mortgage P&I + all debts). Weighted Avg Rate only if the repo formula is balance-weighted.
- Optional Mortgage Rate / Mortgage Term stay blank when skipped, never 0.

New columns the site already sends but the Sheet does not store: Form ID, Page, First Touch Medium, DSCR rent/price/tax/insurance/HOA/P&I/PITIA. Submission ID is generated in Apps Script. Check whether the Savings values are clamped to positive; store signed values.

## Form gaps found in the preview (keep what the Sheet already relies on)
- FHA guide form: the preview drops Credit Score. Keep it (FHA tab stores it).
- Review/contact forms on DSCR, FHA and Mortgage Calculator: the preview shows only name, email, phone, state. The live contact forms also ask Goals, and the Leads tab stores Goals / Target Outcome / Timeline. Keep Goals at minimum; the brief also keeps "What are you hoping to accomplish?" and "Anything else Darren should know?" on the Mortgage Calculator.
- Guide forms (FHA, REI, DSCR) use one "Full name" field, same as live today; Apps Script keeps splitting it into First/Last.
- State dropdown in the preview is a 3-state sample; production keeps the full list and the licensed-state check.

## Migration (one release, low-volume moment)
1. Copy the whole spreadsheet as a backup.
2. One-time Apps Script function rebuilds each tab by HEADER NAME, not position: create "<Tab> (new)" with the new header order, copy each old row cell by matching header, leave new columns blank for old rows, verify row counts and a spot check, then rename old tab to "<Tab> (old 2026-10-xx)" and the new one to the live name. Columns dropped from the schema (Best Time to Call, Lead Source) are not copied; they stay readable in the old tab.
3. Deploy the matching Apps Script version (same /exec URL) immediately after, in the same window. The site change that removes the two debt consolidation fields ships in the same window. Keep the window short.
4. One test lead per tab (and per form where a page has two); check every value lands under the right header.
5. Update CLAUDE.md/AGENTS.md and the code comments: columns may move only through the migration function; ensureHeaders stays as a guard that refuses a sheet whose headers don't match the schema. (Superseded by the by-header-name decision above.)
6. Ask Darren/Kocah whether anyone has filters, formulas or saved views on these tabs, and whether Darren uses the best-time answer when calling.

## Findings from the repo (8 Oct), before building
- The weighted average rate is balance-weighted (`wtRate` in `DebtSavingsCalculator.tsx`), so the label is allowed.
- Savings are clamped in three places: `monthlySavings` and `heloanMonthlySavings` are sent only when positive, and `bestSave` floors each option at 0. `refiMonthlySavings` is already signed. The same-payoff refi is computed and never sent.
- Best Time to Call and Lead Source are read only by the calculator, the Debt Consolidation row builder, the rescue email's labels in `lead.mts`, and tests. Not by Bonzo, HubSpot or any email to the visitor.
- The debt `debts` array is sent and stored nowhere; "Debts" becomes a one-cell summary.

## Site wording (revamp spec sections 6 and 12, with Max's override)
Estimated Home Equity (not Available Equity); Estimated Monthly Savings (kept, per Max), shown as a payment increase when negative; Weighted Average Interest Rate only if balance-weighted; Illustrative CLTV (not available credit); Options worth discussing (not best loan / you qualify); Monthly Payment (P&I) where tax and insurance are excluded; "Your request has been received" (not "Darren has reviewed"). Never: approved, you qualify, available credit, guaranteed savings, best loan, a benchmark as a personal quote. Keep the line "Lower monthly payments do not necessarily mean lower total borrowing costs" near the savings figures. Sheet headers use the same words.
