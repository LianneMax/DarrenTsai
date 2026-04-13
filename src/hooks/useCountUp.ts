import { useEffect, useRef, useState } from 'react';

function easeOutQuad(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

export function useCountUp(target: number, duration = 600): number {
  const [current, setCurrent] = useState(target);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);
  const startValueRef = useRef<number>(target);

  useEffect(() => {
    const startValue = current;
    startValueRef.current = startValue;
    startRef.current = null;

    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
    }

    const animate = (timestamp: number) => {
      if (startRef.current === null) {
        startRef.current = timestamp;
      }
      const elapsed = timestamp - startRef.current;
      const progress = Math.min(elapsed / duration, 1);
      const eased = easeOutQuad(progress);
      const value = Math.round(startValueRef.current + (target - startValueRef.current) * eased);
      setCurrent(value);

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      }
    };

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, duration]);

  return current;
}
