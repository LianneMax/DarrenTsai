# Manual test runbook

How to verify by hand that a lead travels the whole way: from the form on the
site, into the Google Sheet, into Bonzo, and out as a guide email, with its ad
attribution intact.

You need: the live site, edit access to the leads Google Sheet, and a Bonzo
login. Allow about 45 minutes for a full pass, most of it waiting.

Run this after any change to the forms, the Apps Script, or the lead endpoint.

---

## 0. Before you start

### Name every test lead so it can be found and removed

| Field | Use |
| --- | --- |
| First name | `ZZTest` |
| Last name | the date, e.g. `Sep26` |
| Email | `zztest+<case>-<date>@gmail.com`, e.g. `zztest+dscr-sep26@gmail.com` |
| Phone | a real-format US number you do not mind being stored |

`ZZTest` sorts to the bottom of every tab, which is what makes cleanup in
section 5 quick.

### Every case needs a different email

Bonzo answers `422 "A prospect with this information already exists"` if you
reuse one. **That is the integration working, not a failure.** It means Bonzo
recognised the person. Change the `+case` part for each test and it will not
happen.

The plus-sign trick works in Gmail: `zztest+dscr@gmail.com` and
`zztest+fha@gmail.com` are different addresses to us, and both arrive in the same
`zztest@gmail.com` inbox, so you can still read the guide emails.

Use a `@gmail.com` address. The endpoint checks whether an email domain can
actually receive mail, and gmail is on the skip list, so that check cannot
interfere with what you are really testing.

### Where to look

- **Sheet:** one tab per funnel. `DSCR`, `FHA`, `Real Estate Investing`,
  `Debt Consolidation`, `Leads`, and `Home Equity` and `ADU` once each has had
  its first lead, plus `Follow-ups` and `Debug` which you will use for
  diagnosis.
- **Bonzo:** the prospect record, its Tags, and its Mortgage fields.

---

## 0.5 The Sheet schema migration (R1, once)

This is the release that replaces the append-only rule. Rows are written under
their header **by name** from this version on, and `migrateLeadTabs()` puts the
existing tabs into the one standard column order. Do it in one sitting at a
quiet hour. Every step is safe to stop after: a lead that arrives mid-way still
lands under the right headers.

**Before the window.** Answered on 10 Oct: nobody keeps a filter or a saved
view on the lead tabs, and Darren does not use Best Time to Call. If that has
changed: a formula is copied as its current value, not as a formula, and a
filter stays on the old tab.

1. **Copy the spreadsheet.** File > Make a copy. Name it with today's date.
2. **Deploy the Apps Script, in place,** as @47 from `main`: the "@47" section
   of `docs/APPS-SCRIPT-DEPLOY.md`. Never a new deployment: that changes the
   `/exec` URL.
3. **Run `auditLeadTabs`** from the editor, then open the `Debug` tab. One line
   per tab. Read every one:

   | It says | Meaning |
   | --- | --- |
   | `NEEDS MIGRATION (...)` | Expected for all five existing tabs the first time |
   | `New columns it will gain` | Blank on old rows afterwards. Correct |
   | `Left behind: Best Time to Call, Lead Source` | Debt Consolidation only. They stay readable in the old tab |
   | `Carried across though not in the schema: "..."` | A column someone added by hand. It is kept, after `Contacted` |
   | `Formulas: N` above 0 | Stop and look at them first |
   | `Filter on the tab: YES` | Note it; re-create it on the new tab afterwards |
   | `Home Equity` / `ADU` / `Self-Employed`: `no such tab yet` | Expected until each has a lead |
   | `FHA` or `DSCR`: `no such tab yet` | **Stop.** The tab exists, so its name does not match. Send the line to Max before migrating |

   On 10 Oct the audit was run in the test harness against the live Sheet's
   real header rows: all five tabs read `NEEDS MIGRATION`, every value moved
   under its own header, and only the two Debt Consolidation columns above
   were left behind.
4. **Run `migrateLeadTabs`.** A few seconds. Read the `Debug` tab again:

   | It says | Do |
   | --- | --- |
   | `migrated N row(s) ... Original kept as "X (old 2026-10-..)"` | Check N against the old tab's row count |
   | `already in schema order, left alone` | Nothing. Safe to have run twice |
   | `NOT MIGRATED, row R has two different values under "Status"` | The tab is untouched. Two columns share that header and disagree on that row; clear the wrong cell and run again |
   | `NOT MIGRATED, the copy did not match` | The tab is untouched. Send the line to Max |

