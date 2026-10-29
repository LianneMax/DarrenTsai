import { serviceArea, SERVICE_AREA_VERSION, OUT_OF_MARKET_MESSAGE, PREQUAL_FORMS, BOOKING_PREQUAL_FORM, BOOKING_GOALS, prequalPasses, prequalAnswered, propertyUses, isCaptureInquiry, isCaptureForm, isEquityForm, INQUIRY_MESSAGE_LIMIT } from '../../src/utils/serviceArea';
import { bookingBucket } from '../../src/utils/bookingBucket';
// Netlify Function: lead
//
// The single server-side entry point for every lead on the site. All eight
// submit paths (2 React forms, 3 magnet forms, 3 contact modals) POST here, and
// this function forwards to the Apps Script web app.
//
// WHY THIS EXISTS. The forms used to POST straight to the Apps Script /exec URL
// with `mode: 'no-cors'`, which makes the response opaque: status is always 0
// and unreadable. A 500, a rotated deployment URL or an empty env var was
// indistinguishable from success, so every form showed a green checkmark
// regardless. Under ad spend that means paying for a click, losing the lead,
// and still reporting a conversion to Google.
//
// A client-side CORS fix is not available: /exec 302-redirects to
// script.googleusercontent.com, and per the Fetch spec the CORS check applies
// to the redirect response, which carries no Access-Control-Allow-Origin.
// ContentService cannot set headers and Apps Script has no doOptions. Going
// through the server sidesteps CORS entirely — and Apps Script's
// {success:true|false} body has always been correct, merely unreadable.
//
// It also means the Apps Script URL lives in ONE place (the
// APPS_SCRIPT_WEBHOOK_URL env var) instead of the client bundle plus three
// hardcoded HTML files, and that every future integration (HubSpot, offline
// conversion stamping, server-side GA4) is a change here rather than in eight
// form handlers.
//
// SETUP: Netlify → Site settings → Environment variables:
//   APPS_SCRIPT_WEBHOOK_URL = https://script.google.com/macros/s/<id>/exec
//     (server-side, deliberately NOT prefixed VITE_ — it must not be bundled)
//   RESEND_API_KEY = <already set, shared with the guide functions>

import type { Config, Context } from "@netlify/functions";
import { getStore } from "@netlify/blobs";
import { createHash } from "node:crypto";
import { Resolver } from "node:dns/promises";
import { admitLead } from './lead-inbox.mts';

const FROM = "Darren Tsai <darren@realdarrentsai.com>";
// Max, 21 Oct: technical capture/rescue alerts go only to Max. These are
// operational recovery messages, separate from ordinary CRM lead notifications.
const ALERT_TO = ["liannemaxbalbastro@gmail.com"];

// 21 Oct live verification: Google saved both the equity and guidance TESTs,
// but our old 9s deadline aborted their confirmation and mailed false alarms.
// That budget assumed a historical 10s hosting limit. This is a modern default
// Request/Response function, whose current synchronous limit is 60s:
// https://docs.netlify.com/build/functions/configuration/#default-values
// Allow a slow Google response 25s total, without adding a delay to fast ones,
// and leave ample hosting headroom for a genuine-failure rescue email. This
// does not make slow storage fast or assert success without a matching receipt.
const UPSTREAM_TIMEOUT_MS = 25000;

const ALLOWED_HOSTS = ["realdarrentsai.com", "www.realdarrentsai.com"];

// ── Rate limit ──────────────────────────────────────────────────────────────
//
// WHY. Nothing limited how often this endpoint could be called (security pass,
// 10 Oct). Every accepted post writes a Sheet row, creates a HubSpot
// contact, and since R2 makes the site email whatever address it was given
// from Darren's domain. A script posting fake leads would do all of that at
// once, and the email part is the one that costs the sending reputation every
// real lead's guide depends on.
//
// WHY IN CODE. Netlify's own rate-limit rules could not be confirmed for this
// plan, and the installed type for the function config does not match the
// documented one, so a config line could be rejected or silently ignored on
// the deploy. Counting here, in the Blobs store the rates already use, is
// under our control and testable.
//
// FAILS OPEN. The count is a guard, never a gate a real visitor can trip over
// by accident: any Blobs error, or an answer slower than LIMIT_BUDGET_MS, lets
// the post through. LEAD_LIMIT posts per address per window is several times
// what one person sends (one form, maybe a corrected resubmit); an office or a
// phone carrier sharing one address would have to send that many leads inside
// fifteen minutes to be refused.
//
// A refused post is answered before the body is read, so it can never send the
// rescue email: the pages say "your details were passed to Darren" only because
// every other failure does send one, and a flood must not fill his inbox
// instead. The 429 carries a message the pages show as it is.
//
// The address is stored hashed, not as typed: the count needs to recognise it,
// not to know it.
export const LEAD_LIMIT = 10;
export const LEAD_WINDOW_MS = 15 * 60 * 1000;
const LIMIT_BUDGET_MS = 600;
const LIMIT_STORE = "lead-rate";
export const RATE_LIMIT_MESSAGE =
  "Too many requests from this connection. Please wait a few minutes and try again, or call (714) 887-5432.";

type Counter = { count: number; windowStart: number };

/** The next count for one address. Pure, so the window logic is testable. */
export function nextCount(prev: Counter | null, now: number): Counter {
  if (!prev || now - prev.windowStart >= LEAD_WINDOW_MS) return { count: 1, windowStart: now };
  return { count: prev.count + 1, windowStart: prev.windowStart };
}

