"use client";

import Link from "next/link";
import { OverviewGiderItem } from "../../services/dashboard-api";
import { useDashboardLinks } from "../useDashboardLinks";
import { fmtDate, fmtSaat, fmtTutar } from "../dashboard-utils";
import { IconArrowUpCircle, IconInbox } from "../dashboard-icons";

interface Props {
  rows: OverviewGiderItem[];
}

function durumClass(durum?: string): string {
  switch (durum) {
    case "odendi":
      return "bg-emerald-50 text-emerald-700";
    case "kismi_odendi":
      return "bg-amber-50 text-amber-700";
    case "onaylandi":
      return "bg-blue-50 text-blue-700";
    case "taslak":
      return "bg-gray-100 text-gray-600";
    default:
      return "bg-gray-50 text-gray-600";
  }
}

export default function DashboardRecentGider({ rows }: Props) {
  const links = useDashboardLinks();

  return (
    <div className="fdash-panel fdash-panel--flush">
      <div className="fdash-panel__head">
        <h3>
          <IconArrowUpCircle className="w-[18px] h-[18px]" />
          Son Giderler
        </h3>
        <Link href={links.giderIslemleri} className="fdash-panel__link">
          Detay →
        </Link>
      </div>
      <div className="fdash-panel__body p-0">
        <div className="finans-table-wrap max-h-72 overflow-y-auto">
          <table className="table-modern">
            <thead>
              <tr>
                <th>Tedarikçi</th>
                <th>Kategori</th>
                <th>Durum</th>
                <th className="text-right">Net</th>
                <th className="text-right">Kalan</th>
                <th>Vade</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center cell-secondary py-10">
                    <IconInbox className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                    Gider kaydı yok
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link href={links.giderIslemleri} className="hover:text-blue-600 hover:underline">
                        {r.cari_hesap_adi}
                      </Link>
                      {r.odeme_yontemi_adi && (
                        <div className="cell-secondary text-xs">{r.odeme_yontemi_adi}</div>
                      )}
                    </td>
                    <td className="cell-secondary">{r.kategori_adi || "—"}</td>
                    <td>
                      <span
                        className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${durumClass(r.durum)}`}
                      >
                        {r.durum_label || "—"}
                      </span>
                    </td>
                    <td className="text-right cell-money">{fmtTutar(r.net_tutar ?? r.tutar)}</td>
                    <td className="text-right cell-money">{fmtTutar(r.kalan_tutar ?? 0)}</td>
                    <td className="cell-secondary whitespace-nowrap">
                      {fmtDate(r.vade_tarihi || r.odeme_tarihi)}
                      <span className="block text-xs">{fmtSaat(r.kayit_zamani)}</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
