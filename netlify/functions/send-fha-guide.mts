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
  const FONT = "'Outfit',Helvetica,Arial,sans-serif";

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>Your FHA Affordability Calculator</title>
<style>@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700&display=swap');</style>
</head>
<body style="margin:0;padding:0;background:#ffffff;">
<span style="display:none;font-size:1px;color:#ffffff;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">Your FHA Affordability Calculator is attached.</span>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:560px;max-width:560px;font-family:${FONT};">

  <tr><td style="padding-bottom:20px;">
    <p style="margin:0;font-size:15px;line-height:1.6;color:#1a1a2e;">Hi ${firstName},</p>
  </td></tr>

  <tr><td style="padding-bottom:16px;">
    <p style="margin:0;font-size:15px;line-height:1.6;color:#1a1a2e;">Attached is the FHA Affordability Calculator: plug in your own numbers to see the real payment, mortgage insurance included, not just the number most calculators show you.</p>
  </td></tr>

  <tr><td style="padding-bottom:24px;">
    <p style="margin:0;font-size:15px;line-height:1.6;color:#1a1a2e;">If you want to walk through your actual numbers, credit range, and what down payment assistance you may qualify for, feel free to <a href="https://calendly.com/realdarrentsai/15min" style="color:#517686;font-weight:600;">book a free 15-minute call</a>.</p>
  </td></tr>

  <tr><td style="padding-top:8px;border-top:1px solid #eef1f4;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:16px;">
      <tr><td style="font-size:14px;font-weight:700;color:#517686;font-family:${FONT};">Darren Tsai</td></tr>
      <tr><td style="font-size:13px;color:#6b7280;font-family:${FONT};padding-top:2px;">Senior Loan Officer &middot; Saxton Mortgage</td></tr>
      <tr><td style="font-size:13px;color:#6b7280;font-family:${FONT};padding-top:2px;">714-887-5432 &middot; <a href="mailto:darren@realdarrentsai.com" style="color:#517686;text-decoration:none;">darren@realdarrentsai.com</a></td></tr>
    </table>
  </td></tr>

  <tr><td style="padding-top:28px;">
    <p style="margin:0;font-size:11px;line-height:1.6;color:#6b7280;">This tool is provided for general educational and informational purposes only and does not constitute a loan offer, pre-qualification, pre-approval, or commitment to lend. Rates, terms, MIP, and payment figures are estimates based on general market data and hypothetical assumptions; actual rates, terms, and eligibility are determined by underwriting and may vary based on credit profile, property type, loan amount, and other factors. Darren Tsai, DRE #02103705 | NMLS #2438102 | Saxton Mortgage, NMLS #1717191. Equal Housing Opportunity.</p>
    <p style="margin:10px 0 0;font-size:11px;line-height:1.6;color:#6b7280;">Sent because you requested the calculator at realdarrentsai.com &middot; <a href="mailto:darren@realdarrentsai.com?subject=Unsubscribe" style="color:#6b7280;text-decoration:underline;">Unsubscribe</a></p>
  </td></tr>

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
        subject: `${lead.firstName ? lead.firstName + ", your" : "Your"} FHA Affordability Calculator`,
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
