// Netlify Function: send-dscr-guide
//
// Called server-side by the Apps Script webhook (google-apps-script.js) right
// after a DSCR lead is logged to Sheets + pushed to Bonzo. Takes that lead's
// data, personalizes the cover page of the static DSCR guide PDF (already
// published at /magnets/dscr-rate-cashflow-guide.pdf), and emails it from
// darren@realdarrentsai.com via Resend.
//
// SETUP:
// 1. Sign up at resend.com, verify realdarrentsai.com (adds SPF/DKIM DNS
//    records — add them wherever the domain's DNS is managed).
// 2. Netlify → Site settings → Environment variables, add:
//      RESEND_API_KEY      = <resend api key>
//      DSCR_GUIDE_API_KEY  = <any long random string you make up>
// 3. In the Apps Script (Script Properties), add:
//      NETLIFY_DSCR_PDF_URL = https://realdarrentsai.com/api/send-dscr-guide
//      NETLIFY_DSCR_PDF_KEY = <same random string as DSCR_GUIDE_API_KEY>
//
// This endpoint requires the x-api-key header to match DSCR_GUIDE_API_KEY —
// it sends a real email on every call, so it isn't left open to the public.

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { Config, Context } from "@netlify/functions";

const TEMPLATE_URL = "https://realdarrentsai.com/magnets/dscr-rate-cashflow-guide.pdf";
const FROM = "Darren Tsai <darren@realdarrentsai.com>";

// Cover page geometry — must mirror scripts/build_dscr_pdf.py's draw_cover().
// Letter page, origin bottom-left, 72pt/inch.
const PAGE_W = 612;
const PAGE_H = 792;
const IN = 72;
const EYEBROW_Y = 1.3 * IN; // baseline of the "PREPARED FOR..." line (measured from page bottom)
const INK = rgb(0x16 / 255, 0x1d / 255, 0x27 / 255);
const MUTED = rgb(0x90 / 255, 0x99 / 255, 0xa6 / 255);

// Cache the template bytes across warm invocations.
let templateBytes: ArrayBuffer | null = null;

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

