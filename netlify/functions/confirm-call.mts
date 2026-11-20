// Netlify Function: confirm-call
//
// Where the reminder's Confirm my call button lands (see
// netlify/lib/call-confirm.mts for the plan and the signed link).
//
// GET  /api/confirm-call?b=&s=&t=   the page. It confirms with a same-origin
//      POST from a small script, so a mail scanner that only fetches the link
//      does not confirm on the lead's behalf. Without scripts, a button posts
//      the same form.
// POST /api/confirm-call?b=&s=&t=   records { bookingId, start, confirmedAt }
//      in the call-confirmations store (first confirmation wins).
// GET  /api/confirm-call?status=1&b=ID with x-api-key = CONTACT_CONFIRM_API_KEY
//      tells the Apps Script whether the lead confirmed, so the unconfirmed
//      check only gives Darren a task when they did not.

import type { Config, Context } from "@netlify/functions";
import { randomBytes } from "node:crypto";
import { escapeHtml, jsonResponse } from "../lib/guide-shared.mts";
import { guardKey } from "../lib/key-guard.mts";
import { PHONE_DISPLAY, PHONE_HREF } from "../lib/email-layout.mts";
import { BOOKING_ID, PACIFIC, RESCHEDULE_URL, SITE, callWhen, confirmations, verifyBooking, type Confirmation } from "../lib/call-confirm.mts";

type State = "confirming" | "confirmed" | "invalid" | "passed" | "failed";

/** A call that started more than two hours ago can no longer be confirmed. */
const PASSED_MS = 2 * 3600_000;

