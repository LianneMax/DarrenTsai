// One layout for every email the site sends (21 Nov 2026).
//
// WHY THIS EXISTS. The contact confirmation, the three guide emails and the
// call reminder each carried their own copy of the same 130 lines of table
// markup. Max asked for a simpler, HubSpot-style look in Darren's voice
// (mockups approved 21 Nov, "Site Emails Redesign" canvas): headshot and name,
// one headline, a few short paragraphs, one button, a phone line, "All the
// best, Darren", and the licence footer under the card. Writing that once means
// a footer or font fix lands in every email at the same time.
//
// Email rules this follows: tables and inline styles only (Gmail drops <style>
// for some clients and all of <head> when forwarding), a bulletproof button,
// and an image with width/height set so Outlook does not blow it up.
//
// The unsubscribe link is written as the mailto placeholder that guideSender
// swaps for the signed /unsubscribe link. Keep the exact string.

import { EMAIL_FONT, EMAIL_FONT_HEAD, escapeHtml } from "./guide-shared.mts";

export const PHONE_DISPLAY = "(714) 887-5432";
export const PHONE_HREF = "tel:+17148875432";
export const UNSUBSCRIBE_PLACEHOLDER = "mailto:darren@realdarrentsai.com?subject=Unsubscribe";
/** The 320px headshot the site already serves, shown at 44px. */
export const HEADSHOT_URL = "https://realdarrentsai.com/darren.jpg";

const NAVY = "#223d55";
const TEAL = "#517686";
const BUTTON = "#177f94";
const BODY = "#4b5563";
const MUTED = "#6b7280";
const LINE = "#e6ebf0";
const PAGE = "#f4f2ee";
const TINT = "#f5f8f9";
const FONT = EMAIL_FONT;

const LICENCE =
  'Darren Tsai, DRE #02103705 | NMLS #2438102. Saxton Mortgage, LLC | NMLS #1717191 (<a href="https://www.nmlsconsumeraccess.org/" style="color:' +
  TEAL + ';text-decoration:underline;">NMLS Consumer Access</a>). Equal Housing Opportunity.';

/** The closing disclosure each sender already used, unchanged. */
export const COMPLIANCE = {
  standard: `${LICENCE} Not a commitment to lend. Final terms are determined by underwriting.`,
  estimates: `${LICENCE} Estimates only, not a commitment to lend. Individual results will vary and final terms are determined by underwriting.`,
  caseStudy: `${LICENCE} Past results are one investor's experience. Individual results will vary and final terms are determined by underwriting. Not a commitment to lend.`,
};

const row = (inner: string, top = 16) =>
  `
  <tr>
    <td class="pad" style="padding:${top}px 40px 0 40px;font-family:${FONT};font-size:16px;line-height:26px;mso-line-height-rule:exactly;color:${BODY};">
      ${inner}
    </td>
  </tr>`;

/** A paragraph. The text must already be safe HTML. */
export const para = (html: string, top = 16) => row(html, top);

/** A short bullet list. Items must already be safe HTML. */
export const bullets = (items: string[], top = 10) =>
  row(
    `<ul style="margin:0;padding:0 0 0 22px;">${items
      .map((i) => `<li style="margin:0 0 6px 0;padding:0;">${i}</li>`)
      .join("")}</ul>`,
    top,
  );

/** A bold lead-in for a bullet, in the headline colour. */
export const strong = (text: string) => `<span style="font-weight:600;color:${NAVY};">${text}</span>`;

/** The light box used for "What you told me". `html` must already be escaped. */
export const box = (label: string, html: string, top = 20) => `
  <tr>
    <td class="pad" style="padding:${top}px 40px 0 40px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:${TINT};border:1px solid ${LINE};border-radius:12px;">
        <tr>
          <td style="padding:14px 18px;font-family:${FONT};">
            <div style="font-size:11px;line-height:14px;mso-line-height-rule:exactly;font-weight:600;letter-spacing:1.2px;text-transform:uppercase;color:${TEAL};padding-bottom:6px;">${label}</div>
            <div style="font-size:15px;line-height:23px;mso-line-height-rule:exactly;color:${BODY};">${html}</div>
          </td>
        </tr>
      </table>
    </td>
  </tr>`;

/** The attached files, as small outlined chips. Names are fixed strings. */
export const files = (names: string[], top = 20) => `
  <tr>
    <td class="pad" style="padding:${top}px 40px 0 40px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0">${names
        .map(
          (n, i) =>
            `${i ? '<tr><td style="height:8px;font-size:0;line-height:0;">&nbsp;</td></tr>' : ""}<tr><td style="border:1px solid ${LINE};border-radius:8px;padding:8px 12px;font-family:${FONT};font-size:14px;line-height:18px;mso-line-height-rule:exactly;font-weight:600;color:${NAVY};">Attached: ${n}</td></tr>`,
        )
        .join("")}
      </table>
    </td>
  </tr>`;

