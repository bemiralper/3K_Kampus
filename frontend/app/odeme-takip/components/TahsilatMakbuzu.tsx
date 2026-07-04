"use client";

import { useRef, useEffect, useState } from "react";
import { API_BASE } from "../helpers";
import { generateMakbuzPdf, type MakbuzPdfData } from "./makbuzPdfGenerator";

interface MakbuzData {
  makbuz_no: string;
  tahsilat_id: number;
  tahsilat_tarihi: string | null;
  kayit_tarihi: string | null;
  tutar: number;
  tahsilat_turu: string;
  referans_no: string;
  aciklama: string;
  durum: string;
  odeme_yontemi: string;
  kurum: {
    ad: string;
    adres: string;
    telefon: string;
    vergi_no: string;
    vergi_dairesi: string;
  } | null;
  sube: { ad: string } | null;
  ogrenci: { ad: string; soyad: string; ogrenci_no: string } | null;
  veli: { ad: string; soyad: string; tc_kimlik_no: string } | null;
  sozlesme: {
    sozlesme_no: string;
    paket_adi: string;
    net_tutar: number;
    toplam_odenen: number;
    kalan_borc: number;
  } | null;
  taksit: { taksit_no: number; vade_tarihi: string | null; tutar: number } | null;
  dagitim_detay: { taksit_no: number; tutar: number; vade_tarihi: string | null }[];
  taksitler: {
    taksit_no: number;
    vade_tarihi: string | null;
    tutar: number;
    odenen_tutar: number;
    kalan_tutar: number;
    durum: string;
  }[];
  tahsilat_gecmisi: {
    id: number;
    tahsilat_tarihi: string | null;
    tutar: number;
    taksit_no: number | null;
    odeme_yontemi: string;
    tahsilat_turu: string;
    referans_no: string;
  }[];
  islem_yapan: string;
}

