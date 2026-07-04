"use client";

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type FloatingMenuAlign = "start" | "end";

/**
 * Anchored dropdown rendered via a portal with `position: fixed`, so it always
 * stays visible regardless of scroll position or parent `overflow` clipping.
 * Flips upward automatically when there isn't enough room below the anchor.
 */
export default function FloatingMenu({
  open,
  anchorRef,
  onClose,
  className,
  children,
  minWidth = 200,
  align = "end",
}: {
  open: boolean;
  anchorRef: React.RefObject<HTMLElement | null>;
  onClose: () => void;
  className: string;
  children: React.ReactNode;
  minWidth?: number;
  align?: FloatingMenuAlign;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<React.CSSProperties>({
    position: "fixed",
    visibility: "hidden",
    opacity: 0,
    pointerEvents: "none",
  });

  const updatePosition = useCallback(() => {
    const anchor = anchorRef.current;
    const menuEl = menuRef.current;
    if (!open || !anchor || !menuEl) return;

    const rect = anchor.getBoundingClientRect();
    const menuHeight = menuEl.offsetHeight || 0;
    const menuWidth = Math.max(minWidth, menuEl.offsetWidth || minWidth);
    const spaceBelow = window.innerHeight - rect.bottom - 8;
    const spaceAbove = rect.top - 8;
    const openUp = menuHeight > 0 && spaceBelow < menuHeight && spaceAbove > spaceBelow;

    const top = openUp ? rect.top - 6 : rect.bottom + 6;
    const rawLeft = align === "end" ? rect.right - menuWidth : rect.left;
    const left = Math.min(Math.max(8, rawLeft), window.innerWidth - menuWidth - 8);
    const ready = menuHeight > 0;

    setStyle({
      position: "fixed",
      top,
      left,
      minWidth,
      zIndex: 10050,
      visibility: ready ? "visible" : "hidden",
      opacity: ready ? 1 : 0,
      pointerEvents: ready ? "auto" : "none",
      transform: openUp ? "translateY(-100%)" : undefined,
    });
  }, [open, anchorRef, minWidth, align]);

  useLayoutEffect(() => {
    if (!open) {
      setStyle({
        position: "fixed",
        visibility: "hidden",
        opacity: 0,
        pointerEvents: "none",
      });
      return;
    }

    updatePosition();
    const raf = requestAnimationFrame(updatePosition);
    return () => cancelAnimationFrame(raf);
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;

    const onReposition = () => updatePosition();
    window.addEventListener("scroll", onReposition, true);
    window.addEventListener("resize", onReposition);

    return () => {
      window.removeEventListener("scroll", onReposition, true);
      window.removeEventListener("resize", onReposition);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (anchorRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose, anchorRef]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div ref={menuRef} className={className} style={style} role="menu">
      {children}
    </div>,
    document.body,
  );
}
