'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

type RotatingWordsProps = {
  words: string[];
  /** Kelime değişim aralığı (ms) */
  interval?: number;
  className?: string;
};

/**
 * daisyUI "text-rotate" benzeri, dikey kayarak değişen kelime animasyonu.
 * Framer Motion ile; prefers-reduced-motion'da tek kelime sabit gösterir.
 */
export default function RotatingWords({ words, interval = 2200, className }: RotatingWordsProps) {
  const [index, setIndex] = useState(0);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (reduce || words.length <= 1) return;
    const id = setInterval(() => {
      setIndex((prev) => (prev + 1) % words.length);
    }, interval);
    return () => clearInterval(id);
  }, [words.length, interval, reduce]);

  const current = words[index] ?? words[0] ?? '';

  return (
    <span className={className} style={{ display: 'inline-grid', overflow: 'hidden', lineHeight: 1.05 }}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={current}
          style={{ gridArea: '1 / 1', display: 'inline-block' }}
          initial={reduce ? { opacity: 0 } : { y: '0.9em', opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={reduce ? { opacity: 0 } : { y: '-0.9em', opacity: 0 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        >
          {current}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
