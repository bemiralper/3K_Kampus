"use client";
import React, { useRef, useState, useEffect, useCallback, useMemo } from "react";
import { useKurum } from "@/lib/contexts/KurumContext";
import { useFinansPath } from "@/components/finans/FinansPathProvider";
import FloatingMenu from "@/components/finans/FloatingMenu";
import type { ExportFormat, ExportOrientation } from "@/components/finans/ExportDropdown";
import { cariHesapService } from "../services/cari-hesap-api";
import {
  CariHesapListItem,
  CariHesap,
  CariHesapRaporItem,
  HESAP_TURLERI,
} from "../types/cari-hesap-types";
import CariHesapFormPanel from "./components/CariHesapFormPanel";
import CariHesapTable from "./components/CariHesapTable";
import CariBakiyeRaporTable, { buildCariRaporExportRows } from "./components/CariBakiyeRaporTable";
import type { CariTableColumnId } from "./components/cari-table-columns";
import type { CariRaporColumnId } from "./components/cari-rapor-table-columns";
import {
  defaultRaporBaslangic,
  defaultRaporBitis,
  formatReportDateRange,
} from "./components/cari-report-export-meta";
import { computeListTotalsFromItems, computeRaporTotalsExtended } from "./components/cari-list-totals";
import CariListSummary from "./components/CariListSummary";
import { exportCariRaporList } from "./components/cari-tab-export";
import { useAuth } from "@/lib/contexts/AuthContext";
import { formatUserDisplayName } from "@/lib/format-user";
import "./components/cari-tab-toolbar.css";

const Spin = () => (
  <svg className="animate-spin" width="20" height="20" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
  </svg>
);

type ViewMode = "liste" | "rapor";

type CariColumnsApi = {
  columnOrder: CariTableColumnId[];
  columns: Record<CariTableColumnId, { label: string; hideable?: boolean }>;
  visibleColumns: CariTableColumnId[];
  toggleColumn: (id: CariTableColumnId) => void;
};

type CariRaporColumnsApi = {
  columnOrder: CariRaporColumnId[];
  columns: Record<CariRaporColumnId, { label: string; hideable?: boolean }>;
  visibleColumns: CariRaporColumnId[];
  toggleColumn: (id: CariRaporColumnId) => void;
  exportColumns: { key: string; label: string }[];
};

/* ═══════════════════════════════════════════════════════════
   Ana Client
═══════════════════════════════════════════════════════════ */
interface CariHesaplarClientProps {
  embedded?: boolean;
}

