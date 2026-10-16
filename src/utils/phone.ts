/**
 * US phone formatting as it is typed, the same rule as the static pages and
 * the booking prequal (16 Oct 2026): digits only, a leading 1 dropped as soon
 * as it is typed (it is the country code; no US area code starts with 1), and
 * (XXX) XXX-XXXX. libphonenumber's AsYouType kept "+1 714 555 0123" in
 * international form; every form now shows the same US format. Validation is
 * still isValidPhoneNumber(value, 'US').
 */
export function formatUsPhone(raw: string): string {
  let d = String(raw || '').replace(/\D/g, '');
  if (d.charAt(0) === '1') d = d.slice(1);
  d = d.slice(0, 10);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}
