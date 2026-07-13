'use client';

import { useCallback, useEffect } from 'react';
import type { PublicContentGorsel } from '@/lib/website-api';
import { resolveMediaUrl } from '@/lib/website-api';

type Props = {
  images: PublicContentGorsel[];
  index: number;
  onClose: () => void;
  onChange: (idx: number) => void;
};

export default function ContentLightbox({ images, index, onClose, onChange }: Props) {
  const prev = useCallback(() => onChange((index - 1 + images.length) % images.length), [index, images.length, onChange]);
  const next = useCallback(() => onChange((index + 1) % images.length), [index, images.length, onChange]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') prev();
      if (e.key === 'ArrowRight') next();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, prev, next]);

  const img = images[index];
  if (!img) return null;
  const src = resolveMediaUrl(img.url || img.thumb) || '';

  return (
    <div className="wc-lightbox wc-scope" role="dialog" aria-modal="true" onClick={onClose}>
      <button type="button" className="wc-lightbox__close" onClick={onClose} aria-label="Kapat">✕</button>
      {images.length > 1 && (
        <>
          <button type="button" className="wc-lightbox__nav wc-lightbox__nav--prev" onClick={(e) => { e.stopPropagation(); prev(); }} aria-label="Önceki">‹</button>
          <button type="button" className="wc-lightbox__nav wc-lightbox__nav--next" onClick={(e) => { e.stopPropagation(); next(); }} aria-label="Sonraki">›</button>
        </>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={img.baslik || ''} onClick={(e) => e.stopPropagation()} />
    </div>
  );
}
