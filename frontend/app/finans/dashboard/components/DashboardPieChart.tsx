"use client";

import { OverviewDagilimItem } from "../../services/dashboard-api";
import { CHART_COLORS, fmtCurrency } from "../dashboard-utils";
import { IconPieChart } from "../dashboard-icons";

interface Props {
  title: string;
  data: OverviewDagilimItem[];
  nameKey: "yontem" | "kategori_adi" | "kaynak_label";
  emptyText: string;
}

const MAX_ROWS = 6;
const DIGER_COLOR = "#94a3b8";

interface ShareRow {
  name: string;
  value: number;
  oran: number;
  color: string;
  grouped?: number;
}

function fmtOran(n: number) {
  return `${n.toLocaleString("tr-TR", { maximumFractionDigits: 1 })}%`;
}

function buildRows(data: OverviewDagilimItem[], nameKey: Props["nameKey"]): ShareRow[] {
  const items = data
    .map((d) => ({
      name: (d[nameKey] as string) || "Belirtilmemiş",
      value: Number(d.toplam) || 0,
    }))
    .filter((d) => d.value > 0)
    .sort((a, b) => b.value - a.value);

  const total = items.reduce((sum, row) => sum + row.value, 0);
  const oranOf = (value: number) => (total ? (value / total) * 100 : 0);

  if (items.length <= MAX_ROWS) {
    return items.map((row, i) => ({
      ...row,
      oran: oranOf(row.value),
      color: CHART_COLORS[i % CHART_COLORS.length],
    }));
  }

  const head = items.slice(0, MAX_ROWS - 1);
  const rest = items.slice(MAX_ROWS - 1);
  const digerValue = rest.reduce((sum, row) => sum + row.value, 0);
  return [
    ...head.map((row, i) => ({
      ...row,
      oran: oranOf(row.value),
      color: CHART_COLORS[i % CHART_COLORS.length],
    })),
    {
      name: "Diğer",
      value: digerValue,
      oran: oranOf(digerValue),
      color: DIGER_COLOR,
      grouped: rest.length,
    },
  ];
}

export default function DashboardPieChart({ title, data, nameKey, emptyText }: Props) {
  const rows = buildRows(data, nameKey);
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  const grouped = rows.find((row) => row.grouped);

  return (
    <div className="card-modern h-full">
      <div className="card-modern-header">
        <h3>
          <IconPieChart className="w-[18px] h-[18px]" />
          {title}
        </h3>
      </div>
      <div className="card-modern-body">
        {rows.length === 0 ? (
          <div className="fdash-share-empty">{emptyText}</div>
        ) : (
          <div className="fdash-share">
            <ul className="fdash-share__list">
              {rows.map((row, index) => (
                <li key={`${row.name}-${index}`} className="fdash-share__row">
                  <div className="fdash-share__label">
                    <span className="fdash-share__dot" style={{ background: row.color }} />
                    <span className="fdash-share__name" title={row.name}>
                      {row.name}
                      {row.grouped ? ` (${row.grouped})` : ""}
                    </span>
                  </div>
                  <div className="fdash-share__figures">
                    <span className="fdash-share__amount">{fmtCurrency(row.value)}</span>
                    <span className="fdash-share__oran">{fmtOran(row.oran)}</span>
                  </div>
                  <div className="fdash-share__track" aria-hidden="true">
                    <div
                      className="fdash-share__fill"
                      style={{ width: `${Math.max(row.oran, 1.5)}%`, background: row.color }}
                    />
                  </div>
                </li>
              ))}
            </ul>
            <div className="fdash-share__foot">
              <span>
                {grouped
                  ? `En büyük ${MAX_ROWS - 1} kalem. Kalan ${grouped.grouped} kalem Diğer altında.`
                  : `${rows.length} kalem`}
              </span>
              <strong>{fmtCurrency(total)}</strong>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
