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
    <div className="card-modern h-full">
      <div className="card-modern-header">
        <h3>
          <IconPieChart className="w-[18px] h-[18px]" />
          {title}
        </h3>
      </div>
      <div className="card-modern-body">
        {chartData.length === 0 ? (
          <div className="flex items-center justify-center h-48 cell-secondary text-sm">{emptyText}</div>
        ) : (
          <div style={{ width: "100%", height: 220, minHeight: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={2}
                >
                  {chartData.map((entry, i) => (
                    <Cell key={`${entry.name}-${i}`} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value?: number) => fmtCurrency(value ?? 0)}
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
