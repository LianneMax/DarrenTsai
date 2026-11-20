// Netlify Function: send-fha-guide
//
// Called server-side by the Apps Script webhook (google-apps-script.js) right
// after an FHA Calculator lead is logged to Sheets.
// Like send-rei-guide.mts, the magnet is a static file with no per-lead
// numbers to redraw — the function just fetches the published spreadsheet
// (already at /magnets/fha-affordability-calculator.xlsx) and emails it
// from darren@realdarrentsai.com via Resend.
//
// SETUP:
// 1. Uses the same Resend account/domain as send-dscr-guide.mts / send-rei-guide.mts —
//    no new signup needed. Netlify → Site settings → Environment variables, add:
//      FHA_GUIDE_API_KEY = <any long random string you make up>
// 2. In the Apps Script (Script Properties), add:
//      NETLIFY_FHA_PDF_URL = https://realdarrentsai.com/api/send-fha-guide
//      NETLIFY_FHA_PDF_KEY = <same random string as FHA_GUIDE_API_KEY>
//
// This endpoint requires the x-api-key header to match FHA_GUIDE_API_KEY —
// it sends a real email on every call, so it isn't left open to the public.

import type { Config } from "@netlify/functions";
import { cachedBytes, guideSender, toBase64 } from "../lib/guide-shared.mts";
import { renderEmail, para, bullets, files, button, contactLine, COMPLIANCE } from "../lib/email-layout.mts";

const XLSX_URL = "https://realdarrentsai.com/magnets/fha-affordability-calculator.xlsx";

// Fetched once, then held across warm invocations.
const getXlsxBytes = cachedBytes(XLSX_URL, "xlsx");

function buildEmailHtml(lead: { firstName?: string }) {
  // Darren's voice and the shared layout, 21 Nov 2026.
  return renderEmail({
    title: "The real FHA payment number",
    preheader: "My FHA calculator, with UFMIP and monthly MIP already built in.",
    firstName: lead.firstName,
    headline: "Your FHA calculator is here",
    blocks: [
      para("Here's my FHA Affordability &amp; True Payment Calculator, attached. Most online calculators leave out the upfront mortgage insurance (UFMIP) and the monthly MIP. This one builds both in, so escrow doesn't surprise you."),
      files(["fha-affordability-calculator.xlsx"]),
      para("Keep 3 things in mind as you run your numbers:", 20),
      bullets([
        "3.5% down is the FHA minimum.",
        "State and local down payment assistance can cover up to 100% of that 3.5%.",
        "Your real out-of-pocket is your down payment plus closing costs, minus seller concessions.",
      ]),
      para("Want to see if you qualify for down payment help? Book a 15-minute call and we'll map out a real monthly budget for your scenario.", 6),
      button("Book a 15-minute call", "https://realdarrentsai.com/book/?utm_source=email&amp;utm_medium=guide&amp;utm_campaign=fha-guide"),
      contactLine(),
    ],
    compliance: COMPLIANCE.estimates,
  });
}

export default guideSender({
  name: "send-fha-guide",
  apiKeyEnv: "FHA_GUIDE_API_KEY",
  subject: "The real FHA payment number (no hidden fees)",
  buildEmailHtml,
  buildAttachments: async () => [
    { filename: "fha-affordability-calculator.xlsx", content: toBase64(await getXlsxBytes()) },
  ],
});

export const config: Config = {
  path: "/api/send-fha-guide",
};
