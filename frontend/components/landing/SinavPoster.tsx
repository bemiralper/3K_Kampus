'use client';

import { useEffect, useState } from 'react';
import { resolveMediaUrl } from '@/lib/website-api';

/** Takvim ve detayda aynı görsel; eksik veya bozuk afiş için nötr yer tutucu. */
export default function SinavPoster({ url, className }: { url?: string | null; className?: string }) {
  const src = resolveMediaUrl(url);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  if (src && !failed) return <img className={className} src={src} alt="" loading="lazy" onError={() => setFailed(true)} />;
  return <span className={`${className || ''} stk-poster-placeholder`} role="img" aria-label="Sınav görseli eklenmemiş">
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <rect x="4" y="3" width="16" height="18" rx="3" /><path d="m8 12 2 2 5-5M8 17h8" />
    </svg>
  </span>;
}
