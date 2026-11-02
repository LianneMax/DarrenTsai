/** The opt-out receipt is deliberately script-free: no tracking, client identity
 * or email address is needed to confirm the durable preference. Keep its brand
 * styling inline so error/confirmation states also render with the strict CSP. */
export function emailPreferencePage(title: string, body: string, status = 200) {
  const success = title === 'You are unsubscribed';
  const icon = status >= 400
    ? '<circle cx="12" cy="12" r="9"/><path d="M12 7v6m0 4h.01"/>'
    : success ? '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>'
      : '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 6 9 7 9-7"/>';
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${title} | Darren Tsai</title><style>
@font-face{font-family:Outfit;font-style:normal;font-weight:400 800;font-display:swap;src:url('/fonts/outfit-v15-latin.woff2') format('woff2')}
*{box-sizing:border-box}body{margin:0;min-height:100dvh;display:flex;flex-direction:column;font:18px/1.8 Outfit,Arial,sans-serif;background:#eff5f7;color:#223d55}a{color:#14667a;text-underline-offset:4px}::selection{background:#cdebf1;color:#223d55}:focus-visible{outline:3px solid #1a7f99;outline-offset:4px}
header{background:#fff;padding:22px max(22px,calc((100% - 1120px)/2));line-height:1.5}header a{font-size:21px;font-weight:600;text-decoration:none;color:#223d55}header p{font-size:14px;color:#526676;margin:2px 0 0}.preference-wrap{flex:1;display:grid;place-items:center;padding:48px 22px}main{width:100%;max-width:600px;background:#fff;padding:40px;border-radius:16px;box-shadow:0 9px 25px #223d5510}.preference-icon{display:grid;place-items:center;width:48px;height:48px;background:${success ? '#e2f0e8' : '#e8f2f5'};color:${success ? '#24744d' : '#466a7a'};border-radius:50%;margin-bottom:24px}h1{font-size:clamp(29px,4vw,36px);font-weight:550;line-height:1.2;letter-spacing:-.025em;margin:0 0 22px;text-wrap:balance}main p{color:#526676;margin:0 0 24px}form{margin:30px 0}button{display:block;width:100%;min-height:48px;background:#1a7f99;color:#fff;border:0;border-radius:8px;padding:13px 22px;font:inherit;font-weight:550;cursor:pointer}button:hover{background:#146b82}.preference-return{display:inline-block;margin-top:4px;font-size:16px}.preference-footer{padding:22px;display:flex;justify-content:center;gap:14px 26px;flex-wrap:wrap;font-size:14px;color:#526676}.preference-footer a{color:#36596a}@media(max-width:600px){.preference-wrap{padding:30px 16px}main{padding:28px 24px}main p{font-size:17px}header{padding:18px 22px}}
</style></head><body class="email-preference-page"><header><a href="/">Darren Tsai</a><p>Senior Loan Officer · Saxton Mortgage</p></header><div class="preference-wrap"><main aria-labelledby="preference-title"><div class="preference-icon" aria-hidden="true"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${icon}</svg></div><h1 id="preference-title">${title}</h1>${body}<a class="preference-return" href="/">Return to the website ↗</a></main></div><footer class="preference-footer"><span>Darren Tsai · Ren Marketing Group LLC</span><a href="/privacy-policy/">Privacy Policy</a><a href="/legal/">Terms &amp; Legal Disclosures</a></footer></body></html>`;
  return new Response(html, { status, headers: {
    'content-type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex, nofollow',
    // Only the self-hosted brand font is added; scripts, tracking, frames and
    // third-party resources remain blocked. Confirmation posts stay same-origin.
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; font-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
  } });
}
