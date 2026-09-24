"use client";

import { useEffect, useLayoutEffect, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

interface Props {
  open: boolean;
  anchorRef: RefObject<HTMLElement>;
  onClose: () => void;
  children: ReactNode;
  /** Masaüstünde tercih edilen genişlik; tetikleyiciden dar olamaz. */
  width?: number;
  /** Menü içi maksimum yükseklik (viewport'a göre daha da kısılır). */
  maxHeight?: number;
  className?: string;
  ariaLabel?: string;
}

const GAP = 6;
const MARGIN = 8;
const SHEET_BREAKPOINT = 640;

interface Placement {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
  above: boolean;
  sheet: boolean;
}

function computePlacement(anchor: HTMLElement, width: number, maxHeight: number): Placement {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (vw <= SHEET_BREAKPOINT) {
    return { top: 0, left: 0, width: vw, maxHeight: Math.round(vh * 0.8), above: false, sheet: true };
  }
  const rect = anchor.getBoundingClientRect();
  const w = Math.min(Math.max(width, rect.width), vw - MARGIN * 2);
  let left = rect.left;
  if (left + w > vw - MARGIN) left = Math.max(MARGIN, vw - MARGIN - w);
  const below = vh - rect.bottom - GAP - MARGIN;
  const aboveSpace = rect.top - GAP - MARGIN;
  // Altta yer yoksa ve üstte daha çok yer varsa yukarı aç
  const above = below < Math.min(maxHeight, 260) && aboveSpace > below;
  const avail = above ? aboveSpace : below;
  const mh = Math.max(160, Math.min(maxHeight, avail));
  const top = above ? rect.top - GAP - mh : rect.bottom + GAP;
  return { top, left, width: w, maxHeight: mh, above, sheet: false };
}

/**
 * Tetikleyiciye bağlı, `document.body`'ye portal ile çizilen açılır panel.
 * Sayfa altında kalmaz: viewport'a sığmazsa yukarı açılır, yüksekliği viewport'a göre
 * kısılır; telefonda alttan açılan sayfa (bottom sheet) olur. Dış tıklama ve Escape kapatır.
 */
export default function AnchoredPopover({
  open, anchorRef, onClose, children, width = 360, maxHeight = 380, className = "", ariaLabel,
}: Props) {
  const [placement, setPlacement] = useState<Placement | null>(null);
  const [panel, setPanel] = useState<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) return;
    const update = () => {
      if (anchorRef.current) setPlacement(computePlacement(anchorRef.current, width, maxHeight));
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, anchorRef, width, maxHeight]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node;
      if (panel?.contains(target) || anchorRef.current?.contains(target)) return;
      onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("touchstart", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("touchstart", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose, panel, anchorRef]);

  // Bottom sheet açıkken arka plan kaymasın
  useEffect(() => {
    if (!open || !placement?.sheet) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open, placement?.sheet]);

  if (!open || !placement || typeof document === "undefined") return null;

  const style: React.CSSProperties = placement.sheet
    ? { position: "fixed", left: 0, right: 0, bottom: 0, maxHeight: placement.maxHeight }
    : { position: "fixed", top: placement.top, left: placement.left, width: placement.width, maxHeight: placement.maxHeight };

  return createPortal(
    <>
      {placement.sheet && <div className="bs-pop-backdrop" onClick={onClose} aria-hidden="true" />}
      <div
        ref={setPanel}
        className={`bs-pop${placement.sheet ? " is-sheet" : ""}${placement.above ? " is-above" : ""} ${className}`}
        style={style}
        role="dialog"
        aria-label={ariaLabel}
      >
        {placement.sheet && <div className="bs-pop-grip" aria-hidden="true" />}
        {children}
      </div>
    </>,
    document.body,
  );
}
