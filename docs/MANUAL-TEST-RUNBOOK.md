# Manual test runbook

**Current status and retention:** use the local `.local-notes/SITE-AUDIT.md` for the live audit and pending work. Max explicitly retains the eight 10 October viewer TEST leads until he requests deletion. Cleanup steps in this runbook are procedures, not authorization to remove those records.

How to verify by hand that a lead travels the whole way: from the form on the
site, into the Google Sheet, into HubSpot, and out as a guide email, with its ad
attribution intact.

You need: the live site, edit access to the leads Google Sheet, and a HubSpot
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

HubSpot dedupes by email, so a reused address updates one contact rather
than creating another. Change the `+case` part for each test and it will not
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
- **HubSpot:** the contact, its `rdt_*` properties and the submission snapshot.
  Test leads (555-01xx phones) are skipped unless `HUBSPOT_SEND_TESTS` is `true`.

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
in order. Give the Sheet a few seconds and HubSpot up to a minute.

### Case 1.1 - DSCR

1. Go to `/dscr/`. Run the calculator with any numbers.
2. Click through to the lead form. Fill it in. State: **CA**.
3. Submit.

| Check | Expect |
| --- | --- |
| Site | The form is replaced by the success panel |
| Sheet tab `DSCR` | A new row. `First Name` = ZZTest, `Licensed?` = **Yes**, and the `DSCR`, `Down Payment`, `Loan Amount`, `Rate` columns match what the calculator showed |
| Bonzo | **Nothing.** Retired 15 Oct 2026; no prospect, tag or note is created |
| Email | The DSCR guide PDF arrives, cover personalised. **Up to a minute later.** |

Those three figures (tax, insurance, HOA) are in the `DSCR` tab's own columns
and in the Submission Snapshot.

### Case 1.2 - FHA

1. Go to `/fha/`. Fill the form. State: **CA**. Pick any Credit Score.

| Check | Expect |
| --- | --- |
| Sheet tab `FHA` | New row, `Credit Score` populated, `Licensed?` = Yes |
| Bonzo | **Nothing.** Retired 15 Oct 2026; no prospect, tag or note is created |
| Email | The FHA calculator `.xlsx`, greeting you by first name |

The `newsletter` tag on an FHA lead is deliberate, not a bug.

### Case 1.3 - Real Estate Investing

1. Go to `/realestateinvesting/`. Fill the form. State: **CA**.

| Check | Expect |
| --- | --- |
| Sheet tab `Real Estate Investing` | New row |
| Bonzo | **Nothing.** Retired 15 Oct 2026; no prospect, tag or note is created |
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
| Bonzo | **Nothing.** Retired 15 Oct 2026; no prospect, tag or note is created |
| Email | **None.** This funnel has no guide |

The homepage no longer has the calculator (revamp phase 4); its debt card
links here. Also check:

| Check on `/debt-consolidation/` | Expect |
| --- | --- |
| First paint | Nav and the "Boost Your Monthly Cashflow" heading are there at once, styled, before the steps appear under them. Nothing fades in |
| View source | The heading is in the HTML as an `<h1>`, and the CSS is a `<style>` block, not a stylesheet `<link>` |
| Phone number in the footer | Swapped by CallRail on a paid click, as on every other page |
| GA4 `generate_lead` | `lead_source` `DebtConsolidation`, `form_id` `debt-savings-calculator`, **`page_path` `/debt-consolidation/`**. That last one is the only way to tell the two pages apart |
| Nav "Contact", then submit the modal | Leads tab, `Source` **`debt-consolidation-contact`** |

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
| Bonzo | **Nothing.** Retired 15 Oct 2026; no prospect, tag or note is created |
| Email to the visitor | See below |

**Repeat on `/dscr/`** and check `Source` reads `dscr-contact`.

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
| Bonzo | **Nothing.** Retired 15 Oct 2026; no prospect, tag or note is created |

| The form itself | On picking NY, a grey line appears under the State field naming the eight states. It must **not** block the submit |

Darren is licensed in AZ, CA, FL, HI, OR, PA, TN and TX only. Out of area leads
are kept and flagged, never dropped, because they are still worth a referral.
What changed is that the visitor is told before they submit rather than finding
out afterwards. Check this on a magnet form and a contact modal: they are
separate implementations.

### Case 1.7 - Book a Call runs the prequal first

Stub nothing: this case sends one real lead, so use a `zztest+` address and a
555-01xx phone.

1. On any page, click **"Book a Call"** (or tap any phone number).

| Check | Expect |
| --- | --- |
| A small panel opens | Step 1 of 3: property use, property state, property type. No phone number, no calendar |
| Property in NY, primary home | Goes to `/out-of-market-primary/`. Nothing reaches the Sheet |
| Property in NY, rental | Goes to `/out-of-market-dscr/` |
| Mobile home or land | A short decline, no calendar and no phone number |
| Mortgage not current, or a bankruptcy/foreclosure in 4 years | A short decline, no calendar and no phone number. `booking_prequal_declined` fires |
| CA primary, single family, current, no bankruptcy | Step 3 asks name, email, phone, the required privacy box and two optional SMS boxes |
| Submit | Sheet `Leads` row, `Form ID` `booking-prequal`, with `Property Type`, `Mortgage Current`, `Recent Bankruptcy/Foreclosure` filled. `generate_lead` fires once |
| After the save | The HubSpot calendar, prefilled with your name and email, plus a "Call" button showing a **CallRail pool number**. `booking_page_shown` fires |
| `/book/` | The same three steps inline on the page |
| Escape, or clicking outside | Closes the panel |

**Then book a real slot.** `meeting_booked` should fire in Tag Assistant the
moment HubSpot confirms. The message name it listens for is
`meetingBookSucceeded`; if the event does not fire, record what the embed
posted (DevTools > Console, `window.addEventListener('message', e => console.log(e.origin, e.data))`)
and report it. Cancel the meeting in HubSpot afterwards.

Until Darren's meetings link replaces the placeholder in
`public/booking-chooser.js`, a passing lead sees "Darren has your details" and
the Call button instead of a calendar.

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
3. In HubSpot, find any `ZZTest` contacts (only if `HUBSPOT_SEND_TESTS` was on)
   and ask the HubSpot admin to delete them. Retain TEST rows in the Sheet until
   Max authorises deletion.
4. Note anything that did not match this document, with the case number.

Step 3 matters. A test prospect left in a campaign will keep being emailed.
