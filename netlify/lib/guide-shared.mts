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
import { getStore } from '@netlify/blobs';
import { createHash } from 'node:crypto';
import { isEmailSuppressed, unsubscribeLinkFor } from './email-preferences.mts';

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
  /**
   * A function when the subject depends on the lead. The DSCR sender needs it:
   * an opt-in submitted with an untouched calculator gets the guide with no
   * rate snapshot, so "Your DSCR Rate Snapshot and Guide" would name an
   * attachment that is not there.
   */
  subject: string | ((lead: Record<string, string>) => string);
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

const deliveryStore = () => getStore('email-delivery', { consistency: 'strong' });
const digest = (value: string) => createHash('sha256').update(value).digest('hex');

/** Atomically choose and read back the exact provider JSON, including PDF bytes
 * and unsubscribe link. A renderer/deploy change must not change a retry body.
 * onlyIfNew is an atomic single-key operation, not a read-then-write lock:
 * https://docs.netlify.com/build/data-and-storage/netlify-blobs/#setjson
 * Readback is mandatory even when the SDK reports modified:true. */
async function frozenEmailRequest(key: string, lead: Record<string, string>, build: () => Promise<string>) {
  const store = deliveryStore();
  const identity = digest(key);
  const fingerprint = digest(JSON.stringify(Object.keys(lead).sort().map(name => [name, lead[name]])));
  const seenKey = `seen/${identity}`;
  const seen = { fingerprint, startedAt: lead.deliveryStartedAt };
  await store.setJSON(seenKey, seen, { onlyIfNew: true });
  const original = await store.get(seenKey, { type: 'json' }) as typeof seen | null;
  if (!original) throw new Error('Delivery identity was not persisted');
  if (original.fingerprint !== fingerprint || original.startedAt !== seen.startedAt) throw new Error('Delivery identity conflict');
  const expiresHour = Math.floor(Date.parse(original.startedAt) / 3600_000) + 24;
  const requestKey = `requests/${expiresHour}/${identity}`;
  let request = await store.get(requestKey, { type: 'text' });
  if (!request) {
    await store.set(requestKey, await build(), { onlyIfNew: true });
    request = await store.get(requestKey, { type: 'text' });
  }
  if (!request) throw new Error('Delivery request was not persisted');
  return request;
}

/** Hourly cleanup removes provider payloads after 24–25 hours. Opaque hashes
 * and original attempt time remain as replay tombstones; no address/body/key
 * is retained there. Buckets ensure new traffic cannot starve expired records.
 * Limit one run to 500 deletes/20 seconds, leaving room in the scheduled
 * function's 30-second limit; a backlog is reported for the next run. */
