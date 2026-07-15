"use client";

import { useEffect, useState } from "react";
import { QRCode } from "antd";
import type { Sozlesme } from "@/app/admin/personel/sozlesmeler/types";
import {
  fmtTL,
  fmtTLDec,
  fmtTarih,
  GUN_ADLARI,
  fmtAySuresi,
  contractNetMaas,
} from "@/app/admin/personel/sozlesmeler/lib/contractCalc";

const API_BASE = "/api/personel/api/sozlesmeler";

const INK = "#0f172a";
const MUTED = "#64748b";
const LINE = "#e2e8f0";
const ACCENT = "#1e3a5f";

interface Props {
  sozlesmeId: number;
  printToken: string;
}

function Kv({ rows }: { rows: { label: string; value: React.ReactNode }[] }) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 9.5 }}>
      <tbody>
        {rows.map((r) => (
          <tr key={r.label}>
            <th
              style={{
                width: "38%",
                textAlign: "left",
                fontWeight: 500,
                color: MUTED,
                padding: "2.5px 8px 2.5px 0",
                verticalAlign: "top",
              }}
            >
              {r.label}
            </th>
            <td
              style={{
                textAlign: "left",
                fontWeight: 600,
                color: INK,
                padding: "2.5px 0",
                verticalAlign: "top",
              }}
            >
              {r.value || "—"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 12 }}>
      <h2
        style={{
          margin: "0 0 6px",
          padding: "0 0 3px",
          fontSize: 8.5,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: 0.8,
          color: ACCENT,
          borderBottom: `1px solid ${LINE}`,
        }}
      >
        {title}
      </h2>
      {children}
    </section>
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
    return () => {
      cancelled = true;
    };
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
      <div style={{ padding: 40, fontFamily: "system-ui, sans-serif", color: MUTED }}>
        Sözleşme yükleniyor…
      </div>
    );
  }

  const kurumAd = data.kurum?.ad || data.sube_ad || "Kurum";
  const belgeBasligi =
    data.belge_basligi || (data.is_ogretmen ? "Öğretmen İş Sözleşmesi" : "Personel İş Sözleşmesi");
  const logoSrc = (() => {
    const raw = data.login_logo_url;
    if (!raw) return "/img/beyaz-logo.png";
    if (raw.startsWith("/media/")) return raw;
    try {
      const u = new URL(raw, typeof window !== "undefined" ? window.location.origin : "http://localhost");
      if (u.pathname.startsWith("/media/")) return `${u.pathname}${u.search}`;
    } catch {
      /* ignore */
    }
    return raw.startsWith("/") ? raw : "/img/beyaz-logo.png";
  })();
  const turLabel = data.sozlesme_turu_display || data.sozlesme_turu;
  const qrValue = `${data.sozlesme_no}|${data.dogrulama_kodu || ""}`;
  const duzenlemeTarihi = fmtTarih(data.duzenlenme_tarihi || data.baslangic_tarihi);
  const showMaas =
    (data.sozlesme_turu === "TAM_ZAMANLI" || data.sozlesme_turu === "KARMA") &&
    (data.maas_plani?.length ?? 0) > 0;
  const showDers = data.sozlesme_turu === "DERS_UCRETLI" || data.sozlesme_turu === "KARMA";
  const brandBits = [data.sube_ad, data.kurum?.telefon_sabit].filter(Boolean);
  const th: React.CSSProperties = {
    background: ACCENT,
    color: "#fff",
    padding: "5px 7px",
    textAlign: "left",
    fontWeight: 600,
    fontSize: 7.5,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  };
  const td: React.CSSProperties = {
    padding: "4.5px 7px",
    borderBottom: `1px solid ${LINE}`,
  };

  return (
    <div
      style={{
        fontFamily: '"Helvetica Neue", Helvetica, Arial, "Segoe UI", sans-serif',
        color: INK,
        fontSize: 9.5,
        lineHeight: 1.4,
        maxWidth: "190mm",
        margin: "0 auto",
        padding: "8px 4px",
        background: "#fff",
      }}
    >
      <style jsx global>{`
        @page { size: A4; margin: 12mm 11mm; }
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>

      {/* Header — koyu banner: şube login logosu burada görünür */}
      <header
        style={{
          display: "grid",
          gridTemplateColumns: "auto 1fr auto",
          gap: 12,
          alignItems: "center",
          padding: "14px 16px",
          marginBottom: 14,
          borderRadius: 8,
          background: `linear-gradient(135deg, ${ACCENT} 0%, #2563eb 100%)`,
          color: "#fff",
        }}
      >
        <img
          src={logoSrc}
          alt="Logo"
          style={{ height: 44, width: "auto", maxWidth: 160, objectFit: "contain" }}
        />
        <div>
          <h1 style={{ margin: 0, fontSize: 13, fontWeight: 700, letterSpacing: "-0.02em", color: "#fff" }}>
            {kurumAd}
          </h1>
          {brandBits.length > 0 && (
            <p style={{ margin: "2px 0 0", fontSize: 8, color: "rgba(255,255,255,.8)" }}>
              {brandBits.join(" · ")}
            </p>
          )}
        </div>
        <div style={{ textAlign: "right", fontSize: 8, color: "rgba(255,255,255,.8)", lineHeight: 1.35 }}>
          <strong
            style={{
              display: "block",
              color: "#fff",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.02em",
            }}
          >
            {data.sozlesme_no}
          </strong>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
            <span>Doğrulama: {data.dogrulama_kodu}</span>
            <QRCode value={qrValue} size={40} bordered={false} color="#fff" bgColor="transparent" />
          </div>
        </div>
      </header>

      {/* Title */}
      <div style={{ textAlign: "center", marginBottom: 14 }}>
        <h2
          style={{
            margin: 0,
            fontSize: 12.5,
            fontWeight: 800,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: ACCENT,
          }}
        >
          {belgeBasligi}
        </h2>
        <div style={{ marginTop: 4, fontSize: 8, color: MUTED }}>
          Düzenleme: {duzenlemeTarihi} · Eğitim yılı: {data.egitim_yili_display}
        </div>
      </div>

      {/* Taraflar */}
      <Section title="Taraflar">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div>
            <div
              style={{
                fontSize: 8,
                fontWeight: 700,
                color: MUTED,
                textTransform: "uppercase",
                letterSpacing: 0.6,
                marginBottom: 4,
              }}
            >
              İşveren
            </div>
            <Kv
              rows={[
                { label: "Kurum", value: kurumAd },
                { label: "Şube", value: data.sube_ad },
                { label: "Adres", value: data.kurum?.adres },
                { label: "Telefon", value: data.kurum?.telefon_sabit },
              ]}
            />
          </div>
          <div>
            <div
              style={{
                fontSize: 8,
                fontWeight: 700,
                color: MUTED,
                textTransform: "uppercase",
                letterSpacing: 0.6,
                marginBottom: 4,
              }}
            >
              İşçi
            </div>
            <Kv
              rows={[
                { label: "Ad soyad", value: data.personel_ad },
                { label: "TC kimlik no", value: data.personel_tc },
                { label: "Personel no", value: data.personel_no_snapshot },
                {
                  label: "Branş / görev",
                  value: [data.brans_snapshot, data.gorev_snapshot].filter(Boolean).join(" · ") || "—",
                },
                { label: "Departman", value: data.departman_snapshot },
              ]}
            />
          </div>
        </div>
      </Section>

      {/* Özet — fact table, not chips */}
      <Section title="Sözleşme Özeti">
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 8.5 }}>
          <tbody>
            {[
              [
                { h: "Çalışma tipi", v: turLabel },
                { h: "Durum", v: data.durum_display },
              ],
              [
                { h: "Başlangıç", v: fmtTarih(data.baslangic_tarihi) },
                { h: "Bitiş", v: fmtTarih(data.bitis_tarihi) },
              ],
              [
                {
                  h: "Toplam süre",
                  v: fmtAySuresi(
                    data.ozet?.toplam_calisma_suresi_ay ??
                      data.toplam_calisma_suresi_ay ??
                      data.maas_plani?.length ??
                      0,
                  ),
                },
                { h: "Net maaş", v: fmtTL(contractNetMaas(data)) },
              ],
              [
                { h: "Toplam net bedel", v: fmtTL(data.toplam_sozlesme_bedeli ?? 0) },
                {
                  h: "Haftalık / SGK",
                  v: `${data.haftalik_calisma_gun_sayisi ?? "—"} gün · ${data.sgk_gun ?? "—"} SGK`,
                },
              ],
            ].map((row, i) => (
              <tr key={i}>
                {row.flatMap((cell) => [
                  <th
                    key={`${i}-${cell.h}-h`}
                    style={{
                      background: "#f8fafc",
                      fontWeight: 500,
                      color: MUTED,
                      fontSize: 7.5,
                      textTransform: "uppercase",
                      letterSpacing: 0.4,
                      border: `1px solid ${LINE}`,
                      padding: "5px 7px",
                      textAlign: "left",
                      width: "22%",
                    }}
                  >
                    {cell.h}
                  </th>,
                  <td
                    key={`${i}-${cell.h}-v`}
                    style={{
                      fontWeight: 650,
                      color: INK,
                      border: `1px solid ${LINE}`,
                      padding: "5px 7px",
                    }}
                  >
                    {cell.v}
                  </td>,
                ])}
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      {showMaas && (
        <Section title="Aylık Maaş Planı">
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 8.5 }}>
            <thead>
              <tr>
                {["#", "Başlangıç", "Bitiş", "Gün", "Net Maaş", "Açıklama"].map((h) => (
                  <th
                    key={h}
                    style={{
                      ...th,
                      textAlign: h === "Net Maaş" || h === "Gün" ? (h === "Gün" ? "center" : "right") : "left",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(data.maas_plani ?? []).map((row, idx) => (
                <tr key={row.sira_no} style={{ background: idx % 2 ? "#fafbfc" : "#fff" }}>
                  <td style={td}>{row.sira_no}</td>
                  <td style={td}>{fmtTarih(row.baslangic_tarihi)}</td>
                  <td style={td}>{fmtTarih(row.bitis_tarihi)}</td>
                  <td style={{ ...td, textAlign: "center" }}>{row.calisilan_gun}</td>
                  <td style={{ ...td, textAlign: "right", fontWeight: 650 }}>{fmtTL(row.maas)}</td>
                  <td style={{ ...td, color: MUTED }}>{row.aciklama || "—"}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td
                  colSpan={4}
                  style={{
                    background: "#f1f5f9",
                    fontWeight: 700,
                    borderTop: `1.5px solid ${ACCENT}`,
                    padding: "6px 7px",
                  }}
                >
                  Toplam net bedel
                </td>
                <td
                  style={{
                    background: "#f1f5f9",
                    fontWeight: 700,
                    borderTop: `1.5px solid ${ACCENT}`,
                    padding: "6px 7px",
                    textAlign: "right",
                  }}
                >
                  {fmtTL(data.toplam_sozlesme_bedeli ?? 0)}
                </td>
                <td style={{ background: "#f1f5f9", borderTop: `1.5px solid ${ACCENT}` }} />
              </tr>
            </tfoot>
          </table>
        </Section>
      )}

      {showDers && (
        <Section title="Ders Ücreti">
          <Kv
            rows={[
              {
                label: "Ücret tipi",
                value:
                  data.ders_ucret_tipi === "SAAT_BASI"
                    ? "Saatlik"
                    : data.ders_ucret_tipi === "DERS_BASI"
                      ? "Ders başı"
                      : "—",
              },
              { label: "Birim ücret", value: fmtTLDec(data.ders_birim_ucret ?? 0) },
              ...(data.ders_ucretleri ?? []).map((du) => ({
                label: du.brans_ad || "Genel",
                value: `${fmtTLDec(du.birim_ucret)} / ${du.ucret_tipi_display}`,
              })),
            ]}
          />
        </Section>
      )}

      <Section title="Çalışma Düzeni">
        <div style={{ display: "grid", gridTemplateColumns: "0.9fr 1.4fr", gap: 14, alignItems: "start" }}>
          <Kv
            rows={[
              { label: "Haftalık çalışma", value: `${data.haftalik_calisma_gun_sayisi ?? "—"} gün` },
              { label: "SGK gün", value: String(data.sgk_gun ?? "—") },
              {
                label: "Haftalık izin",
                value: (data.haftalik_izin_gunleri || []).map((g) => GUN_ADLARI[g - 1]).join(", ") || "—",
              },
            ]}
          />
          {data.mesai_saatleri && data.mesai_saatleri.length > 0 ? (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 8 }}>
              <thead>
                <tr>
                  {["Gün", "Başlangıç", "Bitiş", "Mola (dk)"].map((h) => (
                    <th key={h} style={th}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.mesai_saatleri.map((m) => (
                  <tr key={m.gun}>
                    <td style={td}>{GUN_ADLARI[m.gun - 1]}</td>
                    <td style={td}>{m.aktif ? m.baslangic || "—" : "İzin"}</td>
                    <td style={td}>{m.aktif ? m.bitis || "—" : "—"}</td>
                    <td style={{ ...td, textAlign: "center" }}>
                      {m.aktif ? m.mola_dakika || 0 : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p style={{ margin: 0, color: MUTED, fontSize: 8.5 }}>Tanımlı mesai yok.</p>
          )}
        </div>
      </Section>

      {data.maddeler && data.maddeler.length > 0 && (
        <Section title="Sözleşme Maddeleri">
          <ol style={{ margin: 0, paddingLeft: 16 }}>
            {data.maddeler.map((m) => (
              <li key={m.sira} style={{ marginBottom: 5, fontSize: 9, color: "#334155" }}>
                {m.metin}
              </li>
            ))}
          </ol>
        </Section>
      )}

      {data.notlar && (
        <Section title="Ek Notlar">
          <p
            style={{
              margin: 0,
              fontSize: 9,
              color: "#57534e",
              padding: "6px 0",
              borderTop: `1px dashed ${LINE}`,
            }}
          >
            {data.notlar}
          </p>
        </Section>
      )}

      {/* Signatures */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 36,
          marginTop: 28,
          pageBreakInside: "avoid",
        }}
      >
        {[
          { title: "İşveren / Kurum Yetkilisi", lines: ["Ad soyad · İmza · Kaşe"] },
          { title: "İşçi / Personel", lines: [data.personel_ad || "—", "İmza"] },
        ].map((box) => (
          <div key={box.title} style={{ borderTop: `1.5px solid ${ACCENT}`, paddingTop: 8, minHeight: 56 }}>
            <strong style={{ display: "block", fontSize: 9, color: ACCENT }}>{box.title}</strong>
            {box.lines.map((line) => (
              <span key={line} style={{ display: "block", fontSize: 8, color: MUTED, marginTop: 3 }}>
                {line}
              </span>
            ))}
          </div>
        ))}
      </div>

      <div
        style={{
          marginTop: 18,
          paddingTop: 8,
          borderTop: `1px solid ${LINE}`,
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          fontSize: 7.5,
          color: MUTED,
        }}
      >
        <span>
          {data.sozlesme_no} · {data.personel_ad} · Doğrulama: {data.dogrulama_kodu}
        </span>
        <span style={{ color: ACCENT, fontWeight: 600 }}>3K Kampüs · {belgeBasligi}</span>
      </div>
    </div>
  );
}
