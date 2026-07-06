"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { API_BASE } from "../helpers";
import { notlarForPdf, parseNotlarJson } from "@/lib/sozlesme-notlar";

/* ── Kurum ana rengi ── */
const KURUM_COLOR = "#0262a7";
const KURUM_LIGHT = "#0380d4";

/** Sözleşmede kullanılan resmî kurum unvanı */
const KURUM_UNVAN = "Özel 3K Kampüs Özel Öğretim Kursu";

/* ═══════════════════════════════════════════════════
   Interfaces
   ═══════════════════════════════════════════════════ */

interface TaksitItem {
  id: number;
  taksit_no: number;
  vade_tarihi: string | null;
  tutar: number;
  odenen_tutar: number;
  kalan_tutar: number;
  durum: string;
}

interface KalemItem {
  id: number;
  kalem_turu: string;
  kalem_adi: string;
  brut_tutar: number;
  kdv_orani: number;
  kdv_tutari: number;
  kdv_dahil_tutar: number;
  indirim_orani: number;
  indirim_tutari: number;
  net_tutar: number;
}

interface SozlesmeData {
  id: number;
  sozlesme_no: string;
  ogrenci_adi: string;
  ogrenci_tc_kimlik_no: string;
  ogrenci_telefon: string;
  ogrenci_adres: string;
  veli_adi: string;
  veli_tc_kimlik_no: string;
  veli_telefon: string;
  veli_turu: string;
  paket_adi: string;
  paket_turu: string;
  brut_tutar: number;
  kdv_orani: number;
  kdv_tutari: number;
  kdv_dahil_tutar: number;
  toplam_indirim_tutari: number;
  net_tutar: number;
  odeme_turu: string;
  taksit_sayisi: number;
  taksit_periyodu: string;
  baslangic_tarihi: string | null;
  bitis_tarihi: string | null;
  egitim_yili_adi?: string | null;
  ilk_odeme_tarihi: string | null;
  durum: string;
  notlar: string;
  notlar_json?: { id: string; text: string; veli_ile_paylas: boolean }[];
  kurum?: {
    ad: string;
    adres: string;
    telefon_sabit: string;
    vergi_no: string;
    vergi_dairesi: string;
  };
  sube?: { ad: string };
  kalemler: KalemItem[];
  taksitler: TaksitItem[];
}

/* ═══════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════ */

function formatCurrency(amount: number): string {
  const value = Number(amount);
  if (!Number.isFinite(value)) return "₺0";
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
    return new Date(d).toLocaleDateString("tr-TR", { day: "2-digit", month: "long", year: "numeric" });
  } catch {
    return d;
  }
}

