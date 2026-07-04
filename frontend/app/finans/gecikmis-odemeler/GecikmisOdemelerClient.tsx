"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useKurum } from "@/lib/contexts/KurumContext";
import { useFinansPath } from "@/components/finans/FinansPathProvider";
import { useOdemePath } from "@/components/odeme-takip/OdemePathProvider";
import ExportDropdown from "@/components/finans/ExportDropdown";
import TopluGecikmeMesajModal from "@/components/finans/TopluGecikmeMesajModal";
import FinansToast, { type FinansToastType } from "@/components/finans/FinansToast";
import FinansFilterBar, { fmtDate, fmtTL } from "@/components/finans/FinansFilterBar";
import TahsilatAlModal from "../para-hareketleri/modals/TahsilatAlModal";
import { overdueService } from "../services/overdue-api";
import {
  GECIKEN_COLUMN_EXPORT_KEYS,
  type GecikenColumnKey,
  type GecikmeAraligi,
  type OverdueDurumFilter,
  type OverduePaymentDetail,
  type OverduePaymentItem,
  type OverduePaymentsSummary,
} from "../types/overdue-types";
import GecikenDetayDrawer from "./GecikenDetayDrawer";
import "./geciken-taksitler.css";

const COLUMN_STORAGE_KEY = "geciken_taksitler_columns_v1";

const ALL_COLUMNS: { key: GecikenColumnKey; label: string; sortKey?: string }[] = [
  { key: "ogrenci", label: "Öğrenci", sortKey: "ogrenci_adi" },
  { key: "veli", label: "Veli" },
  { key: "telefon", label: "Telefon" },
  { key: "sube", label: "Şube" },
  { key: "sinif", label: "Sınıf" },
  { key: "rehber", label: "Rehber Öğretmen" },
  { key: "vade", label: "Son Ödeme Tarihi", sortKey: "vade_tarihi" },
  { key: "gecikme", label: "Gecikme Günü", sortKey: "gecikme_gun" },
  { key: "taksit_tutari", label: "Taksit Tutarı", sortKey: "kalan_tutar" },
  { key: "kalan", label: "Kalan Borç", sortKey: "kalan_tutar" },
  { key: "son_tahsilat", label: "Son Tahsilat" },
  { key: "durum", label: "Durum" },
];

const DEFAULT_VISIBLE: GecikenColumnKey[] = [
  "ogrenci", "veli", "telefon", "sube", "sinif", "rehber",
  "vade", "gecikme", "kalan", "son_tahsilat", "durum",
];

const VALID_COLUMN_KEYS = new Set<GecikenColumnKey>(ALL_COLUMNS.map((c) => c.key));

function loadVisibleColumns(): Set<GecikenColumnKey> {
  if (typeof window === "undefined") return new Set(DEFAULT_VISIBLE);
  try {
    const raw = localStorage.getItem(COLUMN_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as string[];
      const filtered = parsed.filter((k): k is GecikenColumnKey => VALID_COLUMN_KEYS.has(k as GecikenColumnKey));
      if (filtered.length > 0) return new Set(filtered);
    }
  } catch { /* ignore */ }
  return new Set(DEFAULT_VISIBLE);
}

function saveVisibleColumns(cols: Set<GecikenColumnKey>) {
  if (typeof window === "undefined") return;
  localStorage.setItem(COLUMN_STORAGE_KEY, JSON.stringify(Array.from(cols)));
}

function usePersistedColumnVisibility() {
  const [visibleCols, setVisibleCols] = useState<Set<GecikenColumnKey>>(() => new Set(DEFAULT_VISIBLE));

  useEffect(() => {
    setVisibleCols(loadVisibleColumns());
  }, []);

  const toggleCol = useCallback((key: GecikenColumnKey) => {
    setVisibleCols((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        if (next.size <= 1) return prev;
        next.delete(key);
      } else {
        next.add(key);
      }
      saveVisibleColumns(next);
      return next;
    });
  }, []);

  const exportColumnKeys = useMemo(() => exportKeysFromVisible(visibleCols), [visibleCols]);

  return { visibleCols, toggleCol, exportColumnKeys };
}

function exportKeysFromVisible(visible: Set<GecikenColumnKey>): string[] {
  const keys: string[] = [];
  for (const col of ALL_COLUMNS) {
    if (visible.has(col.key)) {
      keys.push(...GECIKEN_COLUMN_EXPORT_KEYS[col.key]);
    }
  }
  return keys;
}

