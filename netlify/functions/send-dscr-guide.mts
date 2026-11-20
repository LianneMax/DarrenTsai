// Netlify Function: send-dscr-guide
//
// Called server-side by the Apps Script webhook (google-apps-script.js) right
// after a DSCR lead is logged to Sheets. Takes that lead's
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
import type { Config } from "@netlify/functions";
import { guideSender, toBase64 } from "../lib/guide-shared.mts";
import { renderEmail, para, files, button, contactLine, COMPLIANCE } from "../lib/email-layout.mts";

const TEMPLATE_URL = "https://realdarrentsai.com/magnets/dscr-rate-cashflow-guide.pdf";
const FONT_URLS = {
  regular: "https://realdarrentsai.com/fonts/Outfit-Regular.ttf",
  semiBold: "https://realdarrentsai.com/fonts/Outfit-SemiBold.ttf",
  bold: "https://realdarrentsai.com/fonts/Outfit-Bold.ttf",
};

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
// The chain continues in draw_cover() with BOX_BOTTOM = ROW_Y[3] - 14, which
// nothing here needs: this function masks individual rows, never below the last
// one. Left written down rather than bound, so the next constant derived from it
// has its formula to hand and the two files stay mirrorable line for line.
const VALUE_RIGHT_X = PAGE_W - MARGIN - 20;
const VALUE_LEFT_X = 350; // mask-rect left edge for the value column

const TEAL = rgb(0x51 / 255, 0x76 / 255, 0x86 / 255);
const HEADER_TEXT = rgb(0xc8 / 255, 0xe2 / 255, 0xe8 / 255);
const LIGHT_BG = rgb(0xf5 / 255, 0xf7 / 255, 0xf9 / 255);
const WHITE = rgb(1, 1, 1);

// Cache bytes across warm invocations.
let templateBytes: ArrayBuffer | null = null;
let fontCache: { regular: ArrayBuffer; semiBold: ArrayBuffer; bold: ArrayBuffer } | null = null;

// The email itself is a short, plain message — the branded "Your Scenario"
// card lives on the PDF's cover page now (see draw_cover() in
// scripts/build_dscr_pdf.py), not here. Only the signature block carries
// any styling. Table-based layout, inline styles only: standard practice
// for email client compatibility (no external stylesheets).
/**
 * Did this lead actually run the calculator?
 *
 * The opt-in form sits below the calculator and can be submitted without it.
 * It used to send the outputs anyway, so a lead who typed nothing got an email
 * saying "here are the exact numbers you just ran" with a snapshot PDF reading
 * DSCR 0.00 on a $0 loan at 7.63%. The page sends blanks now; this is the
 * server side of the same decision, and it also covers any older payload still
 * sitting in the follow-up queue.
 */
export function hasSnapshot(lead: { dscr?: string }) {
  return (parseFloat(String(lead.dscr || "").replace(/[^0-9.]/g, "")) || 0) > 0;
}

function buildEmailHtml(lead: { firstName?: string; dscr?: string }) {
  const snapshot = hasSnapshot(lead);
  // Darren's voice and the shared layout, 21 Nov 2026.
  return renderEmail({
    title: snapshot ? "Your DSCR Rate Snapshot and Guide" : "Your DSCR Rate &amp; Cash Flow Guide",
    preheader: snapshot
      ? "The numbers you just ran, plus my DSCR Rate and Cash Flow Guide. Start on page 3."
      : "My DSCR Rate and Cash Flow Guide. Start on page 3.",
    firstName: lead.firstName,
    headline: "Your DSCR guide is here",
    blocks: [
      para(snapshot
        ? "Here are the exact numbers you just ran, plus my DSCR Rate &amp; Cash Flow Guide. Both are attached."
        : "Here's my DSCR Rate &amp; Cash Flow Guide, attached. If you run the calculator on the page and send the form again, I'll include a rate snapshot for your property. Or just reply with the rent and the price and we'll work it out together."),
      files(snapshot ? ["your-dscr-rate.pdf", "dscr-cashflow-guide.pdf"] : ["dscr-cashflow-guide.pdf"]),
      para("Start on page 3. It covers the 6 things lenders use to price your rate, and 5 ways to improve cash flow on the same property.", 20),
      para("Quick question: are you looking at a specific rental right now, or running numbers for later? Reply with the address or zip code and I'll send over live DSCR pricing for your scenario."),
      button("Book a 15-minute call", "https://realdarrentsai.com/book/?utm_source=email&amp;utm_medium=guide&amp;utm_campaign=dscr-guide"),
      contactLine(),
    ],
    compliance: COMPLIANCE.estimates,
  });
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

export default guideSender({
  name: "send-dscr-guide",
  apiKeyEnv: "DSCR_GUIDE_API_KEY",
  subject: (lead) =>
    hasSnapshot(lead)
      ? "[PDF] Your DSCR Rate Snapshot and Guide"
      : "[PDF] Your DSCR Rate & Cash Flow Guide",
  buildEmailHtml,
  // The only sender that builds its attachments per lead rather than serving a
  // published file: the cover page is redrawn with this lead's numbers.
  //
  // Unless there are no numbers. A lead who submitted without touching the
  // calculator gets the guide alone: a cover page reading DSCR 0.00 on a $0
  // loan is worse than no cover page, because it looks like a quote.
  buildAttachments: async (lead) => {
    const { rateBytes, guideBytes } = await buildPersonalizedPdf(lead);
    const guide = { filename: "dscr-cashflow-guide.pdf", content: toBase64(guideBytes) };
    if (!hasSnapshot(lead)) return [guide];
    return [
      { filename: "your-dscr-rate.pdf", content: toBase64(rateBytes) },
      guide,
    ];
  },
});

export const config: Config = {
  path: "/api/send-dscr-guide",
};