/** False only when this address is known, for certain, to be over the limit. */
export async function withinRateLimit(ip: string | undefined, now = Date.now()): Promise<boolean> {
  if (!ip) return true;
  const key = createHash("sha256").update(ip).digest("hex").slice(0, 32);
  const check = (async () => {
    const store = getStore({ name: LIMIT_STORE, consistency: "strong" });
    // Concurrent requests used to overwrite the same count (20 requests became
    // one). Only a successful version-checked write reserves an allowance.
    for (let attempt = 0; attempt < 32; attempt++) {
      const current = await store.getWithMetadata(key, { type: "json", consistency: "strong" });
      if (current && !current.etag) throw new Error("Rate counter has no version");
      const next = nextCount(current?.data as Counter | null, now);
      if (next.count > LEAD_LIMIT) return false;
      const result = await store.setJSON(key, next, current
        ? { onlyIfMatch: current.etag }
        : { onlyIfNew: true });
      if (result.modified) return true;
    }
    // Repeated contention is positive abuse evidence, not a storage outage.
    return false;
  })();
  const timeout = new Promise<boolean>((resolve) => setTimeout(() => resolve(true), LIMIT_BUDGET_MS));
  try {
    return await Promise.race([check.catch(() => true), timeout]);
  } catch {
    return true;
  }
}

// ── Email domain check ──────────────────────────────────────────────────────
//
// WHY. Resend answers 422 "Invalid `to` field" for an address whose domain
// cannot receive mail. By the time that happens the lead is saved, the visitor
// has gone, and the guide they were promised is never sent. The typo hint in
// the form (public/email-suggest.js) catches a misspelt gmail.com, but it says
// nothing about a domain it has never heard of, which is exactly what an
// invented or dead domain looks like.
//
// THE RULE. This refuses a lead ONLY on a definitive "this domain does not
// exist" from DNS. A timeout, a SERVFAIL, or any other uncertainty lets the
// lead through. Turning away a real buyer because DNS was briefly slow costs
// far more than one undelivered guide, so every ambiguous case fails open.
const MX_TIMEOUT_MS = 700;

// Skipped outright: these carry most of the traffic and are known good, so the
// common case costs no latency at all.
const KNOWN_GOOD_DOMAINS = new Set([
  "gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "icloud.com", "aol.com",
  "me.com", "live.com", "msn.com", "comcast.net", "verizon.net", "att.net",
  "sbcglobal.net", "cox.net", "charter.net", "ymail.com", "protonmail.com",
  "proton.me", "bellsouth.net", "realdarrentsai.com", "resend.dev",
]);

/** Warm containers reuse this, so a repeat submission costs no second lookup. */
const domainCache = new Map<string, boolean>();

/** The slice of node:dns this file uses. */
type MxResolver = {
  resolveMx(domain: string): Promise<unknown[]>;
  resolve4(domain: string): Promise<string[]>;
  cancel(): void;
};

const realResolver = (): MxResolver =>
  new Resolver({ timeout: MX_TIMEOUT_MS, tries: 1 }) as unknown as MxResolver;

let makeResolver: () => MxResolver = realResolver;

/**
 * Test seam. vi.mock does not reach a .mts function module under this Vitest
 * setup (it is loaded outside the transform pipeline), and a test that hits
 * real DNS is neither fast nor honest, so the resolver is injectable. Passing
 * null restores the real one. Also clears the cache, which otherwise leaks a
 * verdict from one test into the next.
 */
export function __setResolverFactory(factory: (() => MxResolver) | null) {
  makeResolver = factory ?? realResolver;
  domainCache.clear();
}

/** DNS errors that mean the domain genuinely has no mail route. */
const DEFINITIVE_NXDOMAIN = new Set(["ENOTFOUND", "ENODATA", "NXDOMAIN"]);

/** An email with something before the @ and a dot plus two letters after it. */
export function isEmailFormat(email: unknown): boolean {
  return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}

/** A US number under NANP rules, the forms' validPhone. */
export function isUsPhone(phone: unknown): boolean {
  let d = String(phone ?? "").replace(/\D/g, "");
  if (d.charAt(0) === "1") d = d.slice(1); // the country code; no US area code starts with 1
  if (d.length !== 10) return false;
  const block = (b: string) => /^[2-9]\d{2}$/.test(b) && !/^[2-9]11$/.test(b);
  return block(d.slice(0, 3)) && block(d.slice(3, 6));
}

export function emailDomain(email: unknown): string | null {
  if (typeof email !== "string") return null;
  const at = email.trim().lastIndexOf("@");
  if (at < 1) return null;
  const domain = email.trim().slice(at + 1).toLowerCase();
  if (!domain.includes(".") || domain.endsWith(".") || domain.includes(" ")) return null;
  return domain;
}

/**
 * True only when DNS says, without ambiguity, that mail to this domain cannot
 * be routed: no MX record and no A record to fall back on (RFC 5321 §5.1).
 * Anything else - timeout, SERVFAIL, a thrown resolver - returns false.
 */
async function domainCannotReceiveMail(domain: string): Promise<boolean> {
  if (KNOWN_GOOD_DOMAINS.has(domain)) return false;
  const cached = domainCache.get(domain);
  if (cached !== undefined) return cached;

  const resolver = makeResolver();
  const lookup = (async () => {
    try {
      const mx = await resolver.resolveMx(domain);
      if (mx.length > 0) return false;
    } catch (err) {
      const code = (err as { code?: string } | null)?.code ?? "";
      if (!DEFINITIVE_NXDOMAIN.has(code)) return false; // uncertain: let it through
    }
    // No MX. A domain with an A record still accepts mail, so check before
    // refusing anything.
    try {
      const a = await resolver.resolve4(domain);
      return a.length === 0;
    } catch (err) {
      const code = (err as { code?: string } | null)?.code ?? "";
      return DEFINITIVE_NXDOMAIN.has(code);
    }
  })();

  let verdict = false;
  try {
    verdict = await Promise.race([
      lookup,
      new Promise<boolean>((r) => setTimeout(() => r(false), MX_TIMEOUT_MS)),
    ]);
  } catch {
    verdict = false;
  }
  try {
    resolver.cancel();
  } catch {
    /* nothing to cancel */
  }
  if (verdict) domainCache.set(domain, true); // only cache the definite answer
  return verdict;
}

