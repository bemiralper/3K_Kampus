"use client";

import Link from "next/link";
import { OverviewTransaction } from "../../services/dashboard-api";
import { useDashboardLinks } from "../useDashboardLinks";
import { VADE_BORDER, VadeDurumu, fmtShortDate, fmtTutar } from "../dashboard-utils";
import { IconCalendarClock, IconCheckCircle } from "../dashboard-icons";

interface Props {
  rows: OverviewTransaction[];
}

export default function DashboardUpcomingDues({ rows }: Props) {
  const links = useDashboardLinks();

  return (
    <div className="card-modern h-full">
      <div className="card-modern-header">
        <h3>
          <IconCalendarClock className="w-[18px] h-[18px]" />
          Vadesi Gelen
        </h3>
        <Link href={links.donemTahsilat} className="text-xs text-blue-600 hover:underline">
          Dönem özeti
        </Link>
      </div>
      <div className="card-modern-body p-0">
        <div className="finans-table-wrap max-h-80 overflow-y-auto">
          <table className="table-modern">
            <thead>
              <tr>
                <th></th>
                <th>Kaynak</th>
                <th>Kişi</th>
                <th>Vade</th>
                <th className="text-right">Tutar</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center cell-secondary py-10">
                    <IconCheckCircle className="w-8 h-8 mx-auto mb-2 text-emerald-400" />
                    Yaklaşan vade yok
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const durum = (r.vade_durumu || "normal") as VadeDurumu;
                  const action = links.tahsilatAction(r);
                  return (
                    <tr key={`${r.kaynak}-${r.id}`} style={{ borderLeft: `3px solid ${VADE_BORDER[durum]}` }}>
                      <td className="w-2 p-0" />
                      <td className="cell-secondary text-xs">{r.kaynak_label}</td>
                      <td>
                        <div>{r.kisi_adi}</div>
                        <div className="cell-secondary text-xs">{r.aciklama}</div>
                      </td>
                      <td className="cell-secondary">{fmtShortDate(r.vade_tarihi || r.tarih)}</td>
                      <td className="text-right cell-money">{fmtTutar(r.tutar)}</td>
                      <td className="text-right">
                        {action ? (
                          <Link href={action.href} className="text-xs text-blue-600 hover:underline whitespace-nowrap">
                            {action.label}
                          </Link>
                        ) : null}
                      </td>
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
