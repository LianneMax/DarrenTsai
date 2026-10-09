# Google Ads launch verification and Claude handoff

Updated 10 October 2026 (Asia/Shanghai). Working checkout: `main`, `fba2134` at the start of this pass. This file supersedes the historical 9 October checklist where evidence below differs. A reported past result is not a fresh verification.

## Current decisions and new information

- **R1 decisions resolved by Max, 10 October:** Darren and Kocah do not use filters or saved views on lead tabs; Darren does not use the Best Time to Call answer. R1 preparation can proceed. This does not confirm the absence of formulas: audit formulas and preserve historical data before a production migration.
- **Cloud branch refreshed and cross-checked, 10 October:** `origin/claude/wizardly-ramanujan-1dww99` is eight commits ahead of local main, ending at `997054f`. The changes and Done log match Max's pasted cloud report. Its reported 1,040 tests and browser walkthroughs have not been independently rerun here; this checkout's earlier 1,021-test result applies to main. No merge, push or deployment is authorized by the pasted report alone.
- Preserve the existing website forms, `/api/lead`, Sheet fast path and Follow-ups queue. HubSpot receives leads through the existing server-side Forms API handoff; do not embed a replacement form.
- Max confirms the new HubSpot seat is active. Browser verification nevertheless shows restricted settings permissions: Reports & Analytics Tracking says "To edit these settings, you must be an authorized user"; contact property and automation controls are disabled. Seat activation does not prove edit permissions.
- Niko's 9 October email supplies `loan_amount`, `loan_type`, `property_use`, and `lead_source_detail`. He confirms form membership. Live property list on 10 October: `loan_amount` is Number; `loan_type`, `property_use`, and `lead_source_detail` are Single-line text. The loan_amount detail panel confirms the internal name and explicitly requires Edit property settings access to edit. Niko intends to change types; final contract remains pending before deployment, particularly if either text field becomes a dropdown.
- **Repeat-submission policy approved by Max, 10 October:** update Loan Amount, Loan Type and Property Use with the latest known answers; omit blank/unknown answers so they do not clear existing values. Do not insert an Unknown placeholder. Keep each form submission in the history. Do not reset owner, lifecycle stage, or deal progress on repeat submissions. Existing code already omits blanks; preserve that behavior when adding L12.
- Niko means one ads phone number, potentially a separate Business Profile number. This is distinct from the four-number website visitor pool. Keep the website pool unchanged unless its own configuration is explicitly reviewed.
- Qualified-call business decision is 90 seconds or more. Historical repo notes still say greater than 60 seconds. Inspect the actual CallRail rule and boundary before marking complete.
- Kocah accepts Calendly bookings as additional Ads bidding signals, potentially Primary; HubSpot is their business source of truth. Verify actual Ads settings without changing their decision. `phone_click` stays observation-only.
- Keep the HubSpot ads pixel for now. Cookie-banner choice waits on Darren. Disable non-HubSpot capture once access is verified, to remove a second collection path; collection does not necessarily duplicate every form/contact and must be tested.
- The test contact is reported removed in Niko's email. Do not delete broad TEST search results without verifying each record is a disposable test.
- Service-specific ad groups should use matching service pages and their existing calculators. Do not invent a calculator for the case-study offer. Final campaign names, budgets, states, and URLs still require Kocah's completed build.
- Keep Savings, show Payment goes up for negative values, store signed savings. Remove Best Time to Call and How Did You Find Me through R1. Columns may move only through the approved migration with backup and verification.
- Site wording has no computed APR or response-time promise. Contextual emails require copy approval before activation.

## Ordered work and evidence

| Order | Work | Status / evidence | Next action |
| --- | --- | --- | --- |
| A1 | Verify seat and permissions | CRM and settings pages open; tracking settings explicitly deny edits | Authorized admin grants required forms/settings/property permissions; preserve Kocah access |
| A2 | Non-HubSpot form capture | Search locates the setting, but its page and Submissions Settings display only headings/tabs with no collection control | Edit forms access needed; inspect Collect data from website forms, turn off if authorized; record before/after |
| A3 | Cookie banner / ads pixel | Decisions recorded; live settings not verified | Inspect only; banner decision from Darren, ads pixel kept |
| A4 | API form and properties | Form GUID `ee8340cf-71cb-4d76-a0af-a9fa5150461d`; Niko reports hidden fields present | Inspect all fields, required email, exact Yes/No INTERNAL values, property types and loan option values |
| A5 | Test contact cleanup | Niko reports removal | Verify remaining test identities, retain real leads |
| A6 | Loan-field mapping (L12) | Current main `hubspotFields()` omits all four named loan/detail fields; latest-known/omit-blank policy approved by Max | Verify final property contract, then implement pure mapping with meaningful tests, no fabricated defaults |
| A7 | HubSpot end-to-end test | Earlier H3 200 and hidden fields reported verified; no fresh test | Record initial HUBSPOT_SEND_TESTS state; enable only for controlled test, verify contact + submission + attribution + fields; restore initial state even on failure |
| A8 | Connections, plan, owner/lifecycle | Historical CallRail Active and Ads connected; not freshly verified | Inspect connections, plan entitlements, owner/notifications, lifecycle/deal policy; no assumed workflow subscription |
| B | GTM / GA4 / Ads / CallRail | Historical results only | Confirm one event per successful submit; no PII in GA4 parameters; filter includes current test traffic; call swap and 90-second rule; read actual conversion goals |
| D1 | Apps Script matches deployed site | Current docs/revamp/BRANCHES.md reports @44 from main, superseding the older @43 checklist; no fresh live-code comparison yet | Read live deployed code/version and manifest; compare to chosen release before any push; same deployment ID and /exec |
| D2 | R1 migration | Main lacks auditLeadTabs/migrateLeadTabs; R1 on debt-consolidation-page | Rebase/integrate in an isolated release, resolve redesigned calculator changes, rerun checks. Approval of concrete release/backup/deployment plan before production migration |
| D3 | Contextual emails | Draft documents/previews copied to main fba2134; template implementation remains on side branch; not activated | Review actual previews using existing template; preserve live email until signed off |
| C | Per-page launch acceptance | Eight pages now exist in main; no fresh acceptance yet | Local checks first, then approved controlled live tests per form, real iPhone, PageSpeed, canonical/sitemap/redirects, queue and CRM outcomes |
| E | Handoff to Kocah | Email reported, final campaign build not received | Provide final verified URLs after acceptance; user sends message |

