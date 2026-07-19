'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';

interface CoachPhotoLightboxProps {
  photoUrl: string;
  alt: string;
  onClose: () => void;
}

export default function CoachPhotoLightbox({ photoUrl, alt, onClose }: CoachPhotoLightboxProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="coach-photo-lightbox"
      onClick={onClose}
      role="dialog"
      aria-label={`${alt} — büyük fotoğraf`}
    >
      <button
        type="button"
        className="coach-photo-lightbox-close"
        onClick={onClose}
        aria-label="Kapat"
      >
        ×
      </button>
      <div className="coach-photo-lightbox-frame" onClick={(e) => e.stopPropagation()}>
        <img src={photoUrl} alt={alt} />
      </div>
      <p className="coach-photo-lightbox-caption">{alt}</p>
    </div>,
    document.body
  );
}
