import { getStore } from '@netlify/blobs';
import { createHash, randomBytes } from 'node:crypto';

// Site-wide rather than deploy-scoped: a deploy or a repeat form submission
// must never erase an opt-out. Strong reads prevent a cached "allowed" answer
// after the unsubscribe write. Storage uncertainty pauses email delivery only;
// the lead still saves and the queue can retry without sending against consent.
const preferences = () => getStore('email-preferences', { consistency: 'strong' });
export function normalizedEmail(email: string) { return email.trim().toLowerCase(); }
export function emailKey(email: string) {
  return createHash('sha256').update(normalizedEmail(email)).digest('hex');
}
export async function isEmailSuppressed(email: string): Promise<boolean> {
  return !!(await preferences().get(`stop/${emailKey(email)}`, { type: 'json' }));
}
export async function stopEmail(email: string, reason: 'link' | 'reply' | 'manual') {
  const normalized = normalizedEmail(email);
  if (!normalized || normalized.length > 254 || !normalized.includes('@')) throw new Error('Invalid email');
  await preferences().setJSON(`stop/${emailKey(normalized)}`, {
    email: normalized, stoppedAt: new Date().toISOString(), reason,
  });
  // Durable outbox: Sheet visibility can retry independently without ever
  // lifting email suppression when Google is temporarily unavailable.
  await preferences().setJSON(`pending/${emailKey(normalized)}`, { email: normalized });
}
export async function pendingSheetOptOuts(): Promise<string[]> {
  const store = preferences();
  const listed = await store.list({ prefix: 'pending/' });
  const emails: string[] = [];
  for (const blob of listed.blobs.slice(0, 100)) {
    const record = await store.get(blob.key, { type: 'json' }) as { email?: string } | null;
    if (record?.email) emails.push(record.email);
  }
  return emails;
}
export async function acknowledgeSheetOptOut(email: string) {
  await preferences().delete(`pending/${emailKey(email)}`);
}
export async function unsubscribeLinkFor(email: string): Promise<string> {
  const store = preferences();
  const key = emailKey(email);
  let token = await store.get(`link/${key}`, { type: 'text' });
  if (!token || !/^[a-f0-9]{64}$/.test(token)) {
    token = randomBytes(32).toString('hex');
    // Opaque token: no email address in URLs. Do not expire old links or delete
    // records on deployment. Concurrent sends can mint two links; both stay valid.
    await store.setJSON(`token/${token}`, { email: normalizedEmail(email) });
    await store.set(`link/${key}`, token);
  }
  return `https://realdarrentsai.com/unsubscribe?token=${token}`;
}
export async function emailForToken(token: string): Promise<string | null> {
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const record = await preferences().get(`token/${token}`, { type: 'json' }) as { email?: unknown } | null;
  return typeof record?.email === 'string' ? record.email : null;
}
