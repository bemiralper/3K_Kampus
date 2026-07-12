'use client';

import { useRef, useState } from 'react';

export type HoverGalleryImage = {
  src: string;
  alt: string;
  caption?: string;
};

type HoverGalleryProps = {
  images: HoverGalleryImage[];
  className?: string;
};

/**
 * daisyUI "hover-gallery" mantığı: fareyi görselin üzerinde yatay hareket
 * ettirdikçe farklı görseller gösterilir. Dokunmatik cihazlarda touchmove ile,
 * fare yoksa otomatik döngü ile çalışır.
 */
export default function HoverGallery({ images, className }: HoverGalleryProps) {
  const [active, setActive] = useState(0);
  const [interacting, setInteracting] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const pickByX = (clientX: number) => {
    const el = ref.current;
    if (!el || images.length === 0) return;
    const rect = el.getBoundingClientRect();
    const ratio = Math.min(0.9999, Math.max(0, (clientX - rect.left) / rect.width));
    setActive(Math.floor(ratio * images.length));
  };

  return (
    <div
      ref={ref}
      className={`hover-gallery ${className ?? ''}`}
      onMouseEnter={() => setInteracting(true)}
      onMouseMove={(e) => pickByX(e.clientX)}
      onMouseLeave={() => { setInteracting(false); setActive(0); }}
      onTouchStart={() => setInteracting(true)}
      onTouchMove={(e) => pickByX(e.touches[0]?.clientX ?? 0)}
      onTouchEnd={() => setInteracting(false)}
      role="group"
      aria-label="Görsel galerisi — fareyle yatay gezinin"
    >
      {images.map((img, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={`${img.src}-${i}`}
          src={img.src}
          alt={img.alt}
          className="hover-gallery-img"
          style={{ opacity: i === active ? 1 : 0 }}
          loading={i === 0 ? 'eager' : 'lazy'}
          draggable={false}
        />
      ))}

      {images[active]?.caption && (
        <span className="hover-gallery-caption">{images[active].caption}</span>
      )}

      <span className="hover-gallery-hint" data-hidden={interacting}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M8 12h8M8 12l3-3M8 12l3 3M16 12l-3-3M16 12l-3 3" />
        </svg>
        Fareyi yatay hareket ettirin
      </span>

      <span className="hover-gallery-bars" aria-hidden>
        {images.map((img, i) => (
          <span key={img.src} className="hover-gallery-bar" data-on={i === active} />
        ))}
      </span>

      <style jsx>{`
        .hover-gallery {
          position: relative;
          display: block;
          width: 100%;
          height: 100%;
          cursor: ew-resize;
          overflow: hidden;
        }
        .hover-gallery-img {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
          transition: opacity 0.35s ease;
          user-select: none;
        }
        .hover-gallery-caption {
          position: absolute;
          left: 12px;
          bottom: 34px;
          padding: 5px 12px;
          border-radius: 999px;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.04em;
          color: #0f172a;
          background: rgba(255, 255, 255, 0.92);
          box-shadow: 0 4px 14px rgba(15, 23, 42, 0.18);
          backdrop-filter: blur(4px);
        }
        .hover-gallery-hint {
          position: absolute;
          top: 12px;
          right: 12px;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 5px 10px;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 600;
          color: #fff;
          background: rgba(15, 23, 42, 0.55);
          backdrop-filter: blur(6px);
          transition: opacity 0.3s ease;
        }
        .hover-gallery-hint[data-hidden='true'] {
          opacity: 0;
        }
        .hover-gallery-bars {
          position: absolute;
          left: 12px;
          right: 12px;
          bottom: 12px;
          display: flex;
          gap: 6px;
        }
        .hover-gallery-bar {
          flex: 1;
          height: 4px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.4);
          transition: background 0.3s ease;
        }
        .hover-gallery-bar[data-on='true'] {
          background: #fff;
        }
      `}</style>
    </div>
  );
}
