import { getStore } from '@netlify/blobs';
import { createHash, timingSafeEqual } from 'node:crypto';

// Wrong-key guard for the server-to-server email endpoints (4 Nov 2026).
//
// WHY. Max kept the existing keys rather than rotating them, so guessing has to
// be made impractical instead. Only Apps Script calls these endpoints, always
// with the right key, so a wrong key is never a real visitor. An address that
// sends KEY_FAIL_LIMIT wrong keys inside one window is refused for
// KEY_BLOCK_MS without its key being compared at all: a correct guess during
// the block gets nothing.
//
// FAILS OPEN, like the lead rate limit: a Blobs error or a slow answer lets the
// request through to the normal key check, so storage trouble can never stop
// a real guide email. The key itself is still always required.
//
// If a block ever caught Apps Script (an attacker on a shared Google address),
// its 429 is retried by the follow-up queue's normal backoff.
//
// Addresses are stored hashed: the guard needs to recognise one, not know it.
export const KEY_FAIL_LIMIT = 5;
export const KEY_FAIL_WINDOW_MS = 15 * 60 * 1000;
export const KEY_BLOCK_MS = 60 * 60 * 1000;
const STORE = 'key-guard';
const BUDGET_MS = 600;

export type KeyFails = { count: number; windowStart: number; blockedUntil?: number };

const digest = (value: string) => createHash('sha256').update(value).digest();
const addressKey = (ip: string) => digest(ip).toString('hex').slice(0, 32);

/** Constant-time comparison of a supplied key with the configured one. */
export function keyMatches(supplied: string | null, expected: string | undefined): boolean {
  if (!supplied || !expected) return false;
  return timingSafeEqual(digest(supplied), digest(expected));
}

/** The next failure record for one address. Pure, so the window is testable. */
export function nextFails(prev: KeyFails | null, now: number): KeyFails {
  const fresh = !prev || now - prev.windowStart >= KEY_FAIL_WINDOW_MS;
  const next: KeyFails = fresh ? { count: 1, windowStart: now } : { count: prev.count + 1, windowStart: prev.windowStart };
  if (prev?.blockedUntil && prev.blockedUntil > now) next.blockedUntil = prev.blockedUntil;
  if (next.count >= KEY_FAIL_LIMIT && !next.blockedUntil) next.blockedUntil = now + KEY_BLOCK_MS;
  return next;
}

async function bounded<T>(work: Promise<T>, fallback: T): Promise<T> {
  const timeout = new Promise<T>((resolve) => setTimeout(() => resolve(fallback), BUDGET_MS));
  try { return await Promise.race([work.catch(() => fallback), timeout]); } catch { return fallback; }
}

/** True only when this address is known, for certain, to be blocked. */
export async function addressBlocked(ip: string | undefined, now = Date.now()): Promise<boolean> {
  if (!ip) return false;
  return bounded((async () => {
    const record = await getStore({ name: STORE, consistency: 'strong' }).get(addressKey(ip), { type: 'json' }) as KeyFails | null;
    return Boolean(record?.blockedUntil && record.blockedUntil > now);
  })(), false);
}

/** Count one wrong key for this address. Best effort and bounded. */
export async function recordKeyFailure(ip: string | undefined, now = Date.now()): Promise<void> {
  if (!ip) return;
  await bounded((async () => {
    const store = getStore({ name: STORE, consistency: 'strong' });
    const key = addressKey(ip);
    for (let attempt = 0; attempt < 8; attempt++) {
      const current = await store.getWithMetadata(key, { type: 'json', consistency: 'strong' });
      const next = nextFails((current?.data as KeyFails | null) ?? null, now);
      const result = await store.setJSON(key, next, current?.etag ? { onlyIfMatch: current.etag } : { onlyIfNew: true });
      if (result.modified) return;
    }
  })(), undefined);
}

/**
 * The whole check for one request: a Response to send back when it must be
 * refused (429 blocked, 401 wrong key), or null when the key is right.
 */
export async function guardKey(req: Request, ip: string | undefined, expected: string | undefined,
  respond: (status: number, body: unknown) => Response): Promise<Response | null> {
  if (await addressBlocked(ip)) return respond(429, { error: 'too many attempts' });
  if (keyMatches(req.headers.get('x-api-key'), expected)) return null;
  if (req.headers.get('x-api-key')) await recordKeyFailure(ip);
  return respond(401, { error: 'unauthorized' });
}
