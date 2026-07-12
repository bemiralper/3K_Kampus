'use client';

import { useEffect, useRef, type ReactNode } from 'react';

type Direction = 'up' | 'down' | 'left' | 'right' | 'zoom' | 'none';

type Props = {
  children: ReactNode;
  className?: string;
  /** Edly/AOS tarzı yön */
  from?: Direction;
  /** ms gecikme (stagger için) */
  delay?: number;
};

/**
 * Scroll reveal — Edly’deki AOS/WOW benzeri fade + slide.
 */
export default function CmsReveal({
  children,
  className = '',
  from = 'up',
  delay = 0,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const reduce =
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reduce) {
      el.classList.add('is-visible');
      return;
    }

    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add('is-visible');
          obs.disconnect();
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.12 },
    );

    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`cms-aos cms-aos-${from} ${className}`.trim()}
      style={{ transitionDelay: delay ? `${delay}ms` : undefined }}
    >
      {children}
    </div>
  );
}
