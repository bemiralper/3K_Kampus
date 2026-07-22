"use client";

import { useCallback, useEffect, useState } from "react";
import { useKurum } from "@/lib/contexts/KurumContext";
import { runSinifRosterExport, type SinifRosterExportFilters } from "@/lib/sinif-roster-export";
import type { OgrenciListFilters } from "../lib/ogrenci-list-utils";

interface OgrenciSinifRosterExportButtonProps {
  filters: OgrenciListFilters;
}

export default function OgrenciSinifRosterExportButton({
  filters,
}: OgrenciSinifRosterExportButtonProps) {
  const { activeKurum, activeSube } = useKurum();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [termId, setTermId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    <div style={{ position: "relative" }}>
      <button
        type="button"
        className="ogrenci-toolbar-btn secondary"
        disabled={loading}
        onClick={() => setOpen((v) => !v)}
        title="Dönem bazlı sınıf öğrenci listesi (Eğitim Tanımları verisi)"
      >
        Sınıf Listesi
      </button>
      {open && (
        <>
          <div
            style={{ position: "fixed", inset: 0, zIndex: 40 }}
            onClick={() => setOpen(false)}
          />
          <div
            style={{
              position: "absolute",
              right: 0,
              top: "calc(100% + 6px)",
              minWidth: "140px",
              background: "#fff",
              border: "1px solid #e2e8f0",
              borderRadius: "8px",
              boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
              padding: "6px",
              zIndex: 50,
            }}
          >
            {(["xlsx", "csv", "pdf"] as const).map((f) => (
              <button
                key={f}
                type="button"
                disabled={loading}
                onClick={() => handleExport(f)}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "8px 12px",
                  border: "none",
                  background: "transparent",
                  borderRadius: "6px",
                  fontSize: "13px",
                  cursor: loading ? "wait" : "pointer",
                  textTransform: "uppercase",
                }}
              >
                {f}
              </button>
            ))}
            {error && (
              <p style={{ margin: "6px 8px 0", fontSize: "11px", color: "#dc2626" }}>{error}</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
