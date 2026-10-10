import type { Config } from '@netlify/functions';
import { timingSafeEqual, createHash } from 'node:crypto';
import { stopEmail } from './email-preferences.mts';

// The existing server-to-server confirmation key authorizes recording an
// explicit reply/manual opt-out. Never put it in a browser or an email link.
// There is deliberately no resubscribe action and no contact deletion here.
export default async function stopEmailRequest(req: Request) {
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json', 'Cache-Control': 'no-store' },
  });
  if (req.method !== 'POST') return json(405, { error: 'POST only' });
  const supplied = req.headers.get('x-api-key');
  const expected = Netlify.env.get('CONTACT_CONFIRM_API_KEY');
  const digest = (value: string) => createHash('sha256').update(value).digest();
  if (!supplied || !expected || !timingSafeEqual(digest(supplied), digest(expected))) return json(401, { error: 'unauthorized' });
  try {
    const raw = await req.text();
    if (raw.length > 4096) return json(413, { error: 'payload too large' });
    let input: { email?: unknown; reason?: unknown };
    try { input = JSON.parse(raw); } catch { return json(400, { error: 'invalid json' }); }
    if (typeof input?.email !== 'string' || !input.email.includes('@') || input.email.length > 254) return json(400, { error: 'invalid email' });
    await stopEmail(input.email, input.reason === 'reply' ? 'reply' : 'manual');
    return json(200, { success: true, suppressed: true });
  } catch { return json(503, { error: 'could not record opt-out' }); }
}
export const config: Config = { path: '/api/stop-email' };
