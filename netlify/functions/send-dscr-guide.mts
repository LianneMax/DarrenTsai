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
  const FONT = "'Outfit',Helvetica,Arial,sans-serif";

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>Your DSCR Rate &amp; Cash Flow Guide</title>
<style>@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700&display=swap');</style>
</head>
<body style="margin:0;padding:0;background:#ffffff;">
<span style="display:none;font-size:1px;color:#ffffff;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">Your personalized DSCR guide is attached.</span>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:560px;max-width:560px;font-family:${FONT};">

  <tr><td style="padding-bottom:20px;">
    <p style="margin:0;font-size:15px;line-height:1.6;color:#1a1a2e;">Hi ${firstName},</p>
  </td></tr>

  <tr><td style="padding-bottom:16px;">
    <p style="margin:0;font-size:15px;line-height:1.6;color:#1a1a2e;">Attached is your DSCR Rate &amp; Cash Flow Guide, personalized to the numbers you just ran &mdash; the 6 levers that move your rate, 5 ways to raise cash flow on the same property, and where your down-payment bracket comes from.</p>
  </td></tr>

  <tr><td style="padding-bottom:24px;">
    <p style="margin:0;font-size:15px;line-height:1.6;color:#1a1a2e;">A loan officer will also reach out shortly to walk through your actual rate and terms. In the meantime, feel free to <a href="https://calendly.com/realdarrentsai/15min" style="color:#517686;font-weight:600;">book a free 15-minute strategy call</a>.</p>
  </td></tr>

  <tr><td style="padding-top:8px;border-top:1px solid #eef1f4;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:16px;">
      <tr><td style="font-size:14px;font-weight:700;color:#517686;font-family:${FONT};">Darren Tsai</td></tr>
      <tr><td style="font-size:13px;color:#6b7280;font-family:${FONT};padding-top:2px;">Mortgage &amp; Real Estate Broker &middot; Saxton Mortgage</td></tr>
      <tr><td style="font-size:13px;color:#6b7280;font-family:${FONT};padding-top:2px;">714-887-5432 &middot; <a href="mailto:darren@realdarrentsai.com" style="color:#517686;text-decoration:none;">darren@realdarrentsai.com</a></td></tr>
    </table>
  </td></tr>

  <tr><td style="padding-top:28px;">
    <p style="margin:0;font-size:11px;line-height:1.6;color:#6b7280;">This guide is provided for general educational and informational purposes only and does not constitute a loan offer, pre-qualification, pre-approval, or commitment to lend. Rates, terms, and figures shown are estimates; actual eligibility and pricing are determined by underwriting. Darren Tsai, DRE #02103705 | NMLS #2438102 | Saxton Mortgage, NMLS #2525913. Equal Housing Opportunity.</p>
    <p style="margin:10px 0 0;font-size:11px;line-height:1.6;color:#6b7280;">Sent because you requested the DSCR guide at realdarrentsai.com &middot; <a href="mailto:darren@realdarrentsai.com?subject=Unsubscribe" style="color:#6b7280;text-decoration:underline;">Unsubscribe</a><br>1 City Blvd W, Orange, CA 92868</p>
  </td></tr>

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
