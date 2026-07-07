"use client";

import { useCallback, useRef, useState } from "react";
import {
  bulkImportOkulExcel,
  bulkImportOkulList,
  downloadOkulTemplate,
  type OkulBulkImportResult,
} from "@/lib/okul-api";
import { downloadBlob } from "@/lib/download-file";

type TabType = "excel" | "liste";

type TopluOkulEkleModalProps = {
  open: boolean;
  onClose: () => void;
  onComplete: () => void;
};

const EMPTY_RESULT: OkulBulkImportResult = {
  toplam_satir: 0,
  eklenen: 0,
  guncellenen: 0,
  atlanan: 0,
  hatali: 0,
  hatalar: [],
};

const CHUNK_SIZE = 200;

export default function TopluOkulEkleModal({ open, onClose, onComplete }: TopluOkulEkleModalProps) {
  const [tab, setTab] = useState<TabType>("excel");
  const [listeText, setListeText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState<OkulBulkImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setListeText("");
    setFile(null);
    setProcessing(false);
    setProgress({ done: 0, total: 0 });
    setResult(null);
    setError(null);
  }, []);

  const handleClose = () => {
    if (processing) return;
    reset();
    onClose();
  };

  const handleDownloadTemplate = async () => {
    try {
      const blob = await downloadOkulTemplate();
      downloadBlob(blob, "okul_sablonu.xlsx");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Şablon indirilemedi.");
    }
  };

  const runListImport = async () => {
    const lines = listeText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    if (lines.length === 0) {
      setError("En az bir okul adı girin.");
      return;
    }

    setProcessing(true);
    setError(null);
    setResult(null);
    setProgress({ done: 0, total: lines.length });

    try {
      let aggregated: OkulBulkImportResult = { ...EMPTY_RESULT };
      let lineOffset = 0;
      for (let i = 0; i < lines.length; i += CHUNK_SIZE) {
        const chunk = lines.slice(i, i + CHUNK_SIZE);
        const chunkResult = await bulkImportOkulList(chunk);
        aggregated = {
          toplam_satir: aggregated.toplam_satir + chunkResult.toplam_satir,
          eklenen: aggregated.eklenen + chunkResult.eklenen,
          guncellenen: aggregated.guncellenen + chunkResult.guncellenen,
          atlanan: aggregated.atlanan + chunkResult.atlanan,
          hatali: aggregated.hatali + chunkResult.hatali,
          hatalar: [
            ...aggregated.hatalar,
            ...chunkResult.hatalar.map((h) => ({ ...h, satir: h.satir + lineOffset })),
          ],
        };
        lineOffset += chunk.length;
        setProgress({ done: Math.min(i + chunk.length, lines.length), total: lines.length });
      }
      setResult(aggregated);
      onComplete();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Toplu ekleme başarısız.");
    } finally {
      setProcessing(false);
    }
  };

  const runExcelImport = async () => {
    if (!file) {
      setError("Excel dosyası seçin.");
      return;
    }

    setProcessing(true);
    setError(null);
    setResult(null);
    setProgress({ done: 0, total: 1 });

    try {
      const importResult = await bulkImportOkulExcel(file);
      setProgress({ done: 1, total: 1 });
      setResult(importResult);
      onComplete();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Excel içe aktarma başarısız.");
    } finally {
      setProcessing(false);
    }
  };

  if (!open) return null;

  const progressPct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        zIndex: 1100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
      onClick={handleClose}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 12,
          width: "100%",
          maxWidth: 640,
          maxHeight: "90vh",
          overflow: "auto",
          padding: 24,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ margin: 0 }}>Toplu Okul Ekle</h3>
          <button type="button" className="wizard-btn secondary" onClick={handleClose} disabled={processing}>
            Kapat
          </button>
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <button
            type="button"
            className={`wizard-btn ${tab === "excel" ? "primary" : "secondary"}`}
            onClick={() => setTab("excel")}
            disabled={processing}
          >
            Excel ile İçe Aktarma
          </button>
          <button
            type="button"
            className={`wizard-btn ${tab === "liste" ? "primary" : "secondary"}`}
            onClick={() => setTab("liste")}
            disabled={processing}
          >
            Hızlı Liste Girişi
          </button>
        </div>

        {tab === "excel" && (
          <div>
            <p style={{ fontSize: 13, color: "#6b7280", marginTop: 0 }}>
              Şablonu indirin, doldurun ve yükleyin. Yalnızca <strong>Okul Adı</strong> zorunludur.
            </p>
            <button type="button" className="wizard-btn secondary" onClick={handleDownloadTemplate} disabled={processing}>
              Excel Şablonunu İndir
            </button>
            <div style={{ marginTop: 16 }}>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xlsm"
                style={{ display: "none" }}
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
              <button
                type="button"
                className="wizard-btn secondary"
                onClick={() => fileInputRef.current?.click()}
                disabled={processing}
              >
                Dosya Seç
              </button>
              {file && <span style={{ marginLeft: 10, fontSize: 13 }}>{file.name}</span>}
            </div>
            <div style={{ marginTop: 16 }}>
              <button
                type="button"
                className="wizard-btn primary"
                onClick={runExcelImport}
                disabled={processing || !file}
              >
                {processing ? "İçe aktarılıyor…" : "Excel Yükle ve Ekle"}
              </button>
            </div>
          </div>
        )}

        {tab === "liste" && (
          <div>
            <p style={{ fontSize: 13, color: "#6b7280", marginTop: 0 }}>
              Her satıra bir okul adı yazın. Boş satırlar yok sayılır.
            </p>
            <textarea
              className="wizard-input"
              rows={12}
              placeholder={"Atatürk Anadolu Lisesi\nAnkara Fen Lisesi\nTED Ankara Koleji"}
              value={listeText}
              onChange={(e) => setListeText(e.target.value)}
              disabled={processing}
              style={{ width: "100%", resize: "vertical" }}
            />
            <div style={{ marginTop: 12 }}>
              <button
                type="button"
                className="wizard-btn primary"
                onClick={runListImport}
                disabled={processing}
              >
                {processing ? "Kaydediliyor…" : "Kaydet"}
              </button>
            </div>
          </div>
        )}

        {processing && (
          <div style={{ marginTop: 20 }}>
            <div style={{ fontSize: 13, marginBottom: 6 }}>
              İşleniyor… {progress.done} / {progress.total || "?"}
            </div>
            <div style={{ background: "#e5e7eb", borderRadius: 6, height: 8, overflow: "hidden" }}>
              <div
                style={{
                  width: `${progressPct}%`,
                  background: "#2563eb",
                  height: "100%",
                  transition: "width 0.2s",
                }}
              />
            </div>
          </div>
        )}

        {error && (
          <div style={{ marginTop: 16, padding: 10, background: "#fef2f2", color: "#b91c1c", borderRadius: 8, fontSize: 13 }}>
            {error}
          </div>
        )}

        {result && (
          <div style={{ marginTop: 20, padding: 14, background: "#f0fdf4", borderRadius: 8, fontSize: 13 }}>
            <strong>İşlem Özeti</strong>
            <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
              <li>Toplam satır: {result.toplam_satir}</li>
              <li>Başarıyla eklenen: {result.eklenen}</li>
              <li>Güncellenen: {result.guncellenen}</li>
              <li>Atlanan (zaten mevcut): {result.atlanan}</li>
              <li>Hatalı: {result.hatali}</li>
            </ul>
            {result.hatalar.length > 0 && (
              <div style={{ marginTop: 10 }}>
                <strong>Hatalar</strong>
                <ul style={{ margin: "6px 0 0", paddingLeft: 18, maxHeight: 160, overflowY: "auto" }}>
                  {result.hatalar.slice(0, 50).map((h, i) => (
                    <li key={i}>
                      Satır {h.satir}: {h.ad || "—"} — {h.neden}
                    </li>
                  ))}
                  {result.hatalar.length > 50 && <li>… ve {result.hatalar.length - 50} hata daha</li>}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
