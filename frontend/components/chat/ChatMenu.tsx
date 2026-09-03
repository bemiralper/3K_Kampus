"use client";

import { ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export interface ChatMenuItem {
  id: string;
  label: string;
  icon?: ReactNode;
  danger?: boolean;
  disabled?: boolean;
  /** Üstünde ayırıcı çizgi göster. */
  separated?: boolean;
  onSelect: () => void;
}

interface Props {
  items: ChatMenuItem[];
  anchor: { x: number; y: number } | null;
  onClose: () => void;
  /** Menü sola hizalansın (satır sonundaki butonlar için). */
  align?: "left" | "right";
}

/**
 * Portal üzerinden açılan bağlam menüsü.
 *
 * Mesaj balonları ve liste satırları `overflow: hidden` kapsayıcılar içinde
 * olduğu için menü DOM ağacında değil, body'de render edilir.
 */
export function ChatMenu({ items, anchor, onClose, align = "right" }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!anchor || !ref.current) {
      setPosition(null);
      return;
    }
    const rect = ref.current.getBoundingClientRect();
    const margin = 8;
    let left = align === "right" ? anchor.x - rect.width : anchor.x;
    left = Math.min(Math.max(margin, left), window.innerWidth - rect.width - margin);
    let top = anchor.y;
    if (top + rect.height > window.innerHeight - margin) {
      top = Math.max(margin, anchor.y - rect.height);
    }
    setPosition({ top, left });
  }, [anchor, align, items.length]);

  useEffect(() => {
    if (!anchor) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onScroll = () => onClose();
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [anchor, onClose]);

  if (!anchor || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={ref}
      className="chat-menu"
      role="menu"
      style={
        position
          ? { top: position.top, left: position.left }
          : { top: anchor.y, left: anchor.x, visibility: "hidden" }
      }
    >
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="menuitem"
          className={`chat-menu-item${item.danger ? " is-danger" : ""}${
            item.separated ? " is-separated" : ""
          }`}
          disabled={item.disabled}
          onClick={() => {
            onClose();
            item.onSelect();
          }}
        >
          {item.icon ? <span className="chat-menu-icon">{item.icon}</span> : null}
          <span>{item.label}</span>
        </button>
      ))}
    </div>,
    document.body,
  );
}

/** Menü açma yardımcısı: tıklanan butonun altına hizala. */
export function anchorFromEvent(e: React.MouseEvent): { x: number; y: number } {
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
  return { x: rect.right, y: rect.bottom + 4 };
}
