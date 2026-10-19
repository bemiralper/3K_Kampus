"use client";

import { DashboardOzet, Taksit, OgrenciRiskSkoru } from "../types";
import { formatCurrency, formatDate } from "../helpers";

const KURUM_COLOR = "#0061a6";

interface Props {
  dashboard: DashboardOzet | null;
  vadesiGecenler: Taksit[];
  riskSkorlari: OgrenciRiskSkoru[];
}

const riskSeviyeMap: Record<string, { label: string; color: string; bg: string }> = {
  dusuk: { label: "Düşük Risk", color: "#059669", bg: "#ecfdf5" },
  orta: { label: "Orta Risk", color: "#d97706", bg: "#fffbeb" },
  yuksek: { label: "Yüksek Risk", color: "#dc2626", bg: "#fef2f2" },
  kritik: { label: "Kritik", color: "#991b1b", bg: "#fecaca" },
};

export default function RaporlarTab({ dashboard, vadesiGecenler, riskSkorlari }: Props) {
  // Tahsilat oranı
  const tahsilatOrani = dashboard && dashboard.toplam_hacim > 0
    ? Math.round(dashboard.toplam_tahsilat / dashboard.toplam_hacim * 100)
    : 0;

  // Genel risk skoru
  const genelRisk = dashboard ? (() => {
    if (!dashboard.toplam_hacim || dashboard.toplam_hacim === 0) return { skor: 0, label: "Veri Yok", color: "#9ca3af" };
    const gecikmeOrani = dashboard.geciken_tutar / dashboard.toplam_hacim * 100;
    if (gecikmeOrani === 0) return { skor: 100, label: "Mükemmel", color: "#059669" };
    if (gecikmeOrani < 5) return { skor: 85, label: "İyi", color: "#059669" };
    if (gecikmeOrani < 15) return { skor: 60, label: "Orta", color: "#d97706" };
    if (gecikmeOrani < 30) return { skor: 35, label: "Riskli", color: "#dc2626" };
    return { skor: 10, label: "Kritik", color: "#991b1b" };
  })() : null;

  return (
    <div>
      {dashboard && (
        <>
          {/* ──── FİNANS KARTLARI (6'lı) ──── */}
          <section className="ot-block">
            <h3>Finans özeti</h3>
            <div className="ot-metrics">
              <div className="ot-metric"><span>Brüt toplam</span><strong style={{ color: KURUM_COLOR }}>{formatCurrency(dashboard.brut_toplam)}</strong></div>
              <div className="ot-metric"><span>İndirim</span><strong className="is-neg">-{formatCurrency(dashboard.toplam_indirim)}</strong></div>
              <div className="ot-metric"><span>Net tutar</span><strong>{formatCurrency(dashboard.toplam_hacim)}</strong></div>
              <div className="ot-metric"><span>Tahsil edilen</span><strong className="is-pos">{formatCurrency(dashboard.toplam_tahsilat)}</strong></div>
              <div className="ot-metric"><span>Kalan</span><strong className="is-due">{formatCurrency(dashboard.acik_alacak)}</strong></div>
              <div className="ot-metric">
                <span>Gecikmiş</span>
                <strong className="is-neg">{formatCurrency(dashboard.geciken_tutar)}</strong>
                <small>{dashboard.geciken_taksit_sayisi} taksit</small>
              </div>
            </div>
          </section>

          <div className="ot-metrics ot-metrics--4">
            <div className="ot-metric">
              <span>Tahsilat oranı</span>
              <strong style={{ color: tahsilatOrani >= 80 ? "#059669" : tahsilatOrani >= 50 ? "#b45309" : "#b91c1c" }}>%{tahsilatOrani}</strong>
              <i style={{ width: `${Math.min(tahsilatOrani, 100)}%` }} />
            </div>
            <div className="ot-metric">
              <span>Bu ay tahsilat</span>
              <strong className="is-pos">{formatCurrency(dashboard.bu_ay_tahsilat)}</strong>
            </div>
            <div className="ot-metric">
              <span>Ortalama tahsil süresi</span>
              <strong style={{ color: dashboard.ort_tahsil_suresi <= 0 ? "#059669" : dashboard.ort_tahsil_suresi <= 7 ? "#b45309" : "#b91c1c" }}>
                {dashboard.ort_tahsil_suresi}<small> gün</small>
              </strong>
              <small>
                {dashboard.ort_tahsil_suresi <= 0 ? "Vadeden önce ödeniyor" : dashboard.ort_tahsil_suresi <= 7 ? "Normal aralık" : "Gecikme eğilimi var"}
              </small>
            </div>
            {genelRisk && (
              <div className="ot-metric">
                <span>Genel risk</span>
                <strong style={{ color: genelRisk.color }}>{genelRisk.skor} <small>{genelRisk.label}</small></strong>
                <i style={{ width: `${genelRisk.skor}%`, background: genelRisk.color }} />
              </div>
            )}
          </div>
        </>
      )}

      {/* ──── ÖĞRENCİ BAZLI RİSK SKORU TABLOSU ──── */}
      <h3 className="ot-block-title">Öğrenci bazlı risk</h3>
      {riskSkorlari.length === 0 ? (
        <div className="ot-empty">
          <p>Risk verisi hesaplamak için yeterli sözleşme veya taksit bulunamadı.</p>
        </div>
      ) : (
        <div className="ot-panel ot-scroll">
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#f9fafb" }}>
                <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, color: "#6b7280" }}>Öğrenci</th>
                <th style={{ padding: "10px 14px", textAlign: "center", fontWeight: 600, color: "#6b7280" }}>Risk Skoru</th>
                <th style={{ padding: "10px 14px", textAlign: "center", fontWeight: 600, color: "#6b7280" }}>Seviye</th>
                <th style={{ padding: "10px 14px", textAlign: "center", fontWeight: 600, color: "#6b7280" }}>Gecikme</th>
                <th style={{ padding: "10px 14px", textAlign: "center", fontWeight: 600, color: "#6b7280" }}>Ort. Gün</th>
                <th style={{ padding: "10px 14px", textAlign: "center", fontWeight: 600, color: "#6b7280" }}>Kısmi %</th>
                <th style={{ padding: "10px 14px", textAlign: "center", fontWeight: 600, color: "#6b7280" }}>Vade Uyumu</th>
                <th style={{ padding: "10px 14px", textAlign: "center", fontWeight: 600, color: "#6b7280" }}>Tahsilat</th>
                <th style={{ padding: "10px 14px", textAlign: "right", fontWeight: 600, color: "#6b7280" }}>Kalan Borç</th>
              </tr>
            </thead>
            <tbody>
              {riskSkorlari.map((r) => {
                const seviye = riskSeviyeMap[r.risk_seviye] || riskSeviyeMap.orta;
                return (
                  <tr key={r.ogrenci_id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                    <td style={{ padding: "10px 14px" }}>
                      <div style={{ fontWeight: 600, color: "#111827" }}>{r.ogrenci_adi}</div>
                      {r.ogrenci_no && <div style={{ fontSize: 11, color: "#9ca3af" }}>{r.ogrenci_no}</div>}
                    </td>
                    <td style={{ padding: "10px 14px", textAlign: "center" }}>
                      <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <div style={{ width: 40, height: 6, borderRadius: 3, background: "#e5e7eb" }}>
                          <div style={{ height: "100%", borderRadius: 3, background: seviye.color, width: `${r.risk_skoru}%` }} />
                        </div>
                        <span style={{ fontWeight: 700, color: seviye.color, fontSize: 13 }}>{r.risk_skoru}</span>
                      </div>
                    </td>
                    <td style={{ padding: "10px 14px", textAlign: "center" }}>
                      <span style={{ padding: "2px 10px", borderRadius: 12, fontSize: 11, fontWeight: 600, color: seviye.color, background: seviye.bg }}>
                        {seviye.label}
                      </span>
                    </td>
                    <td style={{ padding: "10px 14px", textAlign: "center", fontWeight: 600, color: r.gecikme_sayisi > 0 ? "#dc2626" : "#059669" }}>
                      {r.gecikme_sayisi} / {r.toplam_taksit}
                    </td>
                    <td style={{ padding: "10px 14px", textAlign: "center", color: r.ort_gecikme_gun > 15 ? "#dc2626" : "#6b7280" }}>
                      {r.ort_gecikme_gun} gün
                    </td>
                    <td style={{ padding: "10px 14px", textAlign: "center", color: r.kismi_oran > 20 ? "#d97706" : "#6b7280" }}>
                      %{r.kismi_oran}
                    </td>
                    <td style={{ padding: "10px 14px", textAlign: "center" }}>
                      <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <div style={{ width: 40, height: 5, borderRadius: 3, background: "#e5e7eb" }}>
                          <div style={{
                            height: "100%", borderRadius: 3,
                            background: (r.vade_uyum_orani ?? 100) >= 100 ? "#059669" : (r.vade_uyum_orani ?? 0) >= 80 ? "#d97706" : "#dc2626",
                            width: `${Math.min(r.vade_uyum_orani ?? 100, 100)}%`,
                          }} />
                        </div>
                        <span style={{ fontWeight: 600, fontSize: 12, color: "#374151" }}>%{r.vade_uyum_orani ?? 100}</span>
                      </div>
                      {(r.vadesi_gelen_sayisi ?? 0) === 0 && (
                        <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 2 }}>Vadesi gelen yok</div>
                      )}
                    </td>
                    <td style={{ padding: "10px 14px", textAlign: "center" }}>
                      <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <div style={{ width: 40, height: 5, borderRadius: 3, background: "#e5e7eb" }}>
                          <div style={{ height: "100%", borderRadius: 3, background: r.odeme_orani >= 80 ? "#059669" : r.odeme_orani >= 50 ? "#d97706" : "#6b7280", width: `${Math.min(r.odeme_orani, 100)}%` }} />
                        </div>
                        <span style={{ fontSize: 12, color: "#6b7280" }}>%{r.odeme_orani}</span>
                      </div>
                    </td>
                    <td style={{ padding: "10px 14px", textAlign: "right", fontWeight: 700, color: r.kalan_borc > 0 ? "#dc2626" : "#059669" }}>
                      {formatCurrency(r.kalan_borc)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ──── VADESİ GEÇEN TAKSİTLER ──── */}
      <h3 className="ot-block-title">Vadesi geçen taksitler</h3>
      {vadesiGecenler.length === 0 ? (
        <div className="ot-empty">
          <p>Vadesi geçmiş taksit yok.</p>
        </div>
      ) : (
        <div className="ot-panel ot-scroll">
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr>
                <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600 }}>Sözleşme</th>
                <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600 }}>Öğrenci</th>
                <th style={{ padding: "10px 14px", textAlign: "center", fontWeight: 600 }}>Taksit #</th>
                <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600 }}>Vade</th>
                <th style={{ padding: "10px 14px", textAlign: "center", fontWeight: 600 }}>Gecikme</th>
                <th style={{ padding: "10px 14px", textAlign: "right", fontWeight: 600 }}>Kalan</th>
              </tr>
            </thead>
            <tbody>
              {vadesiGecenler.map((t) => {
                const gecikmeGun = t.vade_tarihi ? Math.floor((Date.now() - new Date(t.vade_tarihi).getTime()) / 86400000) : 0;
                return (
                  <tr key={t.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                    <td style={{ padding: "10px 14px", fontWeight: 600, color: KURUM_COLOR }}>{t.sozlesme_no}</td>
                    <td style={{ padding: "10px 14px" }}>{t.ogrenci_adi}</td>
                    <td style={{ padding: "10px 14px", textAlign: "center" }}>{t.taksit_no}</td>
                    <td style={{ padding: "10px 14px", color: "#dc2626" }}>{formatDate(t.vade_tarihi)}</td>
                    <td style={{ padding: "10px 14px", textAlign: "center" }}>
                      <span style={{
                        padding: "2px 8px", borderRadius: 10, fontSize: 11, fontWeight: 600,
                        color: gecikmeGun > 30 ? "#991b1b" : "#dc2626",
                        background: gecikmeGun > 30 ? "#fecaca" : "#fef2f2",
                      }}>
                        {gecikmeGun} gün
                      </span>
                    </td>
                    <td style={{ padding: "10px 14px", textAlign: "right", fontWeight: 700, color: "#dc2626" }}>{formatCurrency(t.kalan_tutar)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
