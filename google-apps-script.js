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
 *    VITE_GOOGLE_SHEET_WEBHOOK_URL = <paste URL>
 *
 * BONZO SETUP (pushes every lead straight into Bonzo, no Zapier/manual step needed):
 * 1. In this Apps Script editor: Project Settings (gear icon) → Script Properties
 * 2. Add property: BONZO_API_KEY = <your Bonzo bearer token>
 * 3. Add property: BONZO_CAMPAIGN_ID = <default campaign id leads should land in — ask Bonzo
 *    support or check dashboard if unsure, default campaign works if blank>
 * 4. Add property: BONZO_DSCR_CAMPAIGN_ID = <the "DSCR Campaign" id in Bonzo — DSCR leads
 *    route here instead of the default campaign. Falls back to BONZO_CAMPAIGN_ID if blank.>
 * 5. Add property: BONZO_REI_CAMPAIGN_ID = <the "Real Estate Investing" campaign id in
 *    Bonzo (platform.getbonzo.com/campaigns/261737) — REI leads route here instead of
 *    the default campaign. Falls back to REI_CAMPAIGN_ID constant below if blank.>
 * 6. Never paste tokens/ids directly in this file — Script Properties keeps them out
 *    of source control and off Netlify entirely.
 *
 * DSCR PDF EMAIL SETUP (sends the personalized DSCR guide via the Netlify function):
 * 1. Add property: NETLIFY_DSCR_PDF_URL = https://realdarrentsai.com/api/send-dscr-guide
 * 2. Add property: NETLIFY_DSCR_PDF_KEY = <same random string set as DSCR_GUIDE_API_KEY
 *    in Netlify's environment variables>
 * 3. If either is blank, the guide email is skipped (Sheets + Bonzo still run normally).
 *
 * REAL ESTATE INVESTING PDF EMAIL SETUP (sends the static case-study PDF via the
 * Netlify function):
 * 1. Add property: NETLIFY_REI_PDF_URL = https://realdarrentsai.com/api/send-rei-guide
 * 2. Add property: NETLIFY_REI_PDF_KEY = <same random string set as REI_GUIDE_API_KEY
 *    in Netlify's environment variables>
 * 3. If either is blank, the guide email is skipped (Sheets + Bonzo still run normally).
 *
 * BONZO MORTGAGE FIELDS (how the calculator numbers reach Bonzo) — verified live
 * against the v3 API on 2026-09-04, so don't re-derive this from the docs:
 * - Send them as FLAT TOP-LEVEL KEYS on the same POST /prospects/campaign/{id}.
 *   Confirmed 201 with every field populated, tags and enrollment intact.
 * - A nested `mortgage: {...}` object returns 201 and is SILENTLY DROPPED. So is
 *   `custom_fields`, `mortgage_fields`, and any invented key (`dscr`, `dscr_ratio`).
 *   POST /prospects/{id}/mortgage does not exist (404).
 * - The official v3 spec (https://d11n2cytbq62hx.cloudfront.net/v3.json) documents
 *   `mortgage` only on the RESPONSE and lists no request schema for it — the request
 *   schemas there are incomplete (they omit `tags` too, which demonstrably works).
 * - loan_amount / down_payment / interest_rate are NUMERIC fields: they need bare
 *   numbers, not the "$300,000" / "7.50%" display strings the landing pages send.
 * - This Bonzo account has NO custom fields defined, so anything without a native
 *   Mortgage field (e.g. the DSCR ratio) has to ride in a text field.
 *
 * FHA CALCULATOR EMAIL SETUP (sends the static fha-affordability-calculator.xlsx via
 * the Netlify function):
 * 1. Add property: NETLIFY_FHA_PDF_URL = https://realdarrentsai.com/api/send-fha-guide
 * 2. Add property: NETLIFY_FHA_PDF_KEY = <same random string set as FHA_GUIDE_API_KEY
 *    in Netlify's environment variables>
 * 3. If either is blank, the guide email is skipped (Sheets + Bonzo still run normally).
 */

const SPREADSHEET_ID = '1DZ98FIyaF8hYi-c3FPMLVF71dVVnJWyejg4_J2ZkepI';
const BONZO_BASE_URL = 'https://app.getbonzo.com/api/v3';

// States Darren is licensed in. A lead outside these is logged in the sheet
// but NOT added to the Bonzo campaign (he can't serve them).
const LICENSED_STATES = ['AZ', 'CA', 'FL', 'HI', 'OR', 'PA', 'TN', 'TX'];

// Landing leads in a licensed state route into these specific Bonzo campaigns.
// "FHA Calculator Campaign: Licensed" — platform.getbonzo.com/campaigns/145797
const FHA_CAMPAIGN_ID = '145797';
// "DSCR" campaign — platform.getbonzo.com/campaigns/258025
const DSCR_CAMPAIGN_ID = '258025';
// "Real Estate Investing" campaign — platform.getbonzo.com/campaigns/261737
const REI_CAMPAIGN_ID = '261737';

function isLicensedState(state) {
  if (!state) return false;
  return LICENSED_STATES.indexOf(String(state).trim().toUpperCase()) !== -1;
}

// FHA licensed campaign id (script-property override wins, else the known id above).
function getFhaCampaignId(props) {
  return props.getProperty('BONZO_FHA_CAMPAIGN_ID') || FHA_CAMPAIGN_ID;
}

// Ad attribution, captured by public/attribution.js and sent with every form.
// ALWAYS appended to the END of a header array and the END of the matching row,
// never inserted mid-array: existing tabs already hold rows under the current
// column order, and inserting would shift every historical row's meaning with
// no way to tell old rows from new. ensureHeaders() relies on this too.
const ATTR_HEADERS = [
  'UTM Source', 'UTM Medium', 'UTM Campaign', 'UTM Term', 'UTM Content',
  'Click ID', 'Click ID Type', 'Landing Page', 'Referrer',
  'First Touch Source', 'First Touch Campaign',
  // First-touch click id, appended later. The last touch is not enough on its
  // own: someone who clicks an ad, leaves, and returns weeks later through
  // organic YouTube or search has a last touch with no click id at all, so
  // without these the gclid is lost and the lead can never be matched back to
  // the ad that found them. First touch is kept for 90 days, matching Google's
  // gclid lookback, specifically for this case.
  'First Click ID', 'First Click ID Type', 'First Touch At'
];
function attrRow(d) {
  return [
    d.utm_source || '', d.utm_medium || '', d.utm_campaign || '',
    d.utm_term || '', d.utm_content || '',
    d.clickId || '', d.clickIdType || '', d.landingPage || '', d.referrer || '',
    d.firstUtmSource || '', d.firstUtmCampaign || '',
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

const LEAD_HEADERS = [
  'Timestamp', 'First Name', 'Last Name', 'Email', 'Phone', 'State',
  'Loan Amount', 'Term (Years)', 'Rate (%)', 'Goals',
  'Target Outcome', 'Timeline', 'Source', 'Licensed?'
].concat(ATTR_HEADERS);

// Newsletter is a different shape (no name/phone columns), so isDuplicateLead's
// "email is column 4, phone is column 5" assumption does not hold here and it
// gets no attribution columns.
const NEWSLETTER_HEADERS = [
  'Timestamp', 'Email', 'Source'
];

const QUALIFY_HEADERS = [
  'Timestamp', 'First Name', 'Last Name', 'Email', 'Phone',
  'Loan Type', 'Timeline', 'Price Range', 'Credit Range',
  'Employment', 'Notes', 'Source'
].concat(ATTR_HEADERS);

// Each landing funnel gets its OWN sheet tab with columns matching its actual
// inputs/outputs — no shared blank columns. `row(d)` returns cells in header order.
const COMMON_LEAD = ['Timestamp', 'First Name', 'Last Name', 'Email', 'Phone', 'State'];
function commonLeadRow(d) {
  return [
    d.timestamp || new Date().toISOString(),
    d.firstName || '', d.lastName || '', d.email || '', d.phone || '', d.state || ''
  ];
}
function licensedCell(d) { return isLicensedState(d.state) ? 'Yes' : 'No'; }

const SOURCE_SCHEMAS = {
  'heloc-hei': {
    tab: 'HELOC vs HEI',
    headers: COMMON_LEAD.concat(['Magnet', 'Source', 'Licensed?'], ATTR_HEADERS),
    row: function (d) { return commonLeadRow(d).concat([d.magnet || '', d.source, licensedCell(d)], attrRow(d)); }
  },
  'dscr': {
    tab: 'DSCR',
    headers: COMMON_LEAD.concat(['Magnet', 'Source', 'DSCR', 'Down Payment', 'Loan Amount', 'Rate', 'Licensed?'], ATTR_HEADERS),
    row: function (d) {
      return commonLeadRow(d).concat([
        d.magnet || '', d.source, d.dscr || '', d.downPayment || '', d.loanAmount || '', d.rate || '', licensedCell(d)
      ], attrRow(d));
    }
  },
  'self-employed': {
    tab: 'Self-Employed',
    headers: COMMON_LEAD.concat(['Magnet', 'Source', 'Licensed?'], ATTR_HEADERS),
    row: function (d) { return commonLeadRow(d).concat([d.magnet || '', d.source, licensedCell(d)], attrRow(d)); }
  },
  'fha': {
    tab: 'FHA',
    headers: COMMON_LEAD.concat(['Magnet', 'Source', 'Credit Score', 'Licensed?'], ATTR_HEADERS),
    row: function (d) {
      return commonLeadRow(d).concat([d.magnet || '', d.source, d.creditScore || '', licensedCell(d)], attrRow(d));
    }
  },
  'real-estate-investing': {
    tab: 'Real Estate Investing',
    headers: COMMON_LEAD.concat(['Magnet', 'Source', 'Licensed?'], ATTR_HEADERS),
    row: function (d) { return commonLeadRow(d).concat([d.magnet || '', d.source, licensedCell(d)], attrRow(d)); }
  }
};

const LANDING_SOURCES = Object.keys(SOURCE_SCHEMAS);

const DEBT_CONSOLIDATION_HEADERS = [
  'Timestamp', 'First Name', 'Last Name', 'Email', 'Phone', 'State',
  'Best Time to Call', 'Lead Source',
  'Home Value', 'Mortgage Balance', 'Mortgage Payment',
  'Total Debt Balance', 'Total Debt Payment', 'Monthly Savings',
  'Refi Monthly Payment', 'Refi Monthly Savings',
  'HELOAN Monthly Payment', 'HELOAN Monthly Savings'
].concat(ATTR_HEADERS);


function getOrCreateSheet(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(headers);
    const headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setFontWeight('bold');
    headerRange.setBackground('#223d55');
    headerRange.setFontColor('#ffffff');
    sheet.setFrozenRows(1);
  } else {
    ensureHeaders(sheet, headers);
  }
  return sheet;
}

// Adds header cells for columns a schema has gained since the tab was created.
// Append-only and idempotent by construction: it writes just the tail past the
// sheet's current last column and never touches an existing header cell, so a
// tab full of historical rows keeps every column meaning it already had. Rows
// written before the new columns existed simply stay blank underneath them,
// which is accurate — those leads genuinely have no attribution.
function ensureHeaders(sheet, headers) {
  const lastCol = sheet.getLastColumn();
  if (lastCol >= headers.length) return;
  const extra = headers.slice(lastCol);
  const range = sheet.getRange(1, lastCol + 1, 1, extra.length);
  range.setValues([extra]);
  range.setFontWeight('bold');
  range.setBackground('#223d55');
  range.setFontColor('#ffffff');
}

function isDuplicateLead(sheet, email, phone) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return false; // only header row, no data yet
  // Email is column 4 (index 3), Phone is column 5 (index 4)
  const emails = sheet.getRange(2, 4, lastRow - 1, 1).getValues().flat();
  const phones = sheet.getRange(2, 5, lastRow - 1, 1).getValues().flat();
  const normalizedEmail = String(email || '').toLowerCase().trim();
  const normalizedPhone = String(phone || '').replace(/\D/g, '');
  for (var i = 0; i < emails.length; i++) {
    // String() is load-bearing: Sheets hands back a Number for a phone cell that
    // looks numeric, and calling .replace() on a Number throws. The throw would
    // be caught by doPost and returned as {success:false}, which was invisible
    // to the browser under the old no-cors post — i.e. every lead silently lost
    // while the form still showed a green checkmark.
    if (normalizedEmail && String(emails[i]).toLowerCase().trim() === normalizedEmail) return true;
    if (normalizedPhone && String(phones[i]).replace(/\D/g, '') === normalizedPhone) return true;
  }
  return false;
}

// Bonzo's Mortgage-group field keys, with the types the API reports:
//   loan_amount, down_payment, interest_rate, property_value, cash_out_amount,
//   household_income, requested_apr  -> numeric (bare numbers only)
//   purchase_price, credit_score, loan_type, loan_program, loan_purpose,
//   lead_source, current_step, monthly_payment, lender, ...            -> text
//   property_state, bankruptcy, foreclosure, working_with_agent        -> select
// There are NO custom fields defined on this Bonzo account, so anything without a
// native field here has to ride in one of the text fields above.
const BONZO_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM',
  'NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA',
  'WV','WI','WY','PR'
];

