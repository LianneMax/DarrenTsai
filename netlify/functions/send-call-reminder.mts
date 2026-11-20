// Netlify Function: send-call-reminder
//
// The 24-hour reminder for a booked call, with a Confirm my call button
// (booking follow-up plan, decided with Max 20 Nov 2026):
// - only for calls booked more than a day ahead; a lead who books for today
//   or tomorrow just booked, and Google's own confirmation covers it;
// - sent 24 hours before the call; times shown in Pacific (Darren's time) and,
//   when the caller knows it, the lead's own time;
// - the button goes to /api/confirm-call, which records the confirmation.
//
// CALLER. POST with x-api-key = CONTACT_CONFIRM_API_KEY (the same secret the
// Apps Script already holds as NETLIFY_CONTACT_CONFIRM_KEY), body:
//   { email, firstName, bookingId, callStart (ISO), leadTimeZone? (IANA) }
// The scheduler that finds bookings is not built yet: it needs the booking
// details on Darren's calendar, which waits on his Workspace calendar sharing.
//
// PREVIEW. GET /api/send-call-reminder?preview=1 renders a sample reminder for
// a "test-" booking 24 hours out and sends nothing. Its Confirm my call button
// is real, so the whole confirm flow can be checked on the live site.

import type { Config, Context } from "@netlify/functions";
import { guideSender } from "../lib/guide-shared.mts";
import { renderEmail, para, bullets, button, contactLine, COMPLIANCE } from "../lib/email-layout.mts";
import { BOOKING_ID, PACIFIC, RESCHEDULE_URL, callTime, callWhen, confirmUrl, dateIn, isTimeZone } from "../lib/call-confirm.mts";

type Booking = { email?: string; firstName?: string; bookingId?: string; callStart?: string; leadTimeZone?: string };

function parse(lead: Booking) {
  const bookingId = String(lead.bookingId || "");
  const start = Date.parse(String(lead.callStart || ""));
  if (!BOOKING_ID.test(bookingId)) throw new Error("bookingId required");
  if (!Number.isFinite(start)) throw new Error("callStart required");
  const zone = isTimeZone(lead.leadTimeZone) ? lead.leadTimeZone : PACIFIC;
  return { bookingId, start, zone };
}

/** "tomorrow" when the call is on the next calendar day in Pacific, else the weekday. */
function dayWord(start: number, now: number) {
  const tomorrow = dateIn(now + 24 * 3600_000, PACIFIC) === dateIn(start, PACIFIC);
  if (dateIn(now, PACIFIC) === dateIn(start, PACIFIC)) return "today";
  return tomorrow ? "tomorrow" : new Intl.DateTimeFormat("en-US", { timeZone: PACIFIC, weekday: "long" }).format(new Date(start));
}

export function reminderSubject(lead: Booking, now = Date.now()) {
  const { start, zone } = parse(lead);
  const when = zone === PACIFIC ? `${callTime(start, PACIFIC)} Pacific` : callTime(start, zone);
  return `Still good for ${dayWord(start, now)} at ${when}?`;
}

export function buildReminderHtml(lead: Booking, now = Date.now()) {
  const { bookingId, start, zone } = parse(lead);
  const day = dayWord(start, now);
  const pacific = `${callWhen(start, PACIFIC)} Pacific`;
  const yours = zone !== PACIFIC && callTime(start, zone) !== callTime(start, PACIFIC) ? ` (${callTime(start, zone)} your time)` : "";
  const lead_in = day === "tomorrow" || day === "today" ? `${day}, ${pacific}` : pacific;
  return renderEmail({
    title: reminderSubject(lead, now),
    preheader: "Tap Confirm my call so I know the time still works.",
    firstName: lead.firstName,
    headline: `Still good for ${day}?`,
    blocks: [
      para(`Looking forward to our call ${lead_in}${yours}. The Google Meet link is in Google's calendar invite.`),
      para("Tap below so I know the time still works for you."),
      button("Confirm my call", confirmUrl(bookingId, start), 20),
      para("To make the 15 minutes count, have these handy:", 24),
      bullets(["Your latest mortgage statement", "A rough idea of your home's value", "Any balances or goals you want to go over"]),
      para(`Need a different time? Cancel from Google's confirmation email, then <a href="${RESCHEDULE_URL}" style="color:#517686;text-decoration:underline;">pick a new time here</a>.`, 6),
      contactLine(),
    ],
    compliance: COMPLIANCE.standard,
  });
}

const send = guideSender({
  name: "send-call-reminder",
  apiKeyEnv: "CONTACT_CONFIRM_API_KEY",
  subject: (lead) => reminderSubject(lead),
  buildEmailHtml: (lead) => buildReminderHtml(lead),
  buildAttachments: async () => [],
});

/** A sample "test-" booking 24 hours out, on a 20-minute boundary. */
export function previewBooking(now = Date.now()): Booking {
  const slot = 20 * 60_000;
  const start = Math.ceil((now + 24 * 3600_000) / slot) * slot;
  return { firstName: "Alex", bookingId: `test-${now}`, callStart: new Date(start).toISOString(), leadTimeZone: "America/New_York" };
}

export default async (req: Request, context: Context) => {
  if (req.method === "GET" && new URL(req.url).searchParams.get("preview") === "1") {
    return new Response(buildReminderHtml(previewBooking()), {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        "x-robots-tag": "noindex, nofollow",
      },
    });
  }
  return send(req, context);
};

export const config: Config = {
  path: "/api/send-call-reminder",
};
