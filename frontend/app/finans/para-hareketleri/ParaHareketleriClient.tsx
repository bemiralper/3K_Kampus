"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useKurum } from "@/lib/contexts/KurumContext";
import { useFinansPath } from "@/components/finans/FinansPathProvider";
import { paraHareketiService } from "../services/para-hareketi-api";
import { financialAccountService } from "../services/finans-api";
import { KAYNAK_LABELS, type ParaHareketi } from "../types/para-hareketi-types";
import FinansFilterBar, { fmtDate, fmtTL } from "@/components/finans/FinansFilterBar";
import FinansToast, { type FinansToastType } from "@/components/finans/FinansToast";

import TahsilatAlModal from "./modals/TahsilatAlModal";
import OdemeYapModal from "./modals/OdemeYapModal";
import IadeModal from "./modals/IadeModal";
import VirmanModal, { type VirmanMode } from "./modals/VirmanModal";

type ModalState =
  | { type: "tahsilat" }
  | { type: "odeme" }
  | { type: "iade" }
  | { type: "virman"; mode: VirmanMode }
  | null;

const QUICK_ACTIONS: { key: string; label: string; icon: string; color: string; bg: string; open: ModalState }[] = [
  { key: "tahsilat", label: "Tahsilat Al", icon: "➕", color: "#059669", bg: "#e8f6ef", open: { type: "tahsilat" } },
  { key: "odeme", label: "Ödeme Yap", icon: "➖", color: "#dc2626", bg: "#fdeceb", open: { type: "odeme" } },
  { key: "iade", label: "İade", icon: "🔄", color: "#d97706", bg: "#fef3e2", open: { type: "iade" } },
  { key: "virman", label: "Virman", icon: "↔️", color: "#7c3aed", bg: "#f2ecfc", open: { type: "virman", mode: "virman" } },
  { key: "bankaya", label: "Bankaya Yatır", icon: "📥", color: "#2563eb", bg: "#eaf3fb", open: { type: "virman", mode: "kasadan_bankaya" } },
  { key: "kasaya", label: "Bankadan Çek", icon: "📤", color: "#0891b2", bg: "#e5f6fa", open: { type: "virman", mode: "bankadan_kasaya" } },
];

const KAYNAK_FILTER_OPTIONS = [
  { value: "", label: "Tüm İşlemler" },
  { value: "tahsilat", label: "Tahsilat" },
  { value: "gider", label: "Gider Ödemesi" },
  { value: "iade", label: "İade" },
  { value: "transfer", label: "Transfer" },
  { value: "avans", label: "Cari Ödeme" },
  { value: "gelir", label: "Gelir Tahsilatı" },
];