// Bonzo tags are free text, but unsanitised campaign names make them miserable
// to filter on, and Bonzo HTML-escapes "&" and "+" (verified: they come back as
// &amp; and &#43;). Reduce to [a-z0-9-] so a tag always reads cleanly.
function bonzoTag(value) {
  return String(value == null ? '' : value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Which ad network a lead came from, plus the campaign, as filterable tags.
// 'attr:none' is deliberate: explicitly tagging the unattributed set is how a
// break in tracking becomes visible instead of just looking like quiet weeks.
const CLICK_ID_NETWORKS = {
  gclid: 'ads:google', gbraid: 'ads:google', wbraid: 'ads:google',
  msclkid: 'ads:bing', fbclid: 'ads:meta'
};
/**
 * The touch a lead is credited to. Normally the latest visit; but when the
 * credit falls back to a first-touch ad click, source and campaign must come
 * from that SAME first touch. Mixing them tagged a paid lead as both
 * ads:google and utm:youtube-com, i.e. two origins at once.
 */
function effectiveTouch(data) {
  const fromFirst = !data.clickIdType && !data.clickId && !!(data.firstClickId || data.firstClickIdType);
  if (fromFirst) {
    return {
      fromFirst: true,
      source: data.firstUtmSource || '',
      campaign: data.firstUtmCampaign || '',
      content: '', // attribution.js does not send first-touch utm_content
    };
  }
  return {
    fromFirst: false,
    source: data.utm_source || '',
    campaign: data.utm_campaign || '',
    content: data.utm_content || '',
  };
}

function attributionTags(data) {
  const tags = [];
  const touch = effectiveTouch(data);
  const network = CLICK_ID_NETWORKS[effectiveClickIdType(data)];
  if (network) tags.push(network);
  if (touch.source) tags.push('utm:' + bonzoTag(touch.source));
  if (touch.campaign) tags.push('campaign:' + bonzoTag(touch.campaign));
  // The latest visit is still worth knowing when it differs from the credited
  // touch, but under its own prefix so it can't be read as the origin.
  if (touch.fromFirst && data.utm_source && bonzoTag(data.utm_source) !== bonzoTag(touch.source)) {
    tags.push('last:' + bonzoTag(data.utm_source));
  }
  if (!tags.length) tags.push('attr:none');
  return tags;
}

// The landing pages send display strings ("$300,000", "7.50%", "25%"); Bonzo's
// numeric fields need bare numbers. Returns '' when there's nothing usable.
function bonzoNumber(value) {
  if (value === null || value === undefined) return '';
  const cleaned = String(value).replace(/[^0-9.]/g, '');
  return cleaned && !isNaN(parseFloat(cleaned)) ? cleaned : '';
}

function addMortgageFields(body, data) {
  function set(key, value) { if (value !== '' && value !== undefined && value !== null) body[key] = value; }

  set('lead_source', data.magnet || '');
  set('credit_score', bonzoNumber(data.creditScore));

  const state = String(data.state || '').trim().toUpperCase();
  if (BONZO_STATES.indexOf(state) !== -1) set('property_state', state); // select — an unlisted value would 422 the whole push

  if (data.source !== 'dscr') return;

  const loanAmount = bonzoNumber(data.loanAmount);
  set('loan_amount', loanAmount);
  set('interest_rate', bonzoNumber(data.rate));
  set('loan_type', 'DSCR');
  // Calculator inputs/outputs that have a native Bonzo home. Annual tax,
  // annual insurance and monthly HOA have none, so they ride in the pinned
  // scenario note instead — see dscrScenarioNote().
  set('monthly_payment', bonzoNumber(data.monthlyPitia)); // Bonzo: "Estimated Monthly Payment"
  set('monthly_income', bonzoNumber(data.monthlyRent));   // the property's market rent
  // No DSCR field exists in Bonzo; loan_program is free text and reads sensibly
  // in the UI ("DSCR 1.14"), so campaign copy can merge it.
  if (data.dscr) set('loan_program', 'DSCR ' + String(data.dscr).trim());

  // The DSCR page sends the exact dollar figures as downPaymentAmount/purchasePrice
  // (data.downPayment is a PERCENT like "25%", which Bonzo's numeric down_payment
  // field can't use). Older payloads predate those two fields, so fall back to
  // recovering them from the loan amount and the percent: price = loan/(1 - pct/100).
  const exactDown = bonzoNumber(data.downPaymentAmount);
  const exactPrice = bonzoNumber(data.purchasePrice);
  if (exactDown || exactPrice) {
    set('down_payment', exactDown);
    set('purchase_price', exactPrice);
  } else {
    const loanNum = parseFloat(loanAmount) || 0;
    const downPct = parseFloat(bonzoNumber(data.downPayment)) || 0;
    if (loanNum > 0 && downPct > 0 && downPct < 100) {
      const price = loanNum / (1 - downPct / 100);
      set('purchase_price', String(Math.round(price)));
      set('down_payment', String(Math.round(price - loanNum)));
    }
  }
}

// The full DSCR scenario as a pinned note. Bonzo has no fields for annual tax,
// annual insurance or monthly HOA, and those three are exactly what decides
// whether a deal pencils — so rather than drop them, they go on the record as
// text Darren reads before the call. Returns '' when there's nothing to say.
function dscrScenarioNote(data) {
  if (data.source !== 'dscr') return '';
  const money = function (v) {
    const n = parseFloat(bonzoNumber(v));
    return isNaN(n) ? null : '$' + Math.round(n).toLocaleString('en-US');
  };
  const lines = [];
  const rent = money(data.monthlyRent);
  const price = money(data.purchasePrice);
  const tax = money(data.annualTax);
  const ins = money(data.annualInsurance);
  const hoa = money(data.monthlyHoa);
  const pi = money(data.monthlyPI);
  const pitia = money(data.monthlyPitia);

  if (rent) lines.push('Monthly market rent: ' + rent);
  if (price) lines.push('Purchase price: ' + price);
  if (data.downPayment) lines.push('Down payment: ' + data.downPayment + (money(data.downPaymentAmount) ? ' (' + money(data.downPaymentAmount) + ')' : ''));
  if (tax) lines.push('Annual property tax: ' + tax);
  if (ins) lines.push('Annual insurance: ' + ins);
  if (hoa) lines.push('Monthly HOA: ' + hoa);
  // Plain words only — Bonzo HTML-escapes note content, and it escapes more than
  // the obvious: "&" became "&amp;" and "+" became "&#43;", both verified live.
  // Stick to letters, digits, "$", "%", ":" and "." here.
  if (pi) lines.push('Monthly principal and interest: ' + pi);
  if (pitia) lines.push('Monthly PITIA: ' + pitia);
  if (!lines.length) return '';

  return 'DSCR calculator scenario (self-reported by the lead, not verified):\n\n'
    + lines.join('\n')
    + (data.dscr ? '\n\nResulting DSCR: ' + String(data.dscr).trim() : '');
}

// Posts the scenario note onto a freshly created prospect. Never throws — the
// lead is already in Sheets and Bonzo by this point, so a failed note must not
// surface as an error.
function postBonzoNote(prospectId, content, token) {
  if (!prospectId || !content) return;
  try {
    const resp = UrlFetchApp.fetch(BONZO_BASE_URL + '/prospects/' + prospectId + '/notes', {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + token },
      payload: JSON.stringify({ content: content, is_pinned: true }),
      muteHttpExceptions: true,
    });
    Logger.log('postBonzoNote: response ' + resp.getResponseCode());
  } catch (err) {
    Logger.log('postBonzoNote: threw ' + err.toString());
  }
}

function pushToBonzo(data) {
  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty('BONZO_API_KEY');
  if (!token) { Logger.log('pushToBonzo: no BONZO_API_KEY set, skipping'); return; } // Bonzo not configured yet — skip silently, Sheets still logs the lead

  // Every landing lead pushes to Bonzo regardless of state — licensed vs.
  // unlicensed is surfaced via the licensed-state/unlicensed-state tag below,
  // not by gating the push. (Previously out-of-area leads were skipped
  // entirely; still logged in Sheets either way.)

  // Campaign routing per source; everything else falls back to the default campaign.
  var campaignId;
  if (data.source === 'dscr') {
    campaignId = props.getProperty('BONZO_DSCR_CAMPAIGN_ID') || DSCR_CAMPAIGN_ID;
  } else if (data.source === 'fha') {
    campaignId = getFhaCampaignId(props); // "FHA Calculator Campaign: Licensed" (145797)
  } else if (data.source === 'real-estate-investing') {
    campaignId = props.getProperty('BONZO_REI_CAMPAIGN_ID') || REI_CAMPAIGN_ID;
  } else {
    campaignId = props.getProperty('BONZO_CAMPAIGN_ID');
  }
  const path = campaignId ? `/prospects/campaign/${campaignId}` : '/prospects';

  const tags = [];
  if (data.source === 'DebtConsolidation') tags.push('debt-consolidation', 'HELOC/cash-out interest');
  else if (data.source === 'newsletter') tags.push('newsletter');
  else if (data.source === 'QualifyForm') {
    tags.push('qualify-form');
    // Qualification answers as tags so they're filterable in Bonzo
    if (data.loanType)   tags.push('loan:' + data.loanType);
    if (data.timeline)   tags.push('timeline:' + data.timeline);
    if (data.priceRange) tags.push('price:' + data.priceRange);
    if (data.creditRange) tags.push('credit:' + data.creditRange);
    if (data.employment) tags.push('employment:' + data.employment);
  }
  // Landing pages — each source routes to its own Bonzo campaign via tags
  else if (data.source === 'heloc-hei') tags.push('heloc-hei', 'equity', 'loan:cash-out', 'priority:p1');
  else if (data.source === 'dscr') tags.push('dscr', 'investor', 'priority:p2');
  else if (data.source === 'self-employed') tags.push('self-employed', 'bank-statement', 'purchase', 'priority:p3');
  else if (data.source === 'fha') {
    tags.push('fha', 'fha-calculator', 'newsletter', 'priority:p4');
    if (data.creditScore) tags.push('credit:' + data.creditScore);
  }
  else if (data.source === 'real-estate-investing') tags.push('real-estate-investing', 'case-study', 'priority:p5');
  else tags.push('mortgage-calculator');

  // Every landing lead gets a licensed-state / unlicensed-state tag so Darren
  // can filter workable leads from out-of-area ones in Bonzo. Covers the named
  // landing pages plus the plain mortgage-calculator fallback (LeadForm.tsx on
  // the main site) — anything with a state on it.
  if (LANDING_SOURCES.indexOf(data.source) !== -1 || tags.indexOf('mortgage-calculator') !== -1) {
    tags.push(isLicensedState(data.state) ? 'licensed-state' : 'unlicensed-state');
    if (data.state) tags.push('state:' + String(data.state).trim().toUpperCase());
  }

  // Which ad (if any) produced this lead, as filterable tags.
  attributionTags(data).forEach(function (t) { tags.push(t); });

  const body = {
    first_name: data.firstName || '',
    last_name: data.lastName || '',
    email: data.email || '',
    phone: data.phone || '',
    source: data.source || 'website',
    tags: tags,
  };

  // Calculator output → Bonzo's Mortgage fields (the "Mortgage" tab on a prospect),
  // so campaign copy can merge the lead's real numbers.
  //
  // Verified live against the v3 API (see BONZO MORTGAGE FIELDS note at the top of
  // this file): these must be sent as FLAT TOP-LEVEL KEYS on the same campaign-
  // enrollment POST. A nested `mortgage: {...}` object is accepted with a 201 and
  // then silently dropped, as is any invented key like `custom_fields`. Tags and
  // campaign enrollment are unaffected by sending these alongside.
  addMortgageFields(body, data);

  // Ad attribution into Bonzo's own fields. This account has NO custom fields
  // and they can't be created via the API, so these ride in existing free-text
  // Mortgage fields. `lead_id` is unused and semantically right for a click id;
  // `current_step` gives Darren something readable on the prospect screen.
  // Do NOT reuse lead_source (holds the magnet) or loan_program (DSCR ratio).
  const clickId = effectiveClickId(data);
  if (clickId) body.lead_id = clickId;
  const credited = effectiveTouch(data);
  const campaignLabel = [credited.campaign, credited.content].filter(function (v) { return !!v; }).join(' / ');
  if (campaignLabel) body.current_step = campaignLabel;

  try {
    Logger.log('pushToBonzo: POST ' + BONZO_BASE_URL + path + ' body=' + JSON.stringify(body));
    const resp = UrlFetchApp.fetch(BONZO_BASE_URL + path, {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + token },
      payload: JSON.stringify(body),
      muteHttpExceptions: true, // don't let a Bonzo error break the Sheets write
    });
    Logger.log('pushToBonzo: response ' + resp.getResponseCode() + ' ' + resp.getContentText());

    // The lead is already safe in Sheets, so a Bonzo failure is not fatal — but
    // it does mean nobody gets nurtured, which is invisible without an alert.
    const code = resp.getResponseCode();
    if (code < 200 || code >= 300) {
      alertFailure(
        'Bonzo push failed with HTTP ' + code + ' (lead IS in the sheet, but was not enrolled):\n' +
        resp.getContentText().slice(0, 500),
        JSON.stringify(body)
      );
    }

    // Attach the full scenario as a pinned note (DSCR only). Best-effort: the
    // prospect is already created, so a missing id or a failed note is logged
    // and ignored rather than retried.
    const note = dscrScenarioNote(data);
    if (note) {
      let prospectId = null;
      try { prospectId = JSON.parse(resp.getContentText()).data.id; } catch (e) {}
      postBonzoNote(prospectId, note, token);
    }
  } catch (err) {
    Logger.log('pushToBonzo: threw ' + err.toString());
    // swallow — lead is already safe in Sheets even if Bonzo push fails
  }
}

