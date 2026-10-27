import { useEffect, useRef, useState } from 'react';
import { openBooking } from '../utils/booking';

/** Both equity recaps continue the saved inquiry; neither submits a booking lead. */
export default function SavedLeadCalendar({ firstName }: { firstName: string }) {
  const slot = useRef<HTMLDivElement>(null);
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    const booking = (window as Window & { DTBooking?: { calendar?: (el: Element, lead: object) => boolean } }).DTBooking;
    if (slot.current && booking?.calendar) {
      setDrawn(booking.calendar(slot.current, { firstName: firstName.trim() }));
    }
  }, [firstName]);
  return <>
    <div ref={slot} className="dcp-recap-calendar" />
    {!drawn && <div className="dcp-recap-actions"><button type="button" className="btn btn-teal" onClick={openBooking}>See Darren’s calendar</button></div>}
  </>;
}
