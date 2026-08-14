// Netlify Function: send-fha-guide
//
// Called server-side by the Apps Script webhook (google-apps-script.js) right
// after an FHA Calculator lead is logged to Sheets + pushed to Bonzo.
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

import type { Config, Context } from "@netlify/functions";

const XLSX_URL = "https://realdarrentsai.com/magnets/fha-affordability-calculator.xlsx";
const FROM = "Darren Tsai <darren@realdarrentsai.com>";

// Cache bytes across warm invocations.
let xlsxBytes: ArrayBuffer | null = null;

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function buildEmailHtml(lead: { firstName?: string }) {
  const firstName = escapeHtml(lead.firstName || "there");
  const FONT = "'Outfit',Arial,Helvetica,sans-serif";

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>The real FHA payment number</title>
<!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>@media only screen and (max-width:620px){.wrap{width:100% !important;}.pad{padding-left:24px !important;padding-right:24px !important;}.h1{font-size:24px !important;line-height:30px !important;}}</style>
</head>
<body style="margin:0;padding:0;background-color:#f5f7f9;">
<span style="display:none;font-size:1px;color:#f5f7f9;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">Your FHA Affordability Calculator is attached, MIP and UFMIP already built in.</span>

<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#f5f7f9;">
<tr><td align="center" style="padding:32px 12px;">
<table role="presentation" class="wrap" cellpadding="0" cellspacing="0" border="0" width="600" style="width:600px;max-width:600px;background-color:#ffffff;border:1px solid #e6ebf0;">

  <tr>
    <td style="background-color:#517686;padding:26px 40px 22px 40px;" class="pad">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
        <tr><td style="font-family:${FONT};font-size:10px;line-height:14px;mso-line-height-rule:exactly;font-weight:600;letter-spacing:1.4px;text-transform:uppercase;color:#c8e2e8;padding-bottom:8px;">FHA Affordability</td></tr>
        <tr><td style="font-family:${FONT};font-size:21px;line-height:27px;mso-line-height-rule:exactly;font-weight:700;letter-spacing:-0.01em;color:#ffffff;">Darren Tsai</td></tr>
        <tr><td style="font-family:${FONT};font-size:13px;line-height:18px;mso-line-height-rule:exactly;color:#c8e2e8;padding-top:4px;">Senior Loan Officer, Saxton Mortgage</td></tr>
      </table>
    </td>
  </tr>
  <tr><td style="background-color:#274654;font-size:0;line-height:0;height:3px;">&nbsp;</td></tr>

  <tr>
    <td class="pad" style="padding:36px 40px 8px 40px;font-family:${FONT};">
      <div class="h1" style="font-size:28px;line-height:34px;mso-line-height-rule:exactly;font-weight:700;letter-spacing:-0.02em;color:#223d55;">The real FHA payment number, no hidden fees</div>
    </td>
  </tr>

  <tr>
    <td class="pad" style="padding:20px 40px 0 40px;font-family:${FONT};font-size:16px;line-height:26px;mso-line-height-rule:exactly;color:#6b7280;">
      Hi ${firstName},
    </td>
  </tr>
  <tr>
    <td class="pad" style="padding:16px 40px 0 40px;font-family:${FONT};font-size:16px;line-height:26px;mso-line-height-rule:exactly;color:#6b7280;">
      Attached is the FHA Affordability Calculator: plug in your own numbers to see the real payment, mortgage insurance included, not just the number most calculators show you.
    </td>
  </tr>
  <tr>
    <td class="pad" style="padding:16px 40px 0 40px;font-family:${FONT};font-size:16px;line-height:26px;mso-line-height-rule:exactly;color:#6b7280;">
      If you want to walk through your actual numbers, credit range, and what down payment assistance you may qualify for, feel free to book a free 15-minute call.
    </td>
  </tr>

  <tr>
    <td class="pad" align="left" style="padding:28px 40px 0 40px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td bgcolor="#219ebc" style="border-radius:8px;">
            <a href="https://calendly.com/realdarrentsai/15min" style="display:block;padding:14px 30px;font-family:${FONT};font-size:15px;line-height:20px;mso-line-height-rule:exactly;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">Book a free 15-minute call</a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
  <tr>
    <td class="pad" style="padding:12px 40px 0 40px;font-family:${FONT};font-size:13px;line-height:20px;mso-line-height-rule:exactly;color:#6b7280;">
      Or use this link: calendly.com/realdarrentsai/15min
    </td>
  </tr>

  <tr>
    <td class="pad" style="padding:28px 40px 36px 40px;font-family:${FONT};font-size:16px;line-height:26px;mso-line-height-rule:exactly;color:#6b7280;">
      Darren Tsai<br>
      <span style="color:#6b7280;">Senior Loan Officer &middot; Saxton Mortgage</span><br>
      <span style="color:#6b7280;">714-887-5432 &middot; <a href="mailto:darren@realdarrentsai.com" style="color:#517686;text-decoration:none;">darren@realdarrentsai.com</a></span>
    </td>
  </tr>

  <tr><td style="border-top:1px solid #e6ebf0;font-size:0;line-height:0;">&nbsp;</td></tr>
  <tr>
    <td class="pad" style="padding:24px 40px 30px 40px;font-family:${FONT};">
      <div style="font-size:11px;line-height:18px;mso-line-height-rule:exactly;color:#6b7280;">This tool is provided for general educational and informational purposes only and does not constitute a loan offer, pre-qualification, pre-approval, or commitment to lend. Rates, terms, MIP, and payment figures are estimates based on general market data and hypothetical assumptions; actual rates, terms, and eligibility are determined by underwriting and may vary based on credit profile, property type, loan amount, and other factors. Darren Tsai, DRE #02103705 | NMLS #2438102 | Saxton Mortgage, NMLS #1717191. Equal Housing Opportunity.</div>
      <div style="font-size:11px;line-height:18px;mso-line-height-rule:exactly;color:#6b7280;padding-top:12px;">Sent because you requested the calculator at realdarrentsai.com &middot; <a href="mailto:darren@realdarrentsai.com?subject=Unsubscribe" style="color:#517686;text-decoration:underline;">Unsubscribe</a></div>
    </td>
  </tr>

</table>
</td></tr>
</table>
</body></html>`;
}

async function getXlsxBytes() {
  if (!xlsxBytes) {
    const res = await fetch(XLSX_URL);
    if (!res.ok) throw new Error(`xlsx fetch failed: ${res.status}`);
    xlsxBytes = await res.arrayBuffer();
  }
  return xlsxBytes;
}

export default async (req: Request, context: Context) => {
  if (req.method !== "POST") return jsonResponse(405, { error: "POST only" });

  const apiKey = req.headers.get("x-api-key");
  if (!apiKey || apiKey !== Netlify.env.get("FHA_GUIDE_API_KEY")) {
    return jsonResponse(401, { error: "unauthorized" });
  }

  const resendKey = Netlify.env.get("RESEND_API_KEY");
  if (!resendKey) return jsonResponse(500, { error: "RESEND_API_KEY not configured" });

  let lead: Record<string, string>;
  try {
    lead = await req.json();
  } catch {
    return jsonResponse(400, { error: "invalid json body" });
  }

  if (!lead.email) return jsonResponse(400, { error: "email required" });

  try {
    const bytes = await getXlsxBytes();
    const base64 = Buffer.from(bytes).toString("base64");

    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: FROM,
        to: [lead.email],
        subject: "The real FHA payment number (no hidden fees)",
        html: buildEmailHtml(lead),
        attachments: [
          { filename: "fha-affordability-calculator.xlsx", content: base64 },
        ],
      }),
    });

    if (!emailRes.ok) {
      const detail = await emailRes.text();
      console.error("resend send failed", emailRes.status, detail);
      return jsonResponse(502, { error: "email send failed" });
    }

    return jsonResponse(200, { success: true });
  } catch (err) {
    console.error("send-fha-guide error", err);
    return jsonResponse(500, { error: String(err) });
  }
};

export const config: Config = {
  path: "/api/send-fha-guide",
};
