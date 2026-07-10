"use client";

import React, { useState } from "react";
import type { FinansToastType } from "@/components/finans/FinansToast";
import { cekSenetV2Service } from "../services/cek-senet-v2-api";

type Cari = { id: number; gorunen_ad: string };
type Yontem = { id: number; ad: string; tip: string };

interface Props {
  kurumId: number;
  subeId?: number | null;
  cariHesaplar: Cari[];
  cekSenetYontemleri: Yontem[];
  onClose: () => void;
  onSaved: () => void;
  notify: (msg: string, type: FinansToastType) => void;
}

export default function CekSenetV2FormDrawer({
  kurumId,
  subeId,
  cariHesaplar,
  cekSenetYontemleri,
  onClose,
  onSaved,
  notify,
}: Props) {
  const [saving, setSaving] = useState(false);
  const [yon, setYon] = useState<"alinan" | "verilen">("alinan");
  const [f, setF] = useState({
    cari_hesap_id: "",
    odeme_yontemi_id: "",
    tutar: "",
    vade_tarihi: "",
    keside_tarihi: "",
    cek_senet_no: "",
    seri_no: "",
    banka_adi: "",
    sube_adi: "",
    hesap_no: "",
    keside_eden: "",
    aciklama: "",
  });
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));

  const submit = async () => {
    if (!f.odeme_yontemi_id || !f.tutar || !f.vade_tarihi) {
      notify("Ödeme yöntemi, tutar ve vade zorunlu", "error");
      return;
    }
    setSaving(true);
    try {
      await cekSenetV2Service.create({
        kurum_id: kurumId,
        sube_id: subeId || undefined,
        yon,
        cari_hesap_id: f.cari_hesap_id ? Number(f.cari_hesap_id) : undefined,
        odeme_yontemi_id: Number(f.odeme_yontemi_id),
        tutar: Number(f.tutar),
        vade_tarihi: f.vade_tarihi,
        keside_tarihi: f.keside_tarihi || undefined,
        cek_senet_no: f.cek_senet_no,
        seri_no: f.seri_no,
        banka_adi: f.banka_adi,
        sube_adi: f.sube_adi,
        hesap_no: f.hesap_no,
        keside_eden: f.keside_eden,
        aciklama: f.aciklama,
      });
      notify("Kayıt oluşturuldu", "success");
      onSaved();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Kayıt oluşturulamadı", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="csv2-overlay" onClick={onClose}>
      <div className="csv2-drawer csv2-drawer--form" onClick={(e) => e.stopPropagation()}>
        <div className="csv2-drawer__head">
          <h2 className="csv2-drawer__title">Yeni Çek / Senet</h2>
          <button type="button" className="csv2-close" onClick={onClose}>✕</button>
        </div>

        <div className="csv2-form">
          {cekSenetYontemleri.length === 0 && (
            <p className="csv2-hint">
              Önce Finans → Tanımlar → Ödeme Yöntemleri&apos;nden Çek veya Senet tipi tanımlayın.
            </p>
          )}

          <div className="csv2-field">
            <label>Yön</label>
            <div className="csv2-seg">
              <button type="button" className={yon === "alinan" ? "active" : ""} onClick={() => setYon("alinan")}>Alınan (Gelen)</button>
              <button type="button" className={yon === "verilen" ? "active" : ""} onClick={() => setYon("verilen")}>Verilen (Giden)</button>
            </div>
          </div>

          <div className="csv2-formgrid">
            <div className="csv2-field csv2-field--full">
              <label>Cari Hesap</label>
              <select value={f.cari_hesap_id} onChange={(e) => set("cari_hesap_id", e.target.value)}>
                <option value="">Seçin (opsiyonel)</option>
                {cariHesaplar.map((c) => <option key={c.id} value={c.id}>{c.gorunen_ad}</option>)}
              </select>
            </div>
            <div className="csv2-field csv2-field--full">
              <label>Ödeme Yöntemi (Çek/Senet) *</label>
              <select value={f.odeme_yontemi_id} onChange={(e) => set("odeme_yontemi_id", e.target.value)}>
                <option value="">Seçin…</option>
                {cekSenetYontemleri.map((y) => <option key={y.id} value={y.id}>{y.ad}</option>)}
              </select>
            </div>
            <div className="csv2-field"><label>Tutar (₺) *</label><input type="number" min="1" value={f.tutar} onChange={(e) => set("tutar", e.target.value)} /></div>
            <div className="csv2-field"><label>Vade Tarihi *</label><input type="date" value={f.vade_tarihi} onChange={(e) => set("vade_tarihi", e.target.value)} /></div>
            <div className="csv2-field"><label>Keşide Tarihi</label><input type="date" value={f.keside_tarihi} onChange={(e) => set("keside_tarihi", e.target.value)} /></div>
            <div className="csv2-field"><label>Belge No</label><input value={f.cek_senet_no} onChange={(e) => set("cek_senet_no", e.target.value)} /></div>
            <div className="csv2-field"><label>Seri No</label><input value={f.seri_no} onChange={(e) => set("seri_no", e.target.value)} /></div>
            <div className="csv2-field"><label>Keşide Eden</label><input value={f.keside_eden} onChange={(e) => set("keside_eden", e.target.value)} /></div>
            <div className="csv2-field"><label>Banka</label><input value={f.banka_adi} onChange={(e) => set("banka_adi", e.target.value)} /></div>
            <div className="csv2-field"><label>Şube</label><input value={f.sube_adi} onChange={(e) => set("sube_adi", e.target.value)} /></div>
            <div className="csv2-field"><label>Hesap No</label><input value={f.hesap_no} onChange={(e) => set("hesap_no", e.target.value)} /></div>
            <div className="csv2-field csv2-field--full"><label>Açıklama</label><textarea rows={2} value={f.aciklama} onChange={(e) => set("aciklama", e.target.value)} /></div>
          </div>
        </div>

        <div className="csv2-drawer__foot">
          <button type="button" className="csv2-btn csv2-btn--primary" disabled={saving} onClick={submit}>
            {saving ? "Kaydediliyor…" : "Kaydet"}
          </button>
          <button type="button" className="csv2-btn" onClick={onClose}>İptal</button>
        </div>
      </div>
    </div>
  );
}
