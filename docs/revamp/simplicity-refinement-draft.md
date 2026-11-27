# Simplicity refinement draft

Prepared 27 October 2026 from the published-site simplicity review. The implementation checkpoint below supersedes the original draft status for the changes named there. Remaining proposals are not implemented, and no new usability score is claimed. The status section directly below is current as of 28 November 2026; the dated sections further down (27 and 28 October) are kept as history and are not the current plan.

## Status and next release, updated 28 November 2026

### Shipped 26 to 28 November

- Phone layout: the first home equity question sits on the first phone screen (8e6237e); the payoff path gets the same spacing (f1724b5).
- Payoff path starts with one debt card and "+ Add Another Debt" (f1724b5). The lone card keeps the row grid so Balance never drops into the remove-button column on mid-width screens, and Debt Type spans the full row on phones (2530814, 28 Nov, after Max's live screenshot).
- equity_path milestone: switching between "Access my home equity" and "Pay off high-interest debt" pushes equity_path with path = equity or payoff, consent-gated through the public/attribution.js allowlist (f1724b5). It reaches GA4 only once the GTM tag in finding 1 is published.
- "5+ units or commercial" property type on /home-equity/ and the /book/ prequal (2592cdc). On /home-equity/ it replaces the use/ZIP step with a short note and a "Talk to Darren about this property" button that opens the booking prequal; the prequal accepts it, the Sheet routes it to the Commercial tab, and the HubSpot call task shows "Property type: 5+ units or commercial". Apps Script deployment @77.
- All Leads Sheet: five columns added (UTM Term, Goal, Cash Range, Property Type, Inquiry Message), filled from whichever form tabs carry them.
- Uptime watch: Netlify and the Apps Script check each other and alert on failure (d9e1f19).

### Previous status, 25 November 2026

Re-checked against the code (48 commits since 27 Oct, last 9451841 on 23 Nov) and a read-only walk of the live site on 25 Nov. Nothing was submitted and no personal data was entered. The browser used had optional cookies rejected, so live dataLayer checks were limited to the consent default; event coverage below comes from the code and the published GTM container (GTM-N7Z8Q4QF, fetched 25 Nov).

### Already done (no further work)

- Item 1, comparison actions: priced Discuss buttons advance to contact with the selection kept (27 Oct, 8f6cebe and 2c60bde).
- Item 2, amounts vs monthly payments: explicit monthly units and the HELOC borrowing-room label (27 Oct).
- Calendar first after a saved eligible inquiry, across equity, payoff, ADU and the opt-ins (28 Oct onward).
- Cookie banner with equal Accept and Reject; Google tag on unless rejected (13 Nov, 8d2a1ca).
- ZIP/state correction, one button style (11 Nov, d3e94ea), new site emails and the 24h call reminder (21 Nov).
- Booked calls are now recorded server side: the Apps Script reads Google's "Appointment booked" email in HubSpot and moves the contact to Marketing Qualified Lead, which HubSpot sends to Google Ads (21 to 23 Nov).

### Still open from this draft

- Item 3, final step easier to scan: shipped 28 Nov (99e8e9c) after Max approved the local preview; see item 3 below.
- Item 4, plain words for abbreviations (P&I, HELOAN, CLTV). Not done.
- Follow-on: consistent Back/Continue and inline errors; 200% zoom, keyboard and screen-reader pass. Not done.

### Findings from the 25 Nov walk, in priority order (status 28 Nov)

Finding 1 (GTM) is still open and is in the draft to Niko. Finding 2 is done (equity_path). Finding 3: the phone spacing part is done; the ad and video links pointing straight at /home-equity/?goal=payoff are still open. Finding 4: the 5+ units answer is done; the optional "Any other loans on the home?" question is not. Finding 5 is done.

1. **Form steps are invisible in GA4 (highest priority, no site code change needed).** The site pushes form_start, form_step, form_error, booking_page_shown and booking_prequal_declined into the dataLayer, but the published GTM container only has GA4 tags for generate_lead, phone_click and three dead Calendly events (calendly_open, calendly_booking, calendly_stalled). So GA4 sees a page view and then either a lead or nothing. Fix in GTM: add one GA4 event tag that forwards form_start, form_step, form_error, booking_page_shown, booking_prequal_declined and equity_path (below) with form_id, step_id, error_code and field_category as parameters; register those as custom dimensions in GA4; delete the three Calendly tags. Publish, then confirm in GA4 DebugView.
2. **Track which path a visitor picks on /home-equity/.** The "Access my home equity" vs "Pay off high-interest debt" switch fires nothing, so we can't tell how many visitors want the debt payoff comparison. Add a consent-gated milestone, for example equity_path with path = equity or payoff, through the existing milestone allowlist in public/attribution.js.
3. **Give credit-card searches their own entry point.** The debt payoff comparison already exists as its own form (form id debt-savings-calculator, lead source DebtConsolidation) but lives at /home-equity/?goal=payoff behind a toggle. Rudy's 19 Nov ad click searched "use home equity to pay off credit cards" and ended in the general booking prequal, not this comparison. Point the debt-payoff ad group and the debt-payoff video links straight at /home-equity/?goal=payoff (or a short /pay-off-debt/ alias that opens it). On phones, the payoff path also shows the home value / mortgage / equity house illustration above the debt form, which is about the other path and pushes the first question below the fold; hide it on the payoff path.
4. **Route larger or business properties before the call.** Property type offers single family or condo, 2 to 4 units, or mobile home or land. A 16-unit building (Kariyana, 20 Nov) has no honest answer and arrives as a home equity lead. Add "5 or more units or commercial", and send that answer to the DSCR or commercial path (booking prequal already has "Commercial or custom"). Property use already asks primary, second home or rental. The form asks the first mortgage balance but not other liens (an existing HELOC or second); consider one optional "Any other loans on the home?" question, since it changes the borrowing room.
5. **Payoff path is long on phones.** Five steps, with two empty debt cards shown up front. Start with one debt card and the "+ Add another debt" button.
6. Then items 3 and 4 of this draft, and the follow-on access checks.

## Tracking coverage, 25 November 2026

How each step is recorded today. "Pushed" means the site writes it to the dataLayer. "In GA4" means the published GTM container forwards it. Milestones (form_start, form_step, form_error) only push when Google consent is on (on unless the visitor rejects). HubSpot and CallRail load only after Accept.

| Journey | Step | Pushed? | Event | In GA4? | Gap |
| --- | --- | --- | --- | --- | --- |
| All pages | Page load | Yes | page_view (Google tag) | Yes | None |
| All pages | Phone number tapped | Yes | phone_click | Yes | None |
| /home-equity/ | Path switch (equity vs payoff) | Yes (since 27 Nov) | equity_path, path = equity or payoff | No | GTM tag |
| /home-equity/ equity | First field touched | Yes | form_start | No | GTM tag |
| /home-equity/ equity | Step 1 home, step 2 goal, step 3 details completed | Yes | form_step step_id 1 to 3 | No | GTM tag |
| /home-equity/ equity | Validation or out-of-area | Yes | form_error | No | GTM tag |
| /home-equity/ equity | Prequal knockout | Yes | booking_prequal_declined | No | GTM tag |
| /home-equity/ equity | Lead saved | Yes | generate_lead + virtual_page_view | generate_lead only | None that matters |
| /home-equity/?goal=payoff | Debts, home, compare, details steps | Yes | form_start, form_step (debt-savings-calculator) | No | GTM tag |
| /home-equity/?goal=payoff | Discuss button on a comparison card | No | none | No | Add which option was picked (form_step carries it only as a step) |
| /home-equity/?goal=payoff | Lead saved | Yes | generate_lead | Yes | None |
| /book/ prequal | Goal, property, details steps | Yes | form_start, form_step 2 to 4, form_error | No | GTM tag |
| /book/ prequal | Knockout | Yes | booking_prequal_declined | No | GTM tag |
| /book/ prequal | Lead saved | Yes | generate_lead | Yes | None |
| All calendar flows | Calendar shown | Yes | booking_page_shown | No | GTM tag |
| All calendar flows | Call booked | No (Google's calendar can't report it) | HubSpot lifecycle MQL via Apps Script, sent to Ads as Book appointment | Not in GA4 | Fine for Ads; GA4 can't see bookings |
| /adu/ | Steps, errors, lead | Yes | form_start, form_step, form_error, generate_lead | generate_lead only | GTM tag |
| /dscr/, /fha/, /realestateinvesting/ guides | Steps, errors, lead | Yes | form_step, form_error, generate_lead | generate_lead only | GTM tag |
| Contact modals (home, calculator, ADU, DSCR, FHA, REI) | Open, errors, lead | Start and errors yes; open no | form_start, form_error, generate_lead | generate_lead only | GTM tag; modal open not tracked |
| /mortgage-calculator/ | Using the calculator | No | none | No | Optional: one calculator_used event |
| Back buttons and step tabs | Going back | No | none | No | Low priority |

Recommended new or forwarded events, all PII-free: form_start, form_step, form_error, booking_page_shown, booking_prequal_declined (forward in GTM), plus equity_path (pushed since 27 Nov) and option_selected (new, small code change). With these, GA4 can show a step-by-step drop-off funnel for each form.

## Intended outcome

A homeowner should understand their current payment, compare the available paths, and request a conversation without needing mortgage vocabulary. Preserve the existing visual identity, home/equity illustrations and goal-first journey. The adult audience spans ages 20–60; prioritize reading preference, mortgage familiarity, screen size and keyboard/touch needs rather than assuming ability from age.

The incumbent source and 26 October production screenshots are the layout authority. DESIGN.md is an older homepage brief with superseded integration descriptions; PRODUCT.md is absent. This proposal does not rewrite either artifact or replace the site's brand.

## Recommended first release

### 1. Make every comparison action behave consistently

Current issue: HELOC advances to contact; the other Discuss buttons toggle selection and stay on the comparison.

Proposed behavior: every available option gets a named Discuss button that selects that option and advances to the existing contact step. The visitor can go Back, retain their numbers and selection, and choose another option. No button on the comparison submits a lead. Keep one page-level action for visitors who want Darren to compare all options.

| Current | Proposed draft |
| --- | --- |
| Discuss a HELOC | Discuss a HELOC |
| Discuss this option, fixed loan | Discuss a home equity loan |
| Discuss this option, refinance | Discuss this refinance |
| I want to discuss this, toggle state | Selected option shown in the contact recap |
| Have Darren Compare Full Costs | Help me compare all options |

Distinguish the two refinance terms in each card and the final recap, even if their button wording is shared. A not-estimated card must explain what is missing; never invent a payment to make it look complete. Retain the current HELOC contact action when an example cannot be calculated, with honest no-room/missing-data wording.

### 2. Distinguish borrowing amounts from monthly payments

Keep today's monthly payment above the four cards and retain the desktop side-by-side arrangement. On phones use the existing card order and stacking; do not shrink type to squeeze four cards onto one screen.

| Element | Proposed treatment |
| --- | --- |
| Today | “Your current monthly payments” with `$X / month` |
| HELOC | “Illustrative borrowing room” immediately above `$X`; “Amount, not a monthly payment” immediately below |
| Fixed loan | `$X / month`, followed by “Existing mortgage + new home equity loan” |
| Refinance | `$X / month`, followed by “New mortgage principal and interest” |
| Difference | “Estimated monthly payment difference: $X lower/higher” |

Keep the HELOC 85% planning assumption, other-lien limitation and lender-eligibility language beside its amount. Give it a distinct amount label rather than a green payment-difference treatment. No HELOC rate, approval, available-credit promise or total-savings claim is added.

### 3. Make the final step easier to scan

Retain all approved consent wording and the existing step count. Organize the final screen in this order:

1. Contact summary, editable through Back.
2. “Anything you’d like Darren to know?” with the existing optional label, 2,000-character limit and sensitive-data warning.
3. “Required privacy acknowledgement,” visibly separated from the optional choices.
4. Keep informational and marketing choices distinct and unchecked; do not restore the removed “Text messages (optional)” heading.
5. One existing submit action, followed by the necessary disclosures.

Improve spacing, line length and secondary-text readability. Do not collapse, hide, preselect, shorten or combine legally significant consent text. Copy that changes consent meaning needs separate content approval.

Shipped 28 November (99e8e9c), after Max approved a local preview. Today the final step on every funnel (home equity, payoff, the /book/ prequal and the opt-ins) is one shared consent block: required acknowledgement first, then the two text choices and their disclosure, with no contact recap. The preview keeps every checkbox, its exact wording and its data attribute, and only reorders and groups them:

1. A light card "Darren will contact you at" with name, email and phone, and an Edit link that goes back to the details step.
2. The two optional text choices and their disclosure inside one bordered group, with no heading, the disclosure in smaller type.
3. A divider, then the required privacy acknowledgement on its own directly above the submit button.

The anything-to-add message stays on the details step, where it lives today. It is in the shared consent component, so the home equity, payoff and ADU funnels changed together; the /book/ prequal got the same summary and order, and the DSCR, FHA and investing guide modals got the same order (no summary card there, because their contact fields share the screen). Tests that read the checkboxes by data attribute stay valid.

Screen property eligibility only on the final deliberate, privacy-acknowledged submission. Keep the existing four booking stages. Supported saved leads reach the calendar; outside-area saved inquiries reach the correct recorded exit. Do not open the calendar or fire the qualified lead event on checkbox changes.

### 4. Replace unexplained abbreviations where the comparison happens

| Current shorthand | Proposed first-use wording |
| --- | --- |
| Mortgage P&I | Mortgage principal and interest |
| HELOAN | Home equity loan |
| CLTV | Combined loan-to-value, explained as total loans secured by the home divided by home value |
| Refi, Same Payoff Date | Refinance over your remaining mortgage term |

Keep precise calculation details available. Explain the remaining-term option as preserving the entered payoff timeline, without implying that its total cost is lower. Do not make factual promises or add unapproved claims.

## Follow-on refinement

- Use consistent Back/Continue placement and inline error placement across guides, calculators and booking. Errors retain answers and move keyboard focus to the relevant error or field.
- Retain truthful loading states: saving the request first, then loading Google Calendar only after a matching saved receipt. Preserve the existing open-calendar-in-new-tab fallback. Showing the calendar remains distinct from a confirmed appointment.
- Check secondary/legal text at native browser zoom and with keyboard/screen-reader navigation. Preserve the shared FAQ and page styling; do not solve long screens by reducing readable type or making disclosures inaccessible.

## Boundaries

This draft does not change calculator mathematics, loan/rate assumptions, state coverage, source/form/tab identities, required privacy, optional SMS policy, attribution retention, conversion ownership, CRM owners, email subscriptions or deployment architecture. All initial inputs stay blank. Outside-area inquiries remain Sheet-only. Do not change every page's hero or animation as part of this refinement.

## Acceptance before publication

| Area | Required proof |
| --- | --- |
| Comparison actions | Each supported button selects the intended option and reaches contact without posting; Back retains answers; the final submission keeps the exact discussion choice |
| Honest figures | Borrowing-room and monthly-payment units are distinguishable; blank, zero-room, paid-off, partial-payoff and payment-increase cases remain accurate |
| Consent | Privacy remains required; SMS remains optional and unchecked; no early screening, submission or calendar reveal |
| Capture | Supported and outside-area fixtures retain exact message, state, consent and snapshots; outside inquiries never dispatch to CRM, guide email or qualified conversion |
| Reflow and access | Desktop, tablet, 320/390px phones, actual 200% zoom, keyboard focus/order and a screen-reader pass; no sideways scroll, hidden errors or clipped actions |
| Delivery | Full repository suite/types/lint/build plus real-browser checks; coordinated retained live TESTs only for changed delivery behavior, without appointments or campaign activation |

Use the same review rubric to compare the next version. Invite actual participants with differing mortgage familiarity and device preferences before claiming an age-specific improvement or a higher completion rate. No conversion-uplift percentage is promised.

## Suggested delivery order

First implement items 1–2 together on payoff and check comparison clarity. Then apply items 3–4 through the existing shared form components and static counterparts, preserving all routing. Finish with the manual access checks and one bounded desktop/mobile review. Any publication remains a separate approved release.


## Implementation checkpoint, 27 October

Published and verified27October2026 (8f6cebe, with accessibility follow-up2c60bde): payoff and equity share the saved-receipt calendar; booking actions across funnels reuse a recent confirmed inquiry instead of submitting a second lead; explicit failed checks and outside-area receipts never open the calendar. Context lasts 30 minutes in the same tab and carries only the receipt, first name and property screening context. It does not put borrower details into the calendar URL. The existing Google booking confirmation is still a separate step inside Google's calendar.

The comparison retains the current payment above the side-by-side options, adds explicit monthly units and makes priced Discuss actions advance to contact with the selection retained. The HELOC figure remains a labelled borrowing-room illustration, not a quoted payment or guaranteed savings. Calculations, sources, state coverage, consent copy, CRM/email jobs and Ads conversion ownership are unchanged.

Dynamic call elements request CallRail's documented swap API only when optional tracking is accepted; the existing working phone number remains the fallback. Review dialogs now center horizontally and vertically. Outside-area confirmation says the inquiry/message is recorded for Darren and limits any follow-up to a general question, without promising financing or an appointment.

The remaining consent-hierarchy and expanded-terminology proposals remain draft work. The removed optional-SMS heading stays removed; five payoff input labels and email button contrast were corrected during the release review. Do not claim participant testing or a higher score from this patch.

## Darren's HubSpot first-look summary, admin handoff

The current seat can change only its own Key information card. The shared Contact record customization screen requires admin access. Do not mistake a personal card edit for a change Darren can see, or create guessed values to remove blanks.

Recommended shared card order:

| Order | Visible property | Purpose |
| --- | --- | --- |
| 1 | Message (`message`) | Read the visitor's own question first. |
| 2–3 | Phone Number, Email | Know how to respond. |
| 4 | Loan Type (`loan_type`) | See a known loan/program interest; omit unanswered values. |
| 5 | Loan Amount (`loan_amount`) | See a supplied amount, without inventing one from a range. |
| 6 | Property Use (`property_use`) | Distinguish primary, second home and investment. |
| 7 | State/Region (`state`) | In the site's submissions this is the property state. Do not label it residence state. |
| 8 | Website Lead Source (`rdt_lead_source`) | Identify the entry funnel; keep original acquisition separately. |
| 9–10 | Contact owner, Lifecycle Stage | Show responsibility and the actual recorded status. |
| 11–12 | Lead Status, Last Contacted | Show real follow-up work, when recorded. |

The admin should verify property/API-form membership and real values before publishing the card, then check it from Darren's login. Retain legal-basis and email-confirmation properties in a separate compliance section. Their blanks do not justify marking legal basis, email verification, ownership or contact activity as confirmed. Full comparison details remain in the Sheet unless a separate CRM mapping is accepted. Never enable messaging subscriptions or sales automations as a layout fix.


## November 1 campaign preparation, updated 28 October

Campaign launch is November 1, 2026, per Max. Keep activation off until Kocah/Niko performs the launch checks. This section supersedes earlier draft ordering for these specific requests. No deployment is implied by a local implementation.

### Local fixes prepared now

- ZIP/state correction: choosing another state clears a known or pending ZIP instead of inventing a ZIP for that state. The chosen state stays visible; a valid replacement ZIP is required to continue. Unknown/unavailable ZIPs retain the existing explicit confirmation path. No early service-area exit or coverage change.
- Calendar first: eligible saved inquiries lead directly with Pick a time across equity, payoff, ADU and DSCR/FHA/investing opt-ins. React recaps move below it in collapsed saved-answer sections. Shared static success handling removes the extra booking button only after it has reused a matching eligible receipt. No second POST, duplicate inquiry or calendar for outside-area/failed receipts.
- Cash range is the visitor's requested cash band on the regular equity path, not a calculator output, qualification or monthly savings. The regular equity question and saved-answer label make that meaning explicit. The dedicated payoff path continues to use the visitor's entered debt amounts, not a synthetic cash band.
- Cookie preferences offer Accept and Reject, with equal prominence. The single optional category, default denial, GPC override, storage failure behavior, footer reopening and rejection/reload behavior remain. No optional vendor starts before acceptance.
- Booking styles load early; the questionnaire does not paint without its stylesheet. The weighted average interest-rate label stays on one line using responsive rows rather than tiny text.

### Payoff comparison proposal for approval

Preserve the current four steps and blank starting inputs. Focus the comparison on payments using the visitor's own figures. Do not turn a monthly payment reduction into a total-interest-savings promise.

1. One compact current-payment strip: current mortgage plus listed debts, with a breakdown available on demand.
2. Three main columns at desktop: HELOC, fixed home equity loan, cash-out refinance. Use readable stacked rows on phones. The second refinance term becomes a term choice within the refinance column rather than a fourth equally prominent product.
3. For each priced option, show only the combined monthly payment, estimated difference versus today, a one-line keeps/replaces-your-mortgage explanation, and a named Discuss action that advances to contact without submitting.
4. For HELOC, show illustrative borrowing room and the current 85% combined-LTV assumption. Keep the amount labelled as borrowing room, never a monthly payment or approved line. Monthly difference needs approved index/margin/floor/cap/draw/repayment terms first.
5. Put assumptions and full calculations behind clearly named expanders. Keep the nearby essential risk sentence: a lower monthly payment can extend repayment and increase total interest; the home secures the debt. Keep required disclosures accessible below.
6. One page action: Compare these with Darren. After contact/privacy submission and a matching saved receipt, show the calendar immediately. Outside-area submissions remain recorded inquiries with the calendar blocked.

### Save speed: measure, then narrow the fix

The observed production save wait was about 6–9 seconds. This was end-to-end confirmation, not page rendering or a guaranteed throughput figure. A 25-second request budget is a ceiling, not a minimum wait. Do not show a saved/calendar state before durable capture is confirmed.

The source has several plausible costs, not yet separately timed: the Netlify rate/DNS checks, Apps Script execution/redirect overhead, workbook opening, lock admission, cross-tab replay scans, schema/header access, capture/queue writes plus flush, and optional CallRail queue admission after the main lock releases. The CRM/email worker already runs separately; moving it again cannot explain or fix this path.

- Oct 28: add PII-free phase timings around those boundaries and establish warm/cold and retry distributions. Keep payloads, contacts and secrets out of logs. Inspect production settings before attributing delay to optional integrations.
- Oct 28–29: optimize the measured dominant work only. Prefer fewer Sheet round trips and reused header reads within one execution. If indexing is warranted, use a verified pointer with authoritative-row fallback; CacheService alone must never decide whether a submission was saved.
- Keep the saved row and recoverable Follow-ups job durable before acknowledgment. Moving optional work requires a recoverable worker handoff, not a fire-and-forget promise.
- Oct 29: stage a bounded simultaneous-request test at the expected campaign peak and a small margin. Verify unique captures, same-ID retries, changed-payload conflicts, exact field preservation, outside-area exclusion, queue drain and receipt/alert agreement. Collect p50/p95/error/backlog figures. A browser mock or unit test is not a production capacity certificate.
- Max set the acceptance target to at most 15 simultaneous submissions. The production backend burst did not pass smooth-admission acceptance; see the private audit for measured results and recovery. Daily traffic is still unknown, and no safe requests-per-second figure is established.
- Prepare bounded retries within the existing public request budget only for explicit capture_busy refusals, retaining the exact payload/ID. Stop on uncertain outcomes, conflicts or consent/validation failures. This can improve contention recovery but does not replace shortening the locked work; do not extend wait budgets or promise every burst fits before measuring.
- Retest the same 15-request target after the measured critical-section improvement. Keep the per-IP protection intact and test it separately. If durable Sheet acknowledgment still cannot meet the target, review a larger durable-ingress design before launch rather than faking success.

### Short close-out checklist and owners

| Target | Owner | Completion proof |
| --- | --- | --- |
| Oct 28 | Engineering / Max | Review and publish the small UI patch; production eligible/outside/error/browser and exact-message readbacks; keep marked tests retained |
| Oct 28–29 | Engineering | Phase timing and one measured latency improvement; bounded concurrency results against the agreed traffic target; rollback available |
| Oct 29 | Engineering / marketing | Correct legal/privacy canonical trailing slashes and truthful sitemap significant-change dates; one indexability review, without repeatedly resubmitting utility URLs |
| Oct 29–30 | HubSpot admin / Niko | Publish Darren's useful summary card; prove unowned-new-contact owner/notifications, existing-owner/original-attribution preservation and known-value repeat updates |
| Oct 30 | Kocah / Niko | Final campaign/ad-group/keyword/page/budget/state mapping; resolve conversion warnings and accept consent/enhanced-conversion/website-versus-call ownership |
| Oct 30 | Darren | Messaging readiness, exact approved claim scope and actual response expectations; only approved assumptions may price a HELOC |
| Oct 31 | Engineering / Max / Kocah | One final live smoke pass, inbox and queue review, rollback/freeze; November 1 launch decision owned by the campaign team |

Not required to activate search campaigns: a confirmed-calendar booking import, a guessed sales pipeline, nurture/SMS activation, broader AEO/content tools and the deferred YouTube replies. Keep these pending rather than substituting calendar views for appointments or configuring a speculative pipeline. Form/call tracking still needs the acceptance above.

HubSpot acceptance remains separate: ordinary TEST contacts stay excluded. Use an admin-coordinated, controlled CRM acceptance test for ownership, notifications and update rules, then restore ordinary suppression. Do not bulk-enable tests or send Darren surprise test notifications.

Local verification, 28 October: the full 1,872-test suite, lint, types and production build pass. Real local browser checks cover the ZIP correction, eligible equity/investing calendar-first flow, narrow cookie controls and desktop/phone statistics. These fixtures do not establish delivery or traffic capacity; the independent production burst evidence is retained only in the local audit. No new UI publication or paid/nurture/SMS activation.
