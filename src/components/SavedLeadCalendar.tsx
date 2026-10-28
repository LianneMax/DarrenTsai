import { useEffect, useRef, useState } from 'react';
import { openBooking } from '../utils/booking';

/** Continue the saved inquiry on any React recap; never submit a booking lead. */
export default function SavedLeadCalendar({ firstName }: { firstName: string }) {
  const slot = useRef<HTMLDivElement>(null);
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    const draw = () => {
      const booking = (window as Window & { DTBooking?: { calendar?: (el: Element, lead: object) => boolean } }).DTBooking;
      if (slot.current && !slot.current.querySelector('iframe') && booking?.calendar) setDrawn(booking.calendar(slot.current, { firstName: firstName.trim() }));
    };
    draw();
    window.addEventListener('dt:booking-ready', draw);
    return () => window.removeEventListener('dt:booking-ready', draw);
  }, [firstName]);
  return <>
    <div ref={slot} className="dcp-recap-calendar" />
    {!drawn && <div className="dcp-recap-actions"><p>Your inquiry is saved. Loading the next step…</p><button type="button" className="btn btn-teal" onClick={openBooking}>Reload scheduling</button></div>}
  </>;
}
