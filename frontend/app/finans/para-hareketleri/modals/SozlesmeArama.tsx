"use client";

import React, { useEffect, useMemo, useState } from "react";
import { odemeTakipBridge, type SozlesmeAramaSonuc } from "../../services/odeme-takip-bridge";
import { finansModalInputStyle } from "@/components/finans/FinansModal";

const fmtTL = (v: number) =>
  new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v || 0);

interface SozlesmeAramaProps {
  value: SozlesmeAramaSonuc | null;
  onChange: (sozlesme: SozlesmeAramaSonuc | null) => void;
  onlyWithDebt?: boolean;
}

/** Sözleşme no / öğrenci adı ile arama yapan seçim kutusu. */
export default function SozlesmeArama({ value, onChange, onlyWithDebt = false }: SozlesmeAramaProps) {
  const [all, setAll] = useState<SozlesmeAramaSonuc[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    odemeTakipBridge
      .sozlesmeler()
      .then((data) => setAll(Array.isArray(data) ? data : []))
      .catch(() => setAll([]))
      .finally(() => setLoading(false));
  }, []);

  const results = useMemo(() => {
    let list = all;
    if (onlyWithDebt) list = list.filter((s) => s.durum === "aktif" || s.durum === "dondurulmus");
    const q = query.trim().toLowerCase();
    if (!q) return list.slice(0, 30);
    return list
      .filter((s) => {
        const ogrenciAdi = s.ogrenci ? `${s.ogrenci.ad} ${s.ogrenci.soyad}`.toLowerCase() : "";
        return s.sozlesme_no.toLowerCase().includes(q) || ogrenciAdi.includes(q);
      })
      .slice(0, 30);
  }, [all, query, onlyWithDebt]);

  if (value) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 12px",
          border: "1px solid #dbeafe",
          background: "#eff6ff",
          borderRadius: 10,
        }}
      >
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: "#1e3a8a" }}>
            {value.ogrenci ? `${value.ogrenci.ad} ${value.ogrenci.soyad}` : value.sozlesme_no}
          </div>
          <div style={{ fontSize: 11.5, color: "#3b82f6" }}>
            {value.sozlesme_no} · Kalan borç: {fmtTL(value.kalan_borc)}
          </div>
        </div>
        <button
          type="button"
          onClick={() => onChange(null)}
          style={{ border: "none", background: "none", color: "#2563eb", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
        >
          Değiştir
        </button>
      </div>
    );
  }

  return (
    <div style={{ position: "relative" }}>
      <input
        type="text"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder={loading ? "Sözleşmeler yükleniyor…" : "Öğrenci adı veya sözleşme no ile ara…"}
        style={finansModalInputStyle}
        disabled={loading}
      />
      {open && !loading && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            maxHeight: 260,
            overflowY: "auto",
            background: "#fff",
            border: "1px solid #e2e8f0",
            borderRadius: 10,
            boxShadow: "0 12px 32px rgba(15,23,42,.12)",
            zIndex: 10,
          }}
        >
          {results.length === 0 ? (
            <div style={{ padding: 14, fontSize: 12.5, color: "#94a3b8", textAlign: "center" }}>Sonuç bulunamadı</div>
          ) : (
            results.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => { onChange(s); setOpen(false); setQuery(""); }}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "9px 12px",
                  border: "none",
                  borderBottom: "1px solid #f1f5f9",
                  background: "#fff",
                  cursor: "pointer",
                }}
                onMouseDown={(e) => e.preventDefault()}
              >
                <div style={{ fontSize: 13, fontWeight: 700, color: "#1e293b" }}>
                  {s.ogrenci ? `${s.ogrenci.ad} ${s.ogrenci.soyad}` : s.sozlesme_no}
                </div>
                <div style={{ fontSize: 11, color: "#94a3b8" }}>
                  {s.sozlesme_no} · Kalan: {fmtTL(s.kalan_borc)}
                </div>
              </button>
            ))
          )}
        </div>
      )}
      {open && <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 5 }} />}
    </div>
  );
}