5. **Check three rows per tab by eye**, old tab beside new: a name, an email
   and whatever is in `Status` and `Contacted` must be under the same header in
   both. On Debt Consolidation check the oldest row: its `Total Debt Balance`
   must be the same number in both tabs.
6. **The site is already out.** It shipped with `main` on 10 Oct: the debt
   page stopped sending the two removed fields and sends the new ones (signed
   savings, equity, LTV, today's payment, the debts' average rate, the
   same-payoff refi and the rate date). The old script ignored them; from
   step 2 on they reach their columns.
7. **One test lead per tab**, with fake details only (`delivered@resend.dev`,
   a `555-01xx` phone): cases 1.1 to 1.5, 1.10 and 1.11. For each, read the
   row header by header.

| After the migration | Expect |
| --- | --- |
| Every lead tab's first columns | `Timestamp`, `Submission ID`, `First Name`, `Last Name`, `Email`, `Phone`, `State`, `Licensed?`, `Source`, `Magnet/Goal`, `Form ID`, `Page` |
| Every lead tab's last columns | the attribution block (with `First Touch Medium` after `First Touch Source`), then `Test?`, `Status`, `Contacted` |
| A new row's `Submission ID` | A long id. The same id is inside that lead's `Payload` on the `Follow-ups` tab |
| A new row's `Page` | The path only, e.g. `/dscr/` |
| An old row's new columns | Blank. Those leads were never asked |
| Inbox | No "Sheet columns out of order" email after step 4. Before it, one per tab is expected |

If a "Sheet columns out of order" email arrives on a later day, someone moved,
renamed or deleted a column by hand. No lead is affected. Rename the header
back, or run `migrateLeadTabs` again.

**Rollback.** Deploy the previous version in place (Manage deployments > edit >
pick the old version). The new tabs stay; the old script appends by position
again, so rename each "(old ...)" tab back over its new one first.

---

## 1. The five funnels

One case each. For every case: fill the form, submit, then check the three places
in order. Give the Sheet a few seconds and Bonzo up to a minute.

### Case 1.1 - DSCR

1. Go to `/dscr/`. Run the calculator with any numbers.
2. Click through to the lead form. Fill it in. State: **CA**.
3. Submit.

| Check | Expect |
| --- | --- |
| Site | The form is replaced by the success panel |
| Sheet tab `DSCR` | A new row. `First Name` = ZZTest, `Licensed?` = **Yes**, and the `DSCR`, `Down Payment`, `Loan Amount`, `Rate` columns match what the calculator showed |
| Bonzo prospect | Exists, enrolled in campaign **258025** |
| Bonzo tags | `dscr`, `investor`, `priority:p2`, `licensed-state`, `state:CA` |
| Bonzo note | A **pinned** note with the full scenario, including `Annual property tax`, `Annual insurance` and `Monthly HOA` |
| Email | The DSCR guide PDF arrives, cover personalised. **Up to a minute later.** |

The pinned note matters. Those three figures have no Bonzo field of their own, so
the note is the only place they survive.

### Case 1.2 - FHA

1. Go to `/fha/`. Fill the form. State: **CA**. Pick any Credit Score.

| Check | Expect |
| --- | --- |
| Sheet tab `FHA` | New row, `Credit Score` populated, `Licensed?` = Yes |
| Bonzo | Campaign **145797** |
| Bonzo tags | `fha`, `fha-calculator`, `newsletter`, `priority:p4`, `credit:<the score you picked>`, `licensed-state`, `state:CA` |
| Email | The FHA calculator `.xlsx`, greeting you by first name |

The `newsletter` tag on an FHA lead is deliberate, not a bug.

### Case 1.3 - Real Estate Investing

1. Go to `/realestateinvesting/`. Fill the form. State: **CA**.

| Check | Expect |
| --- | --- |
| Sheet tab `Real Estate Investing` | New row |
| Bonzo | Campaign **261737** |
| Bonzo tags | `real-estate-investing`, `case-study`, `priority:p5`, `licensed-state`, `state:CA` |
| Email | The case study PDF |

