'use client';

import React, { useEffect, useRef, useState } from 'react';
import katex from 'katex';
import GorevImageLightbox from '@/components/gorev/GorevImageLightbox';
import { looksLikeHtml, sanitizeGorevHtml } from './editor/html';
import 'katex/dist/katex.min.css';
import './editor/gorev-editor.css';

export default function GorevAciklamaView({ value }: { value?: string | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const html = Boolean(value && looksLikeHtml(value));
  const [zoom, setZoom] = useState<{ src: string; alt: string } | null>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root || !value || !html) return;
    root.innerHTML = sanitizeGorevHtml(value);
    root.querySelectorAll<HTMLElement>('.gorev-file-card').forEach(card => {
      const link = card.querySelector('a');
      if (!link) return;
      if (!card.querySelector('.gorev-file-icon')) {
        const icon = document.createElement('span');
        icon.className = 'gorev-file-icon';
        icon.setAttribute('aria-hidden', 'true');
        icon.textContent = '📄';
        card.prepend(icon);
      }
      if (!card.querySelector('.gorev-file-meta')) {
        const meta = document.createElement('span');
        meta.className = 'gorev-file-meta';
        link.before(meta);
        meta.appendChild(link);
      }
      if (!card.querySelector('.gorev-file-open')) {
        const open = document.createElement('a');
        open.className = 'gorev-file-open';
        open.href = link.getAttribute('href') || link.href;
        open.target = '_blank';
        open.rel = 'noopener noreferrer';
        open.textContent = 'Aç';
        card.appendChild(open);
      }
    });
    root.querySelectorAll<HTMLElement>('[data-latex]').forEach(el => {
      const latex = el.getAttribute('data-latex') || '';
      const display = el.getAttribute('data-type') === 'mathBlock';
      try {
        katex.render(latex, el, { throwOnError: false, displayMode: display });
      } catch {
        el.textContent = latex;
      }
    });
  }, [value, html]);

  if (!value) return null;
  if (!html) return <p className="gorev-drawer-desc gorev-plain-text">{value}</p>;
  return (
    <>
      <div
        ref={ref}
        className="gorev-drawer-desc gorev-rich-view"
        onClick={event => {
          const target = event.target as HTMLElement;
          if (target.tagName !== 'IMG') return;
          const image = target as HTMLImageElement;
          if (!image.src) return;
          event.preventDefault();
          setZoom({ src: image.src, alt: image.alt || '' });
        }}
      />
      {zoom ? <GorevImageLightbox src={zoom.src} alt={zoom.alt} onClose={() => setZoom(null)} /> : null}
    </>
  );
}
