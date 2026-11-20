/**
 * The 24-hour call reminder and its Confirm my call link (21 Nov 2026).
 *
 * The reminder is the lead's one chance to say "still good" before Darren's
 * unconfirmed check. These pin what matters to that: the button carries a
 * signed link nobody can forge for another booking, the times are Darren's
 * (Pacific) plus the lead's own, the page confirms with a POST (a mail scanner
 * fetching the link must not confirm), and the Apps Script can read the result
 * only with its key.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const blobs = new Map<string, unknown>();
vi.mock('@netlify/blobs', () => ({
  getStore: (name: unknown) => {
    const prefix = typeof name === 'string' ? name : (name as { name: string }).name;
    return {
      get: async (k: string) => (blobs.has(`${prefix}/${k}`) ? blobs.get(`${prefix}/${k}`) : null),
      set: async (k: string, v: unknown) => { blobs.set(`${prefix}/${k}`, v); },
      setJSON: async (k: string, v: unknown, o?: { onlyIfNew?: boolean }) => {
        if (o?.onlyIfNew && blobs.has(`${prefix}/${k}`)) return { modified: false };
        blobs.set(`${prefix}/${k}`, v);
        return { modified: true };
      },
      delete: async (k: string) => { blobs.delete(`${prefix}/${k}`); },
    };
  },
}));

import reminder, { buildReminderHtml, reminderSubject, previewBooking } from '../netlify/functions/send-call-reminder.mts';
import confirm from '../netlify/functions/confirm-call.mts';
import { confirmUrl, signBooking, RESCHEDULE_URL } from '../netlify/lib/call-confirm.mts';

const KEY = 'contact_key';
const ENV: Record<string, string> = { RESEND_API_KEY: 're_test', CONTACT_CONFIRM_API_KEY: KEY };
let resendCalls: Array<Record<string, unknown>> = [];

beforeEach(() => {
  blobs.clear();
  resendCalls = [];
  vi.stubGlobal('Netlify', { env: { get: (k: string) => ENV[k] } });
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    if (String(input).startsWith('https://api.resend.com/emails')) {
      resendCalls.push(JSON.parse(String(init?.body ?? '{}')));
      return new Response('{"id":"x"}', { status: 200 });
    }
    throw new Error(`unexpected fetch ${String(input)}`);
  }));
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.unstubAllGlobals());

// Thursday 19 Nov 2026, 11:40 AM Pacific, the day before the call.
const NOW = Date.parse('2026-11-19T19:40:00Z');
const START = Date.parse('2026-11-20T19:40:00Z'); // Fri 20 Nov, 11:40 AM PT, 2:40 PM ET
const BOOKING = { email: 'alex@example.com', firstName: 'Alex', bookingId: 'evt_123', callStart: '2026-11-20T19:40:00Z', leadTimeZone: 'America/New_York' };

describe('the reminder email', () => {
  it('says tomorrow, in Pacific and in the lead\'s own time', () => {
    expect(reminderSubject(BOOKING, NOW)).toBe('Still good for tomorrow at 2:40 PM?');
    const html = buildReminderHtml(BOOKING, NOW);
    expect(html).toContain('Still good for tomorrow?');
    expect(html).toContain('tomorrow, Friday, Nov 20 at 11:40 AM Pacific (2:40 PM your time)');
  });

  it('names Pacific in the subject when the lead\'s zone is unknown', () => {
    const { leadTimeZone, ...noZone } = BOOKING;
    void leadTimeZone;
    expect(reminderSubject(noZone, NOW)).toBe('Still good for tomorrow at 11:40 AM Pacific?');
    expect(buildReminderHtml(noZone, NOW)).not.toContain('your time');
  });

  it('has one Confirm my call button with a signed link for this booking', () => {
    const html = buildReminderHtml(BOOKING, NOW);
    const href = /href="([^"]+)"[^>]*>Confirm my call</.exec(html)![1];
    expect(href).toBe(confirmUrl('evt_123', START));
    expect(href).toContain('https://realdarrentsai.com/api/confirm-call?b=evt_123&s=' + START + '&t=');
  });

  it('offers the reschedule link, the phone number and the licence footer', () => {
    const html = buildReminderHtml(BOOKING, NOW);
    expect(html).toContain(`href="${RESCHEDULE_URL}"`);
    expect(html).toContain('href="tel:+17148875432"');
    expect(html).toContain('Saxton Mortgage, LLC | NMLS #1717191');
    expect(html).toContain('All the best,<br>');
    expect(html).not.toContain('—');
  });

  it('is sent with the contact key and refuses a missing booking', async () => {
    const post = (body: unknown, key = KEY) => reminder(new Request('https://realdarrentsai.com/api/send-call-reminder', {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': key }, body: JSON.stringify(body),
    }), {} as never);
    expect((await post(BOOKING, 'wrong')).status).toBe(401);
    expect((await post({ ...BOOKING, bookingId: '' })).status).toBe(500);
    expect(resendCalls).toHaveLength(0);
    expect((await post(BOOKING)).status).toBe(200);
    expect(resendCalls).toHaveLength(1);
    expect(String(resendCalls[0].subject)).toMatch(/^Still good for /);
    expect(String(resendCalls[0].html)).toContain('Confirm my call');
  });

  it('previews a test booking without sending anything', async () => {
    const res = await reminder(new Request('https://realdarrentsai.com/api/send-call-reminder?preview=1'), {} as never);
    expect(res.status).toBe(200);
    expect(res.headers.get('x-robots-tag')).toContain('noindex');
    const html = await res.text();
    expect(html).toContain('Confirm my call');
    expect(html).toMatch(/confirm-call\?b=test-\d+/);
    expect(resendCalls).toHaveLength(0);
    expect(previewBooking(NOW).bookingId).toBe(`test-${NOW}`);
  });
});

describe('the confirm page', () => {
  const url = (b = 'evt_123', s = START, t = signBooking(b, s)) => `https://realdarrentsai.com/api/confirm-call?b=${b}&s=${s}&t=${t}`;
  beforeEach(() => vi.setSystemTime(NOW));
  afterEach(() => vi.useRealTimers());

  it('a GET shows the page and confirms nothing by itself', async () => {
    const res = await confirm(new Request(url()), {} as never);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Confirming your call');
    expect(html).toContain('method: "POST"');
    expect(res.headers.get('content-security-policy')).toMatch(/script-src 'nonce-[^']+'/);
    expect(blobs.size).toBe(0);
  });

  it('the POST records the confirmation once, and a later GET says confirmed', async () => {
    const post = () => confirm(new Request(url(), { method: 'POST', headers: { accept: 'application/json' } }), {} as never);
    const first = await post();
    expect(first.status).toBe(200);
    const { confirmedAt } = await first.json();
    await post();
    expect((blobs.get('call-confirmations/evt_123') as { confirmedAt: string }).confirmedAt).toBe(confirmedAt);
    const again = await (await confirm(new Request(url()), {} as never)).text();
    expect(again).toContain("You're confirmed");
    expect(again).toContain('Friday, Nov 20 at 11:40 AM Pacific');
  });

  it('a link signed for another booking or time does not confirm', async () => {
    for (const bad of [url('evt_999', START, signBooking('evt_123', START)), url('evt_123', START + 60_000, signBooking('evt_123', START)), url('evt_123', START, 'f'.repeat(40))]) {
      const res = await confirm(new Request(bad, { method: 'POST', headers: { accept: 'application/json' } }), {} as never);
      expect(res.status).toBe(400);
    }
    expect((await (await confirm(new Request(url('evt_123', START, 'nope')), {} as never)).text())).toContain("This link doesn't look right");
    expect(blobs.size).toBe(0);
  });

  it('a call more than two hours past cannot be confirmed', async () => {
    vi.setSystemTime(START + 3 * 3600_000);
    const res = await confirm(new Request(url(), { method: 'POST', headers: { accept: 'application/json' } }), {} as never);
    expect(res.status).toBe(410);
    expect(blobs.size).toBe(0);
  });

  it('the Apps Script reads the status only with its key', async () => {
    const status = (key?: string) => confirm(new Request('https://realdarrentsai.com/api/confirm-call?status=1&b=evt_123', {
      headers: key ? { 'x-api-key': key } : {},
    }), {} as never);
    expect((await status()).status).toBe(401);
    expect(await (await status(KEY)).json()).toEqual({ bookingId: 'evt_123', confirmed: false, confirmedAt: null });
    await confirm(new Request(url(), { method: 'POST', headers: { accept: 'application/json' } }), {} as never);
    expect(await (await status(KEY)).json()).toMatchObject({ bookingId: 'evt_123', confirmed: true });
  });
});
