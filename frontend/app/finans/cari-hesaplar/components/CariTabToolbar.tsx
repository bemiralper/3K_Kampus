"use client";

import React, { useCallback, useRef, useState } from "react";
import type { ExportFormat, ExportOrientation } from "@/components/finans/ExportDropdown";
import { formatOdemeYontemiLabel } from "@/components/finans/odeme-yontemi-label";
import FloatingMenu from "@/components/finans/FloatingMenu";
import { exportCariTabReport } from "./cari-tab-export";
import "./cari-tab-toolbar.css";

export type CariTabFilterState = {
  arama: string;
  kategoriId: string;
  odemeYontemiId: string;
  baslangic: string;
  bitis: string;
};

export const EMPTY_CARI_TAB_FILTERS: CariTabFilterState = {
  arama: "",
  kategoriId: "",
  odemeYontemiId: "",
  baslangic: "",
  bitis: "",
};

type Option = { id: number; ad: string; mali_hesap_ad?: string | null; tip?: string };

export type CariTableColumnsApi = {
  displayOrder: string[];
  exportColumns: { key: string; label: string }[];
  visibleColumns: string[];
  toggleColumn: (id: string) => void;
  columnOrder: string[];
  columns: Record<string, { label: string; hideable?: boolean }>;
};

export function toCariTableColumnsApi<T extends string>(api: {
  displayOrder: T[];
  exportColumns: { key: string; label: string }[];
  visibleColumns: T[];
  toggleColumn: (id: T) => void;
  columnOrder: T[];
  columns: Record<T, { label: string; hideable?: boolean }>;
}): CariTableColumnsApi {
  return {
    displayOrder: api.displayOrder,
    exportColumns: api.exportColumns,
    visibleColumns: api.visibleColumns,
    columnOrder: api.columnOrder,
    columns: api.columns,
    toggleColumn: (id) => api.toggleColumn(id as T),
  };
}

