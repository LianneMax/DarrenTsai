import { useEffect, useRef } from 'react';
import { openBooking } from '../utils/booking';

/** Old shared contact links must enter screening, never revive the retired form. */
export function useBookingEntry() {
  const opened = useRef(false);
  useEffect(() => {
    if (!opened.current && new URLSearchParams(window.location.search).get('contact') === '1') {
      opened.current = true;
      openBooking();
    }
  }, []);
  return openBooking;
}
