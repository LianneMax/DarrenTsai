// The "Confirm my call" link in the 24-hour call reminder (21 Nov 2026).
//
// The booking follow-up plan (vault, Booking pipeline): a lead who booked more
// than a day ahead gets one reminder 24 hours before the call with a Confirm my
// call button. Tapping it records the confirmation here. A later check (3 hours
// before the call, or 5 PM Pacific the evening before when that would land
// before 8 AM) reads it and only gives Darren a HubSpot task when the lead has
// not confirmed. Nothing here touches Darren's calendar: leads cancel and
// rebook through Google themselves.
//
// The link carries the booking id and the call start, signed with an HMAC so
// nobody can confirm a booking they were not sent. The signing key is derived
// from CONTACT_CONFIRM_API_KEY, the secret the Apps Script already uses for the
// contact confirmation, so this needs no new environment variable. A booking id
// starting "test-" is only ever used by the preview page.

import { getStore } from "@netlify/blobs";
import { createHmac, timingSafeEqual } from "node:crypto";

export const SITE = "https://realdarrentsai.com";
/** Darren's Google booking page. Rescheduling skips the /book/ prequal: they already passed it. */
export const RESCHEDULE_URL =
  "https://calendar.google.com/calendar/appointments/schedules/AcZssZ2jtRO6oFZU1VgtFGePqnIMm8cYDO5eRRXAyu-5cuX9stZDl4mkCOn5nV83SFtW4BtfxhPu336X?gv=true";
export const PACIFIC = "America/Los_Angeles";

export const BOOKING_ID = /^[A-Za-z0-9_-]{1,128}$/;

function signingKey() {
  const base = Netlify.env.get("CONTACT_CONFIRM_API_KEY");
  if (!base) throw new Error("CONTACT_CONFIRM_API_KEY not configured");
  return createHmac("sha256", base).update("call-confirm-v1").digest();
}

/** The signature for one booking and call start (epoch ms). */
export function signBooking(bookingId: string, start: number) {
  return createHmac("sha256", signingKey()).update(`${bookingId}.${start}`).digest("hex").slice(0, 40);
}

export function verifyBooking(bookingId: string, start: number, token: string) {
  if (!BOOKING_ID.test(bookingId) || !Number.isFinite(start) || !/^[a-f0-9]{40}$/.test(token)) return false;
  const expected = Buffer.from(signBooking(bookingId, start));
  const given = Buffer.from(token);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export function confirmUrl(bookingId: string, start: number) {
  const q = new URLSearchParams({ b: bookingId, s: String(start), t: signBooking(bookingId, start) });
  return `${SITE}/api/confirm-call?${q.toString()}`;
}

export const confirmations = () => getStore("call-confirmations", { consistency: "strong" });

export type Confirmation = { bookingId: string; start: number; confirmedAt: string };

/** "Friday, Nov 20 at 11:40 AM" in the given zone. */
export function callWhen(start: number, timeZone: string) {
  const d = new Date(start);
  const day = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "long", month: "short", day: "numeric" }).format(d);
  return `${day} at ${callTime(start, timeZone)}`;
}

export function callTime(start: number, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" }).format(new Date(start));
}

/** The calendar date (YYYY-MM-DD) of an instant in a zone. */
export function dateIn(at: number, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(at));
}

export function isTimeZone(zone: string | undefined): zone is string {
  if (!zone) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}