export default function CariTabToolbar({
  filters,
  onChange,
  kategoriler = [],
  odemeYontemleri = [],
  showKategori = true,
  showOdemeYontemi = true,
  aramaPlaceholder = "Açıklama, kategori veya belge no ile ara…",
  columnsApi,
  cariHesapId,
  exportTitle,
  exportRows,
  exportFilenamePrefix,
  filtersMeta,
}: {
  filters: CariTabFilterState;
  onChange: (patch: Partial<CariTabFilterState>) => void;
  kategoriler?: Option[];
  odemeYontemleri?: Option[];
  showKategori?: boolean;
  showOdemeYontemi?: boolean;
  aramaPlaceholder?: string;
  columnsApi?: CariTableColumnsApi | null;
  cariHesapId?: number;
  exportTitle?: string;
  exportRows?: Record<string, unknown>[];
  exportFilenamePrefix?: string;
  filtersMeta?: Record<string, unknown>;
}) {
  const colBtnRef = useRef<HTMLButtonElement>(null);
  const exportBtnRef = useRef<HTMLButtonElement>(null);
  const [colOpen, setColOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [orientation, setOrientation] = useState<ExportOrientation>("landscape");
  const [exportBusy, setExportBusy] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const hasActiveFilter =
    filters.arama ||
    filters.kategoriId ||
    filters.odemeYontemiId ||
    filters.baslangic ||
    filters.bitis;

  const handleExport = useCallback(
    async (format: ExportFormat) => {
      if (!cariHesapId || !columnsApi || !exportRows?.length) return;
      setExportOpen(false);
      setExportBusy(true);
      setExportError(null);
      try {
        await exportCariTabReport({
          cariHesapId,
          format,
          orientation,
          title: exportTitle || "Cari Rapor",
          columns: columnsApi.exportColumns,
          rows: exportRows,
          filtersMeta,
          filenamePrefix: exportFilenamePrefix,
        });
      } catch (err: unknown) {
        setExportError(err instanceof Error ? err.message : "Rapor indirilemedi.");
      } finally {
        setExportBusy(false);
      }
    },
    [
      cariHesapId,
      columnsApi,
      exportRows,
      exportTitle,
      exportFilenamePrefix,
      filtersMeta,
      orientation,
    ],
  );

  return (
    <div className="cari-tab-toolbar">
      <div className="cari-tab-toolbar-filters">
        <div className="cari-tab-toolbar-search">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            type="text"
            value={filters.arama}
            onChange={(e) => onChange({ arama: e.target.value })}
            placeholder={aramaPlaceholder}
          />
        </div>

        {showKategori && kategoriler.length > 0 && (
          <select
            value={filters.kategoriId}
            onChange={(e) => onChange({ kategoriId: e.target.value })}
            className="cari-tab-toolbar-select"
          >
            <option value="">Tüm Kategoriler</option>
            {kategoriler.map((k) => (
              <option key={k.id} value={k.id}>
                {k.ad}
              </option>
            ))}
          </select>
        )}

        {showOdemeYontemi && odemeYontemleri.length > 0 && (
          <select
            value={filters.odemeYontemiId}
            onChange={(e) => onChange({ odemeYontemiId: e.target.value })}
            className="cari-tab-toolbar-select"
          >
            <option value="">Tüm Ödeme Yöntemleri</option>
            {odemeYontemleri.map((o) => (
              <option key={o.id} value={o.id}>
                {formatOdemeYontemiLabel(o)}
              </option>
            ))}
          </select>
        )}

        <input
          type="date"
          value={filters.baslangic}
          onChange={(e) => onChange({ baslangic: e.target.value })}
          className="cari-tab-toolbar-date"
          title="Başlangıç tarihi"
        />
        <input
          type="date"
          value={filters.bitis}
          onChange={(e) => onChange({ bitis: e.target.value })}
          className="cari-tab-toolbar-date"
          title="Bitiş tarihi"
        />

        {hasActiveFilter && (
          <button
            type="button"
            className="cari-tab-toolbar-clear"
            onClick={() => onChange({ ...EMPTY_CARI_TAB_FILTERS })}
          >
            Filtreleri Temizle
          </button>
        )}
      </div>

      <div className="cari-tab-toolbar-actions">
        {exportError && (
          <span className="cari-tab-export-error" role="alert">
            {exportError}
          </span>
        )}

        {columnsApi && (
          <div className="cari-col-picker-wrap">
            <button
              ref={colBtnRef}
              type="button"
              className="btn-modern btn-outline-sm"
              aria-expanded={colOpen}
              onClick={() => {
                setExportOpen(false);
                setColOpen((v) => !v);
              }}
            >
              Sütunlar
            </button>
            <FloatingMenu
              open={colOpen}
              anchorRef={colBtnRef}
              onClose={() => setColOpen(false)}
              className="cari-col-picker-menu"
            >
              {columnsApi.columnOrder.map((colId) => {
                const meta = columnsApi.columns[colId];
                if (!meta || meta.hideable === false) return null;
                const checked = columnsApi.visibleColumns.includes(colId);
                return (
                  <label key={colId} className="cari-col-picker-item">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => columnsApi.toggleColumn(colId)}
                    />
                    {meta.label}
                  </label>
                );
              })}
            </FloatingMenu>
          </div>
        )}

        {cariHesapId && columnsApi && (exportRows?.length ?? 0) > 0 && (
          <div className="cari-export-wrap">
            <button
              ref={exportBtnRef}
              type="button"
              className="btn-modern btn-outline-sm"
              disabled={exportBusy}
              aria-expanded={exportOpen}
              onClick={() => {
                setColOpen(false);
                setExportOpen((v) => !v);
              }}
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
              {(["pdf", "xlsx", "csv"] as ExportFormat[]).map((f) => (
                <button key={f} type="button" onClick={() => handleExport(f)}>
                  {f.toUpperCase()} indir
                </button>
              ))}
            </FloatingMenu>
          </div>
        )}
      </div>
    </div>
  );
}
