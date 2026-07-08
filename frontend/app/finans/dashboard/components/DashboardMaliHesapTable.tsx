"use client";

import Link from "next/link";
import { OverviewMaliHesap } from "../../services/dashboard-api";
import { useDashboardLinks } from "../useDashboardLinks";
import { fmtTutar } from "../dashboard-utils";
import { IconBank, IconCash, IconInbox } from "../dashboard-icons";

interface Props {
  title: string;
  rows: OverviewMaliHesap[];
  emptyText: string;
  icon?: "kasa" | "banka";
}

export default function DashboardMaliHesapTable({ title, rows, emptyText, icon }: Props) {
  const links = useDashboardLinks();
  const Icon = icon === "banka" ? IconBank : IconCash;

  return (
    <div className="fdash-panel fdash-panel--flush">
      <div className="fdash-panel__head">
        <h3>
          <Icon className="w-[18px] h-[18px]" />
          {title}
        </h3>
        <Link href={links.kasaBanka} className="fdash-panel__link">
          Kasa / Banka →
        </Link>
      </div>
      <div className="fdash-panel__body p-0">
        <div className="finans-table-wrap">
          <table className="table-modern">
            <thead>
              <tr>
                <th>Hesap</th>
                <th className="text-right">Dönem Başı</th>
                <th className="text-right">Gelir</th>
                <th className="text-right">Gider</th>
                <th className="text-right">Bakiye</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center cell-secondary py-10">
                    <IconInbox className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                    {emptyText}
                    <div className="mt-2">
                      <Link href={links.kasaBanka} className="text-xs text-blue-600 hover:underline">
                        Dönem aç / bakiye görüntüle →
                      </Link>
                    </div>
                  </td>
                </tr>
              ) : (
                rows.map((h) => (
                  <tr key={h.mali_hesap_id}>
                    <td>{h.mali_hesap_ad}</td>
                    <td className="text-right cell-secondary">{fmtTutar(h.donem_basi_bakiye)}</td>
                    <td className="text-right cell-secondary">{fmtTutar(h.toplam_gelir)}</td>
                    <td className="text-right cell-secondary">{fmtTutar(h.toplam_gider)}</td>
                    <td className="text-right cell-money">{fmtTutar(h.donem_sonu_bakiye)}</td>
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
