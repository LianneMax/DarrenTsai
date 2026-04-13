/**
 * Darren Tsai Mortgage Calculator — Google Apps Script
 *
 * SETUP INSTRUCTIONS:
 * 1. Open your Google Sheet:
 *    https://docs.google.com/spreadsheets/d/1DZ98FIyaF8hYi-c3FPMLVF71dVVnJWyejg4_J2ZkepI/edit
 * 2. Click Extensions → Apps Script
 * 3. Delete any existing code and paste this entire file
 * 4. Click Save (disk icon)
 * 5. Click Deploy → New deployment
 * 6. Click the gear icon next to "Type" → Select "Web app"
 * 7. Set:
 *      Description:   Mortgage Calculator Leads
 *      Execute as:    Me
 *      Who has access: Anyone
 * 8. Click Deploy → Authorize access (follow prompts)
 * 9. Copy the Web App URL — it looks like:
 *    https://script.google.com/macros/s/XXXXXXXXXX/exec
 * 10. In Netlify → Site settings → Environment variables, add:
 *      VITE_GOOGLE_SHEET_WEBHOOK_URL = (paste the URL from step 9)
 */

const SPREADSHEET_ID = '1DZ98FIyaF8hYi-c3FPMLVF71dVVnJWyejg4_J2ZkepI';

const LEAD_HEADERS = [
  'Timestamp', 'First Name', 'Last Name', 'Email', 'Phone',
  'Loan Amount', 'Term (Years)', 'Rate (%)', 'Message',
  'Subscribe Newsletter', 'Source'
];

const NEWSLETTER_HEADERS = [
  'Timestamp', 'Email', 'Source'
];

function getOrCreateSheet(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(headers);
    // Style the header row
    const headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setFontWeight('bold');
    headerRange.setBackground('#223d55');
    headerRange.setFontColor('#ffffff');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function doPost(e) {
  try {
    // Accepts both application/json and text/plain (no-cors sends text/plain)
    const raw = e.postData ? e.postData.contents : '{}';
    const data = JSON.parse(raw);
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

    if (data.source === 'newsletter') {
      // Newsletter sign-up
      const sheet = getOrCreateSheet(ss, 'Newsletter', NEWSLETTER_HEADERS);
      sheet.appendRow([
        data.timestamp || new Date().toISOString(),
        data.email || '',
        data.source || 'newsletter'
      ]);
    } else {
      // Lead form submission
      const sheet = getOrCreateSheet(ss, 'Leads', LEAD_HEADERS);
      sheet.appendRow([
        data.timestamp || new Date().toISOString(),
        data.firstName  || '',
        data.lastName   || '',
        data.email      || '',
        data.phone      || '',
        data.loanAmount || '',
        data.termYears  || '',
        data.annualRate || '',
        data.message    || '',
        data.subscribeNewsletter ? 'Yes' : 'No',
        data.source     || 'calculator'
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

// Health-check endpoint — visiting the URL directly returns { status: "ok" }
function doGet() {
  return ContentService
    .createTextOutput(JSON.stringify({ status: 'ok', service: 'Darren Tsai Mortgage Calculator' }))
    .setMimeType(ContentService.MimeType.JSON);
}