// ── HubSpot visitor cookie ──────────────────────────────────────────────────
//
// WHY. HubSpot's tracking code (GTM container version 6) sets `hubspotutk` on
// every page, and it is what ties a form submission to the browsing history
// HubSpot has already recorded, including the landing visit that carried the
// gclid. Apps Script cannot see the visitor's cookies, so the only place it can
// be read is here, and the forms post same-origin, so the browser sends it.
//
// Only the format is checked, so this costs nothing on the synchronous path. A
// value that is not 32 hex characters is dropped rather than forwarded: HubSpot
// is known to reject a submission over a malformed hutk, and a hand-edited or
// truncated cookie must not cost a lead its HubSpot record.
const HUTK_PATTERN = /^[a-f0-9]{32}$/i;

export function readHutk(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0 || part.slice(0, eq).trim() !== "hubspotutk") continue;
    let value = part.slice(eq + 1).trim();
    try {
      value = decodeURIComponent(value);
    } catch {
      /* keep it raw; the pattern decides */
    }
    return HUTK_PATTERN.test(value) ? value : null;
  }
  return null;
}

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/**
 * This endpoint is public by necessity (the forms are public) and it fans out
 * into a Resend send on failure, so it needs a floor on abuse: a spam flood
 * would burn the sending-domain reputation the guide emails depend on.
 * Netlify deploy previews are allowed so the staging forms still work.
 */
function originAllowed(req: Request): boolean {
  const raw = req.headers.get("origin") || req.headers.get("referer") || "";
  if (!raw) return false;
  try {
    const host = new URL(raw).hostname.toLowerCase();
    const url = new URL(raw);
    if (url.protocol !== "https:") return false;
    const siteName = Netlify.env.get("SITE_NAME");
    const preview = siteName && (host === `${siteName}.netlify.app`
      || (host.endsWith(`--${siteName}.netlify.app`) && /^[a-z0-9-]+$/.test(host.split("--")[0])));
    return ALLOWED_HOSTS.includes(host) || Boolean(preview);
  } catch {
    return false;
  }
}

// ── Rescue alert ────────────────────────────────────────────────────────────
//
// WHY IT IS FORMATTED. This email is read on a phone, usually in a hurry, and
// the only question that matters is "do I have to re-enter this lead by hand,
// and if so what are the details". The old version answered that with a wall of
// raw JSON: the name, email and phone were in there somewhere, between the
// twenty calculator fields nobody needs at that moment. So the contact details
// come first as a table, the raw payload stays at the bottom for the rare case
// where a calculator number matters, and the plain-text part is kept intact for
// any client that will not render HTML.

const ALERT_FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,Helvetica,sans-serif";

/** The fields worth showing above the fold, in the order they are useful. */
const LEAD_FIELDS: Array<[key: string, label: string]> = [
  ["email", "Email"],
  ["phone", "Phone"],
  ["state", "State"],
  ["source", "Source"],
  ["magnet", "Magnet"],
  ["timestamp", "Submitted"],
];

const ATTRIBUTION_FIELDS: Array<[key: string, label: string]> = [
  ["utm_source", "Source"],
  ["utm_medium", "Medium"],
  ["utm_campaign", "Campaign"],
  ["utm_content", "Content"],
  ["utm_term", "Term"],
  ["clickId", "Click ID"],
  ["clickIdType", "Click ID type"],
  ["landingPage", "Landing page"],
  ["referrer", "Referrer"],
];

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Pretty-print whatever a form actually sent: strings, numbers, or a debts array. */
function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function row(label: string, valueHtml: string): string {
  return (
    `<tr>` +
    `<td style="padding:7px 0;font-family:${ALERT_FONT};font-size:13px;line-height:18px;color:#6b7280;width:150px;vertical-align:top;white-space:nowrap;">${escapeHtml(label)}</td>` +
    `<td style="padding:7px 0;font-family:${ALERT_FONT};font-size:14px;line-height:19px;color:#223d55;font-weight:600;word-break:break-word;">${valueHtml}</td>` +
    `</tr>`
  );
}

