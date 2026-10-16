'use client';

import React, { useEffect, useState } from 'react';

type Props = {
  src: string;
  alt?: string;
  onClose: () => void;
};

export default function GorevImageLightbox({ src, alt, onClose }: Props) {
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === '+' || event.key === '=') setScale(value => Math.min(4, +(value + 0.25).toFixed(2)));
      if (event.key === '-' || event.key === '_') setScale(value => Math.max(0.5, +(value - 0.25).toFixed(2)));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="gorev-zoom" role="dialog" aria-modal="true" aria-label="Görsel büyütme" onClick={onClose}>
      <div className="gorev-zoom-bar" onClick={event => event.stopPropagation()}>
        <button type="button" onClick={() => setScale(value => Math.max(0.5, +(value - 0.25).toFixed(2)))} aria-label="Uzaklaştır">−</button>
        <span>{Math.round(scale * 100)}%</span>
        <button type="button" onClick={() => setScale(value => Math.min(4, +(value + 0.25).toFixed(2)))} aria-label="Yakınlaştır">+</button>
        <button type="button" onClick={() => setScale(1)}>Sığdır</button>
        <button type="button" onClick={onClose}>Kapat</button>
      </div>
      <img
        src={src}
        alt={alt || ''}
        style={{ transform: `scale(${scale})` }}
        onClick={event => event.stopPropagation()}
        onWheel={event => {
          event.preventDefault();
          event.stopPropagation();
          setScale(value => {
            const next = value + (event.deltaY < 0 ? 0.15 : -0.15);
            return Math.min(4, Math.max(0.5, +next.toFixed(2)));
          });
        }}
      />
    </div>
  );
}
