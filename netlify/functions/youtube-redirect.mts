import type { Config } from '@netlify/functions';

/**
 * One authoritative destination list for description and pinned-comment links.
 * Live checks on 11 Oct found the old TOML redirects' explicit target queries
 * replaced incoming queries, losing gclid/gbraid/wbraid and video-specific UTMs.
 * Merge defaults here instead: preserve the request's complete query, keep
 * destinations allowlisted, and do not cache a visitor's click IDs. No tracking
 * request, cookie, secret, external dependency or lead write is involved.
 */
export const SHORTLINKS = {
  heloc: { path: '/home-equity/', campaign: 'yt-heloc' },
  equity: { path: '/home-equity/', campaign: 'yt-home-equity' },
  adu: { path: '/adu/', campaign: 'yt-adu' },
  dscr: { path: '/dscr/', campaign: 'yt-dscr' },
  rei: { path: '/realestateinvesting/', campaign: 'yt-rei' },
  buyer: { path: '/fha/', campaign: 'yt-buyer' },
  debt: { path: '/debt-consolidation/', campaign: 'yt-debt' },
  mortgage: { path: '/mortgage-calculator/', campaign: 'yt-mortgage' },
  home: { path: '/', campaign: 'yt-home' },
} as const;

export default function youtubeRedirect(request: Request): Response {
  if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
  const incoming = new URL(request.url);
  const name = incoming.pathname.replace(/\/$/, '').split('/').pop() || '';
  const comment = name.endsWith('-c');
  const bucket = comment ? name.slice(0, -2) : name;
  if (!Object.prototype.hasOwnProperty.call(SHORTLINKS, bucket)) return new Response('Not found', { status: 404 });
  const destination = SHORTLINKS[bucket as keyof typeof SHORTLINKS];
  const target = new URL(destination.path, incoming.origin);
  target.search = incoming.search;
  for (const [key, value] of Object.entries({ utm_source: 'youtube', utm_medium: 'social', utm_campaign: destination.campaign, utm_content: comment ? 'pinned-comment' : 'description' })) {
    if (!target.searchParams.has(key)) target.searchParams.set(key, value);
  }
  return new Response(null, { status: 302, headers: { Location: target.toString(), 'Cache-Control': 'no-store' } });
}

export const config: Config = { path: ['/yt/:bucket', '/yt/:bucket/'] };
