"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import FloatingMenu from "@/components/finans/FloatingMenu";
import { useKurum } from "@/lib/contexts/KurumContext";
import { runSinifRosterExport, type SinifRosterExportFilters } from "@/lib/sinif-roster-export";
import type { OgrenciListFilters } from "../lib/ogrenci-list-utils";

interface OgrenciSinifRosterExportButtonProps {
  filters: OgrenciListFilters;
}

const FORMAT_LABELS: Record<"xlsx" | "csv" | "pdf", { label: string; desc: string }> = {
  xlsx: { label: "Excel (.xlsx)", desc: "Biçimli tablo" },
  csv: { label: "CSV", desc: "Düz veri" },
  pdf: { label: "PDF", desc: "Yazdırılabilir liste" },
};

export default function OgrenciSinifRosterExportButton({
  filters,
}: OgrenciSinifRosterExportButtonProps) {
  const { activeKurum, activeSube } = useKurum();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [termId, setTermId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  const sinifIds = filters.sinif_ids || [];
  const seviyeIds = filters.sinif_seviyesi_ids || [];
  const visible = sinifIds.length > 0 || seviyeIds.length > 0;

  useEffect(() => {
    if (!visible) return;
    fetch("/api/siniflar/api/aktif-donem/", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => setTermId(d.aktif_donem?.id ?? null))
      .catch(() => setTermId(null));
  }, [visible]);

  const buildFilters = useCallback((): SinifRosterExportFilters | null => {
    if (!termId) return null;
    if (sinifIds.length === 1) {
      return { scope: "sinif", sinif_id: sinifIds[0], term_id: termId };
    }
    if (sinifIds.length > 1) {
      return { scope: "custom", sinif_ids: sinifIds, term_id: termId };
    }
    if (seviyeIds.length === 1) {
      return { scope: "seviye", sinif_seviyesi_id: seviyeIds[0], term_id: termId };
    }
    if (seviyeIds.length > 1) {
      return { scope: "all", term_id: termId };
    }
    return null;
  }, [sinifIds, seviyeIds, termId]);

  const handleExport = async (format: "csv" | "xlsx" | "pdf") => {
    const exportFilters = buildFilters();
    if (!exportFilters) {
      setError("Aktif dönem veya filtre bulunamadı");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await runSinifRosterExport(exportFilters, format, {
        kurumAd: activeKurum?.ad || "Kurum",
        subeAd: activeSube?.ad,
        logoUrl: activeKurum?.app_logo_url || activeKurum?.login_logo_url,
        temaRengi: activeKurum?.tema_rengi,
      });
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Dışa aktarma başarısız");
    } finally {
      setLoading(false);
    }
  };

  if (!visible) return null;

  return (
    <div className="ogrenci-col-picker-wrap">
      <button
        ref={btnRef}
        type="button"
        className={`ogrenci-toolbar-btn secondary${open ? " is-active" : ""}`}
        disabled={loading}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
        title="Dönem bazlı sınıf öğrenci listesi (Eğitim Tanımları verisi)"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
        </svg>
        Sınıf Listesi
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      <FloatingMenu
        open={open}
        anchorRef={btnRef}
        onClose={() => setOpen(false)}
        className="ogrenci-col-picker-menu ogrenci-roster-menu"
        minWidth={220}
        align="start"
      >
        <div className="ogrenci-col-picker-head">
          <div>
            <strong>Sınıf listesi</strong>
            <p>Dönem bazlı öğrenci listesi</p>
          </div>
        </div>
        <div className="ogrenci-roster-menu-body">
          {(["xlsx", "csv", "pdf"] as const).map((f) => (
            <button
              key={f}
              type="button"
              role="menuitem"
              className="ogrenci-roster-menu-item"
              disabled={loading}
              onClick={() => handleExport(f)}
            >
              <span className="ogrenci-roster-menu-item-label">{FORMAT_LABELS[f].label}</span>
              <span className="ogrenci-roster-menu-item-desc">{FORMAT_LABELS[f].desc}</span>
            </button>
          ))}
          {loading && <p className="ogrenci-roster-menu-note">Hazırlanıyor…</p>}
          {error && (
            <p className="ogrenci-roster-menu-error" role="alert">{error}</p>
          )}
        </div>
      </FloatingMenu>
    </div>
  );
}
