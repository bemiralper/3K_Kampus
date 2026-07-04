"use client";

import React, { useState, useEffect } from "react";
import {
  MaliHesap,
  MaliHesapCreatePayload,
  MaliHesapUpdatePayload,
  MALI_HESAP_TIPLERI,
  BANKA_SECENEKLERI,
  PARA_BIRIMLERI,
  BANKA_ZORUNLU_TIPLER,
  BANKA_DETAY_TIPLER,
} from "../../types/financial-account-types";
import { financialAccountService } from "../../services/finans-api";

interface Props {
  subeId: number;
  subeler?: { id: number; ad: string }[];
  editId?: number;
  onBack: () => void;
  onSuccess: (msg: string, hesap: MaliHesap) => void;
}

const inputBase = "w-full px-3.5 py-2.5 border rounded-xl text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all placeholder:text-gray-400";
const inputError = "border-red-300 focus:ring-red-500/20 focus:border-red-500";
const inputNormal = "border-gray-200";
const labelClass = "text-xs font-semibold text-gray-500 uppercase tracking-wider";

export default function MaliHesapForm({ subeId, subeler, editId, onBack, onSuccess }: Props) {
  const isEdit = !!editId;

  const [form, setForm] = useState({
    ad: "",
    tip: "kasa",
    banka: "",
    iban: "",
    hesap_no: "",
    para_birimi: "TRY",
    aktif_mi: true,
    aciklama: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);

  const showBankField = BANKA_ZORUNLU_TIPLER.includes(form.tip);
  const showIbanField = BANKA_DETAY_TIPLER.includes(form.tip);
  const showHesapNoField = BANKA_DETAY_TIPLER.includes(form.tip);

  useEffect(() => {
    if (!editId) return;
    setFetching(true);
    financialAccountService
      .get(editId)
      .then((data: MaliHesap) => {
        setForm({
          ad: data.ad || "",
          tip: data.tip || "kasa",
          banka: data.banka || "",
          iban: data.iban || "",
          hesap_no: data.hesap_no || "",
          para_birimi: data.para_birimi || "TRY",
          aktif_mi: data.aktif_mi,
          aciklama: data.aciklama || "",
        });
      })
      .catch((err: any) => {
        setErrors({ _general: err.message || "Veri yüklenemedi" });
      })
      .finally(() => setFetching(false));
  }, [editId]);

  const handleChange = (field: string, value: string | boolean) => {
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      if (field === "tip") {
        if (!BANKA_ZORUNLU_TIPLER.includes(value as string)) {
          next.banka = "";
        }
        if (!BANKA_DETAY_TIPLER.includes(value as string)) {
          next.iban = "";
          next.hesap_no = "";
        }
      }
      return next;
    });
    setErrors((prev) => {
      const copy = { ...prev };
      delete copy[field];
      delete copy._general;
      return copy;
    });
  };

  const formatIBANInput = (raw: string): string => {
    const cleaned = raw.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
    return cleaned.substring(0, 26);
  };

  const validateIBAN = (iban: string): boolean => {
    if (!iban) return false;
    return /^TR\d{24}$/.test(iban);
  };

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!isEdit && !subeId) errs.sube_id = "Şube seçimi zorunludur";
    if (!form.ad.trim()) errs.ad = "Hesap adı zorunludur";
    if (!form.tip) errs.tip = "Hesap tipi seçimi zorunludur";

    if (showBankField && !form.banka) {
      errs.banka = "Bu hesap tipi için banka seçimi zorunludur";
    }

    if (showIbanField && form.iban.trim() && !validateIBAN(form.iban)) {
      errs.iban = "Geçerli bir IBAN giriniz (TR + 24 rakam)";
    }

    if (!form.para_birimi) errs.para_birimi = "Para birimi seçimi zorunludur";

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const buildPayload = () => ({
    ad: form.ad.trim(),
    tip: form.tip,
    banka: showBankField ? form.banka : "",
    iban: showIbanField ? form.iban.trim() : "",
    hesap_no: showHesapNoField ? form.hesap_no.trim() : "",
    para_birimi: form.para_birimi,
    aktif_mi: form.aktif_mi,
    aciklama: form.aciklama.trim(),
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    setErrors({});

    try {
      if (isEdit) {
        const payload: MaliHesapUpdatePayload = buildPayload();
        const updated = await financialAccountService.update(editId!, payload);
        onSuccess("Mali hesap başarıyla güncellendi", updated);
      } else {
        const payload: MaliHesapCreatePayload = { sube_id: subeId, ...buildPayload() };
        const created = await financialAccountService.create(payload);
        onSuccess("Mali hesap başarıyla oluşturuldu", created);
      }
    } catch (err: any) {
      if (err.fieldErrors) {
        const fieldErrs: Record<string, string> = {};
        for (const [key, val] of Object.entries(err.fieldErrors)) {
          fieldErrs[key] = Array.isArray(val) ? val.join(", ") : String(val);
        }
        setErrors(fieldErrs);
      } else {
        setErrors({ _general: err.message || "İşlem sırasında bir hata oluştu" });
      }
    } finally {
      setLoading(false);
    }
  };

  if (fetching) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
        <div className="flex flex-col items-center justify-center py-16">
          <div className="w-8 h-8 border-[3px] border-emerald-200 border-t-emerald-600 rounded-full animate-spin" />
          <p className="mt-3 text-sm text-gray-400">Yükleniyor...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-50">
        <h3 className="flex items-center gap-2.5 text-sm font-bold text-gray-800 m-0">
          <div className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center">
            <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="#10b981" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
          {isEdit ? "Mali Hesap Düzenle" : "Yeni Mali Hesap"}
        </h3>
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 px-4 py-2 bg-white text-gray-700 text-sm font-semibold rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors cursor-pointer"
        >
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Geri
        </button>
      </div>

      <div className="p-6">
        {errors._general && (
          <div className="flex items-center gap-3 px-4 py-3 mb-5 rounded-xl bg-red-50 border border-red-100 text-sm text-red-700">
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" className="shrink-0">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            {errors._general}
          </div>
        )}

        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {!isEdit && subeId && (
            <div className="flex flex-col gap-1.5 md:col-span-2">
              <label className={labelClass}>Şube</label>
              <div className="px-3.5 py-2.5 border border-gray-100 rounded-xl text-sm text-gray-700 bg-gray-50">
                {subeler?.find((s) => s.id === subeId)?.ad || `Şube #${subeId}`}
              </div>
              {errors.sube_id && <span className="text-xs text-red-500 mt-0.5">{errors.sube_id}</span>}
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label className={labelClass}>Hesap Adı <span className="text-red-500">*</span></label>
            <input
              className={`${inputBase} ${errors.ad ? inputError : inputNormal}`}
              type="text"
              value={form.ad}
              onChange={(e) => handleChange("ad", e.target.value)}
              placeholder="Örn: Vakıfbank Merkez, Merkez Nakit Kasası, Garanti POS"
              maxLength={200}
            />
            <span className="text-xs text-gray-400">Listelerde görünen kullanıcı dostu isim</span>
            {errors.ad && <span className="text-xs text-red-500 mt-0.5">{errors.ad}</span>}
          </div>

          <div className="flex flex-col gap-1.5">
            <label className={labelClass}>Hesap Tipi <span className="text-red-500">*</span></label>
            <select
              className={`${inputBase} ${errors.tip ? inputError : inputNormal}`}
              value={form.tip}
              onChange={(e) => handleChange("tip", e.target.value)}
            >
              {MALI_HESAP_TIPLERI.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            {errors.tip && <span className="text-xs text-red-500 mt-0.5">{errors.tip}</span>}
          </div>

          {showBankField && (
            <div className="flex flex-col gap-1.5">
              <label className={labelClass}>Banka <span className="text-red-500">*</span></label>
              <select
                className={`${inputBase} ${errors.banka ? inputError : inputNormal}`}
                value={form.banka}
                onChange={(e) => handleChange("banka", e.target.value)}
              >
                <option value="">Banka seçiniz</option>
                {BANKA_SECENEKLERI.map((b) => (
                  <option key={b.value} value={b.value}>{b.label}</option>
                ))}
              </select>
              {errors.banka && <span className="text-xs text-red-500 mt-0.5">{errors.banka}</span>}
            </div>
          )}

          {showIbanField && (
            <div className="flex flex-col gap-1.5">
              <label className={labelClass}>IBAN</label>
              <input
                className={`${inputBase} ${errors.iban ? inputError : inputNormal} font-mono tracking-wider`}
                type="text"
                value={form.iban}
                onChange={(e) => handleChange("iban", formatIBANInput(e.target.value))}
                placeholder="TR000000000000000000000000"
                maxLength={26}
              />
              {errors.iban && <span className="text-xs text-red-500 mt-0.5">{errors.iban}</span>}
              <span className="text-xs text-gray-400">İsteğe bağlı — Türkiye IBAN: TR + 24 rakam</span>
            </div>
          )}

          {showHesapNoField && (
            <div className="flex flex-col gap-1.5">
              <label className={labelClass}>Hesap No</label>
              <input
                className={`${inputBase} ${inputNormal}`}
                type="text"
                value={form.hesap_no}
                onChange={(e) => handleChange("hesap_no", e.target.value)}
                placeholder="Örn: 123-4567890"
                maxLength={50}
              />
              <span className="text-xs text-gray-400">İsteğe bağlı — banka hesap numarası</span>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label className={labelClass}>Para Birimi <span className="text-red-500">*</span></label>
            <select
              className={`${inputBase} ${errors.para_birimi ? inputError : inputNormal}`}
              value={form.para_birimi}
              onChange={(e) => handleChange("para_birimi", e.target.value)}
            >
              {PARA_BIRIMLERI.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
            {errors.para_birimi && <span className="text-xs text-red-500 mt-0.5">{errors.para_birimi}</span>}
          </div>

          <div className="flex flex-col gap-1.5">
            <label className={labelClass}>Durum</label>
            <div className="pt-1">
              <button
                type="button"
                onClick={() => handleChange("aktif_mi", !form.aktif_mi)}
                className={`relative inline-flex h-6 w-[42px] items-center rounded-full transition-colors cursor-pointer border-none ${
                  form.aktif_mi ? "bg-emerald-500" : "bg-gray-300"
                }`}
              >
                <span className={`inline-block transform rounded-full bg-white shadow-sm transition-transform ${
                  form.aktif_mi ? "translate-x-[22px]" : "translate-x-[3px]"
                }`} style={{ width: 18, height: 18 }} />
              </button>
            </div>
            <span className="text-xs text-gray-400">
              {form.aktif_mi ? "Aktif — işlemlerde kullanılabilir" : "Pasif — işlemlerde kullanılamaz"}
            </span>
          </div>

          <div className="flex flex-col gap-1.5 md:col-span-2">
            <label className={labelClass}>Açıklama</label>
            <textarea
              className={`${inputBase} ${inputNormal} min-h-[80px] resize-y`}
              value={form.aciklama}
              onChange={(e) => handleChange("aciklama", e.target.value)}
              placeholder="İsteğe bağlı açıklama..."
              maxLength={500}
            />
          </div>

          <div className="flex items-center justify-end gap-3 md:col-span-2 pt-3 border-t border-gray-100">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-white text-gray-700 text-sm font-semibold rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors cursor-pointer"
            >
              İptal
            </button>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Kaydediliyor...
                </>
              ) : (
                <>
                  <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  {isEdit ? "Güncelle" : "Kaydet"}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
