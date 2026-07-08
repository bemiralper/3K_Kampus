"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { OverviewGunlukSeri } from "../../services/dashboard-api";
import { fmtCurrency, fmtShortDate } from "../dashboard-utils";
import { IconLineChart } from "../dashboard-icons";

interface Props {
  data: OverviewGunlukSeri[];
}

export default function DashboardMonthlyLine({ data }: Props) {
  const chartData = data.map((d) => ({
    ...d,
    label: fmtShortDate(d.tarih),
  }));

  const hasData = chartData.some((d) => d.gelir > 0 || d.gider > 0);

  return (
    <div className="fdash-chart-card">
      <div className="fdash-chart-card__head">
        <IconLineChart />
        <h3>Bu Ay Günlük Gelir / Gider / Net</h3>
      </div>
      <div className="fdash-chart-card__body">
        {!hasData ? (
          <div className="fdash-chart-empty">Bu ay henüz hareket yok</div>
        ) : (
          <div style={{ width: "100%", height: 240, minHeight: 240 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} width={36} />
                <Tooltip
                  formatter={(value?: number) => fmtCurrency(value ?? 0)}
                  labelFormatter={(label, payload) => {
                    const tarih = payload?.[0]?.payload?.tarih as string | undefined;
                    return tarih ? fmtShortDate(tarih) : String(label ?? "");
                  }}
                  contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #e5e7eb" }}
                />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Line type="monotone" dataKey="gelir" name="Gelir" stroke="#059669" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="gider" name="Gider" stroke="#dc2626" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="net" name="Net" stroke="#0262a7" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
