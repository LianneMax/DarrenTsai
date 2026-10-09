import { useEffect, useRef } from 'react';

export function useScrollReveal<T extends HTMLElement>(delay?: number) {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // No IntersectionObserver (an old browser, or jsdom): show the element and
    // stop. Adding .reveal without an observer to remove it would leave the
    // section at opacity 0 for good, which is a blank page section, not a
    // missing animation.
    if (typeof IntersectionObserver === 'undefined') return;

    el.classList.add('reveal');
    if (delay !== undefined) {
      el.style.transitionDelay = `${delay}ms`;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('revealed');
            observer.disconnect();
          }
        });
      },
      { threshold: 0.12 }
    );

    observer.observe(el);

    return () => observer.disconnect();
  }, [delay]);

  return ref;
}
