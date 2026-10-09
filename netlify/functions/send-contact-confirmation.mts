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

const CALENDLY_BASE =
  "https://calendly.com/realdarrentsai/15min?utm_source=email&utm_medium=confirmation&utm_campaign=";

// ── Contexts ────────────────────────────────────────────────────────────────
//
// One template, several sets of words. The revamp (brief section 11.1) asks for
// a confirmation that fits the funnel the request came from, on the design this
// email already has, and explicitly not a second email system.
//
// WIRED UP 10 Oct 2026, after Max approved the copy. The Apps Script names the
// context (confirmationContext in google-apps-script.js): 'debt' for the debt
// calculator, 'home-equity', 'adu', and 'mortgage-review' for the mortgage
// calculator's review form when its numbers came with it. Contact leads send no
// context and get the 'contact' email, byte for byte what it was before this
// table existed (tests/confirmation-email.test.ts holds that). `npm run emails`
// renders each set to docs/revamp/emails/ for review.
//
// SHIP ORDER: this file (the site) before the Apps Script version that sends
// contexts. The other way round, the old function would ignore the context and
// send calculator leads the contact email, which thanks them for "your details"
// and says nothing about their funnel.
//
// What every context must hold to (brief 11.1, and Max's 8 Oct decisions):
// the request was RECEIVED, never reviewed or approved; no response time; no
// figure, rate or payment repeated from a calculator; no attachment claimed.
type Lead = Record<string, string | undefined>;

type Copy = {
  /** utm_campaign on the calendar link, so a booking can be told apart by funnel. */
  campaign: string;
  subject: string;
  /** The hidden line an inbox shows beside the subject. */
  preheader: string;
  headline: string;
  /** First paragraph. May name what the visitor chose; must return safe HTML. */
  intro: (lead: Lead) => string;
  /** Further paragraphs, after the "What you told me" box when there is one. */
  body: string[];
  /** The line above the button. */
  closing: string;
};

/** A dropdown answer as a phrase, from a fixed table so nothing posted is echoed. */
function phrase(table: Record<string, string>, value: string | undefined): string {
  const key = (value || "").trim();
  return Object.prototype.hasOwnProperty.call(table, key) ? table[key] : "";
}

const EQUITY_GOALS: Record<string, string> = {
  "Pay Off Debt": "paying off debt",
  "Renovation / ADU": "a renovation or ADU",
  "Investment": "an investment",
  "Major Expense": "a major expense",
};
const ADU_PURPOSES: Record<string, string> = {
  "ADU for family": "an ADU for family",
  "Rental ADU": "a rental ADU",
  "Renovation": "a renovation",
};

/** First person, because the email is signed by Darren. The site says "Darren will be in touch." */
const NEXT_STEP =
  "I will be in touch. If you would like to pick a time yourself, choose any 15 minutes that suits you. No credit pull, no obligation.";

const CONTEXTS: Record<string, Copy> = {
  // The live email. Do not edit without meaning to change what is being sent.
  contact: {
    campaign: "contact-modal",
    subject: "Got your details, here is my calendar",
    preheader: "Your details reached me. If you would rather not wait, my calendar is open below.",
    headline: "Got your details",
    intro: () =>
      "Your details reached me and I will look at your numbers myself. This email is so you know it arrived rather than wondering.",
    body: [],
    closing:
      "If you would rather not wait for me to reach you, pick any 15 minutes that suits you. No credit pull, no obligation.",
  },
  debt: {
    campaign: "debt-consolidation",
    subject: "Got your debt comparison request, here is my calendar",
    preheader: "Your request has been received. The comparison you ran is a starting point.",
    headline: "Your request has been received",
    intro: () =>
      "Thanks for running the comparison and sending it over. Your numbers came through with your request, so you will not need to enter them again.",
    body: [
      "What you saw is an estimate. It shows how the monthly payment could change, which is not the same as what each option costs in total. Lower monthly payments do not necessarily mean lower total borrowing costs.",
      "On a call we can go through the actual rates, the fees, how long each option takes to pay off, and what it means to give up the rate on your current mortgage.",
    ],
    closing: NEXT_STEP,
  },
  "home-equity": {
    campaign: "home-equity",
    subject: "Got your home equity request, here is my calendar",
    preheader: "Your request has been received. Here is what happens next.",
    headline: "Your request has been received",
    intro: (lead) => {
      const goal = phrase(EQUITY_GOALS, lead.goal);
      return "Thanks for sending your home equity request." + (goal ? ` You told me this is for ${goal}.` : "");
    },
    body: [
      "The equity figure you saw is an estimate: your home's value less what you owe on it. It is not an amount you have been approved to borrow. Lenders also look at credit, income, the property and how much of the value has to stay in the home.",
      "On a call we can look at which ways of using your equity could fit, what you may be eligible for, and the actual terms from lenders.",
    ],
    closing: NEXT_STEP,
  },
  adu: {
    campaign: "adu",
    subject: "Got your project funding request, here is my calendar",
    preheader: "Your request has been received. Funding and the project itself are two separate checks.",
    headline: "Your request has been received",
    intro: (lead) => {
      const purpose = phrase(ADU_PURPOSES, lead.projectPurpose);
      return "Thanks for sending the details of your project." + (purpose ? ` You told me it is ${purpose}.` : "");
    },
    body: [
      "There are two separate questions here. The first is funding: what you could borrow, how, and on what terms. That is the part I can help with. The second is the project: zoning, permits, site conditions, cost and timing. Your local planning department and your builder answer that one, and funding does not confirm that the project can be built.",
      "On a call we can go through your budget, how much of it you want to finance, and which funding paths are worth looking at.",
    ],
    closing: NEXT_STEP,
  },
  "mortgage-review": {
    campaign: "mortgage-calculator-review",
    subject: "Got your mortgage review request, here is my calendar",
    preheader: "Your request has been received. Your calculator numbers came with it.",
    headline: "Your request has been received",
    intro: () => "Thanks for sending your numbers from the mortgage calculator. They came through with your request.",
    body: [
      "The calculator shows principal and interest on the figures you entered. It does not include taxes, insurance or other costs, and the rate you typed is not a quote.",
      "On a call we can look at the payment you are aiming for and what financing would actually be available to you.",
    ],
    closing: NEXT_STEP,
  },
};

