'use client';

import { useEffect, useRef, type ReactNode } from 'react';

type LandingRevealSectionProps = {
  children: ReactNode;
  /** Stagger için gecikme (ms) */
  delay?: number;
};

function prefersReducedMotion() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export default function LandingRevealSection({ children, delay = 0 }: LandingRevealSectionProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (prefersReducedMotion()) {
      el.classList.add('is-visible');
      return;
    }

    // Zaten görünürse veya observer desteklenmiyorsa hemen göster
    if (typeof IntersectionObserver === 'undefined') {
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
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
    );

    observer.observe(el);

    // Güvenlik: 1.2s sonra hâlâ gizliyse zorla göster (içerik asla kaybolmasın)
    const fallback = window.setTimeout(() => el.classList.add('is-visible'), 1200);

    return () => {
      observer.disconnect();
      window.clearTimeout(fallback);
    };
  }, []);

  return (
    <div
      ref={ref}
      className="landing-reveal"
      style={delay ? ({ ['--reveal-delay' as string]: `${delay}ms` }) : undefined}
    >
      {children}
    </div>
  );
}
