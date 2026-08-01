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
 * 3. Add property: BONZO_CAMPAIGN_ID = <campaign id leads should land in — ask Bonzo
 *    support or check dashboard if unsure, default campaign works if blank>
 * 4. Never paste the token directly in this file — Script Properties keeps it out
 *    of source control and off Netlify entirely.
 */

const SPREADSHEET_ID = '1DZ98FIyaF8hYi-c3FPMLVF71dVVnJWyejg4_J2ZkepI';
const BONZO_BASE_URL = 'https://app.getbonzo.com/api/v3';

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

const LANDING_HEADERS = [
  'Timestamp', 'First Name', 'Last Name', 'Email', 'Phone', 'State',
  'Magnet', 'Source',
  // Calculator context (blank for simple opt-in forms; populated by the DSCR calculator)
  'DSCR', 'Down Payment', 'Loan Amount', 'Rate'
];

const LANDING_SOURCES = ['heloc-hei', 'dscr', 'self-employed', 'fha'];

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
  if (!token) return; // Bonzo not configured yet — skip silently, Sheets still logs the lead

  const campaignId = props.getProperty('BONZO_CAMPAIGN_ID');
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
  else if (data.source === 'fha') tags.push('fha', 'fha-calculator', 'newsletter', 'priority:p4');
  else tags.push('mortgage-calculator');

  const body = {
    first_name: data.firstName || '',
    last_name: data.lastName || '',
    email: data.email || '',
    phone: data.phone || '',
    source: data.source || 'website',
    tags: tags,
  };

  try {
    UrlFetchApp.fetch(BONZO_BASE_URL + path, {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + token },
      payload: JSON.stringify(body),
      muteHttpExceptions: true, // don't let a Bonzo error break the Sheets write
    });
  } catch (err) {
    // swallow — lead is already safe in Sheets even if Bonzo push fails
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
    } else if (LANDING_SOURCES.indexOf(data.source) !== -1) {
      // One tab per landing page (Heloc-hei, Dscr, Self-employed, Fha)
      const tabName = data.source.charAt(0).toUpperCase() + data.source.slice(1);
      const sheet = getOrCreateSheet(ss, tabName, LANDING_HEADERS);
      sheet.appendRow([
        data.timestamp || new Date().toISOString(),
        data.firstName || '',
        data.lastName  || '',
        data.email     || '',
        data.phone     || '',
        data.state     || '',
        data.magnet    || '',
        data.source,
        data.dscr        || '',
        data.downPayment || '',
        data.loanAmount  || '',
        data.rate        || ''
      ]);
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
