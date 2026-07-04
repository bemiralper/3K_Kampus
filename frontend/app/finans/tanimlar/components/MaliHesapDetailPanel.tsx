"use client";

import React, { useCallback, useEffect, useState } from "react";
import { MaliHesapDetay, hesapTipLabel } from "../../types/financial-account-types";
import { financialAccountService } from "../../services/finans-api";
import HareketlerTab from "./tabs/HareketlerTab";
import OdemeYontemleriTab from "./tabs/OdemeYontemleriTab";
import YetkililerTab from "./tabs/YetkililerTab";
import AciklamalarTab from "./tabs/AciklamalarTab";

interface Props {
  kurumId: number;
  maliHesapId: number;
  refreshKey: number;
  onToast: (msg: string, type?: "success" | "error" | "info") => void;
  onEdit: (id: number) => void;
  onDeleted: () => void;
  onChanged: () => void;
}

type TabKey = "hareketler" | "odeme_yontemleri" | "yetkililer" | "aciklamalar";

const fmtTL = (n: number) =>
  new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 2 }).format(n || 0);

const fmtTarih = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString("tr-TR", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "Henüz işlem yok";

const formatIBAN = (iban?: string | null) => {
  if (!iban) return null;
  return iban.replace(/(.{4})/g, "$1 ").trim();
};

const TIP_ICON: Record<string, string> = { kasa: "💵", banka: "🏦", pos: "💳", sanal_pos: "🌐" };

export default function MaliHesapDetailPanel({ kurumId, maliHesapId, refreshKey, onToast, onEdit, onDeleted, onChanged }: Props) {
  const [data, setData] = useState<MaliHesapDetay | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("hareketler");
  const [toggling, setToggling] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    financialAccountService
      .detay(maliHesapId)
      .then(setData)
      .catch((err: any) => setError(err.message || "Mali hesap detayı yüklenemedi"))
      .finally(() => setLoading(false));
  }, [maliHesapId]);

  useEffect(() => { load(); }, [load, refreshKey]);
  useEffect(() => { setTab("hareketler"); }, [maliHesapId]);

  const handleToggle = async () => {
    if (!data) return;
    setToggling(true);
    try {
      const res = await financialAccountService.toggle(data.id);
      onToast(`"${data.ad}" ${data.aktif_mi ? "pasif" : "aktif"} yapıldı`);
      setData((prev) => (prev ? { ...prev, aktif_mi: res.mali_hesap.aktif_mi } : prev));
      onChanged();
    } catch (err: any) {
      onToast(err.message || "Durum değiştirilemedi", "error");
    } finally {
      setToggling(false);
    }
  };

  const handleDelete = async () => {
    if (!data) return;
    if (data.odeme_yontemi_sayisi > 0) {
      onToast(`Bu hesaba tanımlı ${data.odeme_yontemi_sayisi} ödeme yöntemi var. Önce onları silin veya pasif yapın.`, "info");
      return;
    }
    if (!confirm(`"${data.ad}" mali hesabı silinecek. Onaylıyor musunuz?`)) return;
    try {
      await financialAccountService.delete(data.id);
      onToast(`"${data.ad}" başarıyla silindi`);
      onDeleted();
    } catch (err: any) {
      onToast(err.message || "Silme işlemi başarısız — bu hesap kayıtlarda kullanılıyor olabilir", "error");
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm h-full flex items-center justify-center">
        <div className="w-8 h-8 border-[3px] border-emerald-200 border-t-emerald-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm h-full flex flex-col items-center justify-center text-center p-8">
        <div className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center mb-4">
          <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="#ef4444" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        </div>
        <h4 className="text-base font-bold text-gray-700 mb-1">{error || "Veri bulunamadı"}</h4>
      </div>
    );
  }

  const iban = formatIBAN(data.iban);

  const tabs: { key: TabKey; label: string; icon: string }[] = [
    { key: "hareketler", label: "Hareketler", icon: "📊" },
    { key: "odeme_yontemleri", label: "Ödeme Yöntemleri", icon: "💳" },
    { key: "yetkililer", label: "Yetkililer", icon: "👤" },
    { key: "aciklamalar", label: "Açıklamalar", icon: "📝" },
  ];

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-6 py-5 border-b border-gray-50 bg-gradient-to-br from-emerald-50/40 to-white">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-12 h-12 rounded-2xl bg-white border border-gray-100 shadow-sm flex items-center justify-center text-2xl shrink-0">
              {TIP_ICON[data.tip] || "💼"}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-bold text-gray-900 m-0 truncate">{data.ad}</h2>
                <span className={`inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold ${data.aktif_mi ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                  {data.aktif_mi ? "Aktif" : "Pasif"}
                </span>
              </div>
              <div className="text-xs text-gray-400 mt-0.5">
                {hesapTipLabel(data.tip)} · {data.sube_ad}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => onEdit(data.id)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white text-gray-700 text-xs font-semibold rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors cursor-pointer"
            >
              <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Düzenle
            </button>
            <button
              onClick={handleToggle}
              disabled={toggling}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white text-gray-700 text-xs font-semibold rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors cursor-pointer disabled:opacity-50"
            >
              {data.aktif_mi ? "Pasif Yap" : "Aktif Yap"}
            </button>
            <button
              onClick={handleDelete}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white text-red-600 text-xs font-semibold rounded-xl border border-red-100 hover:bg-red-50 transition-colors cursor-pointer"
            >
              Sil
            </button>
          </div>
        </div>

        {/* Balance + key info grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5">
          <div className="bg-white rounded-xl border border-gray-100 px-4 py-3">
            <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Bakiye</div>
            <div className={`text-base font-bold ${data.bakiye < 0 ? "text-red-500" : "text-gray-900"}`}>{fmtTL(data.bakiye)}</div>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 px-4 py-3">
            <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Para Birimi</div>
            <div className="text-base font-bold text-gray-900">{data.para_birimi}</div>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 px-4 py-3 col-span-2 md:col-span-1">
            <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Ödeme Yöntemi</div>
            <div className="text-base font-bold text-gray-900">{data.odeme_yontemi_sayisi}</div>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 px-4 py-3 col-span-2 md:col-span-1">
            <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Son İşlem</div>
            <div className="text-xs font-semibold text-gray-700 truncate">{fmtTarih(data.son_islem_tarihi)}</div>
          </div>
          {iban && (
            <div className="bg-white rounded-xl border border-gray-100 px-4 py-3 col-span-2">
              <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">IBAN</div>
              <div className="text-xs font-mono font-semibold text-gray-700">{iban}</div>
            </div>
          )}
          {(data.banka_display || data.banka_adi) && (
            <div className="bg-white rounded-xl border border-gray-100 px-4 py-3">
              <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Banka</div>
              <div className="text-xs font-semibold text-gray-700 truncate">{data.banka_display || data.banka_adi}</div>
            </div>
          )}
          {data.hesap_no && (
            <div className="bg-white rounded-xl border border-gray-100 px-4 py-3">
              <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Hesap No</div>
              <div className="text-xs font-mono font-semibold text-gray-700">{data.hesap_no}</div>
            </div>
          )}
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 px-4 pt-3 border-b border-gray-50 overflow-x-auto shrink-0">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold rounded-t-lg transition-colors cursor-pointer border-none whitespace-nowrap ${
              tab === t.key ? "bg-emerald-50 text-emerald-700 border-b-2 border-emerald-600" : "bg-transparent text-gray-400 hover:text-gray-600"
            }`}
            style={tab === t.key ? { borderBottom: "2px solid #059669" } : undefined}
          >
            <span>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {tab === "hareketler" && <HareketlerTab kurumId={kurumId} maliHesapId={data.id} />}
        {tab === "odeme_yontemleri" && (
          <OdemeYontemleriTab
            kurumId={kurumId}
            maliHesapId={data.id}
            onToast={onToast}
            onChanged={() => setData((prev) => (prev ? { ...prev } : prev))}
          />
        )}
        {tab === "yetkililer" && (
          <YetkililerTab kurumId={kurumId} maliHesapId={data.id} onToast={onToast} />
        )}
        {tab === "aciklamalar" && (
          <AciklamalarTab
            maliHesapId={data.id}
            aciklama={data.aciklama}
            onToast={onToast}
            onSaved={(aciklama) => setData((prev) => (prev ? { ...prev, aciklama } : prev))}
          />
        )}
      </div>
    </div>
  );
}