### Case 1.4 - Debt Consolidation

1. Go to `/debt-consolidation/`. **Before touching anything, try "Continue to Home Info".**
   It should stop you and say a debt is needed. The two debt rows must be empty,
   with grey `e.g. ...` placeholders, not a filled-in credit card and auto loan.
2. Enter one debt. Try "See My Comparison" with step 2 blank: it should stop you
   too. Then fill in step 2.
3. Work through all four steps and fill in the contact step. State: **CA**. Submit.

| Check | Expect |
| --- | --- |
| Site | Success card, "You're all set!" |
| Sheet tab `Debt Consolidation` | New row with the savings figures. `Licensed?` sits straight after `State`, as on every tab since the R1 migration; `Test?`, `Status` and `Contacted` are the last three |
| Sheet `Debts` | One readable line per debt you entered, e.g. `Credit Card $8,500 at 24.99% ($250/mo)` |
| Sheet `Estimated Home Equity` / `Current LTV` / `Current Monthly Payment` | The equity snapshot from step 2 and the "Today" card from step 3. A paid-off home (balance `0`) shows its whole value as equity and an LTV of `0` |
| Sheet `Rate Source Date` | The PMMS week in the page's rate note, e.g. `2026-10-08`. Blank only if the rates call failed |
| Step 4 | Asks name, phone, email and state. **No** "Best Time to Call", **no** "How Did You Find Me?" |
| Sheet `Test?` | **`TEST`**, because you used a `zztest+` address on a listed test account. A real lead's cell is blank |
| Sheet `Mortgage Rate` / `Mortgage Term` | The values you typed in step 2, straight after `Mortgage Payment`. Blank, not 0, if you skipped them |
| The oldest row | Still reads correctly: the same `Total Debt Balance` as in the "(old ...)" tab, with the new cells blank |
| Bonzo tags | `debt-consolidation`, `HELOC/cash-out interest`, `licensed-state`, `state:CA` |
| Email | **None.** This funnel has no guide |

The homepage no longer has the calculator (revamp phase 4); its debt card
links here. Also check:

| Check on `/debt-consolidation/` | Expect |
| --- | --- |
| First paint | Nav and the "Boost Your Monthly Cashflow" heading are there at once, styled, before the steps appear under them. Nothing fades in |
| View source | The heading is in the HTML as an `<h1>`, and the CSS is a `<style>` block, not a stylesheet `<link>` |
| Phone number in the footer | Swapped by CallRail on a paid click, as on every other page |
| GA4 `generate_lead` | `lead_source` `DebtConsolidation`, `form_id` `debt-savings-calculator`, **`page_path` `/debt-consolidation/`**. That last one is the only way to tell the two pages apart |
| Nav "Contact", then submit the modal | Leads tab, `Source` **`debt-consolidation-contact`**; Bonzo tags `contact`, `debt-consolidation` |

If the modal row says `Source` `debt-consolidation-contact` but Bonzo tags it
`mortgage-calculator`, the Apps Script deployment is older than the page:
update the existing deployment in place.

The page shows **your own computed numbers** only, never a dollar range, and
there is no sticky savings bar.

**Run it once more with a scenario that costs MORE**: one debt of `3000` at
`90` a month and `24`%, home value `650000`, balance `350000`, mortgage payment
`1500`, mortgage rate `3`.

| Check | Expect |
| --- | --- |
| Cash-out refi card | "Payment goes up $.../mo". **Never** a minus sign, never "Save" |
| Sheet `Refi Monthly Savings` | A **negative** number. Negative means the payment goes up by that much |
| Sheet `Monthly Savings` | The better of the priced options, signed. Here the home equity loan still saves a little, so it is positive |
| Sheet `HELOAN Monthly Savings` | Blank unless you chose a credit tier and a term on step 3 |

In step 2, fill in the mortgage rate (e.g. `3.5`) and years remaining (e.g. `27`).
On the results screen you should then see a third card, **"Refi, Same Payoff
Date"**, and a note on the 30-year card saying how many years it adds and what
rate is being traded away. Leave both fields blank and neither should appear, with
every other number unchanged.

The older rows are the important check: compare them with the "(old ...)" tab
the migration left. If a value sits under a different header there, stop and
report it.

### Case 1.5 - Contact modal

