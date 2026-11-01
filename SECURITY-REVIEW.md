# Security review

Review date: 20 October 2026
Last updated: 2 November 2026

Scope: public lead capture, the Apps Script webhook, Netlify lead handling,
booking, attribution, consent, CRM/email handoff, and public static pages.

| # | Severity | File | Vulnerability | Status |
|---|----------|------|---------------|--------|
| 1 | 🟡 MEDIUM | `google-apps-script.js` (`doPost`) | The public Apps Script `/exec` endpoint failed open when neither `LEAD_PROXY_KEY` nor `NETLIFY_CONTACT_CONFIRM_KEY` was configured. A direct unauthenticated POST could create fabricated Sheet rows and follow-up jobs, bypassing the Netlify proxy's controls. | Fixed in `2ff2113`, deployed and verified 21 October 2026 |
| 2 | 🟠 HIGH (dependency) | `package.json` (`zod`) | zod below 4.6.6 can exhaust memory while validating oversized constrained collections ([GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5)). zod runs only in the browser lead forms, and `/api/lead` caps request bodies at 100,000 characters, so exposure was limited. | Fixed 1 November 2026: upgraded to zod 4.6.7; `npm audit --omit=dev` reports 0 vulnerabilities |

## Finding 1: how it is fixed

- `doPost` now rejects every request with `proxy_auth_not_configured` when no
  proxy secret is set, before any Sheet access, lock, queue write, network call
  or alert. A missing secret is treated as a configuration failure, never as an
  open mode.
- A supplied key is compared in constant time and stripped from the payload
  before it is logged or stored.
- `/api/lead` (`netlify/functions/lead.mts`) also refuses with HTTP 503 and the
  same code when its side of the secret is missing, and passes the Apps Script
  refusal through rather than reporting a saved lead.
- `tests/apps-script-dopost.test.ts` covers the missing, blank and whitespace-only
  secret cases.

## Remaining hardening (not a vulnerability)

- Done 2 November 2026: lead writing now requires the dedicated
  `LEAD_PROXY_KEY` on both sides. The confirmation-mail key is no longer a
  fallback (tests prove a request carrying only that key is refused), so the
  two secrets rotate independently.
- Development-only advisories (vite, vitest, undici, and the eslint tooling via
  minimatch; 16 in `npm audit` on 1 November 2026) do not ship to visitors and
  are tracked separately.

## Review notes

- No critical vulnerability in site code was confirmed in this focused review.
- This summary does not include credentials, account evidence, client data, or
  private audit material.
