"use client";

import { useState, useEffect } from "react";
import { FesihKesinti, FesihNedeniOption, FesihOnizleme } from "../types";
import { API_BASE, postHeaders, formatCurrency } from "../helpers";

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

  // Yeni kesinti form
  const [yeniKesinti, setYeniKesinti] = useState({ ad: "", tutar: "" });

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

  const handleKesintiBirEkle = () => {
    if (!yeniKesinti.ad || !yeniKesinti.tutar || Number(yeniKesinti.tutar) <= 0) return;
    setKesintiler([...kesintiler, { ad: yeniKesinti.ad, tutar: Number(yeniKesinti.tutar) }]);
    setYeniKesinti({ ad: "", tutar: "" });
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

  const toplKesinti = kesintiler.reduce((s, k) => s + k.tutar, 0);

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", zIndex: 2000, animation: "fadeIn .2s" }}
      />

      {/* Modal */}
      <div style={{
        position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
        width: 600, maxHeight: "90vh", background: "#fff", borderRadius: 16,
        boxShadow: "0 20px 60px rgba(0,0,0,.2)", zIndex: 2001,
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
            <button onClick={onClose} style={{ border: "none", background: "none", fontSize: 20, cursor: "pointer", color: "#9ca3af" }}>✕</button>
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
        <div style={{ flex: 1, overflowY: "auto", padding: 24 }}>

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
              <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 16 }}>
                Eğitim paketine ait kitap, materyal, üniforma vb. kesinti kalemlerini ekleyin.
              </p>

              {/* Mevcut kesintiler */}
              {kesintiler.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  {kesintiler.map((k, i) => (
                    <div
                      key={i}
                      style={{
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                        padding: "10px 14px", borderRadius: 8, background: "#f9fafb",
                        border: "1px solid #e5e7eb", marginBottom: 8,
                      }}
                    >
                      <span style={{ fontSize: 14 }}>{k.ad}</span>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <strong style={{ color: "#dc2626" }}>{formatCurrency(k.tutar)}</strong>
                        <button
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

              {/* Yeni kesinti formu */}
              <div style={{
                display: "flex", gap: 8, padding: 14, borderRadius: 8,
                background: "#fffbeb", border: "1px dashed #d97706",
              }}>
                <input
                  type="text"
                  value={yeniKesinti.ad}
                  onChange={(e) => setYeniKesinti({ ...yeniKesinti, ad: e.target.value })}
                  placeholder="Kesinti adı (ör: Kitap bedeli)"
                  style={{ flex: 2, padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 13 }}
                />
                <input
                  type="number"
                  value={yeniKesinti.tutar}
                  onChange={(e) => setYeniKesinti({ ...yeniKesinti, tutar: e.target.value })}
                  placeholder="Tutar (₺)"
                  min="0"
                  step="0.01"
                  style={{ flex: 1, padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 13 }}
                />
                <button
                  onClick={handleKesintiBirEkle}
                  disabled={!yeniKesinti.ad || !yeniKesinti.tutar}
                  style={{
                    padding: "8px 16px", borderRadius: 6, border: "none",
                    background: yeniKesinti.ad && yeniKesinti.tutar ? "#d97706" : "#e5e7eb",
                    color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer",
                  }}
                >+ Ekle</button>
              </div>
            </div>
          )}

          {/* STEP 3: Önizleme */}
          {step === 3 && onizleme && (
            <div>
              {/* Bilgi kartları */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
                <InfoCard label="Sözleşme Net Tutar" value={formatCurrency(onizleme.sozlesme_net_tutar)} color="#2563eb" />
                <InfoCard label="Toplam Ödenen" value={formatCurrency(onizleme.toplam_odenen)} color="#059669" />
                <InfoCard label="Toplam Gün" value={`${onizleme.toplam_gun} gün`} color="#6b7280" />
                <InfoCard label="Kullanılan Gün" value={`${onizleme.kullanilan_gun} gün`} color="#d97706" />
              </div>

              {/* Hesaplama detayı */}
              <div style={{ borderRadius: 10, border: "1px solid #e5e7eb", overflow: "hidden", marginBottom: 20 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <tbody>
                    <CalcRow label="Kullanılan Eğitim Bedeli" value={onizleme.kullanilan_tutar} note={`${onizleme.kullanilan_gun}/${onizleme.toplam_gun} gün oranıyla`} />
                    <CalcRow label="Kesintiler Toplamı" value={onizleme.kesinti_tutari} color="#dc2626" />
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
                background: onizleme.iade_tutari > 0 ? "#ecfdf5" : onizleme.iade_tutari < 0 ? "#fef2f2" : "#f3f4f6",
                border: `2px solid ${onizleme.iade_tutari > 0 ? "#059669" : onizleme.iade_tutari < 0 ? "#dc2626" : "#d1d5db"}`,
              }}>
                <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 4 }}>
                  {onizleme.iade_tutari > 0 ? "Veliye İade Edilecek Tutar" : onizleme.iade_tutari < 0 ? "Veliden Tahsil Edilecek Tutar" : "Bakiye"}
                </div>
                <div style={{
                  fontSize: 28, fontWeight: 800,
                  color: onizleme.iade_tutari > 0 ? "#059669" : onizleme.iade_tutari < 0 ? "#dc2626" : "#374151",
                }}>
                  {formatCurrency(Math.abs(onizleme.iade_tutari))}
                </div>
                {onizleme.iade_tutari > 0 && (
                  <p style={{ fontSize: 12, color: "#059669", margin: "8px 0 0" }}>
                    💰 Veli lehine iade yapılacak
                  </p>
                )}
                {onizleme.iade_tutari < 0 && (
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
              onClick={() => setStep(step - 1)}
              style={{ padding: "10px 20px", border: "1px solid #d1d5db", borderRadius: 8, background: "#fff", fontSize: 14, cursor: "pointer" }}
            >← Geri</button>
          )}
          <div style={{ flex: 1 }} />
          <button
            onClick={onClose}
            style={{ padding: "10px 20px", border: "1px solid #d1d5db", borderRadius: 8, background: "#fff", fontSize: 14, cursor: "pointer" }}
          >Vazgeç</button>

          {step === 1 && (
            <button
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
    </>
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
