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
 * 5. Never paste tokens/ids directly in this file — Script Properties keeps them out
 *    of source control and off Netlify entirely.
 *
 * DSCR PDF EMAIL SETUP (sends the personalized DSCR guide via the Netlify function):
 * 1. Add property: NETLIFY_DSCR_PDF_URL = https://realdarrentsai.com/api/send-dscr-guide
 * 2. Add property: NETLIFY_DSCR_PDF_KEY = <same random string set as DSCR_GUIDE_API_KEY
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

function isLicensedState(state) {
  if (!state) return false;
  return LICENSED_STATES.indexOf(String(state).trim().toUpperCase()) !== -1;
}

// FHA licensed campaign id (script-property override wins, else the known id above).
function getFhaCampaignId(props) {
  return props.getProperty('BONZO_FHA_CAMPAIGN_ID') || FHA_CAMPAIGN_ID;
}

const LEAD_HEADERS = [
  'Timestamp', 'First Name', 'Last Name', 'Email', 'Phone', 'State',
  'Loan Amount', 'Term (Years)', 'Rate (%)', 'Goals',
  'Target Outcome', 'Timeline', 'Source'
];

const NEWSLETTER_HEADERS = [
  'Timestamp', 'Email', 'Source'
];

const QUALIFY_HEADERS = [
  'Timestamp', 'First Name', 'Last Name', 'Email', 'Phone',
  'Loan Type', 'Timeline', 'Price Range', 'Credit Range',
  'Employment', 'Notes', 'Source'
];

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
    headers: COMMON_LEAD.concat(['Magnet', 'Source', 'Licensed?']),
    row: function (d) { return commonLeadRow(d).concat([d.magnet || '', d.source, licensedCell(d)]); }
  },
  'dscr': {
    tab: 'DSCR',
    headers: COMMON_LEAD.concat(['Magnet', 'Source', 'DSCR', 'Down Payment', 'Loan Amount', 'Rate', 'Licensed?']),
    row: function (d) {
      return commonLeadRow(d).concat([
        d.magnet || '', d.source, d.dscr || '', d.downPayment || '', d.loanAmount || '', d.rate || '', licensedCell(d)
      ]);
    }
  },
  'self-employed': {
    tab: 'Self-Employed',
    headers: COMMON_LEAD.concat(['Magnet', 'Source', 'Licensed?']),
    row: function (d) { return commonLeadRow(d).concat([d.magnet || '', d.source, licensedCell(d)]); }
  },
  'fha': {
    tab: 'FHA',
    headers: COMMON_LEAD.concat(['Magnet', 'Source', 'Credit Score', 'Licensed?']),
    row: function (d) {
      return commonLeadRow(d).concat([d.magnet || '', d.source, d.creditScore || '', licensedCell(d)]);
    }
  },
  'real-estate-investing': {
    tab: 'Real Estate Investing',
    headers: COMMON_LEAD.concat(['Magnet', 'Source', 'Licensed?']),
    row: function (d) { return commonLeadRow(d).concat([d.magnet || '', d.source, licensedCell(d)]); }
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
];


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
  }
  return sheet;
}

function isDuplicateLead(sheet, email, phone) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return false; // only header row, no data yet
  // Email is column 4 (index 3), Phone is column 5 (index 4)
  const emails = sheet.getRange(2, 4, lastRow - 1, 1).getValues().flat();
  const phones = sheet.getRange(2, 5, lastRow - 1, 1).getValues().flat();
  const normalizedEmail = (email || '').toLowerCase().trim();
  const normalizedPhone = (phone || '').replace(/\D/g, '');
  for (var i = 0; i < emails.length; i++) {
    if (normalizedEmail && emails[i].toLowerCase().trim() === normalizedEmail) return true;
    if (normalizedPhone && phones[i].replace(/\D/g, '') === normalizedPhone) return true;
  }
  return false;
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
  // can filter workable leads from out-of-area ones in Bonzo.
  if (LANDING_SOURCES.indexOf(data.source) !== -1) {
    tags.push(isLicensedState(data.state) ? 'licensed-state' : 'unlicensed-state');
    if (data.state) tags.push('state:' + String(data.state).trim().toUpperCase());
  }

  const body = {
    first_name: data.firstName || '',
    last_name: data.lastName || '',
    email: data.email || '',
    phone: data.phone || '',
    source: data.source || 'website',
    tags: tags,
  };

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
  } catch (err) {
    Logger.log('pushToBonzo: threw ' + err.toString());
    // swallow — lead is already safe in Sheets even if Bonzo push fails
  }
}

function sendDscrGuide(data) {
  if (data.source !== 'dscr') return; // only the DSCR funnel has a guide to send
  const props = PropertiesService.getScriptProperties();
  const url = props.getProperty('NETLIFY_DSCR_PDF_URL');
  const key = props.getProperty('NETLIFY_DSCR_PDF_KEY');
  if (!url || !key) { Logger.log('sendDscrGuide: NETLIFY_DSCR_PDF_URL/KEY not set, skipping'); return; }

  try {
    const resp = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      headers: { 'x-api-key': key },
      payload: JSON.stringify({
        firstName: data.firstName || '',
        lastName: data.lastName || '',
        email: data.email || '',
        dscr: data.dscr || '',
        downPayment: data.downPayment || '',
        rate: data.rate || '',
        loanAmount: data.loanAmount || '',
      }),
      muteHttpExceptions: true, // never let an email failure break the lead flow
    });
    Logger.log('sendDscrGuide: response ' + resp.getResponseCode() + ' ' + resp.getContentText());
  } catch (err) {
    Logger.log('sendDscrGuide: threw ' + err.toString());
  }
}

function doPost(e) {
  try {
    // Browser sends text/plain with no-cors mode — body is still valid JSON
    const raw = (e.postData && e.postData.contents) ? e.postData.contents : '{}';
    const data = JSON.parse(raw);
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

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
      ]);
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
      ]);
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
        data.source               || 'SimpleMortgageCalculator'
      ]);
    }

    pushToBonzo(data);
    sendDscrGuide(data);

    return ContentService
      .createTextOutput(JSON.stringify({ success: true }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet() {
  return ContentService
    .createTextOutput(JSON.stringify({ status: 'ok' }))
    .setMimeType(ContentService.MimeType.JSON);
}