function formatDateShort(d: string | null): string {
  if (!d) return "-";
  try {
    return new Date(d).toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch {
    return d;
  }
}

/** "2026 - 2027" → "2026-2027" */
function egitimYiliKisa(egitimYili: string): string {
  return egitimYili.replace(/\s+/g, "");
}

function tutarYazi(tutar: number): string {
  const value = Number(tutar);
  if (!Number.isFinite(value)) return "sıfır TL";
  const birler = ["", "bir", "iki", "üç", "dört", "beş", "altı", "yedi", "sekiz", "dokuz"];
  const onlar = ["", "on", "yirmi", "otuz", "kırk", "elli", "altmış", "yetmiş", "seksen", "doksan"];
  const buyukler = ["", "bin", "milyon", "milyar"];

  if (value === 0) return "sıfır TL";
  const tam = Math.round(value);

  function ucHane(n: number): string {
    if (n === 0) return "";
    let s = "";
    const y = Math.floor(n / 100);
    const o = Math.floor((n % 100) / 10);
    const b = n % 10;
    if (y > 0) s += (y === 1 ? "" : birler[y]) + "yüz";
    if (o > 0) s += onlar[o];
    if (b > 0) s += birler[b];
    return s;
  }

  let sonuc = "";
  let grup = 0;
  let kalan = tam;
  while (kalan > 0) {
    const parcali = kalan % 1000;
    if (parcali > 0) {
      const prefix = grup === 1 && parcali === 1 ? "" : ucHane(parcali);
      sonuc = prefix + buyukler[grup] + sonuc;
    }
    kalan = Math.floor(kalan / 1000);
    grup++;
  }

  let text = sonuc.charAt(0).toUpperCase() + sonuc.slice(1) + " TL";
  return text;
}

const odemeTuruLabel: Record<string, string> = {
  pesin: "Peşin",
  taksitli: "Taksitli",
  cek_senet: "Çek / Senet",
  karma: "Karma",
};

const taksitPeriyoduLabel: Record<string, string> = {
  aylik: "Aylık",
  iki_aylik: "2 Aylık",
  uc_aylik: "3 Aylık",
};

/* ═══════════════════════════════════════════════════
   Stil Sabitleri
   ═══════════════════════════════════════════════════ */

const articleBodyStyle: React.CSSProperties = {
  background: "#f8fafc",
  borderRadius: 8,
  padding: "10px 14px",
  border: "1px solid #e9ecf2",
  fontSize: 9.5,
  lineHeight: 1.7,
  color: "#475569",
};

const pStyle: React.CSSProperties = {
  margin: "0 0 4px",
  fontSize: 9.5,
  lineHeight: 1.7,
};

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

const tdStyle: React.CSSProperties = {
  padding: "4px 8px",
  borderBottom: "1px solid #f1f5f9",
  color: "#334155",
  fontSize: 10,
};

/* ═══════════════════════════════════════════════════
   Props
   ═══════════════════════════════════════════════════ */

interface Props {
  sozlesmeId: number;
  onClose?: () => void;
  /** modal: ödeme takip üzerinde overlay; page: doğrudan önizleme sayfası */
  variant?: "modal" | "page";
  printMode?: boolean;
  printToken?: string;
  onWhatsApp?: () => void;
}

/* ═══════════════════════════════════════════════════
   Component
   ═══════════════════════════════════════════════════ */

export default function SozlesmeBelgesi({
  sozlesmeId,
  onClose,
  variant = "modal",
  printMode,
  printToken,
  onWhatsApp,
}: Props) {
  const isPage = variant === "page" || printMode;
  const shellStyle: React.CSSProperties = printMode
    ? { background: "#fff" }
    : isPage
    ? {
        minHeight: "100vh",
        background: "#f1f5f9",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        overflowY: "auto",
        padding: "20px 0",
      }
    : {
        position: "fixed",
        inset: 0,
        zIndex: 2000,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        background: "rgba(0,0,0,.55)",
        overflowY: "auto",
        padding: "20px 0",
      };
  const [data, setData] = useState<SozlesmeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);

  const contentRef = useRef<HTMLDivElement>(null);

  /**
   * Vektörel PDF — iframe + window.print() yaklaşımı.
   * Tarayıcının kendi render motoru kullanılır, metin seçilebilir,
   * SVG/font'lar vektörel kalır, bulanıklık olmaz.
   */
  const printVectorial = useCallback((download = false) => {
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
    if (!doc) { setPdfBusy(false); return; }

    doc.open();
    doc.write(`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>Sözleşme</title>
<style>
  @page {
    size: A4 portrait;
    margin: 10mm 12mm;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
    color-adjust: exact !important;
    font-size: 10px;
    line-height: 1.6;
    color: #334155;
  }
  img { max-width: 100%; }
  table { border-collapse: collapse; width: 100%; }
  @media print {
    body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  }
</style>
</head>
<body>${htmlContent}</body>
</html>`);
    doc.close();

    // İmajların yüklenmesini bekle
    const images = doc.querySelectorAll("img");
    const imgPromises = Array.from(images).map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete) { resolve(); return; }
          img.onload = () => resolve();
          img.onerror = () => resolve();
        })
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
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        const headers: Record<string, string> = {};
        if (printToken) headers["X-Print-Token"] = printToken;
        const res = await fetch(`${API_BASE}/sozlesmeler/${sozlesmeId}/`, {
          credentials: "include",
          headers,
        });
        if (!res.ok) {
          let detail = "";
          try {
            const errBody = await res.json();
            detail = errBody?.error || errBody?.detail || "";
          } catch {
            /* yanıt JSON değil */
          }
          setError(detail ? `Sözleşme yüklenemedi: ${detail}` : `Sözleşme verisi yüklenemedi (${res.status})`);
          setLoading(false);
          return;
        }
        const json = await res.json();
        if (json?.error) {
          setError(String(json.error));
          setLoading(false);
          return;
        }
        setData(json);
      } catch {
        setError("Bağlantı hatası");
      }
      setLoading(false);
    };
    load();
  }, [sozlesmeId, printToken]);

  useEffect(() => {
    if (printMode && data && !loading && !error) {
      document.body.setAttribute("data-pdf-ready", "true");
    }
  }, [printMode, data, loading, error]);

  const handlePrint = useCallback(() => {
    printVectorial(false);
  }, [printVectorial]);

  const handleDownload = useCallback(() => {
    printVectorial(true);
  }, [printVectorial]);

  // Escape key
  useEffect(() => {
    if (printMode || !onClose) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose, printMode]);

  if (loading) {
    if (printMode) {
      return <div style={{ padding: 24, fontFamily: "Poppins, sans-serif" }}>Sözleşme yükleniyor…</div>;
    }
    return (
      <div style={shellStyle}>
        <div style={{ background: "#fff", borderRadius: 16, padding: 40, textAlign: "center", boxShadow: isPage ? "0 4px 24px rgba(0,0,0,.08)" : undefined }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
          Sözleşme yükleniyor...
        </div>
      </div>
    );
  }

  if (error || !data) {
    if (printMode) {
      return (
        <div style={{ padding: 24, fontFamily: "Poppins, sans-serif", color: "#dc2626" }}>
          {error || "Veri bulunamadı"}
        </div>
      );
    }
    return (
      <div style={shellStyle}>
        <div style={{ background: "#fff", borderRadius: 16, padding: 40, textAlign: "center", boxShadow: isPage ? "0 4px 24px rgba(0,0,0,.08)" : undefined }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>❌</div>
          <p>{error || "Veri bulunamadı"}</p>
          <button onClick={onClose} style={{ marginTop: 12, padding: "8px 20px", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", cursor: "pointer" }}>Kapat</button>
        </div>
      </div>
    );
  }

  const taksitler = data.taksitler || [];
  const kalemler = data.kalemler || [];
  const bugununTarihi = formatDate(new Date().toISOString());
  const pdfNotlar = notlarForPdf(parseNotlarJson(data.notlar_json, data.notlar));

  // Eğitim yılı: API'den veya başlangıç tarihinden
  const baslangicYil = data.baslangic_tarihi ? new Date(data.baslangic_tarihi).getFullYear() : new Date().getFullYear();
  const egitimYili = data.egitim_yili_adi?.trim() || `${baslangicYil} - ${baslangicYil + 1}`;
  const egitimYiliMetin = egitimYiliKisa(egitimYili);

  return (
    <div style={shellStyle}>
      <div style={{ background: "#fff", borderRadius: 16, maxWidth: 860, width: "100%", boxShadow: "0 20px 60px rgba(0,0,0,.3)", marginBottom: 40 }}>

        {/* ── Toolbar ── */}
        {!printMode && (
        <div style={{
          padding: "12px 24px", borderBottom: "1px solid #e5e7eb",
          display: "flex", justifyContent: "space-between", alignItems: "center",
          background: "#f9fafb", borderTopLeftRadius: 16, borderTopRightRadius: 16,
        }}>
          <span style={{ fontSize: 14, color: "#6b7280" }}>📝 Sözleşme Belgesi Önizleme</span>
          <div style={{ display: "flex", gap: 8 }}>
            {onWhatsApp && (
              <button type="button" onClick={onWhatsApp} style={{
                padding: "6px 16px", borderRadius: 8, border: "none",
                background: "#25D366", color: "#fff", fontSize: 13, fontWeight: 600,
                cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
              }}>
                WhatsApp
              </button>
            )}
            <button onClick={handlePrint} disabled={pdfBusy} style={{
              padding: "6px 20px", borderRadius: 8, border: "none",
              background: pdfBusy ? "#93c5fd" : "#2563eb", color: "#fff", fontSize: 13, fontWeight: 600,
              cursor: pdfBusy ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 6,
            }}>
              {pdfBusy ? "⏳ Hazırlanıyor..." : "🖨️ Yazdır"}
            </button>
            <button onClick={handleDownload} disabled={pdfBusy} style={{
              padding: "6px 16px", borderRadius: 8, border: "1px solid #2563eb",
              background: "#fff", color: "#2563eb", fontSize: 13, fontWeight: 600,
              cursor: pdfBusy ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 6,
            }}>
              ⬇️ İndir
            </button>
            <button onClick={onClose} style={{
              padding: "6px 14px", borderRadius: 8, border: "1px solid #e5e7eb",
              background: "#fff", color: "#9ca3af", fontSize: 16, cursor: "pointer",
            }}>✕</button>
          </div>
        </div>
        )}

        {/* ═══════════════════════════════════════════════════
           İÇERİK — PDF'e dönüştürülecek alan
           ═══════════════════════════════════════════════════ */}
        <div ref={contentRef} style={{ padding: "28px 36px", background: "#fff", fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif" }}>

          {/* ═══ HEADER — Kurum banneri ═══ */}
          <div style={{
            background: KURUM_COLOR,
            borderRadius: 12, padding: "18px 30px", marginBottom: 18,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <img
                src="/img/beyaz-logo.png"
                alt="Logo"
                style={{ width: 60, height: "auto", objectFit: "contain", flexShrink: 0 }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#fff", letterSpacing: 0.3 }}>
                  {KURUM_UNVAN}
                </h1>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 3, fontSize: 10.5, color: "rgba(255,255,255,.75)" }}>
                  {data.sube && <span>📍 {data.sube.ad}</span>}
                  {data.kurum?.adres && <span>{data.kurum.adres}</span>}
                  {data.kurum?.telefon_sabit && <span>📞 {data.kurum.telefon_sabit}</span>}
                </div>
              </div>
              <div style={{
                background: "rgba(255,255,255,.15)", borderRadius: 10, padding: "8px 16px",
                border: "1px solid rgba(255,255,255,.25)", textAlign: "center", flexShrink: 0,
              }}>
                <div style={{ fontSize: 8.5, color: "rgba(255,255,255,.7)", fontWeight: 600, textTransform: "uppercase", letterSpacing: 1 }}>Sözleşme No</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", marginTop: 2 }}>{data.sozlesme_no}</div>
              </div>
            </div>
          </div>

          {/* ═══ BELGE BAŞLIĞI ═══ */}
          <div style={{
            textAlign: "center", marginBottom: 18,
            paddingBottom: 10, borderBottom: `2px solid ${KURUM_COLOR}`,
          }}>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: KURUM_COLOR, letterSpacing: 1, textTransform: "uppercase" }}>
              EĞİTİM HİZMETİ SÖZLEŞMESİ
            </h2>
            <div style={{ fontSize: 10, color: "#64748b", marginTop: 4 }}>
              Düzenleme Tarihi: {bugununTarihi}
            </div>
          </div>

          {/* ═══ TARAFLAR ═══ */}
          <div style={{ marginBottom: 16 }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 6, marginBottom: 8,
            }}>
              <div style={{
                width: 22, height: 22, borderRadius: 5,
                background: `linear-gradient(135deg, ${KURUM_COLOR}, ${KURUM_LIGHT})`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 11, color: "#fff",
              }}>📋</div>
              <h3 style={{ margin: 0, fontSize: 12, fontWeight: 700, color: "#334155", textTransform: "uppercase", letterSpacing: 0.5 }}>Taraflar</h3>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
              <div style={{
                background: "#f8fafc", borderRadius: 10, padding: "10px 14px",
                border: "1px solid #e9ecf2",
              }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>
                  Hizmeti Veren (Kurum)
                </div>
                <InfoRow label="Kurum Unvanı" value={KURUM_UNVAN} />
                <InfoRow label="Şube" value={data.sube?.ad || "-"} />
                {data.kurum?.adres && <InfoRow label="Adres" value={data.kurum.adres} />}
                {data.kurum?.telefon_sabit && <InfoRow label="Telefon" value={data.kurum.telefon_sabit} />}
              </div>

              <div style={{
                background: "#f8fafc", borderRadius: 10, padding: "10px 14px",
                border: "1px solid #e9ecf2",
              }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>
                  Hizmeti Alan (Veli / Vasi)
                </div>
                <InfoRow label="Adı Soyadı" value={data.veli_adi || "-"} />
                {data.veli_tc_kimlik_no && <InfoRow label="T.C. Kimlik No" value={data.veli_tc_kimlik_no} />}
                {data.veli_telefon && <InfoRow label="Telefon" value={data.veli_telefon} />}
                {data.ogrenci_adres && <InfoRow label="Adres" value={data.ogrenci_adres} />}
              </div>

              <div style={{
                background: "#f8fafc", borderRadius: 10, padding: "10px 14px",
                border: "1px solid #e9ecf2",
              }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>
                  Kursiyer
                </div>
                <InfoRow label="Adı Soyadı" value={data.ogrenci_adi} />
                {data.ogrenci_tc_kimlik_no && <InfoRow label="T.C. Kimlik No" value={data.ogrenci_tc_kimlik_no} />}
                <InfoRow label="Program" value={data.paket_adi} />
              </div>
            </div>
          </div>

          {/* ═══ GİRİŞ PARAGRAFI ═══ */}
          <div style={{ marginBottom: 14 }}>
            <div style={articleBodyStyle}>
              <p style={pStyle}>
                İşbu sözleşme, yukarıda bilgileri bulunan Kurum ile Kursiyer adına hareket eden Veli/Vasi arasında,
                kursiyerin kurum tarafından sunulan eğitim hizmetlerinden yararlanmasına ilişkin hak ve yükümlülüklerin
                belirlenmesi amacıyla düzenlenmiştir.
              </p>
            </div>
          </div>

          {/* ═══════════════════════════════════════════════
             ANA SÖZLEŞME MADDELERİ (1–15)
             ═══════════════════════════════════════════════ */}

          <div style={{ marginBottom: 10 }}>
            <SectionTitle icon="📝" title="Madde 1 – Sözleşmenin Konusu" />
            <div style={articleBodyStyle}>
              <p style={pStyle}>
                İşbu sözleşmenin konusu, kursiyerin kayıtlı olduğu eğitim programı kapsamında kurum tarafından sunulan
                eğitim hizmetlerinden yararlanması ile tarafların hak ve yükümlülüklerinin düzenlenmesidir.
              </p>
            </div>
          </div>

          <div style={{ marginBottom: 10 }}>
            <SectionTitle icon="📅" title="Madde 2 – Eğitim Süresi" />
            <div style={articleBodyStyle}>
              <p style={pStyle}>
                Eğitim hizmeti, kurum tarafından ilan edilen eğitim takvimi doğrultusunda yürütülür.
              </p>
              <p style={pStyle}>
                Sözleşme yalnızca ilgili eğitim-öğretim yılı ({egitimYiliMetin}) için geçerlidir. Sonraki dönemlerde kayıt yenileme işlemleri ayrıca yapılır.
              </p>
            </div>
          </div>

          <div style={{ marginBottom: 10 }}>
            <SectionTitle icon="📖" title="Madde 3 – Eğitim Hizmetinin Kapsamı" />
            <div style={articleBodyStyle}>
              <p style={pStyle}>Kurum, yürürlükteki mevzuata uygun şekilde eğitim faaliyetlerini yürütmeyi kabul eder.</p>
              <p style={pStyle}>
                Eğitim hizmetleri dersler, deneme sınavları, rehberlik çalışmaları, etütler, seminerler, akademik takip çalışmaları
                ve kurum tarafından duyurulan diğer eğitim faaliyetlerinden oluşabilir.
              </p>
              <p style={pStyle}>
                Kurum, eğitim faaliyetlerinin verimli yürütülebilmesi amacıyla sınıf, grup, öğretmen, derslik ve program düzenlemelerinde değişiklik yapabilir.
              </p>
            </div>
          </div>

          <div style={{ marginBottom: 10 }}>
            <SectionTitle icon="💰" title="Madde 4 – Eğitim Ücreti ve Ödeme Koşulları" />
            <div style={articleBodyStyle}>
              <p style={pStyle}>
                <strong>Toplam Eğitim Bedeli:</strong> {formatCurrency(data.net_tutar)} ({tutarYazi(data.net_tutar)})
              </p>
              <p style={pStyle}>
                <strong>Ödeme Şekli:</strong> {odemeTuruLabel[data.odeme_turu] || data.odeme_turu}
              </p>
              {(data.odeme_turu === "taksitli" || data.odeme_turu === "cek_senet" || data.odeme_turu === "karma") ? (
                <p style={pStyle}>
                  <strong>Taksit Sayısı:</strong> {data.taksit_sayisi} ({taksitPeriyoduLabel[data.taksit_periyodu] || data.taksit_periyodu})
                </p>
              ) : (
                <p style={pStyle}>
                  <strong>Taksit Sayısı:</strong> Peşin ödeme
                </p>
              )}
              <p style={pStyle}>EK-1 Ödeme Planı işbu sözleşmenin ayrılmaz eki niteliğindedir.</p>
              <p style={pStyle}>
                Taksitlendirme uygulaması, veli/vasiye ödeme kolaylığı sağlamak amacıyla yapılmış olup eğitim programının bölümlere ayrıldığı anlamına gelmez.
                Kayıt iptali, ayrılma ve ücret iadesi işlemlerinde ilgili mevzuat ve işbu sözleşme hükümleri esas alınır.
              </p>
              <p style={pStyle}>Eğitim ücretinin zamanında ödenmesi veli/vasinin sorumluluğundadır.</p>
            </div>

            {data.toplam_indirim_tutari > 0 && (
              <div style={{ ...articleBodyStyle, marginTop: 6, background: "#fefce8", border: "1px solid #fde68a" }}>
                <p style={{ ...pStyle, fontWeight: 600, color: "#92400e", marginBottom: 2 }}>Uygulanan İndirim:</p>
                <p style={{ ...pStyle, color: "#92400e" }}>Tutarı: {formatCurrency(data.toplam_indirim_tutari)}</p>
              </div>
            )}

            {kalemler.length > 0 && (
              <div style={{ borderRadius: 8, border: "1px solid #e2e8f0", overflow: "hidden", marginTop: 8 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
                  <thead>
                    <tr style={{ background: "linear-gradient(135deg, #e8edf5, #eef2ff)" }}>
                      <th style={thStyle}>Hizmet / Kalem</th>
                      <th style={{ ...thStyle, textAlign: "right" }}>Brüt Tutar</th>
                      <th style={{ ...thStyle, textAlign: "right" }}>İndirim</th>
                      <th style={{ ...thStyle, textAlign: "right" }}>Net Tutar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {kalemler.map((k, i) => (
                      <tr key={k.id} style={{ background: i % 2 === 1 ? "#fafbfc" : "#fff" }}>
                        <td style={tdStyle}>{k.kalem_adi}</td>
                        <td style={{ ...tdStyle, textAlign: "right" }}>{formatCurrency(k.brut_tutar)}</td>
                        <td style={{ ...tdStyle, textAlign: "right", color: k.indirim_tutari > 0 ? "#dc2626" : "#94a3b8" }}>
                          {k.indirim_tutari > 0 ? `-${formatCurrency(k.indirim_tutari)}` : "-"}
                        </td>
                        <td style={{ ...tdStyle, textAlign: "right", fontWeight: 600 }}>{formatCurrency(k.net_tutar)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: "linear-gradient(135deg, #f0f4f8, #e8edf5)", fontWeight: 700 }}>
                      <td style={{ ...tdStyle, fontWeight: 700, fontSize: 10.5 }}>TOPLAM</td>
                      <td style={{ ...tdStyle, textAlign: "right", fontWeight: 700 }}>{formatCurrency(data.brut_tutar)}</td>
                      <td style={{ ...tdStyle, textAlign: "right", fontWeight: 700, color: "#dc2626" }}>
                        {data.toplam_indirim_tutari > 0 ? `-${formatCurrency(data.toplam_indirim_tutari)}` : "-"}
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right", fontWeight: 800, fontSize: 11.5, color: KURUM_COLOR }}>
                        {formatCurrency(data.net_tutar)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          <div style={{ marginBottom: 10 }} data-pdf-expand>
            <SectionTitle icon="⚠️" title="Madde 5 – Temerrüt" />
            <div style={{ ...articleBodyStyle, borderLeft: "3px solid #dc2626" }}>
              <p style={pStyle}>Taksitlerden herhangi birinin vadesinde ödenmemesi halinde veli/vasi temerrüde düşmüş sayılır.</p>
              <p style={pStyle}>Kurum, geciken ödemeler için yürürlükteki mevzuat kapsamında yasal işlem başlatabilir.</p>
              <p style={pStyle}>Ödenmeyen taksitler nedeniyle doğabilecek tüm masraflar yasal sınırlar içerisinde borçluya aittir.</p>
            </div>
          </div>

          <div style={{ marginBottom: 10 }}>
            <SectionTitle icon="↩️" title="Madde 6 – Cayma Hakkı ve Ücret İadesi" />
            <div style={articleBodyStyle}>
              <p style={pStyle}>Sözleşmenin imzalanmasından itibaren yasal mevzuatta öngörülen süre içerisinde cayma hakkı kullanılabilir.</p>
              <p style={pStyle}>Kayıt iptali, ayrılma ve ücret iadelerinde MEB Özel Öğretim Kurumları Yönetmeliği hükümleri uygulanır.</p>
              <p style={pStyle}>Ücret iadesi hesaplamalarında kayıt sırasında uygulanmış burs, kampanya ve indirim şartları dikkate alınabilir.</p>
            </div>
          </div>

          <div style={{ marginBottom: 10 }}>
            <SectionTitle icon="✋" title="Madde 7 – Sözleşmenin Feshi" />
            <div style={articleBodyStyle}>
              <p style={pStyle}>Veli/Vasi yazılı bildirimde bulunarak sözleşmenin feshedilmesini talep edebilir.</p>
              <p style={pStyle}>
                Kursiyerin kurum düzenini bozucu davranışlarda bulunması, disiplin hükümlerine aykırı hareket etmesi veya
                sözleşmeden doğan yükümlülüklerin yerine getirilmemesi halinde kurum sözleşmeyi feshedebilir.
              </p>
              <p style={pStyle}>Fesih halinde mali hesaplamalar ilgili mevzuata göre yapılır.</p>
            </div>
          </div>

          <div style={{ marginBottom: 10 }}>
            <SectionTitle icon="📚" title="Madde 8 – Devamsızlık ve Kursiyer Yükümlülükleri" />
            <div style={articleBodyStyle}>
              <p style={pStyle}>Kursiyerin eğitim faaliyetlerine düzenli devam etmesi esastır.</p>
              <p style={pStyle}>Devamsızlık durumlarında veli/vasi kurumu bilgilendirmekle yükümlüdür.</p>
              <p style={pStyle}>Kursiyer kurum kurallarına, eğitim ortamına ve öğretmenlerin yönlendirmelerine uygun davranmak zorundadır.</p>
              <p style={pStyle}>Disiplin işlemlerinde ilgili mevzuat hükümleri uygulanır.</p>
            </div>
          </div>

          <div style={{ marginBottom: 10 }}>
            <SectionTitle icon="🎯" title="Madde 9 – Eğitim Organizasyonu ve Sosyal Etkinlikler" />
            <div style={articleBodyStyle}>
              <p style={pStyle}>Kurum; eğitim faaliyetleri, seminerler, etütler, atölye çalışmaları, sosyal ve kültürel etkinlikler düzenleyebilir.</p>
              <p style={pStyle}>Bu faaliyetlerin tarihleri, içerikleri ve uygulama şekilleri kurum tarafından belirlenir.</p>
              <p style={pStyle}>Gerekli görülmesi halinde etkinlikler ertelenebilir, değiştirilebilir veya iptal edilebilir.</p>
            </div>
          </div>

          <div style={{ marginBottom: 10 }}>
            <SectionTitle icon="🌪️" title="Madde 10 – Mücbir Sebep ve Uzaktan Eğitim" />
            <div style={articleBodyStyle}>
              <p style={pStyle}>
                Salgın hastalık, doğal afet, savaş, kamu otoritesi kararları veya benzeri mücbir sebepler nedeniyle yüz yüze eğitime
                ara verilmesi halinde eğitim faaliyetleri uygun dijital platformlar üzerinden sürdürülebilir.
              </p>
              <p style={pStyle}>
                Bu durumda kurumun eğitim hizmetini uzaktan eğitim yoluyla sunması sözleşme kapsamındaki yükümlülüklerin yerine
                getirilmiş sayılmasına engel değildir.
              </p>
            </div>
          </div>

          <div style={{ marginBottom: 10 }}>
            <SectionTitle icon="🔒" title="Madde 11 – Kişisel Verilerin Korunması" />
            <div style={articleBodyStyle}>
              <p style={pStyle}>
                Kurum, kişisel verileri 6698 sayılı Kişisel Verilerin Korunması Kanunu ve ilgili mevzuata uygun şekilde işler, saklar ve korur.
              </p>
              <p style={pStyle}>Kişisel verilerin işlenmesine ilişkin aydınlatma metni veli/vasiye sunulmuştur.</p>
              <p style={pStyle}>Açık rıza gerektiren işlemler için ayrıca onay alınır.</p>
            </div>
          </div>

          <div style={{ marginBottom: 10 }}>
            <SectionTitle icon="📧" title="Madde 12 – Ticari Elektronik İleti Tercihi" />
            <div style={articleBodyStyle}>
              <p style={pStyle}>6563 sayılı Kanun kapsamında;</p>
              <CheckboxOption label="Ticari elektronik ileti gönderilmesini kabul ediyorum." />
              <CheckboxOption label="Ticari elektronik ileti gönderilmesini kabul etmiyorum." />
              <p style={{ ...pStyle, marginTop: 8, fontStyle: "italic", color: "#64748b" }}>
                Bu tercih eğitim hizmetinin verilmesini etkilemez.
              </p>
            </div>
          </div>

          <div style={{ marginBottom: 10 }}>
            <SectionTitle icon="📷" title="Madde 13 – Görsel Kullanımı ve Tanıtım Faaliyetleri" />
            <div style={articleBodyStyle}>
              <p style={pStyle}>
                Kurum tarafından gerçekleştirilen ders, etüt, seminer, sosyal ve kültürel etkinlikler ile benzeri eğitim faaliyetleri
                sırasında fotoğraf ve video kayıtları alınabilir.
              </p>
              <p style={pStyle}>
                Veli/Vasi, kursiyerin eğitim faaliyetlerine katılımı sırasında alınan fotoğraf ve video kayıtlarının; kurumun eğitim
                faaliyetlerinin duyurulması, kurumsal tanıtım çalışmaları, internet sitesi, sosyal medya hesapları, basılı ve dijital
                tanıtım materyallerinde kullanılabileceğini kabul eder.
              </p>
              <p style={pStyle}>
                Kurum, söz konusu kayıtların kullanımında kursiyerin kişilik haklarına, özel hayatın gizliliğine ve yürürlükteki mevzuat
                hükümlerine uygun hareket etmeyi taahhüt eder.
              </p>
              <p style={pStyle}>
                Veli/Vasi, haklı bir gerekçeye dayanarak yazılı talepte bulunması halinde, talep tarihinden sonraki paylaşımlarda kursiyere
                ait görsel içeriklerin kullanılmamasını isteyebilir.
              </p>
            </div>
          </div>

          <div style={{ marginBottom: 10 }}>
            <SectionTitle icon="⚖️" title="Madde 14 – Uyuşmazlıkların Çözümü" />
            <div style={articleBodyStyle}>
              <p style={pStyle}>
                İşbu sözleşmeden doğabilecek uyuşmazlıklarda 6502 sayılı Tüketicinin Korunması Hakkında Kanun ve ilgili mevzuat hükümleri uygulanır.
              </p>
              <p style={pStyle}>
                Taraflar kanunen yetkili Tüketici Hakem Heyetleri, Tüketici Mahkemeleri ve diğer yetkili yargı mercilerine başvurabilir.
              </p>
            </div>
          </div>

          <div style={{ marginBottom: 14 }} data-pdf-expand>
            <SectionTitle icon="📎" title="Madde 15 – Yürürlük" />
            <div style={articleBodyStyle}>
              <p style={pStyle}>
                İşbu sözleşme 15 (on beş) maddeden ve EK-1 Ödeme Planından oluşmakta olup taraflarca okunarak kabul edilmiş ve imza altına alınmıştır.
              </p>
              <p style={pStyle}>Sözleşmenin bir nüshası veli/vasiye teslim edilmiştir.</p>
            </div>
          </div>

          {/* ═══ EK-1 – ÖDEME PLANI ═══ */}
          <div style={{ marginBottom: 16 }} data-pdf-expand>
            <div style={{
              textAlign: "center", marginBottom: 10,
              paddingBottom: 6, borderBottom: `2px solid ${KURUM_COLOR}`,
            }}>
              <h3 style={{ margin: 0, fontSize: 12, fontWeight: 800, color: KURUM_COLOR, letterSpacing: 0.5, textTransform: "uppercase" }}>
                EK-1 Ödeme Planı
              </h3>
              <p style={{ margin: "6px 0 0", fontSize: 9, color: "#64748b" }}>
                İşbu ödeme planı, yukarıdaki sözleşmenin ayrılmaz eki niteliğindedir.
              </p>
            </div>
            <div style={{ borderRadius: 8, border: "1px solid #e2e8f0", overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
                <thead>
                  <tr style={{ background: "linear-gradient(135deg, #e8edf5, #eef2ff)" }}>
                    <th style={thStyle}>No</th>
                    <th style={thStyle}>Vade Tarihi</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>Tutar</th>
                  </tr>
                </thead>
                <tbody>
                  {taksitler.length > 0 ? (
                    taksitler.map((t, i) => (
                      <tr key={t.id} style={{ background: i % 2 === 1 ? "#fafbfc" : "#fff" }}>
                        <td style={tdStyle}>{t.taksit_no}</td>
                        <td style={tdStyle}>{formatDateShort(t.vade_tarihi)}</td>
                        <td style={{ ...tdStyle, textAlign: "right", fontWeight: 600 }}>{formatCurrency(t.tutar)}</td>
                      </tr>
                    ))
                  ) : (
                    [1, 2, 3, 4].map((n) => (
                      <tr key={n} style={{ background: n % 2 === 0 ? "#fafbfc" : "#fff" }}>
                        <td style={tdStyle}>{n}</td>
                        <td style={tdStyle}>............</td>
                        <td style={{ ...tdStyle, textAlign: "right" }}>............</td>
                      </tr>
                    ))
                  )}
                </tbody>
                <tfoot>
                  <tr style={{ background: "linear-gradient(135deg, #f0f4f8, #e8edf5)", fontWeight: 700 }}>
                    <td colSpan={2} style={{ ...tdStyle, fontWeight: 700, fontSize: 10.5 }}>Toplam</td>
                    <td style={{ ...tdStyle, textAlign: "right", fontWeight: 800, fontSize: 11.5, color: KURUM_COLOR }}>
                      {taksitler.length > 0
                        ? formatCurrency(taksitler.reduce((s, t) => s + t.tutar, 0))
                        : formatCurrency(data.net_tutar)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* ═══ İMZALAR ═══ */}
          <div style={{ marginBottom: 16 }} data-pdf-expand>
            <div style={{
              display: "flex", alignItems: "center", gap: 6, marginBottom: 10,
            }}>
              <div style={{
                width: 22, height: 22, borderRadius: 5,
                background: `linear-gradient(135deg, ${KURUM_COLOR}, ${KURUM_LIGHT})`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 11, color: "#fff",
              }}>✍️</div>
              <h3 style={{ margin: 0, fontSize: 12, fontWeight: 700, color: "#334155", textTransform: "uppercase", letterSpacing: 0.5 }}>İmzalar</h3>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
              <div style={{ textAlign: "center", width: "48%" }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#334155", marginBottom: 6 }}>Veli / Vasi</div>
                <div style={{ fontSize: 9.5, color: "#334155", marginBottom: 2, textAlign: "left" }}>
                  Adı Soyadı: <strong>{data.veli_adi || "...................................."}</strong>
                </div>
                <div style={{ fontSize: 9, color: "#94a3b8", marginBottom: 6, textAlign: "left" }}>
                  Tarih: ....../......./ 202...
                </div>
                <div style={{ borderBottom: "2px solid #cbd5e1", height: 36, marginBottom: 4 }} />
                <div style={{ fontSize: 9, color: "#94a3b8" }}>İmza</div>
              </div>

              <div style={{ textAlign: "center", width: "48%" }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#334155", marginBottom: 6 }}>Kurum Yetkilisi</div>
                <div style={{ fontSize: 9.5, color: "#334155", marginBottom: 2, textAlign: "left" }}>
                  Adı Soyadı: ...................................
                </div>
                <div style={{ fontSize: 9.5, color: "#334155", marginBottom: 2, textAlign: "left" }}>
                  Görevi: ...................................
                </div>
                <div style={{ fontSize: 9, color: "#94a3b8", marginBottom: 6, textAlign: "left" }}>
                  Tarih: ....../......./ 202...
                </div>
                <div style={{ borderBottom: "2px solid #cbd5e1", height: 36, marginBottom: 4 }} />
                <div style={{ fontSize: 9, color: "#94a3b8" }}>Kaşe / İmza</div>
              </div>
            </div>
          </div>

          {/* ═══ NOTLAR ═══ */}
          {pdfNotlar && (
            <div style={{ marginBottom: 14 }}>
              <SectionTitle icon="📌" title="Özel Notlar" />
              <div style={{
                background: "#fffbeb", borderRadius: 8, padding: "8px 14px",
                border: "1px solid #fde68a", fontSize: 10, color: "#92400e", lineHeight: 1.6,
                whiteSpace: "pre-wrap",
              }}>
                {pdfNotlar}
              </div>
            </div>
          )}

          {/* ═══ VERGİ BİLGİSİ ═══ */}
          {data.kurum?.vergi_no && (
            <div style={{
              fontSize: 9.5, color: "#64748b", marginBottom: 10,
              background: "#f8fafc", borderRadius: 6, padding: "4px 10px",
              border: "1px solid #e2e8f0", display: "inline-block",
            }}>
              🏢 V.D.: {data.kurum.vergi_dairesi} &nbsp;|&nbsp; V.N.: {data.kurum.vergi_no}
            </div>
          )}

          {/* ═══ FOOTER ═══ */}
          <div style={{
            marginTop: 18, paddingTop: 8,
            borderTop: "1px solid #f1f5f9",
            textAlign: "center", fontSize: 8.5, color: "#94a3b8",
            display: "flex", justifyContent: "center", alignItems: "center", gap: 4,
          }}>
            <span>🔒</span>
            <span>Bu sözleşme {bugununTarihi} tarihinde düzenlenmiştir. — {data.sozlesme_no}</span>
          </div>

        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   Alt Bileşenler
   ═══════════════════════════════════════════════════ */

function SectionTitle({ icon, title }: { icon: string; title: string }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 6, marginBottom: 6,
    }}>
      <div style={{
        width: 20, height: 20, borderRadius: 5,
        background: `linear-gradient(135deg, ${KURUM_COLOR}, ${KURUM_LIGHT})`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 10, color: "#fff",
      }}>{icon}</div>
      <h3 style={{ margin: 0, fontSize: 11.5, fontWeight: 700, color: "#334155" }}>{title}</h3>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
      <span style={{ fontSize: 9.5, color: "#64748b" }}>{label}</span>
      <span style={{ fontSize: 10, color: "#1e293b", fontWeight: 600, textAlign: "right", maxWidth: "60%" }}>{value}</span>
    </div>
  );
}

function CheckboxOption({ label }: { label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 8, margin: "6px 0" }}>
      <div style={{
        width: 16, height: 16, border: "2px solid #475569", borderRadius: 3, flexShrink: 0, marginTop: 2,
      }} />
      <span style={{ fontSize: 10, fontWeight: 500, color: "#334155", lineHeight: 1.6 }}>{label}</span>
    </div>
  );
}
