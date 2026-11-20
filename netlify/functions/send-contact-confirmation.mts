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
// instead of waiting. Since 15 Oct 2026 every booking link goes to /book/,
// where the prequal runs before any calendar is shown (decided with Darren);
// the link carries UTMs, so a booking that starts in this email is attributable.
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
import { escapeHtml, guideSender } from "../lib/guide-shared.mts";
import { renderEmail, para, bullets, box, strong, button, contactLine, COMPLIANCE } from "../lib/email-layout.mts";

const BOOK_BASE =
  "https://realdarrentsai.com/book/?utm_source=email&utm_medium=confirmation&utm_campaign=";

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
// context and get the 'contact' email. 21 Nov 2026: all five rewritten in
// Darren's voice on the shared layout (netlify/lib/email-layout.mts). `npm run emails`
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
  /** Further rows (para / bullets), after the "What you told me" box when there is one. */
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

// Darren's voice (21 Nov 2026, from his video transcripts and client emails:
// claude/darren-voice.md in the project). First person, contractions, "your
// scenario", "no pressure". Max approved the simpler copy on 21 Nov.
/** The plain closing: the live contact email and the mortgage review. */
const NEXT_STEP =
  "If you'd rather not wait for me to reach out, grab 15 minutes on my calendar. No pressure, and it's not a loan application.";
/**
 * The equity requests' version (31 Oct QA review, audit item 6): the call is
 * the 15-Minute Equity Audit, the home-equity front door's one offer
 * (positioning, 15 Oct). The mortgage review and the contact email are not
 * equity requests and keep the plain wording.
 */
const EQUITY_NEXT_STEP =
  "If you'd rather not wait for me to reach out, book your 15-Minute Equity Audit. No pressure, and it's not a loan application.";

const CONTEXTS: Record<string, Copy> = {
  contact: {
    campaign: "contact-modal",
    subject: "Got your info, here's my calendar",
    preheader: "I'll be the one looking at your scenario. Want to skip the wait? Grab 15 minutes.",
    headline: "Got your info",
    intro: () =>
      "Thanks for reaching out. Your info came through, and I'll be the one looking at your scenario. Not a call center, and not a bot.",
    body: [],
    closing: NEXT_STEP,
  },
  debt: {
    campaign: "debt-payoff",
    subject: "Got your debt comparison, here's my calendar",
    preheader: "Your numbers came through. Here's what to keep in mind.",
    headline: "Got your debt comparison",
    intro: () =>
      "Thanks for running the numbers. They came through with your request, so you won't need to enter them again.",
    body: [
      para("Keep in mind, the comparison is an estimate. It shows how your monthly payment could change, not what each option costs in total. A lower monthly payment doesn't always mean a lower total cost."),
      para("On a call we'll go through:"),
      bullets(["The real rates and fees", "How long each option takes to pay off", "What it means for the rate on your current mortgage"]),
    ],
    closing: EQUITY_NEXT_STEP,
  },
  "home-equity": {
    campaign: "home-equity",
    subject: "Got your home equity request, here's my calendar",
    preheader: "Thanks for sending this over. Here's what happens next.",
    headline: "Got your home equity request",
    intro: (lead) => {
      const goal = phrase(EQUITY_GOALS, lead.goal);
      return "Thanks for sending this over." + (goal ? ` You mentioned it's for ${goal}.` : "");
    },
    body: [
      para("Quick heads-up: the equity number you saw is an estimate, your home's value minus what you owe. It's not an amount you're approved to borrow. Lenders also look at your credit, income, the property and how much equity has to stay in the home."),
      para("On a call we can go over which options fit your scenario and what the real terms from lenders look like."),
    ],
    closing: EQUITY_NEXT_STEP,
  },
  adu: {
    campaign: "adu",
    subject: "Got your project request, here's my calendar",
    preheader: "Funding and the project itself are two separate checks.",
    headline: "Got your project request",
    intro: (lead) => {
      const purpose = phrase(ADU_PURPOSES, lead.projectPurpose);
      return "Thanks for sending your project details." + (purpose ? ` You mentioned it's ${purpose}.` : "");
    },
    body: [
      para("There are two separate questions here:"),
      bullets([
        `${strong("Funding:")} what you could borrow and on what terms. That's where I come in.`,
        `${strong("The project:")} zoning, permits, cost and timing. Your city's planning department and your builder answer that one.`,
      ]),
      para("Getting funding doesn't mean the project can be built, so it's worth checking both early. On a call we'll go over your budget and which funding options make sense for your scenario.", 6),
    ],
    closing: EQUITY_NEXT_STEP,
  },
  "mortgage-review": {
    campaign: "mortgage-calculator-review",
    subject: "Got your mortgage numbers, here's my calendar",
    preheader: "Your calculator numbers came through with your request.",
    headline: "Got your mortgage numbers",
    intro: () => "Thanks for sending your numbers from the mortgage calculator. They came through with your request.",
    body: [
      para("Keep in mind, the calculator only shows principal and interest. It doesn't include taxes or insurance, and the rate you typed isn't a quote."),
      para("On a call we can look at the payment you're aiming for and what financing is actually available for your scenario."),
    ],
    closing: NEXT_STEP,
  },
};

/** The copy for a lead. An unknown or absent context is the contact email. */
export function copyFor(lead: Lead): Copy {
  const key = (lead.context || "").trim();
  return Object.prototype.hasOwnProperty.call(CONTEXTS, key) ? CONTEXTS[key] : CONTEXTS.contact;
}

/** Every context's name, for the preview script and the tests. */
export const CONTEXT_NAMES = Object.keys(CONTEXTS);

/** What the visitor asked about, when they told us. Never echoed as HTML. */
function goalLine(lead: Lead) {
  const message = (lead.message || "").trim();
  return message ? box("What you told me", escapeHtml(message.slice(0, 600))) : "";
}

export function buildEmailHtml(lead: Lead) {
  const copy = copyFor(lead);
  return renderEmail({
    title: copy.subject,
    preheader: copy.preheader,
    firstName: lead.firstName,
    headline: copy.headline,
    blocks: [
      para(copy.intro(lead)),
      goalLine(lead),
      ...copy.body,
      para(copy.closing),
      button("Pick a time", BOOK_BASE + copy.campaign),
      contactLine(),
    ],
    compliance: COMPLIANCE.standard,
  });
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
