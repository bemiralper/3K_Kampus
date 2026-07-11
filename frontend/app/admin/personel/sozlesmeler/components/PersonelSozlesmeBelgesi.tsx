"use client";

import { useEffect, useState } from "react";
import { QRCode } from "antd";
import type { Sozlesme } from "@/app/admin/personel/sozlesmeler/types";
import { fmtTL, fmtTLDec, fmtTarih, GUN_ADLARI, fmtAySuresi, contractNetMaas } from "@/app/admin/personel/sozlesmeler/lib/contractCalc";

const API_BASE = "/api/personel/api/sozlesmeler";

const KURUM_COLOR = "#1e3a5f";
const KURUM_LIGHT = "#2563eb";
const KURUM_ACCENT = "#0ea5e9";

interface Props {
  sozlesmeId: number;
  printToken: string;
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "3px 0", fontSize: 10 }}>
      <span style={{ color: "#64748b", flexShrink: 0 }}>{label}</span>
      <span style={{ color: "#1e293b", fontWeight: 500, textAlign: "right" }}>{value || "—"}</span>
    </div>
  );
}

function SectionTitle({ icon, title }: { icon: string; title: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, marginTop: 20 }}>
      <div
        style={{
          width: 24,
          height: 24,
          borderRadius: 6,
          background: `linear-gradient(135deg, ${KURUM_COLOR}, ${KURUM_LIGHT})`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 12,
          color: "#fff",
        }}
      >
        {icon}
      </div>
      <h3
        style={{
          margin: 0,
          fontSize: 11,
          fontWeight: 700,
          color: "#334155",
          textTransform: "uppercase",
          letterSpacing: 0.6,
        }}
      >
        {title}
      </h3>
    </div>
  );
}

function MetaCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        background: "#f8fafc",
        borderRadius: 10,
        padding: "12px 14px",
        border: "1px solid #e9ecf2",
        height: "100%",
      }}
    >
      <div
        style={{
          fontSize: 8.5,
          fontWeight: 700,
          color: "#94a3b8",
          textTransform: "uppercase",
          letterSpacing: 1,
          marginBottom: 8,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

export default function PersonelSozlesmeBelgesi({ sozlesmeId, printToken }: Props) {
  const [data, setData] = useState<Sozlesme | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `${API_BASE}/${sozlesmeId}/print-data/?token=${encodeURIComponent(printToken)}`,
          { credentials: "include" },
        );
        const json = await res.json();
        if (!res.ok || !json.success) {
          if (!cancelled) setError(json.error || "Sözleşme yüklenemedi.");
          return;
        }
        if (!cancelled) setData(json.data as Sozlesme);
      } catch {
        if (!cancelled) setError("Bağlantı hatası.");
      }
    })();
    return () => { cancelled = true; };
  }, [sozlesmeId, printToken]);

  if (error) {
    return (
      <div style={{ padding: 40, color: "#dc2626", fontFamily: "system-ui, sans-serif" }}>
        {error}
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{ padding: 40, fontFamily: "system-ui, sans-serif", color: "#64748b" }}>
        Sözleşme yükleniyor…
      </div>
    );
  }

  const kurumAd = data.kurum?.ad || data.sube_ad || "Kurum";
  const belgeBasligi = data.belge_basligi || (data.is_ogretmen ? "Öğretmen İş Sözleşmesi" : "Personel İş Sözleşmesi");
  const logoSrc = data.login_logo_url || "/img/beyaz-logo.png";
  const turLabel = data.sozlesme_turu_display || data.sozlesme_turu;
  const qrValue = `${data.sozlesme_no}|${data.dogrulama_kodu || ""}`;
  const duzenlemeTarihi = fmtTarih(data.duzenlenme_tarihi || data.baslangic_tarihi);
  const showMaas = (data.sozlesme_turu === "TAM_ZAMANLI" || data.sozlesme_turu === "KARMA") && (data.maas_plani?.length ?? 0) > 0;
  const showDers = data.sozlesme_turu === "DERS_UCRETLI" || data.sozlesme_turu === "KARMA";

  return (
    <div
      style={{
        fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
        color: "#111827",
        fontSize: 10.5,
        lineHeight: 1.5,
        maxWidth: "210mm",
        margin: "0 auto",
        padding: "28px 36px",
        background: "#fff",
      }}
    >
      <style jsx global>{`
        @page { size: A4; margin: 14mm 12mm; }
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>

      {/* ═══ KURUM BANNER ═══ */}
      <div
        style={{
          background: `linear-gradient(135deg, ${KURUM_COLOR} 0%, ${KURUM_LIGHT} 100%)`,
          borderRadius: 12,
          padding: "18px 24px",
          marginBottom: 20,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <img
            src={logoSrc}
            alt="Logo"
            style={{ width: 56, height: "auto", objectFit: "contain", flexShrink: 0 }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#fff", letterSpacing: 0.2 }}>
              {kurumAd}
            </h1>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 4, fontSize: 10, color: "rgba(255,255,255,.8)" }}>
              {data.sube_ad && <span>{data.sube_ad}</span>}
              {data.kurum?.adres && <span>{data.kurum.adres}</span>}
              {data.kurum?.telefon_sabit && <span>{data.kurum.telefon_sabit}</span>}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16, flexShrink: 0 }}>
            <div
              style={{
                background: "rgba(255,255,255,.15)",
                borderRadius: 10,
                padding: "8px 14px",
                border: "1px solid rgba(255,255,255,.25)",
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: 8, color: "rgba(255,255,255,.7)", fontWeight: 600, textTransform: "uppercase", letterSpacing: 1 }}>
                Sözleşme No
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", marginTop: 2 }}>
                {data.sozlesme_no}
              </div>
            </div>
            <div style={{ textAlign: "center" }}>
              <QRCode value={qrValue} size={56} bordered={false} color="#fff" bgColor="transparent" />
              <div style={{ fontSize: 7.5, color: "rgba(255,255,255,.75)", marginTop: 3, letterSpacing: 0.5 }}>
                {data.dogrulama_kodu}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ BELGE BAŞLIĞI ═══ */}
      <div
        style={{
          textAlign: "center",
          marginBottom: 20,
          paddingBottom: 12,
          borderBottom: `2px solid ${KURUM_COLOR}`,
        }}
      >
        <h2
          style={{
            margin: 0,
            fontSize: 15,
            fontWeight: 800,
            color: KURUM_COLOR,
            letterSpacing: 1.2,
            textTransform: "uppercase",
          }}
        >
          {belgeBasligi.toUpperCase()}
        </h2>
        <div style={{ fontSize: 10, color: "#64748b", marginTop: 6 }}>
          Düzenleme Tarihi: {duzenlemeTarihi} · Eğitim Yılı: {data.egitim_yili_display}
        </div>
      </div>

      {/* ═══ TARAFLAR ═══ */}
      <SectionTitle icon="👤" title="Taraflar" />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 4 }}>
        <MetaCard title="İşveren (Kurum)">
          <InfoRow label="Kurum" value={kurumAd} />
          <InfoRow label="Şube" value={data.sube_ad} />
          <InfoRow label="Adres" value={data.kurum?.adres} />
          <InfoRow label="Telefon" value={data.kurum?.telefon_sabit} />
        </MetaCard>
        <MetaCard title="İşçi (Personel)">
          <InfoRow label="Ad Soyad" value={data.personel_ad} />
          <InfoRow label="TC Kimlik No" value={data.personel_tc} />
          <InfoRow label="Personel No" value={data.personel_no_snapshot} />
          <InfoRow label="Branş / Görev" value={[data.brans_snapshot, data.gorev_snapshot].filter(Boolean).join(" · ") || "—"} />
          <InfoRow label="Departman" value={data.departman_snapshot} />
        </MetaCard>
      </div>

      {/* ═══ SÖZLEŞME ÖZETİ ═══ */}
      <SectionTitle icon="📋" title="Sözleşme Özeti" />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 10,
          marginBottom: 4,
        }}
      >
        {[
          { label: "Çalışma Tipi", value: turLabel },
          { label: "Durum", value: data.durum_display },
          { label: "Başlangıç", value: fmtTarih(data.baslangic_tarihi) },
          { label: "Bitiş", value: fmtTarih(data.bitis_tarihi) },
          { label: "Toplam Süre", value: fmtAySuresi(data.ozet?.toplam_calisma_suresi_ay ?? data.toplam_calisma_suresi_ay ?? data.maas_plani?.length ?? 0) },
          { label: "Net Maaş", value: fmtTL(contractNetMaas(data)) },
          { label: "Toplam Net Bedel", value: fmtTL(data.toplam_sozlesme_bedeli ?? 0) },
          { label: "Haftalık Gün", value: `${data.haftalik_calisma_gun_sayisi ?? "—"} gün` },
          { label: "SGK Gün", value: String(data.sgk_gun ?? "—") },
        ].map((item) => (
          <div
            key={item.label}
            style={{
              background: "#fff",
              border: "1px solid #e2e8f0",
              borderRadius: 8,
              padding: "10px 12px",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 8, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4 }}>
              {item.label}
            </div>
            <div style={{ fontSize: 11, fontWeight: 700, color: KURUM_COLOR }}>{item.value}</div>
          </div>
        ))}
      </div>

      {/* ═══ MAAŞ PLANI ═══ */}
      {showMaas && (
        <>
          <SectionTitle icon="💰" title="Aylık Maaş Planı" />
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: 9.5,
              marginBottom: 4,
            }}
          >
            <thead>
              <tr style={{ background: KURUM_COLOR, color: "#fff" }}>
                {["Ay", "Başlangıç", "Bitiş", "Gün", "Net Maaş", "Açıklama"].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: "8px 10px",
                      textAlign: h === "Net Maaş" ? "right" : "left",
                      fontWeight: 600,
                      fontSize: 9,
                      textTransform: "uppercase",
                      letterSpacing: 0.5,
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(data.maas_plani ?? []).map((row, idx) => (
                <tr
                  key={row.sira_no}
                  style={{ background: idx % 2 === 0 ? "#fff" : "#f8fafc" }}
                >
                  <td style={{ padding: "7px 10px", borderBottom: "1px solid #e2e8f0", fontWeight: 600 }}>
                    {row.sira_no}. Ay
                  </td>
                  <td style={{ padding: "7px 10px", borderBottom: "1px solid #e2e8f0" }}>
                    {fmtTarih(row.baslangic_tarihi)}
                  </td>
                  <td style={{ padding: "7px 10px", borderBottom: "1px solid #e2e8f0" }}>
                    {fmtTarih(row.bitis_tarihi)}
                  </td>
                  <td style={{ padding: "7px 10px", borderBottom: "1px solid #e2e8f0", textAlign: "center" }}>
                    {row.calisilan_gun}
                  </td>
                  <td
                    style={{
                      padding: "7px 10px",
                      borderBottom: "1px solid #e2e8f0",
                      textAlign: "right",
                      fontWeight: 600,
                      color: KURUM_COLOR,
                    }}
                  >
                    {fmtTL(row.maas)}
                  </td>
                  <td style={{ padding: "7px 10px", borderBottom: "1px solid #e2e8f0", color: "#64748b" }}>
                    {row.aciklama || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: "#eff6ff" }}>
                <td colSpan={4} style={{ padding: "8px 10px", fontWeight: 700, borderTop: `2px solid ${KURUM_LIGHT}` }}>
                  TOPLAM
                </td>
                <td
                  style={{
                    padding: "8px 10px",
                    textAlign: "right",
                    fontWeight: 800,
                    fontSize: 11,
                    color: KURUM_COLOR,
                    borderTop: `2px solid ${KURUM_LIGHT}`,
                  }}
                >
                  {fmtTL(data.toplam_sozlesme_bedeli ?? 0)}
                </td>
                <td style={{ borderTop: `2px solid ${KURUM_LIGHT}` }} />
              </tr>
            </tfoot>
          </table>
        </>
      )}

      {/* ═══ DERS ÜCRETİ ═══ */}
      {showDers && (
        <>
          <SectionTitle icon="📚" title="Ders Ücreti" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 4 }}>
            <MetaCard title="Ücret Tipi">
              <div style={{ fontSize: 12, fontWeight: 600, color: "#7c3aed" }}>
                {data.ders_ucret_tipi === "SAAT_BASI" ? "Saatlik Ücret" : data.ders_ucret_tipi === "DERS_BASI" ? "Ders Başına" : "—"}
              </div>
            </MetaCard>
            <MetaCard title="Birim Ücret">
              <div style={{ fontSize: 14, fontWeight: 700, color: "#7c3aed" }}>
                {fmtTLDec(data.ders_birim_ucret ?? 0)}
              </div>
            </MetaCard>
            {data.ders_ucretleri && data.ders_ucretleri.length > 0 && (
              <MetaCard title="Tanımlar">
                {data.ders_ucretleri.map((du, i) => (
                  <InfoRow
                    key={i}
                    label={du.brans_ad || "Genel"}
                    value={`${fmtTLDec(du.birim_ucret)} / ${du.ucret_tipi_display}`}
                  />
                ))}
              </MetaCard>
            )}
          </div>
        </>
      )}

      {/* ═══ ÇALIŞMA DÜZENİ & MESAI ═══ */}
      <SectionTitle icon="🕐" title="Çalışma Düzeni" />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 12, marginBottom: 4 }}>
        <MetaCard title="Genel">
          <InfoRow label="Haftalık Çalışma" value={`${data.haftalik_calisma_gun_sayisi ?? "—"} gün`} />
          <InfoRow label="SGK Gün Sayısı" value={String(data.sgk_gun ?? "—")} />
          <InfoRow
            label="Haftalık İzin"
            value={(data.haftalik_izin_gunleri || []).map((g) => GUN_ADLARI[g - 1]).join(", ") || "—"}
          />
        </MetaCard>
        {data.mesai_saatleri && data.mesai_saatleri.length > 0 && (
          <div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 9.5 }}>
              <thead>
                <tr style={{ background: "#f1f5f9" }}>
                  {["Gün", "Başlangıç", "Bitiş", "Mola"].map((h) => (
                    <th key={h} style={{ padding: "6px 10px", textAlign: "left", fontWeight: 600, color: "#475569", borderBottom: "1px solid #e2e8f0" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.mesai_saatleri.map((m) => (
                  <tr key={m.gun}>
                    <td style={{ padding: "6px 10px", borderBottom: "1px solid #f1f5f9", fontWeight: 500 }}>
                      {GUN_ADLARI[m.gun - 1]}
                    </td>
                    <td style={{ padding: "6px 10px", borderBottom: "1px solid #f1f5f9" }}>
                      {m.aktif ? (m.baslangic || "—") : "İzin"}
                    </td>
                    <td style={{ padding: "6px 10px", borderBottom: "1px solid #f1f5f9" }}>
                      {m.aktif ? (m.bitis || "—") : "—"}
                    </td>
                    <td style={{ padding: "6px 10px", borderBottom: "1px solid #f1f5f9", color: "#64748b" }}>
                      {m.aktif ? `${m.mola_dakika || 0} dk` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ═══ MADDELER ═══ */}
      {data.maddeler && data.maddeler.length > 0 && (
        <>
          <SectionTitle icon="§" title="Sözleşme Maddeleri" />
          <div
            style={{
              background: "#fafafa",
              border: "1px solid #e2e8f0",
              borderRadius: 10,
              padding: "14px 18px",
              marginBottom: 4,
            }}
          >
            <ol style={{ margin: 0, paddingLeft: 20 }}>
              {data.maddeler.map((m) => (
                <li key={m.sira} style={{ marginBottom: 10, fontSize: 10, color: "#334155", lineHeight: 1.55 }}>
                  {m.metin}
                </li>
              ))}
            </ol>
          </div>
        </>
      )}

      {/* ═══ NOTLAR ═══ */}
      {data.notlar && (
        <>
          <SectionTitle icon="📝" title="Ek Notlar" />
          <div
            style={{
              background: "#fffbeb",
              border: "1px solid #fde68a",
              borderRadius: 8,
              padding: "10px 14px",
              fontSize: 10,
              color: "#78350f",
              marginBottom: 4,
            }}
          >
            {data.notlar}
          </div>
        </>
      )}

      {/* ═══ İMZA ALANLARI ═══ */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 40,
          marginTop: 36,
          pageBreakInside: "avoid",
        }}
      >
        {[
          { title: "İşveren / Kurum Yetkilisi", sub: "Ad Soyad · İmza · Kaşe" },
          { title: "İşçi / Personel", sub: data.personel_ad, extra: "İmza" },
        ].map((box) => (
          <div key={box.title}>
            <div
              style={{
                borderTop: `2px solid ${KURUM_COLOR}`,
                paddingTop: 10,
                minHeight: 72,
              }}
            >
              <div style={{ fontSize: 10, fontWeight: 700, color: KURUM_COLOR, marginBottom: 4 }}>
                {box.title}
              </div>
              <div style={{ fontSize: 10, color: "#64748b" }}>{box.sub}</div>
              {"extra" in box && (
                <div style={{ fontSize: 9, color: "#94a3b8", marginTop: 4 }}>{box.extra}</div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* ═══ FOOTER ═══ */}
      <div
        style={{
          marginTop: 28,
          paddingTop: 10,
          borderTop: "1px solid #e2e8f0",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: 8.5,
          color: "#94a3b8",
        }}
      >
        <span>
          {data.sozlesme_no} · {data.personel_ad} · Doğrulama: {data.dogrulama_kodu}
        </span>
        <span style={{ color: KURUM_ACCENT, fontWeight: 600 }}>3K Kampüs · {belgeBasligi}</span>
      </div>
    </div>
  );
}
