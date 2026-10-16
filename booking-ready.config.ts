import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Whether Darren's real Google appointment schedule is set. The one setting is
 * BOOKING_URL in public/booking-chooser.js (served as written, so it cannot
 * import anything); this reads it at build time and hands the answer to the
 * React pages and their pre-rendered HTML as __BOOKING_CALENDAR_READY__, so
 * the calendar wording comes back everywhere the moment the link is set.
 */
export function bookingCalendarReady(): boolean {
  // The repo root: Vite, Vitest and the build all run from it.
  const src = readFileSync(resolve(process.cwd(), 'public/booking-chooser.js'), 'utf8');
  const url = /var BOOKING_URL = '([^']*)'/.exec(src)?.[1] ?? '';
  return url !== '' && !url.includes('PLACEHOLDER');
}
