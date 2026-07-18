"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  bulkImportBooksExcel,
  downloadBookImportTemplate,
  type BookBulkImportResult,
} from "@/lib/resources-api";
import { downloadBlob } from "@/lib/download-file";

type Props = {
  open: boolean;
  onClose: () => void;
  onComplete: () => void;
};

export default function TopluKitapEkleModal({ open, onClose, onComplete }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<BookBulkImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setFile(null);
    setProcessing(false);
    setResult(null);
    setError(null);
  }, []);

  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !processing) onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, processing, onClose]);

  if (!open) return null;

  const handleDownloadTemplate = async () => {
    try {
      const blob = await downloadBookImportTemplate();
      downloadBlob(blob, "kaynak_kitap_sablonu.xlsx");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Şablon indirilemedi.");
    }
  };

  const handleImport = async () => {
    if (!file) {
      setError("Lütfen bir Excel dosyası seçin.");
      return;
    }
    setProcessing(true);
    setError(null);
    setResult(null);
    try {
      const res = await bulkImportBooksExcel(file);
      if (!res.success || !res.data) {
        setError(res.error || "Yükleme başarısız");
        return;
      }
      setResult(res.data);
      if (res.data.eklenen > 0) onComplete();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Yükleme hatası");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <>
      <div
        onClick={() => !processing && onClose()}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000 }}
      />
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
          width: 560,
          maxWidth: "92vw",
          maxHeight: "85vh",
          overflowY: "auto",
          boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 18 }}>Toplu Kitap Yükle</h3>
          <button
            type="button"
            onClick={() => !processing && onClose()}
            style={{ background: "none", border: "none", fontSize: 24, cursor: "pointer", color: "#64748b" }}
          >
            ×
          </button>
        </div>

        <p style={{ margin: "0 0 16px", fontSize: 13, color: "#64748b", lineHeight: 1.5 }}>
          Güncel şablonu indirin. <strong>Kitaplar</strong> sayfasında 2. satırdan itibaren
          doldurun. <strong>Kitap Türü</strong>, <strong>Ders</strong>, <strong>Sınıf</strong> ve{" "}
          <strong>Zorluk</strong> hücrelerinde açılır listeden seçin. Kitap Adı zorunludur;
          Kod boşsa otomatik üretilir. Kaydedip yükleyin.
        </p>

        <button
          type="button"
          onClick={handleDownloadTemplate}
          style={{
            padding: "10px 16px",
            borderRadius: 8,
            border: "1px solid #e2e8f0",
            background: "#fff",
            cursor: "pointer",
            fontWeight: 600,
            fontSize: 13,
            marginBottom: 14,
          }}
        >
          Excel Şablonu İndir
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls"
          style={{ display: "none" }}
          onChange={(e) => {
            setFile(e.target.files?.[0] || null);
            setResult(null);
            setError(null);
          }}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={processing}
          style={{
            width: "100%",
            padding: 12,
            borderRadius: 8,
            border: "1px dashed #cbd5e1",
            background: "#f8fafc",
            cursor: "pointer",
            fontSize: 13,
            marginBottom: 12,
          }}
        >
          {file ? file.name : "Excel dosyası seç…"}
        </button>

        {error && (
          <div style={{ marginBottom: 12, padding: 10, background: "#fef2f2", color: "#dc2626", borderRadius: 8, fontSize: 13 }}>
            {error}
          </div>
        )}

        {result && (
          <div style={{ marginBottom: 12, padding: 12, background: "#f8fafc", borderRadius: 8, fontSize: 13 }}>
            <div>
              <strong>{result.eklenen}</strong> eklendi · <strong>{result.atlanan}</strong> atlandı ·{" "}
              <strong>{result.hatali}</strong> hatalı
            </div>
            {result.eklenen === 0 && result.atlanan === 0 && result.hatalar.length === 0 && (
              <p style={{ margin: "8px 0 0", color: "#b45309" }}>
                Hiç satır işlenmedi. Verinin <strong>Kitaplar</strong> sayfasında olduğundan ve
                Kitap Adı / Tür / Ders / Sınıf doldurulduğundan emin olun.
              </p>
            )}
            {result.hatalar.length > 0 && (
              <ul style={{ margin: "8px 0 0", paddingLeft: 18, color: "#b91c1c", maxHeight: 160, overflow: "auto" }}>
                {result.hatalar.slice(0, 20).map((h, i) => (
                  <li key={i}>
                    {h.satir ? `Satır ${h.satir}: ` : ""}
                    {h.ad ? `${h.ad} — ` : ""}
                    {h.neden}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
          <button
            type="button"
            onClick={() => !processing && onClose()}
            style={{ padding: "10px 16px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff", cursor: "pointer" }}
          >
            {result ? "Kapat" : "İptal"}
          </button>
          {!result && (
            <button
              type="button"
              onClick={handleImport}
              disabled={processing || !file}
              style={{
                padding: "10px 18px",
                borderRadius: 8,
                border: "none",
                background: processing || !file ? "#94a3b8" : "#1f3c88",
                color: "#fff",
                fontWeight: 600,
                cursor: processing || !file ? "not-allowed" : "pointer",
              }}
            >
              {processing ? "Yükleniyor…" : "Yükle"}
            </button>
          )}
        </div>
      </div>
    </>
  );
}
