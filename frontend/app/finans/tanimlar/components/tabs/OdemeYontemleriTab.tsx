"use client";

import React, { useCallback, useEffect, useState } from "react";
import { OdemeYontemi, OdemeYontemiCreatePayload, OdemeYontemiUpdatePayload, ODEME_YONTEMI_TIPLERI, tipLabel } from "../../../types/payment-method-types";
import { paymentMethodService } from "../../../services/finans-api";

interface Props {
  kurumId: number;
  maliHesapId: number;
  onToast: (msg: string, type?: "success" | "error" | "info") => void;
  onChanged?: () => void;
}

const inputBase = "w-full px-3.5 py-2.5 border rounded-xl text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all placeholder:text-gray-400";
const inputNormal = "border-gray-200";
const inputError = "border-red-300 focus:ring-red-500/20 focus:border-red-500";
const labelClass = "text-xs font-semibold text-gray-500 uppercase tracking-wider";

const emptyForm = {
  ad: "",
  tip: "nakit",
  komisyon_orani: "",
  valor_gun: "",
  aktif_mi: true,
  aciklama: "",
};

export default function OdemeYontemleriTab({ kurumId, maliHesapId, onToast, onChanged }: Props) {
  const [data, setData] = useState<OdemeYontemi[]>([]);
  const [loading, setLoading] = useState(true);
  const [togglingId, setTogglingId] = useState<number | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await paymentMethodService.list({ kurum_id: String(kurumId), mali_hesap_id: String(maliHesapId) });
      setData(Array.isArray(res) ? res : res.odeme_yontemleri || []);
    } catch (err: any) {
      onToast(err.message || "Ödeme yöntemleri yüklenemedi", "error");
    } finally {
      setLoading(false);
    }
  }, [kurumId, maliHesapId, onToast]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openCreate = () => {
    setEditId(null);
    setForm(emptyForm);
    setErrors({});
    setModalOpen(true);
  };

  const openEdit = (item: OdemeYontemi) => {
    setEditId(item.id);
    setForm({
      ad: item.ad || "",
      tip: item.tip || "nakit",
      komisyon_orani: item.komisyon_orani != null ? String(item.komisyon_orani) : "",
      valor_gun: item.valor_gun != null ? String(item.valor_gun) : "",
      aktif_mi: item.aktif_mi,
      aciklama: item.aciklama || "",
    });
    setErrors({});
    setModalOpen(true);
  };

  const handleChange = (field: string, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => { const c = { ...prev }; delete c[field]; delete c._general; return c; });
  };

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!form.ad.trim()) errs.ad = "Ödeme yöntemi adı zorunludur";
    if (!form.tip) errs.tip = "Tip seçimi zorunludur";
    if (form.komisyon_orani && (isNaN(Number(form.komisyon_orani)) || Number(form.komisyon_orani) < 0)) {
      errs.komisyon_orani = "Geçerli bir komisyon oranı giriniz";
    }
    if (form.valor_gun && (isNaN(Number(form.valor_gun)) || Number(form.valor_gun) < 0 || !Number.isInteger(Number(form.valor_gun)))) {
      errs.valor_gun = "Geçerli bir valör günü giriniz (tam sayı)";
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    setErrors({});
    try {
      if (editId) {
        const payload: OdemeYontemiUpdatePayload = {
          ad: form.ad.trim(),
          tip: form.tip,
          komisyon_orani: form.komisyon_orani ? Number(form.komisyon_orani) : null,
          valor_gun: form.valor_gun ? Number(form.valor_gun) : null,
          aktif_mi: form.aktif_mi,
          aciklama: form.aciklama.trim() || null,
        };
        await paymentMethodService.update(editId, payload);
        onToast("Ödeme yöntemi güncellendi");
      } else {
        const isCekSenet = form.tip === "cek" || form.tip === "senet";
        const payload: OdemeYontemiCreatePayload = {
          kurum_id: kurumId,
          ...(isCekSenet ? {} : { mali_hesap_id: maliHesapId }),
          ad: form.ad.trim(),
          tip: form.tip,
          komisyon_orani: form.komisyon_orani ? Number(form.komisyon_orani) : null,
          valor_gun: form.valor_gun ? Number(form.valor_gun) : null,
          aktif_mi: form.aktif_mi,
          aciklama: form.aciklama.trim() || null,
        };
        await paymentMethodService.create(payload);
        onToast("Ödeme yöntemi oluşturuldu");
      }
      setModalOpen(false);
      fetchData();
      onChanged?.();
    } catch (err: any) {
      if (err.fieldErrors) {
        const fieldErrs: Record<string, string> = {};
        for (const [key, val] of Object.entries(err.fieldErrors)) {
          fieldErrs[key] = Array.isArray(val) ? (val as string[]).join(", ") : String(val);
        }
        setErrors(fieldErrs);
      } else {
        setErrors({ _general: err.message || "İşlem sırasında bir hata oluştu" });
      }
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (item: OdemeYontemi) => {
    setTogglingId(item.id);
    try {
      await paymentMethodService.toggle(item.id);
      onToast(`"${item.ad}" ${item.aktif_mi ? "pasif" : "aktif"} yapıldı`);
      fetchData();
      onChanged?.();
    } catch (err: any) {
      onToast(err.message || "Durum değiştirilemedi", "error");
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async (item: OdemeYontemi) => {
    if (item.kullanimda) {
      onToast(`"${item.ad}" kayıtlarda kullanılıyor. Silmek yerine pasif yapabilirsiniz.`, "info");
      return;
    }
    if (!confirm(`"${item.ad}" ödeme yöntemi silinecek. Onaylıyor musunuz?`)) return;
    try {
      await paymentMethodService.delete(item.id);
      onToast(`"${item.ad}" başarıyla silindi`);
      fetchData();
      onChanged?.();
    } catch (err: any) {
      onToast(err.message || "Silme işlemi başarısız", "error");
    }
  };

  return (
    <div className="bg-white">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-50">
        <p className="text-xs text-gray-400 m-0">Bu mali hesaba tanımlı ödeme yöntemleri. Tahsilat/gider formlarında sadece bu liste görünür.</p>
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-2 px-3.5 py-2 bg-emerald-600 text-white text-xs font-semibold rounded-xl hover:bg-emerald-700 transition-colors cursor-pointer shrink-0"
        >
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Yeni Ödeme Yöntemi
        </button>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-16">
          <div className="w-7 h-7 border-[3px] border-emerald-200 border-t-emerald-600 rounded-full animate-spin" />
        </div>
      ) : data.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-14 h-14 rounded-2xl bg-gray-50 flex items-center justify-center mb-4">
            <svg width="26" height="26" fill="none" viewBox="0 0 24 24" stroke="#9ca3af" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
            </svg>
          </div>
          <h4 className="text-sm font-bold text-gray-700 mb-1">Bu hesaba tanımlı ödeme yöntemi yok</h4>
          <p className="text-xs text-gray-400">Örn: Nakit, Kredi Kartı, Havale/EFT ekleyin.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Ad</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Tip</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Komisyon</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Valör</th>
                <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Durum</th>
                <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider w-[100px]">İşlemler</th>
              </tr>
            </thead>
            <tbody>
              {data.map((item) => (
                <tr key={item.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                  <td className="px-5 py-3">
                    <span className="font-semibold text-gray-800">{item.ad}</span>
                    {item.kullanimda && (
                      <span className="ml-2 inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 text-amber-700">Kullanımda</span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-50 text-emerald-700">{tipLabel(item.tip)}</span>
                  </td>
                  <td className="px-3 py-3 text-gray-700">{item.komisyon_orani != null ? `%${item.komisyon_orani}` : "—"}</td>
                  <td className="px-3 py-3 text-gray-700">{item.valor_gun != null ? `${item.valor_gun} gün` : "—"}</td>
                  <td className="px-3 py-3 text-center">
                    <button
                      onClick={() => handleToggle(item)}
                      disabled={togglingId === item.id}
                      className={`relative inline-flex h-6 w-[42px] items-center rounded-full transition-colors cursor-pointer border-none ${
                        item.aktif_mi ? "bg-emerald-500" : "bg-gray-300"
                      } ${togglingId === item.id ? "opacity-50 cursor-not-allowed" : ""}`}
                    >
                      <span className={`inline-block transform rounded-full bg-white shadow-sm transition-transform ${
                        item.aktif_mi ? "translate-x-[22px]" : "translate-x-[3px]"
                      }`} style={{ width: 18, height: 18 }} />
                    </button>
                  </td>
                  <td className="px-3 py-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => openEdit(item)}
                        title="Düzenle"
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 transition-all cursor-pointer bg-transparent border-none"
                      >
                        <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      {!item.kullanimda && (
                        <button
                          onClick={() => handleDelete(item)}
                          title="Sil"
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50 transition-all cursor-pointer bg-transparent border-none"
                        >
                          <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create / Edit Modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-[3000] flex items-center justify-center p-4"
          style={{ background: "rgba(15,23,42,.45)" }}
          onClick={() => !saving && setModalOpen(false)}
        >
          <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-50">
              <h3 className="text-sm font-bold text-gray-800 m-0">{editId ? "Ödeme Yöntemi Düzenle" : "Yeni Ödeme Yöntemi"}</h3>
              <button
                onClick={() => setModalOpen(false)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-50 cursor-pointer bg-transparent border-none"
              >
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4">
              {errors._general && (
                <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-50 border border-red-100 text-sm text-red-700">
                  {errors._general}
                </div>
              )}
              <div className="flex flex-col gap-1.5">
                <label className={labelClass}>Ödeme Yöntemi Adı <span className="text-red-500">*</span></label>
                <input
                  className={`${inputBase} ${errors.ad ? inputError : inputNormal}`}
                  type="text"
                  value={form.ad}
                  onChange={(e) => handleChange("ad", e.target.value)}
                  placeholder="Örn: Nakit, Kredi Kartı, Havale"
                  maxLength={150}
                  autoFocus
                />
                {errors.ad && <span className="text-xs text-red-500">{errors.ad}</span>}
              </div>
              <div className="flex flex-col gap-1.5">
                <label className={labelClass}>Tip <span className="text-red-500">*</span></label>
                <select
                  className={`${inputBase} ${errors.tip ? inputError : inputNormal}`}
                  value={form.tip}
                  onChange={(e) => handleChange("tip", e.target.value)}
                >
                  {ODEME_YONTEMI_TIPLERI.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className={labelClass}>Komisyon (%)</label>
                  <input
                    className={`${inputBase} ${errors.komisyon_orani ? inputError : inputNormal}`}
                    type="number" step="0.01" min="0" max="100"
                    value={form.komisyon_orani}
                    onChange={(e) => handleChange("komisyon_orani", e.target.value)}
                    placeholder="0.00"
                  />
                  {errors.komisyon_orani && <span className="text-xs text-red-500">{errors.komisyon_orani}</span>}
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className={labelClass}>Valör Gün</label>
                  <input
                    className={`${inputBase} ${errors.valor_gun ? inputError : inputNormal}`}
                    type="number" min="0" step="1"
                    value={form.valor_gun}
                    onChange={(e) => handleChange("valor_gun", e.target.value)}
                    placeholder="0"
                  />
                  {errors.valor_gun && <span className="text-xs text-red-500">{errors.valor_gun}</span>}
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className={labelClass}>Açıklama</label>
                <textarea
                  className={`${inputBase} ${inputNormal} min-h-[70px] resize-y`}
                  value={form.aciklama}
                  onChange={(e) => handleChange("aciklama", e.target.value)}
                  placeholder="İsteğe bağlı..."
                  maxLength={500}
                />
              </div>
              <div className="flex items-center gap-3">
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
                <span className="text-xs text-gray-500">{form.aktif_mi ? "Aktif" : "Pasif"}</span>
              </div>
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-5 py-2.5 bg-white text-gray-700 text-sm font-semibold rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors cursor-pointer"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2.5 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 transition-colors cursor-pointer disabled:opacity-50"
                >
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