export default function CariHesaplarClient({ embedded }: CariHesaplarClientProps = {}) {
  const { homeHref, href, portalHomeHref } = useFinansPath();
  const { activeKurum, activeSube } = useKurum();
  const { user } = useAuth();
  const kurumId = activeKurum?.id;

  const [hesaplar, setHesaplar] = useState<CariHesapListItem[]>([]);
  const [raporSatirlari, setRaporSatirlari] = useState<CariHesapRaporItem[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>("liste");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [arama, setArama] = useState("");
  const [debouncedArama, setDebouncedArama] = useState("");
  const [turFiltre, setTurFiltre] = useState("");
  const [raporBaslangic, setRaporBaslangic] = useState(() => defaultRaporBaslangic());
  const [raporBitis, setRaporBitis] = useState(() => defaultRaporBitis());

  type DrawerMode = "create" | "edit" | null;
  const [drawerMode, setDrawerMode] = useState<DrawerMode>(null);
  const [activeData, setActiveData] = useState<CariHesap | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [columnsApi, setColumnsApi] = useState<CariColumnsApi | null>(null);
  const [raporColumnsApi, setRaporColumnsApi] = useState<CariRaporColumnsApi | null>(null);
  const [colOpen, setColOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [rowBusyId, setRowBusyId] = useState<number | null>(null);
  const [orientation, setOrientation] = useState<ExportOrientation>("landscape");
  const colBtnRef = useRef<HTMLButtonElement>(null);
  const exportBtnRef = useRef<HTMLButtonElement>(null);

  const showToast = useCallback((msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedArama(arama.trim()), 350);
    return () => clearTimeout(t);
  }, [arama]);

  const listParams = useCallback((): Record<string, string> => {
    const params: Record<string, string> = { kurum_id: String(kurumId) };
    if (activeSube?.id) params.sube_id = String(activeSube.id);
    if (debouncedArama) params.arama = debouncedArama;
    if (turFiltre) params.hesap_turu = turFiltre;
    return params;
  }, [kurumId, activeSube, debouncedArama, turFiltre]);

  const raporParams = useCallback((): Record<string, string> => {
    const params = listParams();
    if (raporBaslangic) params.baslangic = raporBaslangic;
    if (raporBitis) params.bitis = raporBitis;
    return params;
  }, [listParams, raporBaslangic, raporBitis]);

  const fetchList = useCallback(async (opts?: { silent?: boolean }) => {
    if (!kurumId) return;
    if (opts?.silent) setRefreshing(true);
    else setLoading(true);
    try {
      setHesaplar(await cariHesapService.list(listParams()));
    } catch (e: any) {
      showToast(e.message, "error");
    } finally {
      if (opts?.silent) setRefreshing(false);
      else setLoading(false);
    }
  }, [kurumId, listParams, showToast]);

  const fetchRapor = useCallback(async (opts?: { silent?: boolean }) => {
    if (!kurumId) return;
    if (opts?.silent) setRefreshing(true);
    else setLoading(true);
    try {
      setRaporSatirlari(await cariHesapService.raporList(raporParams()));
    } catch (e: any) {
      showToast(e.message, "error");
    } finally {
      if (opts?.silent) setRefreshing(false);
      else setLoading(false);
    }
  }, [kurumId, raporParams, showToast]);

  useEffect(() => {
    if (viewMode === "liste") fetchList({ silent: hesaplar.length > 0 });
    else fetchRapor({ silent: raporSatirlari.length > 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- silent refresh when filters change
  }, [viewMode, fetchList, fetchRapor]);

  const openCreate = () => { setActiveData(null); setDrawerMode("create"); };

  const openEdit = async (id: number) => {
    setDrawerLoading(true);
    setDrawerMode("edit");
    try {
      setActiveData(await cariHesapService.get(id));
    } catch (e: any) {
      showToast(e.message, "error");
      setDrawerMode(null);
    } finally {
      setDrawerLoading(false);
    }
  };

  const closeDrawer = () => { setDrawerMode(null); setActiveData(null); };

  const handleDelete = async (id: number, unvan: string) => {
    if (!confirm(`"${unvan}" silinsin mi?`)) return;
    setRowBusyId(id);
    try {
      await cariHesapService.delete(id);
      showToast("Cari hesap silindi.");
      refreshCurrent();
    } catch (e: any) {
      showToast(e.message, "error");
    } finally {
      setRowBusyId(null);
    }
  };

  const handleToggle = async (id: number) => {
    setRowBusyId(id);
    try {
      const res = await cariHesapService.toggle(id);
      showToast(res.detail);
      refreshCurrent();
    } catch (e: any) {
      showToast(e.message, "error");
    } finally {
      setRowBusyId(null);
    }
  };

  const aktifSayi = hesaplar.filter((h) => h.aktif_mi).length;
  const listeTotals = useMemo(() => computeListTotalsFromItems(hesaplar), [hesaplar]);
  const displayStats = viewMode === "rapor"
    ? computeRaporTotalsExtended(raporSatirlari)
    : listeTotals;

  const raporExportRows = useMemo(
    () => buildCariRaporExportRows(raporSatirlari),
    [raporSatirlari],
  );

  const raporTotals = useMemo(
    () => computeRaporTotalsExtended(raporSatirlari),
    [raporSatirlari],
  );

  const turFiltreLabel = turFiltre
    ? HESAP_TURLERI.find((t) => t.value === turFiltre)?.label || turFiltre
    : "Tümü";

  const activeColumnsApi = viewMode === "rapor" ? raporColumnsApi : columnsApi;

  const handleRaporExport = useCallback(
    async (format: ExportFormat) => {
      if (!raporColumnsApi || !raporExportRows.length) return;
      setExportOpen(false);
      setExportBusy(true);
      setExportError(null);
      const ok = await exportCariRaporList(
        {
          format,
          orientation,
          title: "Cari Hesap Bakiye Raporu",
          columns: raporColumnsApi.exportColumns,
          rows: raporExportRows,
          filtersMeta: {
            kurum_id: kurumId,
            sube_id: activeSube?.id,
            report_kind: "cari_bakiye",
            rapor_adi: "Cari Hesap Bakiye Raporu",
            raporu_olusturan: formatUserDisplayName(user),
            baslangic: raporBaslangic,
            bitis: raporBitis,
            tarih_araligi: formatReportDateRange(raporBaslangic, raporBitis),
            hesap_turu_label: turFiltreLabel,
            cari_turu: turFiltreLabel,
            durum: "Tümü",
            para_birimi: "TL",
            report_totals: raporTotals,
          },
          filenamePrefix: "cari-bakiye-raporu",
        },
        {
          onError: (message) => setExportError(message),
        },
      );
      setExportBusy(false);
      if (!ok) return;
    },
    [
      raporColumnsApi,
      raporExportRows,
      orientation,
      kurumId,
      activeSube?.id,
      user,
      raporBaslangic,
      raporBitis,
      turFiltreLabel,
      raporTotals,
    ],
  );

  const refreshCurrent = () => {
    if (viewMode === "liste") fetchList({ silent: true });
    else fetchRapor({ silent: true });
  };

  const activeListCount = viewMode === "rapor" ? raporSatirlari.length : hesaplar.length;

  if (!kurumId) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-400">
        <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16" />
          </svg>
        </div>
        <p className="font-medium">Lütfen bir kurum seçin</p>
      </div>
    );
  }

  return (
    <>
      <div className={embedded ? "" : "space-y-5"}>
        {/* Header */}
        {embedded ? (
          <div className="card-modern-header">
            <h3>Cari Hesaplar</h3>
            <div className="card-modern-header-actions">
              <span className="text-[12px] text-gray-500 mr-2">
                {activeListCount} kayıt{viewMode === "liste" && aktifSayi > 0 && ` · ${aktifSayi} aktif`}
              </span>
              <button onClick={openCreate} className="btn-hero">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                </svg>
                Yeni Hesap
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="hero-header">
              <div className="hero-content">
                <div className="hero-icon">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                </div>
                <div className="hero-text">
                  <h1>Cari Hesap Yönetimi</h1>
                  <div className="hero-breadcrumb">
                    <a href={portalHomeHref}>Ana Sayfa</a>
                    <span>/</span>
                    <a href={homeHref}>Finans</a>
                    <span>/</span>
                    <span>Cari Hesaplar</span>
                  </div>
                </div>
              </div>
              <div className="hero-actions">
                <button onClick={openCreate} className="btn-hero">
                  <span className="btn-hero-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                  </span>
                  <span>Yeni Cari Hesap</span>
                </button>
              </div>
            </div>

            {/* Quick Stats */}
            {!loading && displayStats.toplam_cari > 0 && (
              <div className="quick-stats" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
                <div className="quick-stat">
                  <div className="quick-stat-icon blue">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
                  </div>
                  <div className="quick-stat-info">
                    <h4>{displayStats.toplam_cari}</h4>
                    <span>Toplam Hesap</span>
                  </div>
                </div>
                <div className="quick-stat">
                  <div className="quick-stat-icon green">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                  </div>
                  <div className="quick-stat-info">
                    <h4>{viewMode === "rapor"
                      ? raporSatirlari.filter((h) => h.hesap_turu === "musteri").length
                      : hesaplar.filter((h) => h.hesap_turu === "musteri").length}</h4>
                    <span>Müşteri</span>
                  </div>
                </div>
                <div className="quick-stat">
                  <div className="quick-stat-icon purple">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16" /><path d="M3 21h18" /></svg>
                  </div>
                  <div className="quick-stat-info">
                    <h4>{viewMode === "rapor"
                      ? raporSatirlari.filter((h) => h.hesap_turu === "tedarikci").length
                      : hesaplar.filter((h) => h.hesap_turu === "tedarikci").length}</h4>
                    <span>Tedarikçi</span>
                  </div>
                </div>
                <div className="quick-stat">
                  <div className={`quick-stat-icon ${displayStats.net_bakiye > 0 ? "red" : "green"}`}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
                  </div>
                  <div className="quick-stat-info">
                    <h4>{displayStats.net_bakiye.toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ₺</h4>
                    <span>Net Bakiye</span>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* Table card — filter toolbar + table live in one shell */}
        <div className={`${embedded ? "" : "card-modern"}`}>
          <div className="cari-list-view-tabs">
            <button
              type="button"
              className={viewMode === "liste" ? "active" : ""}
              onClick={() => setViewMode("liste")}
            >
              Hesap Listesi
            </button>
            <button
              type="button"
              className={viewMode === "rapor" ? "active" : ""}
              onClick={() => setViewMode("rapor")}
            >
              Bakiye Raporu
            </button>
          </div>
          <div className="cari-tab-toolbar">
            <div className="cari-tab-toolbar-filters">
              <div className="cari-tab-toolbar-search">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8" />
                  <path d="M21 21l-4.35-4.35" />
                </svg>
                <input
                  type="text"
                  placeholder="Ünvan, hesap kodu veya vergi no ile ara..."
                  value={arama}
                  onChange={(e) => setArama(e.target.value)}
                />
              </div>
              <select
                value={turFiltre}
                onChange={(e) => setTurFiltre(e.target.value)}
                className="cari-tab-toolbar-select"
              >
                <option value="">Tüm Hesap Türleri</option>
                {HESAP_TURLERI.map((k) => (
                  <option key={k.value} value={k.value}>{k.label}</option>
                ))}
              </select>
              {(arama || turFiltre) && (
                <button
                  type="button"
                  className="cari-tab-toolbar-clear"
                  onClick={() => { setArama(""); setDebouncedArama(""); setTurFiltre(""); }}
                >
                  Filtreleri Temizle
                </button>
              )}
              {refreshing && (
                <span className="text-[12px] text-gray-400 self-center">Güncelleniyor…</span>
              )}
              {viewMode === "rapor" && (
                <>
                  <input
                    type="date"
                    value={raporBaslangic}
                    onChange={(e) => setRaporBaslangic(e.target.value)}
                    className="cari-tab-toolbar-date"
                    title="Rapor başlangıç tarihi"
                  />
                  <input
                    type="date"
                    value={raporBitis}
                    onChange={(e) => setRaporBitis(e.target.value)}
                    className="cari-tab-toolbar-date"
                    title="Rapor bitiş tarihi"
                  />
                </>
              )}
            </div>

            {activeColumnsApi && (
              <div className="cari-tab-toolbar-actions">
                {exportError && (
                  <span className="cari-tab-export-error" role="alert">
                    {exportError}
                  </span>
                )}
                {viewMode === "rapor" && raporExportRows.length > 0 && (
                  <div className="cari-export-wrap">
                    <button
                      ref={exportBtnRef}
                      type="button"
                      className="btn-modern btn-outline-sm"
                      disabled={exportBusy}
                      aria-expanded={exportOpen}
                      onClick={() => setExportOpen((v) => !v)}
                    >
                      {exportBusy ? "Hazırlanıyor…" : "Rapor İndir"}
                    </button>
                    <FloatingMenu
                      open={exportOpen}
                      anchorRef={exportBtnRef}
                      onClose={() => setExportOpen(false)}
                      className="cari-export-menu"
                    >
                      <div className="cari-export-orient">
                        <button
                          type="button"
                          className={orientation === "portrait" ? "active" : ""}
                          onClick={() => setOrientation("portrait")}
                        >
                          Dikey
                        </button>
                        <button
                          type="button"
                          className={orientation === "landscape" ? "active" : ""}
                          onClick={() => setOrientation("landscape")}
                        >
                          Yatay
                        </button>
                      </div>
                      <button type="button" onClick={() => handleRaporExport("pdf")}>PDF</button>
                      <button type="button" onClick={() => handleRaporExport("xlsx")}>Excel</button>
                      <button type="button" onClick={() => handleRaporExport("csv")}>CSV</button>
                    </FloatingMenu>
                  </div>
                )}
                <div className="cari-col-picker-wrap">
                  <button
                    ref={colBtnRef}
                    type="button"
                    className="btn-modern btn-outline-sm"
                    aria-expanded={colOpen}
                    onClick={() => setColOpen((v) => !v)}
                  >
                    Sütunlar
                  </button>
                  <FloatingMenu
                    open={colOpen}
                    anchorRef={colBtnRef}
                    onClose={() => setColOpen(false)}
                    className="cari-col-picker-menu"
                  >
                    {activeColumnsApi.columnOrder.map((colId) => {
                      const meta = activeColumnsApi.columns[colId as keyof typeof activeColumnsApi.columns];
                      if (!meta || meta.hideable === false) return null;
                      const checked = activeColumnsApi.visibleColumns.includes(colId as never);
                      return (
                        <label key={colId} className="cari-col-picker-item">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => activeColumnsApi.toggleColumn(colId as never)}
                          />
                          {meta.label}
                        </label>
                      );
                    })}
                  </FloatingMenu>
                </div>
              </div>
            )}
          </div>
          <div className="card-modern-body">
            {loading && (viewMode === "liste" ? hesaplar.length === 0 : raporSatirlari.length === 0) ? (
              <div className="empty-state">
                <div className="empty-state-icon"><Spin /></div>
                <h4>Yükleniyor...</h4>
              </div>
            ) : viewMode === "liste" ? (
              hesaplar.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-state-icon">📋</div>
                  <h4>Cari hesap bulunamadı</h4>
                  <p>Yeni bir cari hesap ekleyerek başlayın.</p>
                </div>
              ) : (
                <>
                  <CariListSummary
                    totals={listeTotals}
                    title="Hesap Listesi Özeti"
                    subtitle={
                      debouncedArama || turFiltre
                        ? `Filtrelenmiş ${listeTotals.toplam_cari} kayıt`
                        : `${listeTotals.toplam_cari} kayıt`
                    }
                  />
                  <CariHesapTable
                    hesaplar={hesaplar}
                    href={href}
                    onEdit={openEdit}
                    onToggle={handleToggle}
                    onDelete={handleDelete}
                    onColumnsReady={setColumnsApi}
                    rowBusyId={rowBusyId}
                  />
                </>
              )
            ) : raporSatirlari.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">📊</div>
                <h4>Rapor için cari hesap bulunamadı</h4>
                <p>Filtreleri temizleyip tekrar deneyin.</p>
              </div>
            ) : (
              <>
                <CariListSummary
                  totals={raporTotals}
                  title="Cari Hesap Bakiye Raporu"
                  subtitle={`Tarih Aralığı: ${formatReportDateRange(raporBaslangic, raporBitis)} · Filtrelenmiş ${raporTotals.toplam_cari} kayıt`}
                />
                <CariBakiyeRaporTable
                  items={raporSatirlari}
                  href={href}
                  onColumnsReady={setRaporColumnsApi}
                />
              </>
            )}
          </div>
        </div>
      </div>

      {/* Slide-over drawer */}
      {drawerMode !== null && (
        <>
          <div className="fixed inset-0 bg-black/40 backdrop-blur-[6px] z-[150] transition-opacity" onClick={closeDrawer} />
          <div className="fixed inset-y-0 right-0 z-[200] w-full max-w-[540px] flex flex-col bg-slate-50 shadow-2xl shadow-gray-900/25 transition-transform duration-300">
            {drawerLoading ? (
              <div className="flex flex-col items-center justify-center flex-1 gap-4 text-gray-400">
                <div className="w-10 h-10 border-[3px] border-gray-200 border-t-blue-600 rounded-full animate-spin" />
                <span className="text-[14px] text-gray-500">Yükleniyor...</span>
              </div>
            ) : (
              <CariHesapFormPanel
                kurumId={kurumId}
                editData={activeData}
                isEdit={drawerMode === "edit"}
                onClose={closeDrawer}
                onSuccess={(msg) => { showToast(msg); closeDrawer(); refreshCurrent(); }}
                onError={(msg) => showToast(msg, "error")}
              />
            )}
          </div>
        </>
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-[250] flex items-center gap-3 px-5 py-3.5 rounded-2xl shadow-xl text-[13px] font-bold transition-all duration-300 ${
          toast.type === "success"
            ? "bg-emerald-600 text-white shadow-emerald-600/30"
            : "bg-rose-600 text-white shadow-rose-600/30"
        }`}>
          {toast.type === "success" ? (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          )}
          {toast.msg}
        </div>
      )}
    </>
  );
}
