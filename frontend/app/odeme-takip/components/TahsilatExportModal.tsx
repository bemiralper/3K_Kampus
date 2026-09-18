"use client";

import { useEffect, useMemo, useState } from "react";
import { useKurum } from "@/lib/contexts/KurumContext";
import type { PdfOrientation } from "@/app/ogrenciler/lib/ogrenciListPdfExport";
import type { TahsilatItem } from "../types";
import {
  DEFAULT_TAHSILAT_EXPORT_KEYS,
  TAHSILAT_EXPORT_COLUMNS,
  allVeliExportColumns,
  exportTahsilatCsv,
  exportTahsilatPdf,
  exportTahsilatXlsx,
  maxTahsilatVeliCount,
  tahsilatBrandingFromKurum,
  type TahsilatExportFormat,
} from "../lib/tahsilatExport";

const FORMAT_OPTIONS: { id: TahsilatExportFormat; label: string }[] = [
  { id: "csv", label: "CSV" },
  { id: "xlsx", label: "Excel" },
  { id: "pdf", label: "PDF" },
];

const ORIENTATION_OPTIONS: { id: PdfOrientation; label: string }[] = [
  { id: "portrait", label: "Dikey" },
  { id: "landscape", label: "Yatay" },
];

interface Props {
  open: boolean;
  onClose: () => void;
  rows: TahsilatItem[];
  filterSummary?: string;
}

export default function TahsilatExportModal({ open, onClose, rows, filterSummary }: Props) {
  const { activeKurum, activeSube } = useKurum();
  const [selectedKeys, setSelectedKeys] = useState<string[]>([...DEFAULT_TAHSILAT_EXPORT_KEYS]);
  const [allVeliler, setAllVeliler] = useState(false);
  const [format, setFormat] = useState<TahsilatExportFormat>("xlsx");
  const [orientation, setOrientation] = useState<PdfOrientation>("landscape");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const veliExtraCols = useMemo(
    () => allVeliExportColumns(maxTahsilatVeliCount(rows)),
    [rows],
  );
  const visibleColumns = useMemo(
    () => (allVeliler ? [...TAHSILAT_EXPORT_COLUMNS, ...veliExtraCols] : TAHSILAT_EXPORT_COLUMNS),
    [allVeliler, veliExtraCols],
  );

  useEffect(() => {
    if (open) {
      setSelectedKeys([...DEFAULT_TAHSILAT_EXPORT_KEYS]);
      setAllVeliler(false);
      setError(null);
    }
  }, [open]);

  const toggleAllVeliler = () => {
    setAllVeliler((prev) => {
      const next = !prev;
      setSelectedKeys((keys) => {
        const extra = veliExtraCols.map((c) => c.key);
        const without = keys.filter((k) => !extra.includes(k));
        if (!next) return without;
        const add = ["veli_adi", "veli_tc", ...extra].filter((k) => !without.includes(k));
        return [...without, ...add];
      });
      return next;
    });
  };

  const branding = useMemo(
    () => tahsilatBrandingFromKurum(activeKurum, activeSube),
    [activeKurum, activeSube],
  );

  if (!open) return null;

  const toggleKey = (key: string) => {
    setSelectedKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  };

  const handleExport = async () => {
    if (selectedKeys.length === 0) {
      setError("En az bir sütun seçin");
      return;
    }
    if (rows.length === 0) {
      setError("Dışa aktarılacak kayıt yok");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      if (format === "csv") {
        exportTahsilatCsv(rows, selectedKeys);
      } else if (format === "xlsx") {
        exportTahsilatXlsx(rows, selectedKeys);
      } else {
        await exportTahsilatPdf({
          rows,
          keys: selectedKeys,
          orientation,
          ...branding,
          filterSummary,
        });
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Dışa aktarma hatası");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="ot-export-overlay" onClick={onClose}>
      <div
        className="ot-export-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="tahsilat-export-title"
      >
        <div className="ot-export-header">
          <div>
            <h3 id="tahsilat-export-title">Listeyi Dışa Aktar</h3>
            <p>{rows.length} tahsilat · aktif filtreler uygulanır</p>
          </div>
          <button type="button" className="ot-export-close" onClick={onClose} aria-label="Kapat">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="ot-export-body">
          <section>
            <h4>Dosya Formatı</h4>
            <div className="ot-export-seg" role="group" aria-label="Dosya formatı">
              {FORMAT_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className={format === opt.id ? "active" : ""}
                  onClick={() => setFormat(opt.id)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </section>

          {format === "pdf" && (
            <section>
              <h4>Sayfa Yönü</h4>
              <div className="ot-export-seg" role="group" aria-label="Sayfa yönü">
                {ORIENTATION_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    className={orientation === opt.id ? "active" : ""}
                    onClick={() => setOrientation(opt.id)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </section>
          )}

          <section>
            <div className="ot-export-cols-head">
              <h4>Sütunlar</h4>
              <div>
                <button type="button" className="ot-export-link" onClick={() => setSelectedKeys(visibleColumns.map((c) => c.key))}>
                  Tümü
                </button>
                <button type="button" className="ot-export-link" onClick={() => setSelectedKeys([])}>
                  Temizle
                </button>
              </div>
            </div>
            <div className="ot-export-chips">
              <button
                type="button"
                className={`ot-export-chip${allVeliler ? " selected" : ""}`}
                onClick={toggleAllVeliler}
              >
                <span>Tüm velileri ekle</span>
              </button>
              {visibleColumns.map((col) => {
                const selected = selectedKeys.includes(col.key);
                const order = selected ? selectedKeys.indexOf(col.key) + 1 : 0;
                return (
                  <button
                    key={col.key}
                    type="button"
                    className={`ot-export-chip${selected ? " selected" : ""}`}
                    onClick={() => toggleKey(col.key)}
                  >
                    <span>{col.label}</span>
                    {order > 0 && <em>{order}</em>}
                  </button>
                );
              })}
            </div>
          </section>

          {error && <div className="ot-export-error">{error}</div>}
        </div>

        <div className="ot-export-footer">
          <button type="button" className="ot-export-ghost" onClick={onClose}>
            Vazgeç
          </button>
          <button type="button" className="ot-export-primary" onClick={handleExport} disabled={loading}>
            {loading ? "Hazırlanıyor…" : "İndir"}
          </button>
        </div>
      </div>
    </div>
  );
}
