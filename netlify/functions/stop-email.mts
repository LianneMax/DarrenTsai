import type { Config, Context } from '@netlify/functions';
import { guardKey } from '../lib/key-guard.mts';
import { stopEmail, pendingSheetOptOuts, acknowledgeSheetOptOut } from '../lib/email-preferences.mts';

// The existing server-to-server confirmation key authorizes recording an
// explicit reply/manual opt-out. Never put it in a browser or an email link.
// There is deliberately no resubscribe action and no contact deletion here.
export default async function stopEmailRequest(req: Request, context?: Context) {
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json', 'Cache-Control': 'no-store' },
  });
  if (req.method !== 'POST') return json(405, { error: 'POST only' });
  // Constant-time key check, plus the wrong-key guard (4 Nov 2026).
  const refused = await guardKey(req, context?.ip, Netlify.env.get('CONTACT_CONFIRM_API_KEY'), json);
  if (refused) return refused;
  try {
    const raw = await req.text();
    if (raw.length > 4096) return json(413, { error: 'payload too large' });
    let input: { email?: unknown; reason?: unknown; operation?: unknown };
    try { input = JSON.parse(raw); } catch { return json(400, { error: 'invalid json' }); }
    if (input?.operation === 'pending') return json(200, { emails: await pendingSheetOptOuts() });
    if (typeof input?.email !== 'string' || !input.email.includes('@') || input.email.length > 254) return json(400, { error: 'invalid email' });
    if (input.operation === 'acknowledge') {
      await acknowledgeSheetOptOut(input.email);
      return json(200, { success: true });
    }
    await stopEmail(input.email, input.reason === 'reply' ? 'reply' : 'manual');
    return json(200, { success: true, suppressed: true });
  } catch { return json(503, { error: 'could not record opt-out' }); }
}
export const config: Config = { path: '/api/stop-email' };
