"use client";

import Link from "next/link";
import { OverviewTransaction } from "../../services/dashboard-api";
import { useDashboardLinks } from "../useDashboardLinks";
import { fmtDate, fmtSaat, fmtTutar } from "../dashboard-utils";
import { IconArrowDownCircle, IconInbox } from "../dashboard-icons";

interface Props {
  rows: OverviewTransaction[];
}

export default function DashboardRecentTahsilat({ rows }: Props) {
  const links = useDashboardLinks();

  return (
    <div className="card-modern h-full">
      <div className="card-modern-header">
        <h3>
          <IconArrowDownCircle className="w-[18px] h-[18px]" />
          Son Tahsilatlar
        </h3>
        <Link href={links.donemTahsilat} className="text-xs text-blue-600 hover:underline">
          Detay
        </Link>
      </div>
      <div className="card-modern-body p-0">
        <div className="finans-table-wrap max-h-72 overflow-y-auto">
          <table className="table-modern">
            <thead>
              <tr>
                <th>Tarih</th>
                <th>Kaynak</th>
                <th>Kişi</th>
                <th className="text-right">Tutar</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-center cell-secondary py-10">
                    <IconInbox className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                    Tahsilat kaydı yok
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const detayHref = links.tahsilatDetay(r);
                  return (
                    <tr key={`${r.kaynak}-${r.id}`}>
                      <td className="cell-secondary whitespace-nowrap">
                        {fmtDate(r.tarih)}
                        <span className="block text-xs">{fmtSaat(r.kayit_zamani)}</span>
                      </td>
                      <td className="cell-secondary">{r.kaynak_label}</td>
                      <td>
                        {detayHref ? (
                          <Link href={detayHref} className="hover:text-blue-600 hover:underline">
                            {r.kisi_adi}
                          </Link>
                        ) : (
                          r.kisi_adi
                        )}
                      </td>
                      <td className="text-right cell-money">{fmtTutar(r.tutar)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
