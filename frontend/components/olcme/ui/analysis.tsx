'use client';

/**
 * Analiz panellerinin ortak yapı taşları.
 *
 * Paneller daha önce her biri kendi başlık/kart/boş-durum işaretlemesini
 * tekrarlıyordu. Buradaki bileşenler tek kaynak: aynı boşluk, aynı tipografi,
 * aynı boş durum dili. Grafikler yalnızca sayıyla anlaşılmayan bir şeyi
 * gösterdiğinde kullanılır (dağılım, kıyas, yayılım).
 */
import type { ReactNode } from 'react';

import Icon from './Icon';
import type { IconName } from './Icon';
import s from './analysis.module.css';

/* ── Panel kabuğu ─────────────────────────────────────────────────────── */

export function Panel({ title, subtitle, icon, actions, flush, children }: {
  title: string;
  subtitle?: ReactNode;
  icon?: IconName;
  actions?: ReactNode;
  /** Tablo gibi kenara yaslanması gereken içerikler için iç boşluğu kaldırır. */
  flush?: boolean;
  children: ReactNode;
}) {
  return (
    <section className={s.panel}>
      <header className={s.panelHead}>
        <div style={{ minWidth: 0 }}>
          <h3 className={s.panelTitle}>
            {icon && <Icon name={icon} size={16} />}
            {title}
          </h3>
          {subtitle && <p className={s.panelSubtitle}>{subtitle}</p>}
        </div>
        {actions && <div className={s.panelActions}>{actions}</div>}
      </header>
      <div className={flush ? s.panelBodyFlush : s.panelBody}>{children}</div>
    </section>
  );
}

/* ── Boş durum ────────────────────────────────────────────────────────── */

export function EmptyState({ icon = 'info', title, description, action }: {
  icon?: IconName;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className={s.empty}>
      <span className={s.emptyIcon}><Icon name={icon} size={22} /></span>
      <p className={s.emptyTitle}>{title}</p>
      {description && <p className={s.emptyDesc}>{description}</p>}
      {action}
    </div>
  );
}

/* ── İstatistik kartı ─────────────────────────────────────────────────── */

export type Tone = 'default' | 'blue' | 'green' | 'red' | 'amber' | 'violet';

const TONE_COLOR: Record<Tone, string | undefined> = {
  default: undefined,
  blue: '#0262a7',
  green: '#16a34a',
  red: '#ef4444',
  amber: '#d97706',
  violet: '#7c3aed',
};

export function StatGrid({ children }: { children: ReactNode }) {
  return <div className={s.statGrid}>{children}</div>;
}

export function Stat({ value, label, tone = 'default', hint, info, accent }: {
  value: ReactNode;
  label: string;
  tone?: Tone;
  hint?: string;
  /** Terim açıklaması (InfoTip gibi) — etiketin yanında gösterilir. */
  info?: ReactNode;
  /** Sol kenarda renkli şerit ister misin? */
  accent?: boolean;
}) {
  const color = TONE_COLOR[tone];
  return (
    <div
      className={`${s.stat} ${accent && color ? s.statAccent : ''}`}
      style={accent && color ? { borderLeftColor: color } : undefined}
    >
      <span className={s.statValue} style={color ? { color } : undefined}>{value}</span>
      <span className={s.statLabel}>{label}{info}</span>
      {hint && <span className={s.statHint}>{hint}</span>}
    </div>
  );
}

/* ── Yayılım göstergesi ───────────────────────────────────────────────── */

/**
 * En düşük · medyan · ortalama · en yüksek değerleri tek eksende gösterir.
 * Dört ayrı sayı kartından farkı: aradaki mesafeyi görünür kılar, yani
 * sınıfın dağınık mı toplu mu olduğunu bir bakışta anlatır.
 */
