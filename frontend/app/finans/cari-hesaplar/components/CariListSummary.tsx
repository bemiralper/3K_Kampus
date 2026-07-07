"use client";

import type { CariListTotals } from "./cari-list-totals";
import { fmtCariMoney } from "./cari-list-totals";

export default function CariListSummary({
  totals,
  title = "Liste Özeti",
  subtitle,
}: {
  totals: CariListTotals;
  title?: string;
  subtitle?: string;
}) {
  return (
    <div className="cari-bakiye-rapor-summary">
      <div className="cari-bakiye-rapor-summary__meta">
        <span className="cari-bakiye-rapor-summary__title">{title}</span>
        {subtitle && (
          <span className="cari-bakiye-rapor-summary__range">{subtitle}</span>
        )}
      </div>
      <div className="cari-bakiye-rapor-summary__stats">
        <div className="cari-bakiye-rapor-stat">
          <span>Toplam Cari</span>
          <strong>{totals.toplam_cari}</strong>
        </div>
        <div className="cari-bakiye-rapor-stat">
          <span>Toplam Borç</span>
          <strong>{fmtCariMoney(totals.toplam_borc)} ₺</strong>
        </div>
        <div className="cari-bakiye-rapor-stat">
          <span>Toplam Alacak</span>
          <strong>{fmtCariMoney(totals.toplam_alacak)} ₺</strong>
        </div>
        <div className="cari-bakiye-rapor-stat cari-bakiye-rapor-stat--wide">
          <span>Net Bakiye</span>
          <strong>{fmtCariMoney(totals.net_bakiye)} ₺</strong>
        </div>
        <div className="cari-bakiye-rapor-stat">
          <span>Toplam Satış</span>
          <strong>{fmtCariMoney(totals.toplam_satis)} ₺</strong>
        </div>
        <div className="cari-bakiye-rapor-stat">
          <span>Toplam Alış</span>
          <strong>{fmtCariMoney(totals.toplam_alis)} ₺</strong>
        </div>
        <div className="cari-bakiye-rapor-stat">
          <span>Toplam Tahsilat</span>
          <strong>{fmtCariMoney(totals.toplam_tahsilat)} ₺</strong>
        </div>
        <div className="cari-bakiye-rapor-stat">
          <span>Toplam Ödeme</span>
          <strong>{fmtCariMoney(totals.toplam_odeme)} ₺</strong>
        </div>
      </div>
    </div>
  );
}
