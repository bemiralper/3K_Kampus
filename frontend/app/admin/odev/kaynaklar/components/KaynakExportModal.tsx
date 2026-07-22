"use client";

import { useEffect, useMemo, useState } from "react";
import { useKurum } from "@/lib/contexts/KurumContext";
import { brandingFromKurum, getAppLogo } from "@/lib/kurum-branding";
import { downloadBlob } from "@/lib/download-file";
import {
  BOOK_EXPORT_COLUMNS,
  DEFAULT_BOOK_EXPORT_KEYS,
  downloadBookExportCsv,
  downloadBookExportXlsx,
  fetchBookExportRows,
  type BookExportFilters,
} from "@/lib/resources-api";
import { exportOgrenciListPdf, type PdfOrientation } from "@/app/ogrenciler/lib/ogrenciListPdfExport";

type ExportFormat = "csv" | "xlsx" | "pdf";

type Props = {
  open: boolean;
  onClose: () => void;
  filters: BookExportFilters;
};

const FORMAT_OPTIONS: { id: ExportFormat; label: string; desc: string }[] = [
  { id: "csv", label: "CSV", desc: "Excel uyumlu" },
  { id: "xlsx", label: "Excel", desc: "XLSX dosyası" },
  { id: "pdf", label: "PDF", desc: "Yazdırılabilir" },
];

export default function KaynakExportModal({ open, onClose, filters }: Props) {
  const { activeKurum, activeSube } = useKurum();
  const branding = useMemo(
    () => (activeKurum ? brandingFromKurum(activeKurum) : null),
    [activeKurum],
  );
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [format, setFormat] = useState<ExportFormat>("xlsx");
  const [orientation, setOrientation] = useState<PdfOrientation>("landscape");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setSelectedKeys([...DEFAULT_BOOK_EXPORT_KEYS]);
      setError(null);
    }
  }, [open]);

  const columnOrderMap = useMemo(() => {
    const map = new Map<string, number>();
    selectedKeys.forEach((key, index) => map.set(key, index + 1));
    return map;
  }, [selectedKeys]);

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
    setLoading(true);
    setError(null);
    try {
      if (format === "csv") {
        const blob = await downloadBookExportCsv(filters, selectedKeys);
        downloadBlob(blob, "kaynak_kitaplar.csv");
      } else if (format === "xlsx") {
        const blob = await downloadBookExportXlsx(filters, selectedKeys);
        downloadBlob(blob, "kaynak_kitaplar.xlsx");
      } else {
        const { rows } = await fetchBookExportRows(filters, selectedKeys);
        if (rows.length === 0) throw new Error("Dışa aktarılacak kayıt bulunamadı");
        await exportOgrenciListPdf({
            rows,
            columnKeys: selectedKeys,
            columnLabels: selectedKeys.map(
              (k) => BOOK_EXPORT_COLUMNS.find((c) => c.key === k)?.label || k,
            ),
            orientation,
            documentTitle: "Kaynak Kitap Listesi",
            fileName: "kaynak_kitaplar.pdf",
            filterSummary: "Kaynak kitap listesi",
            branding: {
              kurumAd: activeKurum?.ad || "Kurum",
              subeAd: activeSube?.ad,
              logoUrl: branding ? getAppLogo(branding) : "/img/3k-logo.png",
              temaRengi: branding?.tema_rengi,
            },
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
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000 }} />
      <div
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          background: "white",
          borderRadius: 16,
          padding: 24,
          zIndex: 1001,
          width: 640,
          maxWidth: "94vw",
          maxHeight: "88vh",
          overflowY: "auto",
          boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 18 }}>Kitap Listesini Dışa Aktar</h3>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "#64748b" }}>
              Sütunları tıklama sırasına göre seçin · aktif filtreler uygulanır
            </p>
          </div>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", fontSize: 24, cursor: "pointer", color: "#64748b" }}>
            ×
          </button>
        </div>

        <h4 style={{ margin: "16px 0 8px", fontSize: 13, color: "#64748b" }}>Dosya formatı</h4>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {FORMAT_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setFormat(opt.id)}
              style={{
                flex: 1,
                minWidth: 120,
                padding: 12,
                borderRadius: 10,
                border: format === opt.id ? "2px solid #1f3c88" : "1px solid #e2e8f0",
                background: format === opt.id ? "#eff6ff" : "#fff",
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 14 }}>{opt.label}</div>
              <div style={{ fontSize: 12, color: "#64748b" }}>{opt.desc}</div>
            </button>
          ))}
        </div>

        {format === "pdf" && (
          <>
            <h4 style={{ margin: "16px 0 8px", fontSize: 13, color: "#64748b" }}>Sayfa yönü</h4>
            <div style={{ display: "flex", gap: 8 }}>
              {(
                [
                  { id: "portrait" as const, label: "Dikey" },
                  { id: "landscape" as const, label: "Yatay" },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setOrientation(opt.id)}
                  style={{
                    flex: 1,
                    padding: 10,
                    borderRadius: 8,
                    border: orientation === opt.id ? "2px solid #1f3c88" : "1px solid #e2e8f0",
                    background: orientation === opt.id ? "#eff6ff" : "#fff",
                    cursor: "pointer",
                    fontWeight: 600,
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16 }}>
          <h4 style={{ margin: 0, fontSize: 13, color: "#64748b" }}>
            Sütunlar <span style={{ fontWeight: 400 }}>(tıklama sırası = dosya sırası)</span>
          </h4>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={() => setSelectedKeys(BOOK_EXPORT_COLUMNS.map((c) => c.key))} style={{ fontSize: 12, border: "none", background: "none", color: "#1f3c88", cursor: "pointer" }}>
              Tümü
            </button>
            <button type="button" onClick={() => setSelectedKeys([])} style={{ fontSize: 12, border: "none", background: "none", color: "#64748b", cursor: "pointer" }}>
              Temizle
            </button>
          </div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
          {BOOK_EXPORT_COLUMNS.map((col) => {
            const order = columnOrderMap.get(col.key);
            const active = order != null;
            return (
              <button
                key={col.key}
                type="button"
                onClick={() => toggleKey(col.key)}
                style={{
                  padding: "8px 12px",
                  borderRadius: 999,
                  border: active ? "none" : "1px solid #e2e8f0",
                  background: active ? "#1f3c88" : "#fff",
                  color: active ? "#fff" : "#475569",
                  fontSize: 13,
                  cursor: "pointer",
                  fontWeight: active ? 600 : 500,
                }}
              >
                {active ? `${order}. ` : ""}
                {col.label}
              </button>
            );
          })}
        </div>

        {error && (
          <div style={{ marginTop: 14, padding: 10, background: "#fef2f2", color: "#dc2626", borderRadius: 8, fontSize: 13 }}>
            {error}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
          <button type="button" onClick={onClose} style={{ padding: "10px 16px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff", cursor: "pointer" }}>
            İptal
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={loading}
            style={{
              padding: "10px 18px",
              borderRadius: 8,
              border: "none",
              background: loading ? "#94a3b8" : "#1f3c88",
              color: "#fff",
              fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Hazırlanıyor…" : "İndir"}
          </button>
        </div>
      </div>
    </>
  );
}
