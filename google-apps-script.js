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

// Which Bonzo campaign each funnel enrolls into. A Script Property always wins
// over the id above, so a campaign can be re-pointed without a deploy.
//
// This was three near-identical if/else branches, of which only FHA had a
// helper. The asymmetry was the tell: adding a funnel meant copying a branch and
// remembering which of the two shapes to copy. A funnel's campaign is one row
// here now. Anything absent from this table falls back to BONZO_CAMPAIGN_ID, and
// a lead with no campaign configured at all posts to bare /prospects rather than
// to /prospects/campaign/undefined.
/**
 * The contact modal, per page.
 *
 * Every copy of it posted source:'MortgageCalculator' from every page until
 * 26 Sep 2026, so the Sheet's Source column, the Bonzo tags and the GA4 event
 * all said the same thing wherever the lead came from. These sources have no
 * funnel-specific columns, so they still fall through doPost to the generic
 * Leads tab, which holds every field they send; only the label changes.
 */
const CONTACT_SOURCES = {
  'home-contact':                'home',
  'mortgage-calculator-contact': 'mortgage-calculator',
  'dscr-contact':                'dscr',
  'fha-contact':                 'fha',
  'rei-contact':                 'real-estate-investing'
};

const FUNNEL_CAMPAIGNS = {
  'dscr':                  { prop: 'BONZO_DSCR_CAMPAIGN_ID', fallback: DSCR_CAMPAIGN_ID },
  'fha':                   { prop: 'BONZO_FHA_CAMPAIGN_ID',  fallback: FHA_CAMPAIGN_ID },
  'real-estate-investing': { prop: 'BONZO_REI_CAMPAIGN_ID',  fallback: REI_CAMPAIGN_ID }
};

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

// Newsletter is a different shape: email only, no name or phone, and no
// attribution columns. Nothing on the site sends source 'newsletter' any more,
// so this exists to keep the historical tab readable.
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