function todayIso() { return new Date().toISOString().slice(0, 10); }
function daysAgoIso(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export default function ParaHareketleriClient({ embedded = false }: { embedded?: boolean }) {
  const { activeKurum, activeSube, activeEgitimYili } = useKurum();
  const { homeHref, portalHomeHref } = useFinansPath();

  const [items, setItems] = useState<ParaHareketi[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [count, setCount] = useState(0);
  const [sayfaGiris, setSayfaGiris] = useState(0);
  const [sayfaCikis, setSayfaCikis] = useState(0);

  const [baslangic, setBaslangic] = useState(daysAgoIso(30));
  const [bitis, setBitis] = useState(todayIso());
  const [kaynak, setKaynak] = useState("");
  const [yon, setYon] = useState("");
  const [maliHesapId, setMaliHesapId] = useState("");
  const [arama, setArama] = useState("");
  const [maliHesaplar, setMaliHesaplar] = useState<{ id: number; ad: string; tip: string }[]>([]);

  const [modal, setModal] = useState<ModalState>(null);
  const [toast, setToast] = useState<{ message: string; type: FinansToastType } | null>(null);

  useEffect(() => {
    if (!activeKurum?.id) return;
    financialAccountService
      .dropdownByKurum(activeKurum.id, activeSube?.id)
      .then((res) => setMaliHesaplar(res.mali_hesaplar || []))
      .catch(() => setMaliHesaplar([]));
  }, [activeKurum?.id, activeSube?.id]);

  const filterParams = useMemo(() => {
    if (!activeKurum) return null;
    return {
      kurum_id: activeKurum.id,
      sube_id: activeSube?.id,
      egitim_yili_id: activeEgitimYili?.id,
      baslangic: baslangic || undefined,
      bitis: bitis || undefined,
      kaynak: kaynak || undefined,
      yon: yon || undefined,
      mali_hesap_id: maliHesapId ? Number(maliHesapId) : undefined,
      arama: arama || undefined,
      page,
      page_size: 25,
    };
  }, [activeKurum, activeSube, activeEgitimYili, baslangic, bitis, kaynak, yon, maliHesapId, arama, page]);

  const load = useCallback(async () => {
    if (!filterParams) return;
    setLoading(true);
    setError(null);
    try {
      const data = await paraHareketiService.list(filterParams);
      setItems(data.results || []);
      setCount(data.count);
      setTotalPages(data.total_pages || 1);
      setSayfaGiris(data.sayfa_toplam_giris || 0);
      setSayfaCikis(data.sayfa_toplam_cikis || 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Hareketler yüklenemedi");
    } finally {
      setLoading(false);
    }
  }, [filterParams]);

  useEffect(() => { load(); }, [load]);

  const handleSuccess = (message: string) => {
    setToast({ message, type: "success" });
    setModal(null);
    setPage(1);
    load();
  };

  if (!activeKurum) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4 text-3xl">🏢</div>
        <h3 className="text-lg font-bold text-gray-800 mb-1">Kurum Seçiniz</h3>
        <p className="text-sm text-gray-500">Para hareketlerini görüntülemek için üst menüden bir kurum seçin.</p>
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
                <path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
              </svg>
            </div>
            <div className="hero-text">
              <h1>Para Hareketleri</h1>
              <div className="hero-breadcrumb">
                <a href={portalHomeHref}>Ana Sayfa</a>
                <span>/</span>
                <a href={homeHref}>Finans</a>
                <span>/</span>
                <span>Para Hareketleri</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Hızlı İşlemler */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mb-5">
        {QUICK_ACTIONS.map((a) => (
          <button
            key={a.key}
            type="button"
            onClick={() => setModal(a.open)}
            className="flex flex-col items-center justify-center gap-2 p-4 bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all"
          >
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-lg"
              style={{ background: a.bg, color: a.color }}
            >
              {a.icon}
            </div>
            <span className="text-xs font-bold text-gray-700 text-center leading-tight">{a.label}</span>
          </button>
        ))}
      </div>

      {/* Sayfa Özeti */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
        <div className="p-4 bg-white rounded-2xl border border-gray-100 shadow-sm border-l-4" style={{ borderLeftColor: "#059669" }}>
          <div className="text-xs font-medium text-gray-500 mb-1">Bu Sayfa · Giriş</div>
          <div className="text-lg font-extrabold" style={{ color: "#059669" }}>{fmtTL(sayfaGiris)}</div>
        </div>
        <div className="p-4 bg-white rounded-2xl border border-gray-100 shadow-sm border-l-4" style={{ borderLeftColor: "#dc2626" }}>
          <div className="text-xs font-medium text-gray-500 mb-1">Bu Sayfa · Çıkış</div>
          <div className="text-lg font-extrabold" style={{ color: "#dc2626" }}>{fmtTL(sayfaCikis)}</div>
        </div>
        <div className="p-4 bg-white rounded-2xl border border-gray-100 shadow-sm border-l-4" style={{ borderLeftColor: "#2563eb" }}>
          <div className="text-xs font-medium text-gray-500 mb-1">Net</div>
          <div className="text-lg font-extrabold" style={{ color: "#2563eb" }}>{fmtTL(sayfaGiris - sayfaCikis)}</div>
        </div>
      </div>

      {/* Filtreler */}
      <FinansFilterBar>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-xs font-semibold text-gray-500 block mb-1">Başlangıç</label>
            <input type="date" value={baslangic} onChange={(e) => { setBaslangic(e.target.value); setPage(1); }} className="px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none" />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 block mb-1">Bitiş</label>
            <input type="date" value={bitis} onChange={(e) => { setBitis(e.target.value); setPage(1); }} className="px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none" />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 block mb-1">İşlem Türü</label>
            <select value={kaynak} onChange={(e) => { setKaynak(e.target.value); setPage(1); }} className="px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none">
              {KAYNAK_FILTER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 block mb-1">Yön</label>
            <select value={yon} onChange={(e) => { setYon(e.target.value); setPage(1); }} className="px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none">
              <option value="">Tümü</option>
              <option value="giris">Giriş</option>
              <option value="cikis">Çıkış</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 block mb-1">Kasa / Banka</label>
            <select value={maliHesapId} onChange={(e) => { setMaliHesapId(e.target.value); setPage(1); }} className="px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none">
              <option value="">Tümü</option>
              {maliHesaplar.map((m) => <option key={m.id} value={m.id}>{m.ad}</option>)}
            </select>
          </div>
          <div className="flex-1 min-w-[180px]">
            <label className="text-xs font-semibold text-gray-500 block mb-1">Ara (açıklama)</label>
            <input
              type="text"
              value={arama}
              onChange={(e) => { setArama(e.target.value); setPage(1); }}
              placeholder="Ara..."
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none"
            />
          </div>
          <button
            type="button"
            onClick={() => { setBaslangic(daysAgoIso(30)); setBitis(todayIso()); setKaynak(""); setYon(""); setMaliHesapId(""); setArama(""); setPage(1); }}
            className="px-4 py-2 text-xs font-semibold text-gray-500 bg-gray-100 rounded-xl hover:bg-gray-200 transition"
          >
            Temizle
          </button>
        </div>
      </FinansFilterBar>

      {/* Hareket Listesi */}
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
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl border border-gray-100">
          <div className="text-4xl mb-3">💤</div>
          <p className="text-base font-semibold text-gray-700">Bu filtrelerde hareket yok</p>
          <p className="text-sm text-gray-400 mt-1">Filtreleri değiştirerek tekrar deneyin.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50/80">
                  <th className="text-left py-3 px-3 text-[11px] font-semibold text-gray-400 uppercase">Tarih</th>
                  <th className="text-left py-3 px-3 text-[11px] font-semibold text-gray-400 uppercase">İşlem</th>
                  <th className="text-left py-3 px-3 text-[11px] font-semibold text-gray-400 uppercase">Cari</th>
                  <th className="text-left py-3 px-3 text-[11px] font-semibold text-gray-400 uppercase">Açıklama</th>
                  <th className="text-left py-3 px-3 text-[11px] font-semibold text-gray-400 uppercase">Ödeme Şekli</th>
                  <th className="text-left py-3 px-3 text-[11px] font-semibold text-gray-400 uppercase">Kasa / Banka</th>
                  <th className="text-right py-3 px-3 text-[11px] font-semibold text-gray-400 uppercase">Tutar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {items.map((r) => {
                  const isGiris = r.yon === "giris";
                  return (
                    <tr key={r.id} className="hover:bg-gray-50/40 transition-colors">
                      <td className="py-3 px-3 text-gray-500 whitespace-nowrap">{fmtDate(r.islem_tarihi)}</td>
                      <td className="py-3 px-3">
                        <span
                          className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold"
                          style={{
                            background: isGiris ? "#ecfdf5" : "#fef2f2",
                            color: isGiris ? "#059669" : "#dc2626",
                          }}
                        >
                          {KAYNAK_LABELS[r.kaynak] || r.kaynak_label}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-medium text-gray-800">{r.cari_adi || "—"}</td>
                      <td className="py-3 px-3 text-gray-500 max-w-[220px] truncate" title={r.aciklama}>{r.aciklama || "—"}</td>
                      <td className="py-3 px-3 text-gray-500">{r.odeme_yontemi_adi || "—"}</td>
                      <td className="py-3 px-3 text-gray-500">{r.mali_hesap_ad || "—"}</td>
                      <td className="py-3 px-3 text-right font-bold" style={{ color: isGiris ? "#059669" : "#dc2626" }}>
                        {isGiris ? "+" : "-"}{fmtTL(r.tutar)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-50 text-xs text-gray-500">
            <span>{count} kayıt · Sayfa {page}/{totalPages}</span>
            <div className="flex gap-2">
              <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="px-3 py-1.5 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50">Önceki</button>
              <button type="button" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="px-3 py-1.5 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50">Sonraki</button>
            </div>
          </div>
        </div>
      )}

      {modal?.type === "tahsilat" && <TahsilatAlModal onClose={() => setModal(null)} onSuccess={handleSuccess} />}
      {modal?.type === "odeme" && <OdemeYapModal onClose={() => setModal(null)} onSuccess={handleSuccess} />}
      {modal?.type === "iade" && <IadeModal onClose={() => setModal(null)} onSuccess={handleSuccess} />}
      {modal?.type === "virman" && <VirmanModal mode={modal.mode} onClose={() => setModal(null)} onSuccess={handleSuccess} />}

      {toast && <FinansToast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
