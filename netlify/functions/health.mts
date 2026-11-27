import type { Config } from '@netlify/functions';
import { readSyncHeartbeat } from './lead-inbox.mts';

// Uptime (27 Nov 2026). Public and read-only: the Apps Script's site watch calls
// it every 10 minutes from Google's side, so it can tell Max when the site or
// its lead-inbox worker stops, even while no lead is arriving. It reports only
// the time of the last completed inbox sync. No lead, count or contact data.
export const INBOX_SYNC_STALE_MS = 15 * 60 * 1000;

export default async () => {
  const headers = { 'content-type': 'application/json', 'cache-control': 'no-store' };
  try {
    const at = await readSyncHeartbeat();
    const ageSec = at === null ? null : Math.round((Date.now() - at) / 1000);
    const fresh = ageSec !== null && ageSec * 1000 < INBOX_SYNC_STALE_MS;
    return new Response(JSON.stringify({ status: fresh ? 'ok' : 'degraded', inboxSyncAt: at, inboxSyncAgeSec: ageSec }), { status: 200, headers });
  } catch {
    return new Response(JSON.stringify({ status: 'degraded', inboxSyncAt: null, inboxSyncAgeSec: null, detail: 'heartbeat unreadable' }), { status: 200, headers });
  }
};

export const config: Config = { path: '/api/health' };
