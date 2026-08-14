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

import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import type { Config, Context } from "@netlify/functions";

const TEMPLATE_URL = "https://realdarrentsai.com/magnets/dscr-rate-cashflow-guide.pdf";
const FONT_URLS = {
  regular: "https://realdarrentsai.com/fonts/Outfit-Regular.ttf",
  semiBold: "https://realdarrentsai.com/fonts/Outfit-SemiBold.ttf",
  bold: "https://realdarrentsai.com/fonts/Outfit-Bold.ttf",
};
const FROM = "Darren Tsai <darren@realdarrentsai.com>";

// Cover page geometry — MUST mirror the COVER_* constants in
// scripts/build_dscr_pdf.py's draw_cover() exactly (same formulas, same
// PAGE_W/PAGE_H). That static template draws the frame + "—" placeholders
// for the 6 lead-specific spots; this function masks each one (fill matching
// its background — teal header, white body, or the light scenario box) and
// redraws the real value in the same font/position. Letter page, origin
// bottom-left, 72pt/inch.
const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 40;
const HEADER_H = 172;
const PREPARED_Y = PAGE_H - 113;
const DIVIDER_Y = PAGE_H - HEADER_H;
const GREETING_Y = DIVIDER_Y - 40;
const INTRO_Y2 = GREETING_Y - 26 - 20;
const BOX_TOP = INTRO_Y2 - 24;
const BOX_LABEL_Y = BOX_TOP - 28;
const ROW_H = 28;
const ROW_Y = [0, 1, 2, 3].map((i) => BOX_LABEL_Y - 24 - i * ROW_H);
const BOX_BOTTOM = ROW_Y[3] - 14;
const VALUE_RIGHT_X = PAGE_W - MARGIN - 20;
const VALUE_LEFT_X = 350; // mask-rect left edge for the value column

const TEAL = rgb(0x51 / 255, 0x76 / 255, 0x86 / 255);
const HEADER_TEXT = rgb(0xc8 / 255, 0xe2 / 255, 0xe8 / 255);
const LIGHT_BG = rgb(0xf5 / 255, 0xf7 / 255, 0xf9 / 255);
const WHITE = rgb(1, 1, 1);

// Cache bytes across warm invocations.
let templateBytes: ArrayBuffer | null = null;
let fontCache: { regular: ArrayBuffer; semiBold: ArrayBuffer; bold: ArrayBuffer } | null = null;

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

