"use client";

import { BAKIYE_DURUMU_META, CARI_TUTAR_META } from "../../types/cari-hesap-types";

function fmtAmount(value: number) {
  return Number(value).toLocaleString("tr-TR", { minimumFractionDigits: 2 });
}

/** Ödenen / alış tutarı — renk + kısa etiket */
export function CariTutarCell({
  kind,
  amount,
}: {
  kind: "odenen" | "alis";
  amount: number;
}) {
  const meta = CARI_TUTAR_META[kind];

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8 }}>
      <span
        title={meta.hint}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          minWidth: 22,
          height: 22,
          padding: "0 6px",
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.02em",
          color: meta.color,
          background: meta.bg,
          border: `1px solid ${meta.border}`,
          borderRadius: 6,
        }}
      >
        {meta.short}
      </span>
      <span
        style={{
          fontVariantNumeric: "tabular-nums",
          fontWeight: 600,
          color: meta.color,
        }}
      >
        {fmtAmount(amount)} ₺
      </span>
    </div>
  );
}

/** Net bakiye — Alacak / Verecek rozeti + tutar */
export function CariBakiyeCell({
  bakiye,
  bakiyeDurumu,
}: {
  bakiye: number;
  bakiyeDurumu?: string;
}) {
  const key = (bakiyeDurumu === "alacakli" || bakiyeDurumu === "borclu" || bakiyeDurumu === "dengede")
    ? bakiyeDurumu
    : bakiye > 0
      ? "alacakli"
      : bakiye < 0
        ? "borclu"
        : "dengede";
  const meta = BAKIYE_DURUMU_META[key];

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${meta.className}`}
        title={meta.hint}
      >
        <span aria-hidden>{key === "alacakli" ? "↑" : key === "borclu" ? "↓" : "•"}</span>
        {meta.label}
      </span>
      <span
        style={{
          fontVariantNumeric: "tabular-nums",
          fontWeight: 700,
          color: meta.color,
        }}
      >
        {fmtAmount(Math.abs(bakiye))} ₺
      </span>
    </div>
  );
}