1. Open the contact modal from the homepage nav.
2. **Fill in only name, email, phone and state**, and submit. It should go
   through: Goals, Target Outcome and Timeline are optional now, and marked so.
3. Check the Loan Amount and Interest Rate fields are **blank**. They used to
   carry the calculator's defaults, $330,000 and 6.41%, which is why a real May
   lead is on record at a rate they never gave.

| Check | Expect |
| --- | --- |
| Site | "You're all set, ZZTest!" |
| Sheet tab `Leads` | New row, not a funnel tab |
| Sheet `Source` | **`home-contact`**, not `MortgageCalculator` |
| Bonzo tags | `contact`, `home`, `licensed-state`, `state:CA` |
| Email to the visitor | See below |

**Repeat on `/dscr/`** and check `Source` reads `dscr-contact` and Bonzo tags
read `contact` + `dscr`, **without** `investor` or `priority:p2`, which belong
to the DSCR magnet and not to someone who used the contact form on that page.
The same holds for `/fha/` (`fha-contact`), `/realestateinvesting/`
(`rei-contact`) and `/mortgage-calculator/` (`mortgage-calculator-contact`).
On `/mortgage-calculator/` the loan numbers **should** be pre-filled: there
they are the visitor's own.

**The confirmation email.** The modal now sends an instant reply carrying
Darren's calendar. It stays silent until all three of these exist, and the Apps
Script skips rather than fails without them, so no alert fires in the meantime:

```
Netlify env var   CONTACT_CONFIRM_API_KEY      = <new random string>
Script Property   NETLIFY_CONTACT_CONFIRM_URL  = https://realdarrentsai.com/api/send-contact-confirmation
Script Property   NETLIFY_CONTACT_CONFIRM_KEY  = <same random string>
```

Once they are set: the email should arrive within about a minute, address the
visitor by first name, quote back whatever they wrote in Goals if they wrote
anything, and its "Pick a time" link should carry
`utm_source=email&utm_medium=confirmation&utm_campaign=contact-modal`. Before
they are set, expect **no email**, no alert, and a `done` row in `Follow-ups`.

### Case 1.6 - Out of state

1. Any funnel. Use state **NY**.

| Check | Expect |
| --- | --- |
| Sheet | Row saved as normal, `Licensed?` = **No** |
| Bonzo | Prospect still created and still enrolled |
| Bonzo tags | `unlicensed-state` and `state:NY` |

| The form itself | On picking NY, a grey line appears under the State field naming the eight states. It must **not** block the submit |

Darren is licensed in AZ, CA, FL, HI, OR, PA, TN and TX only. Out of area leads
are kept and flagged, never dropped, because they are still worth a referral.
What changed is that the visitor is told before they submit rather than finding
out afterwards. Check this on a magnet form and a contact modal: they are
separate implementations.

### Case 1.7 - Book a Call offers both options

1. On any page, click **"Book a Call"**.

| Check | Expect |
| --- | --- |
| A small panel opens | Two options: call, and schedule a time |
| On a phone | **Call is listed first.** On a desktop, Schedule is first |
| The number shown | A **CallRail pool number**, not (714) 887-5432. If it reads the real number, CallRail's swap did not run |
| Tapping the call option on a phone | Opens the dialler. After a real >60s call, it appears in CallRail within a few minutes |
| Picking "Schedule a time" | The **calendar appears in the same panel**, not a popup and not a new tab. `calendly_open` fires in Tag Assistant |
| The calendar | Loads within a couple of seconds. A "Back" link returns to the two options |
| On a desktop | The panel widens to ~720px and the **date grid is visible without scrolling**. At 520px Calendly falls back to its narrow layout and the dates sit below the fold |
| The two option lines | On their own lines. They used to run together as "Call (714) 942-4217Straight through, no waiting" |
| The call option's sub-line | Reads "Call Darren directly". It used to promise "Straight through, no waiting", which a forwarded cell cannot always keep |
| Escape, or clicking outside | Closes the panel |

**The stall fallback.** In DevTools, block `calendly.com` (Network > right-click
> Block request domain), then pick "Schedule a time". After **8 seconds** a
block should appear **above** the frame offering the phone number and "Open the
calendar in a new tab", and `calendly_stalled` should fire. The calendar frame
stays where it is on purpose: the embed may still be one second away. Unblock
and confirm the fallback does not appear on a normal load.

