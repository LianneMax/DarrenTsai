import type { Config } from '@netlify/functions';
import { purgeExpiredEmailDeliveries } from './guide-shared.mts';

// Only expired frozen provider requests are removed. Replay tombstones and
// suppression are separate and retained; this never sends an email or lead.
export default async () => {
  try {
    const result = await purgeExpiredEmailDeliveries();
    if (result.remaining) console.warn('Email delivery payload cleanup backlog');
    return new Response(null, { status: 204 });
  } catch {
    console.error('Email delivery payload cleanup failed; next scheduled run will retry');
    return new Response(null, { status: 503 });
  }
};

export const config: Config = { schedule: '@hourly' };
