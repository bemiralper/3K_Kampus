'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { FieldMapping } from '../../../../components/olcme/types';
import s from '../olcme.module.css';

interface Props {
  lines: string[];
  mappings: FieldMapping[];
  getColorIndex: (field: string) => number;
  selStart: number | null;
  selEnd: number | null;
  onRange: (start: number, end: number) => void;
  onContextMenu?: (event: React.MouseEvent) => void;
  maxHeight?: number;
}

function OverlayLayer({ gridRef, mappings, selLo, selHi, getColorIndex, linesCount }: {
  gridRef: React.RefObject<HTMLDivElement | null>;
  mappings: FieldMapping[];
  selLo: number | null;
  selHi: number | null;
  getColorIndex: (field: string) => number;
  linesCount: number;
}) {
  const [metrics, setMetrics] = useState<{ offsetPx: number; chPx: number; rulerH: number } | null>(null);

  const remeasure = useCallback(() => {
    const grid = gridRef.current;
    if (!grid) return false;
    const datGridEl = (grid.querySelector(`.${s.datGrid}`) as HTMLElement) || grid;
    const spans = grid.querySelectorAll('[data-text-line]');
    let textSpan: HTMLElement | null = null;
    for (const el of spans) {
      const node = el as HTMLElement;
      if ((node.textContent?.length || 0) > 0 && node.getBoundingClientRect().width > 0) {
        textSpan = node;
        break;
      }
    }
    if (!textSpan) return false;
    const gridRect = datGridEl.getBoundingClientRect();
    const spanRect = textSpan.getBoundingClientRect();
    const len = textSpan.textContent?.length || 1;
    const chW = spanRect.width / len;
    if (chW <= 0.5) return false;
    const offsetPx = spanRect.left - gridRect.left;
    const rulerLine = datGridEl.querySelector(`.${s.datRulerLine}`) as HTMLElement | null;
    const rulerH = rulerLine ? rulerLine.getBoundingClientRect().height : 22;
    setMetrics(prev => {
      if (
        prev
        && Math.abs(prev.offsetPx - offsetPx) < 0.5
        && Math.abs(prev.chPx - chW) < 0.05
        && Math.abs(prev.rulerH - rulerH) < 0.5
      ) return prev;
      return { offsetPx, chPx: chW, rulerH };
    });
    return true;
  }, [gridRef]);

  useLayoutEffect(() => {
    if (remeasure()) return;
    let attempts = 0;
    let raf = 0;
    const tick = () => {
      if (remeasure() || attempts++ > 24) return;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [remeasure, linesCount, mappings.length]);

  useLayoutEffect(() => {
    if (!metrics) remeasure();
  }, [remeasure, metrics, selLo, selHi]);

  useEffect(() => {
    const grid = gridRef.current;
    const handler = () => { remeasure(); };
    window.addEventListener('resize', handler);
    const fontsReady = document.fonts?.ready?.then(handler);
    let ro: ResizeObserver | null = null;
    if (grid && typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(handler);
      ro.observe(grid);
    }
    return () => {
      window.removeEventListener('resize', handler);
      ro?.disconnect();
      fontsReady?.catch(() => undefined);
    };
  }, [remeasure, gridRef]);

  const offsetPx = metrics?.offsetPx ?? 54;
  const chPx = metrics?.chPx ?? 7.5;
  const rulerH = metrics?.rulerH ?? 22;

  return (
    <>
      {mappings.map(m => {
        const colorIdx = getColorIndex(m.field) % 4;
        return (
          <div key={m.field} className={`${s.datMappedCol} ${s[`mapColor${colorIdx}`]}`}
            style={{
              left: `${offsetPx + m.start * chPx}px`,
              width: `${(m.end - m.start) * chPx}px`,
              top: `${rulerH}px`,
              height: `calc(100% - ${rulerH}px)`,
            }}>
            <span className={`${s.datMappedLabel} ${s[`mapLabelColor${colorIdx}`]}`}>{m.label}</span>
          </div>
        );
      })}
      {selLo !== null && selHi !== null && (
        <div className={s.datSelection}
          style={{
            left: `${offsetPx + selLo * chPx}px`,
            width: `${Math.max(selHi - selLo, 1) * chPx}px`,
            top: `${rulerH}px`,
            height: `calc(100% - ${rulerH}px)`,
          }}
        />
      )}
    </>
  );
}

export default function DatColumnPreview({
  lines, mappings, getColorIndex, selStart, selEnd, onRange, onContextMenu, maxHeight = 460,
}: Props) {
  const gridRef = useRef<HTMLDivElement>(null);
  const chWidthRef = useRef(0);
  const draggingRef = useRef(false);
  const anchorRef = useRef<number | null>(null);
  const touchScrollRef = useRef(false);
  const dragClientXRef = useRef<number | null>(null);
  const dragScrollRafRef = useRef(0);
  const dragScrollFrameRef = useRef<() => void>(() => {});
  const [hScroll, setHScroll] = useState({ left: 0, max: 0 });

  const maxLen = lines.reduce((max, line) => Math.max(max, line.length), 0);
  const rulerChars = Array.from({ length: Math.min(maxLen, 4000) }, (_, i) => i);
  const selLo = selStart !== null && selEnd !== null ? Math.min(selStart, selEnd) : null;
  const selHi = selStart !== null && selEnd !== null ? Math.max(selStart, selEnd) : null;

  const charPosFromEvent = useCallback((e: { clientX: number; target: EventTarget | null }): number | null => {
    const grid = gridRef.current;
    if (!grid) return null;
    const target = e.target as HTMLElement | null;
    const line = target?.closest(`.${s.datGridLine}`) as HTMLElement | null;
    let textSpan: HTMLElement | null = line?.querySelector('[data-text-line]') ?? null;
    if (!textSpan) textSpan = grid.querySelector('[data-text-line]');
    if (!textSpan) return null;
    const spanRect = textSpan.getBoundingClientRect();
    const len = textSpan.textContent?.length || 1;
    const measured = spanRect.width / len;
    const chW = measured > 0.5 ? measured : (chWidthRef.current || 7.5);
    chWidthRef.current = chW;
    return Math.max(0, Math.floor((e.clientX - spanRect.left) / chW));
  }, []);

  const stopColumnDrag = () => {
    draggingRef.current = false;
    dragClientXRef.current = null;
    if (dragScrollRafRef.current) {
      cancelAnimationFrame(dragScrollRafRef.current);
      dragScrollRafRef.current = 0;
    }
  };

  dragScrollFrameRef.current = () => {
    const wrap = gridRef.current;
    const clientX = dragClientXRef.current;
    if (!wrap || clientX === null || !draggingRef.current) return;
    const rect = wrap.getBoundingClientRect();
    const edge = 56;
    let delta = 0;
    if (clientX > rect.right - edge) delta = Math.min(42, 10 + (clientX - (rect.right - edge)) * 0.45);
    else if (clientX < rect.left + edge) delta = -Math.min(42, 10 + ((rect.left + edge) - clientX) * 0.45);
    if (delta === 0) return;
    wrap.scrollLeft += delta;
    const textSpan = wrap.querySelector('[data-text-line]') as HTMLElement | null;
    if (!textSpan) return;
    const spanRect = textSpan.getBoundingClientRect();
    const len = textSpan.textContent?.length || 1;
    const measured = spanRect.width / len;
    const chW = measured > 0.5 ? measured : (chWidthRef.current || 7.5);
    chWidthRef.current = chW;
    const anchor = anchorRef.current ?? Math.max(0, Math.floor((clientX - spanRect.left) / chW));
    onRange(anchor, Math.max(0, Math.floor((clientX - spanRect.left) / chW)));
  };

  const ensureDragScroll = () => {
    if (dragScrollRafRef.current) return;
    const loop = () => {
      if (!draggingRef.current) {
        dragScrollRafRef.current = 0;
        return;
      }
      dragScrollFrameRef.current();
      dragScrollRafRef.current = requestAnimationFrame(loop);
    };
    dragScrollRafRef.current = requestAnimationFrame(loop);
  };

  useEffect(() => {
    const handleUp = () => stopColumnDrag();
    document.addEventListener('mouseup', handleUp);
    return () => {
      document.removeEventListener('mouseup', handleUp);
      if (dragScrollRafRef.current) cancelAnimationFrame(dragScrollRafRef.current);
    };
  }, []);

  useEffect(() => {
    const wrap = gridRef.current;
    if (!wrap) return;
    const sync = () => {
      const max = Math.max(0, wrap.scrollWidth - wrap.clientWidth);
      const left = wrap.scrollLeft;
      setHScroll(prev => (prev.left === left && prev.max === max ? prev : { left, max }));
    };
    sync();
    const raf = requestAnimationFrame(sync);
    wrap.addEventListener('scroll', sync, { passive: true });
    const ro = new ResizeObserver(sync);
    ro.observe(wrap);
    if (wrap.firstElementChild) ro.observe(wrap.firstElementChild);
    return () => {
      cancelAnimationFrame(raf);
      wrap.removeEventListener('scroll', sync);
      ro.disconnect();
    };
  }, [lines]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'touch') {
      touchScrollRef.current = true;
      window.setTimeout(() => { touchScrollRef.current = false; }, 700);
      return;
    }
    if (touchScrollRef.current) {
      touchScrollRef.current = false;
      return;
    }
    if (e.button !== 0 || e.ctrlKey) return;
    const wrap = gridRef.current;
    if (wrap) {
      const rect = wrap.getBoundingClientRect();
      const barX = wrap.offsetWidth - wrap.clientWidth;
      const barY = wrap.offsetHeight - wrap.clientHeight;
      if ((barX > 1 && e.clientX >= rect.right - barX - 4) || (barY > 1 && e.clientY >= rect.bottom - barY - 4)) return;
    }
    const pos = charPosFromEvent(e);
    if (pos === null) return;
    if (mappings.some(m => pos >= m.start && pos < m.end)) return;
    anchorRef.current = pos;
    onRange(pos, pos);
    draggingRef.current = true;
    dragClientXRef.current = e.clientX;
    ensureDragScroll();
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!draggingRef.current || anchorRef.current === null) return;
    dragClientXRef.current = e.clientX;
    const pos = charPosFromEvent(e);
    if (pos !== null) onRange(anchorRef.current, pos);
  };

  return (
    <div className={s.datPreviewContainer}>
      <div
        ref={gridRef}
        className={s.datGridWrap}
        style={{ maxHeight }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => stopColumnDrag()}
        onContextMenu={event => {
          event.preventDefault();
          event.stopPropagation();
          onContextMenu?.(event);
        }}
      >
        <div className={s.datGrid}>
          <span className={`${s.datGridLine} ${s.datRulerLine}`}>
            <span className={s.datGridLineNum} style={{ visibility: 'hidden' }}>0</span>
            <span className={s.datRulerContent} data-ruler>
              {rulerChars.map(i => (
                <span key={i} className={s.datRulerChar}>{i % 10 === 0 ? i : (i % 5 === 0 ? '·' : '')}</span>
              ))}
            </span>
          </span>
          {lines.map((line, idx) => (
            <span key={idx} className={s.datGridLine}>
              <span className={s.datGridLineNum}>{idx + 1}</span>
              <span className={s.datLineText} data-text-line>{line || ' '}</span>
            </span>
          ))}
          <OverlayLayer
            gridRef={gridRef}
            mappings={mappings}
            selLo={selLo}
            selHi={selHi}
            getColorIndex={getColorIndex}
            linesCount={lines.length}
          />
        </div>
      </div>
      {hScroll.max > 1 && (
        <input
          type="range"
          className={s.datHScroll}
          min={0}
          max={hScroll.max}
          value={Math.min(hScroll.left, hScroll.max)}
          onChange={e => {
            const left = Number(e.target.value);
            if (gridRef.current) gridRef.current.scrollLeft = left;
            setHScroll(prev => ({ ...prev, left }));
          }}
          aria-label="Satırı sağa sola kaydır"
        />
      )}
    </div>
  );
}