**The prefill.** Submit any lead form first, then open the chooser from that
same success card and pick "Schedule a time". Calendly's own form should already
hold the name and email you just typed. Reload the page and open the chooser
without submitting: it should ask for them as before.

**Then book a real slot**, using a `zztest+` address. `calendly_booking` should
fire in Tag Assistant the moment Calendly confirms. That event is the whole
reason the calendar is inline rather than in a popup, so it is the one to check
most carefully. Cancel the booking in Calendly afterwards.

If the calendar opens in a **new browser tab** instead of in the panel, the
widget script did not load in time and the page fell back. `calendly_booking`
cannot fire on that path, so report it rather than treating the booking as
tracked.

Check this on at least the homepage and one landing page, since they run separate
copies of the page code.

### Case 1.8 - The FHA calculator is on the FHA page

The page has been titled "FHA Mortgage Calculator" since it shipped while the
calculator was a spreadsheet emailed after an opt-in, which most of this page's
traffic (YouTube, on a phone) cannot open at all.

1. Open `/fha/` and use the hero button, which should now read **"Work out my
   payment"** and jump to the estimator rather than the opt-in form.

| Check | Expect |
| --- | --- |
| On load | Every input **empty**, with `e.g. ...` placeholders, and no result: "Enter a purchase price and an interest rate" |
| Price `400000`, down `5`, rate `7` | Base loan **$380,000**, upfront MIP **$6,650**, total financed **$386,650** |
| Monthly MIP | **$161**, labelled `(0.50%)`. These are the same figures as the worked example in the explainer above, which is the point |
| Down payment `3` | A line appears saying FHA needs at least 3.5%. It must **not** refuse the input |
| Down payment `3.5` | The MIP label switches to `(0.55%)`, because LTV is now above 95% |
| On a phone | The two cards stack and everything stays readable |

The opt-in still sends the spreadsheet. The success copy should now say the
spreadsheet is what arrives, not "your FHA payment breakdown", which was a
breakdown of numbers the form never asked for.

### Case 1.9 - A returning lead is not a failure

1. Submit a **second** lead using an email address Bonzo already holds, e.g.
   repeat an earlier test address rather than a fresh `+tag`.

| Check | Expect |
| --- | --- |
| Alert inbox | **No** "LEAD PIPELINE FAILURE" email |
| Sheet tab `Debug` | A row reading "returning lead, already a prospect, not re-enrolled", with the email |
| The guide | **Still sent.** Coming back for a second guide is the whole point |
| `Follow-ups` row | `done` |

Known and not fixed here: the returning prospect is **not** enrolled in the new
funnel's campaign and their Bonzo tags are not updated. A DSCR lead who returns
for the FHA guide stays tagged as they were. That needs an update-by-email call
and belongs with the HubSpot work.

### Case 1.10 - Home Equity

Ship order: the Apps Script version with the `home-equity` route first, then
the site. Until then the lead lands on `Leads`, saved but without its columns.

1. Go to `/home-equity/`. Try to continue with nothing filled in: it should
   stop you and ask for the home value and balance.
2. Home value `650000`, balance `350000`. Pick a goal, an amount (e.g.
   `75000`) and a preference. Fill the contact step, State **CA**. Submit.

| Check | Expect |
| --- | --- |
| Site | Success card, "Darren will be in touch." and no response time |
| Sheet tab `Home Equity` | Created on this first lead, in the standard order. `Source` `home-equity`, `Form ID` `home-equity-calculator`, `Page` `/home-equity/` |
| Sheet `Estimated Home Equity` / `Current LTV` / `Illustrative CLTV` | `300000` / `53.8` / `65.4` with the amounts above |
| Bonzo tags | `home-equity`, `HELOC/cash-out interest`, `goal:...`, `preference:...`, `licensed-state`, `state:CA` |
| Email | The home-equity confirmation, with the calendar link |

Run it once more with balance `0`: the row must say `0` under `Mortgage
Balance`, not blank. A paid-off home is an answer.

### Case 1.11 - ADU

Same ship order as 1.10, with the `adu` route.

1. Go to `/adu/`. All four numbers and a purpose are required before the
   contact step: try to skip each.
2. Home value `650000`, balance `350000`, project cost `175000`, amount to
   finance `75000`, purpose **Rental ADU**. Contact step, State **CA**. Submit.

