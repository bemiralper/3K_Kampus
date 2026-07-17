"use client";

import { useEffect, useState } from "react";
import { resolveMediaUrl } from "@/lib/resolve-media-url";
import "./book-cover.css";

type Size = "sm" | "md" | "lg";

const SIZE_PX: Record<Size, number> = { sm: 40, md: 56, lg: 96 };

interface BookCoverProps {
  src?: string | null;
  alt: string;
  size?: Size;
  className?: string;
  /** false ise tıklanınca büyütme yok */
  zoomable?: boolean;
}

export function BookCover({
  src,
  alt,
  size = "sm",
  className = "",
  zoomable = true,
}: BookCoverProps) {
  const [lightbox, setLightbox] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  const url = resolveMediaUrl(src || null);
  const px = SIZE_PX[size];

  useEffect(() => {
    setImgFailed(false);
  }, [url]);

  if (!url || imgFailed) {
    return (
      <div
        className={`book-cover book-cover--empty ${className}`.trim()}
        style={{ width: px, height: px }}
        aria-hidden
      >
        📖
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        className={`book-cover ${zoomable ? "book-cover--zoomable" : ""} ${className}`.trim()}
        style={{ width: px, height: px }}
        onClick={(e) => {
          e.stopPropagation();
          if (zoomable) setLightbox(true);
        }}
        title={zoomable ? "Büyütmek için tıklayın" : alt}
        aria-label={zoomable ? `${alt} — büyüt` : alt}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={alt}
          width={px}
          height={px}
          onError={() => setImgFailed(true)}
        />
      </button>
      {lightbox && (
        <BookCoverLightbox src={url} alt={alt} onClose={() => setLightbox(false)} />
      )}
    </>
  );
}

function BookCoverLightbox({
  src,
  alt,
  onClose,
}: {
  src: string;
  alt: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div
      className="book-cover-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={`${alt} — büyük kapak`}
      onClick={onClose}
    >
      <button type="button" className="book-cover-lightbox__close" onClick={onClose} aria-label="Kapat">
        ×
      </button>
      <div className="book-cover-lightbox__frame" onClick={(e) => e.stopPropagation()}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} />
      </div>
      <p className="book-cover-lightbox__caption">{alt}</p>
    </div>
  );
}
