// Netlify Function: send-contact-confirmation
//
// The contact modal's instant reply. Called server-side by processFollowUps in
// google-apps-script.js, about a minute after a contact lead is logged.
//
// WHY THIS EXISTS. Every magnet form sent the visitor something: the DSCR
// snapshot, the FHA calculator, the REI case study. The contact modal, the form
// that asks the most and is used by the visitor closest to ready, sent nothing
// at all. The button says "Send My Info to Darren" and then the visitor hears
// nothing until Darren gets to them, with no proof it arrived and no way to move
// first. The 26 Sep audit flagged it as the largest gap on the page.
//
// There is no attachment. The one thing worth putting in front of someone who
// has just asked to be contacted is the calendar, so they can pick a time
// instead of waiting. The link carries UTMs, which the guide emails' Calendly
// links still do not, so a booking that starts in this email is attributable.
//
// SETUP:
// 1. Netlify → Site settings → Environment variables:
//      CONTACT_CONFIRM_API_KEY = <any long random string you make up>
//    Uses the same Resend account as the guide senders. No new signup.
// 2. Apps Script → Project Settings → Script Properties:
//      NETLIFY_CONTACT_CONFIRM_URL = https://realdarrentsai.com/api/send-contact-confirmation
//      NETLIFY_CONTACT_CONFIRM_KEY = <same random string>
//
// Until both properties exist, sendContactConfirmation in the Apps Script skips
// rather than failing, so deploying this in either order is safe.
//
// The x-api-key header must match CONTACT_CONFIRM_API_KEY: this endpoint sends a
// real email on every call, so it is not left open.

import type { Config } from "@netlify/functions";
import { escapeHtml, guideSender } from "./guide-shared.mts";

const CALENDLY =
  "https://calendly.com/realdarrentsai/15min" +
  "?utm_source=email&utm_medium=confirmation&utm_campaign=contact-modal";