| Check | Expect |
| --- | --- |
| Site | Success card. The page says plainly that financing does not confirm an ADU can be permitted, built or rented |
| Sheet tab `ADU` | Created on this first lead. `Source` `adu`, `Form ID` `adu-calculator`, `Page` `/adu/`, `Project Purpose` `Rental ADU` |
| Sheet `Estimated Home Equity` / `Current LTV` / `Illustrative CLTV` | `300000` / `53.8` / `65.4` |
| Bonzo tags | `adu`, `HELOC/cash-out interest`, `purpose:...`, `licensed-state`, `state:CA` |
| Email | The ADU confirmation, with the calendar link |

---

## 2. Attribution and Google Ads

This is the part that must not move. Google Ads is live and spending, and these
tags are how a lead is matched back to the ad that produced it.

Use a fresh private window for each case, so a stored click from a previous case
does not leak into the next one.

### Case 2.1 - A click ID reaches the Sheet and Bonzo

1. Open `https://realdarrentsai.com/dscr/?gclid=ZZTEST123`
2. Submit the form.

| Check | Expect |
| --- | --- |
| Sheet `Click ID` | `ZZTEST123` |
| Sheet `Click ID Type` | `gclid` |
| Bonzo tag | `ads:google` |
| Bonzo field `lead_id` | `ZZTEST123` |

### Case 2.2 - The click ID survives moving around the site

1. Open `https://realdarrentsai.com/?gclid=ZZTEST456`
2. **Navigate to another page by clicking a link**, for example to `/dscr/`.
3. Submit there.

| Check | Expect |
| --- | --- |
| Sheet `Click ID` | still `ZZTEST456` |

If this is blank, tracking is broken in the specific way that produces "Google Ads
reports conversions but the Sheet has no click IDs". Stop and report it.

### Case 2.3 - A returning visitor is credited to the ad that first found them

1. Open `https://realdarrentsai.com/dscr/?gclid=ZZTEST789&utm_source=google&utm_campaign=zztest-camp`
2. Close the tab. **Do not clear browser storage.**
3. Open `https://realdarrentsai.com/dscr/?utm_source=youtube.com&utm_medium=referral`
4. Submit.

| Check | Expect |
| --- | --- |
| Bonzo tags | `ads:google` **and** `campaign:zztest-camp` **and** `last:youtube-com` |
| Bonzo `lead_id` | `ZZTEST789` |
| Sheet `First Click ID` | `ZZTEST789` |

The point of this case: source and campaign must **both** come from the first
touch. If you see `ads:google` sitting next to `utm:youtube-com`, the lead has
been tagged with two different origins at once. Report it.

### Case 2.4 - An untracked visit says so

1. Fresh private window. Go straight to `https://realdarrentsai.com/dscr/` with no
   query string at all. Submit.

| Check | Expect |
| --- | --- |
| Bonzo tag | `attr:none` |
| Sheet attribution columns | empty |

`attr:none` is deliberate. It makes broken tracking look different from a
genuinely quiet week.

### Case 2.5 - One Google tag, not two

1. Open any page with Google Tag Assistant connected.
2. Submit a form.

| Check | Expect |
| --- | --- |
| Containers | Exactly one: `GTM-N7Z8Q4QF` |
| On submit | `generate_lead` fires **once**, with the right `form_id` |
| Anywhere | **No** second Google tag. No `gtag/js`, no `AW-` conversion snippet |

A second Google tag double counts every conversion, which corrupts the bidding
signal Darren's ad spend is steered by. If you find one, report it before anything
else in this document.

---

## 3. Failure paths a visitor can see

### Case 3.1 - An email domain that does not exist

1. Any form. Use email `zztest@zzz-not-a-real-domain-xyz.com`. Submit.

| Check | Expect |
| --- | --- |
| Site | Stays on the form. Message near the email field: "We couldn't find a mail server for ..." |
| Sheet | **No row.** Nothing was saved, which is correct |
| Then | Correcting the email and resubmitting should work |

This is the one failure a visitor can fix themselves, which is why it behaves
differently from every other error.

### Case 3.2 - What a server failure looks like

You cannot trigger this on purpose without breaking something. Just recognise it:

