'use client';

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';

/** A4 sayfası (210mm ≈ 794px) ve iki yandaki gri pay. */
const DOC_WIDTH = 830;

export interface KarneHtmlFrameHandle {
  print: () => void;
}

/** Sunucunun ürettiği karne belgesi. PDF ile aynı HTML; dar ekranda orantılı küçülür. */
const KarneHtmlFrame = forwardRef<KarneHtmlFrameHandle, { html: string; title: string }>(
  function KarneHtmlFrame({ html, title }, ref) {
    const wrapRef = useRef<HTMLDivElement>(null);
    const frameRef = useRef<HTMLIFrameElement>(null);
    const [height, setHeight] = useState(1200);
    const [scale, setScale] = useState(1);

    useImperativeHandle(ref, () => ({
      print: () => frameRef.current?.contentWindow?.print(),
    }), []);

    const measure = useCallback(() => {
      const doc = frameRef.current?.contentDocument;
      if (doc?.documentElement) setHeight(doc.documentElement.scrollHeight);
    }, []);

    const handleLoad = useCallback(() => {
      measure();
      const doc = frameRef.current?.contentDocument;
      const again = () => requestAnimationFrame(measure);
      doc?.fonts?.ready.then(again);
      if (!doc?.body || doc.body.dataset.fitted === '1') return;
      const obs = new MutationObserver(() => {
        if (doc.body.dataset.fitted === '1') {
          obs.disconnect();
          again();
        }
      });
      obs.observe(doc.body, { attributes: true, attributeFilter: ['data-fitted'] });
    }, [measure]);

    useEffect(() => {
      const wrap = wrapRef.current;
      if (!wrap) return;
      const update = () => setScale(Math.min(1, wrap.clientWidth / DOC_WIDTH));
      update();
      const observer = new ResizeObserver(update);
      observer.observe(wrap);
      return () => observer.disconnect();
    }, []);

    return (
      <div ref={wrapRef} style={{ background: '#e9edf3', overflow: 'hidden', height: Math.ceil(height * scale) }}>
        <iframe
          ref={frameRef}
          title={title}
          srcDoc={html}
          sandbox="allow-same-origin allow-scripts allow-modals"
          onLoad={handleLoad}
          style={{
            display: 'block',
            width: DOC_WIDTH,
            height,
            border: 0,
            margin: scale < 1 ? 0 : '0 auto',
            transform: scale < 1 ? `scale(${scale})` : undefined,
            transformOrigin: 'top left',
          }}
        />
      </div>
    );
  },
);

export default KarneHtmlFrame;
