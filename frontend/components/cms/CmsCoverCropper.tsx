'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/** Landing kartları 16:9 — önerilen kapak çıktısı */
export const COVER_OUTPUT_WIDTH = 1200;
export const COVER_OUTPUT_HEIGHT = 675;
export const COVER_SIZE_HINT = `${COVER_OUTPUT_WIDTH}×${COVER_OUTPUT_HEIGHT} px (16:9)`;

const DEFAULT_PREVIEW_W = 480;
const DEFAULT_PREVIEW_H = Math.round((DEFAULT_PREVIEW_W * COVER_OUTPUT_HEIGHT) / COVER_OUTPUT_WIDTH);

type Props = {
  imageSrc: string;
  onCancel: () => void;
  onComplete: (file: File) => void | Promise<void>;
  busy?: boolean;
};

/**
 * Görünen pan/zoom ile canvas çıktısı aynı matematik:
 * cover baseScale * userScale, merkez + position offset.
 */
export function computeCoverDraw(
  naturalWidth: number,
  naturalHeight: number,
  position: { x: number; y: number },
  scale: number,
  previewW: number,
  previewH: number,
) {
  const baseScale = Math.max(previewW / naturalWidth, previewH / naturalHeight);
  const finalScale = baseScale * scale;
  const scaledW = naturalWidth * finalScale;
  const scaledH = naturalHeight * finalScale;
  const drawX = previewW / 2 - scaledW / 2 + position.x;
  const drawY = previewH / 2 - scaledH / 2 + position.y;
  return { scaledW, scaledH, drawX, drawY, finalScale, baseScale };
}

export default function CmsCoverCropper({ imageSrc, onCancel, onComplete, busy }: Props) {
  const imgRef = useRef<HTMLImageElement>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [ready, setReady] = useState(false);
  const [previewSize, setPreviewSize] = useState({ w: DEFAULT_PREVIEW_W, h: DEFAULT_PREVIEW_H });

  useEffect(() => {
    setReady(false);
    setPosition({ x: 0, y: 0 });
    setScale(1);
  }, [imageSrc]);

  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const sync = () => {
      const w = el.clientWidth || DEFAULT_PREVIEW_W;
      const h = el.clientHeight || Math.round((w * COVER_OUTPUT_HEIGHT) / COVER_OUTPUT_WIDTH);
      setPreviewSize({ w, h });
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setDragging(true);
      setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
    },
    [position],
  );

  const onMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!dragging) return;
      setPosition({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
    },
    [dragging, dragStart],
  );

  const onMouseUp = useCallback(() => setDragging(false), []);

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.08 : 0.08;
    setScale((prev) => Math.min(3, Math.max(0.5, prev + delta)));
  }, []);

  const applyCrop = async () => {
    if (!imgRef.current || !canvasRef.current || !ready) return;
    const img = imgRef.current;
    if (!img.naturalWidth || !img.naturalHeight) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const previewW = areaRef.current?.clientWidth || previewSize.w;
    const previewH = areaRef.current?.clientHeight || previewSize.h;
    if (previewW < 8 || previewH < 8) return;

    canvas.width = COVER_OUTPUT_WIDTH;
    canvas.height = COVER_OUTPUT_HEIGHT;

    const { scaledW, scaledH, drawX, drawY } = computeCoverDraw(
      img.naturalWidth,
      img.naturalHeight,
      position,
      scale,
      previewW,
      previewH,
    );
    const ratioX = COVER_OUTPUT_WIDTH / previewW;
    const ratioY = COVER_OUTPUT_HEIGHT / previewH;

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, COVER_OUTPUT_WIDTH, COVER_OUTPUT_HEIGHT);
    ctx.drawImage(img, drawX * ratioX, drawY * ratioY, scaledW * ratioX, scaledH * ratioY);

    await new Promise<void>((resolve) => {
      canvas.toBlob(
        async (blob) => {
          if (blob) {
            const file = new File([blob], 'cover-1200x675.jpg', { type: 'image/jpeg' });
            await onComplete(file);
          }
          resolve();
        },
        'image/jpeg',
        0.92,
      );
    });
  };

  return (
    <div className="cms-cover-crop-overlay" role="dialog" aria-modal="true" aria-label="Kapak kırp">
      <div className="cms-cover-crop-modal" onClick={(e) => e.stopPropagation()}>
        <div className="cms-cover-crop-head">
          <div>
            <h3>Kapak fotoğrafını ayarla</h3>
            <p>Sürükleyerek konumlandırın, kaydırarak veya slider ile yakınlaştırın. Çıktı: {COVER_SIZE_HINT}</p>
          </div>
          <button type="button" className="cms-drawer-close" onClick={onCancel} aria-label="Kapat">✕</button>
        </div>

        <div
          ref={areaRef}
          className="cms-cover-crop-area"
          style={{
            width: DEFAULT_PREVIEW_W,
            maxWidth: '100%',
            aspectRatio: `${COVER_OUTPUT_WIDTH} / ${COVER_OUTPUT_HEIGHT}`,
          }}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
          onWheel={onWheel}
        >
          <div className="cms-cover-crop-image-wrap">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imgRef}
              src={imageSrc}
              alt=""
              draggable={false}
              onLoad={() => setReady(true)}
              style={{
                transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
                cursor: dragging ? 'grabbing' : 'grab',
              }}
            />
          </div>
          <div className="cms-cover-crop-frame" aria-hidden />
        </div>

        <div className="cms-cover-crop-zoom">
          <button type="button" onClick={() => setScale((s) => Math.max(0.5, s - 0.1))} aria-label="Küçült">−</button>
          <input
            type="range"
            min={0.5}
            max={3}
            step={0.05}
            value={scale}
            onChange={(e) => setScale(parseFloat(e.target.value))}
          />
          <button type="button" onClick={() => setScale((s) => Math.min(3, s + 0.1))} aria-label="Büyüt">+</button>
        </div>

        <div className="cms-cover-crop-actions">
          <button type="button" className="cms-btn cms-btn-ghost" onClick={onCancel} disabled={busy}>İptal</button>
          <button
            type="button"
            className="cms-btn cms-btn-primary"
            onClick={() => void applyCrop()}
            disabled={busy || !ready}
          >
            {busy ? 'Yükleniyor…' : 'Kırp ve yükle'}
          </button>
        </div>
        <canvas ref={canvasRef} hidden />
      </div>
    </div>
  );
}
