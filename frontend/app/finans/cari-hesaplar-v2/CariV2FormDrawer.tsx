"use client";

import { useEffect, useState } from "react";
import { cariV2Service } from "../services/cari-v2-api";
import { gelirKategoriService } from "../services/gelir-api";
import { giderKategoriService } from "../services/gider-api";
import { FinansHttpError } from "../services/finans-http";
import { CARI_V2_TURLERI, CariEtiket, CariV2Turu } from "../types/cari-v2-types";
import type { GelirKategorisiTreeItem } from "../types/gelir-kategori-types";
import type { GiderKategorisiTreeItem } from "../types/gider-kategori-types";
import CariV2KategoriPicker from "./CariV2KategoriPicker";

const GELIR_TURU = new Set<CariV2Turu>(["musteri", "karma", "gelir_hesabi", "diger"]);
const GIDER_TURU = new Set<CariV2Turu>(["tedarikci", "karma", "gider_hesabi", "diger"]);

type FormState = {
  unvan: string;
  kisa_ad: string;
  hesap_turu: CariV2Turu;
  hesap_kodu: string;
  risk_limiti: string;
  varsayilan_vade_gun: string;
  vergi_no: string;
  vergi_dairesi: string;
  telefon: string;
  email: string;
  adres: string;
  il: string;
  ilce: string;
  yetkili_kisi: string;
  yetkili_telefon: string;
  banka_adi: string;
  iban: string;
  hesap_sahibi: string;
  notlar: string;
  etiketler: number[];
  gelir_kategorileri: number[];
  gider_kategorileri: number[];
  acilis_bakiye: string;
  acilis_yon: "borc" | "alacak";
};

const empty: FormState = {
  unvan: "", kisa_ad: "", hesap_turu: "musteri", hesap_kodu: "",
  risk_limiti: "", varsayilan_vade_gun: "", vergi_no: "", vergi_dairesi: "",
  telefon: "", email: "", adres: "", il: "", ilce: "", yetkili_kisi: "",
  yetkili_telefon: "", banka_adi: "", iban: "", hesap_sahibi: "", notlar: "",
  etiketler: [], gelir_kategorileri: [], gider_kategorileri: [],
  acilis_bakiye: "", acilis_yon: "borc",
};