// Branded HTML email — matches the actual site palette/font (public/dscr/index.html's
// :root vars: navy #223d55, teal #517686, rose #d2566d CTA, Outfit font, light bg),
// not the PDF's separate ink/brass theme. Table-based layout, inline styles only:
// standard practice for email client compatibility (no external stylesheets).
function buildEmailHtml(lead: {
  firstName?: string;
  dscr?: string;
  downPayment?: string;
  rate?: string;
  loanAmount?: string;
}) {
  const firstName = escapeHtml(lead.firstName || "there");
  const FONT = "'Outfit',Helvetica,Arial,sans-serif";
  const stat = (label: string, value?: string) =>
    `<tr><td style="padding:5px 0;color:#517686;font-family:${FONT};font-size:12px;font-weight:600;letter-spacing:.03em;text-transform:uppercase;">${label}</td>` +
    `<td align="right" style="padding:5px 0;font-weight:700;color:#223d55;font-family:${FONT};font-size:14px;">${escapeHtml(value || "—")}</td></tr>`;

  return `<!doctype html>
<html><head><meta charset="utf-8">
<style>@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700;800&display=swap');</style>
</head>
<body style="margin:0;padding:0;background:#f5f7f9;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f7f9;padding:32px 16px;font-family:${FONT};">
<tr><td align="center">
<table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #eef1f4;">
  <tr><td style="padding:32px 32px 24px;border-bottom:1px solid #eef1f4;">
    <div style="font-family:${FONT};font-weight:600;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#517686;margin-bottom:10px;">&#8212;&nbsp; DSCR Qualification Follow-Up</div>
    <div style="font-size:26px;font-weight:700;color:#223d55;letter-spacing:-0.01em;font-family:${FONT};">Your Rate &amp; Cash Flow Guide</div>
  </td></tr>
  <tr><td style="padding:28px 32px;">
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#1a1a2e;">Hi ${firstName},</p>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#6b7280;">Attached is your DSCR Rate &amp; Cash Flow Guide, personalized to the numbers you just ran:</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f7f9;border:1px solid #eef1f4;border-radius:8px;margin-bottom:20px;">
      <tr><td style="padding:16px 20px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          ${stat("DSCR Ratio", lead.dscr)}
          ${stat("Down Payment", lead.downPayment)}
          ${stat("Est. Rate", lead.rate)}
          ${stat("Est. Loan Amount", lead.loanAmount)}
        </table>
      </td></tr>
    </table>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#6b7280;">Inside: the 6 levers that actually move your rate, 5 ways to raise cash flow on the same property, and where your down-payment bracket comes from.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
      <tr><td style="background:#d2566d;border-radius:8px;">
        <a href="https://calendly.com/realdarrentsai/15min" style="display:inline-block;padding:13px 28px;font-size:15px;font-weight:600;font-family:${FONT};color:#ffffff;text-decoration:none;">Book Your Free 15-Min Strategy Call</a>
      </td></tr>
    </table>
    <p style="margin:0;font-size:14px;line-height:1.6;color:#6b7280;">A loan officer will also reach out shortly to walk through your actual rate and terms.</p>
    <p style="margin:20px 0 0;font-size:14px;line-height:1.6;color:#1a1a2e;">&mdash; Darren Tsai<br/>714-887-5432 &middot; darren@realdarrentsai.com</p>
  </td></tr>
  <tr><td style="padding:20px 32px;border-top:1px solid #eef1f4;">
    <p style="margin:0;font-size:11px;line-height:1.6;color:#6b7280;">This guide is provided for general educational and informational purposes only and does not constitute a loan offer, pre-qualification, pre-approval, or commitment to lend. Rates, terms, and figures shown are estimates; actual eligibility and pricing are determined by underwriting. Darren Tsai, DRE #02103705 | NMLS #2438102 | Saxton Mortgage, NMLS #2525913. Equal Housing Opportunity.</p>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

async function buildPersonalizedPdf(lead: {
  firstName?: string;
  lastName?: string;
  dscr?: string;
  downPayment?: string;
  rate?: string;
}) {
  if (!templateBytes) {
    const res = await fetch(TEMPLATE_URL);
    if (!res.ok) throw new Error(`template fetch failed: ${res.status}`);
    templateBytes = await res.arrayBuffer();
  }

  const pdfDoc = await PDFDocument.load(templateBytes);
  const cover = pdfDoc.getPage(0);
  const font = await pdfDoc.embedFont(StandardFonts.CourierBold);

  const name = `${lead.firstName || ""} ${lead.lastName || ""}`.trim() || "Investor";
  const stats = [lead.dscr && `DSCR ${lead.dscr}`, lead.downPayment && `${lead.downPayment} down`, lead.rate && lead.rate]
    .filter(Boolean)
    .join(" · ");
  let line = `PREPARED FOR ${name.toUpperCase()}${stats ? " — " + stats.toUpperCase() : ""}`;
  if (line.length > 92) line = line.slice(0, 89) + "...";

  // Mask the original static line (solid ink background, same color as the
  // cover) then draw the personalized one in its place — same font/position.
  cover.drawRectangle({ x: 0, y: EYEBROW_Y - 5, width: PAGE_W, height: 16, color: INK });
  cover.drawText(line, { x: 0.9 * IN, y: EYEBROW_Y, size: 8.5, font, color: MUTED });

  return pdfDoc.save();
}

export default async (req: Request, context: Context) => {
  if (req.method !== "POST") return jsonResponse(405, { error: "POST only" });

  const apiKey = req.headers.get("x-api-key");
  if (!apiKey || apiKey !== Netlify.env.get("DSCR_GUIDE_API_KEY")) {
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
    const pdfBytes = await buildPersonalizedPdf(lead);
    const pdfBase64 = Buffer.from(pdfBytes).toString("base64");

    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: FROM,
        to: [lead.email],
        subject: `${lead.firstName ? lead.firstName + ", your" : "Your"} DSCR Rate & Cash Flow Guide`,
        html: buildEmailHtml(lead),
        attachments: [
          {
            filename: "dscr-rate-cashflow-guide.pdf",
            content: pdfBase64,
          },
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
    console.error("send-dscr-guide error", err);
    return jsonResponse(500, { error: String(err) });
  }
};

export const config: Config = {
  path: "/api/send-dscr-guide",
};
