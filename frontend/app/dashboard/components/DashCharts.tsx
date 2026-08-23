'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
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
} from 'recharts';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import type { ChartPoint } from '@/lib/admin-dashboard-api';

export const CHART_COLORS = [
  '#0262a7',
  '#0ea5e9',
  '#10b981',
  '#f59e0b',
  '#8b5cf6',
  '#ec4899',
  '#14b8a6',
  '#64748b',
];

export type ValueFormat = 'number' | 'money';

const numberFmt = new Intl.NumberFormat('tr-TR');
const moneyFmt = new Intl.NumberFormat('tr-TR', {
  style: 'currency',
  currency: 'TRY',
  maximumFractionDigits: 0,
});
const compactFmt = new Intl.NumberFormat('tr-TR', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

export function fmtNum(value: number) {
  return numberFmt.format(value || 0);
}

export function fmtMoney(value: number) {
  return moneyFmt.format(value || 0);
}

export function fmtValue(value: number, format: ValueFormat = 'number') {
  return format === 'money' ? fmtMoney(value) : fmtNum(value);
}

function axisTick(value: number, format: ValueFormat) {
  if (format === 'money' || Math.abs(value) >= 10000) return compactFmt.format(value || 0);
  return numberFmt.format(value || 0);
}

export function pctOf(part: number, total: number) {
  if (!total || total <= 0) return 0;
  return Math.round((part / total) * 100);
}

/* ─── Kabuk ──────────────────────────────────────────────────── */

export function DashCard({
  title,
  subtitle,
  href,
  linkLabel = 'Detay',
  action,
  children,
  span,
}: {
  title: string;
  subtitle?: string;
  href?: string;
  linkLabel?: string;
  action?: ReactNode;
  children: ReactNode;
  span?: boolean;
}) {
  return (
    <section className={`adm-card${span ? ' adm-card--span' : ''}`}>
      <header className="adm-card__head">
        <div className="adm-card__titles">
          <h3>{title}</h3>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {action}
        {!action && href && (
          <Link href={href} className="adm-card__link">
            {linkLabel}
            <span aria-hidden="true">→</span>
          </Link>
        )}
      </header>
      <div className="adm-card__body">{children}</div>
    </section>
  );
}

export function DashEmpty({ text }: { text: string }) {
  return (
    <div className="adm-empty">
      <span aria-hidden="true">📊</span>
      <p>{text}</p>
    </div>
  );
}

/* ─── Tooltip ────────────────────────────────────────────────── */

type TipRow = { name: string; value: number; color?: string };

function ChartTooltip({
  active,
  payload,
  label,
  format = 'number',
}: {
  active?: boolean;
  payload?: { name?: string; value?: number; color?: string; fill?: string }[];
  label?: string | number;
  format?: ValueFormat;
}) {
  if (!active || !payload?.length) return null;
  const rows: TipRow[] = payload.map((p) => ({
    name: String(p.name ?? ''),
    value: Number(p.value ?? 0),
    color: p.color || p.fill,
  }));
  return (
    <div className="adm-tip">
      {label !== undefined && label !== '' && <div className="adm-tip__label">{label}</div>}
      {rows.map((row) => (
        <div key={row.name} className="adm-tip__row">
          <i className="adm-tip__dot" style={{ background: row.color || '#0262a7' }} />
          <span className="adm-tip__name">{row.name}</span>
          <strong>{fmtValue(row.value, format)}</strong>
        </div>
      ))}
    </div>
  );
}

/* ─── Donut + okunur açıklama listesi ────────────────────────── */

export function DashDonut({
  data,
  format = 'number',
  emptyText = 'Veri yok',
  centerLabel,
  colors = CHART_COLORS,
}: {
  data: ChartPoint[];
  format?: ValueFormat;
  emptyText?: string;
  centerLabel?: string;
  colors?: string[];
}) {
  const rows = data.filter((d) => d.value > 0);
  const total = rows.reduce((sum, d) => sum + d.value, 0);

  if (rows.length === 0) return <DashEmpty text={emptyText} />;

  return (
    <div className="adm-donut">
      <div className="adm-donut__chart">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={rows}
              dataKey="value"
              nameKey="label"
              cx="50%"
              cy="50%"
              innerRadius="62%"
              outerRadius="92%"
              paddingAngle={rows.length > 1 ? 2 : 0}
              stroke="none"
            >
              {rows.map((row, i) => (
                <Cell key={row.label} fill={colors[i % colors.length]} />
              ))}
            </Pie>
            <Tooltip content={<ChartTooltip format={format} />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="adm-donut__center">
          <strong>{fmtValue(total, format)}</strong>
          <span>{centerLabel || 'Toplam'}</span>
        </div>
      </div>
      <ul className="adm-legend">
        {rows.map((row, i) => (
          <li key={row.label}>
            <i className="adm-legend__dot" style={{ background: colors[i % colors.length] }} />
            <span className="adm-legend__label">{row.label}</span>
            <span className="adm-legend__value">{fmtValue(row.value, format)}</span>
            <span className="adm-legend__pct">{pctOf(row.value, total)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ─── Sıralı yatay bar listesi (CSS — mobilde de okunur) ─────── */

export function DashRankList({
  data,
  format = 'number',
  emptyText = 'Veri yok',
  limit = 8,
  colors = CHART_COLORS,
}: {
  data: ChartPoint[];
  format?: ValueFormat;
  emptyText?: string;
  limit?: number;
  colors?: string[];
}) {
  const rows = [...data]
    .filter((d) => d.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);

  if (rows.length === 0) return <DashEmpty text={emptyText} />;

  const max = rows[0].value || 1;

  return (
    <ul className="adm-rank">
      {rows.map((row, i) => (
        <li key={row.label}>
          <div className="adm-rank__top">
            <span className="adm-rank__label" title={row.label}>
              {row.label}
            </span>
            <strong className="adm-rank__value">{fmtValue(row.value, format)}</strong>
          </div>
          <div className="adm-rank__track">
            <div
              className="adm-rank__fill"
              style={{
                width: `${Math.max(4, Math.round((row.value / max) * 100))}%`,
                background: colors[i % colors.length],
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

/* ─── Trend (alan grafiği) ───────────────────────────────────── */

export function DashTrend({
  data,
  format = 'number',
  emptyText = 'Veri yok',
  seriesName = 'Değer',
  color = '#0262a7',
}: {
  data: ChartPoint[];
  format?: ValueFormat;
  emptyText?: string;
  seriesName?: string;
  color?: string;
}) {
  const isNarrow = useMediaQuery('(max-width: 640px)');
  const gradientId = `admTrend-${seriesName.replace(/\W+/g, '')}`;

  if (!data.length || data.every((d) => d.value === 0)) return <DashEmpty text={emptyText} />;

  const tickInterval = isNarrow ? Math.max(1, Math.ceil(data.length / 4) - 1) : 0;

  return (
    <div className="adm-chart">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.26} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#eef2f7" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: '#64748b' }}
            interval={tickInterval}
            tickMargin={8}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: '#94a3b8' }}
            width={44}
            tickFormatter={(v: number) => axisTick(v, format)}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<ChartTooltip format={format} />} />
          <Area
            type="monotone"
            dataKey="value"
            name={seriesName}
            stroke={color}
            strokeWidth={2.5}
            fill={`url(#${gradientId})`}
            dot={{ r: 3, fill: color, strokeWidth: 0 }}
            activeDot={{ r: 5 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ─── Yığın bar (kız/erkek) — mobilde CSS listesine döner ────── */

export type StackedRow = { label: string; kiz: number; erkek: number; toplam: number };

export function DashStackedBars({
  data,
  emptyText = 'Veri yok',
}: {
  data: StackedRow[];
  emptyText?: string;
}) {
  const isNarrow = useMediaQuery('(max-width: 767px)');
  const rows = data.filter((d) => d.toplam > 0);

  if (rows.length === 0) return <DashEmpty text={emptyText} />;

  if (isNarrow) {
    const max = Math.max(...rows.map((r) => r.toplam), 1);
    return (
      <ul className="adm-split">
        {rows.map((row) => (
          <li key={row.label}>
            <div className="adm-split__top">
              <span className="adm-split__label">{row.label}</span>
              <strong>{fmtNum(row.toplam)}</strong>
            </div>
            <div
              className="adm-split__track"
              style={{ width: `${Math.max(6, Math.round((row.toplam / max) * 100))}%` }}
            >
              {row.kiz > 0 && (
                <span
                  className="adm-split__kiz"
                  style={{ flexGrow: row.kiz }}
                  title={`Kız ${fmtNum(row.kiz)}`}
                />
              )}
              {row.erkek > 0 && (
                <span
                  className="adm-split__erkek"
                  style={{ flexGrow: row.erkek }}
                  title={`Erkek ${fmtNum(row.erkek)}`}
                />
              )}
            </div>
            <div className="adm-split__meta">
              <span><i className="adm-legend__dot adm-legend__dot--kiz" /> {fmtNum(row.kiz)}</span>
              <span><i className="adm-legend__dot adm-legend__dot--erkek" /> {fmtNum(row.erkek)}</span>
            </div>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="adm-chart">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 10, right: 8, left: 0, bottom: 0 }} barGap={0}>
          <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#eef2f7" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: '#64748b' }}
            interval={0}
            tickMargin={8}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: '#94a3b8' }}
            width={40}
            allowDecimals={false}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(2, 98, 167, 0.06)' }} />
          <Bar dataKey="kiz" stackId="s" name="Kız" fill="#ec4899" maxBarSize={44} />
          <Bar dataKey="erkek" stackId="s" name="Erkek" fill="#0262a7" maxBarSize={44} radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ─── Oran kartı (tahsilat vb.) ──────────────────────────────── */

export function DashRatio({
  rows,
  ratio,
  ratioLabel,
}: {
  rows: { label: string; value: number; tone?: 'green' | 'amber' | 'slate'; format?: ValueFormat }[];
  ratio: number;
  ratioLabel: string;
}) {
  const safe = Math.max(0, Math.min(100, ratio));
  return (
    <div className="adm-ratio">
      <div className="adm-ratio__gauge" role="img" aria-label={`${ratioLabel}: %${safe}`}>
        <div className="adm-ratio__track">
          <div className="adm-ratio__fill" style={{ width: `${safe}%` }} />
        </div>
        <div className="adm-ratio__pct">
          <strong>%{safe}</strong>
          <span>{ratioLabel}</span>
        </div>
      </div>
      <ul className="adm-ratio__rows">
        {rows.map((row) => (
          <li key={row.label} className={row.tone ? `is-${row.tone}` : undefined}>
            <span>{row.label}</span>
            <strong>{fmtValue(row.value, row.format || 'money')}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}
