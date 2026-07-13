'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export type CoverAspectId = '16:9' | '1:1' | '4:5';

export type CoverAspectPreset = {
  id: CoverAspectId;
  label: string;
  hint: string;
  width: number;
  height: number;
};

export const COVER_ASPECTS: CoverAspectPreset[] = [
  { id: '16:9', label: '16:9', hint: 'Web kart / yatay', width: 1200, height: 675 },
  { id: '1:1', label: '1:1', hint: 'Instagram kare', width: 1200, height: 1200 },
  { id: '4:5', label: '4:5', hint: 'Instagram dikey', width: 1080, height: 1350 },
];

export const DEFAULT_COVER_ASPECT = COVER_ASPECTS[0];
export const COVER_SIZE_HINT = COVER_ASPECTS.map((a) => `${a.label} ${a.width}×${a.height}`).join(' · ');

const DEFAULT_PREVIEW_W = 420;

type Props = {
  imageSrc: string;
  onCancel: () => void;
  onComplete: (file: File) => void | Promise<void>;
  busy?: boolean;
  initialAspect?: CoverAspectId;
};

/** cover baseScale * userScale, merkez + position offset */
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

export default function CmsCoverCropper({
  imageSrc,
  onCancel,
  onComplete,
  busy,
  initialAspect = '16:9',
}: Props) {
  const imgRef = useRef<HTMLImageElement>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [aspectId, setAspectId] = useState<CoverAspectId>(initialAspect);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [ready, setReady] = useState(false);
  const [previewSize, setPreviewSize] = useState({ w: DEFAULT_PREVIEW_W, h: Math.round(DEFAULT_PREVIEW_W * 9 / 16) });

  const aspect = useMemo(
    () => COVER_ASPECTS.find((a) => a.id === aspectId) || DEFAULT_COVER_ASPECT,
    [aspectId],
  );

  useEffect(() => {
    setReady(false);
    setPosition({ x: 0, y: 0 });
    setScale(1);
  }, [imageSrc]);

  useEffect(() => {
    setPosition({ x: 0, y: 0 });
    setScale(1);
  }, [aspectId]);

  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const sync = () => {
      const w = el.clientWidth || DEFAULT_PREVIEW_W;
      const h = el.clientHeight || Math.round((w * aspect.height) / aspect.width);
      setPreviewSize({ w, h });
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, [aspect]);

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

    const outW = aspect.width;
    const outH = aspect.height;
    canvas.width = outW;
    canvas.height = outH;

    const { scaledW, scaledH, drawX, drawY } = computeCoverDraw(
      img.naturalWidth,
      img.naturalHeight,
      position,
      scale,
      previewW,
      previewH,
    );
    const ratioX = outW / previewW;
    const ratioY = outH / previewH;

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, outW, outH);
    ctx.drawImage(img, drawX * ratioX, drawY * ratioY, scaledW * ratioX, scaledH * ratioY);

    await new Promise<void>((resolve) => {
      canvas.toBlob(
        async (blob) => {
          if (blob) {
            const file = new File([blob], `cover-${aspect.id.replace(':', 'x')}.jpg`, { type: 'image/jpeg' });
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
            <p>
              Oran seçin, sürükleyip yakınlaştırın. Çıktı: {aspect.width}×{aspect.height} ({aspect.label})
            </p>
          </div>
          <button type="button" className="cms-drawer-close" onClick={onCancel} aria-label="Kapat">✕</button>
        </div>

        <div className="cms-cover-aspect-row" role="radiogroup" aria-label="Kapak oranı">
          {COVER_ASPECTS.map((a) => (
            <button
              key={a.id}
              type="button"
              role="radio"
              aria-checked={aspectId === a.id}
              className={`cms-cover-aspect-btn${aspectId === a.id ? ' is-active' : ''}`}
              onClick={() => setAspectId(a.id)}
            >
              <span className="cms-cover-aspect-btn__label">{a.label}</span>
              <span className="cms-cover-aspect-btn__hint">{a.hint}</span>
            </button>
          ))}
        </div>

        <div
          ref={areaRef}
          className="cms-cover-crop-area"
          style={{
            width: DEFAULT_PREVIEW_W,
            maxWidth: '100%',
            aspectRatio: `${aspect.width} / ${aspect.height}`,
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
