"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const EmojiPicker = dynamic(
  () => import("emoji-picker-react").then((mod) => mod.default),
  { ssr: false },
);

interface EmojiPickerPortalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (emoji: string) => void;
  triggerRef: React.RefObject<HTMLElement | null>;
  width?: number;
  height?: number;
}

export default function EmojiPickerPortal({
  open,
  onClose,
  onSelect,
  triggerRef,
  width = 320,
  height = 360,
}: EmojiPickerPortalProps) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const gap = 8;
    const pickerHeight = height + gap;
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < pickerHeight && rect.top > pickerHeight;

    let top = openUp ? rect.top - height - gap : rect.bottom + gap;
    let left = rect.left;

    const maxLeft = window.innerWidth - width - 8;
    if (left > maxLeft) left = Math.max(8, maxLeft);
    if (left < 8) left = 8;

    if (top < 8) top = 8;
    if (top + height > window.innerHeight - 8) {
      top = Math.max(8, window.innerHeight - height - 8);
    }

    setPosition({ top, left });
  }, [triggerRef, height]);

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (popoverRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      onClose();
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open, onClose, triggerRef]);

  if (!mounted || !open || !position) return null;

  return createPortal(
    <div
      ref={popoverRef}
      className="comm-emoji-portal"
      style={{ top: position.top, left: position.left, width }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <EmojiPicker
        onEmojiClick={(emoji) => {
          onSelect(emoji.emoji);
          onClose();
        }}
        width={width}
        height={height}
        lazyLoadEmojis
      />
    </div>,
    document.body,
  );
}