## Current code versus the old checklist

- Cloud `docs/LAUNCH-CHECKLIST.md` needs these corrections when integrated: seat activation is complete but edit access is pending; Niko supplied L12 names and reported hidden fields present, while final types/options remain unresolved; R1 filters/saved-view and best-time questions are answered; Niko's one-number clarification does not replace the four-number website pool; the business call threshold is 90 seconds, not its historical over-60 wording; test-contact removal is reported by Niko. Do not mark these as independently verified account changes.
- Cloud security fix `38c61ed` adds `safeCell` / `appendSafeRow` for visitor text before Sheet writes. It remains outside main here and needs an in-place Apps Script release. The report calls the intended release @45; deployed @45 has not been verified.
- Cloud FHA review `9586dd4` uses `fha-payment-review` under source `fha-contact`, retaining the generic Leads route. Add this form ID to Kocah's handoff and L12 review mapping. Rate limiting and honeypot remain open decisions, not completed protections.
- Main contains `/adu/` and the homepage goal hub (`012f08e`, `3430fd2`). The old "ADU not built" statement is obsolete for the code. Live deployment and ADU backend version remain to verify.
- Main has Home Equity and ADU Apps Script routes, but deployment of a site commit is not proof of an Apps Script deployment.
- R1 and contextual email work remain on `debt-consolidation-page`. Do not deploy that whole branch's Apps Script as a small loan-field change.
- Main still writes `bestTimeToCall` and `leadSource` and has no migration functions. Existing schema decisions are recorded in `docs/lead-sheet-schema.md`.
- AGENTS.md, CLAUDE.md, SESSION_HANDOFF_PRIVATE.md and the opening of audit.md contain historical state (HubSpot unbuilt, confirmation silent, old page destinations). Use dated verified evidence, not those status claims, as current account state.

## Per-page acceptance ledger

| Page | Intended campaign/offer | Local status | Live end-to-end / speed |
| --- | --- | --- | --- |
| `/` | Goal hub and general guidance | In main | Live heading/canonical and swapped call number checked; full test pending |
| `/debt-consolidation/` | Debt calculator | In main; R1 pending | Live, numeric inputs empty, canonical and swapped number checked; full test pending |
| `/home-equity/` | Equity / HELOC estimate | In main | Live, numeric inputs empty, canonical and swapped number checked; full test pending |
| `/adu/` | ADU / renovation project snapshot | In main | Live, numeric inputs empty, canonical, GTM/HubSpot/CallRail script presence and swapped number checked; full test pending |
| `/dscr/` | DSCR calculator and guide | In main | Live canonical, empty numeric inputs, script presence and swapped number checked; full test pending |
| `/fha/` | FHA estimator and guide | In main | Live canonical, empty numeric inputs, script presence and swapped number checked; full test pending |
| `/realestateinvesting/` | BRRRR case study | In main | Live canonical, script presence and swapped number checked; full test pending |
| `/mortgage-calculator/` | Payment calculator/review | In main | Live canonical, empty numeric inputs and swapped number checked; full test pending |

For each form record: source, form ID, expected Sheet tab, TEST flag, Follow-ups status, email behavior, CRM result, generate_lead count, no PII in GA4. TEST leads must be skipped by Bonzo; tags/campaign mapping must be proven locally or through an explicitly approved non-nurture test, not by enrolling test borrowers.

## Claude continuation instructions

Read this file, `docs/lead-sheet-schema.md`, current `audit.md`, and the current tree before acting. Historical assistant suggestions in the recovered Claude chat are evidence of discussions, not fresh authorization to deploy/delete/message people. Max's subsequent decisions supersede earlier suggestions.

