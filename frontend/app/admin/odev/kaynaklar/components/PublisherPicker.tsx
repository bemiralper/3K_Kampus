"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  createPublisher,
  fetchPublishers,
  type ResourcePublisher,
} from "@/lib/resources-api";

type Props = {
  value: number | null;
  label?: string;
  onChange: (publisherId: number | null, publisherAd: string) => void;
};

export default function PublisherPicker({ value, label, onChange }: Props) {
  const [publishers, setPublishers] = useState<ResourcePublisher[]>([]);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [showQuick, setShowQuick] = useState(false);
  const [quickAd, setQuickAd] = useState("");
  const [quickKisa, setQuickKisa] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const res = await fetchPublishers({ aktif: "true" });
    if (res.success && Array.isArray(res.data)) {
      setPublishers(res.data);
    } else if (res.success && res.data && Array.isArray((res.data as any).results)) {
      setPublishers((res.data as any).results);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const selected = publishers.find((p) => p.id === value) || null;
  const display = label || selected?.ad || "";

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("tr");
    if (!q) return publishers;
    return publishers.filter(
      (p) =>
        p.ad.toLocaleLowerCase("tr").includes(q) ||
        (p.kisa_ad || "").toLocaleLowerCase("tr").includes(q),
    );
  }, [publishers, query]);

  const handleQuickCreate = async () => {
    if (!quickAd.trim()) return;
    setSaving(true);
    setError(null);
    const res = await createPublisher({
      ad: quickAd.trim(),
      kisa_ad: quickKisa.trim() || quickAd.trim(),
      aktif_mi: true,
    });
    setSaving(false);
    if (!res.success || !res.data) {
      setError(res.error || "Yayınevi eklenemedi");
      return;
    }
    await load();
    onChange(res.data.id, res.data.ad);
    setShowQuick(false);
    setQuickAd("");
    setQuickKisa("");
    setOpen(false);
    setQuery("");
  };

  return (
    <div className="kk-field" style={{ position: "relative" }}>
      <label className="kk-label">Yayınevi</label>
      <button
        type="button"
        className="kk-input"
        style={{ textAlign: "left", cursor: "pointer" }}
        onClick={() => setOpen((v) => !v)}
      >
        {display || "Yayınevi ara…"}
      </button>
      {value != null && (
        <button
          type="button"
          className="kk-hint"
          style={{ marginTop: 4, background: "none", border: 0, cursor: "pointer", color: "#64748b" }}
          onClick={() => onChange(null, "")}
        >
          Seçimi temizle
        </button>
      )}
      {open && (
        <div
          style={{
            position: "absolute",
            zIndex: 40,
            left: 0,
            right: 0,
            top: "100%",
            marginTop: 4,
            background: "#fff",
            border: "1px solid #e2e8f0",
            borderRadius: 10,
            boxShadow: "0 12px 28px rgba(15,23,42,0.12)",
            maxHeight: 280,
            overflow: "auto",
            padding: 8,
          }}
        >
          <input
            className="kk-input"
            autoFocus
            placeholder="Yayınevi ara…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
            {filtered.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  onChange(p.id, p.ad);
                  setOpen(false);
                  setQuery("");
                }}
                style={{
                  textAlign: "left",
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: value === p.id ? "1px solid #0061a6" : "1px solid transparent",
                  background: value === p.id ? "#e8f3fb" : "transparent",
                  cursor: "pointer",
                }}
              >
                <div style={{ fontWeight: 600 }}>{p.ad}</div>
                {p.kisa_ad && p.kisa_ad !== p.ad && (
                  <div style={{ fontSize: 12, color: "#64748b" }}>{p.kisa_ad}</div>
                )}
              </button>
            ))}
            {!filtered.length && (
              <div style={{ padding: 8, color: "#64748b", fontSize: 13 }}>Sonuç yok</div>
            )}
          </div>
          <button
            type="button"
            style={{
              marginTop: 8,
              width: "100%",
              padding: "8px 10px",
              borderRadius: 8,
              border: "1px dashed #94a3b8",
              background: "#f8fafc",
              cursor: "pointer",
              fontWeight: 600,
              color: "#0061a6",
            }}
            onClick={() => setShowQuick(true)}
          >
            + Yeni Yayınevi Ekle
          </button>
          {showQuick && (
            <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
              <input
                className="kk-input"
                placeholder="Yayınevi adı"
                value={quickAd}
                onChange={(e) => setQuickAd(e.target.value)}
              />
              <input
                className="kk-input"
                placeholder="Kısa ad (opsiyonel)"
                value={quickKisa}
                onChange={(e) => setQuickKisa(e.target.value)}
              />
              {error && <div style={{ color: "#b91c1c", fontSize: 12 }}>{error}</div>}
              <button
                type="button"
                className="kk-btn kk-btn-primary"
                disabled={saving || !quickAd.trim()}
                onClick={handleQuickCreate}
              >
                {saving ? "Kaydediliyor…" : "Ekle ve Seç"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
