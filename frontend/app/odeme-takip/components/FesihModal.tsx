"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { FesihKesinti, FesihNedeniOption, FesihOnizleme } from "../types";
import { API_BASE, postHeaders, formatCurrency } from "../helpers";

function parseTrTutar(raw: string): number {
  const text = raw.trim().replace(/₺/g, "").replace(/TL/gi, "").replace(/\s/g, "");
  if (!text) return 0;
  let normalized = text;
  if (text.includes(",") && text.includes(".")) {
    normalized = text.replace(/\./g, "").replace(",", ".");
  } else if (text.includes(",")) {
    normalized = text.replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(text)) {
    normalized = text.replace(/\./g, "");
  }
  const n = Number(normalized);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n);
}

interface Props {
  sozlesmeId: number;
  sozlesmeNo: string;
  ogrenciAdi: string;
  onClose: () => void;
  onFesihComplete: () => void;
}

export default function FesihModal({ sozlesmeId, sozlesmeNo, ogrenciAdi, onClose, onFesihComplete }: Props) {
  const [step, setStep] = useState(1); // 1: Bilgiler, 2: Kesintiler, 3: Önizleme
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  // Form state
  const [fesihTarihi, setFesihTarihi] = useState(new Date().toISOString().split("T")[0]);
  const [fesihNedeni, setFesihNedeni] = useState("veli_talebi");
  const [fesihAciklama, setFesihAciklama] = useState("");
  const [kesintiler, setKesintiler] = useState<FesihKesinti[]>([]);
  const [cezaOrani, setCezaOrani] = useState(0);
  const [nedenSecenekleri, setNedenSecenekleri] = useState<FesihNedeniOption[]>([]);

  // Önizleme
  const [onizleme, setOnizleme] = useState<FesihOnizleme | null>(null);
  const [kullanilanTutar, setKullanilanTutar] = useState("");

  // Yeni kesinti form
  const [yeniKesinti, setYeniKesinti] = useState({ ad: "", tutar: "" });
  const [oneriler, setOneriler] = useState<{ ad: string; tutar: number }[]>([]);
  const [onerilerYuklendi, setOnerilerYuklendi] = useState(false);
  const [taslak, setTaslak] = useState<Record<string, string>>({});
  const [tutarHatasi, setTutarHatasi] = useState("");

  useEffect(() => {
    fetch(`${API_BASE}/fesih-nedenleri/`, { credentials: "include" })
      .then((r) => r.json())
      .then((data) => setNedenSecenekleri(Array.isArray(data) ? data : []))
      .catch(() => {
        setNedenSecenekleri([
          { value: "veli_talebi", label: "Veli Talebi" },
          { value: "kurum_karari", label: "Kurum Kararı" },
          { value: "disiplin", label: "Disiplin" },
          { value: "devamsizlik", label: "Devamsızlık" },
          { value: "diger", label: "Diğer" },
        ]);
      });
  }, []);

  useEffect(() => {
    fetch(`${API_BASE}/sozlesmeler/${sozlesmeId}/fesih/kesinti-onerileri/`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        const list = (Array.isArray(data) ? data : []).filter((o) => o && o.ad);
        setOneriler(list);
        const drafts: Record<string, string> = {};
        for (const o of list) drafts[o.ad] = o.tutar ? String(o.tutar) : "";
        setTaslak(drafts);
        setOnerilerYuklendi(true);
      })
      .catch(() => {
        setOneriler([]);
        setOnerilerYuklendi(true);
      });
  }, [sozlesmeId]);

  const kalemiKaydet = (ad: string, tutarMetin: string) => {
    const isim = ad.trim();
    const tutar = parseTrTutar(tutarMetin);
    if (!isim || tutar <= 0) {
      setTutarHatasi("Tutarı 2500 veya 2.500 olarak yazın.");
      return false;
    }
    setTutarHatasi("");
    setKesintiler((prev) => {
      const i = prev.findIndex((k) => k.ad === isim);
      if (i >= 0) {
        const next = [...prev];
        next[i] = { ad: isim, tutar };
        return next;
      }
      return [...prev, { ad: isim, tutar }];
    });
    return true;
  };

  const handleKesintiBirEkle = () => {
    if (kalemiKaydet(yeniKesinti.ad, yeniKesinti.tutar)) {
      setYeniKesinti({ ad: "", tutar: "" });
    }
  };

  const handleKesintiSil = (index: number) => {
    setKesintiler(kesintiler.filter((_, i) => i !== index));
  };

  const handleOnizleme = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/sozlesmeler/${sozlesmeId}/fesih/hesapla/`, {
        method: "POST",
        headers: postHeaders(),
        credentials: "include",
        body: JSON.stringify({
          fesih_tarihi: fesihTarihi,
          kesintiler: kesintiler,
          ceza_orani: cezaOrani,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setOnizleme(data);
        setKullanilanTutar(String(data.kullanilan_tutar ?? ""));
        setStep(3);
      } else {
        const err = await res.json();
        alert(err.error || "Hesaplama hatası");
      }
    } catch {
      alert("Bağlantı hatası");
    }
    setLoading(false);
  };

  const toplKesinti = kesintiler.reduce((s, k) => s + k.tutar, 0);
  const kullanilanSayi = onizleme
    ? (kullanilanTutar.trim() === ""
      ? (onizleme.onerilen_kullanilan_tutar ?? onizleme.kullanilan_tutar)
      : Math.max(0, Math.round(Number(kullanilanTutar) || 0)))
    : 0;
  const canliIade = onizleme
    ? onizleme.toplam_odenen - kullanilanSayi - toplKesinti - onizleme.ceza_tutari
    : 0;

  const handleFesihOnayla = async () => {
    if (!confirm("Bu işlem geri alınamaz. Sözleşmeyi feshetmek istediğinize emin misiniz?")) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/sozlesmeler/${sozlesmeId}/fesih/onayla/`, {
        method: "POST",
        headers: postHeaders(),
        credentials: "include",
        body: JSON.stringify({
          fesih_tarihi: fesihTarihi,
          fesih_nedeni: fesihNedeni,
          fesih_aciklama: fesihAciklama,
          kesintiler: kesintiler,
          ceza_orani: cezaOrani,
          kullanilan_tutar: kullanilanSayi,
        }),
      });
      if (res.ok) {
        onFesihComplete();
        onClose();
      } else {
        const err = await res.json();
        alert(err.error || "Fesih hatası");
      }
    } catch {
      alert("Bağlantı hatası");
    }
    setSaving(false);
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", zIndex: 4000 }}
      />

      {/* Modal */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
        position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
        width: "min(560px, calc(100vw - 24px))", maxHeight: "min(90vh, calc(100dvh - 24px))", background: "#fff", borderRadius: 16,
        boxShadow: "0 20px 60px rgba(0,0,0,.2)", zIndex: 4001,
        display: "flex", flexDirection: "column", overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{ padding: "20px 24px", borderBottom: "1px solid #e5e7eb", background: "#fef2f2" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#991b1b" }}>
                ⚠️ Sözleşme Fesih
              </h3>
              <p style={{ margin: "4px 0 0", fontSize: 13, color: "#6b7280" }}>
                {sozlesmeNo} — {ogrenciAdi}
              </p>
            </div>
            <button type="button" onClick={onClose} style={{ border: "none", background: "none", fontSize: 20, cursor: "pointer", color: "#9ca3af" }}>✕</button>
          </div>

          {/* Step indicator */}
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            {[
              { no: 1, label: "Bilgiler" },
              { no: 2, label: "Kesintiler" },
              { no: 3, label: "Önizleme" },
            ].map((s) => (
              <div
                key={s.no}
                style={{
                  flex: 1, padding: "8px 12px", borderRadius: 8, textAlign: "center",
                  fontSize: 12, fontWeight: 600,
                  background: step === s.no ? "#991b1b" : step > s.no ? "#fecaca" : "#f3f4f6",
                  color: step === s.no ? "#fff" : step > s.no ? "#991b1b" : "#6b7280",
                }}
              >
                {s.no}. {s.label}
              </div>
            ))}
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 24 }}>

          {/* STEP 1: Fesih bilgileri */}
          {step === 1 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>Fesih Tarihi *</label>
                <input
                  type="date"
                  value={fesihTarihi}
                  onChange={(e) => setFesihTarihi(e.target.value)}
                  style={{ width: "100%", padding: "10px 14px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 14 }}
                />
              </div>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>Fesih Nedeni *</label>
                <select
                  value={fesihNedeni}
                  onChange={(e) => setFesihNedeni(e.target.value)}
                  style={{ width: "100%", padding: "10px 14px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 14 }}
                >
                  {nedenSecenekleri.map((n) => (
                    <option key={n.value} value={n.value}>{n.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>Ceza Oranı (%)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  value={cezaOrani}
                  onChange={(e) => setCezaOrani(Number(e.target.value))}
                  style={{ width: "100%", padding: "10px 14px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 14 }}
                  placeholder="Ör: 10"
                />
                <p style={{ fontSize: 11, color: "#6b7280", marginTop: 4 }}>
                  MEB yönetmeliğine göre eğitim bedelinin %10&apos;u ceza olarak uygulanabilir
                </p>
              </div>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>Açıklama</label>
                <textarea
                  value={fesihAciklama}
                  onChange={(e) => setFesihAciklama(e.target.value)}
                  rows={3}
                  style={{ width: "100%", padding: "10px 14px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 14, resize: "vertical" }}
                  placeholder="Fesih gerekçesini belirtin..."
                />
              </div>
            </div>
          )}

          {/* STEP 2: Kesintiler */}
          {step === 2 && (
            <div>
              <p style={{ fontSize: 13, color: "#6b7280", margin: "0 0 16px" }}>
                Eğitim paketine ait kitap, yayın ve ek hizmetler indirimsiz fiyatıyla listelenir.
                Tutarı değiştirip ekleyebilirsiniz. Listede yoksa aşağıdan yazın.
              </p>

              {kesintiler.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  {kesintiler.map((k, i) => (
                    <div
                      key={`${k.ad}-${i}`}
                      style={{
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                        padding: "10px 14px", borderRadius: 8, background: "#f9fafb",
                        border: "1px solid #e5e7eb", marginBottom: 8, gap: 12,
                      }}
                    >
                      <span style={{ fontSize: 14, minWidth: 0 }}>{k.ad}</span>
                      <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
                        <strong style={{ color: "#dc2626" }}>{formatCurrency(k.tutar)}</strong>
                        <button
                          type="button"
                          onClick={() => handleKesintiSil(i)}
                          style={{ border: "none", background: "none", color: "#dc2626", cursor: "pointer", fontSize: 16 }}
                        >✕</button>
                      </div>
                    </div>
                  ))}
                  <div style={{ textAlign: "right", fontSize: 14, fontWeight: 700, color: "#991b1b", marginTop: 8 }}>
                    Toplam Kesinti: {formatCurrency(toplKesinti)}
                  </div>
                </div>
              )}

              {onerilerYuklendi && oneriler.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
                  {oneriler.map((o) => {
                    const ekli = kesintiler.some((k) => k.ad === o.ad);
                    const metin = taslak[o.ad] ?? "";
                    return (
                      <div key={o.ad} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <span style={{ flex: "1 1 140px", minWidth: 0, fontSize: 14 }}>{o.ad}</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={metin}
                          onChange={(e) => setTaslak({ ...taslak, [o.ad]: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              kalemiKaydet(o.ad, metin);
                            }
                          }}
                          placeholder="2.500"
                          style={{ width: 110, minWidth: 0, padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 14 }}
                        />
                        <button
                          type="button"
                          onClick={() => kalemiKaydet(o.ad, metin)}
                          style={{
                            flexShrink: 0, padding: "8px 14px", borderRadius: 6, border: "none",
                            background: "#d97706", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer",
                          }}
                        >{ekli ? "Güncelle" : "Ekle"}</button>
                      </div>
                    );
                  })}
                </div>
              ) : onerilerYuklendi ? (
                <p style={{ fontSize: 12, color: "#92400e", background: "#fffbeb", padding: "10px 12px", borderRadius: 8, margin: "0 0 16px" }}>
                  Bu sözleşmenin paketinde ayrı kitap veya ek hizmet kaydı yok. Kalemi aşağıdan elle ekleyin.
                </p>
              ) : null}

              <div style={{
                display: "flex", flexDirection: "column", gap: 8, padding: 14, borderRadius: 8,
                background: "#fffbeb", border: "1px dashed #d97706",
              }}>
                <input
                  type="text"
                  value={yeniKesinti.ad}
                  onChange={(e) => setYeniKesinti({ ...yeniKesinti, ad: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleKesintiBirEkle();
                    }
                  }}
                  placeholder="Kesinti adı (ör: Üniforma)"
                  style={{ width: "100%", padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 14, boxSizing: "border-box" }}
                />
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={yeniKesinti.tutar}
                    onChange={(e) => setYeniKesinti({ ...yeniKesinti, tutar: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleKesintiBirEkle();
                      }
                    }}
                    placeholder="Tutar (2.500)"
                    style={{ flex: 1, minWidth: 0, padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 14 }}
                  />
                  <button
                    type="button"
                    onClick={handleKesintiBirEkle}
                    style={{
                      flexShrink: 0, padding: "8px 16px", borderRadius: 6, border: "none",
                      background: "#d97706", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer",
                    }}
                  >Ekle</button>
                </div>
                {tutarHatasi && (
                  <p style={{ margin: 0, fontSize: 12, color: "#991b1b" }}>{tutarHatasi}</p>
                )}
              </div>
            </div>
          )}

          {/* STEP 3: Önizleme */}
          {step === 3 && onizleme && (
            <div>
              {/* Bilgi kartları */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
                <InfoCard label="İndirimsiz (Brüt) Tutar" value={formatCurrency(onizleme.indirimsiz_tutar ?? onizleme.sozlesme_net_tutar)} color="#1d4ed8" />
                <InfoCard label="Sözleşme Net Tutar" value={formatCurrency(onizleme.sozlesme_net_tutar)} color="#2563eb" />
                <InfoCard label="Toplam Ödenen" value={formatCurrency(onizleme.toplam_odenen)} color="#059669" />
                <InfoCard label="Kullanılan Gün" value={`${onizleme.kullanilan_gun} / ${onizleme.toplam_gun} gün`} color="#d97706" />
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>Kullanılan bedel</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={kullanilanTutar}
                  onChange={(e) => setKullanilanTutar(e.target.value)}
                  style={{ width: "100%", padding: "10px 14px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 16, fontWeight: 700 }}
                />
                <p style={{ fontSize: 12, color: "#6b7280", margin: "6px 0 0" }}>
                  Öneri {formatCurrency(onizleme.onerilen_kullanilan_tutar ?? onizleme.kullanilan_tutar)}:
                  indirimsiz tutarın {onizleme.kullanilan_gun}/{onizleme.toplam_gun} gün payı. Bu tutarı değiştirebilirsiniz.
                </p>
              </div>

              {/* Hesaplama detayı */}
              <div style={{ borderRadius: 10, border: "1px solid #e5e7eb", overflow: "hidden", marginBottom: 20 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <tbody>
                    <CalcRow label="Kullanılan Eğitim Bedeli" value={kullanilanSayi} />
                    <CalcRow label="Kesintiler Toplamı" value={toplKesinti} color="#dc2626" />
                    {onizleme.ceza_orani > 0 && (
                      <CalcRow label={`Ceza (%${onizleme.ceza_orani})`} value={onizleme.ceza_tutari} color="#dc2626" />
                    )}
                    <CalcRow label="Toplam Ödenen" value={onizleme.toplam_odenen} color="#059669" />
                  </tbody>
                </table>
              </div>

              {/* Sonuç */}
              <div style={{
                padding: 20, borderRadius: 12, textAlign: "center",
                background: canliIade > 0 ? "#ecfdf5" : canliIade < 0 ? "#fef2f2" : "#f3f4f6",
                border: `2px solid ${canliIade > 0 ? "#059669" : canliIade < 0 ? "#dc2626" : "#d1d5db"}`,
              }}>
                <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 4 }}>
                  {canliIade > 0 ? "Veliye İade Edilecek Tutar" : canliIade < 0 ? "Veliden Tahsil Edilecek Tutar" : "Bakiye"}
                </div>
                <div style={{
                  fontSize: 28, fontWeight: 800,
                  color: canliIade > 0 ? "#059669" : canliIade < 0 ? "#dc2626" : "#374151",
                }}>
                  {formatCurrency(Math.abs(canliIade))}
                </div>
                {canliIade > 0 && (
                  <p style={{ fontSize: 12, color: "#059669", margin: "8px 0 0" }}>
                    💰 Veli lehine iade yapılacak
                  </p>
                )}
                {canliIade < 0 && (
                  <p style={{ fontSize: 12, color: "#dc2626", margin: "8px 0 0" }}>
                    ⚠️ Veli borçlu — fark tahsil edilmeli
                  </p>
                )}
              </div>

              {/* İptal edilecek taksitler bilgisi */}
              {onizleme.iptal_edilecek_taksit_sayisi > 0 && (
                <div style={{
                  marginTop: 16, padding: 14, borderRadius: 8,
                  background: "#fffbeb", border: "1px solid #fbbf24", fontSize: 13,
                }}>
                  <strong style={{ color: "#92400e" }}>📅 {onizleme.iptal_edilecek_taksit_sayisi} taksit iptal edilecek</strong>
                  <span style={{ color: "#6b7280", marginLeft: 8 }}>
                    (Toplam {formatCurrency(onizleme.iptal_edilecek_taksit_tutar)})
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: "16px 24px", borderTop: "1px solid #e5e7eb", display: "flex", gap: 12 }}>
          {step > 1 && (
            <button
              type="button"
              onClick={() => setStep(step - 1)}
              style={{ padding: "10px 20px", border: "1px solid #d1d5db", borderRadius: 8, background: "#fff", fontSize: 14, cursor: "pointer" }}
            >← Geri</button>
          )}
          <div style={{ flex: 1 }} />
          <button
            type="button"
            onClick={onClose}
            style={{ padding: "10px 20px", border: "1px solid #d1d5db", borderRadius: 8, background: "#fff", fontSize: 14, cursor: "pointer" }}
          >Vazgeç</button>

          {step === 1 && (
            <button
              type="button"
              onClick={() => setStep(2)}
              disabled={!fesihTarihi}
              style={{
                padding: "10px 24px", border: "none", borderRadius: 8,
                background: fesihTarihi ? "#d97706" : "#e5e7eb",
                color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer",
              }}
            >Sonraki →</button>
          )}

          {step === 2 && (
            <button
              type="button"
              onClick={handleOnizleme}
              disabled={loading}
              style={{
                padding: "10px 24px", border: "none", borderRadius: 8,
                background: "#991b1b", color: "#fff", fontSize: 14, fontWeight: 600,
                cursor: "pointer", opacity: loading ? 0.6 : 1,
              }}
            >{loading ? "Hesaplanıyor..." : "Hesapla & Önizle →"}</button>
          )}

          {step === 3 && (
            <button
              type="button"
              onClick={handleFesihOnayla}
              disabled={saving}
              style={{
                padding: "10px 24px", border: "none", borderRadius: 8,
                background: "#dc2626", color: "#fff", fontSize: 14, fontWeight: 600,
                cursor: "pointer", opacity: saving ? 0.6 : 1,
              }}
            >{saving ? "İşleniyor..." : "⚠️ Fesih Onayla"}</button>
          )}
        </div>
      </div>
    </>,
    document.body,
  );
}

// ─── Helper Components ──────────────────────────────

function InfoCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ padding: 14, borderRadius: 8, background: "#f9fafb", border: "1px solid #e5e7eb" }}>
      <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}

function CalcRow({ label, value, color, note }: { label: string; value: number; color?: string; note?: string }) {
  return (
    <tr style={{ borderBottom: "1px solid #f3f4f6" }}>
      <td style={{ padding: "10px 14px", fontSize: 13 }}>
        {label}
        {note && <span style={{ display: "block", fontSize: 11, color: "#9ca3af" }}>{note}</span>}
      </td>
      <td style={{ padding: "10px 14px", textAlign: "right", fontWeight: 600, color: color || "#111827" }}>
        {new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value)}
      </td>
    </tr>
  );
}