// The 'heloc-hei' route was removed here. Nothing on the site sent it: HELOC and
// home-equity interest is handled by the debt-consolidation funnel on the
// homepage, which the /yt/heloc and /yt/equity short links already point to, and
// which tags its leads 'HELOC/cash-out interest' in Bonzo. A schema with no
// sender is a tab that can only ever be created by accident.
//
// The existing "HELOC vs HEI" tab is untouched: nothing here deletes a tab, so
// whatever it already holds stays readable. If a dedicated HELOC page ships
// later, add its schema back alongside its form rather than reviving this one
// speculatively.
const SOURCE_SCHEMAS = {
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

// 'Licensed?' sits AFTER the attribution columns, which reads oddly next to the
// other tabs where it comes before them. That is the append-only rule at work:
// this tab already holds rows written under the current order, and inserting the
// column where it "belongs" would shift the meaning of every historical cell to
// its right. An odd-looking header is worth far less than a corrupted tab.
const DEBT_CONSOLIDATION_HEADERS = [
  'Timestamp', 'First Name', 'Last Name', 'Email', 'Phone', 'State',
  'Best Time to Call', 'Lead Source',
  'Home Value', 'Mortgage Balance', 'Mortgage Payment',
  // These two sit mid-array, which is the one exception to the append-only rule
  // in this file, and it was only safe because the two columns were inserted
  // into the live tab by hand FIRST, so every historical row shifted right with
  // its headers. Do not repeat this pattern: anything else new goes at the end.
  'Mortgage Rate', 'Mortgage Term',
  'Total Debt Balance', 'Total Debt Payment', 'Monthly Savings',
  'Refi Monthly Payment', 'Refi Monthly Savings',
  'HELOAN Monthly Payment', 'HELOAN Monthly Savings'
].concat(ATTR_HEADERS, ['Licensed?']);


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

/**
 * Bonzo's "this email is already a prospect" answer, told apart from a genuine
 * failure.
 *
 * Deliberately narrow: a 422 alone is not enough, because 422 is also how a
 * malformed body comes back, and silencing that would hide a real break. Both
 * the status and the wording have to match.
 */
function isReturningProspect(code, text) {
  if (code !== 422) return false;
  return /already\s+(exists|been\s+taken)|has\s+already\s+been\s+taken|duplicate/i.test(String(text || ''));
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
  // hasOwnProperty, not a bare lookup: data.source arrives from the posted form
  // body, and a source of 'constructor' or '__proto__' would otherwise find an
  // inherited property, read as a configured funnel, and send the lead to bare
  // /prospects instead of the default campaign.
  const funnelCampaign = Object.prototype.hasOwnProperty.call(FUNNEL_CAMPAIGNS, data.source)
    ? FUNNEL_CAMPAIGNS[data.source]
    : null;
  const campaignId = funnelCampaign
    ? (props.getProperty(funnelCampaign.prop) || funnelCampaign.fallback)
    : props.getProperty('BONZO_CAMPAIGN_ID');
  const path = campaignId ? `/prospects/campaign/${campaignId}` : '/prospects';

  const tags = [];
  if (Object.prototype.hasOwnProperty.call(CONTACT_SOURCES, data.source)) {
    // The contact modal, one entry per page it lives on. Every copy used to post
    // 'MortgageCalculator', so a DSCR investor and a homeowner after equity
    // arrived in Bonzo tagged identically and Darren had no way to open the
    // right conversation. hasOwnProperty, not a bare lookup: data.source comes
    // from the posted body and '__proto__' would otherwise find an inherited
    // property.
    tags.push('contact', CONTACT_SOURCES[data.source]);
  }
  else if (data.source === 'DebtConsolidation') tags.push('debt-consolidation', 'HELOC/cash-out interest');
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
  // Landing pages — each source routes to its own Bonzo campaign via tags.
  // No 'heloc-hei' branch: that funnel is the debt-consolidation form above,
  // which already carries the 'HELOC/cash-out interest' tag.
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
  // Debt Consolidation is named explicitly: it collects a state like the others
  // but is not a LANDING_SOURCE, so it used to be the one funnel where an
  // out-of-area lead looked identical to a workable one in both Bonzo and the
  // Sheet.
  if (
    LANDING_SOURCES.indexOf(data.source) !== -1 ||
    data.source === 'DebtConsolidation' ||
    tags.indexOf('contact') !== -1 ||
    tags.indexOf('mortgage-calculator') !== -1
  ) {
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
    if (isReturningProspect(code, resp.getContentText())) {
      // Not a failure. Bonzo answers 422 "already exists" when the email is
      // already a prospect, which is precisely what happens when someone who
      // downloaded one guide comes back for another — a good event, reported as
      // a LEAD PIPELINE FAILURE until 26 Sep 2026. Darren was being paged about
      // his own returning leads, which is the fastest way to teach someone to
      // ignore an alert that matters.
      //
      // What it does mean is real and worth being plain about: the prospect is
      // NOT enrolled in this funnel's campaign and their tags are NOT updated,
      // so a DSCR lead who returns for the FHA guide stays tagged as they were.
      // Fixing that needs an update-by-email call, and this account's v3
      // behaviour has to be verified live before anything here relies on it,
      // the way the Mortgage fields were. It is a HubSpot-era job.
      //
      // The row still goes to the Debug tab, which is the trustworthy record of
      // what happened to a lead, so a returning lead is visible when looked for
      // rather than announced.
      logDebug(SpreadsheetApp.openById(SPREADSHEET_ID), 'pushToBonzo: returning lead, already a prospect, not re-enrolled', data.email);
    } else if (code < 200 || code >= 300) {
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
    sheet.appendRow([new Date().toISOString(), message, email || '']);
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
function sendContactConfirmation(ss, data) {
  if (!Object.prototype.hasOwnProperty.call(CONTACT_SOURCES, data.source)) return { outcome: 'skipped' };
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('NETLIFY_CONTACT_CONFIRM_URL') || !props.getProperty('NETLIFY_CONTACT_CONFIRM_KEY')) {
    return { outcome: 'skipped' };
  }
  return postGuide(ss, 'sendContactConfirmation', 'NETLIFY_CONTACT_CONFIRM_URL', 'NETLIFY_CONTACT_CONFIRM_KEY', {
    firstName: data.firstName || '',
    lastName: data.lastName || '',
    email: data.email || '',
    message: data.message || ''
  });
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
        data.mortgageRate         || 0,
        data.mortgageTerm         || 0,
        data.totalDebtBalance     || 0,
        data.totalDebtPayment     || 0,
        data.monthlySavings       || 0,
        data.refiMonthlyPayment   || 0,
        data.refiMonthlySavings   || 0,
        data.heloanMonthlyPayment || 0,
        data.heloanMonthlySavings || 0,
      ].concat(attrRow(data), [licensedCell(data)]));
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
  if (outcome === 'sent' || outcome === 'skipped') return { status: 'done', alert: false };
  if (outcome === 'rejected') return { status: 'guide-rejected', alert: true };
  if (attempt >= GUIDE_MAX_ATTEMPTS) return { status: 'guide-failed', alert: true };
  return { status: 'guide-retry:' + attempt, alert: false };
}

/**
 * Attempts already made, read back from a 'guide-retry:N' or 'processing:N'
 * status. 0 for anything else, including a bare legacy 'processing'.
 */
function guideAttemptsFromStatus(status) {
  const m = /^(?:guide-retry|processing):(\d+)$/.exec(String(status || ''));
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

  if (/^guide-retry:\d+$/.test(s)) {
    const attempts = guideAttemptsFromStatus(s);
    if (attempts >= GUIDE_MAX_ATTEMPTS) return { claim: false, attempts: attempts, reason: 'exhausted' };
    if (age < guideBackoffMs(attempts)) return { claim: false, attempts: attempts, reason: 'backoff' };
    return { claim: true, attempts: attempts, reason: 'retry' };
  }

  // A row stuck mid-flight because the run that claimed it died.
  if (s === 'processing' || /^processing:\d+$/.test(s)) {
    if (age < FOLLOWUP_ORPHAN_MS) return { claim: false, attempts: 0, reason: 'in-flight' };
    return { claim: true, attempts: guideAttemptsFromStatus(s), reason: 'orphan' };
  }

  return { claim: false, attempts: 0, reason: 'terminal' };
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
 * Runs every minute, but a given row is only picked up when claimDecision says
 * so: new rows immediately, a failed guide after its backoff (1, 5, 20, 60 then
 * 180 minutes), and a row stuck in 'processing:N' once it is old enough to be
 * an orphan from a run that died.
 *
 * Bonzo is pushed exactly once per lead. The guide email reports its own
 * outcome: sent -> 'done'; Resend busy/down -> 'guide-retry:N', retried up to
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

      // Claim the row before any HTTP, so a crash mid-item can't re-run it.
      // The attempt count goes into the claim, and the timestamp with it: the
      // old bare 'processing' lost the count, and a run that died here left the
      // row stuck forever with nothing to measure staleness against.
      withSheetLock(function () {
        sheet.getRange(rowNum, FOLLOWUP_COL.status, 1, 2)
          .setValues([['processing:' + priorAttempts, new Date().toISOString()]]);
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

// ── Daily digest ────────────────────────────────────────────────────────────
//
// WHY. alertFailure sends at most one email every 5 minutes. That is right for
// a flood, but it means the second and later failures in a burst are visible
// only to someone who thinks to open the Follow-ups tab. If a guide API key
// expires, every lead fails, Darren gets one email, and the rest are silent.
// This runs once a day and reports everything, throttled by nothing.

const GUIDE_DIGEST_STATUSES = ['guide-failed', 'guide-rejected', 'error'];
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
  const lines = items.map(function (it) {
    return '- row ' + it.row + '  [' + it.status + ']  ' + (it.email || '(no email)') +
           (it.source ? '  (' + it.source + ')' : '') + '\n    ' + it.error;
  });
  return 'These leads ARE saved in the Sheet. Their guide email is not.\n' +
         'Send each one by hand, then clear the Status cell to retry it.\n\n' +
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
      subject: items.length + ' guide email(s) not delivered in the last 24h',
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
