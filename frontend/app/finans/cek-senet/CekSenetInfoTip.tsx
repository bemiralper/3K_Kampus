"use client";

import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Props = {
  /** Kısa erişilebilirlik etiketi */
  label: string;
  /** Gösterilecek açıklama */
  text: string;
  /** İkon boyutu */
  size?: "sm" | "md";
};

type TipPlacement = "top" | "bottom";

type TipPos = {
  top: number;
  left: number;
  placement: TipPlacement;
};

const TIP_MAX_W = 280;
const TIP_GAP = 8;

export default function CekSenetInfoTip({ label, text, size = "sm" }: Props) {
  const tipId = useId();
  const triggerRef = useRef<HTMLSpanElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<TipPos | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const tipH = tipRef.current?.offsetHeight ?? 72;
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;

    let placement: TipPlacement = "bottom";
    let top = rect.bottom + TIP_GAP;

    if (top + tipH > viewportH - TIP_GAP && rect.top - TIP_GAP - tipH >= TIP_GAP) {
      placement = "top";
      top = rect.top - TIP_GAP - tipH;
    } else if (top + tipH > viewportH - TIP_GAP) {
      top = Math.max(TIP_GAP, viewportH - tipH - TIP_GAP);
    }

    const centerX = rect.left + rect.width / 2;
    const halfW = TIP_MAX_W / 2;
    const left = Math.max(
      TIP_GAP + halfW,
      Math.min(viewportW - TIP_GAP - halfW, centerX),
    );

    setPos({ top, left, placement });
  }, []);

  const show = useCallback(() => {
    setOpen(true);
  }, []);

  const hide = useCallback(() => {
    setOpen(false);
    setPos(null);
  }, []);

  useEffect(() => {
    if (!open) return;

    updatePosition();
    const raf = requestAnimationFrame(updatePosition);

    const onReflow = () => updatePosition();
    window.addEventListener("scroll", onReflow, true);
    window.addEventListener("resize", onReflow);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onReflow, true);
      window.removeEventListener("resize", onReflow);
    };
  }, [open, text, updatePosition]);

  return (
    <>
      <span
        ref={triggerRef}
        className={`cs-info-tip cs-info-tip--${size}`}
        tabIndex={0}
        role="button"
        aria-label={label}
        aria-describedby={open ? tipId : undefined}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path
            fillRule="evenodd"
            d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
            clipRule="evenodd"
          />
        </svg>
      </span>
      {mounted && open && pos && createPortal(
        <div
          ref={tipRef}
          id={tipId}
          role="tooltip"
          className={`cs-info-tip__portal cs-info-tip__portal--${pos.placement}`}
          style={{
            position: "fixed",
            top: pos.top,
            left: pos.left,
            transform: "translateX(-50%)",
            maxWidth: TIP_MAX_W,
            zIndex: 200,
          }}
        >
          {text}
        </div>,
        document.body,
      )}
    </>
  );
}