export function SpreadBar({ min, median, mean, max, sd, title = 'Net yayılımı', unit = '' }: {
  min: number;
  median: number;
  mean: number;
  max: number;
  sd?: number;
  title?: string;
  unit?: string;
}) {
  const lo = Math.min(min, mean, median, max);
  const hi = Math.max(min, mean, median, max);
  const span = hi - lo;

  const header = (
    <div className={s.spreadHead}>
      <span className={s.spreadTitle}>
        <Icon name="chart" size={13} />
        {title}
      </span>
      {sd != null && <span className={s.spreadSd}>Standart sapma {sd}</span>}
    </div>
  );

  // Tüm değerler aynıysa eksen anlamsız olur ve dört etiket tek noktada
  // üst üste biner; bunun yerine tek bir ifade gösterilir.
  if (span <= 0) {
    return (
      <div className={s.spread}>
        {header}
        <p className={s.spreadFlat}>
          Tüm öğrenciler aynı sonucu aldı: <strong>{min}{unit}</strong>
        </p>
      </div>
    );
  }

  const marks = [
    { key: 'min',    value: min,    label: 'En düşük',  color: '#ef4444' },
    { key: 'median', value: median, label: 'Medyan',    color: '#7c3aed' },
    { key: 'mean',   value: mean,   label: 'Ortalama',  color: '#2563eb' },
    { key: 'max',    value: max,    label: 'En yüksek', color: '#16a34a' },
  ]
    .map(m => ({ ...m, pct: ((m.value - lo) / span) * 100 }))
    .sort((a, b) => a.pct - b.pct);

  // Birbirine çok yakın etiketleri sırayla alt satıra indirir; aksi hâlde
  // yazılar çakışır (ör. medyan ile ortalama neredeyse eşitken).
  const MIN_GAP = 16;
  let lastRowPct = -Infinity;
  let row = 0;
  const placed = marks.map(m => {
    row = m.pct - lastRowPct < MIN_GAP ? row + 1 : 0;
    if (row === 0) lastRowPct = m.pct;
    return { ...m, row };
  });
  const rowCount = Math.max(...placed.map(m => m.row)) + 1;

  return (
    <div className={s.spread}>
      {header}
      <div className={s.spreadTrack} style={{ marginBottom: 14 + rowCount * 30 }}>
        <div
          className={s.spreadFill}
          style={{ left: `${((min - lo) / span) * 100}%`, right: `${100 - ((max - lo) / span) * 100}%` }}
        />
        {placed.map(m => (
          <span key={m.key} className={s.spreadMark} style={{ left: `${m.pct}%`, background: m.color }}>
            <span className={s.spreadMarkLabel} style={{ top: 18 + m.row * 30 }}>
              <b>{m.value}{unit}</b>
              {m.label}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

/* ── Histogram ────────────────────────────────────────────────────────── */

export function Histogram({ data }: {
  data: { label: string; count: number }[];
}) {
  const max = Math.max(...data.map(d => d.count), 1);
  const total = data.reduce((acc, d) => acc + d.count, 0);
  return (
    <div className={s.histogram}>
      {data.map((d, i) => {
        const pct = (d.count / max) * 100;
        const share = total > 0 ? Math.round((d.count / total) * 100) : 0;
        return (
          <div key={i} className={s.histBar} title={`${d.label}: ${d.count} öğrenci (%${share})`}>
            <span className={`${s.histCount} ${d.count === 0 ? s.histEmpty : ''}`}>{d.count}</span>
            <div className={s.histFill} style={{ height: `${Math.max(pct, 1)}%` }} />
            <span className={s.histLabel}>{d.label}</span>
          </div>
        );
      })}
    </div>
  );
}

/* ── Yatay kıyas çubuğu ───────────────────────────────────────────────── */

/**
 * Aynı eksende birden çok satırı kıyaslar. `reference` verilirse (ör. genel
 * ortalama) çubukların üstüne turuncu bir referans çizgisi çizilir; böylece
 * her satırın ortalamanın altında mı üstünde mi olduğu okunur.
 */
export function CompareBars({ rows, max, reference, unit = '', referenceLabel = 'Genel ortalama' }: {
  rows: { key: string | number; name: string; value: number; tone?: string }[];
  max?: number;
  reference?: number;
  unit?: string;
  referenceLabel?: string;
}) {
  const top = max ?? Math.max(...rows.map(r => r.value), 1);
  const refPct = reference != null && top > 0 ? (reference / top) * 100 : null;

  return (
    <div>
      {rows.map(r => (
        <div key={r.key} className={s.compareRow}>
          <span className={s.compareName} title={r.name}>{r.name}</span>
          <div className={s.compareTrack}>
            <div
              className={s.compareFill}
              style={{
                width: `${top > 0 ? Math.max((r.value / top) * 100, 1) : 0}%`,
                ...(r.tone ? { background: r.tone } : {}),
              }}
            />
            {refPct != null && (
              <span className={s.compareAvgLine} style={{ left: `${refPct}%` }} />
            )}
          </div>
          <span className={s.compareValue}>{r.value}{unit}</span>
        </div>
      ))}
      {refPct != null && (
        <div className={s.legend}>
          <span className={s.legendItem}>
            <span className={s.legendSwatch} style={{ background: '#f59e0b' }} />
            {referenceLabel}: <strong>{reference}{unit}</strong>
          </span>
        </div>
      )}
    </div>
  );
}

/* ── Rozet ────────────────────────────────────────────────────────────── */

export function Tag({ tone = 'slate', children }: {
  tone?: 'green' | 'amber' | 'red' | 'blue' | 'slate';
  children: ReactNode;
}) {
  const cls = {
    green: s.tagGreen, amber: s.tagAmber, red: s.tagRed,
    blue: s.tagBlue, slate: s.tagSlate,
  }[tone];
  return <span className={`${s.tag} ${cls}`}>{children}</span>;
}

/* ── Trend şeridi ─────────────────────────────────────────────────────── */

/** `direction` backend sözleşmesiyle aynı: 'up' | 'down' | 'same'. */
export function TrendBar({ direction, children }: {
  direction: 'up' | 'down' | 'same';
  children: ReactNode;
}) {
  const cls = direction === 'up' ? s.trendUp : direction === 'down' ? s.trendDown : s.trendFlat;
  const icon: IconName = direction === 'up' ? 'chevronUp' : direction === 'down' ? 'chevronDown' : 'chevronRight';
  return (
    <div className={`${s.trend} ${cls}`}>
      <Icon name={icon} size={16} strokeWidth={2.5} />
      <span>{children}</span>
    </div>
  );
}
