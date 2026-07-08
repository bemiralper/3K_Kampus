"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";
import { OverviewDagilimItem } from "../../services/dashboard-api";
import { CHART_COLORS, fmtCurrency } from "../dashboard-utils";
import { IconPieChart } from "../dashboard-icons";

interface Props {
  title: string;
  data: OverviewDagilimItem[];
  nameKey: "yontem" | "kategori_adi" | "kaynak_label";
  emptyText: string;
}

export default function DashboardPieChart({ title, data, nameKey, emptyText }: Props) {
  const chartData = data.map((d) => ({
    name: (d[nameKey] as string) || "Belirtilmemiş",
    value: d.toplam,
    oran: d.oran,
  }));

  return (
    <div className="fdash-chart-card">
      <div className="fdash-chart-card__head">
        <IconPieChart />
        <h3>{title}</h3>
      </div>
      <div className="fdash-chart-card__body">
        {chartData.length === 0 ? (
          <div className="fdash-chart-empty">{emptyText}</div>
        ) : (
          <div style={{ width: "100%", height: 200, minHeight: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={42}
                  outerRadius={68}
                  paddingAngle={2}
                >
                  {chartData.map((entry, i) => (
                    <Cell key={`${entry.name}-${i}`} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value?: number) => fmtCurrency(value ?? 0)}
                  contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #e5e7eb" }}
                />
                <Legend wrapperStyle={{ fontSize: 10 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
