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
  `Debt Consolidation`, `Leads`, plus `Follow-ups` and `Debug` which you will use
  for diagnosis.
- **Bonzo:** the prospect record, its Tags, and its Mortgage fields.

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

1. Go to the homepage. Work through all four steps of the savings calculator.
2. Fill in the contact step. State: **CA**. Submit.

| Check | Expect |
| --- | --- |
| Site | Success card, "You're all set!" |
| Sheet tab `Debt Consolidation` | New row with the savings figures. **`Licensed?` is the very last column, after the attribution columns.** That is correct, see section 4 |
| Sheet `Mortgage Rate` / `Mortgage Term` | The values you typed in step 2, sitting **between `Mortgage Payment` and `Total Debt Balance`** |
| An older row, e.g. Steven Salas | Still reads correctly: `29656.8` under `Total Debt Balance`, with the two new cells blank |
| Bonzo tags | `debt-consolidation`, `HELOC/cash-out interest`, `licensed-state`, `state:CA` |
| Email | **None.** This funnel has no guide |

In step 2, fill in the mortgage rate (e.g. `3.5`) and years remaining (e.g. `27`).
On the results screen you should then see a third card, **"Refi, Same Payoff
Date"**, and a note on the 30-year card saying how many years it adds and what
rate is being traded away. Leave both fields blank and neither should appear, with
every other number unchanged.

The two older rows are the important check: if their values have shifted one or
two columns right, the Sheet migration was not done before the deploy. Stop and
report it.

### Case 1.5 - Contact modal

1. Open the contact modal from the homepage nav. Fill it in. State: **CA**.

| Check | Expect |
| --- | --- |
| Site | "You're all set, ZZTest!" |
| Sheet tab `Leads` | New row, not a funnel tab |
| Bonzo tags | `mortgage-calculator`, `licensed-state`, `state:CA` |
| Email | None |

### Case 1.6 - Out of state

1. Any funnel. Use state **NY**.

| Check | Expect |
| --- | --- |
| Sheet | Row saved as normal, `Licensed?` = **No** |
| Bonzo | Prospect still created and still enrolled |
| Bonzo tags | `unlicensed-state` and `state:NY` |

Darren is licensed in AZ, CA, FL, HI, OR, PA, TN and TX only. Out of area leads
are kept and flagged, never dropped, because they are still worth a referral.

### Case 1.7 - Book a Call offers both options

1. On any page, click **"Book a Call"**.

| Check | Expect |
| --- | --- |
| A small panel opens | Two options: call, and schedule a time |
| On a phone | **Call is listed first.** On a desktop, Schedule is first |
| The number shown | A **CallRail pool number**, not (714) 887-5432. If it reads the real number, CallRail's swap did not run |
| Tapping the call option on a phone | Opens the dialler. After a real >60s call, it appears in CallRail within a few minutes |
| Picking "Schedule a time" | Calendly opens, and `calendly_open` fires in Tag Assistant |
| Escape, or clicking outside | Closes the panel |

Check this on at least the homepage and one landing page, since they run separate
copies of the page code.

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

**`Licensed?` is in a strange place on the Debt Consolidation tab.** It sits after
the attribution columns there, and before them on every other tab. This is
deliberate. Columns are only ever added at the end, because inserting one would
shift the meaning of every historical row to its right. Do not "fix" it.

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
3. **Booking was untracked.** "Book a Call" now opens a chooser. See case 1.7.
4. **A lost lead with no alert.** If the site cannot reach the Sheet, Darren now
   gets a rescue email on every path that loses a lead, not just some of them.

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
