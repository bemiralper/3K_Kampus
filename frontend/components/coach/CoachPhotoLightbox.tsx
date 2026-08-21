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
      <style jsx global>{`
        .coach-photo-lightbox {
          position: fixed;
          inset: 0;
          z-index: 13000;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 24px;
          background: rgba(0, 0, 0, 0.88);
          cursor: zoom-out;
        }
        .coach-photo-lightbox-frame {
          max-width: min(92vw, 520px);
          max-height: 75vh;
          border-radius: 12px;
          overflow: hidden;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
          cursor: default;
        }
        .coach-photo-lightbox-frame img {
          display: block;
          width: 100%;
          height: 100%;
          max-height: 75vh;
          object-fit: contain;
        }
        .coach-photo-lightbox-caption {
          margin: 14px 0 0;
          font-size: 14px;
          font-weight: 600;
          color: #fff;
          text-align: center;
        }
        .coach-photo-lightbox-close {
          position: absolute;
          top: 16px;
          right: 16px;
          width: 44px;
          height: 44px;
          border: none;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.15);
          color: #fff;
          font-size: 28px;
          line-height: 1;
          cursor: pointer;
        }
      `}</style>
    </div>,
    document.body
  );
}
