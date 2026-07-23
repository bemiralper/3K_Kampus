"use client";

import type { CSSProperties } from "react";

interface BookContentCompleteBadgeProps {
  style?: CSSProperties;
  className?: string;
}

/** Tamamlanmış kitap içeriği rozeti — yalnızca icerik_tamamlandi_mi true iken gösterin. */
export function BookContentCompleteBadge({ style, className }: BookContentCompleteBadgeProps) {
  return (
    <span
      className={className ?? "badge badge-success"}
      style={{ fontSize: 11, flexShrink: 0, whiteSpace: "nowrap", ...style }}
      title="Ünite, konu ve içerik girişi tamamlandı"
    >
      ✓ İçerik Tamam
    </span>
  );
}
