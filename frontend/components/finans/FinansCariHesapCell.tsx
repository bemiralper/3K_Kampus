"use client";

import type { CariHesapTuru } from "@/app/finans/types/cari-hesap-types";
import { HESAP_TURLERI } from "@/app/finans/types/cari-hesap-types";

type FinansCariHesapCellProps = {
  name: string;
  subtitle?: string | null;
  hesapTuru?: CariHesapTuru;
  onClick?: () => void;
};

export default function FinansCariHesapCell({
  name,
  subtitle,
  hesapTuru,
  onClick,
}: FinansCariHesapCellProps) {
  const turMeta = hesapTuru ? HESAP_TURLERI.find((h) => h.value === hesapTuru) : null;

  const inner = (
    <>
      <span className="finans-cari-name">{name || "—"}</span>
      {(subtitle || turMeta) && (
        <span className="finans-cari-meta">
          {[turMeta?.label, subtitle].filter(Boolean).join(" · ")}
        </span>
      )}
    </>
  );

  if (onClick) {
    return (
      <button type="button" className="finans-cari-cell finans-cari-cell--link" onClick={onClick}>
        {inner}
      </button>
    );
  }

  return <div className="finans-cari-cell">{inner}</div>;
}
