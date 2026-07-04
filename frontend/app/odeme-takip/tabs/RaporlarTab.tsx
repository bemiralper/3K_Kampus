"use client";

import { DashboardOzet, Taksit, OgrenciRiskSkoru } from "../types";
import { formatCurrency, formatDate } from "../helpers";

const KURUM_COLOR = "#0262a7";

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
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12, color: "#374151" }}>💰 Finans Özeti</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12, marginBottom: 24 }}>
            <div style={{ padding: 16, borderRadius: 12, background: "#f0f7ff", border: "1px solid #dbeafe" }}>
              <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 500, marginBottom: 6 }}>Brüt Toplam</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: KURUM_COLOR }}>{formatCurrency(dashboard.brut_toplam)}</div>
            </div>
            <div style={{ padding: 16, borderRadius: 12, background: "#fef2f2", border: "1px solid #fecaca" }}>
              <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 500, marginBottom: 6 }}>İndirim</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#dc2626" }}>-{formatCurrency(dashboard.toplam_indirim)}</div>
            </div>
            <div style={{ padding: 16, borderRadius: 12, background: "#f5f3ff", border: "1px solid #e9d5ff" }}>
              <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 500, marginBottom: 6 }}>Net Tutar</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#7c3aed" }}>{formatCurrency(dashboard.toplam_hacim)}</div>
            </div>
            <div style={{ padding: 16, borderRadius: 12, background: "#ecfdf5", border: "1px solid #bbf7d0" }}>
              <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 500, marginBottom: 6 }}>Tahsil Edilen</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#059669" }}>{formatCurrency(dashboard.toplam_tahsilat)}</div>
            </div>
            <div style={{ padding: 16, borderRadius: 12, background: "#fffbeb", border: "1px solid #fde68a" }}>
              <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 500, marginBottom: 6 }}>Kalan</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#d97706" }}>{formatCurrency(dashboard.acik_alacak)}</div>
            </div>
            <div style={{ padding: 16, borderRadius: 12, background: "#fef2f2", border: "1px solid #fecaca" }}>
              <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 500, marginBottom: 6 }}>Gecikmiş</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#dc2626" }}>{formatCurrency(dashboard.geciken_tutar)}</div>
              <div style={{ fontSize: 10, color: "#991b1b", marginTop: 2 }}>{dashboard.geciken_taksit_sayisi} taksit</div>
            </div>
          </div>

          {/* ──── DASHBOARD METRİKLERİ (4'lü) ──── */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
            <div style={{ padding: 20, borderRadius: 12, background: "#fff", border: "1px solid #e5e7eb" }}>
              <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 500, marginBottom: 8 }}>📊 Tahsilat Oranı</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: tahsilatOrani >= 80 ? "#059669" : tahsilatOrani >= 50 ? "#d97706" : "#dc2626" }}>
                %{tahsilatOrani}
              </div>
              <div style={{ marginTop: 8, height: 6, borderRadius: 3, background: "#e5e7eb" }}>
                <div style={{ height: "100%", borderRadius: 3, background: tahsilatOrani >= 80 ? "#059669" : tahsilatOrani >= 50 ? "#d97706" : "#dc2626", width: `${Math.min(tahsilatOrani, 100)}%`, transition: "width .5s" }} />
              </div>
            </div>

            <div style={{ padding: 20, borderRadius: 12, background: "#ecfdf5", border: "1px solid transparent" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: 12, color: "#6b7280", fontWeight: 500 }}>Bu Ay Tahsilat</span>
                <span style={{ fontSize: 20 }}>📅</span>
              </div>
              <div style={{ fontSize: 24, fontWeight: 700, color: "#059669" }}>{formatCurrency(dashboard.bu_ay_tahsilat)}</div>
            </div>

            <div style={{ padding: 20, borderRadius: 12, background: "#f0f7ff", border: "1px solid transparent" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: 12, color: "#6b7280", fontWeight: 500 }}>Ort. Tahsil Süresi</span>
                <span style={{ fontSize: 20 }}>⏱️</span>
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                <span style={{ fontSize: 28, fontWeight: 700, color: dashboard.ort_tahsil_suresi <= 0 ? "#059669" : dashboard.ort_tahsil_suresi <= 7 ? "#d97706" : "#dc2626" }}>
                  {dashboard.ort_tahsil_suresi}
                </span>
                <span style={{ fontSize: 14, color: "#6b7280" }}>gün</span>
              </div>
              <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>
                {dashboard.ort_tahsil_suresi <= 0 ? "Vadeden önce ödeniyor 👍" : dashboard.ort_tahsil_suresi <= 7 ? "Normal aralık" : "Gecikme eğilimi var ⚠️"}
              </div>
            </div>

            {genelRisk && (
              <div style={{ padding: 20, borderRadius: 12, background: "#fff", border: "1px solid #e5e7eb" }}>
                <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 500, marginBottom: 8 }}>⚡ Genel Risk</div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <span style={{ fontSize: 28, fontWeight: 700, color: genelRisk.color }}>{genelRisk.skor}</span>
                  <span style={{ fontSize: 14, fontWeight: 600, color: genelRisk.color }}>{genelRisk.label}</span>
                </div>
                <div style={{ marginTop: 8, height: 6, borderRadius: 3, background: "#e5e7eb" }}>
                  <div style={{ height: "100%", borderRadius: 3, background: genelRisk.color, width: `${genelRisk.skor}%`, transition: "width .5s" }} />
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* ──── ÖĞRENCİ BAZLI RİSK SKORU TABLOSU ──── */}
      <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12, color: "#374151" }}>📈 Öğrenci Bazlı Risk Skoru</h3>
      {riskSkorlari.length === 0 ? (
        <div style={{ padding: 24, textAlign: "center", background: "#f9fafb", borderRadius: 10, color: "#9ca3af", fontSize: 13, marginBottom: 24 }}>
          Risk verisi hesaplamak için yeterli sözleşme/taksit bulunamadı
        </div>
      ) : (
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden", background: "#fff", marginBottom: 24 }}>
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
      <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>🚨 Vadesi Geçen Taksitler</h3>
      {vadesiGecenler.length === 0 ? (
        <div style={{ padding: 24, textAlign: "center", background: "#ecfdf5", borderRadius: 10, color: "#059669", fontWeight: 600 }}>
          ✅ Vadesi geçmiş taksit yok — Harika!
        </div>
      ) : (
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden", background: "#fff" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#fef2f2" }}>
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
