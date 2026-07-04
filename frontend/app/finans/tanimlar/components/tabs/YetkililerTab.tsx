"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useKurum } from "@/lib/contexts/KurumContext";
import { MaliHesapYetkilisi, MaliHesapYetkilisiPayload } from "../../../types/financial-account-types";
import { maliHesapYetkilisiService } from "../../../services/finans-api";
import { personelAccessService, type FinansYetkiliPersonel } from "@/lib/personel-access-api";

interface Props {
  kurumId: number;
  maliHesapId: number;
  onToast: (msg: string, type?: "success" | "error" | "info") => void;
}

const inputBase = "w-full px-3.5 py-2.5 border rounded-xl text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all placeholder:text-gray-400";
const inputNormal = "border-gray-200";
const inputError = "border-red-300 focus:ring-red-500/20 focus:border-red-500";
const labelClass = "text-xs font-semibold text-gray-500 uppercase tracking-wider";

const emptyForm: MaliHesapYetkilisiPayload = {
  personel_id: null,
  ad_soyad: "",
  rol: "",
  telefon: "",
  email: "",
  notlar: "",
};

export default function YetkililerTab({ kurumId, maliHesapId, onToast }: Props) {
  const { activeEgitimYili } = useKurum();
  const [data, setData] = useState<MaliHesapYetkilisi[]>([]);
  const [personelList, setPersonelList] = useState<FinansYetkiliPersonel[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<MaliHesapYetkilisiPayload>(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(() => {
    setLoading(true);
    maliHesapYetkilisiService
      .list(maliHesapId)
      .then((res) => setData(res.yetkililer || []))
      .catch((err: any) => onToast(err.message || "Yetkililer yüklenemedi", "error"))
      .finally(() => setLoading(false));
  }, [maliHesapId, onToast]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    personelAccessService
      .finansYetkililer({
        kurum_id: kurumId,
        egitim_yili_id: activeEgitimYili?.id,
      })
      .then(setPersonelList)
      .catch(() => setPersonelList([]));
  }, [kurumId, activeEgitimYili?.id]);

  const openCreate = () => {
    setEditId(null);
    setForm(emptyForm);
    setErrors({});
    setModalOpen(true);
  };

  const openEdit = (item: MaliHesapYetkilisi) => {
    setEditId(item.id);
    setForm({
      personel_id: item.personel ?? null,
      ad_soyad: item.ad_soyad || "",
      rol: item.rol || "",
      telefon: item.telefon || "",
      email: item.email || "",
      notlar: item.notlar || "",
    });
    setErrors({});
    setModalOpen(true);
  };

  const handlePersonelSelect = (personelId: string) => {
    if (!personelId) {
      setForm((prev) => ({ ...prev, personel_id: null }));
      return;
    }
    const pid = Number(personelId);
    const p = personelList.find((x) => x.id === pid);
    if (p) {
      setForm((prev) => ({
        ...prev,
        personel_id: pid,
        ad_soyad: p.tam_ad,
        rol: p.rol_adi || prev.rol,
        telefon: p.telefon || "",
        email: p.email || "",
      }));
    } else {
      setForm((prev) => ({ ...prev, personel_id: pid }));
    }
    setErrors((prev) => { const c = { ...prev }; delete c.personel_id; delete c.ad_soyad; return c; });
  };

  const handleChange = (field: keyof MaliHesapYetkilisiPayload, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => { const c = { ...prev }; delete c[field]; delete c._general; return c; });
  };

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!form.personel_id && !form.ad_soyad?.trim()) {
      errs.personel_id = "Personel seçin veya ad soyad girin";
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try {
      const payload: MaliHesapYetkilisiPayload = {
        personel_id: form.personel_id || null,
        ad_soyad: form.ad_soyad?.trim() || undefined,
        rol: form.rol?.trim() || "",
        telefon: form.telefon?.trim() || "",
        email: form.email?.trim() || "",
        notlar: form.notlar?.trim() || "",
      };
      if (editId) {
        await maliHesapYetkilisiService.update(editId, payload);
        onToast("Yetkili güncellendi");
      } else {
        await maliHesapYetkilisiService.create(maliHesapId, payload);
        onToast("Yetkili eklendi");
      }
      setModalOpen(false);
      fetchData();
    } catch (err: any) {
      setErrors({ _general: err.message || "İşlem sırasında bir hata oluştu" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item: MaliHesapYetkilisi) => {
    if (!confirm(`"${item.ad_soyad || item.personel_ad}" silinecek. Onaylıyor musunuz?`)) return;
    try {
      await maliHesapYetkilisiService.delete(item.id);
      onToast("Yetkili silindi");
      fetchData();
    } catch (err: any) {
      onToast(err.message || "Silme işlemi başarısız", "error");
    }
  };

  return (
    <div className="bg-white">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-50">
        <p className="text-xs text-gray-400 m-0">
          Yönetici ve muhasebe personelinden seçin — bilgilendirme amaçlı iletişim kaydı.
        </p>
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-2 px-3.5 py-2 bg-emerald-600 text-white text-xs font-semibold rounded-xl hover:bg-emerald-700 transition-colors cursor-pointer shrink-0"
        >
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Yetkili Ekle
        </button>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-16">
          <div className="w-7 h-7 border-[3px] border-emerald-200 border-t-emerald-600 rounded-full animate-spin" />
        </div>
      ) : data.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-sm text-gray-400">Bu hesaba yetkili tanımlanmamış</p>
        </div>
      ) : (
        <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-3">
          {data.map((y) => (
            <div key={y.id} className="border border-gray-100 rounded-xl p-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-bold text-gray-800 truncate">{y.ad_soyad || y.personel_ad || "İsimsiz"}</div>
                {y.rol && <div className="text-xs text-emerald-600 font-semibold mt-0.5">{y.rol}</div>}
                {y.telefon && <div className="text-xs text-gray-500 mt-1">📞 {y.telefon}</div>}
                {y.email && <div className="text-xs text-gray-500 mt-0.5">✉️ {y.email}</div>}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => openEdit(y)} title="Düzenle" className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 transition-all cursor-pointer bg-transparent border-none">
                  <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
                <button onClick={() => handleDelete(y)} title="Sil" className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50 transition-all cursor-pointer bg-transparent border-none">
                  <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modalOpen && (
        <div
          className="fixed inset-0 z-[3000] flex items-center justify-center p-4"
          style={{ background: "rgba(15,23,42,.45)" }}
          onClick={() => !saving && setModalOpen(false)}
        >
          <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-50">
              <h3 className="text-sm font-bold text-gray-800 m-0">{editId ? "Yetkili Düzenle" : "Yeni Yetkili"}</h3>
              <button onClick={() => setModalOpen(false)} className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-50 cursor-pointer bg-transparent border-none">
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4">
              {errors._general && (
                <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-100 text-sm text-red-700">{errors._general}</div>
              )}
              <div className="flex flex-col gap-1.5">
                <label className={labelClass}>Personel (Yönetici / Muhasebe) <span className="text-red-500">*</span></label>
                <select
                  className={`${inputBase} ${errors.personel_id ? inputError : inputNormal}`}
                  value={form.personel_id || ""}
                  onChange={(e) => handlePersonelSelect(e.target.value)}
                  autoFocus
                >
                  <option value="">Personel seçin…</option>
                  {personelList.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.tam_ad} — {p.rol_adi}{p.gorev_sube_ad ? ` (${p.gorev_sube_ad})` : ""}
                    </option>
                  ))}
                </select>
                {personelList.length === 0 && (
                  <span className="text-xs text-amber-600">Kurumda yönetici/muhasebe görevlendirmesi bulunamadı.</span>
                )}
                {errors.personel_id && <span className="text-xs text-red-500">{errors.personel_id}</span>}
              </div>
              <div className="flex flex-col gap-1.5">
                <label className={labelClass}>Rol / Görev</label>
                <input className={`${inputBase} ${inputNormal}`} type="text" value={form.rol} onChange={(e) => handleChange("rol", e.target.value)} placeholder="Otomatik doldurulur" readOnly={!!form.personel_id} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className={labelClass}>Telefon</label>
                  <input className={`${inputBase} ${inputNormal}`} type="text" value={form.telefon} onChange={(e) => handleChange("telefon", e.target.value)} readOnly={!!form.personel_id} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className={labelClass}>E-posta</label>
                  <input className={`${inputBase} ${inputNormal}`} type="email" value={form.email} onChange={(e) => handleChange("email", e.target.value)} readOnly={!!form.personel_id} />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className={labelClass}>Notlar</label>
                <textarea className={`${inputBase} ${inputNormal} min-h-[70px] resize-y`} value={form.notlar} onChange={(e) => handleChange("notlar", e.target.value)} placeholder="İsteğe bağlı..." />
              </div>
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100">
                <button type="button" onClick={() => setModalOpen(false)} className="px-5 py-2.5 bg-white text-gray-700 text-sm font-semibold rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors cursor-pointer">İptal</button>
                <button type="submit" disabled={saving} className="px-5 py-2.5 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 transition-colors cursor-pointer disabled:opacity-50">
                  {saving ? "Kaydediliyor..." : editId ? "Güncelle" : "Kaydet"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
