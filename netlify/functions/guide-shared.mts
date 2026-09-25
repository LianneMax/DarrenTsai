// Shared by the three magnet senders: send-dscr-guide, send-fha-guide and
// send-rei-guide.
//
// WHY THIS EXISTS. All three are called the same way, by the same caller, with
// the same contract: processFollowUps() in google-apps-script.js POSTs the lead
// with an x-api-key header, and reads the status to decide whether to retry.
// Everything except the subject line, the attachment and the env var holding
// the key was identical in all three files, down to the character — the same
// eight guards in the same order, the same Resend call, the same retryable-vs-
// permanent status mapping.
//
// Kept as three copies, that shape had already cost something: the FHA sender
// computed `firstName` and never interpolated it, so it was the only one of the
// three that greeted nobody. A fix applied to one copy is not a fix. The status
// mapping below is the part that must never drift, because Apps Script's retry
// backoff is driven entirely by it: a 503 is retried at 1, 5, 20, 60 and 180
// minutes, a 422 is never retried, and getting that backwards either loses the
// guide silently or mails the same lead five times.

import type { Context } from "@netlify/functions";

export const FROM = "Darren Tsai <darren@realdarrentsai.com>";

export function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** What Resend accepts in `attachments`: a filename and base64 content. */
type Attachment = { filename: string; content: string };

export type GuideSpec = {
  /** Only used to label the error log, so a 500 can be traced to a sender. */
  name: string;
  /** Netlify env var holding this endpoint's shared secret. */
  apiKeyEnv: string;
  subject: string;
  buildEmailHtml: (lead: Record<string, string>) => string;
  /**
   * Built inside the try, so a failed template fetch or a pdf-lib error lands
   * in the same 500 it always did rather than escaping the handler.
   */
  buildAttachments: (lead: Record<string, string>) => Promise<Attachment[]>;
};

/**
 * Fetch a published magnet once and hold the bytes across warm invocations.
 *
 * The static senders (FHA, REI) each had their own copy of this. The cache is
 * per-instance and deliberately unbounded in time: these files only change when
 * a new one is published, and a cold start re-fetches anyway.
 */
export function cachedBytes(url: string, label: string) {
  let bytes: ArrayBuffer | null = null;
  return async () => {
    if (!bytes) {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${label} fetch failed: ${res.status}`);
      bytes = await res.arrayBuffer();
    }
    return bytes;
  };
}

export const toBase64 = (bytes: ArrayBuffer) => Buffer.from(bytes).toString("base64");

/**
 * Build the handler for one magnet sender.
 *
 * The guard order is load-bearing and unchanged: method, then key, then Resend
 * config, then body, then email. Checking the key before parsing the body is
 * what keeps an unauthenticated caller from reaching any parsing at all.
 */
export function guideSender(spec: GuideSpec) {
  return async (req: Request, _context: Context) => {
    if (req.method !== "POST") return jsonResponse(405, { error: "POST only" });

    const apiKey = req.headers.get("x-api-key");
    if (!apiKey || apiKey !== Netlify.env.get(spec.apiKeyEnv)) {
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
      const attachments = await spec.buildAttachments(lead);

      const emailRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          from: FROM,
          to: [lead.email],
          subject: spec.subject,
          html: spec.buildEmailHtml(lead),
          attachments,
        }),
      });

      if (!emailRes.ok) {
        const detail = await emailRes.text();
        console.error("resend send failed", emailRes.status, detail);
        // Tell the caller whether trying again can help. 429 and 5xx are Resend
        // being busy or down; anything else (422 invalid address, 403 unverified
        // domain) fails identically on every retry, so it must not be retried.
        const retryable = emailRes.status === 429 || emailRes.status >= 500;
        return jsonResponse(retryable ? 503 : 422, {
          error: retryable ? "email send failed" : "email rejected",
          resendStatus: emailRes.status,
          detail: detail.slice(0, 300),
        });
      }

      return jsonResponse(200, { success: true });
    } catch (err) {
      console.error(`${spec.name} error`, err);
      return jsonResponse(500, { error: String(err) });
    }
  };
}
