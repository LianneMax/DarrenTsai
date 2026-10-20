# Security review

Review date: 20 October 2026

Scope: public lead capture, the Apps Script webhook, Netlify lead handling,
booking, attribution, consent, CRM/email handoff, and public static pages.

| # | Severity | File | Lines | Vulnerability | Confidence |
|---|----------|------|-------|---------------|------------|
| 1 | 🟡 MEDIUM | `google-apps-script.js` | 1626-1638 | The public Apps Script `/exec` endpoint fails open when neither `LEAD_PROXY_KEY` nor `NETLIFY_CONTACT_CONFIRM_KEY` is configured. Because the deployment is accessible to anyone, a direct unauthenticated POST can create fabricated Sheet rows and follow-up jobs, potentially causing CRM poisoning and email abuse while bypassing the Netlify proxy's controls. | 10/10 |

## Recommended remediation

Fail closed when the deployed script has no proxy secret. Require a dedicated
`LEAD_PROXY_KEY` in production rather than falling back to the confirmation-mail
key, and add a deployment or health check that alerts when the required secret
is absent. Verify the protected path with a controlled retained TEST record
before retiring compatibility behavior.

## Review notes

- No critical or high-severity vulnerability was confirmed in this focused review.
- The finding is an operational configuration weakness as well as a code-path
  weakness: the deployment documentation currently permits compatibility mode
  when both secrets are absent.
- This summary does not include credentials, account evidence, client data, or
  private audit material.