export async function purgeExpiredEmailDeliveries(now = Date.now()) {
  const startedAt = Date.now();
  const outOfTime = () => Date.now() - startedAt >= 20_000;
  const store = deliveryStore();
  const directories = await store.list({ prefix: 'requests/', directories: true });
  let deleted = 0;
  if (outOfTime()) return { deleted, remaining: true };
  for (const directory of directories.directories) {
    const match = /^(?:requests\/)?(\d+)\/?$/.exec(directory);
    if (!match || (Number(match[1]) + 1) * 3600_000 > now) continue;
    const pages = store.list({ prefix: `requests/${match[1]}/`, paginate: true })[Symbol.asyncIterator]();
    while (true) {
      if (outOfTime()) return { deleted, remaining: true };
      const page = await pages.next();
      if (page.done) break;
      for (const blob of page.value.blobs) {
        if (deleted >= 500 || outOfTime()) return { deleted, remaining: true };
        await store.delete(blob.key);
        deleted++;
      }
    }
  }
  return { deleted, remaining: false };
}

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
    if (typeof lead.email !== 'string') return jsonResponse(400, { error: 'invalid email' });

    // Resend retains Idempotency-Key for 24h. Keep a one-hour margin and carry
    // the first attempt time from the durable queue checkpoint; a later retry
    // must never invent a fresh key or reset the window. Different rendered
    // payloads under the same key are rejected by Resend, never sent twice.
    // https://resend.com/docs/dashboard/emails/idempotency-keys
    const deliveryId = typeof lead.submissionId === 'string' ? lead.submissionId : '';
    const started = Date.parse(lead.deliveryStartedAt || '');
    if (deliveryId && (!/^[A-Za-z0-9_-]{1,128}$/.test(deliveryId) || !Number.isFinite(started) ||
      Date.now() - started >= 23 * 60 * 60 * 1000 || started > Date.now() + 60_000)) {
      return jsonResponse(409, { error: 'delivery_uncertain', message: 'Reconcile the original delivery before retrying.' });
    }
    const idempotencyKey = deliveryId ? `${spec.name}/${deliveryId}` : '';
    const reply = (status: number, value: Record<string, unknown>) => jsonResponse(status, {
      ...value, ...(idempotencyKey ? { deliveryProtocol: 'resend-key-v1', submissionId: deliveryId } : {}),
    });
    let sending = false;

    try {
      if (await isEmailSuppressed(lead.email)) return reply(200, { success: true, suppressed: true });
      const build = async () => {
        const unsubscribeUrl = await unsubscribeLinkFor(lead.email);
        const attachments = await spec.buildAttachments(lead);
        return JSON.stringify({
          from: FROM, to: [lead.email],
          subject: typeof spec.subject === "function" ? spec.subject(lead) : spec.subject,
          html: spec.buildEmailHtml(lead).replace('mailto:darren@realdarrentsai.com?subject=Unsubscribe', unsubscribeUrl),
          headers: { 'List-Unsubscribe': `<${unsubscribeUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
          attachments,
        });
      };
      const providerBody = idempotencyKey ? await frozenEmailRequest(idempotencyKey, lead, build) : await build();
      // Check again after any slow PDF work: an opt-out can arrive while the
      // attachment is being built. No automatic resubscribe on a new lead.
      if (await isEmailSuppressed(lead.email)) return reply(200, { success: true, suppressed: true });

      sending = true;
      const emailRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "content-type": "application/json",
          ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
        },
        body: providerBody,
      });

      if (!emailRes.ok) {
        const detail = await emailRes.text();
        console.error("resend send failed", emailRes.status, detail);
        // Tell the caller whether trying again can help. 429 and 5xx are Resend
        // being busy or down; anything else (422 invalid address, 403 unverified
        // domain) fails identically on every retry, so it must not be retried.
        // A matching in-flight key is safe to retry, while a changed payload
        // requires reconciliation. Neither response establishes email delivery.
        if (emailRes.status === 409 && !detail.includes('concurrent_idempotent_requests')) {
          return reply(409, { error: 'delivery_uncertain', message: 'The original delivery needs review.' });
        }
        if (!idempotencyKey && emailRes.status >= 500) {
          return jsonResponse(409, { error: 'delivery_uncertain', message: 'Reconcile delivery before retrying.' });
        }
        const retryable = emailRes.status === 429 || emailRes.status >= 500 ||
          (emailRes.status === 409 && detail.includes('concurrent_idempotent_requests'));
        return reply(retryable ? 503 : 422, {
          error: retryable ? "email send failed" : "email rejected",
          resendStatus: emailRes.status,
          detail: detail.slice(0, 300),
        });
      }

      return reply(200, { success: true });
    } catch (err) {
      console.error(`${spec.name} error`, err);
      if (err instanceof Error && err.message === 'Delivery identity conflict') {
        return reply(409, { error: 'delivery_uncertain', message: 'The original delivery identity needs review.' });
      }
      if (!sending) return reply(500, { error: 'delivery_preparation_failed' });
      return reply(idempotencyKey ? 503 : 409, {
        error: idempotencyKey ? 'delivery_retryable' : 'delivery_uncertain',
        message: idempotencyKey ? 'Delivery can be retried with the same key.' : 'Reconcile delivery before retrying.',
      });
    }
  };
}