// The email itself is a short, plain message — the branded "Your Scenario"
// card lives on the PDF's cover page now (see draw_cover() in
// scripts/build_dscr_pdf.py), not here. Only the signature block carries
// any styling. Table-based layout, inline styles only: standard practice
// for email client compatibility (no external stylesheets).
function buildEmailHtml(lead: { firstName?: string }) {
  const firstName = escapeHtml(lead.firstName || "there");
  const FONT = "Arial,Helvetica,sans-serif";

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>Your DSCR Rate Snapshot and Guide</title>
<!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
<style>@media only screen and (max-width:620px){.wrap{width:100% !important;}.pad{padding-left:24px !important;padding-right:24px !important;}.h1{font-size:24px !important;line-height:30px !important;}}</style>
</head>
<body style="margin:0;padding:0;background-color:#f5f7f9;">
<span style="display:none;font-size:1px;color:#f5f7f9;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">Your DSCR Rate &amp; Cash Flow Guide is attached, personalized to the numbers you just ran.</span>

<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#f5f7f9;">
<tr><td align="center" style="padding:32px 12px;">
<table role="presentation" class="wrap" cellpadding="0" cellspacing="0" border="0" width="600" style="width:600px;max-width:600px;background-color:#ffffff;border:1px solid #e6ebf0;border-radius:12px;">

  <tr>
    <td style="background-color:#517686;padding:26px 40px 22px 40px;border-radius:12px 12px 0 0;" class="pad">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
        <tr><td style="font-family:${FONT};font-size:10px;line-height:14px;mso-line-height-rule:exactly;font-weight:600;letter-spacing:1.4px;text-transform:uppercase;color:#c8e2e8;padding-bottom:8px;">DSCR Investor Financing</td></tr>
        <tr><td style="font-family:${FONT};font-size:21px;line-height:27px;mso-line-height-rule:exactly;font-weight:700;letter-spacing:-0.01em;color:#ffffff;">Darren Tsai</td></tr>
        <tr><td style="font-family:${FONT};font-size:13px;line-height:18px;mso-line-height-rule:exactly;color:#c8e2e8;padding-top:4px;">Mortgage &amp; Real Estate Broker, Saxton Mortgage</td></tr>
      </table>
    </td>
  </tr>
  <tr><td style="background-color:#274654;font-size:0;line-height:0;height:3px;">&nbsp;</td></tr>

  <tr>
    <td class="pad" style="padding:36px 40px 8px 40px;font-family:${FONT};">
      <div class="h1" style="font-size:28px;line-height:34px;mso-line-height-rule:exactly;font-weight:700;letter-spacing:-0.02em;color:#223d55;">Your DSCR rate snapshot and guide</div>
    </td>
  </tr>

  <tr>
    <td class="pad" style="padding:20px 40px 0 40px;font-family:${FONT};font-size:16px;line-height:26px;mso-line-height-rule:exactly;color:#6b7280;">
      Hi ${firstName},
    </td>
  </tr>
  <tr>
    <td class="pad" style="padding:16px 40px 0 40px;font-family:${FONT};font-size:16px;line-height:26px;mso-line-height-rule:exactly;color:#6b7280;">
      Attached is your DSCR Rate &amp; Cash Flow Guide, personalized to the numbers you just ran: the 6 levers that move your rate, 5 ways to raise cash flow on the same property, and where your down-payment bracket comes from.
    </td>
  </tr>
  <tr>
    <td class="pad" style="padding:16px 40px 0 40px;font-family:${FONT};font-size:16px;line-height:26px;mso-line-height-rule:exactly;color:#6b7280;">
      A loan officer will also reach out shortly to walk through your actual rate and terms. In the meantime, feel free to book a free 15-minute strategy call.
    </td>
  </tr>

  <tr>
    <td class="pad" align="left" style="padding:28px 40px 0 40px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td bgcolor="#219ebc" style="border-radius:8px;">
            <a href="https://calendly.com/realdarrentsai/15min" style="display:block;padding:14px 30px;font-family:${FONT};font-size:15px;line-height:20px;mso-line-height-rule:exactly;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">Book a free 15-minute strategy call</a>
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
      <span style="color:#6b7280;">Mortgage &amp; Real Estate Broker &middot; Saxton Mortgage</span><br>
      <span style="color:#6b7280;">714-887-5432 &middot; <a href="mailto:darren@realdarrentsai.com" style="color:#517686;text-decoration:none;">darren@realdarrentsai.com</a></span>
    </td>
  </tr>

  <tr><td style="border-top:1px solid #e6ebf0;font-size:0;line-height:0;">&nbsp;</td></tr>
  <tr>
    <td class="pad" style="padding:24px 40px 30px 40px;font-family:${FONT};background-color:#ffffff;border-radius:0 0 12px 12px;">
      <div style="font-size:11px;line-height:18px;mso-line-height-rule:exactly;color:#6b7280;">This guide is provided for general educational and informational purposes only and does not constitute a loan offer, pre-qualification, pre-approval, or commitment to lend. Rates, terms, and figures shown are estimates; actual eligibility and pricing are determined by underwriting. Darren Tsai, DRE #02103705 | NMLS #2438102 | Saxton Mortgage, NMLS #2525913. Equal Housing Opportunity.</div>
      <div style="font-size:11px;line-height:18px;mso-line-height-rule:exactly;color:#6b7280;padding-top:12px;">Sent because you requested the DSCR guide at realdarrentsai.com &middot; <a href="mailto:darren@realdarrentsai.com?subject=Unsubscribe" style="color:#517686;text-decoration:underline;">Unsubscribe</a><br>1 City Blvd W, Orange, CA 92868</div>
    </td>
  </tr>

</table>
</td></tr>
</table>
</body></html>`;
}

// Redraws `text` at (x, y) after masking a same-background rect behind it —
// the static template leaves each of these 6 spots either blank or holding
// an em-dash placeholder, so this both erases the placeholder and paints the
// real value in one call.
function maskAndDraw(
  page: import("pdf-lib").PDFPage,
  text: string,
  opts: { x: number; y: number; size: number; font: import("pdf-lib").PDFFont; color: ReturnType<typeof rgb>; bg: ReturnType<typeof rgb>; maskX: number; maskW: number; align?: "left" | "right" }
) {
  page.drawRectangle({ x: opts.maskX, y: opts.y - 6, width: opts.maskW, height: opts.size + 8, color: opts.bg });
  const x = opts.align === "right" ? opts.x - opts.font.widthOfTextAtSize(text, opts.size) : opts.x;
  page.drawText(text, { x, y: opts.y, size: opts.size, font: opts.font, color: opts.color });
}

function truncateToWidth(font: import("pdf-lib").PDFFont, text: string, size: number, maxWidth: number) {
  let out = text;
  while (font.widthOfTextAtSize(out, size) > maxWidth && out.length > 10) {
    out = out.slice(0, -4) + "...";
  }
  return out;
}

async function buildPersonalizedPdf(lead: {
  firstName?: string;
  lastName?: string;
  dscr?: string;
  downPayment?: string;
  rate?: string;
  loanAmount?: string;
}) {
  if (!templateBytes) {
    const res = await fetch(TEMPLATE_URL);
    if (!res.ok) throw new Error(`template fetch failed: ${res.status}`);
    templateBytes = await res.arrayBuffer();
  }
  if (!fontCache) {
    const [regular, semiBold, bold] = await Promise.all([
      fetch(FONT_URLS.regular).then((r) => {
        if (!r.ok) throw new Error(`font fetch failed: ${r.status}`);
        return r.arrayBuffer();
      }),
      fetch(FONT_URLS.semiBold).then((r) => {
        if (!r.ok) throw new Error(`font fetch failed: ${r.status}`);
        return r.arrayBuffer();
      }),
      fetch(FONT_URLS.bold).then((r) => {
        if (!r.ok) throw new Error(`font fetch failed: ${r.status}`);
        return r.arrayBuffer();
      }),
    ]);
    fontCache = { regular, semiBold, bold };
  }

  const pdfDoc = await PDFDocument.load(templateBytes);
  pdfDoc.registerFontkit(fontkit);
  const cover = pdfDoc.getPage(0);
  const [regular, semiBold, bold] = await Promise.all([
    pdfDoc.embedFont(fontCache.regular, { subset: true }),
    pdfDoc.embedFont(fontCache.semiBold, { subset: true }),
    pdfDoc.embedFont(fontCache.bold, { subset: true }),
  ]);

  const firstName = lead.firstName?.trim() || "there";
  const fullName = `${lead.firstName || ""} ${lead.lastName || ""}`.trim() || "an investor who already ran the numbers";
  const CONTENT_W = PAGE_W - 2 * MARGIN;

  // 1. Header: "Prepared for {fullName}" (teal background)
  maskAndDraw(cover, truncateToWidth(regular, `Prepared for ${fullName}`, 14, CONTENT_W), {
    x: MARGIN, y: PREPARED_Y, size: 14, font: regular, color: HEADER_TEXT,
    bg: TEAL, maskX: 0, maskW: PAGE_W,
  });

  // 2. Greeting: "Hi {firstName}," (white background)
  maskAndDraw(cover, `Hi ${firstName},`, {
    x: MARGIN, y: GREETING_Y, size: 16, font: semiBold, color: TEAL,
    bg: WHITE, maskX: 0, maskW: PAGE_W,
  });

  // 3. Your Scenario — 4 right-aligned values (light scenario-box background)
  const values: Array<[string | undefined, number]> = [
    [lead.dscr, ROW_Y[0]],
    [lead.downPayment, ROW_Y[1]],
    [lead.rate, ROW_Y[2]],
    [lead.loanAmount, ROW_Y[3]],
  ];
  for (const [value, y] of values) {
    maskAndDraw(cover, value || "—", {
      x: VALUE_RIGHT_X, y, size: 15, font: bold, color: TEAL, align: "right",
      bg: LIGHT_BG, maskX: VALUE_LEFT_X, maskW: VALUE_RIGHT_X - VALUE_LEFT_X + 10,
    });
  }

  // Split into two separate PDFs: page 0 (the personalized "Your Scenario"
  // cover) is the standalone "Rate" attachment; pages 1-5 (hero + 6 levers +
  // cash flow + CTA) are the "Guide" attachment.
  const rateDoc = await PDFDocument.create();
  const [ratePage] = await rateDoc.copyPages(pdfDoc, [0]);
  rateDoc.addPage(ratePage);

  const guideDoc = await PDFDocument.create();
  const guidePages = await guideDoc.copyPages(pdfDoc, [1, 2, 3, 4, 5]);
  guidePages.forEach((p) => guideDoc.addPage(p));

  return {
    rateBytes: await rateDoc.save(),
    guideBytes: await guideDoc.save(),
  };
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
    const { rateBytes, guideBytes } = await buildPersonalizedPdf(lead);
    const rateBase64 = Buffer.from(rateBytes).toString("base64");
    const guideBase64 = Buffer.from(guideBytes).toString("base64");

    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: FROM,
        to: [lead.email],
        subject: "[PDF] Your DSCR Rate Snapshot and Guide",
        html: buildEmailHtml(lead),
        attachments: [
          { filename: "your-dscr-rate.pdf", content: rateBase64 },
          { filename: "dscr-cashflow-guide.pdf", content: guideBase64 },
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
