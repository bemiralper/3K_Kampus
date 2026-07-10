"use client";

import { useEffect, useRef, useState } from "react";
import { API_BASE } from "../helpers";
import { useVectorPrint } from "@/lib/useVectorPrint";
import { sendPaymentReminder } from "@/lib/communication-api";

interface TaksitItem {
  id: number;
  taksit_no: number;
  vade_tarihi: string | null;
  tutar: number;
  odenen_tutar: number;
  kalan_tutar: number;
  durum: string;
}

interface SozlesmeData {
  id: number;
  sozlesme_no: string;
  paket_adi: string;
  durum: string;
  ogrenci_adi: string;
  veli_adi: string;
  veli_tc_kimlik_no: string;
  net_tutar: number;
  toplam_odenen: number;
  kalan_borc: number;
  taksitler: TaksitItem[];
  kurum?: { ad: string; adres: string; telefon_sabit: string; vergi_no: string; vergi_dairesi: string };
  sube?: { ad: string };
}

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

function formatDateShort(d: string | null): string {
  if (!d) return "-";
  try {
    return new Date(d).toLocaleDateString("tr-TR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return d;
  }
}

const taksitDurumLabel: Record<string, string> = {
  beklemede: "Beklemede",
  kismi_odendi: "Kısmi Ödendi",
  odendi: "Ödendi",
  gecikmi: "Gecikmiş",
  iptal: "İptal",
};

interface Props {
  sozlesmeId: number;
  onClose?: () => void;
  printMode?: boolean;
  printToken?: string;
  onWhatsApp?: () => void;
}

export default function OdemePlani({ sozlesmeId, onClose, printMode, printToken, onWhatsApp }: Props) {
  const [data, setData] = useState<SozlesmeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [reminderBusy, setReminderBusy] = useState<number | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const contentRef = useRef<HTMLDivElement>(null);

  const { print: printVector } = useVectorPrint({
    title: `Ödeme Planı - ${data?.sozlesme_no || sozlesmeId}`,
    orientation: "portrait",
    marginMm: "10mm 12mm",
    externalRef: contentRef,
    extraCss: ".pdf-export-hide { display: none !important; }",
  });

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
          setError("Sözleşme verisi yüklenemedi");
          setLoading(false);
          return;
        }
        const json = await res.json();
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

  const handlePrint = async () => {
    setPdfBusy(true);
    try {
      await printVector();
    } finally {
      setPdfBusy(false);
    }
  };

  const handleDownload = handlePrint;

  const handleWhatsAppReminder = async (taksitId: number) => {
    setReminderBusy(taksitId);
    setToast(null);
    try {
      const result = await sendPaymentReminder(taksitId);
      setToast({ type: "success", msg: result.detail || "WhatsApp hatırlatması kuyruğa eklendi." });
    } catch (err) {
      setToast({
        type: "error",
        msg: err instanceof Error ? err.message : "Hatırlatma gönderilemedi.",
      });
    } finally {
      setReminderBusy(null);
      setTimeout(() => setToast(null), 4000);
    }
  };

  const canRemind = (durum: string) =>
    durum === "beklemede" || durum === "kismi_odendi" || durum === "gecikmi";

  if (loading) {
    if (printMode) {
      return <div style={{ padding: 24, fontFamily: "Poppins, sans-serif" }}>Ödeme planı yükleniyor…</div>;
    }
    return (
      <>
        <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", zIndex: 2000 }} />
        <div style={{
          position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
          background: "#fff", borderRadius: 16, padding: 40, zIndex: 2001, textAlign: "center",
        }}>
          <p>Ödeme planı yükleniyor...</p>
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
        <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", zIndex: 2000 }} />
        <div style={{
          position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
          background: "#fff", borderRadius: 16, padding: 40, zIndex: 2001, textAlign: "center",
        }}>
          <p style={{ color: "#dc2626" }}>{error || "Bir hata oluştu"}</p>
          <button onClick={onClose} style={{ marginTop: 16, padding: "8px 24px", cursor: "pointer" }}>Kapat</button>
        </div>
      </>
    );
  }

  const taksitler = data.taksitler || [];
  // Tablo alt satırı (kolon toplamı) — gösterilen taksit satırlarının toplamı.
  const toplamTutar = taksitler.reduce((s, t) => s + t.tutar, 0);
  const toplamOdenen = taksitler.reduce((s, t) => s + t.odenen_tutar, 0);
  const toplamKalan = taksitler.reduce((s, t) => s + t.kalan_tutar, 0);

  // Özet kartları — TEK DOĞRULUK KAYNAĞI backend'dir. Sözleşme seviyesindeki
  // net tutar/ödenen/kalan (peşinat, emanet vb. dahil) taksit toplamından
  // farklı olabilir; bu yüzden başlık rakamları backend alanlarından beslenir.
  const ozetTutar = data.net_tutar ?? toplamTutar;
  const ozetOdenen = data.toplam_odenen ?? toplamOdenen;
  const ozetKalan = data.kalan_borc ?? toplamKalan;
  const showActionColumn = !printMode;

  return (
    <>
      {!printMode && (
        <div
          onClick={onClose}
          className="odeme-plani-overlay"
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 2000 }}
        />
      )}

      <div
        className="odeme-plani-container"
        style={printMode ? { background: "#fff" } : {
          position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
          width: 720, maxHeight: "90vh", overflowY: "auto",
          background: "#fff", borderRadius: 16, boxShadow: "0 25px 80px rgba(0,0,0,.2)",
          zIndex: 2001,
        }}
      >
        {!printMode && (
        <div
          className="odeme-plani-toolbar"
          style={{
            padding: "12px 24px", borderBottom: "1px solid #e5e7eb",
            display: "flex", justifyContent: "space-between", alignItems: "center",
            background: "#f9fafb", borderTopLeftRadius: 16, borderTopRightRadius: 16,
          }}
        >
          <span style={{ fontSize: 14, color: "#6b7280" }}>Ödeme Planı Önizleme</span>
          {toast && (
            <span
              style={{
                fontSize: 12,
                padding: "4px 12px",
                borderRadius: 8,
                background: toast.type === "success" ? "#dcfce7" : "#fee2e2",
                color: toast.type === "success" ? "#166534" : "#991b1b",
              }}
            >
              {toast.msg}
            </span>
          )}
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
              {pdfBusy ? "⏳ Hazırlanıyor..." : "🖨️ PDF Önizle"}
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

        {/* İçerik — PDF'e dönüştürülecek alan */}
        <div ref={contentRef} className="odeme-plani-content" style={{ padding: "24px 32px", background: "#fff", fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif" }}>

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
                  {data.kurum?.telefon_sabit && <span>📞 {data.kurum.telefon_sabit}</span>}
                </div>
              </div>
              {/* Sözleşme No Badge */}
              <div style={{
                background: "rgba(255,255,255,.15)", borderRadius: 10, padding: "6px 14px",
                border: "1px solid rgba(255,255,255,.25)", textAlign: "center", flexShrink: 0,
              }}>
                <div style={{ fontSize: 8.5, color: "rgba(255,255,255,.7)", fontWeight: 600, textTransform: "uppercase", letterSpacing: 1 }}>Sözleşme No</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", marginTop: 1 }}>{data.sozlesme_no}</div>
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
              }}>📑</div>
              <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#1e293b" }}>
                Ödeme Planı
              </h2>
            </div>
            <div style={{
              background: "#f8fafc", borderRadius: 6, padding: "4px 10px",
              border: "1px solid #e2e8f0", fontSize: 11, color: "#64748b",
            }}>
              📅 {formatDateShort(new Date().toISOString())}
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
              <div style={{ marginBottom: 4 }}>
                <div style={{ fontSize: 9.5, color: "#94a3b8", marginBottom: 0 }}>Öğrenci</div>
                <div style={{ fontSize: 11.5, color: "#1e293b", fontWeight: 600 }}>{data.ogrenci_adi}</div>
              </div>
              <div>
                <div style={{ fontSize: 9.5, color: "#94a3b8", marginBottom: 0 }}>Veli</div>
                <div style={{ fontSize: 11.5, color: "#1e293b", fontWeight: 600 }}>{data.veli_adi}</div>
                {data.veli_tc_kimlik_no && <div style={{ fontSize: 10, color: "#64748b", marginTop: 0 }}>TC: {data.veli_tc_kimlik_no}</div>}
              </div>
            </div>

            {/* Sağ kart — Sözleşme Detayları */}
            <div style={{
              background: "#f8fafc", borderRadius: 10, padding: "10px 14px",
              border: "1px solid #e9ecf2",
            }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>
                Sözleşme Detayları
              </div>
              <div style={{ marginBottom: 3, display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 10, color: "#64748b" }}>Eğitim Paketi</span>
                <span style={{ fontSize: 10.5, color: "#1e293b", fontWeight: 600 }}>{data.paket_adi}</span>
              </div>
              <div style={{ marginBottom: 3, display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 10, color: "#64748b" }}>Taksit Sayısı</span>
                <span style={{ fontSize: 10.5, color: "#1e293b", fontWeight: 600 }}>{taksitler.length} Taksit</span>
              </div>
              <div style={{
                marginTop: 4, paddingTop: 4,
                borderTop: "1px solid #e2e8f0",
                display: "flex", justifyContent: "space-between", alignItems: "center",
              }}>
                <span style={{ fontSize: 10, color: "#64748b" }}>Sözleşme Tutarı</span>
                <span style={{ fontSize: 14, color: "#1e293b", fontWeight: 800 }}>{formatCurrency(data.net_tutar)}</span>
              </div>
            </div>
          </div>

          {/* ═══ Özet Kartları — 3 sütun ═══ */}
          <div style={{
            display: "grid", gridTemplateColumns: "1fr 1fr 1fr",
            gap: 8, marginBottom: 14,
          }}>
            <div style={{
              padding: "8px 12px", borderRadius: 10,
              background: "linear-gradient(135deg, #f8fafc, #f1f5f9)",
              border: "1px solid #e2e8f0", textAlign: "center",
            }}>
              <div style={{ color: "#94a3b8", fontSize: 8.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 }}>Toplam Tutar</div>
              <div style={{ fontWeight: 700, color: "#334155", fontSize: 13 }}>{formatCurrency(ozetTutar)}</div>
            </div>
            <div style={{
              padding: "8px 12px", borderRadius: 10,
              background: "linear-gradient(135deg, #f0fdf4, #ecfdf5)",
              border: "1px solid #bbf7d0", textAlign: "center",
            }}>
              <div style={{ color: "#6ee7b7", fontSize: 8.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 }}>Toplam Ödenen</div>
              <div style={{ fontWeight: 700, color: "#059669", fontSize: 13 }}>{formatCurrency(ozetOdenen)}</div>
            </div>
            <div style={{
              padding: "8px 12px", borderRadius: 10,
              background: ozetKalan > 0 ? "linear-gradient(135deg, #fef2f2, #fff1f2)" : "linear-gradient(135deg, #f0fdf4, #ecfdf5)",
              border: `1px solid ${ozetKalan > 0 ? "#fecaca" : "#bbf7d0"}`, textAlign: "center",
            }}>
              <div style={{ color: ozetKalan > 0 ? "#fca5a5" : "#6ee7b7", fontSize: 8.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 }}>Kalan Borç</div>
              <div style={{ fontWeight: 700, color: ozetKalan > 0 ? "#dc2626" : "#059669", fontSize: 13 }}>
                {formatCurrency(ozetKalan)}
              </div>
            </div>
          </div>

          {/* ═══ Taksit Tablosu ═══ */}
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
                <h3 style={{ margin: 0, fontSize: 11.5, fontWeight: 700, color: "#334155" }}>Taksit Detayları</h3>
              </div>
              <span style={{
                fontSize: 9, color: "#64748b", background: "#f1f5f9",
                padding: "2px 6px", borderRadius: 4,
              }}>{taksitler.length} taksit</span>
            </div>

            <div style={{ borderRadius: 8, border: "1px solid #e2e8f0", overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
            <thead>
              <tr style={{ background: "linear-gradient(135deg, #e8edf5, #eef2ff)" }}>
                <th style={thCell}>Taksit No</th>
                <th style={thCell}>Vade Tarihi</th>
                <th style={{ ...thCell, textAlign: "right" }}>Taksit Tutarı</th>
                <th style={{ ...thCell, textAlign: "right" }}>Ödenen</th>
                <th style={{ ...thCell, textAlign: "right" }}>Kalan</th>
                <th style={{ ...thCell, textAlign: "center" }}>Durum</th>
                {showActionColumn && (
                  <th className="pdf-export-hide" style={{ ...thCell, textAlign: "center" }}>İşlem</th>
                )}
              </tr>
            </thead>
            <tbody>
              {taksitler.map((t, i) => (
                <tr key={t.taksit_no} style={{ background: i % 2 === 0 ? "#fff" : "#fafbfd" }}>
                  <td style={tdCell}>
                    <span style={{
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                      width: 20, height: 20, borderRadius: 5,
                      background: "#f1f5f9", fontSize: 9.5, fontWeight: 700, color: "#475569",
                    }}>{t.taksit_no}</span>
                  </td>
                  <td style={tdCell}>{formatDateShort(t.vade_tarihi)}</td>
                  <td style={{ ...tdCell, textAlign: "right", fontWeight: 700 }}>{formatCurrency(t.tutar)}</td>
                  <td style={{ ...tdCell, textAlign: "right", color: "#059669", fontWeight: 500 }}>{formatCurrency(t.odenen_tutar)}</td>
                  <td style={{ ...tdCell, textAlign: "right", color: t.kalan_tutar > 0 ? "#dc2626" : "#059669", fontWeight: 500 }}>{formatCurrency(t.kalan_tutar)}</td>
                  <td style={{ ...tdCell, textAlign: "center" }}>
                    <span style={{
                      padding: "3px 10px", borderRadius: 6, fontSize: 10, fontWeight: 600,
                      background: t.durum === "odendi" ? "#dcfce7" : t.durum === "kismi_odendi" ? "#fef9c3" : t.durum === "gecikmi" ? "#fee2e2" : "#f1f5f9",
                      color: t.durum === "odendi" ? "#166534" : t.durum === "kismi_odendi" ? "#854d0e" : t.durum === "gecikmi" ? "#991b1b" : "#475569",
                    }}>
                      {taksitDurumLabel[t.durum] || t.durum}
                    </span>
                  </td>
                  {showActionColumn && (
                  <td className="pdf-export-hide" style={{ ...tdCell, textAlign: "center" }}>
                    {canRemind(t.durum) && t.kalan_tutar > 0 ? (
                      <button
                        type="button"
                        className="pdf-export-hide"
                        onClick={() => handleWhatsAppReminder(t.id)}
                        disabled={reminderBusy === t.id}
                        style={{
                          padding: "4px 10px",
                          borderRadius: 6,
                          border: "1px solid #25D366",
                          background: reminderBusy === t.id ? "#f0fdf4" : "#fff",
                          color: "#128C7E",
                          fontSize: 10,
                          fontWeight: 600,
                          cursor: reminderBusy === t.id ? "wait" : "pointer",
                        }}
                      >
                        {reminderBusy === t.id ? "…" : "WhatsApp Hatırlat"}
                      </button>
                    ) : (
                      <span style={{ color: "#94a3b8", fontSize: 10 }}>—</span>
                    )}
                  </td>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: "linear-gradient(135deg, #f8fafc, #f1f5f9)", fontWeight: 700 }}>
                <td colSpan={2} style={{ ...tdCell, fontWeight: 700, fontSize: 10.5, color: "#334155" }}>TOPLAM</td>
                <td style={{ ...tdCell, textAlign: "right", fontWeight: 800, fontSize: 11.5, color: "#1e293b" }}>{formatCurrency(toplamTutar)}</td>
                <td style={{ ...tdCell, textAlign: "right", fontWeight: 800, fontSize: 11.5, color: "#059669" }}>{formatCurrency(toplamOdenen)}</td>
                <td style={{ ...tdCell, textAlign: "right", fontWeight: 800, fontSize: 11.5, color: toplamKalan > 0 ? "#dc2626" : "#059669" }}>{formatCurrency(toplamKalan)}</td>
                <td style={tdCell}></td>
                {showActionColumn && <td style={tdCell}></td>}
              </tr>
            </tfoot>
          </table>
            </div>
          </div>

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
              <div style={{ fontSize: 10.5, color: "#334155", fontWeight: 700 }}>Kurum Yetkilisi</div>
            </div>
            <div style={{ textAlign: "center", width: "40%" }}>
              <div style={{
                borderBottom: "2px solid #e2e8f0", height: 36, marginBottom: 4,
                borderRadius: "0 0 4px 4px",
              }} />
              <div style={{ fontSize: 10.5, color: "#334155", fontWeight: 700 }}>Veli / Öğrenci</div>
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
            <span>Bu ödeme planı {formatDateShort(new Date().toISOString())} tarihinde oluşturulmuştur.</span>
          </div>
        </div>
      </div>


    </>
  );
}

/* ─── Stil sabitleri ─── */
const thCell: React.CSSProperties = {
  padding: "5px 8px",
  fontWeight: 700,
  color: "#475569",
  borderBottom: "2px solid #e2e8f0",
  textAlign: "left",
  fontSize: 9.5,
  textTransform: "uppercase",
  letterSpacing: 0.5,
};

const tdCell: React.CSSProperties = {
  padding: "4px 8px",
  borderBottom: "1px solid #f1f5f9",
  color: "#334155",
  fontSize: 10,
};
