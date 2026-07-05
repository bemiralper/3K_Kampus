"use client";

import { useCallback, useRef, useState } from "react";
import { exportCariRaporList } from "@/app/finans/cari-hesaplar/components/cari-tab-export";
import type { ExportFormat, ExportOrientation } from "@/components/finans/ExportDropdown";
import FloatingMenu from "@/components/finans/FloatingMenu";

type Column = { key: string; label: string };

type FinansRowsExportMenuProps = {
  title: string;
  columns: Column[];
  rows: Record<string, unknown>[];
  filtersMeta?: Record<string, unknown>;
  filenamePrefix?: string;
  disabled?: boolean;
  label?: string;
};

export default function FinansRowsExportMenu({
  title,
  columns,
  rows,
  filtersMeta,
  filenamePrefix = "finans-rapor",
  disabled = false,
  label = "Rapor Al",
}: FinansRowsExportMenuProps) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [orientation, setOrientation] = useState<ExportOrientation>("landscape");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExport = useCallback(
    async (format: ExportFormat) => {
      if (!rows.length) return;
      setOpen(false);
      setBusy(true);
      setError(null);
      try {
        await exportCariRaporList({
          format,
          orientation,
          title,
          columns,
          rows,
          filtersMeta,
          filenamePrefix,
        });
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Rapor indirilemedi.");
      } finally {
        setBusy(false);
      }
    },
    [columns, filenamePrefix, filtersMeta, orientation, rows, title],
  );

  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      {error && (
        <span style={{ fontSize: 12, color: "#b91c1c" }} role="alert">
          {error}
        </span>
      )}
      <button
        ref={btnRef}
        type="button"
        className="btn-modern btn-outline-sm"
        disabled={disabled || busy || rows.length === 0}
        onClick={() => setOpen((v) => !v)}
      >
        {busy ? "…" : label}
      </button>
      <FloatingMenu anchorRef={btnRef} open={open} onClose={() => setOpen(false)} className="" align="end">
        <div style={{ padding: 8, minWidth: 180 }}>
          <p style={{ margin: "0 0 8px", fontSize: 11, fontWeight: 600, color: "#64748b" }}>Yön</p>
          <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
            {(["landscape", "portrait"] as ExportOrientation[]).map((o) => (
              <button
                key={o}
                type="button"
                className={`btn-modern btn-outline-sm${orientation === o ? " btn-primary" : ""}`}
                style={{ flex: 1, fontSize: 11 }}
                onClick={() => setOrientation(o)}
              >
                {o === "landscape" ? "Yatay" : "Dikey"}
              </button>
            ))}
          </div>
          {(["csv", "xlsx", "pdf"] as ExportFormat[]).map((format) => (
            <button
              key={format}
              type="button"
              className="btn-modern btn-outline-sm"
              style={{ width: "100%", marginBottom: 4, justifyContent: "flex-start" }}
              onClick={() => handleExport(format)}
            >
              {format === "csv" ? "CSV" : format === "xlsx" ? "Excel" : "PDF"}
            </button>
          ))}
        </div>
      </FloatingMenu>
    </div>
  );
}
