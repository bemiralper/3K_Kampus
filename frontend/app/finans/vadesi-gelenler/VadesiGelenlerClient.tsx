"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useKurum } from "@/lib/contexts/KurumContext";
import { useFinansPath } from "@/components/finans/FinansPathProvider";
import { useOdemePath } from "@/components/odeme-takip/OdemePathProvider";
import Link from "next/link";
import { odemeTakipBridge } from "../services/odeme-takip-bridge";
import type { VadesiGelenlerDonem, VadesiGelenTaksit } from "../types/para-hareketi-types";
import { fmtDate, fmtTL } from "@/components/finans/FinansFilterBar";
import FinansToast, { type FinansToastType } from "@/components/finans/FinansToast";
import TahsilatAlModal from "../para-hareketleri/modals/TahsilatAlModal";

const DONEM_TABS: { key: VadesiGelenlerDonem; label: string }[] = [
  { key: "bugun", label: "Bugün" },
  { key: "yarin", label: "Yarın" },
  { key: "hafta", label: "Bu Hafta" },
  { key: "ay", label: "Bu Ay" },
];

export default function VadesiGelenlerClient({ embedded = false }: { embedded?: boolean }) {
  const { activeKurum, activeSube, activeEgitimYili } = useKurum();
  const { homeHref, portalHomeHref } = useFinansPath();
  const { href: odemeHref } = useOdemePath();

  const [donem, setDonem] = useState<VadesiGelenlerDonem>("hafta");
  const [arama, setArama] = useState("");
  const [rows, setRows] = useState<VadesiGelenTaksit[]>([]);
  const [toplamTutar, setToplamTutar] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tahsilatHedef, setTahsilatHedef] = useState<{ sozlesmeId: number; taksitId: number } | null>(null);
  const [toast, setToast] = useState<{ message: string; type: FinansToastType } | null>(null);

  const load = useCallback(async () => {
    if (!activeKurum?.id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await odemeTakipBridge.vadesiGelecekler({
        kurum_id: activeKurum.id,
        sube_id: activeSube?.id,
        egitim_yili_id: activeEgitimYili?.id,
        donem,
        arama: arama || undefined,
      });
      setRows(data.sonuclar || []);
      setToplamTutar(data.toplam_tutar || 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Liste yüklenemedi");
    } finally {
      setLoading(false);
    }
  }, [activeKurum?.id, activeSube?.id, activeEgitimYili?.id, donem, arama]);

  useEffect(() => { load(); }, [load]);

  if (!activeKurum) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4 text-3xl">🏢</div>
        <h3 className="text-lg font-bold text-gray-800 mb-1">Kurum Seçiniz</h3>
        <p className="text-sm text-gray-500">Vadesi gelen taksitleri görmek için üst menüden bir kurum seçin.</p>
      </div>
    );
  }

  return (
    <div>
      {!embedded && (
        <div className="hero-header">
          <div className="hero-content">
            <div className="hero-icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <div className="hero-text">
              <h1>Vadesi Gelenler</h1>
              <div className="hero-breadcrumb">
                <a href={portalHomeHref}>Ana Sayfa</a>
                <span>/</span>
                <a href={homeHref}>Finans</a>
                <span>/</span>
                <span>Vadesi Gelenler</span>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="tabs-modern">
          {DONEM_TABS.map((t) => (
            <a
              key={t.key}
              href="#"
              className={`tab-modern ${donem === t.key ? "active" : ""}`}
              onClick={(e) => { e.preventDefault(); setDonem(t.key); }}
            >
              {t.label}
            </a>
          ))}
        </div>
        <input
          type="text"
          value={arama}
          onChange={(e) => setArama(e.target.value)}
          placeholder="Öğrenci / sözleşme ara…"
          className="px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none min-w-[220px]"
        />
      </div>

      <div className="p-4 bg-white rounded-2xl border border-gray-100 shadow-sm border-l-4 mb-4" style={{ borderLeftColor: "#d97706" }}>
        <div className="text-xs font-medium text-gray-500 mb-1">Toplam Vadesi Gelecek Tutar</div>
        <div className="text-xl font-extrabold" style={{ color: "#d97706" }}>{fmtTL(toplamTutar)}</div>
        <div className="text-[11px] text-gray-400 mt-0.5">{rows.length} taksit</div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-24">
          <div className="w-10 h-10 border-[3px] border-gray-200 border-t-blue-600 rounded-full animate-spin mb-4" />
          <p className="text-sm text-gray-400">Yükleniyor…</p>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-20">
          <p className="text-sm font-semibold text-red-600 mb-3">{error}</p>
          <button onClick={load} className="px-4 py-2 bg-red-50 text-red-600 rounded-lg text-xs font-semibold">Tekrar Dene</button>
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl border border-gray-100">
          <div className="text-4xl mb-3">✅</div>
          <p className="text-base font-semibold text-gray-700">Bu dönemde vadesi gelen taksit yok</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50/80">
                  <th className="text-left py-3 px-3 text-[11px] font-semibold text-gray-400 uppercase">Öğrenci</th>
                  <th className="text-left py-3 px-3 text-[11px] font-semibold text-gray-400 uppercase">Veli</th>
                  <th className="text-left py-3 px-3 text-[11px] font-semibold text-gray-400 uppercase">Sözleşme</th>
                  <th className="text-center py-3 px-3 text-[11px] font-semibold text-gray-400 uppercase">Taksit</th>
                  <th className="text-left py-3 px-3 text-[11px] font-semibold text-gray-400 uppercase">Vade</th>
                  <th className="text-center py-3 px-3 text-[11px] font-semibold text-gray-400 uppercase">Kalan Gün</th>
                  <th className="text-right py-3 px-3 text-[11px] font-semibold text-gray-400 uppercase">Kalan Tutar</th>
                  <th className="text-center py-3 px-3 text-[11px] font-semibold text-gray-400 uppercase">İşlem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.map((t) => (
                  <tr key={t.id} className="hover:bg-amber-50/20 transition-colors">
                    <td className="py-3 px-3 font-medium text-gray-800">{t.ogrenci_adi}</td>
                    <td className="py-3 px-3 text-gray-600">{t.veli_adi || "—"}</td>
                    <td className="py-3 px-3"><code className="text-xs bg-gray-50 px-1.5 py-0.5 rounded">{t.sozlesme_no}</code></td>
                    <td className="py-3 px-3 text-center text-gray-500">#{t.taksit_no}</td>
                    <td className="py-3 px-3 text-gray-500">{fmtDate(t.vade_tarihi)}</td>
                    <td className="py-3 px-3 text-center">
                      <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700">
                        {t.kalan_gun === 0 ? "Bugün" : `${t.kalan_gun} gün`}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right font-bold text-amber-700">{fmtTL(t.kalan_tutar)}</td>
                    <td className="py-3 px-3">
                      <div className="flex items-center justify-center gap-1">
                        <Link href={`${odemeHref()}?sozlesme=${t.sozlesme_id}`} title="Sözleşmeye git" className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-600 transition">📄</Link>
                        <button
                          type="button"
                          title="Tahsilat Al"
                          onClick={() => setTahsilatHedef({ sozlesmeId: t.sozlesme_id, taksitId: t.id })}
                          className="p-1.5 rounded-lg hover:bg-emerald-50 text-emerald-600 transition"
                        >
                          ➕
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tahsilatHedef && (
        <TahsilatAlModal
          prefillSozlesmeId={tahsilatHedef.sozlesmeId}
          prefillTaksitId={tahsilatHedef.taksitId}
          onClose={() => setTahsilatHedef(null)}
          onSuccess={(message) => {
            setToast({ message, type: "success" });
            setTahsilatHedef(null);
            load();
          }}
        />
      )}

      {toast && <FinansToast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
