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
 */

const SPREADSHEET_ID = '1DZ98FIyaF8hYi-c3FPMLVF71dVVnJWyejg4_J2ZkepI';

const LEAD_HEADERS = [
  'Timestamp', 'First Name', 'Last Name', 'Email', 'Phone',
  'Loan Amount', 'Term (Years)', 'Rate (%)', 'Goals',
  'Target Outcome', 'Timeline', 'Source'
];

const NEWSLETTER_HEADERS = [
  'Timestamp', 'Email', 'Source'
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
    } else {
      const sheet = getOrCreateSheet(ss, 'Leads', LEAD_HEADERS);
      if (data.source !== 'DebtConsolidation' && isDuplicateLead(sheet, data.email, data.phone)) {
        return ContentService
          .createTextOutput(JSON.stringify({ success: true, duplicate: true }))
          .setMimeType(ContentService.MimeType.JSON);
      }
      sheet.appendRow([
        data.timestamp            || new Date().toISOString(),
        data.firstName            || '',
        data.lastName             || '',
        data.email                || '',
        data.phone                || '',
        data.loanAmount           || '',
        data.termYears            || '',
        data.annualRate           || '',
        data.message              || '',
        data.target               || '',
        data.timeline             || '',
        data.source               || 'SimpleMortgageCalculator'
      ]);
    }

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
