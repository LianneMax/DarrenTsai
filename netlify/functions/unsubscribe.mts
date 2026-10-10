import type { Config } from '@netlify/functions';
import { emailForToken, stopEmail } from './email-preferences.mts';

const headers = {
  'content-type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex, nofollow',
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
};
function page(title: string, body: string, status = 200) {
  return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} | Darren Tsai</title><style>body{font-family:system-ui,sans-serif;background:#f5f7f9;color:#223d55;padding:48px 20px}main{max-width:480px;margin:auto;background:white;padding:32px;border-radius:16px}button{background:#517686;color:white;border:0;border-radius:8px;padding:14px 20px;font:inherit;cursor:pointer}p{line-height:1.6}</style><main><h1>${title}</h1>${body}</main></html>`, { status, headers });
}
export default async function unsubscribe(req: Request) {
  if (!['GET', 'POST'].includes(req.method)) return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, POST' } });
  const token = new URL(req.url).searchParams.get('token') || '';
  try {
    const email = await emailForToken(token);
    if (!email) return page('This link is not valid', '<p>Please use the unsubscribe link in your email, or email darren@realdarrentsai.com with “Unsubscribe” as the subject.</p>', 400);
    // Email scanners follow GET links. Only an intentional confirmation POST
    // or the mailbox's RFC 8058 one-click POST changes consent.
    if (req.method === 'GET') return page('Stop emails from Darren', `<p>Confirm below to stop future website guide and confirmation emails. Your contact history will be kept.</p><form method="post" action="/unsubscribe?token=${token}"><button type="submit">Stop emails</button></form>`);
    const body = await req.text();
    if (body.length > 4096) return page('Request too large', '<p>Please try the link again.</p>', 413);
    await stopEmail(email, 'link');
    if (new URLSearchParams(body).get('List-Unsubscribe') === 'One-Click') return new Response(null, { status: 200, headers });
    return page('You are unsubscribed', '<p>Your opt-out is recorded. Future website guide and confirmation emails to this address are stopped.</p>');
  } catch {
    // Never claim success before the durable opt-out write completes.
    return page('We could not save your choice yet', '<p>Please try again. You can also email darren@realdarrentsai.com with “Unsubscribe” as the subject.</p>', 503);
  }
}
export const config: Config = { path: '/unsubscribe' };