/** The copy for a lead. An unknown or absent context is the live contact email. */
export function copyFor(lead: Lead): Copy {
  const key = (lead.context || "").trim();
  return Object.prototype.hasOwnProperty.call(CONTEXTS, key) ? CONTEXTS[key] : CONTEXTS.contact;
}

/** Every context's name, for the preview script and the tests. */
export const CONTEXT_NAMES = Object.keys(CONTEXTS);

/** What the visitor asked about, when they told us. Never echoed as HTML. */
function goalLine(lead: Lead) {
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

export function buildEmailHtml(lead: Lead) {
  const firstName = escapeHtml(lead.firstName || "there");
  const FONT = "Arial,Helvetica,sans-serif";
  const copy = copyFor(lead);
  const calendly = CALENDLY_BASE + copy.campaign;
  const paragraph = (text: string) => `
  <tr>
    <td class="pad" style="padding:16px 40px 0 40px;font-family:${FONT};font-size:16px;line-height:26px;mso-line-height-rule:exactly;color:#6b7280;">
      ${text}
    </td>
  </tr>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${copy.subject}</title>
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
<span style="display:none;font-size:1px;color:#f5f7f9;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${copy.preheader}</span>

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
      <div class="h1" style="font-size:28px;line-height:34px;mso-line-height-rule:exactly;font-weight:700;letter-spacing:-0.02em;color:#223d55;">${copy.headline}</div>
    </td>
  </tr>

  <tr>
    <td class="pad" style="padding:20px 40px 0 40px;font-family:${FONT};font-size:16px;line-height:26px;mso-line-height-rule:exactly;color:#6b7280;">
      Hi ${firstName},
    </td>
  </tr>
  <tr>
    <td class="pad" style="padding:16px 40px 0 40px;font-family:${FONT};font-size:16px;line-height:26px;mso-line-height-rule:exactly;color:#6b7280;">
      ${copy.intro(lead)}
    </td>
  </tr>
${goalLine(lead)}${copy.body.map(paragraph).join("")}

  <tr>
    <td class="pad" style="padding:24px 40px 0 40px;font-family:${FONT};font-size:16px;line-height:26px;mso-line-height-rule:exactly;color:#6b7280;">
      ${copy.closing}
    </td>
  </tr>

  <tr>
    <td class="pad" align="left" style="padding:24px 40px 0 40px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td bgcolor="#219ebc" style="border-radius:8px;">
            <a href="${calendly}" style="display:block;padding:14px 30px;font-family:${FONT};font-size:15px;line-height:20px;mso-line-height-rule:exactly;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">Pick a time</a>
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
      <div style="font-size:11px;line-height:18px;mso-line-height-rule:exactly;color:#6b7280;padding-top:12px;">Darren Tsai, DRE #02103705 | NMLS #2438102. Saxton Mortgage, LLC | NMLS #1717191 (<a href="https://www.nmlsconsumeraccess.org/" style="color:#517686;text-decoration:underline;">NMLS Consumer Access</a>). Equal Housing Opportunity. Not a commitment to lend. Final terms are determined by underwriting.</div>
      <div style="font-size:11px;line-height:18px;mso-line-height-rule:exactly;color:#6b7280;padding-top:12px;">Saxton Mortgage, LLC, 9191 Towne Centre Drive, Suite 400, San Diego, CA 92122<br><a href="mailto:darren@realdarrentsai.com?subject=Unsubscribe" style="color:#517686;text-decoration:underline;">Unsubscribe</a> from these emails.</div>
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
  subject: (lead) => copyFor(lead).subject,
  buildEmailHtml,
  // Nothing to attach. The calendar link is the payload.
  buildAttachments: async () => [],
});

export const config: Config = {
  path: "/api/send-contact-confirmation",
};
