"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { CommunicationDashboardCount } from "@/lib/communication-api";

export const PANEL_COLORS = ["#0262a7", "#0ea5e9", "#10b981", "#f59e0b", "#8b5cf6", "#ef4444", "#14b8a6", "#64748b"];

function Tip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name?: string; value?: number; color?: string; fill?: string }[];
  label?: string | number;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: "#0f172a",
      color: "#fff",
      borderRadius: 10,
      padding: "8px 10px",
      fontSize: 12,
      minWidth: 140,
    }}>
      {label !== undefined && label !== "" && (
        <div style={{ opacity: 0.75, marginBottom: 4 }}>{label}</div>
      )}
      {payload.map((row) => (
        <div key={row.name} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <span>{row.name}</span>
          <strong>{Number(row.value || 0).toLocaleString("tr-TR")}</strong>
        </div>
      ))}
    </div>
  );
}

export function TrendChart({
  data,
}: {
  data: Array<{ label: string; inbound: number; outbound: number; failed: number }>;
}) {
  if (!data.length) return <div className="ipanel-empty">Son 14 günde mesaj yok</div>;
  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="ipIn" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#0262a7" stopOpacity={0.28} />
            <stop offset="95%" stopColor="#0262a7" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="ipOut" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#10b981" stopOpacity={0.22} />
            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="#eef2f7" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} width={32} allowDecimals={false} />
        <Tooltip content={<Tip />} />
        <Area type="monotone" dataKey="inbound" name="Gelen" stroke="#0262a7" fill="url(#ipIn)" strokeWidth={2} />
        <Area type="monotone" dataKey="outbound" name="Giden" stroke="#10b981" fill="url(#ipOut)" strokeWidth={2} />
        <Area type="monotone" dataKey="failed" name="Başarısız" stroke="#ef4444" fill="transparent" strokeWidth={1.5} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function HoursChart({ data }: { data: Array<{ hour: number; count: number }> }) {
  const rows = data.map((row) => ({
    ...row,
    label: `${String(row.hour).padStart(2, "0")}:00`,
  }));
  if (!rows.some((row) => row.count > 0)) {
    return <div className="ipanel-empty">Son 7 günde gelen mesaj yok</div>;
  }
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={rows} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="#eef2f7" vertical={false} />
        <XAxis dataKey="label" interval={3} tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} width={28} allowDecimals={false} />
        <Tooltip content={<Tip />} />
        <Bar dataKey="count" name="Gelen" radius={[5, 5, 0, 0]} fill="#0ea5e9" />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function DonutChart({
  data,
  emptyText,
  centerLabel,
}: {
  data: CommunicationDashboardCount[];
  emptyText: string;
  centerLabel: string;
}) {
  const rows = data.filter((row) => row.count > 0);
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  if (!rows.length) return <div className="ipanel-empty">{emptyText}</div>;
  return (
    <div>
      <div style={{ height: 180, position: "relative" }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={rows}
              dataKey="count"
              nameKey="label"
              cx="50%"
              cy="50%"
              innerRadius="62%"
              outerRadius="90%"
              paddingAngle={rows.length > 1 ? 2 : 0}
              stroke="none"
            >
              {rows.map((row, i) => (
                <Cell key={row.key} fill={PANEL_COLORS[i % PANEL_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip content={<Tip />} />
          </PieChart>
        </ResponsiveContainer>
        <div style={{
          position: "absolute", inset: 0, display: "grid", placeItems: "center", pointerEvents: "none",
        }}>
          <div style={{ textAlign: "center" }}>
            <strong style={{ display: "block", fontSize: 20, color: "#0f172a" }}>{total}</strong>
            <span style={{ fontSize: 11, color: "#64748b" }}>{centerLabel}</span>
          </div>
        </div>
      </div>
      <ul className="ipanel-legend">
        {rows.map((row, i) => (
          <li key={row.key}>
            <i style={{ background: PANEL_COLORS[i % PANEL_COLORS.length] }} />
            {row.label} · {row.count}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AgingChart({ data }: { data: CommunicationDashboardCount[] }) {
  if (!data.some((row) => row.count > 0)) {
    return <div className="ipanel-empty">Cevapsız sohbet yok</div>;
  }
  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, left: 8, bottom: 0 }}>
        <XAxis type="number" hide />
        <YAxis type="category" dataKey="label" width={64} tick={{ fontSize: 12, fill: "#475569" }} axisLine={false} tickLine={false} />
        <Tooltip content={<Tip />} />
        <Bar dataKey="count" name="Sohbet" radius={[0, 6, 6, 0]} fill="#f59e0b" barSize={14} />
      </BarChart>
    </ResponsiveContainer>
  );
}
