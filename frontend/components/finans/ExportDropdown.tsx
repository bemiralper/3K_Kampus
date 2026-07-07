"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { finansApiUrl, finansDownload } from "@/app/finans/services/finans-http";
import { runFinansExport, triggerFileDownload } from "@/lib/finans-export";
import FinansToast, { type FinansToastType } from "./FinansToast";
import FloatingMenu from "./FloatingMenu";
import "./export-dropdown.css";

export type ExportFormat = "csv" | "xlsx" | "pdf";
export type ExportOrientation = "portrait" | "landscape";

const ORIENTATION_STORAGE_KEY = "finans_export_orientation_v1";

interface ExportDropdownProps {
  buildPath: (format: ExportFormat, orientation: ExportOrientation) => string;
  filenamePrefix?: string;
  disabled?: boolean;
  label?: string;
  /** PDF/Excel için yön seçici göster (CSV yapısını değiştirmez) */
  showOrientation?: boolean;
}

function loadStoredOrientation(): ExportOrientation {
  if (typeof window === "undefined") return "landscape";
  try {
    const v = localStorage.getItem(ORIENTATION_STORAGE_KEY);
    if (v === "portrait" || v === "landscape") return v;
  } catch { /* ignore */ }
  return "landscape";
}

function saveOrientation(orientation: ExportOrientation) {
  if (typeof window === "undefined") return;
  localStorage.setItem(ORIENTATION_STORAGE_KEY, orientation);
}

const FORMAT_LABELS: Record<ExportFormat, string> = {
  csv: "CSV",
  xlsx: "Excel",
  pdf: "PDF",
};

export default function ExportDropdown({
  buildPath,
  filenamePrefix = "finans-export",
  disabled = false,
  label = "Dışa Aktar",
  showOrientation = true,
}: ExportDropdownProps) {
  const [open, setOpen] = useState(false);
  const [orientation, setOrientation] = useState<ExportOrientation>("landscape");
  const [toast, setToast] = useState<{ message: string; type: FinansToastType } | null>(null);
  const [exportBusy, setExportBusy] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setOrientation(loadStoredOrientation());
  }, []);

  const clearToast = useCallback(() => setToast(null), []);

  const handleOrientationChange = (next: ExportOrientation) => {
    setOrientation(next);
    saveOrientation(next);
  };

  const handleExport = useCallback(async (format: ExportFormat) => {
    setOpen(false);
    setExportBusy(true);
    setToast({ message: `${FORMAT_LABELS[format]} hazırlanıyor…`, type: "loading" });
    const ok = await runFinansExport(
      async (signal) => {
        const path = buildPath(format, orientation);
        const { blob, filename } = await finansDownload(path, signal);
        const ext = format === "xlsx" ? "xlsx" : format;
        const fallbackName = blob.type.includes("zip")
          ? `${filenamePrefix}.zip`
          : `${filenamePrefix}.${ext}`;
        triggerFileDownload(blob, filename || fallbackName);
      },
      {
        onError: (message) => {
          setToast({ message, type: "error" });
        },
      },
    );
    setExportBusy(false);
    if (ok !== null) {
      setToast({ message: `${FORMAT_LABELS[format]} indirildi.`, type: "success" });
    }
  }, [buildPath, filenamePrefix, orientation]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        disabled={disabled || exportBusy}
        onClick={() => setOpen((v) => !v)}
        className="btn-hero"
        style={{ opacity: disabled || exportBusy ? 0.6 : 1, cursor: disabled || exportBusy ? "not-allowed" : "pointer" }}
        aria-expanded={open}
      >
        <span className="btn-hero-icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
        </span>
        <span>{exportBusy ? "Hazırlanıyor…" : label}</span>
      </button>

      <FloatingMenu
        open={open}
        anchorRef={btnRef}
        onClose={() => setOpen(false)}
        className="finans-export-menu"
        minWidth={220}
      >
        {showOrientation && (
          <div className="finans-export-orient">
            <div className="finans-export-orient-label">Sayfa Yönü</div>
            <div className="finans-export-orient-btns">
              {([
                { key: "portrait" as const, label: "Dikey" },
                { key: "landscape" as const, label: "Yatay" },
              ]).map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  className={orientation === opt.key ? "active" : ""}
                  onClick={() => handleOrientationChange(opt.key)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <div className="finans-export-orient-hint">
              PDF ve Excel yazdırma yönü. CSV ham veri olarak indirilir.
            </div>
          </div>
        )}
        {(["xlsx", "pdf", "csv"] as ExportFormat[]).map((fmt) => (
          <button key={fmt} type="button" className="finans-export-item" onClick={() => handleExport(fmt)}>
            {FORMAT_LABELS[fmt]} indir
          </button>
        ))}
      </FloatingMenu>

      {toast && (
        <FinansToast
          message={toast.message}
          type={toast.type}
          onClose={clearToast}
        />
      )}
    </>
  );
}

/** Helper for building export paths that go through finans API proxy */
export function finansExportPath(relativePath: string): string {
  return finansApiUrl(relativePath);
}