/** What the visitor asked about, when they told us. Never echoed as HTML. */
function goalLine(lead: { message?: string }) {
  const message = (lead.message || "").trim();
  if (!message) return "";
  const FONT = "Arial,Helvetica,sans-serif";
  return `
  <tr>
    <td class="pad" style="padding:24px 40px 0 40px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#f5f7f9;border:1px solid #e6ebf0;border-radius:10px;">
        <tr>
          <td style="padding:18px 24px;font-family:${FONT};">
            <div style="font-size:10px;line-height:14px;mso-line-height-rule:exactly;font-weight:600;letter-spacing:1.4px;text-transform:uppercase;color:#517686;padding-bottom:8px;">What you told me</div>
            <div style="font-size:15px;line-height:24px;mso-line-height-rule:exactly;color:#6b7280;">${escapeHtml(message.slice(0, 600))}</div>
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
}

function buildEmailHtml(lead: { firstName?: string; message?: string }) {
  const firstName = escapeHtml(lead.firstName || "there");
  const FONT = "Arial,Helvetica,sans-serif";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>Got your details, here is my calendar</title>
<!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
<style>
  @media only screen and (max-width:620px){
    .wrap{width:100% !important;}
    .pad{padding-left:24px !important;padding-right:24px !important;}
    .h1{font-size:24px !important;line-height:30px !important;}
  }
</style>
</head>
<body style="margin:0;padding:0;background-color:#f5f7f9;">
<span style="display:none;font-size:1px;color:#f5f7f9;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">Your details reached me. If you would rather not wait, my calendar is open below.</span>

<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#f5f7f9;">
<tr><td align="center" style="padding:32px 12px;">

<table role="presentation" class="wrap" cellpadding="0" cellspacing="0" border="0" width="600" style="width:600px;max-width:600px;background-color:#ffffff;border:1px solid #e6ebf0;border-radius:16px;overflow:hidden;">

  <tr>
    <td style="background-color:#517686;padding:26px 40px 22px 40px;" class="pad">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
        <tr><td style="font-family:${FONT};font-size:10px;line-height:14px;mso-line-height-rule:exactly;font-weight:600;letter-spacing:1.4px;text-transform:uppercase;color:#c8e2e8;padding-bottom:8px;">Your request</td></tr>
        <tr><td style="font-family:${FONT};font-size:21px;line-height:27px;mso-line-height-rule:exactly;font-weight:700;letter-spacing:-0.01em;color:#ffffff;">Darren Tsai</td></tr>
        <tr><td style="font-family:${FONT};font-size:13px;line-height:18px;mso-line-height-rule:exactly;color:#c8e2e8;padding-top:4px;">Senior Loan Officer, Saxton Mortgage</td></tr>
      </table>
    </td>
  </tr>
  <tr><td style="background-color:#274654;font-size:0;line-height:0;height:3px;">&nbsp;</td></tr>

  <tr>
    <td class="pad" style="padding:36px 40px 8px 40px;font-family:${FONT};">
      <div class="h1" style="font-size:28px;line-height:34px;mso-line-height-rule:exactly;font-weight:700;letter-spacing:-0.02em;color:#223d55;">Got your details</div>
    </td>
  </tr>

  <tr>
    <td class="pad" style="padding:20px 40px 0 40px;font-family:${FONT};font-size:16px;line-height:26px;mso-line-height-rule:exactly;color:#6b7280;">
      Hi ${firstName},
    </td>
  </tr>
  <tr>
    <td class="pad" style="padding:16px 40px 0 40px;font-family:${FONT};font-size:16px;line-height:26px;mso-line-height-rule:exactly;color:#6b7280;">
      Your details reached me and I will look at your numbers myself. This email is so you know it arrived rather than wondering.
    </td>
  </tr>
${goalLine(lead)}

  <tr>
    <td class="pad" style="padding:24px 40px 0 40px;font-family:${FONT};font-size:16px;line-height:26px;mso-line-height-rule:exactly;color:#6b7280;">
      If you would rather not wait for me to reach you, pick any 15 minutes that suits you. No credit pull, no obligation.
    </td>
  </tr>

  <tr>
    <td class="pad" align="left" style="padding:24px 40px 0 40px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td bgcolor="#219ebc" style="border-radius:8px;">
            <a href="${CALENDLY}" style="display:block;padding:14px 30px;font-family:${FONT};font-size:15px;line-height:20px;mso-line-height-rule:exactly;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">Pick a time</a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
  <tr>
    <td class="pad" style="padding:12px 40px 0 40px;font-family:${FONT};font-size:13px;line-height:20px;mso-line-height-rule:exactly;color:#6b7280;">
      Or call me directly: <a href="tel:+17148875432" style="color:#517686;text-decoration:none;">(714) 887-5432</a>
    </td>
  </tr>

  <tr>
    <td class="pad" style="padding:28px 40px 36px 40px;font-family:${FONT};font-size:16px;line-height:26px;mso-line-height-rule:exactly;color:#6b7280;">
      Talk soon,<br>
      <span style="font-weight:600;color:#223d55;">Darren</span>
    </td>
  </tr>

  <tr><td style="border-top:1px solid #e6ebf0;font-size:0;line-height:0;">&nbsp;</td></tr>
  <tr>
    <td class="pad" style="padding:24px 40px 30px 40px;font-family:${FONT};">
      <div style="font-size:13px;line-height:20px;mso-line-height-rule:exactly;color:#6b7280;">Darren Tsai &middot; Senior Loan Officer, Saxton Mortgage<br>Licensed in AZ &middot; CA &middot; FL &middot; HI &middot; OR &middot; PA &middot; TN &middot; TX</div>
      <div style="font-size:13px;line-height:20px;mso-line-height-rule:exactly;color:#6b7280;padding-top:10px;">9191 Towne Centre Drive, Suite 400<br>San Diego, CA 92122<br><a href="tel:+18589252102" style="color:#517686;text-decoration:none;">(858) 925-2102</a> &middot; <a href="mailto:info@saxtonmortgage.com" style="color:#517686;text-decoration:underline;">info@saxtonmortgage.com</a></div>
      <div style="font-size:11px;line-height:18px;mso-line-height-rule:exactly;color:#6b7280;padding-top:12px;">Darren Tsai, DRE #02103705 | NMLS #2438102. Dream Home Development Corporation DBA Saxton Mortgage, NMLS #2525913 | CA DRE #02205650. Equal Housing Opportunity. Not a commitment to lend. Final terms are determined by underwriting.</div>
      <div style="font-size:11px;line-height:18px;mso-line-height-rule:exactly;color:#6b7280;padding-top:12px;">Dream Home Development Corporation is a subsidiary of Saxton Mortgage, LLC (NMLS #1717191), operating only in California. <a href="https://www.nmlsconsumeraccess.org/" style="color:#517686;text-decoration:underline;">NMLS Consumer Access</a></div>
      <div style="font-size:11px;line-height:18px;mso-line-height-rule:exactly;color:#6b7280;padding-top:12px;">Dream Home Development Corporation DBA Saxton Mortgage, 9191 Towne Centre Drive, Suite 400, San Diego, CA 92122<br><a href="mailto:darren@realdarrentsai.com?subject=Unsubscribe" style="color:#517686;text-decoration:underline;">Unsubscribe</a> from these emails.</div>
    </td>
  </tr>

</table>

</td></tr>
</table>
</body>
</html>`;
}

export default guideSender({
  name: "send-contact-confirmation",
  apiKeyEnv: "CONTACT_CONFIRM_API_KEY",
  subject: "Got your details, here is my calendar",
  buildEmailHtml,
  // Nothing to attach. The calendar link is the payload.
  buildAttachments: async () => [],
});

export const config: Config = {
  path: "/api/send-contact-confirmation",
};
