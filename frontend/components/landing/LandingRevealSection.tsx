'use client';

import { useEffect, useRef, type ReactNode } from 'react';

type LandingRevealSectionProps = {
  children: ReactNode;
};

function shouldSkipReveal() {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
    || window.matchMedia('(pointer: coarse)').matches
    || window.matchMedia('(max-width: 1024px)').matches
  );
}

export default function LandingRevealSection({ children }: LandingRevealSectionProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (shouldSkipReveal()) {
      el.classList.add('is-visible');
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add('is-visible');
          observer.disconnect();
        }
      },
      { rootMargin: '0px 0px -4% 0px', threshold: 0.06 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className="landing-reveal">
      {children}
    </div>
  );
}
