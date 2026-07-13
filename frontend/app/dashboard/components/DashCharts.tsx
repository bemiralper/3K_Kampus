'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ChartPoint } from '@/lib/admin-dashboard-api';

export const CHART_COLORS = ['#0262a7', '#0ea5e9', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#64748b'];

type ChartCardProps = {
  title: string;
  data: ChartPoint[];
  emptyText?: string;
  href?: string;
};

function Empty({ text }: { text: string }) {
  return <div className="adm-chart-empty">{text}</div>;
}

export function DashBarChart({ title, data, emptyText = 'Veri yok', href }: ChartCardProps) {
  const chartData = data.filter((d) => d.value > 0);
  return (
    <ChartShell title={title} href={href}>
      {chartData.length === 0 ? (
        <Empty text={emptyText} />
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef2f7" />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={0} angle={-25} textAnchor="end" height={42} />
            <YAxis tick={{ fontSize: 10 }} width={32} allowDecimals={false} />
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
            <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={28}>
              {chartData.map((_, i) => (
                <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartShell>
  );
}

export function DashHBarChart({ title, data, emptyText = 'Veri yok', href }: ChartCardProps) {
  const chartData = [...data].filter((d) => d.value > 0).sort((a, b) => b.value - a.value).slice(0, 8);
  return (
    <ChartShell title={title} href={href}>
      {chartData.length === 0 ? (
        <Empty text={emptyText} />
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart layout="vertical" data={chartData} margin={{ top: 0, right: 8, left: 4, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#eef2f7" />
            <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
            <YAxis type="category" dataKey="label" tick={{ fontSize: 10 }} width={72} />
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
            <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={14} fill="#0262a7" />
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartShell>
  );
}

export function DashDonutChart({ title, data, emptyText = 'Veri yok', href }: ChartCardProps) {
  const chartData = data.filter((d) => d.value > 0);
  return (
    <ChartShell title={title} href={href}>
      {chartData.length === 0 ? (
        <Empty text={emptyText} />
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              dataKey="value"
              nameKey="label"
              cx="50%"
              cy="50%"
              innerRadius="52%"
              outerRadius="78%"
              paddingAngle={2}
            >
              {chartData.map((_, i) => (
                <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
            <Legend wrapperStyle={{ fontSize: 10 }} />
          </PieChart>
        </ResponsiveContainer>
      )}
    </ChartShell>
  );
}

export function DashLineChart({ title, data, emptyText = 'Veri yok', href }: ChartCardProps) {
  return (
    <ChartShell title={title} href={href}>
      {data.every((d) => d.value === 0) ? (
        <Empty text={emptyText} />
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef2f7" />
            <XAxis dataKey="label" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 10 }} width={36} allowDecimals={false} />
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
            <Line type="monotone" dataKey="value" stroke="#0262a7" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </ChartShell>
  );
}

function ChartShell({
  title,
  href,
  children,
}: {
  title: string;
  href?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="adm-chart-card">
      <div className="adm-chart-card__head">
        <h3>{title}</h3>
        {href && (
          <a href={href} className="adm-chart-card__link">
            Detay →
          </a>
        )}
      </div>
      <div className="adm-chart-card__body">{children}</div>
    </div>
  );
}
