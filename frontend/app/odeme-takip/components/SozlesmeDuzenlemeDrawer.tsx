"use client";

import { useState, useEffect, useCallback } from "react";
import { Sozlesme } from "../types";
import { formatCurrency, formatDate, API_BASE, postHeaders, odemeTuruLabel, taksitPeriyoduLabel, egitimTuruLabel, gecmisIslemTuruText, islemYapanText } from "../helpers";
import SozlesmeNotlarEditor from "./SozlesmeNotlarEditor";
import { SozlesmeNot, parseNotlarJson, serializeNotlarForApi } from "@/lib/sozlesme-notlar";

// ─── Stiller ──────────────────────────────────────────────────

const KURUM_COLOR = "#0262a7";

interface Props {
  sozlesmeId: number;
  onClose: () => void;
  onSaved: () => void;
}

interface FormData {
  baslangic_tarihi: string;
  bitis_tarihi: string;
  odeme_turu: string;
  taksit_sayisi: string;
  ilk_odeme_tarihi: string;
  taksit_periyodu: string;
  muacceliyet_durumu: boolean;
  cayma_suresi: string;
  egitim_turu: string;
}

export default function SozlesmeDuzenlemeDrawer({ sozlesmeId, onClose, onSaved }: Props) {
  const [loading, setLoading] = useState(true);
  const [sozlesme, setSozlesme] = useState<Sozlesme | null>(null);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [notlarJson, setNotlarJson] = useState<SozlesmeNot[]>([]);
  const [notlarChanged, setNotlarChanged] = useState(false);

  const [form, setForm] = useState<FormData>({
    baslangic_tarihi: "",
    bitis_tarihi: "",
    odeme_turu: "",
    taksit_sayisi: "",
    ilk_odeme_tarihi: "",
    taksit_periyodu: "",
    muacceliyet_durumu: false,
    cayma_suresi: "",
    egitim_turu: "",
  });

  // Değişen alanları takip et
  const [changedFields, setChangedFields] = useState<Set<string>>(new Set());

  // Sözleşme detayını çek
  const fetchDetail = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/sozlesmeler/${sozlesmeId}/`, { credentials: "include" });
      const data: Sozlesme = await res.json();
      setSozlesme(data);
      setForm({
        baslangic_tarihi: data.baslangic_tarihi || "",
        bitis_tarihi: data.bitis_tarihi || "",
        odeme_turu: data.odeme_turu || "",
        taksit_sayisi: String(data.taksit_sayisi || ""),
        ilk_odeme_tarihi: data.ilk_odeme_tarihi || "",
        taksit_periyodu: data.taksit_periyodu || "",
        muacceliyet_durumu: data.muacceliyet_durumu || false,
        cayma_suresi: String(data.cayma_suresi || ""),
        egitim_turu: data.egitim_turu || "",
      });
      setNotlarJson(parseNotlarJson(data.notlar_json, data.notlar));
      setNotlarChanged(false);
    } catch { setErrors(["Sözleşme bilgileri yüklenemedi"]); }
    setLoading(false);
  }, [sozlesmeId]);

  useEffect(() => { fetchDetail(); }, [fetchDetail]);

  const handleFieldChange = (field: keyof FormData, value: string | boolean) => {
    setForm(prev => ({ ...prev, [field]: value }));
    setChangedFields(prev => new Set(prev).add(field));
  };

  // Tahsil edilmiş taksitler
  const tahsilEdilmisTaksitler = (sozlesme?.taksitler || []).filter(
    t => t.durum === "odendi" || t.durum === "kismi_odendi"
  );
  const odenmisTaksitSayisi = tahsilEdilmisTaksitler.length;
  const toplamOdenmis = tahsilEdilmisTaksitler.reduce((sum, t) => sum + t.odenen_tutar, 0);

  // Revizyon önizleme hesapları
  const yeniTaksitSayisi = parseInt(form.taksit_sayisi) || 0;
  const kalanTaksitSayisi = yeniTaksitSayisi - odenmisTaksitSayisi;
  const kalanBakiye = (sozlesme?.net_tutar || 0) - toplamOdenmis;
  const yeniTaksitTutari = kalanTaksitSayisi > 0 ? kalanBakiye / kalanTaksitSayisi : 0;

  // Kaydet
  const handleSave = async () => {
    if (changedFields.size === 0 && !notlarChanged) {
      onClose();
      return;
    }

    setSaving(true);
    setErrors([]);

    // Sadece değişen alanları gönder
    const payload: Record<string, unknown> = {};
    changedFields.forEach(field => {
      const value = form[field as keyof FormData];
      if (field === "taksit_sayisi" || field === "cayma_suresi") {
        payload[field] = parseInt(value as string) || 0;
      } else if (field === "muacceliyet_durumu") {
        payload[field] = value;
      } else {
        payload[field] = value;
      }
    });

    if (notlarChanged) {
      Object.assign(payload, serializeNotlarForApi(notlarJson));
    }

    try {
      const res = await fetch(`${API_BASE}/sozlesmeler/${sozlesmeId}/update/`, {
        method: "PUT",
        headers: postHeaders(),
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        onSaved();
        onClose();
      } else {
        const err = await res.json();
        if (err.error) {
          setErrors([err.error]);
        } else {
          setErrors(Object.values(err).flat().map(String));
        }
      }
    } catch {
      setErrors(["Bağlantı hatası"]);
    }
    setSaving(false);
  };

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "10px 14px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 14,
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6, color: "#374151",
  };

  return (
    <>
      {/* Overlay */}
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.35)", zIndex: 2000, animation: "fadeIn .2s" }} />

      {/* Drawer */}
      <div style={{
        position: "fixed", right: 0, top: 0, bottom: 0, width: 520, background: "#fff",
        boxShadow: "-4px 0 24px rgba(0,0,0,.12)", zIndex: 2001, display: "flex", flexDirection: "column",
        animation: "slideIn .2s",
      }}>
        {/* Header */}
        <div style={{ padding: "20px 24px", borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>✏️ Sözleşme Düzenle</h3>
            {sozlesme && (
              <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
                {sozlesme.sozlesme_no} • v{sozlesme.versiyon || 1}
                {sozlesme.durum === "aktif" && (
                  <span style={{ marginLeft: 8, color: "#d97706", fontWeight: 600 }}>
                    ⚠️ Aktif sözleşme — revizyon oluşturulacak
                  </span>
                )}
              </div>
            )}
          </div>
          <button onClick={onClose} style={{ border: "none", background: "none", fontSize: 20, cursor: "pointer", color: "#9ca3af" }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: 24 }}>
          {loading ? (
            <div style={{ textAlign: "center", padding: 40, color: "#6b7280" }}>Yükleniyor...</div>
          ) : !sozlesme ? (
            <div style={{ textAlign: "center", padding: 40, color: "#dc2626" }}>Sözleşme bulunamadı</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {/* Errors */}
              {errors.length > 0 && (
                <div style={{ padding: 14, borderRadius: 8, background: "#fef2f2", border: "1px solid #fecaca" }}>
                  {errors.map((e, i) => (
                    <div key={i} style={{ fontSize: 13, color: "#dc2626" }}>⚠️ {e}</div>
                  ))}
                </div>
              )}

              {/* Tahsil edilen taksitler uyarısı */}
              {sozlesme.durum === "aktif" && odenmisTaksitSayisi > 0 && (
                <div style={{ padding: 14, borderRadius: 10, background: "#fffbeb", border: "1px solid #fde68a" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#92400e", marginBottom: 6 }}>
                    🔒 Tahsil Edilmiş Taksitler Korunacak
                  </div>
                  <div style={{ fontSize: 12, color: "#78350f", lineHeight: 1.7 }}>
                    <strong>{odenmisTaksitSayisi}</strong> taksit daha önce tahsil edilmiş ({formatCurrency(toplamOdenmis)}).
                    Bu taksitler değiştirilemez. Tutar veya taksit sayısı değişikliklerinde
                    kalan bakiye ({formatCurrency(kalanBakiye)}) ödenmemiş taksitlere eşit dağıtılacaktır.
                  </div>
                </div>
              )}

              {/* ═══ Tarih Bilgileri ═══ */}
              <fieldset style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: "16px 18px", margin: 0 }}>
                <legend style={{ fontSize: 13, fontWeight: 700, color: KURUM_COLOR, padding: "0 8px" }}>📅 Tarih Bilgileri</legend>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                  <div>
                    <label style={labelStyle}>Başlangıç Tarihi</label>
                    <input type="date" value={form.baslangic_tarihi} onChange={e => handleFieldChange("baslangic_tarihi", e.target.value)} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Bitiş Tarihi</label>
                    <input type="date" value={form.bitis_tarihi} onChange={e => handleFieldChange("bitis_tarihi", e.target.value)} style={inputStyle} />
                  </div>
                </div>
              </fieldset>

              {/* ═══ Ödeme Planı ═══ */}
              <fieldset style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: "16px 18px", margin: 0 }}>
                <legend style={{ fontSize: 13, fontWeight: 700, color: KURUM_COLOR, padding: "0 8px" }}>💳 Ödeme Planı</legend>
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                    <div>
                      <label style={labelStyle}>Ödeme Türü</label>
                      <select value={form.odeme_turu} onChange={e => handleFieldChange("odeme_turu", e.target.value)} style={inputStyle}>
                        <option value="">Seçin</option>
                        {Object.entries(odemeTuruLabel).map(([k, v]) => (
                          <option key={k} value={k}>{v}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle}>Taksit Sayısı</label>
                      <input type="number" min="1" max="48" value={form.taksit_sayisi} onChange={e => handleFieldChange("taksit_sayisi", e.target.value)} style={inputStyle} />
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                    <div>
                      <label style={labelStyle}>İlk Ödeme Tarihi</label>
                      <input type="date" value={form.ilk_odeme_tarihi} onChange={e => handleFieldChange("ilk_odeme_tarihi", e.target.value)} style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Taksit Periyodu</label>
                      <select value={form.taksit_periyodu} onChange={e => handleFieldChange("taksit_periyodu", e.target.value)} style={inputStyle}>
                        <option value="">Seçin</option>
                        {Object.entries(taksitPeriyoduLabel).map(([k, v]) => (
                          <option key={k} value={k}>{v}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              </fieldset>

              {/* ═══ Revizyon Önizleme (taksit değişirse) ═══ */}
              {changedFields.has("taksit_sayisi") && sozlesme.durum === "aktif" && (
                <div style={{ padding: 16, borderRadius: 10, background: "#f0f7ff", border: `1px solid ${KURUM_COLOR}30` }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: KURUM_COLOR, marginBottom: 10 }}>📊 Revizyon Önizlemesi</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, fontSize: 13 }}>
                    <span style={{ color: "#6b7280" }}>Net Tutar:</span>
                    <span style={{ textAlign: "right", fontWeight: 600 }}>{formatCurrency(sozlesme.net_tutar)}</span>
                    <span style={{ color: "#6b7280" }}>Toplam Ödenen:</span>
                    <span style={{ textAlign: "right", fontWeight: 600, color: "#059669" }}>{formatCurrency(toplamOdenmis)}</span>
                    <span style={{ color: "#6b7280" }}>Korunan Taksitler:</span>
                    <span style={{ textAlign: "right", fontWeight: 600 }}>{odenmisTaksitSayisi} adet</span>
                    <span style={{ color: "#6b7280" }}>Kalan Bakiye:</span>
                    <span style={{ textAlign: "right", fontWeight: 700, color: "#d97706" }}>{formatCurrency(kalanBakiye)}</span>
                    <span style={{ color: "#6b7280", borderTop: "1px solid #d1d5db", paddingTop: 6 }}>Yeni Taksit Sayısı:</span>
                    <span style={{ textAlign: "right", fontWeight: 600, borderTop: "1px solid #d1d5db", paddingTop: 6 }}>{kalanTaksitSayisi} adet (ödenmemiş)</span>
                    <span style={{ color: "#111827", fontWeight: 700 }}>Taksit Başına:</span>
                    <span style={{ textAlign: "right", fontWeight: 700, color: KURUM_COLOR }}>{formatCurrency(yeniTaksitTutari)}</span>
                  </div>
                </div>
              )}

              {/* ═══ Ek Bilgiler ═══ */}
              <fieldset style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: "16px 18px", margin: 0 }}>
                <legend style={{ fontSize: 13, fontWeight: 700, color: KURUM_COLOR, padding: "0 8px" }}>📋 Ek Bilgiler</legend>
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                    <div>
                      <label style={labelStyle}>Eğitim Türü</label>
                      <select value={form.egitim_turu} onChange={e => handleFieldChange("egitim_turu", e.target.value)} style={inputStyle}>
                        <option value="">Seçin</option>
                        {Object.entries(egitimTuruLabel).map(([k, v]) => (
                          <option key={k} value={k}>{v}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle}>Cayma Süresi (gün)</label>
                      <input type="number" min="0" value={form.cayma_suresi} onChange={e => handleFieldChange("cayma_suresi", e.target.value)} style={inputStyle} />
                    </div>
                  </div>
                  <div>
                    <label style={{ ...labelStyle, display: "flex", alignItems: "center", gap: 8 }}>
                      <input
                        type="checkbox"
                        checked={form.muacceliyet_durumu}
                        onChange={e => handleFieldChange("muacceliyet_durumu", e.target.checked)}
                        style={{ width: 16, height: 16 }}
                      />
                      Muacceliyet Şartı Aktif
                    </label>
                    <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>
                      Bir taksit ödenmezse tüm bakiyenin muaccel hale gelmesi
                    </div>
                  </div>
                  <div>
                    <label style={labelStyle}>Notlar</label>
                    <SozlesmeNotlarEditor
                      notes={notlarJson}
                      onChange={(notes) => {
                        setNotlarJson(notes);
                        setNotlarChanged(true);
                      }}
                    />
                  </div>
                </div>
              </fieldset>

              {/* ═══ Revizyon Geçmişi ═══ */}
              {(sozlesme.gecmis || []).length > 0 && (
                <fieldset style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: "16px 18px", margin: 0 }}>
                  <legend style={{ fontSize: 13, fontWeight: 700, color: "#7c3aed", padding: "0 8px" }}>📜 Revizyon Geçmişi</legend>
                  <div style={{ maxHeight: 200, overflowY: "auto" }}>
                    {(sozlesme.gecmis || [])
                      .filter(g => g.islem_turu === "revizyon" || g.islem_turu === "guncelleme")
                      .map((g, i) => (
                        <div key={i} style={{
                          padding: "10px 12px", borderRadius: 8, marginBottom: 6,
                          background: g.islem_turu === "revizyon" ? "#f5f3ff" : "#f9fafb",
                          border: `1px solid ${g.islem_turu === "revizyon" ? "#e9d5ff" : "#e5e7eb"}`,
                        }}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                            <span style={{ fontSize: 12, fontWeight: 600, color: g.islem_turu === "revizyon" ? "#7c3aed" : "#374151" }}>
                              {g.islem_turu === "revizyon" ? "🔄 Revizyon" : "✏️ Güncelleme"}
                            </span>
                            <span style={{ fontSize: 11, color: "#9ca3af" }}>{formatDate(g.islem_tarihi)}</span>
                          </div>
                          <div style={{ fontSize: 12, color: "#6b7280" }}>{g.aciklama}</div>
                          <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>
                            <strong>Yetkili:</strong> {islemYapanText(g.islem_yapan)}
                          </div>
                        </div>
                      ))
                    }
                  </div>
                </fieldset>
              )}

              {/* Değişiklik özeti */}
              {changedFields.size > 0 && (
                <div style={{ padding: 12, borderRadius: 8, background: "#ecfdf5", border: "1px solid #bbf7d0" }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#059669", marginBottom: 4 }}>
                    ✅ {changedFields.size} alan değiştirildi
                  </div>
                  <div style={{ fontSize: 11, color: "#047857" }}>
                    {Array.from(changedFields).map(f => {
                      const labels: Record<string, string> = {
                        baslangic_tarihi: "Başlangıç Tarihi",
                        bitis_tarihi: "Bitiş Tarihi",
                        odeme_turu: "Ödeme Türü",
                        taksit_sayisi: "Taksit Sayısı",
                        ilk_odeme_tarihi: "İlk Ödeme Tarihi",
                        taksit_periyodu: "Taksit Periyodu",
                        notlar: "Notlar",
                        muacceliyet_durumu: "Muacceliyet",
                        cayma_suresi: "Cayma Süresi",
                        egitim_turu: "Eğitim Türü",
                      };
                      return labels[f] || f;
                    }).join(", ")}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: "16px 24px", borderTop: "1px solid #e5e7eb", display: "flex", gap: 12 }}>
          <button
            onClick={onClose}
            style={{ flex: 1, padding: "10px 0", border: "1px solid #d1d5db", borderRadius: 8, background: "#fff", fontSize: 14, cursor: "pointer" }}
          >Vazgeç</button>
          <button
            onClick={handleSave}
            disabled={saving || changedFields.size === 0}
            style={{
              flex: 1, padding: "10px 0", border: "none", borderRadius: 8,
              background: changedFields.size === 0 ? "#d1d5db" : KURUM_COLOR,
              color: "#fff", fontSize: 14, fontWeight: 600, cursor: changedFields.size === 0 ? "default" : "pointer",
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? "Kaydediliyor..." : sozlesme?.durum === "aktif" ? "🔄 Revize Et" : "💾 Kaydet"}
          </button>
        </div>
      </div>
    </>
  );
}
