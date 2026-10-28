'use client';

import type { StudentDetailResponse, StudentDetailSectionItem } from '../types';
import v from './KarneVisuals.module.css';

const BRAND = '#0262a7';
const KURUM = '#94a3b8';

function fmt(n: number | null | undefined, digits = 2) {
  if (n == null || Number.isNaN(n)) return '—';
  return n.toLocaleString('tr-TR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function pct(n: number) {
  return `%${Math.round(n)}`;
}

function rate(net: number | null | undefined, count: number | null | undefined) {
  if (!count || count <= 0) return 0;
  return Math.max(0, Math.min(100, ((net || 0) / count) * 100));
}

function shortDate(value: string | null | undefined) {
  const raw = (value || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw.slice(8, 10)}.${raw.slice(5, 7)}.${raw.slice(2, 4)}` : raw;
}

export function successTone(value: number) {
  if (value >= 70) return 'green';
  if (value >= 40) return 'amber';
  return 'red';
}

export function SuccessPill({ value }: { value: number }) {
  return <span className={v.pill} data-tone={successTone(value)}>{pct(value)}</span>;
}

export function questionTotal(detail: StudentDetailResponse) {
  return detail.alan_soru || detail.total_questions || 0;
}

export function answerCounts(detail: StudentDetailResponse) {
  const correct = detail.total_correct || 0;
  const wrong = detail.total_wrong || 0;
  const total = questionTotal(detail);
  const empty = total && detail.exam_type !== 'YKS_AYT'
    ? Math.max(0, total - correct - wrong)
    : detail.total_empty || 0;
  return { correct, wrong, empty };
}

function chartSections(rows: { sd: StudentDetailSectionItem; main: boolean }[]) {
  const usable = (sd: StudentDetailSectionItem) =>
    sd.source !== 'tyt' && sd.alana_dahil !== false && (sd.question_count || 0) > 0;
  const mains = rows.filter(r => r.main && usable(r.sd)).map(r => r.sd);
  if (mains.length >= 3) return mains;
  const parents = new Set(rows.filter(r => !r.main).map(r => r.sd.parent_id));
  return rows
    .filter(r => !(r.main && parents.has(r.sd.section_id)) && usable(r.sd))
    .map(r => r.sd);
}

function Donut({ detail }: { detail: StudentDetailResponse }) {
  const { correct, wrong, empty } = answerCounts(detail);
  const total = correct + wrong + empty || 1;
  const parts = [
    { label: 'Doğru', count: correct, color: '#15803d' },
    { label: 'Yanlış', count: wrong, color: '#dc2626' },
    { label: 'Boş', count: empty, color: '#cbd5e1' },
  ];
  const r = 40;
  const circ = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className={v.card}>
      <div className={v.cardTitle}>Cevap Dağılımı</div>
      <div className={v.donutRow}>
        <svg viewBox="0 0 100 100" className={v.donut} aria-hidden>
          <circle cx="50" cy="50" r={r} fill="none" stroke="#eef2f7" strokeWidth="13" />
          {parts.map(p => {
            const len = (p.count / total) * circ;
            const el = p.count > 0 ? (
              <circle
                key={p.label}
                cx="50" cy="50" r={r} fill="none" stroke={p.color} strokeWidth="13"
                strokeDasharray={`${len} ${circ - len}`}
                strokeDashoffset={-offset}
                transform="rotate(-90 50 50)"
              />
            ) : null;
            offset += len;
            return el;
          })}
          <text x="50" y="52" textAnchor="middle" className={v.donutValue}>{questionTotal(detail) || total}</text>
          <text x="50" y="64" textAnchor="middle" className={v.donutLabel}>soru</text>
        </svg>
        <ul className={v.donutLegend}>
          {parts.map(p => (
            <li key={p.label}>
              <i style={{ background: p.color }} />
              <span>{p.label}</span>
              <b>{p.count}</b>
              <em>{pct((p.count / total) * 100)}</em>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function SeriesLegend() {
  return (
    <span className={v.seriesLegend}>
      <span><i style={{ background: BRAND }} />Öğrenci</span>
      <span><i style={{ background: KURUM }} />Kurum ort.</span>
    </span>
  );
}

function Radar({ axes }: { axes: StudentDetailSectionItem[] }) {
  const n = axes.length;
  const cx = 160;
  const cy = 98;
  const radius = 62;
  const point = (i: number, value: number) => {
    const ang = ((90 - (360 * i) / n) * Math.PI) / 180;
    const rr = (radius * Math.max(0, Math.min(100, value))) / 100;
    return [cx + rr * Math.cos(ang), cy - rr * Math.sin(ang)];
  };
  const poly = (values: number[]) => values.map((val, i) => point(i, val).join(',')).join(' ');
  const student = axes.map(sd => rate(sd.net, sd.question_count));
  const kurum = axes.map(sd => rate(sd.kurum_avg_net, sd.question_count));

  return (
    <svg viewBox="0 0 320 200" className={v.radar} role="img" aria-label="Derslere göre başarı">
      {[25, 50, 75, 100].map(ring => (
        <polygon key={ring} points={poly(axes.map(() => ring))} fill="none" stroke="#dce5ef" strokeWidth="0.7" />
      ))}
      {axes.map((_, i) => {
        const [x, y] = point(i, 100);
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="#dce5ef" strokeWidth="0.7" />;
      })}
      <polygon points={poly(kurum)} fill={KURUM} fillOpacity="0.18" stroke={KURUM} strokeWidth="1" />
      <polygon points={poly(student)} fill={BRAND} fillOpacity="0.2" stroke={BRAND} strokeWidth="1.6" />
      {student.map((val, i) => {
        const [x, y] = point(i, val);
        return <circle key={i} cx={x} cy={y} r="2.2" fill={BRAND} />;
      })}
      {axes.map((sd, i) => {
        const ang = ((90 - (360 * i) / n) * Math.PI) / 180;
        const cos = Math.cos(ang);
        const sin = Math.sin(ang);
        const x = cx + (radius + 10) * cos;
        let y = cy - (radius + 10) * sin;
        if (sin > 0.5) y -= 10;
        else if (sin < -0.5) y += 8;
        const anchor = cos > 0.3 ? 'start' : cos < -0.3 ? 'end' : 'middle';
        const name = sd.section_name.length > 18 ? `${sd.section_name.slice(0, 17)}…` : sd.section_name;
        return (
          <g key={sd.section_id} textAnchor={anchor}>
            <text x={x} y={y} className={v.radarName}>{name}</text>
            <text x={x} y={y + 10} className={v.radarRate}>
              {pct(student[i])} · kurum {pct(kurum[i])}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function PairBars({ axes }: { axes: StudentDetailSectionItem[] }) {
  return (
    <div className={v.pairBars}>
      {axes.map(sd => {
        const student = rate(sd.net, sd.question_count);
        const kurum = rate(sd.kurum_avg_net, sd.question_count);
        return (
          <div key={sd.section_id} className={v.pairRow}>
            <span className={v.pairName}>{sd.section_name}</span>
            <span className={v.pairTracks}>
              <span className={v.pairTrack}><i style={{ width: `${student}%`, background: BRAND }} /></span>
              <span className={v.pairTrack}><i style={{ width: `${kurum}%`, background: KURUM }} /></span>
            </span>
            <span className={v.pairPct}>{pct(student)}<em>{pct(kurum)}</em></span>
          </div>
        );
      })}
    </div>
  );
}

export function KarneOverview({
  detail, rows,
}: {
  detail: StudentDetailResponse;
  rows: { sd: StudentDetailSectionItem; main: boolean }[];
}) {
  const axes = chartSections(rows);
  const { correct, wrong, empty } = answerCounts(detail);
  if (!axes.length && !(correct + wrong + empty)) return null;
  return (
    <div className={v.overview}>
      <Donut detail={detail} />
      <div className={v.card}>
        <div className={v.cardHead}>
          <span className={v.cardTitle}>Derslere Göre Başarı</span>
          <SeriesLegend />
        </div>
        {axes.length >= 3 ? <Radar axes={axes} /> : <PairBars axes={axes} />}
      </div>
    </div>
  );
}

export function KarneComment({ lines }: { lines: string[] }) {
  if (!lines.length) return null;
  return (
    <div className={v.comment}>
      <div className={v.commentTitle}>Değerlendirme</div>
      <ul>
        {lines.map(line => <li key={line}>{line}</li>)}
      </ul>
    </div>
  );
}

export function KarneTrend({ history }: { history: NonNullable<StudentDetailResponse['net_history']> }) {
  const points = history.filter(h => h.toplam_net != null);
  if (points.length < 2) return null;
  const nets = points.map(h => h.toplam_net);
  const delta = nets[nets.length - 1] - nets[nets.length - 2];
  const w = 640;
  const h = 150;
  const slot = (w - 24) / points.length;
  const left = 12 + slot / 2;
  const right = w - 12 - slot / 2;
  const top = 28;
  const bottom = h - 42;
  let lo = Math.min(...nets);
  let hi = Math.max(...nets);
  const pad = Math.max(2, (hi - lo) * 0.15);
  lo -= pad;
  hi += pad;
  const step = (right - left) / (points.length - 1);
  const xy = nets.map((net, i) => [left + step * i, bottom - ((net - lo) / (hi - lo)) * (bottom - top)]);
  const line = xy.map(p => p.join(',')).join(' ');
  const area = `${xy[0][0]},${bottom} ${line} ${xy[xy.length - 1][0]},${bottom}`;
  const maxChars = Math.max(8, Math.floor(slot / 6));

  return (
    <div className={`${v.card} ${v.trendCard}`}>
      <div className={v.cardHead}>
        <span className={v.cardTitle}>
          Net Gelişimi <em className={v.cardSub}>Son {points.length} sınav</em>
        </span>
        {Math.abs(delta) >= 0.05 && (
          <span className={v.chip} data-tone={delta > 0 ? 'green' : 'red'}>
            Önceki sınava göre {delta > 0 ? '+' : '−'}{fmt(Math.abs(delta), 2)} net
          </span>
        )}
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className={v.trend} role="img" aria-label="Net gelişimi">
        {[0, 1, 2, 3].map(k => {
          const y = top + ((bottom - top) * k) / 3;
          return <line key={k} x1={left} x2={right} y1={y} y2={y} stroke="#eef2f7" />;
        })}
        <polygon points={area} fill={BRAND} fillOpacity="0.08" />
        <polyline points={line} fill="none" stroke={BRAND} strokeWidth="2" />
        {points.map((row, i) => {
          const [x, y] = xy[i];
          const current = row.is_current || i === points.length - 1;
          const name = row.exam_name.length > maxChars ? `${row.exam_name.slice(0, maxChars - 1)}…` : row.exam_name;
          return (
            <g key={row.exam_id}>
              <circle cx={x} cy={y} r={current ? 5 : 3.6} fill="#fff" stroke={BRAND} strokeWidth="2" />
              {current && <circle cx={x} cy={y} r="2.4" fill={BRAND} />}
              <text x={x} y={y - 10} textAnchor="middle" className={current ? v.trendValueNow : v.trendValue}>
                {fmt(nets[i], 2)}
              </text>
              <text x={x} y={h - 22} textAnchor="middle" className={current ? v.trendNameNow : v.trendName}>{name}</text>
              <text x={x} y={h - 9} textAnchor="middle" className={v.trendDate}>{shortDate(row.exam_date)}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

type Area = StudentDetailResponse['strong_areas'][number];

function AreaCard({ title, items, tone }: { title: string; items: Area[]; tone: 'green' | 'red' }) {
  return (
    <div className={v.areaCard}>
      <div className={v.areaHead} data-tone={tone}>{title}</div>
      {items.length ? items.map(item => {
        const diff = item.diff_kurum ?? null;
        return (
          <div key={item.name} className={v.areaRow}>
            <b>{item.name}</b>
            {item.basari != null ? <SuccessPill value={item.basari} /> : <span>{fmt(item.net, 2)} net</span>}
            <span className={v.areaDiff} data-tone={diff == null || Math.abs(diff) < 0.05 ? 'muted' : diff > 0 ? 'green' : 'red'}>
              {diff == null || Math.abs(diff) < 0.05 ? '' : `kurum ${diff > 0 ? '+' : '−'}${fmt(Math.abs(diff), 1)}`}
            </span>
          </div>
        );
      }) : <div className={v.areaEmpty}>Kayıt yok</div>}
    </div>
  );
}

export function KarneAreaPair({ detail }: { detail: StudentDetailResponse }) {
  return (
    <div className={v.areaPair}>
      <AreaCard title="Güçlü Alanlar" items={detail.strong_areas || []} tone="green" />
      <AreaCard title="Geliştirilecek Alanlar" items={detail.weak_areas || []} tone="red" />
    </div>
  );
}

export function KarneFocus({ items }: { items: { name: string; detail: string }[] }) {
  if (!items.length) return null;
  return (
    <div className={v.focus}>
      {items.map(item => (
        <div key={`${item.name}-${item.detail}`} className={v.focusRow}>
          <b>{item.name}</b>
          <span>{item.detail}</span>
        </div>
      ))}
    </div>
  );
}