export default function CariV2FormDrawer({
  kurumId, subeId, cariId, etiketler, onClose, onSaved, onToast,
}: {
  kurumId: number;
  subeId: number | null;
  cariId: number | null;
  etiketler: CariEtiket[];
  onClose: () => void;
  onSaved: () => void;
  onToast: (msg: string, type: "success" | "error" | "info") => void;
}) {
  const isEdit = cariId != null;
  const [form, setForm] = useState<FormState>(empty);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [gelirKatTree, setGelirKatTree] = useState<GelirKategorisiTreeItem[]>([]);
  const [giderKatTree, setGiderKatTree] = useState<GiderKategorisiTreeItem[]>([]);
  const [katLoading, setKatLoading] = useState(false);

  useEffect(() => {
    if (!kurumId || !subeId) {
      setGelirKatTree([]);
      setGiderKatTree([]);
      return;
    }
    setKatLoading(true);
    Promise.all([
      gelirKategoriService.tree(kurumId, subeId),
      giderKategoriService.tree(kurumId, subeId),
    ])
      .then(([gelir, gider]) => {
        setGelirKatTree(gelir.kategoriler ?? []);
        setGiderKatTree(gider.kategoriler ?? []);
      })
      .catch(() => {
        setGelirKatTree([]);
        setGiderKatTree([]);
      })
      .finally(() => setKatLoading(false));
  }, [kurumId, subeId]);

  useEffect(() => {
    if (!isEdit) return;
    (async () => {
      try {
        const d = await cariV2Service.get(cariId!);
        setForm({
          unvan: d.unvan, kisa_ad: d.kisa_ad, hesap_turu: d.hesap_turu,
          hesap_kodu: d.hesap_kodu,
          risk_limiti: d.risk_limiti ? String(d.risk_limiti) : "",
          varsayilan_vade_gun: d.varsayilan_vade_gun ? String(d.varsayilan_vade_gun) : "",
          vergi_no: d.vergi_no, vergi_dairesi: d.vergi_dairesi, telefon: d.telefon,
          email: d.email, adres: d.adres, il: d.il, ilce: d.ilce,
          yetkili_kisi: d.yetkili_kisi, yetkili_telefon: d.yetkili_telefon,
          banka_adi: d.banka_adi, iban: d.iban, hesap_sahibi: d.hesap_sahibi,
          notlar: d.notlar, etiketler: d.etiketler.map((e) => e.id),
          gelir_kategorileri: (d.gelir_kategorileri ?? []).map((k) => k.id),
          gider_kategorileri: (d.gider_kategorileri ?? []).map((k) => k.id),
          acilis_bakiye: "", acilis_yon: "borc",
        });
      } catch (e) {
        onToast(e instanceof Error ? e.message : "Yüklenemedi.", "error");
      } finally { setLoading(false); }
    })();
  }, [cariId, isEdit, onToast]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  const setHesapTuru = (tur: CariV2Turu) => {
    setForm((f) => ({
      ...f,
      hesap_turu: tur,
      gelir_kategorileri: GELIR_TURU.has(tur) ? f.gelir_kategorileri : [],
      gider_kategorileri: GIDER_TURU.has(tur) ? f.gider_kategorileri : [],
    }));
  };

  const yetenek = CARI_V2_TURLERI.find((t) => t.value === form.hesap_turu);
  const showBanka = ["tedarikci", "karma", "gider_hesabi"].includes(form.hesap_turu);
  const showGelirKat = GELIR_TURU.has(form.hesap_turu);
  const showGiderKat = GIDER_TURU.has(form.hesap_turu);

  const submit = async () => {
    setErrors({});
    if (!form.unvan.trim()) { setErrors({ unvan: "Ünvan zorunludur." }); return; }
    setSaving(true);
    const payload: Record<string, unknown> = {
      unvan: form.unvan, kisa_ad: form.kisa_ad, hesap_turu: form.hesap_turu,
      hesap_kodu: form.hesap_kodu,
      risk_limiti: form.risk_limiti ? Number(form.risk_limiti) : 0,
      varsayilan_vade_gun: form.varsayilan_vade_gun ? Number(form.varsayilan_vade_gun) : 0,
      vergi_no: form.vergi_no, vergi_dairesi: form.vergi_dairesi, telefon: form.telefon,
      email: form.email, adres: form.adres, il: form.il, ilce: form.ilce,
      yetkili_kisi: form.yetkili_kisi, yetkili_telefon: form.yetkili_telefon,
      banka_adi: form.banka_adi, iban: form.iban, hesap_sahibi: form.hesap_sahibi,
      notlar: form.notlar, etiketler: form.etiketler,
      gelir_kategorileri: showGelirKat ? form.gelir_kategorileri : [],
      gider_kategorileri: showGiderKat ? form.gider_kategorileri : [],
    };
    if (!isEdit && form.acilis_bakiye && Number(form.acilis_bakiye) > 0) {
      payload.acilis_bakiye = Number(form.acilis_bakiye);
      payload.acilis_yon = form.acilis_yon;
    }
    try {
      if (isEdit) {
        await cariV2Service.update(cariId!, payload);
        onToast("Cari güncellendi.", "success");
      } else {
        await cariV2Service.create(payload, kurumId, subeId);
        onToast("Cari oluşturuldu.", "success");
      }
      onSaved();
    } catch (e) {
      if (e instanceof FinansHttpError) {
        setErrors(e.fieldErrors);
        onToast(e.message, "error");
      } else {
        onToast(e instanceof Error ? e.message : "Kaydedilemedi.", "error");
      }
    } finally { setSaving(false); }
  };

  return (
    <div className="cv2-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="cv2-drawer">
        <div className="cv2-drawer__head">
          <span className="cv2-drawer__title">{isEdit ? "Cari Düzenle" : "Yeni Cari Hesap"}</span>
          <button className="cv2-close" onClick={onClose}>×</button>
        </div>

        {loading ? (
          <div className="cv2-loading"><div className="cv2-spinner" />Yükleniyor…</div>
        ) : (
          <>
            <div className="cv2-drawer__body">
              <div>
                <div className="cv2-section-title">Cari Türü</div>
                <div className="cv2-turler">
                  {CARI_V2_TURLERI.map((t) => (
                    <button key={t.value} type="button"
                      className={`cv2-tur-opt ${form.hesap_turu === t.value ? "active" : ""}`}
                      onClick={() => setHesapTuru(t.value)}>
                      <span>{t.ikon}</span><span>{t.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="cv2-section-title">Kimlik Bilgileri</div>
                <div className="cv2-formgrid">
                  <Field label="Ünvan *" error={errors.unvan}>
                    <input value={form.unvan} onChange={(e) => set("unvan", e.target.value)} />
                  </Field>
                  <Field label="Kısa Ad">
                    <input value={form.kisa_ad} onChange={(e) => set("kisa_ad", e.target.value)} />
                  </Field>
                  <Field label="Hesap Kodu (boşsa otomatik)">
                    <input value={form.hesap_kodu} onChange={(e) => set("hesap_kodu", e.target.value)} />
                  </Field>
                  <Field label="Vergi No" error={errors.vergi_no}>
                    <input value={form.vergi_no} onChange={(e) => set("vergi_no", e.target.value)} />
                  </Field>
                  <Field label="Vergi Dairesi">
                    <input value={form.vergi_dairesi} onChange={(e) => set("vergi_dairesi", e.target.value)} />
                  </Field>
                </div>
              </div>

              {(showGelirKat || showGiderKat) && (
                <div>
                  <div className="cv2-section-title">Kategoriler</div>
                  <p className="cv2-muted" style={{ fontSize: 12, marginBottom: 10 }}>
                    Finansman tanımlarında oluşturduğunuz ana kategori başlıkları ve alt kategoriler listelenir.
                    Gelir/gider kaydı açarken yalnızca burada seçtikleriniz görünür.
                  </p>
                  {showGelirKat && (
                    <Field label="Gelir Kategorileri">
                      <CariV2KategoriPicker
                        tree={gelirKatTree}
                        loading={katLoading}
                        selectedIds={form.gelir_kategorileri}
                        onChange={(ids) => set("gelir_kategorileri", ids)}
                        placeholder="Gelir kategorisi seçin"
                      />
                    </Field>
                  )}
                  {showGiderKat && (
                    <Field label="Gider Kategorileri">
                      <CariV2KategoriPicker
                        tree={giderKatTree}
                        loading={katLoading}
                        selectedIds={form.gider_kategorileri}
                        onChange={(ids) => set("gider_kategorileri", ids)}
                        placeholder="Gider kategorisi seçin"
                      />
                    </Field>
                  )}
                </div>
              )}

              <div>
                <div className="cv2-section-title">İletişim</div>
                <div className="cv2-formgrid">
                  <Field label="Telefon"><input value={form.telefon} onChange={(e) => set("telefon", e.target.value)} /></Field>
                  <Field label="E-posta" error={errors.email}><input value={form.email} onChange={(e) => set("email", e.target.value)} /></Field>
                  <Field label="İl"><input value={form.il} onChange={(e) => set("il", e.target.value)} /></Field>
                  <Field label="İlçe"><input value={form.ilce} onChange={(e) => set("ilce", e.target.value)} /></Field>
                  <Field label="Yetkili Kişi"><input value={form.yetkili_kisi} onChange={(e) => set("yetkili_kisi", e.target.value)} /></Field>
                  <Field label="Yetkili Telefon"><input value={form.yetkili_telefon} onChange={(e) => set("yetkili_telefon", e.target.value)} /></Field>
                </div>
                <div style={{ marginTop: 12 }}>
                  <Field label="Adres"><textarea rows={2} value={form.adres} onChange={(e) => set("adres", e.target.value)} /></Field>
                </div>
              </div>

              <div>
                <div className="cv2-section-title">Risk & Vade</div>
                <div className="cv2-formgrid">
                  <Field label="Risk Limiti (₺, 0 = limitsiz)">
                    <input type="number" value={form.risk_limiti} onChange={(e) => set("risk_limiti", e.target.value)} />
                  </Field>
                  <Field label="Varsayılan Vade (gün)">
                    <input type="number" value={form.varsayilan_vade_gun} onChange={(e) => set("varsayilan_vade_gun", e.target.value)} />
                  </Field>
                </div>
              </div>

              {showBanka && (
                <div>
                  <div className="cv2-section-title">Banka Bilgileri</div>
                  <div className="cv2-formgrid">
                    <Field label="Banka Adı"><input value={form.banka_adi} onChange={(e) => set("banka_adi", e.target.value)} /></Field>
                    <Field label="Hesap Sahibi"><input value={form.hesap_sahibi} onChange={(e) => set("hesap_sahibi", e.target.value)} /></Field>
                  </div>
                  <div style={{ marginTop: 12 }}>
                    <Field label="IBAN"><input value={form.iban} onChange={(e) => set("iban", e.target.value)} /></Field>
                  </div>
                </div>
              )}

              {etiketler.length > 0 && (
                <div>
                  <div className="cv2-section-title">Etiketler</div>
                  <div className="cv2-chips">
                    {etiketler.map((et) => {
                      const on = form.etiketler.includes(et.id);
                      return (
                        <button key={et.id} type="button"
                          className={`cv2-chip ${on ? "cv2-chip--active" : ""}`}
                          onClick={() => set("etiketler", on ? form.etiketler.filter((x) => x !== et.id) : [...form.etiketler, et.id])}>
                          {et.ad}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {!isEdit && (
                <div>
                  <div className="cv2-section-title">Açılış Bakiyesi (opsiyonel)</div>
                  <div className="cv2-formgrid">
                    <Field label="Tutar (₺)">
                      <input type="number" value={form.acilis_bakiye} onChange={(e) => set("acilis_bakiye", e.target.value)} />
                    </Field>
                    <Field label="Yön">
                      <select value={form.acilis_yon} onChange={(e) => set("acilis_yon", e.target.value as "borc" | "alacak")}>
                        <option value="borc">Borç (bize borçlu / verecek)</option>
                        <option value="alacak">Alacak (bizim borcumuz)</option>
                      </select>
                    </Field>
                  </div>
                </div>
              )}

              <div className="cv2-muted" style={{ fontSize: 12 }}>
                {yetenek?.label} · Tüm bakiye ve hareketler backend tarafından hesaplanır.
              </div>
            </div>

            <div className="cv2-drawer__foot">
              <button className="cv2-btn" onClick={onClose} disabled={saving}>İptal</button>
              <button className="cv2-btn cv2-btn--primary" onClick={submit} disabled={saving}>
                {saving ? "Kaydediliyor…" : isEdit ? "Güncelle" : "Oluştur"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="cv2-field">
      <label>{label}</label>
      {children}
      {error && <span style={{ color: "#dc2626", fontSize: 11.5 }}>{error}</span>}
    </div>
  );
}
