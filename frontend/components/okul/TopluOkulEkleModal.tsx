"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
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

const inputClass =
  "box-border w-full rounded-lg border border-[#d5deea] bg-white px-3 py-2.5 text-sm font-[inherit] text-[#1e3352] outline-none transition-[border-color,box-shadow] placeholder:text-[#8b9bb0] focus:border-[#0061A6] focus:ring-2 focus:ring-[#0061A6]/15 disabled:cursor-not-allowed disabled:bg-[#f6f8fb]";

const btnPrimary =
  "inline-flex min-h-[40px] cursor-pointer items-center justify-center gap-2 rounded-lg border border-[#0061A6] bg-[#0061A6] px-3.5 text-sm font-[inherit] font-medium text-white transition-colors hover:border-[#004e86] hover:bg-[#004e86] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0061A6] disabled:cursor-not-allowed disabled:opacity-50";

const btnSecondary =
  "inline-flex min-h-[40px] cursor-pointer items-center justify-center gap-2 rounded-lg border border-[#d5deea] bg-white px-3.5 text-sm font-[inherit] font-medium text-[#1e3352] transition-colors hover:bg-[#f4f7fb] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0061A6] disabled:cursor-not-allowed disabled:opacity-50";

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

  const handleClose = useCallback(() => {
    if (processing) return;
    reset();
    onClose();
  }, [onClose, processing, reset]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, handleClose]);

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
      className="fixed inset-0 z-[2000] flex items-end justify-center bg-[#0f2744]/40 p-0 sm:items-center sm:p-4"
      onClick={handleClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="toplu-okul-title"
        className="flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:max-h-[min(90dvh,760px)] sm:max-w-2xl sm:rounded-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-[#e6ebf2] px-4 py-3.5 sm:px-5">
          <h2 id="toplu-okul-title" className="m-0 text-base font-semibold text-[#1e3352]">
            Toplu Okul Ekle
          </h2>
          <button
            type="button"
            className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border-0 bg-transparent text-[#5c6b80] hover:bg-[#f4f7fb] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0061A6] disabled:opacity-50"
            aria-label="Kapat"
            onClick={handleClose}
            disabled={processing}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          <div className="mb-4 grid grid-cols-2 gap-1 rounded-lg bg-[#f4f7fb] p-1" role="tablist" aria-label="Ekleme yöntemi">
            <button
              type="button"
              role="tab"
              aria-selected={tab === "excel"}
              className={`min-h-[40px] cursor-pointer rounded-md border-0 px-2 text-center text-[13px] font-[inherit] font-medium leading-tight transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0061A6] disabled:cursor-not-allowed disabled:opacity-50 ${
                tab === "excel" ? "bg-white text-[#0061A6] shadow-sm" : "bg-transparent text-[#5c6b80]"
              }`}
              onClick={() => setTab("excel")}
              disabled={processing}
            >
              Excel ile İçe Aktarma
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "liste"}
              className={`min-h-[40px] cursor-pointer rounded-md border-0 px-2 text-center text-[13px] font-[inherit] font-medium leading-tight transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0061A6] disabled:cursor-not-allowed disabled:opacity-50 ${
                tab === "liste" ? "bg-white text-[#0061A6] shadow-sm" : "bg-transparent text-[#5c6b80]"
              }`}
              onClick={() => setTab("liste")}
              disabled={processing}
            >
              Hızlı Liste Girişi
            </button>
          </div>

          {tab === "excel" && (
            <div>
              <p className="m-0 text-[13px] leading-relaxed text-[#5c6b80]">
                Şablonu indirin, doldurun ve yükleyin. Yalnızca <strong className="font-semibold text-[#31445c]">Okul Adı</strong> zorunludur.
              </p>
              <div className="mt-3 flex flex-col gap-2 min-[420px]:flex-row min-[420px]:flex-wrap min-[420px]:items-center">
                <button type="button" className={btnSecondary} onClick={handleDownloadTemplate} disabled={processing}>
                  Excel Şablonunu İndir
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xlsm"
                  className="sr-only"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                />
                <button
                  type="button"
                  className={btnSecondary}
                  onClick={() => fileInputRef.current?.click()}
                  disabled={processing}
                >
                  Dosya Seç
                </button>
                {file && <span className="min-w-0 break-all text-[13px] text-[#31445c]">{file.name}</span>}
              </div>
              <div className="mt-4">
                <button type="button" className={btnPrimary} onClick={runExcelImport} disabled={processing || !file}>
                  {processing ? "İçe aktarılıyor…" : "Excel Yükle ve Ekle"}
                </button>
              </div>
            </div>
          )}

          {tab === "liste" && (
            <div>
              <p className="m-0 text-[13px] leading-relaxed text-[#5c6b80]">
                Her satıra bir okul adı yazın. Boş satırlar yok sayılır.
              </p>
              <textarea
                className={`${inputClass} mt-3 min-h-[220px] resize-y`}
                rows={12}
                aria-label="Okul listesi"
                placeholder={"Atatürk Anadolu Lisesi\nAnkara Fen Lisesi\nTED Ankara Koleji"}
                value={listeText}
                onChange={(e) => setListeText(e.target.value)}
                disabled={processing}
              />
              <div className="mt-3">
                <button type="button" className={btnPrimary} onClick={runListImport} disabled={processing}>
                  {processing ? "Kaydediliyor…" : "Kaydet"}
                </button>
              </div>
            </div>
          )}

          {processing && (
            <div className="mt-5">
              <div className="mb-1.5 text-[13px] text-[#31445c]">
                İşleniyor… {progress.done} / {progress.total || "?"}
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-[#e6ebf2]" aria-hidden>
                <div className="h-full bg-[#0061A6] transition-[width] duration-200" style={{ width: `${progressPct}%` }} />
              </div>
            </div>
          )}

          {error && (
            <div role="alert" className="mt-4 rounded-lg border border-[#f3c7c3] bg-[#fef3f2] px-3 py-2.5 text-[13px] text-[#b42318]">
              {error}
            </div>
          )}

          {result && (
            <div className="mt-4 rounded-lg border border-[#cfe8d8] bg-[#f3faf6] px-3.5 py-3 text-[13px] text-[#1e3352]">
              <strong className="font-semibold">İşlem Özeti</strong>
              <ul className="m-0 mt-2 list-disc space-y-1 pl-4">
                <li>Toplam satır: {result.toplam_satir}</li>
                <li>Başarıyla eklenen: {result.eklenen}</li>
                <li>Güncellenen: {result.guncellenen}</li>
                <li>Atlanan (zaten mevcut): {result.atlanan}</li>
                <li>Hatalı: {result.hatali}</li>
              </ul>
              {result.hatalar.length > 0 && (
                <div className="mt-3">
                  <strong className="font-semibold">Hatalar</strong>
                  <ul className="m-0 mt-1.5 max-h-40 list-disc space-y-1 overflow-y-auto pl-4">
                    {result.hatalar.slice(0, 50).map((h, i) => (
                      <li key={i} className="break-words">
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
    </div>
  );
}
