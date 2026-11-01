/**
 * The website's copy of Apps Script's isTestLead() (google-apps-script.js), so
 * /api/lead can mark a TEST lead in its receipt and the browser can keep it
 * out of conversions.
 *
 * WHY (31 Oct 2026 QA review): a TEST submission fired generate_lead. The Sheet
 * marks it TEST and HubSpot skips it, but GA4 counted it as a website lead,
 * and generate_lead is the conversion Google Ads bids on. Every QA run was
 * teaching the campaign that Max's test traffic converts.
 *
 * The rule must stay identical to Apps Script's, or a lead the Sheet calls TEST
 * would still convert (or a real one would not). tests/test-lead.test.ts reads
 * both sources and fails when the email lists differ.
 */
export const TEST_EMAILS = [
  'liannemaxbalbastro@gmail.com',
  'lmbalbastro@gmail.com',
  'lianne_balbastro@dlsu.edu.ph',
  'darren@realdarrentsai.com',
];

export function isTestLead(d: { email?: unknown; phone?: unknown } | null | undefined): boolean {
  const email = String((d && d.email) || '').trim().toLowerCase();
  if (email) {
    const at = email.indexOf('@');
    if (at > 0) {
      const local = email.slice(0, at).split('+')[0];
      if (TEST_EMAILS.includes(local + email.slice(at))) return true;
    }
  }
  // 555-01xx is the reserved fictional range, the fallback for a test run from
  // an address not listed above.
  const digits = String((d && d.phone) || '').replace(/\D/g, '');
  return /^1?\d{3}55501\d{2}$/.test(digits);
}
