"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AktifDonem, AtanmamisOgrenci, Sinif } from "../types";
import {
  assignOgrencilerToSinif,
  getSinifOgrenciRoster,
  removeOgrenciFromSinif,
} from "../services";
import { runSinifRosterExport } from "@/lib/sinif-roster-export";
import { useKurum } from "@/lib/contexts/KurumContext";

interface SinifOgrenciAtamaModalProps {
  sinif: Sinif | null;
  aktifDonem: AktifDonem | null;
  onClose: () => void;
  onSuccess: () => void;
}

export default function SinifOgrenciAtamaModal({
  sinif,
  aktifDonem,
  onClose,
  onSuccess,
}: SinifOgrenciAtamaModalProps) {
  const [loading, setLoading] = useState(false);
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [ogrenciler, setOgrenciler] = useState<AtanmamisOgrenci[]>([]);
  const [mevcutluk, setMevcutluk] = useState(0);
  const [kapasite, setKapasite] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const { activeKurum, activeSube } = useKurum();

  const loadStudents = useCallback(async () => {
    if (!sinif) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getSinifOgrenciRoster(sinif.id, aktifDonem?.id);
      setOgrenciler(data.ogrenciler);
      setMevcutluk(data.sinif?.mevcutluk ?? sinif.mevcutluk ?? 0);
      setKapasite(data.sinif?.kapasite ?? sinif.kapasite);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Liste yüklenemedi");
      setOgrenciler([]);
    } finally {
      setLoading(false);
    }
  }, [sinif, aktifDonem?.id]);

  useEffect(() => {
    if (sinif) loadStudents();
  }, [sinif, loadStudents]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return ogrenciler;
    return ogrenciler.filter(
      (o) =>
        o.tam_ad.toLowerCase().includes(q) ||
        o.okul_no.toLowerCase().includes(q) ||
        o.alan?.ad?.toLowerCase().includes(q) ||
        o.sinif_yerlesim?.ad?.toLowerCase().includes(q),
    );
  }, [ogrenciler, search]);

  const siniftakiler = useMemo(
    () => filtered.filter((o) => o.bu_sinifta),
    [filtered],
  );
  const digerleri = useMemo(
    () => filtered.filter((o) => !o.bu_sinifta),
    [filtered],
  );

  const handleRowClick = async (ogrenci: AtanmamisOgrenci) => {
    if (!sinif || !aktifDonem || processingId) return;
    setProcessingId(ogrenci.id);
    setError(null);
    try {
      if (ogrenci.bu_sinifta) {
        const res = await removeOgrenciFromSinif(sinif.id, [ogrenci.id], aktifDonem.id);
        setMevcutluk(res.mevcutluk ?? mevcutluk - 1);
      } else {
        if (mevcutluk >= kapasite) {
          setError("Sınıf kapasitesi dolu. Önce başka bir öğrenciyi çıkarın.");
          return;
        }
        const res = await assignOgrencilerToSinif(sinif.id, [ogrenci.id], aktifDonem.id);
        const skipped = res.result?.skipped?.length || 0;
        if (skipped > 0) {
          setError(res.result?.skipped?.[0]?.reason || "Atama yapılamadı");
          return;
        }
        setMevcutluk(res.mevcutluk ?? mevcutluk + 1);
      }
      await loadStudents();
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "İşlem başarısız");
    } finally {
      setProcessingId(null);
    }
  };

  const handleDownload = async (format: "csv" | "xlsx" | "pdf") => {
    if (!sinif || !aktifDonem) return;
    setDownloading(true);
    setError(null);
    try {
      await runSinifRosterExport(
        { scope: "sinif", sinif_id: sinif.id, term_id: aktifDonem.id },
        format,
        {
          kurumAd: activeKurum?.ad || "Kurum",
          subeAd: activeSube?.ad,
          logoUrl: activeKurum?.app_logo_url || activeKurum?.login_logo_url,
          temaRengi: activeKurum?.tema_rengi,
        },
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "İndirme başarısız");
    } finally {
      setDownloading(false);
    }
  };

  const renderRow = (o: AtanmamisOgrenci) => {
    const isProcessing = processingId === o.id;
    const inThisClass = Boolean(o.bu_sinifta);
    const inOtherClass = Boolean(o.sinif_yerlesim && !o.bu_sinifta);

    let rowBg = "#fff";
    let borderColor = "#f8fafc";
    let actionHint = "Sınıfa ekle";
    if (inThisClass) {
      rowBg = "#ecfdf5";
      borderColor = "#d1fae5";
      actionHint = "Sınıftan çıkar";
    } else if (inOtherClass) {
      rowBg = "#fffbeb";
      borderColor = "#fef3c7";
      actionHint = `${o.sinif_yerlesim?.ad} → ${sinif?.ad}`;
    }

    return (
      <button
        key={o.id}
        type="button"
        disabled={Boolean(processingId) || !aktifDonem}
        onClick={() => handleRowClick(o)}
        title={actionHint}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          width: "100%",
          textAlign: "left",
          padding: "12px 24px",
          border: "none",
          borderBottom: `1px solid ${borderColor}`,
          background: rowBg,
          cursor: processingId ? "wait" : "pointer",
          opacity: isProcessing ? 0.6 : 1,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 500, color: "#1e293b" }}>{o.tam_ad}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "4px" }}>
            {o.okul_no && (
              <span style={{ fontSize: "0.75rem", color: "#94a3b8" }}>
                No: {o.okul_no}
              </span>
            )}
            {o.alan?.ad && (
              <span
                style={{
                  fontSize: "0.75rem",
                  padding: "2px 8px",
                  borderRadius: "4px",
                  background: "#ede9fe",
                  color: "#6d28d9",
                }}
              >
                {o.alan.ad}
              </span>
            )}
          </div>
        </div>
        <div style={{ flexShrink: 0, textAlign: "right" }}>
          {inThisClass && (
            <span
              style={{
                fontSize: "0.75rem",
                fontWeight: 600,
                padding: "4px 10px",
                borderRadius: "20px",
                background: "#059669",
                color: "#fff",
              }}
            >
              Bu sınıfta
            </span>
          )}
          {inOtherClass && (
            <span
              style={{
                fontSize: "0.75rem",
                fontWeight: 500,
                padding: "4px 10px",
                borderRadius: "20px",
                background: "#fef3c7",
                color: "#b45309",
                border: "1px solid #fde68a",
              }}
            >
              {o.sinif_yerlesim?.ad}
            </span>
          )}
          {!inThisClass && !inOtherClass && (
            <span style={{ fontSize: "0.75rem", color: "#94a3b8" }}>Atanmamış</span>
          )}
        </div>
      </button>
    );
  };

  if (!sinif) return null;

  const kalanKapasite = Math.max(0, kapasite - mevcutluk);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15, 23, 42, 0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: "24px",
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "640px",
          maxHeight: "85vh",
          background: "#fff",
          borderRadius: "12px",
          boxShadow: "0 20px 50px rgba(0,0,0,0.15)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: "20px 24px", borderBottom: "1px solid #e2e8f0" }}>
          <h3 style={{ margin: 0, fontSize: "1.125rem", color: "#0f172a" }}>
            Sınıf Öğrencileri — {sinif.ad}
          </h3>
          <p style={{ margin: "8px 0 0", fontSize: "0.875rem", color: "#64748b" }}>
            {aktifDonem ? (
              <>
                {aktifDonem.name} · {mevcutluk}/{kapasite} öğrenci
                {kalanKapasite === 0 && (
                  <span style={{ color: "#dc2626", marginLeft: 8 }}>(dolu)</span>
                )}
              </>
            ) : (
              "Aktif dönem bulunamadı"
            )}
          </p>
          <p style={{ margin: "6px 0 0", fontSize: "0.8125rem", color: "#64748b" }}>
            Tıklayarak ekleyin, çıkarın veya başka sınıftan bu sınıfa taşıyın.
          </p>
        </div>

        <div style={{ padding: "16px 24px", borderBottom: "1px solid #f1f5f9" }}>
          <input
            type="text"
            placeholder="Ad, okul no, alan veya sınıf ara..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: "100%",
              padding: "10px 12px",
              border: "1px solid #e2e8f0",
              borderRadius: "8px",
              fontSize: "14px",
            }}
          />
        </div>

        <div style={{ flex: 1, overflow: "auto" }}>
          {loading ? (
            <div style={{ padding: "32px", textAlign: "center", color: "#64748b" }}>
              Yükleniyor...
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: "32px", textAlign: "center", color: "#64748b" }}>
              {ogrenciler.length === 0
                ? "Bu seviyede kayıtlı öğrenci yok"
                : "Arama sonucu bulunamadı"}
            </div>
          ) : (
            <>
              {siniftakiler.length > 0 && (
                <>
                  <div
                    style={{
                      padding: "10px 24px",
                      fontSize: "0.75rem",
                      fontWeight: 600,
                      color: "#047857",
                      background: "#f0fdf4",
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                    }}
                  >
                    Bu sınıfta ({siniftakiler.length})
                  </div>
                  {siniftakiler.map(renderRow)}
                </>
              )}
              {digerleri.length > 0 && (
                <>
                  <div
                    style={{
                      padding: "10px 24px",
                      fontSize: "0.75rem",
                      fontWeight: 600,
                      color: "#64748b",
                      background: "#f8fafc",
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                      borderTop: siniftakiler.length ? "1px solid #e2e8f0" : "none",
                    }}
                  >
                    Diğer öğrenciler ({digerleri.length})
                  </div>
                  {digerleri.map(renderRow)}
                </>
              )}
            </>
          )}
        </div>

        {error && (
          <div
            style={{
              margin: "0 24px 12px",
              padding: "10px 12px",
              background: "#fef2f2",
              border: "1px solid #fecaca",
              borderRadius: "8px",
              color: "#dc2626",
              fontSize: "0.875rem",
            }}
          >
            {error}
          </div>
        )}

        <div
          style={{
            padding: "16px 24px",
            borderTop: "1px solid #e2e8f0",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "12px",
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button
              type="button"
              disabled={downloading || !aktifDonem}
              onClick={() => handleDownload("xlsx")}
              style={{
                padding: "8px 12px",
                border: "1px solid #e2e8f0",
                borderRadius: "8px",
                background: "#fff",
                cursor: downloading ? "wait" : "pointer",
                fontSize: "0.8125rem",
              }}
            >
              Excel
            </button>
            <button
              type="button"
              disabled={downloading || !aktifDonem}
              onClick={() => handleDownload("csv")}
              style={{
                padding: "8px 12px",
                border: "1px solid #e2e8f0",
                borderRadius: "8px",
                background: "#fff",
                cursor: downloading ? "wait" : "pointer",
                fontSize: "0.8125rem",
              }}
            >
              CSV
            </button>
            <button
              type="button"
              disabled={downloading || !aktifDonem}
              onClick={() => handleDownload("pdf")}
              style={{
                padding: "8px 12px",
                border: "1px solid #e2e8f0",
                borderRadius: "8px",
                background: "#fff",
                cursor: downloading ? "wait" : "pointer",
                fontSize: "0.8125rem",
              }}
            >
              PDF
            </button>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "10px 18px",
              border: "1px solid #e2e8f0",
              borderRadius: "8px",
              background: "#fff",
              cursor: "pointer",
            }}
          >
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
}