function section(title: string, rowsHtml: string): string {
  if (!rowsHtml) return "";
  return (
    `<tr><td style="padding:22px 28px 0 28px;">` +
    `<div style="font-family:${ALERT_FONT};font-size:10px;line-height:14px;font-weight:700;letter-spacing:1.3px;text-transform:uppercase;color:#517686;padding-bottom:4px;">${escapeHtml(title)}</div>` +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${rowsHtml}</table>` +
    `</td></tr>`
  );
}

/**
 * How much of the raw submission the alert carries.
 *
 * The raw block used to embed the whole payload, twice (HTML and plain text),
 * with escapeHtml able only to grow it. That was fine while the only callers
 * were the upstream-failure paths, where the body is a normal lead of a few
 * hundred characters. It stops being fine now the oversized-payload path also
 * rescues: that body is over 100,000 characters by definition, and mailing it
 * twice is how an alert about a lost lead becomes an alert nobody can open.
 *
 * 20,000 is far above any real submission, so a genuine lead is still recorded
 * in full and nothing about the existing alerts changes.
 */
const RAW_MAX = 20_000;

/**
 * Builds the alert. Pure and separate from the send, so the wording and the
 * field handling can be reasoned about (and tested) without a network call.
 */
export function normalizeSmsConsent(payload: Record<string, unknown>) {
  for (const key of ['smsConsent', 'smsInformationalConsent', 'smsMarketingConsent']) {
    if (key in payload) payload[key] = payload[key] === true;
  }
  // The legacy field means marketing only, never either category combined.
  if ('smsMarketingConsent' in payload) payload.smsConsent = payload.smsMarketingConsent;
}

export function buildRescueEmail(reason: string, payload: string, uncertain: boolean, location:'sheet'|'inbox'='sheet') {
  const rawShown =
    payload.length > RAW_MAX
      ? `${payload.slice(0, RAW_MAX)}\n\n[truncated, ${payload.length} characters total]`
      : payload;
  let lead: Record<string, unknown> = {};
  let parsedOk = false;
  try {
    const parsed = JSON.parse(payload);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      lead = parsed as Record<string, unknown>;
      parsedOk = true;
    }
  } catch {
    /* fall through: the raw block at the bottom is then the only record we have */
  }

  const name = [lead.firstName, lead.lastName].map(displayValue).join(" ").trim();
  const email = displayValue(lead.email);
  const phone = displayValue(lead.phone);

  const headline = location==='inbox' ? 'Check the website inbox for this inquiry' : uncertain ? "Check the Sheet for this lead" : "This lead did not save";
  const accent = uncertain ? "#b45309" : "#b42318";
  const accentSoft = uncertain ? "#fffaeb" : "#fef3f2";
  const accentBorder = uncertain ? "#fedf89" : "#fecdc9";
  // The subject is the whole message for someone reading a notification on a
  // phone, so it says what to DO and who it is about, in that order. Jargon
  // ("STATUS UNKNOWN") told the reader about our plumbing, not their next move.
  const who = name || email || "a new lead";
  const subject = location==='inbox' ? `Check the website inbox for ${who} - save confirmation unavailable` : uncertain
    ? `Check the Sheet for ${who} - lead may not have saved`
    : `Add ${who} by hand - lead did not save`;

  const explanationHtml = location==='inbox' ? 'The website could not confirm its durable inbox receipt. The inquiry may already be saved in the inbox and awaiting Sheet synchronization. This is an uncertain outcome, not proof of a lost lead.' : uncertain
    ? "This lead timed out before Apps Script confirmed it. Apps Script keeps running after we stop waiting, so it is <strong>probably saved already</strong>."
    : "This lead could not be written to Sheets. Nothing downstream has it.";
  const action = location==='inbox' ? 'Check the private lead-inbox record in Netlify and the Sheet before any manual recovery. Retry only with the original submission ID and unchanged details; do not create a new inquiry to recover this one.' : uncertain
    ? "Search the Sheet for this email first. Only enter it by hand if it is genuinely missing, otherwise you will create a duplicate in the Sheet and HubSpot."
    : "Enter this lead by hand, then send whatever guide the form promised.";

  // Anything the form sent that is not already shown above, so a new field on a
  // new landing page turns up here instead of silently vanishing.
  const shown = new Set([
    "firstName",
    "lastName",
    ...LEAD_FIELDS.map(([k]) => k),
    ...ATTRIBUTION_FIELDS.map(([k]) => k),
  ]);

  const leadRows = LEAD_FIELDS.map(([key, label]) => {
    const value = displayValue(lead[key]);
    if (!value) return "";
    if (key === "email") {
      return row(label, `<a href="mailto:${escapeHtml(value)}" style="color:#517686;">${escapeHtml(value)}</a>`);
    }
    // One tap to call back is the whole point of the alert.
    if (key === "phone") {
      const dial = value.replace(/[^\d+]/g, "");
      return row(label, `<a href="tel:${escapeHtml(dial)}" style="color:#517686;text-decoration:none;">${escapeHtml(value)}</a>`);
    }
    return row(label, escapeHtml(value));
  }).join("");

  const attrRows = ATTRIBUTION_FIELDS.map(([key, label]) => {
    const value = displayValue(lead[key]);
    return value ? row(label, escapeHtml(value)) : "";
  }).join("");

  const otherRows = Object.keys(lead)
    .filter((k) => !shown.has(k))
    .map((k) => {
      const value = displayValue(lead[k]);
      if (!value) return "";
      return row(k, escapeHtml(value.length > 300 ? `${value.slice(0, 300)}…` : value));
    })
    .join("");

  const html =
    `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1">` +
    `<title>${escapeHtml(headline)}</title></head>` +
    `<body style="margin:0;padding:0;background-color:#f5f7f9;">` +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#f5f7f9;">` +
    `<tr><td align="center" style="padding:24px 12px;">` +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:600px;max-width:600px;background-color:#ffffff;border:1px solid #e6ebf0;border-radius:14px;overflow:hidden;">` +

    `<tr><td style="background-color:${accent};padding:18px 28px;font-family:${ALERT_FONT};">` +
    `<div style="font-size:10px;line-height:14px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:#ffffff;">realdarrentsai.com</div>` +
    `<div style="font-size:21px;line-height:27px;font-weight:700;color:#ffffff;padding-top:4px;">${escapeHtml(headline)}</div>` +
    `</td></tr>` +

    `<tr><td style="padding:22px 28px 0 28px;font-family:${ALERT_FONT};font-size:15px;line-height:23px;color:#6b7280;">${explanationHtml}</td></tr>` +

    `<tr><td style="padding:16px 28px 0 28px;">` +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:${accentSoft};border:1px solid ${accentBorder};border-radius:10px;">` +
    `<tr><td style="padding:14px 18px;font-family:${ALERT_FONT};font-size:14px;line-height:21px;color:#223d55;">` +
    `<strong style="color:${accent};">What to do:</strong> ${escapeHtml(action)}` +
    `</td></tr></table></td></tr>` +

    (name || leadRows
      ? `<tr><td style="padding:22px 28px 0 28px;">` +
        `<div style="font-family:${ALERT_FONT};font-size:10px;line-height:14px;font-weight:700;letter-spacing:1.3px;text-transform:uppercase;color:#517686;padding-bottom:6px;">Lead</div>` +
        (name
          ? `<div style="font-family:${ALERT_FONT};font-size:19px;line-height:25px;font-weight:700;color:#223d55;padding-bottom:6px;">${escapeHtml(name)}</div>`
          : "") +
        `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${leadRows}</table>` +
        `</td></tr>`
      : "") +

    section("Attribution", attrRows) +
    section("Other fields", otherRows) +

    `<tr><td style="padding:22px 28px 0 28px;">` +
    `<div style="font-family:${ALERT_FONT};font-size:10px;line-height:14px;font-weight:700;letter-spacing:1.3px;text-transform:uppercase;color:#517686;padding-bottom:6px;">Reason</div>` +
    `<div style="font-family:${ALERT_FONT};font-size:14px;line-height:21px;color:#223d55;">${escapeHtml(reason)}</div>` +
    `</td></tr>` +

    `<tr><td style="padding:20px 28px 28px 28px;">` +
    `<div style="font-family:${ALERT_FONT};font-size:10px;line-height:14px;font-weight:700;letter-spacing:1.3px;text-transform:uppercase;color:#6b7280;padding-bottom:6px;">` +
    `Raw submission${parsedOk ? "" : " (could not be parsed)"}</div>` +
    `<div style="background-color:#f5f7f9;border:1px solid #e6ebf0;border-radius:8px;padding:14px 16px;font-family:Menlo,Consolas,monospace;font-size:11px;line-height:17px;color:#6b7280;word-break:break-all;white-space:pre-wrap;">${escapeHtml(rawShown)}</div>` +
    `</td></tr>` +

    `</table></td></tr></table></body></html>`;

  const text =
    `${headline.toUpperCase()}\n\n` +
    (location==='inbox' ? 'The website could not confirm its durable inbox receipt. Check the private website inbox and the Sheet before any manual recovery. It may already be saved. Preserve the original request ID and payload.\n' : uncertain
      ? "A lead submitted on realdarrentsai.com timed out before Apps Script confirmed it.\n" +
        "It is probably saved: check the Sheet for this email before entering it by hand, to avoid a duplicate.\n"
      : "A lead submitted on realdarrentsai.com could not be written to Sheets.\n") +
    (name ? `\nName:  ${name}` : "") +
    (email ? `\nEmail: ${email}` : "") +
    (phone ? `\nPhone: ${phone}` : "") +
    `\n\nReason: ${reason}\n\nRaw submission:\n${rawShown}\n`;

  return { subject, html, text };
}

/**
 * Last line of defence: if the lead could not be stored anywhere, mail it to
 * Max so it is still recoverable by hand. Never throws — a failure here must
 * not mask the original failure we are reporting.
 */
// A timeout is not a failed write: Apps Script keeps running after we stop
// waiting, so the lead has very likely been saved. Saying "NOT SAVED" there sent
// the operator a false alarm and invited a duplicate hand-entry.
async function rescueEmail(reason: string, payload: string, uncertain = false, location:'sheet'|'inbox'='sheet') {
  const resendKey = Netlify.env.get("RESEND_API_KEY");
  if (!resendKey) {
    console.error("no RESEND_API_KEY, lead could not be rescued", reason);
    return;
  }
  const { subject, html, text } = buildRescueEmail(reason, payload, uncertain,location);
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ from: FROM, to: ALERT_TO, subject, html, text }),
    });
  } catch (err) {
    console.error("rescue email failed", err);
  }
}

