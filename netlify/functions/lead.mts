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

const FROM = "Darren Tsai <darren@realdarrentsai.com>";
const ALERT_TO = "darren@realdarrentsai.com";

// Apps Script cold starts run 3-5s; Netlify synchronous functions are capped at
// 10s. 8s leaves room to still send the rescue email before we're killed.
const UPSTREAM_TIMEOUT_MS = 8000;

const ALLOWED_HOSTS = ["realdarrentsai.com", "www.realdarrentsai.com"];

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
async function rescueEmail(reason: string, payload: string) {
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
        subject: "LEAD NOT SAVED — recover this by hand",
        text:
          `A lead submitted on realdarrentsai.com could not be written to Sheets or Bonzo.\n\n` +
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

  const timer = AbortSignal.timeout(UPSTREAM_TIMEOUT_MS);
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
    const reason = timer.aborted
      ? `Timed out after ${UPSTREAM_TIMEOUT_MS}ms`
      : `Request failed: ${String(err)}`;
    await rescueEmail(reason, raw);
    return jsonResponse(502, { ok: false, error: "upstream unreachable" });
  }
};

export const config: Config = {
  path: "/api/lead",
};
