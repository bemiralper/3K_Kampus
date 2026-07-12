'use client';

import { useEffect, useState } from 'react';

/** Edly tarzı tam ekran preloader — 3K navy/accent */
export default function CmsPreloader() {
  const [hide, setHide] = useState(false);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      setGone(true);
      return;
    }
    const t1 = window.setTimeout(() => setHide(true), 650);
    const t2 = window.setTimeout(() => setGone(true), 1100);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, []);

  if (gone) return null;

  return (
    <div className={`cms-preloader${hide ? ' is-hide' : ''}`} aria-hidden>
      <div className="cms-preloader-spinner" />
    </div>
  );
}
