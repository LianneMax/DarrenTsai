import type { Config } from '@netlify/functions';

/**
 * /debt-consolidation/ was retired on 15 Oct 2026: "debt consolidation" is not
 * a product Darren sells (his loans are home equity loans used to pay off
 * debt), and the page's framing risked ad disapproval. Its comparison now
 * lives at /home-equity/?goal=payoff.
 *
 * A function rather than a netlify.toml rule for the reason in
 * youtube-redirect.mts: a TOML target with its own query replaced the
 * visitor's, losing gclid/gbraid/wbraid and UTMs. Here the request's whole
 * query is kept and goal=payoff is added. 301 because the page is gone for
 * good, with no-store so a browser does not pin it should the target move.
 */
export default function debtRedirect(request: Request): Response {
  if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
  const incoming = new URL(request.url);
  const target = new URL('/home-equity/', incoming.origin);
  target.search = incoming.search;
  target.searchParams.set('goal', 'payoff');
  return new Response(null, { status: 301, headers: { Location: target.toString(), 'Cache-Control': 'no-store' } });
}

export const config: Config = { path: ['/debt-consolidation', '/debt-consolidation/', '/debt-consolidation/*'] };
