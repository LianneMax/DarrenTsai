import type { Config } from '@netlify/functions';
import { getStore } from '@netlify/blobs';
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
//
// 28 Nov 2026 (Max): every uptime email goes to ONE Gmail thread, written like
// the daily-task emails to Darren, and the thread gets an "all clear" once the
// problem is gone, so the thread reads as a history. Same subject as the Apps
// Script's watchSite; the References header keeps Netlify's ones together.
export const WORKER_STALE_MS = 15 * 60 * 1000;
export const STATUS_SUBJECT = 'Lead system status | realdarrentsai.com';
export const STATUS_THREAD_HEADERS = {
  'In-Reply-To': '<lead-system-status@realdarrentsai.com>',
  'References': '<lead-system-status@realdarrentsai.com>',
};

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

/** "28 Nov 2026, 8:34 PM Manila (4:34 AM Pacific)". */
export function checkedAt(now: number): string {
  const fmt = (tz: string, withDate: boolean) => new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour: 'numeric', minute: '2-digit', ...(withDate ? { day: 'numeric', month: 'short', year: 'numeric' } : {}),
  }).format(new Date(now));
  return `${fmt('Asia/Manila', true)} Manila (${fmt('America/Los_Angeles', false)} Pacific)`;
}

/** The body, in the daily-task email style: greeting, what's wrong, a checklist. */
export function statusEmail(o: { headline: string; problems: string[]; meaning: string; checks: string[]; source: string; now: number }): string {
  const lines = ['Hi Max,', '', o.headline, ''];
  if (o.problems.length) lines.push("What's wrong:", ...o.problems.map((p) => '- ' + p), '');
  if (o.meaning) lines.push('What this means:', o.meaning, '');
  if (o.checks.length) lines.push('What to check:', ...o.checks.map((c, i) => `[ ] ${i + 1}. ${c}`), '');
  lines.push('--------------------------------------------',
    `Checked by ${o.source}, ${checkedAt(o.now)}.`,
    o.problems.length ? 'This repeats at most once an hour while the problem lasts. Do not re-enter leads.' : 'No action needed.',
    '', 'Thank you!', 'Lead system watch');
  return lines.join('\n');
}

const ALERT_KEY = 'uptime-alert';

export default async () => {
  const url = Netlify.env.get('APPS_SCRIPT_WEBHOOK_URL') || Netlify.env.get('APP_SCRIPT_WEBHOOK_URL');
  if (!url) return new Response(null, { status: 204 });
  let httpOk = false, body: unknown = null;
  try {
    const response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(15000) });
    httpOk = response.ok;
    body = await response.json();
  } catch { /* judged as unreachable below */ }
  const now = Date.now();
  const check = judgeWriter(httpOk, body, now);
  let store: ReturnType<typeof getStore> | null = null;
  try { store = getStore('site-health'); } catch { store = null; }

  if (check.ok) {
    // Recovered: close the episode in the same thread, once.
    try {
      const open = store ? await store.get(ALERT_KEY, { type: 'json' }) as { at?: number; cleared?: boolean } | null : null;
      if (open && open.at && !open.cleared) {
        await sendOpsAlert(`uptime-clear-${open.at}`, STATUS_SUBJECT, statusEmail({
          headline: 'All clear: the Apps Script is answering and follow-ups are running again.',
          problems: [], meaning: `The problem first reported ${checkedAt(open.at)} is resolved. Leads saved in the website inbox meanwhile are synced automatically.`,
          checks: [], source: 'Netlify', now,
        }), STATUS_THREAD_HEADERS);
        await store!.setJSON(ALERT_KEY, { at: open.at, cleared: true });
      }
    } catch { /* the all-clear is a courtesy; never fail the check over it */ }
    return new Response(null, { status: 204 });
  }

  console.warn('Uptime watch: Apps Script needs attention', check.problem);
  const hour = Math.floor(now / 3_600_000);
  const headlines = {
    'unreachable': 'The Apps Script that saves leads to the Sheet is not answering.',
    'protocol': 'The Apps Script that saves leads to the Sheet answered unexpectedly.',
    'worker-stale': 'Lead follow-ups (HubSpot, call tasks, guide emails) have stopped running.',
  } as const;
  await sendOpsAlert(`uptime-${check.problem}-${hour}`, STATUS_SUBJECT, statusEmail({
    headline: headlines[check.problem],
    problems: [check.detail],
    meaning: 'Website forms still save each lead in the private website inbox, and the inbox sends its own notice if a lead cannot reach the Sheet within 5 minutes. ' +
      (check.problem === 'worker-stale'
        ? 'Leads may be in the Sheet without their HubSpot contact, call task or guide email yet.'
        : 'New leads will wait in the inbox until the Apps Script answers again.'),
    checks: [
      'Apps Script > Executions: is processFollowUps running every minute?',
      'Apps Script > Triggers: is the every-minute trigger still there?',
      'The Follow-ups tab in the Leads Sheet: are rows stuck on pending?',
      'Netlify > Functions > uptime-watch logs.',
    ],
    source: 'Netlify', now,
  }), STATUS_THREAD_HEADERS);
  try {
    const open = store ? await store.get(ALERT_KEY, { type: 'json' }) as { at?: number; cleared?: boolean } | null : null;
    if (store && (!open || open.cleared)) await store.setJSON(ALERT_KEY, { at: now, cleared: false });
  } catch { /* state is only for the all-clear */ }
  return new Response(null, { status: 503 });
};

export const config: Config = { schedule: '*/10 * * * *' };