> "We couldn't confirm your request, but your details were passed to Darren and
> he'll be in touch. No need to submit again."

If you ever see that, **tell Darren and ask him to check his inbox for a rescue
email.** One should always arrive now. If the copy appeared and no email did,
that is a real fault worth reporting.

---

## 4. Timing, and things that look like bugs but are not

**The guide email is not instant.** The site replies as soon as the Sheet row is
written. Bonzo and the guide email run on a separate pass up to a minute later. A
success message with no email yet is normal. Wait a minute.

**The Follow-ups tab is the progress bar.** Find your row and watch the `Status`
column:

| Status | Meaning |
| --- | --- |
| `pending` | queued, not picked up yet |
| `processing:0` | being worked on right now |
| `done` | Bonzo pushed and guide sent |
| `guide-retry:1` and up | the guide failed; a retry is scheduled at 1, 5, 20, 60 then 180 minutes |
| `error` | something threw. Check the `Debug` tab |

**The Debug tab is the real log.** Apps Script's own cloud logging is unreliable
for this. The `Debug` tab is trustworthy. It is trimmed to 2000 rows daily.

**A new column shows up at the far right of a tab.** That is where the script
adds a column the tab does not have yet. It moves into place the next time
`migrateLeadTabs` is run. Do not drag it: rows are written under their header by
name, so nothing is misfiled while it sits there, and a column moved by hand is
what the "Sheet columns out of order" email is about.

**A negative number under a Savings header is not an error.** It means that
option raises the monthly payment by that much. The site says so in words.

**The phone number in tracking is not Darren's number.** CallRail swaps phone
numbers on the page so it can attribute calls, so tracking shows a pool number.
Expected.

**Your own test traffic shows up in GA4 Realtime.** The internal traffic filter is
still in testing mode, so it does not exclude you yet. **Do not read your own test
submissions as ad performance.**

**Bonzo 422 "already exists"** on a repeat email means Bonzo matched the person.
Use a new `+case` email.

### Previously known issues, now fixed

These were live until recently. If you see any of them again, it is a regression
and worth reporting:

1. **Double submit.** The savings calculator's submit button now greys out and
   reads "Sending…" while it works. Try double-clicking it: you should get one
   lead, not two.
2. **Mortgage rate and term.** Step 2 collects both and they now reach the Sheet
   and the results screen. See case 1.4.
3. **Booking was untracked.** "Book a Call" now opens a chooser, and the
   calendar renders inline so a completed booking fires `calendly_booking`.
   See case 1.7.
4. **A lost lead with no alert.** If the site cannot reach the Sheet, Darren now
   gets a rescue email on every path that loses a lead, not just some of them.
5. **Double submit, properly.** The greyed-out button was not enough: two clicks
   in the same tick both got through, because the button's state is read from the
   render already on screen. In DevTools, `b.click(); b.click()` should now send
   one `/api/lead`, not two 2ms apart.
6. **Example numbers submitted as real data.** No calculator arrives pre-filled
   any more. If any of the three loads with numbers already in it, that is the
   regression: those numbers get submitted as the visitor's own.
7. **Three savings claims on one page.** The homepage said $1,500-$3,000/mo,
   $900-$1,500/mo and $334/mo at the same time. One constant now, and the
   visitor's own figure wherever there is one.
8. **Every contact lead labelled MortgageCalculator.** One source per page now.
   See case 1.5.
9. **A forged booking could be counted.** The origin check on Calendly's message
   was a substring, so `calendly.com.attacker.example` passed it. Exact match now.
10. **The payment schedule ended a year early.** Yearly rows were blocks of twelve
   from payment one, so a loan starting in September counted twelve payments into
   its first calendar year. The last year of the table now matches the Payoff Date
   card above it, and that card names the month of the final payment rather than
   the month after.

---

## 5. Cleanup

1. In each Sheet tab you used (`DSCR`, `FHA`, `Real Estate Investing`,
   `Debt Consolidation`, `Leads`), filter by First Name, find `ZZTest`, delete
   those rows.
2. In `Follow-ups`, delete the matching rows.
3. In Bonzo, find the `ZZTest` prospects and archive or delete them, so they do
   not sit in a live nurture campaign receiving real emails.
4. Note anything that did not match this document, with the case number.

Step 3 matters. A test prospect left in a campaign will keep being emailed.
