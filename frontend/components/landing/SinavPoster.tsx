'use client';

import { useEffect, useState } from 'react';
import { fitPoster } from '@/lib/crop-poster';
import { resolveMediaUrl } from '@/lib/website-api';

/** Takvim kartında boş kenarı alınmış afiş. Eksik veya bozuk görselde nötr yer tutucu. */
export default function SinavPoster({ url, className }: { url?: string | null; className?: string }) {
  const src = resolveMediaUrl(url);
  const [shown, setShown] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
    if (!src) {
      setShown(null);
      return;
    }
    let cancel = false;
    setShown(null);
    fitPoster(src).then(
      next => { if (!cancel) setShown(next); },
      () => { if (!cancel) setFailed(true); },
    );
    return () => { cancel = true; };
  }, [src]);

  if (shown && !failed) {
    return <img className={className} src={shown} alt="" onError={() => setFailed(true)} />;
  }
  const missing = !src || failed;
  return (
    <span
      className={`${className || ''} stk-poster-placeholder`}
      role="img"
      aria-busy={missing ? undefined : true}
      aria-label={missing ? 'Sınav görseli eklenmemiş' : 'Sınav görseli yükleniyor'}
    >
      {missing && (
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
          <rect x="4" y="3" width="16" height="18" rx="3" /><path d="m8 12 2 2 5-5M8 17h8" />
        </svg>
      )}
    </span>
  );
}
