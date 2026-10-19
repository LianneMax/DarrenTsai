# Consumer journey: YouTube to a saved request

The YouTube short links keep campaign parameters and click IDs. The base link is for a description; the same bucket with `-c` is for a pinned comment. Both reach the same page. By default they carry `utm_source=youtube`, `utm_medium=social` and a bucket-specific campaign, with different `utm_content` values.

## Page and request map

```mermaid
flowchart LR
  HE["YouTube: heloc / equity"] --> EQ["Home equity"]
  DE["YouTube: debt"] --> PAY["Home equity: pay off debt"]
  AD["YouTube: adu"] --> ADU["ADU and renovation"]
  DS["YouTube: dscr"] --> DSCR["DSCR"]
  RE["YouTube: rei"] --> REI["Investing case study"]
  BU["YouTube: buyer"] --> FHA["FHA payment"]
  MO["YouTube: mortgage"] --> MORT["Mortgage calculator"]
  HO["YouTube: home"] --> HOME["Homepage: choose a goal"]
  HOME --> EQ & PAY & ADU & DSCR & FHA & MORT & REI
  EQ --> EFORM["Property, goal, contact and preferences"] --> ETAB[("Home Equity")]
  PAY --> DFORM["Debt comparison and contact"] --> DTAB[("Debt Consolidation")]
  ADU --> AFORM["Project snapshot and contact"] --> ATAB[("ADU")]
  DSCR --> DGUIDE["Request DSCR breakdown"] --> DSTAB[("DSCR")]
  REI --> RGUIDE["Request case-study PDF"] --> RTAB[("Real Estate Investing")]
  FHA --> FGUIDE["Request calculator spreadsheet"] --> FTAB[("FHA")]
  MORT --> BOOK["Payment review / Book a Call"]
  EQ & PAY & ADU & DSCR & FHA & REI & HOME --> BOOK
  BOOK --> SCREEN["Choose goal, property screening, contact and preferences"]
  SCREEN --> ROUTE["Sheet tab follows chosen goal and entry page"]
  SCREEN -->|"Unsupported state"| EXIT["Service-area exit: no booking"]
  SCREEN -->|"Screening declined"| DECLINE["No calendar or call action"]
```

| YouTube bucket | Landing page | Main request | Sheet tab |
| --- | --- | --- | --- |
| `/yt/heloc`, `/yt/equity` | `/home-equity/` | Equity snapshot, `home-equity-calculator` | **Home Equity** |
| `/yt/debt` | `/home-equity/?goal=payoff` | Debt-payment comparison, `debt-savings-calculator` | **Debt Consolidation** |
| `/yt/adu` | `/adu/` | Project snapshot, `adu-calculator` | **ADU** |
| `/yt/dscr` | `/dscr/` | DSCR breakdown, `dscr-magnet` | **DSCR** |
| `/yt/rei` | `/realestateinvesting/` | Case-study PDF, `rei-magnet` | **Real Estate Investing** |
| `/yt/buyer` | `/fha/` | Calculator spreadsheet, `fha-magnet` | **FHA** |
| `/yt/mortgage` | `/mortgage-calculator/` | Screened payment review / booking | **Mortgage Review** when the chosen goal is buying/refinancing a home; otherwise the chosen goal's tab below |
| `/yt/home` | `/` | Choose a page or open screened booking | The selected page's form tab, or the booking tab below |

Every bucket also has a `-c` version. The old debt URL redirects to the payoff path. The historical **Debt Consolidation** Sheet name remains so existing records and mappings stay intact; it is not a separate public product page.

## Book a Call: the selected goal controls the tab

The booking form is `booking-prequal`. Its entry page is retained separately; visiting a particular page does not force every booking into that page's tab.

| Goal selected in booking | Entry context | Sheet tab |
| --- | --- | --- |
| Access home equity | ADU page / ADU contact | **ADU** |
| Access home equity | Any other page | **Home Equity** |
| Investment property / DSCR | Any page | **DSCR** |
| Buy/refinance a home | FHA page | **FHA** |
| Buy/refinance a home | Mortgage calculator / payment review | **Mortgage Review** |
| Buy/refinance a home | Other pages | **Home Purchase & Refinance** |
| Commercial property | Any page | **Commercial** |
| Not sure / needs guidance | Any page | **Needs Guidance** |

A booking for debt payoff uses the home-equity goal and therefore the **Home Equity** tab, unless entered from ADU. The **Debt Consolidation** tab is for the detailed debt-comparison form.

## What happens at opt-in

```mermaid
flowchart TD
  VISIT["Visit or use an educational calculator"] --> REQUEST["Choose to request a guide, snapshot or conversation"]
  REQUEST --> CHECK["Required property / service-area checks"]
  CHECK --> CONSENT["Contact details + required privacy acknowledgment"]
  CONSENT --> SMS["Two separate SMS choices: optional and initially unchecked"]
  SMS --> POST["POST /api/lead"]
  POST --> WRITE["Apps Script saves the request to its named lead tab"]
  WRITE --> RECEIPT["Confirmed receipt shown to the visitor"]
  WRITE --> QUEUE[("Follow-ups")]
  QUEUE --> CRM["HubSpot contact / form submission"]
  QUEUE --> EMAIL["Requested guide or confirmation email, unless opted out"]
  RECEIPT -->|"Qualified booking flow"| CAL["Calendar and call option become available"]
  TRACK["Cookie choice: optional analytics / marketing"] -. "Separate from forms and SMS" .-> VISIT
```

- Visiting a page or moving an educational slider does **not** create a lead row.
- Required privacy acknowledgment is distinct from optional SMS and optional cookie tracking. Forms and calculators work with optional cookies rejected; current-page attribution can remain in memory.
- A guide request is saved before its asynchronous email or HubSpot job runs. An email opt-out remains effective even when a new request is saved.
- **Follow-ups** is the delivery/retry queue. **Debug** holds diagnostics. Neither is a consumer opt-in destination.
- The ten consumer lead buckets shown here use Home Equity, Debt Consolidation, ADU, DSCR, FHA, Real Estate Investing, Mortgage Review, Home Purchase & Refinance, Commercial and Needs Guidance. Together with Follow-ups and Debug, these explain twelve tab roles in the journey. Reserved legacy schemas are not additional public funnels.

Implementation references: `netlify/functions/youtube-redirect.mts` (`SHORTLINKS`), `google-apps-script.js` (`SOURCE_SCHEMAS`, `targetedSource`, `bookingBucket`), the page's form ID, and `public/booking-chooser.js`.
