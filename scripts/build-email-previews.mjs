/**
 * Renders each confirmation email to docs/revamp/emails/, to be read in a
 * browser before anything is sent. Run by hand: `npm run emails`.
 *
 * WHY IT IMPORTS THE REAL TEMPLATE. A preview drawn from a copy of the template
 * is a picture of the copy. These files are what
 * netlify/functions/send-contact-confirmation.mts returns for a given lead, so
 * the layout, colours, signature, licence footer and unsubscribe line are the
 * live email's, and a change to the template shows up here on the next run.
 *
 * It sends nothing and reads no secret: it calls the function that builds the
 * HTML, never the handler that posts it to Resend. Node 22 strips the types
 * from the .mts on import.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'docs/revamp/emails');
const { buildEmailHtml, copyFor } = await import(
  pathToFileURL(resolve(ROOT, 'netlify/functions/send-contact-confirmation.mts')).href
);

/**
 * One sample lead per email. `status` says whether the email is sent today.
 * The samples are made up, and only hold what that funnel's form would send.
 */
const PREVIEWS = [
  {
    file: 'debt-consolidation.html', name: 'Debt Consolidation', status: 'draft',
    sentTo: 'A lead from the debt calculator, on / or /debt-consolidation/.',
    lead: { context: 'debt', firstName: 'Alex' },
  },
  {
    file: 'home-equity.html', name: 'Home Equity', status: 'draft',
    sentTo: 'A lead from /home-equity/ (page not built yet). Sample goal: Renovation / ADU.',
    lead: { context: 'home-equity', firstName: 'Alex', goal: 'Renovation / ADU' },
  },
  {
    file: 'adu.html', name: 'Renovation / ADU', status: 'draft',
    sentTo: 'A lead from /adu/ (page not built yet). Sample purpose: Rental ADU.',
    lead: { context: 'adu', firstName: 'Alex', projectPurpose: 'Rental ADU' },
  },
  {
    file: 'mortgage-calculator-review.html', name: 'Mortgage Calculator review', status: 'draft',
    sentTo: 'A lead who asks for a review from /mortgage-calculator/. Sample message included.',
    lead: {
      context: 'mortgage-review', firstName: 'Alex',
      message: 'Looking to buy next spring and want to keep the payment under 2,800 a month.',
    },
  },
  {
    file: 'contact-live.html', name: 'Contact modal', status: 'live',
    sentTo: 'Sent today to every contact modal lead. Unchanged, shown for comparison.',
    lead: { firstName: 'Alex', message: 'Want to clear two credit cards before the end of the year.' },
  },
];

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

mkdirSync(OUT, { recursive: true });
const rows = [];
for (const p of PREVIEWS) {
  writeFileSync(resolve(OUT, p.file), buildEmailHtml(p.lead));
  const copy = copyFor(p.lead);
  rows.push(`
    <tr>
      <td><a href="${p.file}">${esc(p.name)}</a><br><span class="tag ${p.status}">${p.status === 'live' ? 'LIVE, unchanged' : 'DRAFT, not sent'}</span></td>
      <td><strong>${esc(copy.subject)}</strong><br><span class="muted">${esc(copy.preheader)}</span></td>
      <td class="muted">${esc(p.sentTo)}</td>
    </tr>`);
}

writeFileSync(resolve(OUT, 'index.html'), `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Confirmation emails: previews for sign-off</title>
<style>
  body{font-family:Arial,Helvetica,sans-serif;color:#223d55;background:#f5f7f9;margin:0;padding:32px 16px;line-height:1.5;}
  main{max-width:920px;margin:0 auto;background:#fff;border:1px solid #e6ebf0;border-radius:14px;padding:28px 32px;}
  h1{font-size:22px;margin:0 0 6px;} p{margin:8px 0;color:#4b5563;font-size:14px;}
  table{width:100%;border-collapse:collapse;margin-top:18px;font-size:14px;}
  th{text-align:left;font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#517686;padding:8px 10px;border-bottom:2px solid #e6ebf0;}
  td{padding:14px 10px;border-bottom:1px solid #e6ebf0;vertical-align:top;}
  a{color:#517686;font-weight:700;} .muted{color:#6b7280;font-size:13px;}
  .tag{display:inline-block;margin-top:6px;font-size:10px;font-weight:700;letter-spacing:.8px;padding:2px 8px;border-radius:10px;}
  .draft{background:#fffaeb;color:#b45309;} .live{background:#d5f4d2;color:#35785c;}
  code{background:#f5f7f9;padding:1px 5px;border-radius:4px;font-size:12px;}
</style>
</head>
<body>
<main>
  <h1>Confirmation emails: previews for sign-off</h1>
  <p>Each file is what the existing email template renders for a sample lead: same layout, colours, greeting, signature, licence footer and unsubscribe line as the live contact email. Only the words differ.</p>
  <p><strong>Nothing here is sent.</strong> The four drafts are not connected to any form. The names, goals and messages are samples.</p>
  <p>Narrow the browser window to about 400px to see the phone layout. Regenerate after a copy change with <code>npm run emails</code>.</p>
  <table>
    <tr><th>Email</th><th>Subject and inbox preview line</th><th>Who would get it</th></tr>${rows.join('')}
  </table>
  <p style="margin-top:18px;">The copy, with the decisions that are yours, is in <code>docs/revamp/confirmation-email-copy.md</code>.</p>
</main>
</body>
</html>
`);
console.log(`wrote ${PREVIEWS.length} emails and index.html to docs/revamp/emails/`);