/** The one button. */
export const button = (label: string, href: string, top = 24) => `
  <tr>
    <td class="pad" align="left" style="padding:${top}px 40px 0 40px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td bgcolor="${BUTTON}" style="border-radius:10px;">
            <a href="${href}" style="display:block;padding:14px 28px;font-family:${FONT};font-size:16px;line-height:20px;mso-line-height-rule:exactly;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;">${label}</a>
          </td>
        </tr>
      </table>
    </td>
  </tr>`;

/** The line under the button: reply, or call Darren. */
export const contactLine = (top = 14) => `
  <tr>
    <td class="pad" style="padding:${top}px 40px 0 40px;font-family:${FONT};font-size:14px;line-height:21px;mso-line-height-rule:exactly;color:${MUTED};">
      Or reply to this email, or call me at <a href="${PHONE_HREF}" style="color:${TEAL};text-decoration:none;font-weight:600;">${PHONE_DISPLAY}</a>.
    </td>
  </tr>`;

export type EmailParts = {
  /** The <title>, normally the subject. */
  title: string;
  /** The hidden line an inbox shows beside the subject. */
  preheader: string;
  /** Raw first name from the lead; escaped here. */
  firstName?: string;
  headline: string;
  /** Rows built with para / bullets / box / files / button / contactLine. */
  blocks: string[];
  /** One of COMPLIANCE. */
  compliance: string;
};

export function renderEmail(parts: EmailParts) {
  const firstName = escapeHtml((parts.firstName || "").trim() || "there");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
${EMAIL_FONT_HEAD}
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${parts.title}</title>
<!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
<style>
  @media only screen and (max-width:620px){
    .wrap{width:100% !important;}
    .pad{padding-left:24px !important;padding-right:24px !important;}
    .h1{font-size:26px !important;line-height:32px !important;}
  }
</style>
</head>
<body style="margin:0;padding:0;background-color:${PAGE};">
<span style="display:none;font-size:1px;color:${PAGE};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${parts.preheader}</span>

<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:${PAGE};">
<tr><td align="center" style="padding:32px 12px;">

<table role="presentation" class="wrap" cellpadding="0" cellspacing="0" border="0" width="600" style="width:600px;max-width:600px;background-color:#ffffff;border:1px solid ${LINE};border-radius:20px;">

  <tr>
    <td class="pad" style="padding:28px 40px 0 40px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="width:44px;vertical-align:middle;"><img src="${HEADSHOT_URL}" width="44" height="44" alt="Darren Tsai" style="display:block;width:44px;height:44px;border-radius:22px;border:0;"></td>
          <td style="padding-left:12px;vertical-align:middle;font-family:${FONT};">
            <div style="font-size:16px;line-height:21px;mso-line-height-rule:exactly;font-weight:600;color:${NAVY};">Darren Tsai</div>
            <div style="font-size:13px;line-height:18px;mso-line-height-rule:exactly;color:${MUTED};">Senior Loan Officer, Saxton Mortgage</div>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <tr>
    <td class="pad" style="padding:28px 40px 0 40px;font-family:${FONT};">
      <div class="h1" style="font-size:32px;line-height:38px;mso-line-height-rule:exactly;font-weight:700;letter-spacing:-0.02em;color:${NAVY};">${parts.headline}</div>
    </td>
  </tr>
${row(`Hi ${firstName},`, 18)}${parts.blocks.join("")}

  <tr>
    <td class="pad" style="padding:28px 40px 36px 40px;font-family:${FONT};font-size:16px;line-height:26px;mso-line-height-rule:exactly;color:${BODY};">
      All the best,<br>
      <span style="font-weight:600;color:${NAVY};">Darren</span>
    </td>
  </tr>

</table>

<!-- footer -->
<table role="presentation" class="wrap" cellpadding="0" cellspacing="0" border="0" width="600" style="width:600px;max-width:600px;">
  <tr>
    <td class="pad" align="center" style="padding:20px 40px 0 40px;font-family:${FONT};font-size:12px;line-height:18px;mso-line-height-rule:exactly;color:${MUTED};text-align:center;">
      Darren Tsai &middot; Senior Loan Officer, Saxton Mortgage &middot; Licensed in AZ, CA, FL, HI, OR, PA, TN, TX
    </td>
  </tr>
  <tr>
    <td class="pad" align="center" style="padding:8px 40px 0 40px;font-family:${FONT};font-size:11px;line-height:17px;mso-line-height-rule:exactly;color:${MUTED};text-align:center;">
      ${parts.compliance}
    </td>
  </tr>
  <tr>
    <td class="pad" align="center" style="padding:8px 40px 0 40px;font-family:${FONT};font-size:11px;line-height:17px;mso-line-height-rule:exactly;color:${MUTED};text-align:center;">
      Saxton Mortgage, LLC, 9191 Towne Centre Drive, Suite 400, San Diego, CA 92122 &middot; <a href="tel:+18589252102" style="color:${TEAL};text-decoration:none;">(858) 925-2102</a> &middot; <a href="${UNSUBSCRIBE_PLACEHOLDER}" style="color:${TEAL};text-decoration:underline;">Unsubscribe</a>
    </td>
  </tr>
</table>

</td></tr>
</table>
</body>
</html>`;
}