function page(state: State, start: number, nonce: string) {
  const when = Number.isFinite(start) && state !== "invalid" ? escapeHtml(callWhen(start, PACIFIC)) : "";
  const reschedule = `<p class="small">Need a different time? Cancel from Google's confirmation email, then <a href="${escapeHtml(RESCHEDULE_URL)}">pick a new time</a>.</p>`;
  const call = `<p class="small">Questions? Reply to my email or call me at <a href="${PHONE_HREF}">${PHONE_DISPLAY}</a>.</p>`;
  const body: Record<State, string> = {
    confirming: `
      <div id="confirming">
        <h1>Confirming your call&hellip;</h1>
        <p>One second.</p>
        <noscript><form method="post"><button type="submit" class="button">Confirm my call</button></form></noscript>
      </div>
      <div id="done" hidden>
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="10" stroke="#177f94" stroke-width="2"/><path d="M7.5 12.5l3 3 6-6.5" stroke="#177f94" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        <h1>You're confirmed</h1>
        <p>Thanks! See you ${when} Pacific<span id="local"></span>. The Google Meet link is in Google's calendar invite.</p>
        ${reschedule}
      </div>
      <div id="oops" hidden>
        <h1>That didn't go through</h1>
        <p>Something went wrong on my end. <a href="">Try again</a>, or just reply to my email to confirm.</p>
      </div>`,
    confirmed: `
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="10" stroke="#177f94" stroke-width="2"/><path d="M7.5 12.5l3 3 6-6.5" stroke="#177f94" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      <h1>You're confirmed</h1>
      <p>Thanks! See you ${when} Pacific<span id="local"></span>. The Google Meet link is in Google's calendar invite.</p>
      ${reschedule}`,
    invalid: `
      <h1>This link doesn't look right</h1>
      <p>It may have been cut off when it was copied. Open the button in my email again, or just reply to that email to confirm.</p>`,
    passed: `
      <h1>This call time has passed</h1>
      <p>If we missed each other, no problem. <a href="${escapeHtml(RESCHEDULE_URL)}">Pick a new time</a> and we'll go over your scenario.</p>`,
    failed: `
      <h1>That didn't go through</h1>
      <p>Something went wrong on my end. <a href="">Try again</a>, or just reply to my email to confirm.</p>`,
  };
  const script = state === "confirming" || state === "confirmed" ? `
<script nonce="${nonce}">
(function () {
  var start = ${Number.isFinite(start) ? start : "NaN"};
  try {
    var zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (zone && zone !== "${PACIFIC}" && isFinite(start)) {
      var t = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(start));
      var p = new Intl.DateTimeFormat("en-US", { timeZone: "${PACIFIC}", hour: "numeric", minute: "2-digit" }).format(new Date(start));
      if (t !== p) document.querySelectorAll("#local").forEach(function (el) { el.textContent = " (" + t + " your time)"; });
    }
  } catch (e) {}
  if (!document.getElementById("confirming")) return;
  fetch(location.href, { method: "POST", headers: { accept: "application/json" }, credentials: "same-origin" })
    .then(function (r) { if (!r.ok) throw new Error(String(r.status)); })
    .then(function () { document.getElementById("confirming").hidden = true; document.getElementById("done").hidden = false; })
    .catch(function () { document.getElementById("confirming").hidden = true; document.getElementById("oops").hidden = false; });
})();
</script>` : "";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${state === "invalid" ? "Link problem" : "Your call with Darren Tsai"}</title>
<style>
@font-face{font-family:Outfit;font-style:normal;font-weight:400 800;src:url(/fonts/outfit-v15-latin.woff2) format("woff2");}
*{box-sizing:border-box}
body{margin:0;background:#f4f2ee;color:#4b5563;font-family:Outfit,system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;font-size:16px;line-height:26px}
header{background:#fff;border-bottom:1px solid #e6ebf0;padding:14px 20px;display:flex;align-items:center;gap:12px}
header img{width:40px;height:40px;border-radius:20px}
header b{display:block;color:#223d55;font-weight:600;line-height:20px}
header span{font-size:13px;line-height:18px;color:#6b7280}
main{max-width:520px;margin:40px auto;padding:0 16px}
.card{background:#fff;border:1px solid #e6ebf0;border-radius:20px;padding:32px 28px}
h1{margin:12px 0 8px;color:#223d55;font-size:28px;line-height:34px;font-weight:700;letter-spacing:-0.02em}
p{margin:0 0 12px}
.small{font-size:14px;line-height:22px;color:#6b7280}
a{color:#517686}
.button{display:inline-block;margin-top:8px;background:#177f94;color:#fff;border:0;border-radius:10px;padding:14px 28px;font-family:inherit;font-weight:600;font-size:16px;line-height:20px;cursor:pointer;text-decoration:none}
.back{display:inline-block;margin-top:16px;border:1px solid #177f94;color:#177f94;border-radius:10px;padding:11px 22px;font-weight:600;text-decoration:none}
footer{max-width:520px;margin:0 auto 40px;padding:0 16px;font-size:11px;line-height:17px;color:#6b7280;text-align:center}
</style>
</head>
<body>
<header><img src="/darren.jpg" alt="" width="40" height="40"><div><b>Darren Tsai</b><span>Senior Loan Officer, Saxton Mortgage</span></div></header>
<main><div class="card">
${body[state]}
${call}
<a class="back" href="${SITE}/">Back to realdarrentsai.com</a>
</div></main>
<footer>Darren Tsai, DRE #02103705 | NMLS #2438102. Saxton Mortgage, LLC | NMLS #1717191. Equal Housing Opportunity.</footer>${script}
</body>
</html>`;
}

function html(state: State, start: number, status = 200) {
  const nonce = randomBytes(16).toString("base64");
  return new Response(page(state, start, nonce), {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-robots-tag": "noindex, nofollow",
      "referrer-policy": "no-referrer",
      "content-security-policy": `default-src 'none'; style-src 'unsafe-inline'; font-src 'self'; img-src 'self'; script-src 'nonce-${nonce}'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'`,
    },
  });
}

export default async (req: Request, context: Context) => {
  const url = new URL(req.url);
  const q = url.searchParams;

  // The Apps Script's status read.
  if (req.method === "GET" && q.get("status") === "1") {
    const refused = await guardKey(req, context?.ip, Netlify.env.get("CONTACT_CONFIRM_API_KEY"), jsonResponse);
    if (refused) return refused;
    const bookingId = q.get("b") || "";
    if (!BOOKING_ID.test(bookingId)) return jsonResponse(400, { error: "invalid booking id" });
    const record = (await confirmations().get(bookingId, { type: "json" })) as Confirmation | null;
    return jsonResponse(200, { bookingId, confirmed: Boolean(record), confirmedAt: record?.confirmedAt || null });
  }

  if (req.method !== "GET" && req.method !== "POST") return jsonResponse(405, { error: "GET or POST only" });

  const bookingId = q.get("b") || "";
  const start = Number(q.get("s"));
  const wantsJson = (req.headers.get("accept") || "").includes("application/json");
  let valid = false;
  try {
    valid = verifyBooking(bookingId, start, q.get("t") || "");
  } catch (err) {
    console.error("confirm-call signing unavailable", err);
    return req.method === "POST" && wantsJson ? jsonResponse(503, { error: "unavailable" }) : html("failed", start, 503);
  }
  if (!valid) return req.method === "POST" && wantsJson ? jsonResponse(400, { error: "invalid link" }) : html("invalid", NaN, 400);
  if (Date.now() - start > PASSED_MS) return req.method === "POST" && wantsJson ? jsonResponse(410, { error: "passed" }) : html("passed", start);

  try {
    const store = confirmations();
    if (req.method === "GET") {
      const existing = await store.get(bookingId, { type: "json" });
      return html(existing ? "confirmed" : "confirming", start);
    }
    const record: Confirmation = { bookingId, start, confirmedAt: new Date().toISOString() };
    await store.setJSON(bookingId, record, { onlyIfNew: true });
    const saved = (await store.get(bookingId, { type: "json" })) as Confirmation | null;
    if (!saved) throw new Error("confirmation not persisted");
    return wantsJson ? jsonResponse(200, { confirmed: true, confirmedAt: saved.confirmedAt }) : html("confirmed", start);
  } catch (err) {
    console.error("confirm-call error", err);
    return wantsJson ? jsonResponse(503, { error: "unavailable" }) : html("failed", start, 503);
  }
};

export const config: Config = {
  path: "/api/confirm-call",
};
