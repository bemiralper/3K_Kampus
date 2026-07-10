"use client";

import type { GiderTaksit } from "@/app/finans/types/gider-types";
import { isCekSenetTip } from "@/lib/finans/paymentMethodUtils";
import { buildGiderTaksitPlanRows } from "@/app/odeme-takip/utils/taksitPlan";

function fmt(v: number) {
  return Number(v).toLocaleString("tr-TR", { minimumFractionDigits: 2 });
}

function fmtDate(d: string) {
  if (!d) return "—";
  const parsed = new Date(d);
  if (Number.isNaN(parsed.getTime())) return d;
  return parsed.toLocaleDateString("tr-TR");
}

export function GiderTaksitCards({
  taksitler,
  odenebilir,
  onPay,
}: {
  taksitler: GiderTaksit[];
  odenebilir?: boolean;
  onPay?: (taksitId: number) => void;
}) {
  return (
    <div className="fd-taksit-list">
      {taksitler.map((t) => {
        const kalan = Number(t.kalan_tutar);
        const isGeciken = t.durum === "bekliyor" && new Date(t.vade_tarihi) < new Date();
        const cekSenetTaksit = isCekSenetTip(t.odeme_yontemi_tip);
        return (
          <div key={t.id} className={`fd-taksit-card${isGeciken ? " is-late" : ""}`}>
            <div className="fd-taksit-card-head">
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className="fd-taksit-no">#{t.taksit_no}</span>
                <span className={`fd-chip ${
                  t.durum === "odendi" ? "fd-chip--emerald" :
                  t.durum === "kismi_odendi" ? "fd-chip--amber" :
                  isGeciken ? "fd-chip--rose" :
                  "fd-chip--neutral"
                }`}>
                  {isGeciken ? "Gecikmiş" : t.durum_display}
                </span>
                {cekSenetTaksit && (
                  <span className="fd-chip fd-chip--amber">Çek/Senet</span>
                )}
              </div>
              {odenebilir && kalan > 0 && t.durum !== "iptal" && onPay && !cekSenetTaksit && (
                <button
                  type="button"
                  onClick={() => onPay(t.id)}
                  className="fd-chip fd-chip--emerald"
                  style={{ cursor: "pointer", border: "none" }}
                >
                  Öde
                </button>
              )}
            </div>
            {cekSenetTaksit && kalan > 0 && (
              <p style={{ fontSize: 11, color: "#64748b", margin: "0 0 8px" }}>
                Ödeme: Finans → Çek/Senet → Verilen sekmesinden takip edin.
              </p>
            )}
            <div className="fd-taksit-grid">
              <div>
                <span className="fd-taksit-field-label">Vade</span>
                <div className="fd-taksit-field-value">{fmtDate(t.vade_tarihi)}</div>
              </div>
              <div>
                <span className="fd-taksit-field-label">Tutar</span>
                <div className="fd-taksit-field-value">{fmt(t.tutar)} ₺</div>
              </div>
              <div>
                <span className="fd-taksit-field-label">Ödenen</span>
                <div className="fd-taksit-field-value fd-taksit-field-value--emerald">{fmt(t.odenen_tutar)} ₺</div>
              </div>
              <div>
                <span className="fd-taksit-field-label">Kalan</span>
                <div className={`fd-taksit-field-value${kalan > 0 ? " fd-taksit-field-value--rose" : " fd-taksit-field-value--emerald"}`}>
                  {fmt(kalan)} ₺
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function GiderPlannedTaksitCards({
  count,
  netTutar,
  vadeTarihi,
}: {
  count: number;
  netTutar: number;
  vadeTarihi: string;
}) {
  const plan = buildGiderTaksitPlanRows(netTutar, count, vadeTarihi, "aylik");
  return (
    <div className="fd-taksit-list">
      {plan.map((row) => (
          <div key={row.taksit_no} className="fd-taksit-card">
            <div className="fd-taksit-card-head">
              <span className="fd-taksit-no">#{row.taksit_no}</span>
              <span className="fd-chip fd-chip--amber">Planlanan</span>
            </div>
            <div className="fd-taksit-grid">
              <div>
                <span className="fd-taksit-field-label">Planlanan Vade</span>
                <div className="fd-taksit-field-value">{fmtDate(row.vade_tarihi)}</div>
              </div>
              <div>
                <span className="fd-taksit-field-label">Tutar</span>
                <div className="fd-taksit-field-value">{fmt(row.tutar)} ₺</div>
              </div>
            </div>
          </div>
      ))}
    </div>
  );
}

export function GiderOdemeCards({
  odemeler,
}: {
  odemeler: Array<{
    id: number;
    odeme_tarihi: string;
    tutar: number | string;
    odeme_yontemi_adi?: string | null;
    mali_hesap_adi?: string | null;
    taksit_no?: number | null;
    durum: string;
    durum_display: string;
  }>;
}) {
  return (
    <div className="fd-taksit-list">
      {odemeler.map((o) => (
        <div key={o.id} className="fd-odeme-card">
          <div className="fd-odeme-card-head">
            <span style={{ fontSize: 14, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: "#047857" }}>
              {fmt(Number(o.tutar))} ₺
            </span>
            <span className={`fd-chip ${o.durum === "aktif" ? "fd-chip--emerald" : "fd-chip--rose"}`}>
              {o.durum_display}
            </span>
          </div>
          <div className="fd-taksit-grid">
            <div>
              <span className="fd-taksit-field-label">Tarih</span>
              <div className="fd-taksit-field-value">{fmtDate(o.odeme_tarihi)}</div>
            </div>
            <div>
              <span className="fd-taksit-field-label">Taksit</span>
              <div className="fd-taksit-field-value">{o.taksit_no ? `#${o.taksit_no}` : "—"}</div>
            </div>
            <div>
              <span className="fd-taksit-field-label">Yöntem</span>
              <div className="fd-taksit-field-value" style={{ fontWeight: 500, fontSize: 12 }}>{o.odeme_yontemi_adi || "—"}</div>
            </div>
            <div>
              <span className="fd-taksit-field-label">Hesap</span>
              <div className="fd-taksit-field-value" style={{ fontWeight: 500, fontSize: 12 }}>{o.mali_hesap_adi || "—"}</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