1. Finish A1-A4 and obtain the final L12 property contract. Repeat policy is settled: latest known loan answers, omit blanks, retain submission history and deal progress. Do not guess dropdown values or treat all property names as finalized field types.
2. Prepare L12 as a narrow change to the existing HubSpot field mapper with per-funnel cases, numeric normalization, blank omission, unknown-source protection, and repeat-submission coverage. Do not include R1 or activate R2 emails inadvertently.
3. Verify live Apps Script version against main, particularly ADU routing, before live ADU submissions.
4. Prepare the R1 release and migration with spreadsheet backup, header-name writes, duplicate-header checks, row/value preservation, pending-queue protection, rollback, and tests per tab. Do not reorder live headers alone.
5. Complete per-page checks before Kocah points an ad to that page. Preserve attribution, queue, rescue alerts, no false success, no raw gtag, and no GA4 PII.
6. Update this ledger after every actual check with date, evidence, result, remaining blocker, and next action. Ask Max before pushing; do not send the final URL list to Niko automatically.

## References

- HubSpot non-HubSpot collection requirements and settings: https://knowledge.hubspot.com/forms/use-non-hubspot-forms (checked 10 October 2026). Edit forms permission is required. Forms API handoff remains independent of collected-form discovery.
- Source context: Max's supplied Niko email dated 9 October; recovered Realdarrentsai.com website audit history; git and source checks on 10 October.

## Execution log

- 10 October: reopened the linked Claude audit conversation. Its latest visible entry is the older go-live checklist (@43, ADU not built); it does not include the eight newer cloud commits. Rendered the four existing contextual email drafts in the browser and left the preview menu open for Max. No email activated or sent. Removed obsolete "page not built yet" labels from the preview menu.
- 10 October: refreshed origin and verified all eight cloud commits (`c7fc7ba` through `997054f`). Recorded Max's R1 answers and corrected stale blockers against Niko's email and prior HubSpot browser evidence. Main and deployed services were not changed.
- 10 October: Max explicitly approved latest known Loan Amount / Loan Type / Property Use on repeat submissions, with blank values omitted and submission history retained. Recorded for L12; no CRM values changed by recording this decision.

- 10 October: working tree initially clean on main fba2134. Read AGENTS.md and private account handoff; confirmed both include stale state requiring live verification.
- 10 October: user confirms active new seat. Read browser CRM/settings. Tracking edits denied, property/automation controls disabled. No settings changed and no contacts deleted.
- 10 October: confirmed loan mapping missing on main, R1 migration absent on main, side-branch migration/email commits exist. No branches merged, code pushed, Apps Script deployed, or Sheet migrated.
- 10 October: read docs/revamp/BRANCHES.md. R1 is five commits outside main and predates phases 2-5. It must be adapted to current main, including Home Equity and ADU; do not merge blindly. That document reports deployed Apps Script @44. Draft email documents/previews already exist on main; executable contextual email code does not.
- 10 October: `npm run lint` and `npm run build` passed. Sandboxed tests suffered generated-cache ENOENT errors. Single-worker rerun outside sandbox established 1018 passing tests and three failures solely due to CRLF versus LF in identical early-click scripts. Corrected only those comparison guards in home-prerender, home-equity and adu tests; added presence assertions where absent. Full rerun after fixes: **28 files, 1021 tests passed** (`npm test -- --maxWorkers=1`). No production code changed.
- 10 October: layout runner's server failed to start under sandbox; existing runner passed outside sandbox: **8 pages x 9 widths, 72 checks**, no sideways scroll or undersized phone inputs. This local check blocks third parties and does not establish live tracking, real-iPhone behavior, or PageSpeed scores.
- 10 October: live browser checked ADU, Home Equity, Debt Consolidation and homepage hub. All four have matching canonical URLs and a tracking-pool telephone link. Numeric inputs on the three calculators start empty. No forms submitted, no booking/call created, and no live queue outcomes claimed. Browser detached while beginning checks of the established static pages; those remain pending.
- 10 October: browser recovered. DSCR and FHA also have matching canonical URLs, empty numeric inputs, GTM and CallRail script presence and swapped telephone links. REI page opened after navigation timeout; its full check remains pending. Browser delays do not establish a site defect.
- 10 October: completed initial REI and Mortgage Calculator checks after navigation settled: correct canonicals and tracking-pool telephone links; REI has GTM/CallRail script presence; mortgage numeric fields empty. All eight page openings/canonicals now checked. No submission, booking, phone call, live migration or deletion performed. Remaining launch acceptance is explicit in the ledger.

## Minimum HubSpot access request for the next step

Max's active seat can view the property list, but the loan_amount detail panel explicitly says **Edit property settings** is missing. Tracking settings deny editing. The Forms settings pages provide no collection control, and Forms is absent from available Marketing navigation. Ask the authorized administrator for Forms view/edit, Edit property settings, and the appropriate tracking/settings permissions; also verify contact scope can view the intended contacts. This is an administrator access change, not something this pass has performed. Do not create a developer app or private-app token to bypass it.