const tahsilatTuruLabel: Record<string, string> = {
  normal: "Normal Tahsilat",
  mahsup: "Mahsup",
  iade: "İade",
  emanet: "Emanet",
};

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(d: string | null): string {
  if (!d) return "-";
  try {
    return new Date(d).toLocaleDateString("tr-TR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  } catch {
    return d;
  }
}

function tutarYazi(tutar: number): string {
  const tam = Math.round(tutar);
  const birler = [
    "", "Bir", "İki", "Üç", "Dört", "Beş", "Altı", "Yedi", "Sekiz", "Dokuz",
  ];
  const onlar = [
    "", "On", "Yirmi", "Otuz", "Kırk", "Elli", "Altmış", "Yetmiş", "Seksen", "Doksan",
  ];
  const buyukler = ["", "Bin", "Milyon", "Milyar"];

  if (tam === 0) return "Sıfır TL";

  function ucBasamak(n: number): string {
    if (n === 0) return "";
    let s = "";
    const yuzler = Math.floor(n / 100);
    const kalan = n % 100;
    const onlarH = Math.floor(kalan / 10);
    const birlerH = kalan % 10;
    if (yuzler > 0) s += (yuzler === 1 ? "" : birler[yuzler]) + "Yüz";
    if (onlarH > 0) s += onlar[onlarH];
    if (birlerH > 0) s += birler[birlerH];
    return s;
  }

  let sonuc = "";
  let kalan = tam;
  let seviye = 0;
  while (kalan > 0) {
    const uc = kalan % 1000;
    if (uc > 0) {
      const parcaStr = seviye === 1 && uc === 1 ? "" : ucBasamak(uc);
      sonuc = parcaStr + buyukler[seviye] + sonuc;
    }
    kalan = Math.floor(kalan / 1000);
    seviye++;
  }

  sonuc += " TL";
  return sonuc;
}

interface Props {
  tahsilatId: number;
  onClose?: () => void;
  printMode?: boolean;
  printToken?: string;
  onWhatsApp?: () => void;
}

export default function TahsilatMakbuzu({ tahsilatId, onClose, printMode, printToken, onWhatsApp }: Props) {
  const [data, setData] = useState<MakbuzData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [pdfBusy, setPdfBusy] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const headers: Record<string, string> = {};
        if (printToken) headers["X-Print-Token"] = printToken;
        const res = await fetch(`${API_BASE}/tahsilatlar/${tahsilatId}/makbuz/`, {
          credentials: "include",
          headers,
        });
        if (!res.ok) {
          const err = await res.json();
          setError(err.error || "Makbuz yüklenemedi");
          return;
        }
        setData(await res.json());
      } catch {
        setError("Bağlantı hatası");
      }
      setLoading(false);
    };
    load();
  }, [tahsilatId, printToken]);

  useEffect(() => {
    if (printMode && data && !loading && !error) {
      document.body.setAttribute("data-pdf-ready", "true");
    }
  }, [printMode, data, loading, error]);

  const handlePrint = () => {
    const el = contentRef.current;
    if (!el) return;
    setPdfBusy(true);

    const htmlContent = el.innerHTML;
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.left = "-9999px";
    iframe.style.top = "-9999px";
    iframe.style.width = "210mm";
    iframe.style.height = "297mm";
    document.body.appendChild(iframe);

    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) {
      setPdfBusy(false);
      return;
    }

    doc.open();
    doc.write(`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>Tahsilat Makbuzu</title>
<style>
  @page { size: A4 portrait; margin: 10mm 12mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
    font-size: 10px;
    line-height: 1.6;
    color: #334155;
  }
  img { max-width: 100%; }
  table { border-collapse: collapse; width: 100%; }
</style>
</head>
<body>${htmlContent}</body>
</html>`);
    doc.close();

    const images = doc.querySelectorAll("img");
    const imgPromises = Array.from(images).map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete) {
            resolve();
            return;
          }
          img.onload = () => resolve();
          img.onerror = () => resolve();
        }),
    );

    Promise.all(imgPromises).then(() => {
      setTimeout(() => {
        iframe.contentWindow?.print();
        setTimeout(() => {
          document.body.removeChild(iframe);
          setPdfBusy(false);
        }, 1000);
      }, 300);
    });
  };

  const handleDownload = async () => {
    if (!data) return;
    setPdfBusy(true);
    try {
      await generateMakbuzPdf(data as MakbuzPdfData, "download");
    } finally {
      setPdfBusy(false);
    }
  };

  if (loading) {
    if (printMode) {
      return <div style={{ padding: 24, fontFamily: "Poppins, sans-serif" }}>Makbuz yükleniyor…</div>;
    }
    return (
      <>
        <div
          onClick={onClose}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", zIndex: 2000 }}
        />
        <div
          style={{
            position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
            background: "#fff", borderRadius: 16, padding: 40, zIndex: 2001, textAlign: "center",
          }}
        >
          <p>Makbuz yükleniyor...</p>
        </div>
      </>
    );
  }

  if (error || !data) {
    if (printMode) {
      return (
        <div style={{ padding: 24, fontFamily: "Poppins, sans-serif", color: "#dc2626" }}>
          {error || "Bir hata oluştu"}
        </div>
      );
    }
    return (
      <>
        <div
          onClick={onClose}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", zIndex: 2000 }}
        />
        <div
          style={{
            position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
            background: "#fff", borderRadius: 16, padding: 40, zIndex: 2001, textAlign: "center",
          }}
        >
          <p style={{ color: "#dc2626" }}>{error || "Bir hata oluştu"}</p>
          <button onClick={onClose} style={{ marginTop: 16, padding: "8px 24px", cursor: "pointer" }}>
            Kapat
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      {!printMode && (
      <div
        onClick={onClose}
        className="makbuz-overlay"
        style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 2000,
        }}
      />
      )}

      <div
        className="makbuz-container"
        style={printMode ? { background: "#fff" } : {
          position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
          width: 680, maxHeight: "90vh", overflowY: "auto",
          background: "#fff", borderRadius: 16, boxShadow: "0 25px 80px rgba(0,0,0,.2)",
          zIndex: 2001,
        }}
      >
        {!printMode && (
        <div
          className="makbuz-toolbar"
          style={{
            padding: "12px 24px", borderBottom: "1px solid #e5e7eb",
            display: "flex", justifyContent: "space-between", alignItems: "center",
            background: "#f9fafb",
            borderTopLeftRadius: 16, borderTopRightRadius: 16,
          }}
        >
          <span style={{ fontSize: 14, color: "#6b7280" }}>Tahsilat Makbuzu Önizleme</span>
          <div style={{ display: "flex", gap: 8 }}>
            {onWhatsApp && (
              <button
                type="button"
                onClick={onWhatsApp}
                style={{
                  padding: "6px 16px", borderRadius: 8, border: "none",
                  background: "#25D366", color: "#fff", fontSize: 13, fontWeight: 600,
                  cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
                }}
              >
                WhatsApp
              </button>
            )}
            <button
              onClick={handlePrint}
              disabled={pdfBusy}
              style={{
                padding: "6px 20px", borderRadius: 8, border: "none",
                background: pdfBusy ? "#93c5fd" : "#2563eb", color: "#fff", fontSize: 13, fontWeight: 600,
                cursor: pdfBusy ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 6,
              }}
            >
              {pdfBusy ? "⏳ Hazırlanıyor..." : "🖨️ Yazdır"}
            </button>
            <button
              onClick={handleDownload}
              disabled={pdfBusy}
              style={{
                padding: "6px 16px", borderRadius: 8, border: "1px solid #2563eb",
                background: "#fff", color: "#2563eb", fontSize: 13, fontWeight: 600,
                cursor: pdfBusy ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 6,
              }}
            >
              ⬇️ İndir
            </button>
            <button
              onClick={onClose}
              style={{
                padding: "6px 16px", borderRadius: 8, border: "1px solid #d1d5db",
                background: "#fff", fontSize: 13, cursor: "pointer",
              }}
            >
              Kapat
            </button>
          </div>
        </div>
        )}

        {/* Makbuz İçerik — PDF'e dönüştürülecek alan */}
        <div ref={contentRef} className="makbuz-content" style={{ padding: "24px 32px", background: "#fff", fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif" }}>

          {/* ═══ HEADER — Kurum rengi ═══ */}
          <div style={{
            background: "#0262a7",
            borderRadius: 12, padding: "16px 28px", marginBottom: 16,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <img
                src="/img/beyaz-logo.png"
                alt="Logo"
                style={{ width: 56, height: "auto", objectFit: "contain", flexShrink: 0 }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <h1 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#fff", letterSpacing: 0.2 }}>
                  {data.kurum?.ad || "Kurum"}
                </h1>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 2, fontSize: 10, color: "rgba(255,255,255,.75)" }}>
                  {data.sube && <span>📍 {data.sube.ad}</span>}
                  {data.kurum?.adres && <span>{data.kurum.adres}</span>}
                  {data.kurum?.telefon && <span>📞 {data.kurum.telefon}</span>}
                </div>
              </div>
              {/* Makbuz No Badge */}
              <div style={{
                background: "rgba(255,255,255,.15)", borderRadius: 10, padding: "6px 14px",
                border: "1px solid rgba(255,255,255,.25)", textAlign: "center", flexShrink: 0,
              }}>
                <div style={{ fontSize: 8.5, color: "rgba(255,255,255,.7)", fontWeight: 600, textTransform: "uppercase", letterSpacing: 1 }}>Makbuz No</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", marginTop: 1 }}>{data.makbuz_no}</div>
              </div>
            </div>
          </div>

          {/* ═══ DOCUMENT TITLE BAR ═══ */}
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            marginBottom: 14, paddingBottom: 8,
            borderBottom: "2px solid #e2e8f0",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{
                width: 24, height: 24, borderRadius: 6,
                background: "linear-gradient(135deg, #0262a7, #0380d4)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 12, color: "#fff",
              }}>🧾</div>
              <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#1e293b" }}>
                Tahsilat Makbuzu
              </h2>
            </div>
            <div style={{
              background: "#f8fafc", borderRadius: 6, padding: "4px 10px",
              border: "1px solid #e2e8f0", fontSize: 11, color: "#64748b",
            }}>
              📅 {formatDate(data.tahsilat_tarihi)}
            </div>
          </div>

          {/* ═══ BİLGİ KARTLARI — 2 sütun grid ═══ */}
          <div style={{
            display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10,
            marginBottom: 14,
          }}>
            {/* Sol kart — Öğrenci & Veli */}
            <div style={{
              background: "#f8fafc", borderRadius: 10, padding: "10px 14px",
              border: "1px solid #e9ecf2",
            }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>
                Öğrenci / Veli Bilgileri
              </div>
              {data.ogrenci && (
                <div style={{ marginBottom: 4 }}>
                  <div style={{ fontSize: 9.5, color: "#94a3b8", marginBottom: 0 }}>Öğrenci</div>
                  <div style={{ fontSize: 11.5, color: "#1e293b", fontWeight: 600 }}>
                    {data.ogrenci.ad} {data.ogrenci.soyad}
                    {data.ogrenci.ogrenci_no && <span style={{ color: "#94a3b8", fontWeight: 400, marginLeft: 4, fontSize: 10 }}>({data.ogrenci.ogrenci_no})</span>}
                  </div>
                </div>
              )}
              {data.veli && (
                <div>
                  <div style={{ fontSize: 9.5, color: "#94a3b8", marginBottom: 0 }}>Veli</div>
                  <div style={{ fontSize: 11.5, color: "#1e293b", fontWeight: 600 }}>
                    {data.veli.ad} {data.veli.soyad}
                  </div>
                  {data.veli.tc_kimlik_no && <div style={{ fontSize: 10, color: "#64748b", marginTop: 0 }}>TC: {data.veli.tc_kimlik_no}</div>}
                </div>
              )}
            </div>

            {/* Sağ kart — Sözleşme & Ödeme */}
            <div style={{
              background: "#f8fafc", borderRadius: 10, padding: "10px 14px",
              border: "1px solid #e9ecf2",
            }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>
                Ödeme Detayları
              </div>
              {data.sozlesme && (
                <>
                  <div style={{ marginBottom: 3, display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 10, color: "#64748b" }}>Sözleşme No</span>
                    <span style={{ fontSize: 10.5, color: "#1e293b", fontWeight: 600 }}>{data.sozlesme.sozlesme_no}</span>
                  </div>
                  <div style={{ marginBottom: 3, display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 10, color: "#64748b" }}>Eğitim Paketi</span>
                    <span style={{ fontSize: 10.5, color: "#1e293b", fontWeight: 500 }}>{data.sozlesme.paket_adi}</span>
                  </div>
                </>
              )}
              <div style={{ marginBottom: 3, display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 10, color: "#64748b" }}>Ödeme Yöntemi</span>
                <span style={{ fontSize: 10.5, color: "#1e293b", fontWeight: 500 }}>{data.odeme_yontemi}</span>
              </div>
              {data.referans_no && (
                <div style={{ marginBottom: 3, display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 10, color: "#64748b" }}>Referans No</span>
                  <span style={{ fontSize: 10.5, color: "#1e293b", fontWeight: 500 }}>{data.referans_no}</span>
                </div>
              )}
              {data.dagitim_detay && data.dagitim_detay.length > 0 ? (
                <div style={{ marginBottom: 3 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                    <span style={{ fontSize: 10, color: "#64748b" }}>Dağıtım</span>
                    <span style={{ fontSize: 10.5, color: "#1e293b", fontWeight: 500 }}>
                      {data.dagitim_detay.length} taksit
                    </span>
                  </div>
                  {data.dagitim_detay.map((d, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", paddingLeft: 8, marginTop: 1 }}>
                      <span style={{ fontSize: 9.5, color: "#94a3b8" }}>
                        Taksit {d.taksit_no}{d.vade_tarihi && ` (${formatDate(d.vade_tarihi)})`}
                      </span>
                      <span style={{ fontSize: 9.5, color: "#059669", fontWeight: 600 }}>{formatCurrency(d.tutar)}</span>
                    </div>
                  ))}
                </div>
              ) : data.taksit ? (
                <div style={{ marginBottom: 3, display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 10, color: "#64748b" }}>Taksit</span>
                  <span style={{ fontSize: 10.5, color: "#1e293b", fontWeight: 500 }}>
                    {data.taksit.taksit_no}. Taksit
                    {data.taksit.vade_tarihi && <span style={{ color: "#94a3b8", fontSize: 9.5, marginLeft: 4 }}>({formatDate(data.taksit.vade_tarihi)})</span>}
                  </span>
                </div>
              ) : null}
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 10, color: "#64748b" }}>Tahsilat Türü</span>
                <span style={{ fontSize: 10.5, color: "#1e293b", fontWeight: 500 }}>{tahsilatTuruLabel[data.tahsilat_turu] || data.tahsilat_turu}</span>
              </div>
            </div>
          </div>

          {data.aciklama && (
            <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 6, padding: "5px 10px", marginBottom: 10, fontSize: 10.5, color: "#92400e" }}>
              <strong>Açıklama:</strong> {data.aciklama}
            </div>
          )}

          {/* ═══ TUTAR + Bakiye — yatay kompakt ═══ */}
          <div style={{
            display: "grid", gridTemplateColumns: data.sozlesme ? "1fr 1fr 1fr 1fr" : "1fr",
            gap: 8, marginBottom: 14,
          }}>
            {/* Tahsil Edilen Tutar */}
            <div style={{
              background: "linear-gradient(135deg, #ecfdf5, #f0fdf4)",
              borderRadius: 10, padding: "10px 14px",
              border: "1px solid #bbf7d0",
              textAlign: "center",
            }}>
              <div style={{ fontSize: 8.5, color: "#059669", fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", marginBottom: 2 }}>
                Tahsil Edilen
              </div>
              <div style={{ fontSize: 18, fontWeight: 800, color: "#047857", lineHeight: 1.2 }}>
                {formatCurrency(data.tutar)}
              </div>
              <div style={{ fontSize: 9, color: "#6b7280", marginTop: 2, fontStyle: "italic" }}>
                ({tutarYazi(data.tutar)})
              </div>
            </div>
            {/* Sözleşme Bakiye Özeti */}
            {data.sozlesme && (
              <>
                <div style={{
                  padding: "10px 12px", borderRadius: 10,
                  background: "linear-gradient(135deg, #f8fafc, #f1f5f9)",
                  border: "1px solid #e2e8f0", textAlign: "center",
                }}>
                  <div style={{ color: "#94a3b8", fontSize: 8.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 }}>Sözleşme</div>
                  <div style={{ fontWeight: 700, color: "#334155", fontSize: 13 }}>{formatCurrency(data.sozlesme.net_tutar)}</div>
                </div>
                <div style={{
                  padding: "10px 12px", borderRadius: 10,
                  background: "linear-gradient(135deg, #f0fdf4, #ecfdf5)",
                  border: "1px solid #bbf7d0", textAlign: "center",
                }}>
                  <div style={{ color: "#6ee7b7", fontSize: 8.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 }}>Ödenen</div>
                  <div style={{ fontWeight: 700, color: "#059669", fontSize: 13 }}>{formatCurrency(data.sozlesme.toplam_odenen)}</div>
                </div>
                <div style={{
                  padding: "10px 12px", borderRadius: 10,
                  background: data.sozlesme.kalan_borc > 0 ? "linear-gradient(135deg, #fef2f2, #fff1f2)" : "linear-gradient(135deg, #f0fdf4, #ecfdf5)",
                  border: `1px solid ${data.sozlesme.kalan_borc > 0 ? "#fecaca" : "#bbf7d0"}`, textAlign: "center",
                }}>
                  <div style={{ color: data.sozlesme.kalan_borc > 0 ? "#fca5a5" : "#6ee7b7", fontSize: 8.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 }}>Kalan</div>
                  <div style={{ fontWeight: 700, color: data.sozlesme.kalan_borc > 0 ? "#dc2626" : "#059669", fontSize: 13 }}>
                    {formatCurrency(data.sozlesme.kalan_borc)}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* ═══ Taksit Planı Tablosu ═══ */}
          {data.taksitler && data.taksitler.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                marginBottom: 6,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{
                    width: 20, height: 20, borderRadius: 5,
                    background: "linear-gradient(135deg, #0262a7, #0380d4)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 10, color: "#fff",
                  }}>📋</div>
                  <h3 style={{ margin: 0, fontSize: 11.5, fontWeight: 700, color: "#334155" }}>Taksit Planı</h3>
                </div>
                {data.taksitler.length > 6 && (
                  <span style={{
                    fontSize: 10, color: "#64748b", background: "#f1f5f9",
                    padding: "2px 8px", borderRadius: 6,
                  }}>{data.taksitler.length} taksit</span>
                )}
              </div>
              <div className="makbuz-taksit-scroll" data-pdf-expand style={{
                maxHeight: 210, overflowY: "auto",
                borderRadius: 8, border: "1px solid #e2e8f0",
                overflow: "hidden",
              }}>
                <div style={{ overflowY: data.taksitler.length > 6 ? "auto" : "visible", maxHeight: data.taksitler.length > 6 ? 210 : "none" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
                <thead>
                  <tr style={{ background: "linear-gradient(135deg, #e8edf5, #eef2ff)" }}>
                    <th style={thStyle}>No</th>
                    <th style={thStyle}>Vade Tarihi</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>Tutar</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>Ödenen</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>Kalan</th>
                    <th style={{ ...thStyle, textAlign: "center" }}>Durum</th>
                  </tr>
                </thead>
                <tbody>
                  {data.taksitler.map((t, i) => {
                    const isDagitim = data.dagitim_detay?.some(d => d.taksit_no === t.taksit_no);
                    const isCurrentTaksit = data.taksit && data.taksit.taksit_no === t.taksit_no;
                    return (
                    <tr
                      key={t.taksit_no}
                      style={{
                        background: isDagitim || isCurrentTaksit
                          ? "#eff6ff"
                          : i % 2 === 0 ? "#fff" : "#fafbfd",
                      }}
                    >
                      <td style={tdCellStyle}>
                        <span style={{
                          display: "inline-flex", alignItems: "center", justifyContent: "center",
                          width: 18, height: 18, borderRadius: 4,
                          background: "#f1f5f9", fontSize: 9, fontWeight: 700, color: "#475569",
                        }}>{t.taksit_no}</span>
                      </td>
                      <td style={tdCellStyle}>{formatDate(t.vade_tarihi)}</td>
                      <td style={{ ...tdCellStyle, textAlign: "right", fontWeight: 600 }}>{formatCurrency(t.tutar)}</td>
                      <td style={{ ...tdCellStyle, textAlign: "right", color: "#059669", fontWeight: 500 }}>{formatCurrency(t.odenen_tutar)}</td>
                      <td style={{ ...tdCellStyle, textAlign: "right", color: t.kalan_tutar > 0 ? "#dc2626" : "#059669", fontWeight: 500 }}>{formatCurrency(t.kalan_tutar)}</td>
                      <td style={{ ...tdCellStyle, textAlign: "center" }}>
                        <span style={{
                          padding: "3px 10px", borderRadius: 6, fontSize: 10, fontWeight: 600,
                          background: t.durum === "odendi" ? "#dcfce7" : t.durum === "kismi_odendi" ? "#fef9c3" : t.durum === "gecikmi" ? "#fee2e2" : "#f1f5f9",
                          color: t.durum === "odendi" ? "#166534" : t.durum === "kismi_odendi" ? "#854d0e" : t.durum === "gecikmi" ? "#991b1b" : "#475569",
                        }}>
                          {taksitDurumLabel[t.durum] || t.durum}
                        </span>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
                </div>
              </div>
            </div>
          )}

          {/* ═══ Tahsilat Geçmişi Tablosu ═══ */}
          {data.tahsilat_gecmisi && data.tahsilat_gecmisi.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                marginBottom: 6,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{
                    width: 20, height: 20, borderRadius: 5,
                    background: "linear-gradient(135deg, #10b981, #059669)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 10, color: "#fff",
                  }}>📜</div>
                  <h3 style={{ margin: 0, fontSize: 11.5, fontWeight: 700, color: "#334155" }}>Tahsilat Geçmişi</h3>
                </div>
                {data.tahsilat_gecmisi.length > 5 && (
                  <span style={{
                    fontSize: 10, color: "#64748b", background: "#f1f5f9",
                    padding: "2px 8px", borderRadius: 6,
                  }}>{data.tahsilat_gecmisi.length} kayıt</span>
                )}
              </div>
              <div className="makbuz-gecmis-scroll" data-pdf-expand style={{
                maxHeight: 180, overflowY: "auto",
                borderRadius: 8, border: "1px solid #e2e8f0",
                overflow: "hidden",
              }}>
                <div style={{ overflowY: data.tahsilat_gecmisi.length > 5 ? "auto" : "visible", maxHeight: data.tahsilat_gecmisi.length > 5 ? 180 : "none" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
                <thead>
                  <tr style={{ background: "linear-gradient(135deg, #ecfdf5, #f0fdf4)" }}>
                    <th style={thStyle}>Tarih</th>
                    <th style={thStyle}>Taksit</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>Tutar</th>
                    <th style={thStyle}>Ödeme Yöntemi</th>
                    <th style={thStyle}>Tür</th>
                    <th style={thStyle}>Referans</th>
                  </tr>
                </thead>
                <tbody>
                  {data.tahsilat_gecmisi.map((tg, i) => (
                    <tr
                      key={tg.id}
                      style={{
                        background: tg.id === data.tahsilat_id
                          ? "#eff6ff"
                          : i % 2 === 0 ? "#fff" : "#fafbfd",
                        fontWeight: tg.id === data.tahsilat_id ? 700 : 400,
                      }}
                    >
                      <td style={tdCellStyle}>{formatDate(tg.tahsilat_tarihi)}</td>
                      <td style={tdCellStyle}>{tg.taksit_no ? `${tg.taksit_no}. Taksit` : "-"}</td>
                      <td style={{ ...tdCellStyle, textAlign: "right", fontWeight: 600 }}>{formatCurrency(tg.tutar)}</td>
                      <td style={tdCellStyle}>{tg.odeme_yontemi}</td>
                      <td style={tdCellStyle}>{tahsilatTuruLabel[tg.tahsilat_turu] || tg.tahsilat_turu}</td>
                      <td style={{ ...tdCellStyle, color: "#94a3b8" }}>{tg.referans_no || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
                </div>
              </div>
            </div>
          )}

          {/* ═══ Vergi Bilgisi ═══ */}
          {data.kurum?.vergi_no && (
            <div style={{
              fontSize: 9.5, color: "#64748b", marginBottom: 10,
              background: "#f8fafc", borderRadius: 6, padding: "4px 10px",
              border: "1px solid #e2e8f0", display: "inline-block",
            }}>
              🏢 V.D.: {data.kurum.vergi_dairesi} &nbsp;|&nbsp; V.N.: {data.kurum.vergi_no}
            </div>
          )}

          {/* ═══ İmza Alanları ═══ */}
          <div style={{
            display: "flex", justifyContent: "space-between", marginTop: 24,
            paddingTop: 0,
          }}>
            <div style={{ textAlign: "center", width: "40%" }}>
              <div style={{
                borderBottom: "2px solid #e2e8f0", height: 36, marginBottom: 4,
                borderRadius: "0 0 4px 4px",
              }} />
              <div style={{ fontSize: 10.5, color: "#334155", fontWeight: 700 }}>Tahsil Eden</div>
              <div style={{ fontSize: 10, color: "#1e293b", fontWeight: 600, marginTop: 2 }}>{data.islem_yapan}</div>
            </div>
            <div style={{ textAlign: "center", width: "40%" }}>
              <div style={{
                borderBottom: "2px solid #e2e8f0", height: 36, marginBottom: 4,
                borderRadius: "0 0 4px 4px",
              }} />
              <div style={{ fontSize: 10.5, color: "#334155", fontWeight: 700 }}>Ödeme Yapan</div>
              <div style={{ fontSize: 9.5, color: "#94a3b8", marginTop: 1 }}>Veli / Öğrenci</div>
            </div>
          </div>

          {/* ═══ Footer ═══ */}
          <div style={{
            marginTop: 16, paddingTop: 8,
            borderTop: "1px solid #f1f5f9",
            textAlign: "center", fontSize: 9, color: "#94a3b8",
            display: "flex", justifyContent: "center", alignItems: "center", gap: 4,
          }}>
            <span>🔒</span>
            <span>Bu makbuz {formatDate(data.kayit_tarihi)} tarihinde elektronik ortamda oluşturulmuştur.</span>
          </div>
        </div>
      </div>


    </>
  );
}

/* ─── Tablo hücre stilleri ─── */
const thStyle: React.CSSProperties = {
  padding: "5px 8px",
  fontWeight: 700,
  color: "#475569",
  borderBottom: "2px solid #e2e8f0",
  textAlign: "left",
  fontSize: 9.5,
  textTransform: "uppercase",
  letterSpacing: 0.5,
};

const tdCellStyle: React.CSSProperties = {
  padding: "4px 8px",
  borderBottom: "1px solid #f1f5f9",
  color: "#334155",
  fontSize: 10,
};

const taksitDurumLabel: Record<string, string> = {
  beklemede: "Beklemede",
  kismi_odendi: "Kısmi Ödendi",
  odendi: "Ödendi",
  gecikmi: "Gecikmiş",
  iptal: "İptal",
};
