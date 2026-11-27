import type { Config } from '@netlify/functions';
import { CAPTURE_PROTOCOL, sendOpsAlert } from './lead-inbox.mts';

// Uptime (27 Nov 2026, Max: "make sure nothing is down ... since we might lose
// leads"). Every 10 minutes, from Netlify's side, check the Apps Script that
// writes leads to the Sheet and runs every follow-up (HubSpot, call tasks,
// guide emails):
//   - it answers its health check with the capture protocol the inbox needs;
//   - its every-minute follow-up worker ran in the last 15 minutes (workerAt).
//     A stopped trigger or a lock that never frees (the unexplained 21 Oct
//     lock-up) used to be silent until someone opened the Follow-ups tab.
// Leads are not lost while the Apps Script is down: the website inbox keeps
// them and alerts per lead after 5 minutes. This catches it with no lead in
// flight. The Apps Script watches this side in turn (watchSite).
// One email per problem per hour (Resend idempotency key), never per run.
export const WORKER_STALE_MS = 15 * 60 * 1000;

export type WriterCheck = { ok: true } | { ok: false; problem: 'unreachable' | 'protocol' | 'worker-stale'; detail: string };

/** Pure: what the Apps Script health answer means. */
export function judgeWriter(httpOk: boolean, body: unknown, now: number): WriterCheck {
  if (!httpOk || !body || typeof body !== 'object') return { ok: false, problem: 'unreachable', detail: 'No valid answer from the Apps Script health check.' };
  const b = body as { status?: unknown; captureProtocol?: unknown; workerAt?: unknown };
  if (b.status !== 'ok' || b.captureProtocol !== CAPTURE_PROTOCOL) return { ok: false, problem: 'protocol', detail: `Unexpected health answer (status ${String(b.status)}, protocol ${String(b.captureProtocol)}).` };
  // Older Apps Script versions do not report workerAt; only judge it when present.
  if (typeof b.workerAt === 'number' && now - b.workerAt > WORKER_STALE_MS) {
    return { ok: false, problem: 'worker-stale', detail: `The follow-up worker last ran ${Math.round((now - b.workerAt) / 60000)} minutes ago.` };
  }
  return { ok: true };
}

export default async () => {
  const url = Netlify.env.get('APPS_SCRIPT_WEBHOOK_URL') || Netlify.env.get('APP_SCRIPT_WEBHOOK_URL');
  if (!url) return new Response(null, { status: 204 });
  let httpOk = false, body: unknown = null;
  try {
    const response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(15000) });
    httpOk = response.ok;
    body = await response.json();
  } catch { /* judged as unreachable below */ }
  const check = judgeWriter(httpOk, body, Date.now());
  if (check.ok) return new Response(null, { status: 204 });
  console.warn('Uptime watch: Apps Script needs attention', check.problem);
  const hour = Math.floor(Date.now() / 3_600_000);
  const subjects = {
    'unreachable': 'Lead system check: the Apps Script is not answering',
    'protocol': 'Lead system check: the Apps Script answered unexpectedly',
    'worker-stale': 'Lead system check: follow-ups have stopped running',
  } as const;
  await sendOpsAlert(`uptime-${check.problem}-${hour}`, subjects[check.problem],
    check.detail + '\n\n' +
    'What this means: website forms still save each lead in the private website inbox, and the inbox sends its own notice if a lead cannot reach the Sheet within 5 minutes. ' +
    (check.problem === 'worker-stale'
      ? 'Leads may be in the Sheet without their HubSpot contact, call task or guide email yet.'
      : 'New leads will wait in the inbox until the Apps Script answers again.') + '\n\n' +
    'Check: Apps Script > Executions (is processFollowUps running every minute?) and Triggers; the Follow-ups tab; Netlify uptime-watch logs. ' +
    'Do not re-enter leads. This notice repeats at most once an hour while the problem lasts.');
  return new Response(null, { status: 503 });
};

export const config: Config = { schedule: '*/10 * * * *' };