function durumBadgeClass(renk: string) {
  if (renk === "red") return "gt-badge gt-badge--red";
  if (renk === "orange") return "gt-badge gt-badge--orange";
  if (renk === "blue") return "gt-badge gt-badge--blue";
  return "gt-badge gt-badge--yellow";
}

export default function GecikmisOdemelerClient({ embedded = false }: { embedded?: boolean }) {
  const { activeKurum, activeSube, activeEgitimYili } = useKurum();
  const { homeHref, portalHomeHref } = useFinansPath();
  const { href: odemeHref } = useOdemePath();

  const [items, setItems] = useState<OverduePaymentItem[]>([]);
  const [ozet, setOzet] = useState<OverduePaymentsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [count, setCount] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [ordering, setOrdering] = useState("-gecikme_gun");

  const [filtersOpen, setFiltersOpen] = useState(true);
  const [baslangic, setBaslangic] = useState("");
  const [bitis, setBitis] = useState("");
  const [durum, setDurum] = useState<OverdueDurumFilter>("gecikmis");
  const [gecikmeAraligi, setGecikmeAraligi] = useState<GecikmeAraligi | "">("");
  const [minTutar, setMinTutar] = useState("");
  const [maxTutar, setMaxTutar] = useState("");
  const [arama, setArama] = useState("");
  const [applied, setApplied] = useState({
    baslangic: "", bitis: "", durum: "gecikmis" as OverdueDurumFilter,
    gecikmeAraligi: "" as GecikmeAraligi | "", minTutar: "", maxTutar: "", arama: "",
  });

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [colMenuOpen, setColMenuOpen] = useState(false);

  const [detailItem, setDetailItem] = useState<OverduePaymentItem | null>(null);
  const [detailData, setDetailData] = useState<OverduePaymentDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [showBulkModal, setShowBulkModal] = useState(false);
  const [tahsilatHedef, setTahsilatHedef] = useState<{ sozlesmeId: number; taksitId: number } | null>(null);
  const [toast, setToast] = useState<{ message: string; type: FinansToastType } | null>(null);

  const { visibleCols, toggleCol, exportColumnKeys } = usePersistedColumnVisibility();

  const filterParams = useMemo(() => {
    if (!activeKurum) return null;
    return {
      kurum_id: activeKurum.id,
      sube_id: activeSube?.id,
      egitim_yili_id: activeEgitimYili?.id,
      durum: applied.durum,
      baslangic: applied.baslangic || undefined,
      bitis: applied.bitis || undefined,
      gecikme_araligi: applied.gecikmeAraligi || undefined,
      min_tutar: applied.minTutar ? Number(applied.minTutar) : undefined,
      max_tutar: applied.maxTutar ? Number(applied.maxTutar) : undefined,
      arama: applied.arama || undefined,
      page,
      page_size: pageSize,
      ordering,
    };
  }, [activeKurum, activeSube, activeEgitimYili, applied, page, pageSize, ordering]);

  const load = useCallback(async () => {
    if (!filterParams) return;
    setLoading(true);
    setError(null);
    try {
      const data = await overdueService.list(filterParams);
      setItems(data.results || []);
      setOzet(data.ozet);
      setCount(data.count);
      setTotalPages(data.total_pages || 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Liste yüklenemedi");
    } finally {
      setLoading(false);
    }
  }, [filterParams]);

  useEffect(() => { load(); }, [load]);

  const applyFilters = () => {
    const min = minTutar ? Number(minTutar) : null;
    const max = maxTutar ? Number(maxTutar) : null;
    if (min != null && max != null && !Number.isNaN(min) && !Number.isNaN(max) && min > max) {
      setError("Minimum tutar, maksimum tutardan büyük olamaz.");
      return;
    }
    setApplied({
      baslangic, bitis, durum, gecikmeAraligi, minTutar, maxTutar, arama,
    });
    setPage(1);
  };

  const clearFilters = () => {
    setBaslangic(""); setBitis(""); setDurum("gecikmis");
    setGecikmeAraligi(""); setMinTutar(""); setMaxTutar(""); setArama("");
    setApplied({ baslangic: "", bitis: "", durum: "gecikmis", gecikmeAraligi: "", minTutar: "", maxTutar: "", arama: "" });
    setPage(1);
  };

  const toggleSort = (sortKey?: string) => {
    if (!sortKey) return;
    setOrdering((prev) => (prev === sortKey ? `-${sortKey}` : prev === `-${sortKey}` ? sortKey : `-${sortKey}`));
    setPage(1);
  };

  const openDetail = async (item: OverduePaymentItem) => {
    setDetailItem(item);
    setDetailData(null);
    if (!activeKurum) return;
    setDetailLoading(true);
    try {
      const d = await overdueService.detail(item.taksit_id, activeKurum.id);
      setDetailData(d);
    } catch {
      setDetailData(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const selectedItems = items.filter((i) => selected.has(i.taksit_id));

  const toggleRow = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === items.length) setSelected(new Set());
    else setSelected(new Set(items.map((i) => i.taksit_id)));
  };

  const handleCall = (phone: string | null) => {
    if (!phone) { setToast({ message: "Telefon numarası yok", type: "error" }); return; }
    window.open(`tel:${phone.replace(/\s/g, "")}`, "_self");
  };

  const handleNotEkle = () => {
    const note = window.prompt("Not girin:");
    if (note?.trim()) setToast({ message: "Not kaydedildi (yerel)", type: "success" });
  };

  if (!activeKurum) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <h3 className="text-lg font-bold text-gray-800 mb-1">Kurum Seçiniz</h3>
        <p className="text-sm text-gray-500">Geciken taksitleri görüntülemek için üst menüden bir kurum seçin.</p>
      </div>
    );
  }

  const visibleColumnDefs = ALL_COLUMNS.filter((c) => visibleCols.has(c.key));

  return (
    <div className="geciken-taksitler">
      {!embedded && (
        <div className="hero-header">
          <div className="hero-content">
            <div className="hero-icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <div className="hero-text">
              <h1>Geciken Taksitler</h1>
              <div className="hero-breadcrumb">
                <a href={portalHomeHref}>Ana Sayfa</a><span>/</span>
                <a href={homeHref}>Finans</a><span>/</span>
                <span>Gecikmiş Ödemeler</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* KPI Cards — compact */}
      {ozet && (
        <div className="quick-stats quick-stats--compact gt-kpi-grid mb-4">
          <KpiMini label="Toplam Geciken Tutar" value={fmtTL(ozet.toplam_geciken_tutar)} tone="red" />
          <KpiMini label="Geciken Öğrenci" value={String(ozet.geciken_ogrenci_sayisi)} tone="orange" />
          <KpiMini label="Bugün Vadesi Gelen" value={fmtTL(ozet.bugun_vadesi_gelen)} tone="blue" />
          <KpiMini label="30+ Gün Geciken" value={fmtTL(ozet.otuz_artı_geciken)} tone="red" />
          <KpiMini label="Ort. Gecikme" value={`${Math.round(ozet.ortalama_gecikme_gun)} gün`} tone="purple" />
          <KpiMini label="Tahsilat Başarısı" value={`%${ozet.tahsilat_basarisi_orani}`} tone="green" />
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <button type="button" className="gt-toolbar-btn" onClick={() => setFiltersOpen((v) => !v)}>
          {filtersOpen ? "Filtreleri Gizle" : "Filtreleri Göster"}
        </button>
        <div className="relative">
          <button type="button" className="gt-toolbar-btn" onClick={() => setColMenuOpen((v) => !v)}>Kolonlar</button>
          {colMenuOpen && (
            <div className="gt-col-menu">
              {ALL_COLUMNS.map((c) => (
                <label key={c.key} className="gt-col-menu-item">
                  <input type="checkbox" checked={visibleCols.has(c.key)} onChange={() => toggleCol(c.key)} />
                  {c.label}
                </label>
              ))}
            </div>
          )}
        </div>
        <div className="flex-1" />
        {filterParams && (
          <ExportDropdown
            buildPath={(f, orientation) =>
              overdueService.exportUrl(filterParams, f, exportColumnKeys, orientation)
            }
            filenamePrefix="geciken-taksitler"
            disabled={loading}
          />
        )}
        {selected.size > 0 && (
          <>
            <button type="button" className="gt-toolbar-btn gt-toolbar-btn--wa" onClick={() => setShowBulkModal(true)}>
              Toplu WhatsApp ({selected.size})
            </button>
            <button type="button" className="gt-toolbar-btn" onClick={() => setToast({ message: "SMS gönderimi yapılandırılıyor", type: "loading" })}>
              Toplu SMS
            </button>
          </>
        )}
      </div>

      {/* Filters */}
      {filtersOpen && (
        <FinansFilterBar>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Field label="Başlangıç Tarihi">
              <input type="date" value={baslangic} onChange={(e) => setBaslangic(e.target.value)} className="gt-input" />
            </Field>
            <Field label="Bitiş Tarihi">
              <input type="date" value={bitis} onChange={(e) => setBitis(e.target.value)} className="gt-input" />
            </Field>
            <Field label="Durum">
              <select value={durum} onChange={(e) => setDurum(e.target.value as OverdueDurumFilter)} className="gt-input">
                <option value="gecikmis">Gecikmiş</option>
                <option value="bugun_vadeli">Bugün Vadeli</option>
                <option value="yaklasan">Yaklaşan Vadeler</option>
              </select>
            </Field>
            <Field label="Gecikme Süresi">
              <select value={gecikmeAraligi} onChange={(e) => setGecikmeAraligi(e.target.value as GecikmeAraligi | "")} className="gt-input">
                <option value="">Tümü</option>
                <option value="1-7">1-7 Gün</option>
                <option value="8-15">8-15 Gün</option>
                <option value="16-30">16-30 Gün</option>
                <option value="30+">30+ Gün</option>
              </select>
            </Field>
            <Field label="Min Tutar (₺)">
              <input type="number" value={minTutar} onChange={(e) => setMinTutar(e.target.value)} className="gt-input" placeholder="0" />
            </Field>
            <Field label="Max Tutar (₺)">
              <input type="number" value={maxTutar} onChange={(e) => setMaxTutar(e.target.value)} className="gt-input" placeholder="∞" />
            </Field>
            <Field label="Hızlı Arama (Öğrenci / Veli / Sözleşme)">
              <input type="text" value={arama} onChange={(e) => setArama(e.target.value)} className="gt-input" placeholder="Ara…" />
            </Field>
            <div className="flex items-end gap-2">
              <button type="button" onClick={applyFilters} className="gt-btn gt-btn--primary flex-1">Filtrele</button>
              <button type="button" onClick={clearFilters} className="gt-btn gt-btn--ghost">Temizle</button>
            </div>
          </div>
        </FinansFilterBar>
      )}

      {/* Table */}
      {loading ? (
        <div className="flex flex-col items-center py-24">
          <div className="w-10 h-10 border-[3px] border-gray-200 border-t-blue-600 rounded-full animate-spin mb-4" />
          <p className="text-sm text-gray-400">Yükleniyor…</p>
        </div>
      ) : error ? (
        <div className="py-20 text-center">
          <p className="text-sm font-semibold text-red-600 mb-3">{error}</p>
          <button onClick={load} className="gt-btn gt-btn--primary">Tekrar Dene</button>
        </div>
      ) : items.length === 0 ? (
        <div className="py-20 text-center bg-white rounded-2xl border border-gray-100">
          <p className="text-base font-semibold text-gray-700">Bu filtrelerde kayıt yok</p>
          <p className="text-sm text-gray-400 mt-1">Filtreleri temizleyerek tekrar deneyin.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="finans-table-wrap overflow-x-auto">
            <table className="table-modern w-full text-sm">
              <thead>
                <tr>
                  <th className="w-10">
                    <input type="checkbox" checked={selected.size === items.length && items.length > 0} onChange={toggleAll} />
                  </th>
                  {visibleColumnDefs.map((col) => (
                    <th key={col.key} className={col.sortKey ? "cursor-pointer select-none" : ""} onClick={() => toggleSort(col.sortKey)}>
                      <span className="finans-th-inner">{col.label}{col.sortKey && ordering.includes(col.sortKey) ? (ordering.startsWith("-") ? " ↓" : " ↑") : ""}</span>
                    </th>
                  ))}
                  <th className="text-center">İşlemler</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.taksit_id} className="gt-row cursor-pointer hover:bg-slate-50/80" onClick={() => openDetail(item)}>
                    <td onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={selected.has(item.taksit_id)} onChange={() => toggleRow(item.taksit_id)} />
                    </td>
                    {visibleColumnDefs.map((col) => (
                      <td key={col.key} data-col={col.key}>
                        {renderCell(col.key, item)}
                      </td>
                    ))}
                    <td onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-center gap-0.5">
                        <ActionBtn title="Tahsilat Al" onClick={() => setTahsilatHedef({ sozlesmeId: item.sozlesme_id, taksitId: item.taksit_id })}>💰</ActionBtn>
                        <ActionBtn title="WhatsApp" onClick={() => { setSelected(new Set([item.taksit_id])); setShowBulkModal(true); }}>💬</ActionBtn>
                        <ActionBtn title="Ara" onClick={() => handleCall(item.veli_telefon)}>📞</ActionBtn>
                        <ActionBtn title="Detay" onClick={() => openDetail(item)}>⋯</ActionBtn>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-gray-50 text-xs text-gray-500">
            <span>{count.toLocaleString("tr-TR")} kayıt · Sayfa {page}/{totalPages}</span>
            <div className="flex items-center gap-2">
              <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }} className="gt-input gt-input--sm">
                {[25, 50, 100, 200].map((n) => <option key={n} value={n}>{n}/sayfa</option>)}
              </select>
              <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="gt-btn gt-btn--ghost gt-btn--sm">Önceki</button>
              <button type="button" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="gt-btn gt-btn--ghost gt-btn--sm">Sonraki</button>
            </div>
          </div>
        </div>
      )}

      {detailItem && (
        <GecikenDetayDrawer
          item={detailItem}
          detail={detailData}
          loading={detailLoading}
          odemeHref={odemeHref}
          homeHref={homeHref}
          onClose={() => { setDetailItem(null); setDetailData(null); }}
          onTahsilat={() => setTahsilatHedef({ sozlesmeId: detailItem.sozlesme_id, taksitId: detailItem.taksit_id })}
          onWhatsapp={() => { setSelected(new Set([detailItem.taksit_id])); setShowBulkModal(true); }}
          onCall={() => handleCall(detailItem.veli_telefon)}
          onNotEkle={handleNotEkle}
        />
      )}

      {showBulkModal && (
        <TopluGecikmeMesajModal
          selectedItems={selectedItems.length ? selectedItems : items.filter((i) => selected.has(i.taksit_id))}
          kurumAd={activeKurum.ad}
          onClose={() => setShowBulkModal(false)}
          onSent={(sent) => setToast({ message: `${sent} kişiye mesaj gönderildi`, type: "success" })}
        />
      )}

      {tahsilatHedef && (
        <TahsilatAlModal
          prefillSozlesmeId={tahsilatHedef.sozlesmeId}
          prefillTaksitId={tahsilatHedef.taksitId}
          onClose={() => setTahsilatHedef(null)}
          onSuccess={(message) => { setToast({ message, type: "success" }); setTahsilatHedef(null); load(); }}
        />
      )}

      {toast && <FinansToast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

function renderCell(key: GecikenColumnKey, item: OverduePaymentItem) {
  switch (key) {
    case "ogrenci": return <span className="font-medium text-gray-800">{item.ogrenci_adi}</span>;
    case "veli": return item.veli_adi || "—";
    case "telefon": return item.veli_telefon || "—";
    case "sube": return item.sube_ad || "—";
    case "sinif": return item.sinif_ad || "—";
    case "rehber": return item.rehber_ogretmen || "—";
    case "vade": return fmtDate(item.vade_tarihi);
    case "gecikme": return item.gecikme_gun > 0 ? `${item.gecikme_gun} gün` : "—";
    case "taksit_tutari": return <span className="cell-money">{fmtTL(item.taksit_tutari)}</span>;
    case "kalan": return <span className="cell-money text-red-600">{fmtTL(item.kalan_tutar)}</span>;
    case "son_tahsilat": return item.son_tahsilat_tarihi ? fmtDate(item.son_tahsilat_tarihi) : "—";
    case "durum": return <span className={durumBadgeClass(item.durum_renk)}>{item.durum_label}</span>;
    default: return "—";
  }
}

function KpiMini({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className={`quick-stat gt-kpi gt-kpi--${tone}`}>
      <div className="quick-stat-info">
        <h4>{value}</h4>
        <span>{label}</span>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[11px] font-semibold text-gray-500 block mb-1">{label}</label>
      {children}
    </div>
  );
}

function ActionBtn({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" title={title} onClick={onClick} className="p-1.5 rounded-lg hover:bg-gray-100 text-sm transition">
      {children}
    </button>
  );
}
