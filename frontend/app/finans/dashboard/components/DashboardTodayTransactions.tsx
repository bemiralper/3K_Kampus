"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { OverviewTransaction } from "../../services/dashboard-api";
import { useDashboardLinks } from "../useDashboardLinks";
import { fmtDate, fmtSaat, fmtTutar } from "../dashboard-utils";
import { IconClock, IconInbox } from "../dashboard-icons";

type Filter = "bugun" | "dun" | "7gun";

interface Props {
  rows: OverviewTransaction[];
  allRows?: OverviewTransaction[];
  /** API referans günü — filtreler buna göre hesaplanır. */
  referansTarih?: string;
}

function parseLocalDay(iso: string): Date {
  const d = iso.includes("T") ? new Date(iso) : new Date(iso + "T12:00:00");
  return d;
}

function isSameDay(iso: string, target: Date) {
  const d = parseLocalDay(iso);
  return (
    d.getFullYear() === target.getFullYear() &&
    d.getMonth() === target.getMonth() &&
    d.getDate() === target.getDate()
  );
}

function rowMatchesDay(row: OverviewTransaction, day: Date): boolean {
  const dates = [row.tarih, row.kayit_zamani].filter(Boolean) as string[];
  return dates.some((iso) => isSameDay(iso, day));
}

export default function DashboardTodayTransactions({ rows, allRows, referansTarih }: Props) {
  const [filter, setFilter] = useState<Filter>("bugun");
  const links = useDashboardLinks();

  const filtered = useMemo(() => {
    const anchor = referansTarih ? parseLocalDay(referansTarih) : new Date();
    const yesterday = new Date(anchor);
    yesterday.setDate(yesterday.getDate() - 1);
    const weekAgo = new Date(anchor);
    weekAgo.setDate(weekAgo.getDate() - 7);

    // Bugün: backend zaten işlem/kayıt günü mantığıyla hesapladı — yeniden filtreleme yapma.
    if (filter === "bugun") return rows;

    const source = allRows ?? rows;
    return source.filter((r) => {
      if (filter === "dun") return rowMatchesDay(r, yesterday);
      const dates = [r.tarih, r.kayit_zamani].filter(Boolean) as string[];
      return dates.some((iso) => {
        const dt = parseLocalDay(iso);
        return dt >= weekAgo && dt <= anchor;
      });
    });
  }, [rows, allRows, filter, referansTarih]);

  return (
    <div className="fdash-panel">
      <div className="fdash-panel__head">
        <h3>
          <IconClock className="w-[18px] h-[18px]" />
          Bugünkü İşlemler
        </h3>
        <div className="fdash-panel__actions">
          {(["bugun", "dun", "7gun"] as Filter[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`fdash-filter-btn ${filter === f ? "fdash-filter-btn--active" : ""}`}
            >
              {f === "bugun" ? "Bugün" : f === "dun" ? "Dün" : "7 Gün"}
            </button>
          ))}
        </div>
      </div>
      <div className="fdash-panel__body p-0">
        <div className="finans-table-wrap">
          <table className="table-modern">
            <thead>
              <tr>
                <th>Saat</th>
                <th>Kaynak</th>
                <th>Kişi / Açıklama</th>
                <th>Ödeme</th>
                <th className="text-right">Tutar</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center cell-secondary py-10">
                    <IconInbox className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                    Kayıt bulunamadı
                  </td>
                </tr>
              ) : (
                filtered.map((r) => (
                  <tr key={`${r.kaynak}-${r.id}`}>
                    <td className="cell-secondary">{fmtSaat(r.kayit_zamani || r.tarih)}</td>
                    <td className="cell-secondary">{r.kaynak_label}</td>
                    <td>
                      <div>{r.kisi_adi}</div>
                      <div className="cell-secondary text-xs">{r.aciklama}</div>
                    </td>
                    <td className="cell-secondary">{r.odeme_yontemi || "—"}</td>
                    <td className="text-right cell-money">{fmtTutar(r.tutar)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="fdash-panel__foot">
          <Link href={links.donemTahsilat} className="fdash-panel__link">
            Tüm hareketler →
          </Link>
        </div>
      </div>
    </div>
  );
}