// Writes to a "Debug" sheet tab instead of (or alongside) Logger.log — Apps
// Script's Cloud Logging for web-app-triggered executions is unreliable
// (frequently shows "No logs are available" even on completed runs), so this
// is the trustworthy way to see what happened. Safe to delete this tab and
// stop calling logDebug() once the DSCR email flow is confirmed stable.
function logDebug(ss, message) {
  try {
    const sheet = getOrCreateSheet(ss, 'Debug', ['Timestamp', 'Message']);
    sheet.appendRow([new Date().toISOString(), message]);
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

function postGuide(ss, name, urlProp, keyProp, body) {
  const props = PropertiesService.getScriptProperties();
  const url = props.getProperty(urlProp);
  const key = props.getProperty(keyProp);
  if (!url || !key) {
    logDebug(ss, name + ': ' + urlProp + '/KEY not set');
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
    logDebug(ss, name + ': url=' + url + ' response ' + code + ' ' + text);
    return { outcome: classifyGuideResponse(code), detail: name + ' ' + code + ' ' + text };
  } catch (err) {
    logDebug(ss, name + ': threw ' + err.toString());
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

/** Run whichever guide applies to this lead (at most one does). */
function sendGuideFor(ss, data) {
  const results = [sendDscrGuide(ss, data), sendReiGuide(ss, data), sendFhaGuide(ss, data)];
  for (let i = 0; i < results.length; i++) {
    if (results[i] && results[i].outcome !== 'skipped') return results[i];
  }
  return { outcome: 'skipped' };
}

// Email Darren when a lead fails to land, including the raw payload so it can
// be recovered by hand. Rate-limited to one alert per 5 minutes: a systemic
// outage would otherwise burn the 100/day consumer Gmail quota in minutes and
// bury the first, most useful alert.
const ALERT_EMAIL = 'darren@realdarrentsai.com';
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
    const data = JSON.parse(raw);
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

    lock.waitLock(20000);

    if (data.source === 'newsletter') {
      const sheet = getOrCreateSheet(ss, 'Newsletter', NEWSLETTER_HEADERS);
      sheet.appendRow([
        data.timestamp || new Date().toISOString(),
        data.email     || '',
        'newsletter'
      ]);
    } else if (SOURCE_SCHEMAS[data.source]) {
      // Each landing funnel writes to its OWN tab with its own columns.
      const schema = SOURCE_SCHEMAS[data.source];
      const sheet = getOrCreateSheet(ss, schema.tab, schema.headers);
      sheet.appendRow(schema.row(data));
    } else if (data.source === 'QualifyForm') {
      const sheet = getOrCreateSheet(ss, 'Qualify', QUALIFY_HEADERS);
      sheet.appendRow([
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
      ].concat(attrRow(data)));
    } else if (data.source === 'DebtConsolidation') {
      const sheet = getOrCreateSheet(ss, 'Debt Consolidation', DEBT_CONSOLIDATION_HEADERS);
      sheet.appendRow([
        data.timestamp            || new Date().toISOString(),
        data.firstName            || '',
        data.lastName             || '',
        data.email                || '',
        data.phone                || '',
        data.state                || '',
        data.bestTimeToCall       || '',
        data.leadSource           || '',
        data.homeValue            || 0,
        data.mortgageBalance      || 0,
        data.mortgagePayment      || 0,
        data.totalDebtBalance     || 0,
        data.totalDebtPayment     || 0,
        data.monthlySavings       || 0,
        data.refiMonthlyPayment   || 0,
        data.refiMonthlySavings   || 0,
        data.heloanMonthlyPayment || 0,
        data.heloanMonthlySavings || 0,
      ].concat(attrRow(data)));
    } else {
      const sheet = getOrCreateSheet(ss, 'Leads', LEAD_HEADERS);
      sheet.appendRow([
        data.timestamp            || new Date().toISOString(),
        data.firstName            || '',
        data.lastName             || '',
        data.email                || '',
        data.phone                || '',
        data.state                || '',
        data.loanAmount           || '',
        data.termYears            || '',
        data.annualRate           || '',
        data.message              || '',
        data.target               || '',
        data.timeline             || '',
        data.source               || 'SimpleMortgageCalculator',
        licensedCell(data)
      ].concat(attrRow(data)));
    }

    // Queue the slow work instead of doing it here. pushToBonzo plus the guide
    // calls (one of which renders a PDF) routinely ran past the /api/lead
    // proxy's 8s budget: the lead saved, but the visitor was told it failed and
    // Darren got a false "LEAD NOT SAVED" alert. Replying as soon as the row is
    // written keeps this response fast; processFollowUps does the rest within
    // about a minute.
    enqueueFollowUp(ss, data, raw);

    lock.releaseLock();

    return ContentService
      .createTextOutput(JSON.stringify({ success: true }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    // The lead is the product; losing one silently is the worst outcome here.
    // The alert carries the raw payload so it can be recovered by hand even if
    // both the sheet write and the Bonzo push failed.
    alertFailure('doPost threw: ' + err.toString(), raw);
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    try { lock.releaseLock(); } catch (e) { /* already released on the happy path */ }
  }
}

// ---------------------------------------------------------------------------
// Follow-up queue: Bonzo push and guide emails, run by a time-driven trigger.
// Setup (once): run installFollowUpTrigger() from the Apps Script editor.
// ---------------------------------------------------------------------------
const FOLLOWUP_TAB = 'Follow-ups';
const FOLLOWUP_HEADERS = ['Queued At', 'Status', 'Processed At', 'Error', 'Source', 'Email', 'Payload'];
const FOLLOWUP_COL = { status: 2, processedAt: 3, error: 4, payload: 7 };
const FOLLOWUP_MAX_RUN_MS = 4 * 60 * 1000; // stay well inside the 6 min execution cap
const FOLLOWUP_RUNNING_KEY = 'followups_running';
const GUIDE_MAX_ATTEMPTS = 3; // one per trigger run, so roughly a minute apart

/**
 * Next queue status after a guide attempt. Pure, so the whole retry policy is
 * testable without Sheets. `attempt` is 1 for the first try.
 *   { status, alert }  alert=true means email Darren now
 */
function nextGuideStatus(outcome, attempt) {
  if (outcome === 'sent' || outcome === 'skipped') return { status: 'done', alert: false };
  if (outcome === 'rejected') return { status: 'guide-rejected', alert: true };
  if (attempt >= GUIDE_MAX_ATTEMPTS) return { status: 'guide-failed', alert: true };
  return { status: 'guide-retry:' + attempt, alert: false };
}

/** Attempts already made for a 'guide-retry:N' status, or 0 if not retrying. */
function guideAttemptsFromStatus(status) {
  const m = /^guide-retry:(\d+)$/.exec(String(status || ''));
  return m ? parseInt(m[1], 10) : 0;
}

function enqueueFollowUp(ss, data, raw) {
  const sheet = getOrCreateSheet(ss, FOLLOWUP_TAB, FOLLOWUP_HEADERS);
  sheet.appendRow([
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
 * Runs every minute. Bonzo is pushed exactly once per lead. The guide email
 * reports its own outcome: sent -> 'done'; Resend busy/down -> 'guide-retry:N'
 * and only the guide is retried on later runs, up to GUIDE_MAX_ATTEMPTS, then
 * 'guide-failed'; a permanent rejection (invalid address, missing config) ->
 * 'guide-rejected' with no retry. Both terminal failures alert Darren. Anything
 * that throws is marked 'error' and alerted; the Sheet row is safe either way.
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
    if (!sheet || sheet.getLastRow() < 2) return;
    const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, FOLLOWUP_HEADERS.length).getValues();

    for (let i = 0; i < rows.length; i++) {
      if (Date.now() - started > FOLLOWUP_MAX_RUN_MS) break;
      const status = rows[i][FOLLOWUP_COL.status - 1];
      const priorAttempts = guideAttemptsFromStatus(status);
      if (status !== 'pending' && priorAttempts === 0) continue;
      const rowNum = i + 2;

      // Claim the row before any HTTP, so a crash mid-item can't re-run it.
      withSheetLock(function () {
        sheet.getRange(rowNum, FOLLOWUP_COL.status).setValue('processing');
        SpreadsheetApp.flush();
      });

      const raw = String(rows[i][FOLLOWUP_COL.payload - 1] || '{}');
      try {
        const data = JSON.parse(raw);
        // No lock held here: this is seconds of HTTP, including a PDF render.
        // Bonzo runs on the first pass only. A retry re-sends just the guide,
        // so it can never create a duplicate prospect.
        if (priorAttempts === 0) pushToBonzo(data);
        const guide = sendGuideFor(ss, data);
        const next = nextGuideStatus(guide.outcome, priorAttempts + 1);
        withSheetLock(function () {
          sheet.getRange(rowNum, FOLLOWUP_COL.status, 1, 3)
            .setValues([[next.status, new Date().toISOString(), next.status === 'done' ? '' : (guide.detail || '')]]);
        });
        if (next.alert) {
          alertFailure(
            'guide email NOT delivered to ' + (data.email || '(no email)') + ' [' + next.status + ']. ' +
            'The lead IS saved in the Sheet and Bonzo; send the guide by hand. Detail: ' + (guide.detail || ''),
            raw
          );
        }
      } catch (err) {
        withSheetLock(function () {
          sheet.getRange(rowNum, FOLLOWUP_COL.status, 1, 3).setValues([['error', new Date().toISOString(), err.toString()]]);
        });
        alertFailure('follow-up threw (Sheet row IS saved; Bonzo/guide may not have run): ' + err.toString(), raw);
      }
    }
  } finally {
    try { cache.remove(FOLLOWUP_RUNNING_KEY); } catch (e) { /* TTL will clear it */ }
  }
}

/** Run once by hand. Replaces any existing processFollowUps trigger. */
function installFollowUpTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'processFollowUps') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('processFollowUps').timeBased().everyMinutes(1).create();
}

function doGet() {
  return ContentService
    .createTextOutput(JSON.stringify({ status: 'ok' }))
    .setMimeType(ContentService.MimeType.JSON);
}
