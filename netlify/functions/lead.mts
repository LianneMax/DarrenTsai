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
import { Resolver } from "node:dns/promises";

const FROM = "Darren Tsai <darren@realdarrentsai.com>";
const ALERT_TO = "darren@realdarrentsai.com";

// Netlify synchronous functions are killed at 10s, and the rescue email below
// needs roughly 300ms, so this is the most we can wait and still report.
//
// Measured against production on 17 Sep, after the slow work moved to the
// follow-up queue: 3.7-3.9s warm, 6.2s cold. 8s left barely a second of margin
// on a cold start, and this site is cold often. Exceeding it is no longer
// harmful (the lead still saves and the alert says STATUS UNKNOWN), but it
// still shows the visitor an error for a lead that worked, so it is worth
// avoiding.
const UPSTREAM_TIMEOUT_MS = 9000;

const ALLOWED_HOSTS = ["realdarrentsai.com", "www.realdarrentsai.com"];

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
    return ALLOWED_HOSTS.includes(host) || host.endsWith(".netlify.app");
  } catch {
    return false;
  }
}

/**
 * Last line of defence: if the lead could not be stored anywhere, mail it to
 * Darren so it is still recoverable by hand. Never throws — a failure here must
 * not mask the original failure we are reporting.
 */
// A timeout is not a failed write: Apps Script keeps running after we stop
// waiting, so the lead has very likely been saved. Saying "NOT SAVED" there sent
// Darren a false alarm and invited a duplicate hand-entry.
async function rescueEmail(reason: string, payload: string, uncertain = false) {
  const resendKey = Netlify.env.get("RESEND_API_KEY");
  if (!resendKey) {
    console.error("no RESEND_API_KEY, lead could not be rescued", reason);
    return;
  }
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: FROM,
        to: [ALERT_TO],
        subject: uncertain
          ? "LEAD STATUS UNKNOWN — check the Sheet before re-entering"
          : "LEAD NOT SAVED — recover this by hand",
        text: uncertain
          ? `A lead submitted on realdarrentsai.com timed out before Apps Script confirmed it.\n` +
            `It is probably saved: check the Sheet for this email before entering it by hand, to avoid a duplicate.\n\n` +
            `Reason: ${reason}\n\nRaw submission:\n${payload}\n`
          : `A lead submitted on realdarrentsai.com could not be written to Sheets or Bonzo.\n\n` +
            `Reason: ${reason}\n\nRaw submission:\n${payload}\n`,
      }),
    });
  } catch (err) {
    console.error("rescue email failed", err);
  }
}

export default async (req: Request, _context: Context) => {
  if (req.method !== "POST") return jsonResponse(405, { error: "POST only" });
  if (!originAllowed(req)) return jsonResponse(403, { error: "forbidden" });

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
    return jsonResponse(500, { error: "lead endpoint not configured" });
  }

  let raw: string;
  try {
    raw = await req.text();
  } catch {
    return jsonResponse(400, { error: "unreadable body" });
  }
  if (raw.length > 100_000) return jsonResponse(413, { error: "payload too large" });

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(raw);
  } catch {
    return jsonResponse(400, { error: "invalid json body" });
  }

  // Honeypot: a hidden field no human fills in. Return 200 so bots learn
  // nothing from the response and do not retry with the field removed.
  if (typeof payload.company === "string" && payload.company.trim() !== "") {
    return jsonResponse(200, { ok: true });
  }

  if (!payload.email && !payload.phone) {
    return jsonResponse(400, { error: "email or phone required" });
  }

  // The visitor is still on the page at this point, so a dead email domain can
  // still be fixed by the person who typed it. One step later the lead is
  // stored, the response has been sent, and there is nobody left to ask.
  const startedAt = Date.now();
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

  // The DNS check eats into the same budget: Netlify kills the function at 10s
  // and the rescue email still needs its ~300ms at the end.
  const timer = AbortSignal.timeout(
    Math.max(1000, UPSTREAM_TIMEOUT_MS - (Date.now() - startedAt)),
  );
  try {
    const res = await fetch(upstream, {
      method: "POST",
      // Apps Script reads e.postData.contents regardless of type, and text/plain
      // avoids a preflight on the server hop.
      headers: { "content-type": "text/plain;charset=utf-8" },
      body: raw,
      redirect: "follow", // server-side there is no CORS, so the 302 is just followed
      signal: timer,
    });

    const text = await res.text();

    if (!res.ok) {
      await rescueEmail(`Apps Script returned HTTP ${res.status}`, raw);
      return jsonResponse(502, { ok: false, error: "upstream error" });
    }

    // Apps Script answers 200 with {success:false, error} when it caught an
    // exception internally, so a 2xx alone is not proof the lead was stored.
    let parsed: { success?: boolean; error?: string } = {};
    try {
      parsed = JSON.parse(text);
    } catch {
      await rescueEmail(`Apps Script returned unparseable body: ${text.slice(0, 500)}`, raw);
      return jsonResponse(502, { ok: false, error: "upstream error" });
    }

    if (parsed.success !== true) {
      await rescueEmail(`Apps Script reported failure: ${parsed.error ?? "unknown"}`, raw);
      return jsonResponse(502, { ok: false, error: "upstream error" });
    }

    return jsonResponse(200, { ok: true });
  } catch (err) {
    const name = (err as { name?: string } | null)?.name;
    const timedOut = timer.aborted || name === "TimeoutError" || name === "AbortError";
    const reason = timedOut
      ? `Timed out after ${UPSTREAM_TIMEOUT_MS}ms`
      : `Request failed: ${String(err)}`;
    await rescueEmail(reason, raw, timedOut);
    return jsonResponse(502, { ok: false, error: "upstream unreachable" });
  }
};

export const config: Config = {
  path: "/api/lead",
};
