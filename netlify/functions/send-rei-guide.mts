// Netlify Function: send-rei-guide
//
// Called server-side by the Apps Script webhook (google-apps-script.js) right
// after a Real Estate Investing lead is logged to Sheets.
// Unlike send-dscr-guide.mts, this PDF is a static case study with no
// per-lead numbers to redraw — the function just fetches the published PDF
// (already at /magnets/real-estate-investing-case-study.pdf) and emails it
// from darren@realdarrentsai.com via Resend.
//
// SETUP:
// 1. Uses the same Resend account/domain as send-dscr-guide.mts — no new
//    signup needed. Netlify → Site settings → Environment variables, add:
//      REI_GUIDE_API_KEY = <any long random string you make up>
// 2. In the Apps Script (Script Properties), add:
//      NETLIFY_REI_PDF_URL = https://realdarrentsai.com/api/send-rei-guide
//      NETLIFY_REI_PDF_KEY = <same random string as REI_GUIDE_API_KEY>
//
// This endpoint requires the x-api-key header to match REI_GUIDE_API_KEY —
// it sends a real email on every call, so it isn't left open to the public.

import type { Config } from "@netlify/functions";
import { cachedBytes, guideSender, toBase64 } from "../lib/guide-shared.mts";
import { renderEmail, para, bullets, strong, files, button, contactLine, COMPLIANCE } from "../lib/email-layout.mts";

const PDF_URL = "https://realdarrentsai.com/magnets/real-estate-investing-case-study.pdf";

// Fetched once, then held across warm invocations.
const getPdfBytes = cachedBytes(PDF_URL, "pdf");

function buildEmailHtml(lead: { firstName?: string }) {
  // Darren's voice and the shared layout, 21 Nov 2026.
  return renderEmail({
    title: "The real numbers + my out-of-state BRRRR mistake",
    preheader: "Purchase to refinance: the real numbers, the timeline, and what my mistakes cost me.",
    firstName: lead.firstName,
    headline: "My BRRRR case study is here",
    blocks: [
      para("Here's the case study on my first out-of-state BRRRR rental: the real numbers, the timeline, and the mistakes that cost me money. It's attached."),
      files(["real-estate-investing-case-study.pdf"]),
      para("Two pages to start with:", 20),
      bullets([`${strong("Page 2:")} every number, purchase through refinance`, `${strong("Page 9:")} the mistakes most investors don't think about`]),
      para("Quick question: are you looking at out-of-state markets right now, or researching for later? Reply and let me know. Happy to share what I'm seeing in the markets.", 6),
      button("Book a 15-minute call", "https://realdarrentsai.com/book/?utm_source=email&amp;utm_medium=guide&amp;utm_campaign=rei-guide"),
      contactLine(),
    ],
    compliance: COMPLIANCE.caseStudy,
  });
}

export default guideSender({
  name: "send-rei-guide",
  apiKeyEnv: "REI_GUIDE_API_KEY",
  subject: "The real numbers + my out-of-state BRRRR mistake",
  buildEmailHtml,
  buildAttachments: async () => [
    { filename: "real-estate-investing-case-study.pdf", content: toBase64(await getPdfBytes()) },
  ],
});

export const config: Config = {
  path: "/api/send-rei-guide",
};
