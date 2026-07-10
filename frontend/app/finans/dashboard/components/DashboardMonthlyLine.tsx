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
    <div className="card-modern mb-5">
      <div className="card-modern-header">
        <h3>
          <IconLineChart className="w-[18px] h-[18px]" />
          Bu Ay Günlük Gelir / Gider / Net
        </h3>
      </div>
      <div className="card-modern-body">
        {!hasData ? (
          <div className="flex items-center justify-center h-52 cell-secondary text-sm">
            Bu ay henüz hareket yok
          </div>
        ) : (
          <div style={{ width: "100%", height: 260, minHeight: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} width={40} />
                <Tooltip
                  formatter={(value?: number) => fmtCurrency(value ?? 0)}
                  labelFormatter={(label, payload) => {
                    const tarih = payload?.[0]?.payload?.tarih as string | undefined;
                    return tarih ? fmtShortDate(tarih) : String(label ?? "");
                  }}
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
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