export default async (req: Request, context: Context) => {
  if (req.method !== "POST") return jsonResponse(405, { error: "POST only" });
  if (!originAllowed(req)) return jsonResponse(403, { error: "forbidden" });

  // Rate limiting and validation share the capture deadline rather than adding
  // their own wait ahead of the upstream timeout.
  const startedAt = Date.now();
  if (!(await withinRateLimit(context?.ip))) {
    console.warn("lead: rate limited");
    return jsonResponse(429, { ok: false, error: "rate limited", field: "rate", message: RATE_LIMIT_MESSAGE });
  }

  // The body is read before the config check on purpose. Both of the checks
  // below refuse a lead that a real visitor submitted, and refusing it silently
  // is the worst outcome in this codebase: the forms tell the visitor their
  // details reached Darren and that there is no need to submit again. That is
  // only true if something actually carries the lead out, so both paths now send
  // the rescue email, and the rescue needs the body in hand to do it.
  let raw: string;
  try {
    raw = await req.text();
  } catch {
    // Nothing was read, so there is nothing to rescue. A real form cannot reach
    // this: it would mean the request stream itself failed.
    return jsonResponse(400, { error: "unreadable body" });
  }

  if (raw.length > 100_000) {
    await rescueEmail(`Payload too large (${raw.length} characters); not forwarded`, raw);
    return jsonResponse(413, { error: "payload too large" });
  }

  // Accepts both spellings. The canonical name is APPS_SCRIPT_WEBHOOK_URL
  // (Google's product is "Apps Script"), but APP_SCRIPT_WEBHOOK_URL is what is
  // currently set in Netlify. Reading both means a rename in either direction
  // cannot take every form on the site down, which is worth more than
  // insisting on one spelling.
  const upstream =
    Netlify.env.get("APPS_SCRIPT_WEBHOOK_URL") ?? Netlify.env.get("APP_SCRIPT_WEBHOOK_URL");
  if (!upstream) {
    console.error(
      "Neither APPS_SCRIPT_WEBHOOK_URL nor APP_SCRIPT_WEBHOOK_URL is set; leads cannot be forwarded",
    );
    // The one failure that takes every form on the site down at once, and the
    // one where nothing downstream has the lead at all. Without this the whole
    // site can lose every lead it receives with nobody told.
    await rescueEmail(
      "Lead endpoint not configured: neither APPS_SCRIPT_WEBHOOK_URL nor APP_SCRIPT_WEBHOOK_URL is set",
      raw,
    );
    return jsonResponse(500, { error: "lead endpoint not configured" });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(raw);
  } catch {
    return jsonResponse(400, { error: "invalid json body" });
  }

  // Old open tabs omit an ID. New clients keep one UUID and the exact body
  // across uncertain retries; reject malformed explicit IDs before any write.
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return jsonResponse(400, { ok: false, receipt: 'rejected', error: 'invalid payload' });
  const submissionId = payload.submissionId;
  if (submissionId !== undefined && (typeof submissionId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(submissionId))) {
    return jsonResponse(422, { ok: false, receipt: 'rejected', field: 'submissionId', code: 'invalid_submission_id', message: 'Please start a new request before sending.' });
  }
  const uncertain = (error: string) => jsonResponse(502, { ok: false, receipt: 'uncertain', ...(submissionId ? { submissionId } : {}), error });
  // The namespace is reserved for the upgraded shared client runtime. Historical
  // IDs retain their Sheet replay/conflict checks instead of being acknowledged
  // in a new inbox before their pre-existing Sheet snapshot can be compared.
  const inboxAdmission=typeof submissionId==='string' && submissionId.startsWith('inbox1-');

  // Never let truthy strings (including "false") become permission to text.
  // Keep older clients' absent fields absent; invalid evidence must not lose a lead.
  normalizeSmsConsent(payload);

  // A visitor cannot choose their processing lane. Only a complete, explicitly
  // acknowledged booking inquiry may use the new Sheet-only path. Other forms
  // keep their existing state gate; existing investment coverage is unchanged.
  delete payload.captureDisposition;
  delete payload.disposition;
  let sheetOnly = false;
  if (payload.formId === BOOKING_PREQUAL_FORM && payload.message !== undefined && (typeof payload.message !== 'string' || payload.message.length > INQUIRY_MESSAGE_LIMIT)) {
    return jsonResponse(422, { field: 'message', message: 'Please keep your message to 2,000 characters or fewer.' });
  }

  const captureInquiry = isCaptureInquiry(payload.formId, payload.source);
  if (isCaptureForm(payload.formId) || (inboxAdmission && payload.formId===BOOKING_PREQUAL_FORM)) {
    // Modern booking admission must validate contact/privacy before it can
    // acknowledge the inbox. The old proxy relied on the browser for supported
    // booking consent, which is insufficient once calendar access is immediate.
    if (isCaptureForm(payload.formId) && !captureInquiry) return jsonResponse(422, { field: 'source', message: 'Please refresh this form before sending.' });
    if (!submissionId || typeof payload.firstName !== 'string' || !payload.firstName.trim() ||
      (payload.lastName!==undefined && typeof payload.lastName!=='string') ||
      ((isEquityForm(payload.formId) || payload.formId===BOOKING_PREQUAL_FORM) && (typeof payload.lastName !== 'string' || !payload.lastName.trim())) ||
      typeof payload.email !== 'string' || !isEmailFormat(payload.email) || !isUsPhone(payload.phone)) {
      return jsonResponse(422, { field: 'contact', message: 'Please complete your full name, email and phone.' });
    }
    if (payload.message !== undefined && (typeof payload.message !== 'string' || payload.message.length > INQUIRY_MESSAGE_LIMIT)) {
      return jsonResponse(422, { field: 'message', message: 'Please keep your message to 2,000 characters or fewer.' });
    }
    if (payload.privacyAcknowledged !== true || typeof payload.privacyVersion !== 'string' || !payload.privacyVersion.trim()) {
      return jsonResponse(422, { field: 'privacyAcknowledged', message: 'Please acknowledge the Privacy Policy and Terms to continue.' });
    }
  }

  // Rollout switch supports old open tabs until the new fields are deployed.
  // Once enabled, omission cannot bypass screening. Never trust a client result.
  if (payload.formId !== BOOKING_PREQUAL_FORM && !captureInquiry && (payload.serviceAreaVersion || Netlify.env.get('SERVICE_AREA_REQUIRED') === 'true')) {
    // /book/'s goal decides the rule there (policy v3); other forms send none.
    const goal = payload.formId === BOOKING_PREQUAL_FORM ? payload.bookingGoal : undefined;
    const result = serviceArea(payload.propertyUse, payload.propertyState, String(payload.source || payload.formId || ''), goal);
    if (result !== 'supported') return jsonResponse(422, { field: 'propertyState', message: result === 'incomplete' ? 'Please choose the property use and state.' : OUT_OF_MARKET_MESSAGE });
    payload.propertyState = String(payload.propertyState).trim().toUpperCase();
    payload.serviceAreaResult = result;
    payload.serviceAreaVersion = SERVICE_AREA_VERSION;
  }

  // The booking prequal (public/booking-chooser.js) and /home-equity/ show
  // Darren's calendar only to a lead that passes, so the same rules hold here whatever the
  // rollout switch says: a hand-built post must not book around them.
  // Decided with Darren on 15 Oct 2026.
  if (PREQUAL_FORMS.includes(String(payload.formId)) || captureInquiry) {
    // /book/ must say what the call is for: the goal picks the rule, and an
    // unknown or missing goal is refused rather than defaulted.
    const goal = payload.formId === BOOKING_PREQUAL_FORM ? String(payload.bookingGoal ?? '') : undefined;
    if (goal !== undefined && !Object.prototype.hasOwnProperty.call(BOOKING_GOALS, goal)) {
      return jsonResponse(422, { field: 'prequal', message: 'Please choose what you would like help with.' });
    }
    // Not-sure bookings need context for Darren, even if a client bypasses the
    // first step. Reuse message so the existing Sheet/snapshot route retains it.
    if (goal === 'not-sure' && (typeof payload.message !== 'string' || !payload.message.trim() || payload.message.trim().length > 2000)) {
      return jsonResponse(422, { field: 'message', message: 'Please explain your situation in a sentence or two (up to 2,000 characters).' });
    }
    if (goal !== undefined) payload.reviewFlag = BOOKING_GOALS[goal].review ? 'Yes' : '';
    const area = serviceArea(payload.propertyUse, payload.propertyState, String(payload.source || ''), goal);
    if (area !== 'supported') {
      // 22 Oct: defer state screening until the visitor deliberately submits
      // after privacy acknowledgement. An unsupported inquiry is retained for
      // state-demand reporting only, never admitted to calendar/CRM delivery.
      // Wrong goal/use combinations and incomplete fields are still invalid.
      if ((!captureInquiry && payload.formId !== BOOKING_PREQUAL_FORM) || area === 'incomplete' || !propertyUses(String(payload.source || ''), goal).includes(String(payload.propertyUse))) {
        return jsonResponse(422, { field: 'propertyState', message: area === 'incomplete' ? 'Please choose the property use and state.' : OUT_OF_MARKET_MESSAGE });
      }
      if (!submissionId || payload.privacyAcknowledged !== true || typeof payload.privacyVersion !== 'string' || !payload.privacyVersion.trim() ||
          typeof payload.firstName !== 'string' || !payload.firstName.trim() ||
          ((payload.formId === BOOKING_PREQUAL_FORM || isEquityForm(payload.formId)) && (typeof payload.lastName !== 'string' || !payload.lastName.trim())) ||
          typeof payload.email !== 'string' || !isEmailFormat(payload.email) || !isUsPhone(payload.phone)) {
        return jsonResponse(422, { field: 'propertyState', message: 'Please complete your name, email, phone and privacy acknowledgement before sending this inquiry.' });
      }
      sheetOnly = true;
      payload.captureDisposition = 'sheet-only';
    }
    // 22 Oct (Max): an outside-area inquiry is recorded even when a knockout
    // fails; it never reaches a calendar or CRM, so the knockout only needs to
    // be a real answer there. Inside the area the knockouts still refuse.
    // Payoff requests have never asked the booking knockout questions. They
    // request a comparison, not calendar admission; preserve that distinction.
    if (PREQUAL_FORMS.includes(String(payload.formId)) && (sheetOnly ? !prequalAnswered(payload) : !prequalPasses(payload))) return jsonResponse(422, { field: 'prequal', message: 'A call is not available for these answers.' });
    payload.propertyState = String(payload.propertyState).trim().toUpperCase();
    if (captureInquiry) payload.state = payload.propertyState;
    payload.serviceAreaResult = area;
    payload.serviceAreaVersion = SERVICE_AREA_VERSION;
    // A page-contact source used to send every booking to generic Leads.
    // Preserve that entry context, but classify only after server screening.
    if (goal !== undefined) {
      payload.entrySource = payload.entrySource || payload.source;
      payload.source = bookingBucket(goal, payload.entrySource);
    }
  }

  // Honeypot: a hidden field no human fills in. Return 200 so bots learn
  // nothing from the response and do not retry with the field removed.
  if (typeof payload.company === "string" && payload.company.trim() !== "") {
    return jsonResponse(200, { ok: true });
  }

  if (!payload.email && !payload.phone) {
    return jsonResponse(400, { error: "email or phone required" });
  }

  // Format checks (16 Oct 2026), the same rules every form applies before it
  // posts, so only a stale or hand-built request meets them: an email with a
  // dot and two or more letters after the @, and a US number (NANP: 10 digits
  // once a leading 1 is dropped, area code and exchange 2-9 and not N11).
  // Refused before anything is saved or emailed, with a message the forms
  // show beside the field.
  if (typeof payload.email === "string" && payload.email.trim() !== "" && !isEmailFormat(payload.email)) {
    return jsonResponse(422, { ok: false, error: "invalid email", field: "email", message: "Please enter a valid email address." });
  }
  if (payload.phone !== undefined && payload.phone !== null && String(payload.phone).trim() !== "" && !isUsPhone(payload.phone)) {
    return jsonResponse(422, { ok: false, error: "invalid phone", field: "phone", message: "Please enter a valid US phone number." });
  }

  // The visitor is still on the page at this point, so a dead email domain can
  // still be fixed by the person who typed it. One step later the lead is
  // stored, the response has been sent, and there is nobody left to ask.
  const domain = emailDomain(payload.email);
  if (domain && (await domainCannotReceiveMail(domain))) {
    return jsonResponse(422, {
      ok: false,
      error: "email domain unreachable",
      field: "email",
      message:
        `We couldn't find a mail server for "${domain.slice(0, 60)}". ` +
        `Please check your email address and try again.`,
    });
  }

  // Preserve lead fields while adding the verified cookie and server-only
  // authentication. The cookie wins over a visitor-supplied hutk value.
  const hutk = readHutk(req.headers.get("cookie"));
  // The secret is added only on the server hop. Never trust a visitor-supplied
  // copy or include it in the rescue email, which continues to use raw.
  const primaryProxyKey = Netlify.env.get('LEAD_PROXY_KEY') || '';
  const compatibilityProxyKey = Netlify.env.get('CONTACT_CONFIRM_API_KEY') || '';
  const proxyKey = primaryProxyKey.trim() ? primaryProxyKey : compatibilityProxyKey.trim() ? compatibilityProxyKey : '';
  if (!proxyKey) {
    // Fail closed if BOTH configured authentication paths are absent. Leaving
    // the compatibility fallback in place avoids a key-rotation outage; never
    // transmit an unauthenticated lead to a publicly reachable Apps Script URL.
    // A definite configuration rejection is not an unknown save. Do not turn
    // this public endpoint into a per-request email trigger during an outage.
    console.error('Lead endpoint authentication is not configured; not forwarded');
    return jsonResponse(503, { ok: false, receipt: 'rejected', ...(submissionId ? { submissionId } : {}), code: 'proxy_auth_not_configured', error: 'lead endpoint authentication is not configured' });
  }
  delete payload._proxyKey;
  // Expand-first rollout: deploy the capable writer first; publish this handler,
  // scheduled drain and namespaced client together. Older IDs keep their path.
  // Screening above owns calendar permission; a durable inbox acknowledgement
  // is now the confirmed save point approved by Max, not a claim of CRM delivery.
  if(inboxAdmission) {
    try {
      const admitted=await admitLead({...payload,...(hutk?{hutk}:{})},sheetOnly,
        AbortSignal.timeout(Math.max(1,Math.min(8000,UPSTREAM_TIMEOUT_MS-(Date.now()-startedAt)))));
      if(admitted.conflict) return jsonResponse(409,{ok:false,receipt:'rejected',submissionId,code:'submission_conflict',field:'submissionId',message:'This request ID is already saved with different details. Please start a new request.'});
      return jsonResponse(200,{ok:true,receipt:'saved',storage:'inbox',submissionId,replayed:admitted.replayed,...(sheetOnly?{disposition:'sheet-only'}:{})});
    } catch {
      await rescueEmail('The durable website inbox could not confirm this request',raw,true,'inbox');
      return uncertain('inbox confirmation unavailable');
    }
  }
  const forwarded = JSON.stringify({ ...payload, ...(hutk ? { hutk } : {}),
    ...(proxyKey ? { _proxyKey: proxyKey } : {}) });

  // DNS and rate limiting eat into the same 25s capture budget. Keep the
  // remaining hosting headroom available for a genuine-failure rescue email.
  const timer = AbortSignal.timeout(
    Math.max(1, UPSTREAM_TIMEOUT_MS - (Date.now() - startedAt)),
  );
  try {
    // A busy admission explicitly means Apps Script has NOT written anything.
    // Retry only that answer, with this frozen body and original deadline. An
    // unknown save, bad receipt or network failure must never be auto-replayed.
    // Jitter separates a burst's contenders; the attempt cap and 3s reserve
    // prevent retries from extending the 25s confirmation budget indefinitely.
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(upstream, {
        method: "POST",
        // Apps Script reads e.postData.contents regardless of type, and text/plain
        // avoids a preflight on the server hop.
        headers: { "content-type": "text/plain;charset=utf-8" },
        body: forwarded,
        redirect: "follow", // server-side there is no CORS, so the 302 is just followed
        signal: timer,
      });

      const text = await res.text();

      if (!res.ok) {
        await rescueEmail(`Apps Script returned HTTP ${res.status}`, raw);
        return uncertain('upstream error');
      }

      // Apps Script answers 200 with {success:false, error} when it caught an
      // exception internally, so a 2xx alone is not proof the lead was stored.
      let parsed: { success?: boolean; error?: string; code?: string; field?: string; message?: string; submissionId?: string; receipt?: string; replayed?: boolean; disposition?: string } = {};
      try {
        parsed = JSON.parse(text);
      } catch {
        await rescueEmail(`Apps Script returned unparseable body: ${text.slice(0, 500)}`, raw);
        return uncertain('upstream error');
      }

      if (parsed.success !== true) {
        if (parsed.code === 'proxy_auth_not_configured') {
          console.error('Apps Script authentication is not configured; request rejected');
          return jsonResponse(503, {ok:false,receipt:'rejected',...(submissionId ? {submissionId}:{}),code:'proxy_auth_not_configured',error:'lead endpoint authentication is not configured'});
        }
        if (parsed.code === 'submission_conflict') return jsonResponse(409, { ok: false, receipt: 'rejected', submissionId, code: parsed.code, field: 'submissionId', message: 'This request ID is already saved with different details. Please start a new request.' });
        if (parsed.code === 'invalid_submission_id') return jsonResponse(422, { ok: false, receipt: 'rejected', submissionId, code: parsed.code, field: 'submissionId', message: 'Please start a new request before sending.' });
        if (parsed.code === 'capture_busy') {
          const delay = Math.min(1200, 150 * 2 ** attempt) + Math.floor(Math.random() * 300);
          if (submissionId && attempt < 11 && !timer.aborted &&
            UPSTREAM_TIMEOUT_MS - (Date.now() - startedAt) > delay + 3000) {
            // Abort during backoff is still a known no-write refusal, not a lost
            // lead requiring a rescue alert. Remove the listener after each wait.
            await new Promise<void>(resolve => {
              const finish = () => { clearTimeout(wait); timer.removeEventListener('abort', finish); resolve(); };
              const wait = setTimeout(finish, delay);
              timer.addEventListener('abort', finish, { once: true });
              if (timer.aborted) finish();
            });
            if (!timer.aborted) continue;
          }
          return jsonResponse(503, { ok: false, receipt: 'uncertain', submissionId, code: parsed.code, message: 'The save service is busy. Please retry here with the same details.' });
        }
        await rescueEmail(`Apps Script reported failure: ${parsed.error ?? "unknown"}`, raw);
        return uncertain('upstream error');
      }

      if (submissionId && (parsed.submissionId !== submissionId || parsed.receipt !== 'saved')) {
        await rescueEmail('Apps Script did not confirm this submission identity', raw, true);
        return uncertain('receipt mismatch');
      }
      // A confirmed write alone cannot tell the UI which next step is allowed.
      // During a staged rollout an older writer might save AND enqueue the new
      // inquiry, so require the independent writer's Sheet-only acknowledgement.
      if ((sheetOnly && parsed.disposition !== 'sheet-only') || (!sheetOnly && parsed.disposition === 'sheet-only')) {
        await rescueEmail('Apps Script did not confirm the expected inquiry disposition', raw, true);
        return uncertain('receipt disposition mismatch');
      }
      return jsonResponse(200, { ok: true, receipt: 'saved', ...(sheetOnly ? { disposition: 'sheet-only' } : {}), ...(parsed.submissionId || submissionId ? { submissionId: parsed.submissionId || submissionId } : {}), replayed: parsed.replayed === true });
    }
  } catch (err) {
    const name = (err as { name?: string } | null)?.name;
    const timedOut = timer.aborted || name === "TimeoutError" || name === "AbortError";
    const reason = timedOut
      ? `Timed out after ${UPSTREAM_TIMEOUT_MS}ms`
      : `Request failed: ${String(err)}`;
    await rescueEmail(reason, raw, timedOut);
    return uncertain('upstream unreachable');
  }
};

export const config: Config = {
  path: "/api/lead",
};
