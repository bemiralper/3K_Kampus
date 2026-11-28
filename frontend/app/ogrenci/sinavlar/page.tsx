'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  ArrowDownRight,
  ArrowUpRight,
  Award,
  BarChart3,
  ChevronDown,
  ChevronUp,
  Download,
  Eye,
  EyeOff,
  Filter,
  Layers,
  Radar,
  Search,
  Sparkles,
  Target,
  Ticket,
  TrendingUp,
  Trophy,
} from 'lucide-react';
import {
  studentPortalApi,
  type ExamDetailResponse,
  type ExamOverviewItem,
  type ExamsOverviewResponse,
} from '@/lib/student-portal-api';

type RangeWindow = '10' | '20' | 'ALL';
type ArchiveSort = 'newest' | 'best_net' | 'best_rank';

interface MetricOption {
  key: string;
  label: string;
  isGroup: boolean;
  color: string;
}

function formatShortDateTR(iso: string | null | undefined): string {
  if (!iso) return 'Tarihsiz';
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso.slice(5);
  return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
}

function formatFullDateTR(iso: string | null | undefined): string {
  if (!iso) return 'Tarih belirtilmedi';
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function extractMetricValue(item: ExamOverviewItem, metricKey: string): number | null {
  if (metricKey === '__TOTAL__') return item.total_net;
  if (metricKey === '__SCORE__') return item.score > 0 ? item.score : null;

  const matched = item.sections.find(
    (s) => (s.metric_key || `ders:${s.name}`) === metricKey,
  );
  if (matched) return matched.net;

  // Geriye uyumlu isim eşlemesi (yaprak ders öncelikli)
  const rawName = metricKey.replace(/^(ders|grup):/, '');
  const leaf = item.sections.find((s) => !s.is_parent_group && s.name === rawName);
  if (leaf) return leaf.net;
  const anySec = item.sections.find((s) => s.name === rawName);
  return anySec ? anySec.net : null;
}

function buildSmoothPath(pts: Array<{ x: number; y: number }>): string {
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
  let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i += 1) {
    const p0 = pts[i];
    const p1 = pts[i + 1];
    const midX = ((p0.x + p1.x) / 2).toFixed(1);
    d += ` C ${midX} ${p0.y.toFixed(1)}, ${midX} ${p1.y.toFixed(1)}, ${p1.x.toFixed(1)} ${p1.y.toFixed(1)}`;
  }
  return d;
}

function PrecisionExamChart({
  items,
  selectedMetric,
  metricLabel,
  metricColor,
  selectedExamId,
  isMixedTypes,
  onSelectExam,
}: {
  items: ExamOverviewItem[];
  selectedMetric: string;
  metricLabel: string;
  metricColor: string;
  selectedExamId: number | null;
  isMixedTypes: boolean;
  onSelectExam: (examId: number) => void;
}) {
  const [hoveredExamId, setHoveredExamId] = useState<number | null>(null);

  const series = useMemo(() => {
    const mapped: Array<{
      exam: ExamOverviewItem;
      value: number;
    }> = [];
    for (const item of items) {
      const val = extractMetricValue(item, selectedMetric);
      if (val !== null) {
        mapped.push({ exam: item, value: val });
      }
    }
    return mapped;
  }, [items, selectedMetric]);

  if (series.length === 0) {
    return (
      <div className="sp-empty-box" style={{ padding: '28px 16px' }}>
        <BarChart3 size={28} />
        <p>Seçili branş için bu sınav grubunda veri bulunmuyor.</p>
      </div>
    );
  }

  const width = 820;
  const height = 248;
  const padLeft = 48;
  const padRight = 26;
  const padTop = 30;
  const padBottom = 34;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const vals = series.map((s) => s.value);
  const rawMin = Math.min(...vals);
  const rawMax = Math.max(...vals);
  const avgVal = vals.reduce((acc, v) => acc + v, 0) / vals.length;
  const bestVal = rawMax;

  const margin = Math.max(2.5, (rawMax - rawMin) * 0.16);
  const minVal = Math.max(selectedMetric === '__SCORE__' ? 100 : -5, Math.floor((rawMin - margin) / 5) * 5);
  const maxVal = Math.ceil((rawMax + margin) / 5) * 5;
  const span = Math.max(5, maxVal - minVal);

  const toY = (v: number) => padTop + (1 - (v - minVal) / span) * plotH;
  const toX = (idx: number) =>
    series.length === 1 ? padLeft + plotW / 2 : padLeft + (idx / (series.length - 1)) * plotW;

  const coords = series.map((pt, idx) => {
    // 3-sınavlık hareketli ortalama (yalnızca aynı tür sınavlarda anlamlı)
    const winStart = Math.max(0, idx - 2);
    const slice = series.slice(winStart, idx + 1);
    const ma = slice.reduce((a, b) => a + b.value, 0) / slice.length;
    return {
      ...pt,
      idx,
      x: toX(idx),
      y: toY(pt.value),
      maY: toY(ma),
    };
  });

  // X ekseni etiket seyreltme: 5 sınav da olsa 100 sınav da olsa en fazla 7 tarih etiketi
  const maxTicks = 7;
  const tickStep = Math.max(1, Math.ceil((coords.length - 1) / (maxTicks - 1)));
  const xTickIndices = new Set<number>();
  for (let i = 0; i < coords.length; i += tickStep) {
    xTickIndices.add(i);
  }
  xTickIndices.add(coords.length - 1);

  // En yüksek net noktasının indeksi
  let bestIdx = 0;
  for (let i = 1; i < coords.length; i += 1) {
    if (coords[i].value >= coords[bestIdx].value) bestIdx = i;
  }

  const focusedId = hoveredExamId ?? selectedExamId ?? coords[coords.length - 1].exam.exam_id;
  const focusedPoint =
    coords.find((c) => c.exam.exam_id === focusedId) || coords[coords.length - 1];

  // Karışık ("Tüm Arşiv") görünümde TYT ve AYT noktalarını ayrı renk serileriyle çiz
  const groupedPaths = (() => {
    if (!isMixedTypes) {
      const mainPath = buildSmoothPath(coords);
      const areaPath =
        coords.length > 1
          ? `${mainPath} L ${coords[coords.length - 1].x.toFixed(1)} ${(padTop + plotH).toFixed(1)} L ${coords[0].x.toFixed(1)} ${(padTop + plotH).toFixed(1)} Z`
          : '';
      const maPath =
        coords.length >= 3 ? buildSmoothPath(coords.map((c) => ({ x: c.x, y: c.maY }))) : '';
      return { single: { mainPath, areaPath, maPath }, multi: [] };
    }

    const byType = new Map<string, Array<{ x: number; y: number }>>();
    for (const c of coords) {
      const t = c.exam.exam_type_short || c.exam.exam_type;
      const arr = byType.get(t) || [];
      arr.push({ x: c.x, y: c.y });
      byType.set(t, arr);
    }
    const palette = ['#4f46e5', '#f97316', '#10b981', '#ec4899'];
    const multi = Array.from(byType.entries()).map(([tLabel, pts], i) => ({
      label: tLabel,
      color: palette[i % palette.length],
      path: buildSmoothPath(pts),
    }));
    return { single: null, multi };
  })();

  const yTicks = [0, 0.33, 0.66, 1].map((r) => {
    const val = minVal + r * span;
    return { val, y: toY(val) };
  });

  const avgY = toY(avgVal);

  return (
    <div>
      {/* Canlı Odak Sınav Bilgi Şeridi (Hover veya Seçili Sınav) */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          padding: '11px 14px',
          marginBottom: 10,
          borderRadius: 13,
          border: '1px solid var(--sp-border)',
          background: 'var(--sp-surface-2)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <span
            className="sp-chip sp-chip-accent"
            style={{ fontWeight: 700, flexShrink: 0 }}
          >
            {focusedPoint.exam.exam_type_short || focusedPoint.exam.exam_type_label}
          </span>
          <div style={{ minWidth: 0 }}>
            <strong
              style={{
                display: 'block',
                fontSize: 14,
                color: 'var(--sp-ink)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {focusedPoint.exam.exam_name}
            </strong>
            <span style={{ fontSize: 12, color: 'var(--sp-muted)' }}>
              {formatFullDateTR(focusedPoint.exam.exam_date)} ·{' '}
              {focusedPoint.exam.total_correct}D / {focusedPoint.exam.total_wrong}Y /{' '}
              {focusedPoint.exam.total_empty}B
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ textAlign: 'right' }}>
            <span style={{ display: 'block', fontSize: 11, color: 'var(--sp-muted)' }}>
              {metricLabel}
            </span>
            <strong style={{ fontSize: 17, color: metricColor }}>
              {focusedPoint.value}
              {selectedMetric === '__SCORE__' ? ' Puan' : ' Net'}
            </strong>
          </div>

          {selectedMetric === '__TOTAL__' && focusedPoint.exam.net_delta != null ? (
            <span
              className={`sp-chip ${
                focusedPoint.exam.net_delta >= 0 ? 'sp-chip-emerald' : 'sp-chip-warm'
              }`}
              style={{ fontWeight: 700 }}
            >
              {focusedPoint.exam.net_delta >= 0 ? (
                <ArrowUpRight size={13} />
              ) : (
                <ArrowDownRight size={13} />
              )}
              {focusedPoint.exam.net_delta >= 0 ? '+' : ''}
              {focusedPoint.exam.net_delta} net
            </span>
          ) : null}

          {focusedPoint.exam.kurum_rank ? (
            <span className="sp-chip" style={{ fontWeight: 600 }}>
              Kurum #{focusedPoint.exam.kurum_rank}/{focusedPoint.exam.kurum_total}
            </span>
          ) : null}
        </div>
      </div>

      {/* Temiz Ölçeklenebilir Grafik Tuvali */}
      <div style={{ width: '100%' }}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible' }}
          onMouseLeave={() => setHoveredExamId(null)}
        >
          <defs>
            <linearGradient id="spRadarAreaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={metricColor} stopOpacity="0.24" />
              <stop offset="100%" stopColor={metricColor} stopOpacity="0.01" />
            </linearGradient>
          </defs>

          {/* Yatay Kılavuz Çizgileri */}
          {yTicks.map((t, i) => (
            <g key={i}>
              <line
                x1={padLeft}
                y1={t.y}
                x2={width - padRight}
                y2={t.y}
                stroke="var(--sp-border)"
                strokeDasharray="3 4"
              />
              <text
                x={padLeft - 8}
                y={t.y + 4}
                textAnchor="end"
                fontSize="11"
                fill="var(--sp-muted)"
              >
                {Math.round(t.val)}
              </text>
            </g>
          ))}

          {/* Dönem Ortalaması Referans Çizgisi */}
          {!isMixedTypes && coords.length >= 2 ? (
            <g>
              <line
                x1={padLeft}
                y1={avgY}
                x2={width - padRight}
                y2={avgY}
                stroke="var(--sp-emerald)"
                strokeWidth="1.2"
                strokeDasharray="5 5"
                opacity="0.65"
              />
              <text
                x={width - padRight}
                y={avgY - 5}
                textAnchor="end"
                fontSize="10"
                fontWeight="600"
                fill="var(--sp-emerald)"
              >
                Ort: {avgVal.toFixed(1)}
              </text>
            </g>
          ) : null}

          {/* Seçili/Hover Nokta Dikey Rehberi */}
          <line
            x1={focusedPoint.x}
            y1={padTop}
            x2={focusedPoint.x}
            y2={padTop + plotH}
            stroke={metricColor}
            strokeWidth="1.2"
            strokeDasharray="3 3"
            opacity="0.4"
          />

          {/* Tek Tür Eğri + 3-Sınav Trend Çizgisi VEYA Çoklu Tür Ayrı Eğriler */}
          {groupedPaths.single ? (
            <>
              {groupedPaths.single.areaPath ? (
                <path d={groupedPaths.single.areaPath} fill="url(#spRadarAreaGrad)" />
              ) : null}
              {groupedPaths.single.maPath ? (
                <path
                  d={groupedPaths.single.maPath}
                  fill="none"
                  stroke="var(--sp-muted)"
                  strokeWidth="1.6"
                  strokeDasharray="4 4"
                  opacity="0.55"
                />
              ) : null}
              <path
                d={groupedPaths.single.mainPath}
                fill="none"
                stroke={metricColor}
                strokeWidth="2.8"
                strokeLinecap="round"
              />
            </>
          ) : (
            groupedPaths.multi.map((s) => (
              <path
                key={s.label}
                d={s.path}
                fill="none"
                stroke={s.color}
                strokeWidth="2.5"
                strokeLinecap="round"
              />
            ))
          )}

          {/* Seyreltilmiş Temiz X Ekseni Tarih Etiketleri */}
          {coords.map((c) => {
            if (!xTickIndices.has(c.idx)) return null;
            return (
              <text
                key={`xtick-${c.exam.exam_id}`}
                x={c.x}
                y={height - 8}
                textAnchor="middle"
                fontSize="10.5"
                fill="var(--sp-muted)"
              >
                {formatShortDateTR(c.exam.exam_date)}
              </text>
            );
          })}

          {/* İnteraktif Sınav Noktaları — Etiket Çakışması Sıfır */}
          {coords.map((c) => {
            const isSelected = c.exam.exam_id === selectedExamId;
            const isHovered = c.exam.exam_id === hoveredExamId;
            const isBest = c.idx === bestIdx && coords.length > 1;
            const isLatest = c.idx === coords.length - 1;
            const showBadge = isSelected || isHovered || isBest || isLatest;

            const dotRadius =
              isSelected || isHovered
                ? 7
                : coords.length > 35
                  ? 3.6
                  : coords.length > 20
                    ? 4.4
                    : 5.2;

            const dotFill = isSelected
              ? 'var(--sp-warm)'
              : isBest
                ? '#eab308'
                : metricColor;

            return (
              <g
                key={c.exam.exam_id}
                style={{ cursor: 'pointer' }}
                onMouseEnter={() => setHoveredExamId(c.exam.exam_id)}
                onClick={() => onSelectExam(c.exam.exam_id)}
              >
                {/* Geniş görünmez tıklama/hover alanı */}
                <circle cx={c.x} cy={c.y} r={14} fill="transparent" />

                {isSelected || isHovered ? (
                  <circle
                    cx={c.x}
                    cy={c.y}
                    r={dotRadius + 4.5}
                    fill={dotFill}
                    opacity={0.2}
                  />
                ) : null}

                <circle
                  cx={c.x}
                  cy={c.y}
                  r={dotRadius}
                  fill={dotFill}
                  stroke="var(--sp-surface)"
                  strokeWidth="2"
                />

                {showBadge ? (
                  <g transform={`translate(${c.x}, ${Math.max(15, c.y - 13)})`}>
                    <rect
                      x={-22}
                      y={-11}
                      width={44}
                      height={16}
                      rx={5}
                      fill={isSelected ? 'var(--sp-warm)' : 'var(--sp-surface)'}
                      stroke={isSelected ? 'var(--sp-warm)' : 'var(--sp-border-strong)'}
                      strokeWidth="1"
                    />
                    <text
                      x={0}
                      y={0.5}
                      textAnchor="middle"
                      fontSize="10"
                      fontWeight="700"
                      fill={isSelected ? '#ffffff' : 'var(--sp-ink)'}
                    >
                      {c.value}
                    </text>
                  </g>
                ) : null}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Grafik Alt Lejantı */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          marginTop: 8,
          fontSize: 11.5,
          color: 'var(--sp-muted)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span className="sp-dot" style={{ backgroundColor: metricColor }} />
            {metricLabel}
          </span>
          {!isMixedTypes && coords.length >= 3 ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <span
                style={{
                  width: 14,
                  borderTop: '2px dashed var(--sp-muted)',
                  display: 'inline-block',
                }}
              />
              3 Sınav Trendi
            </span>
          ) : null}
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span className="sp-dot" style={{ backgroundColor: '#eab308' }} />
            En Yüksek: {bestVal}
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span className="sp-dot" style={{ backgroundColor: 'var(--sp-warm)' }} />
            Seçili Sınav
          </span>
        </div>
        <span>Noktaya tıklayarak aşağıda tam sınav karnesini açabilirsin</span>
      </div>
    </div>
  );
}

function StudentExamsAndHeatmapInner() {
  const searchParams = useSearchParams();
  const queryExamId = Number(searchParams.get('exam') || 0);

  const [examType, setExamType] = useState<string>('');
  const [initializedType, setInitializedType] = useState(false);
  const [overview, setOverview] = useState<ExamsOverviewResponse | null>(null);
  const [selectedExamId, setSelectedExamId] = useState<number | null>(null);
  const [detail, setDetail] = useState<ExamDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [loading, setLoading] = useState(true);

  const [chartMetric, setChartMetric] = useState<string>('__TOTAL__');
  const [rangeWindow, setRangeWindow] = useState<RangeWindow>('20');
  const [archiveSearch, setArchiveSearch] = useState('');
  const [archiveSort, setArchiveSort] = useState<ArchiveSort>('newest');
  const [visibleArchiveCount, setVisibleArchiveCount] = useState(10);
  const [showOutOfTrackSections, setShowOutOfTrackSections] = useState(false);
  const [expandedHeatmapSec, setExpandedHeatmapSec] = useState<string | null>(null);

  const loadOverview = useCallback(
    async (targetType: string) => {
      setLoading(true);
      try {
        const res = await studentPortalApi.exams(targetType || undefined);

        // İlk açılışta: TYT (120 soru) ve AYT (80 soru) tek çizgide testere gibi karışmasın diye
        // birden fazla sınav türü varsa otomatik olarak en güncel/önerilen sınav sekmesine kilitlen.
        if (!initializedType && !targetType && res.available_types.length > 1) {
          let preferredType = res.recommended_type || res.available_types[0].code;
          if (queryExamId) {
            const targetExam = res.exams.find((e) => e.exam_id === queryExamId);
            if (targetExam) preferredType = targetExam.exam_type;
          }
          setInitializedType(true);
          setExamType(preferredType);
          const scopedRes = await studentPortalApi.exams(preferredType);
          setOverview(scopedRes);
          if (queryExamId && scopedRes.exams.some((e) => e.exam_id === queryExamId)) {
            setSelectedExamId(queryExamId);
          } else if (scopedRes.exams.length > 0) {
            setSelectedExamId(scopedRes.exams[0].exam_id);
          }
          return;
        }

        setInitializedType(true);
        setOverview(res);
        if (queryExamId && res.exams.some((e) => e.exam_id === queryExamId)) {
          setSelectedExamId(queryExamId);
        } else if (res.exams.length > 0) {
          setSelectedExamId((prev) =>
            prev && res.exams.some((e) => e.exam_id === prev) ? prev : res.exams[0].exam_id,
          );
        } else {
          setSelectedExamId(null);
        }
      } finally {
        setLoading(false);
      }
    },
    [initializedType, queryExamId],
  );

  useEffect(() => {
    loadOverview(examType);
  }, [examType, loadOverview]);

  useEffect(() => {
    if (!selectedExamId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    studentPortalApi
      .examDetail(selectedExamId)
      .then((res) => {
        if (!cancelled) setDetail(res);
      })
      .catch(() => {
        if (!cancelled) setDetail(null);
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedExamId]);

  // Öğrencinin alanına ait olan ve gerçekten çözülen dersleri tekrarsız biçimde çıkar
  const metricOptions = useMemo<MetricOption[]>(() => {
    if (!overview) return [];
    const map = new Map<string, MetricOption>();

    for (const ex of overview.trend) {
      for (const sec of ex.sections) {
        // Öğrencinin alanına dahil olmayan ve hiç soru işaretlenmemiş (0D/0Y) dersleri gizle
        if (sec.alana_dahil === false && !sec.attempted) continue;

        const key = sec.metric_key || (sec.is_parent_group ? `grup:${sec.name}` : `ders:${sec.name}`);
        if (!map.has(key)) {
          map.set(key, {
            key,
            label: sec.display_name || sec.name,
            isGroup: Boolean(sec.is_parent_group),
            color: sec.color || 'var(--sp-accent)',
          });
        }
      }
    }

    // Yaprak branşlar önce, ana grup toplamları sonda düzenli dursun
    return Array.from(map.values()).sort((a, b) => {
      if (a.isGroup !== b.isGroup) return a.isGroup ? 1 : -1;
      return a.label.localeCompare(b.label, 'tr');
    });
  }, [overview]);

  const activeMetricMeta = useMemo(() => {
    if (chartMetric === '__TOTAL__') {
      return { label: 'Toplam Net', color: 'var(--sp-accent)' };
    }
    if (chartMetric === '__SCORE__') {
      return { label: 'Sınav Puanı', color: '#8b5cf6' };
    }
    const found = metricOptions.find((m) => m.key === chartMetric);
    return found
      ? { label: found.label, color: found.color }
      : { label: 'Toplam Net', color: 'var(--sp-accent)' };
  }, [chartMetric, metricOptions]);

  const windowedTrend = useMemo(() => {
    if (!overview) return [];
    const all = overview.trend;
    if (rangeWindow === '10') return all.slice(-10);
    if (rangeWindow === '20') return all.slice(-20);
    return all;
  }, [overview, rangeWindow]);

  const filteredArchive = useMemo(() => {
    if (!overview) return [];
    const q = archiveSearch.trim().toLocaleLowerCase('tr-TR');
    const list = overview.exams.filter((ex) => {
      if (!q) return true;
      return (
        ex.exam_name.toLocaleLowerCase('tr-TR').includes(q) ||
        (ex.exam_date || '').includes(q) ||
        (ex.exam_type_short || ex.exam_type_label).toLocaleLowerCase('tr-TR').includes(q)
      );
    });

    const sorted = [...list];
    if (archiveSort === 'best_net') {
      sorted.sort((a, b) => b.total_net - a.total_net);
    } else if (archiveSort === 'best_rank') {
      sorted.sort((a, b) => (a.kurum_rank ?? 999999) - (b.kurum_rank ?? 999999));
    }
    return sorted;
  }, [archiveSearch, archiveSort, overview]);

  const totalExamCountAcrossAllTypes = useMemo(() => {
    if (!overview) return 0;
    return overview.available_types.reduce((sum, t) => sum + (t.count || 0), 0) || overview.exams.length;
  }, [overview]);

  // Seçili sınavın ders satırlarını öğrencinin alanına göre ayır
  const partitionedDetailSections = useMemo(() => {
    if (!detail) return { primary: [], outOfTrack: [] };
    const primary: ExamDetailResponse['section_details'] = [];
    const outOfTrack: ExamDetailResponse['section_details'] = [];

    for (const sec of detail.section_details) {
      const attempted = (sec.correct || 0) + (sec.wrong || 0) > 0;
      if (sec.is_optional_unattempted || (sec.alana_dahil === false && !attempted)) {
        outOfTrack.push(sec);
      } else {
        primary.push(sec);
      }
    }
    return { primary, outOfTrack };
  }, [detail]);

  const bp = overview?.upcoming_boarding_pass;
  const isMixedAllView = examType === '' && (overview?.available_types.length || 0) > 1;

  return (
    <>
      {/* 1. Üst Kumanda Paneli: Sınav Türü Sekmeleri + Özelleşmiş KPI Kartları */}
      <div className="sp-card">
        <div className="sp-card-header" style={{ flexWrap: 'wrap', gap: 12 }}>
          <div>
            <span className="sp-eyebrow">Akademik Performans & Sınav Kokpiti</span>
            <h1 style={{ margin: '4px 0 0', fontSize: 22 }}>
              Sınav Radarı & Gelişim Analizi
            </h1>
          </div>

          {overview && overview.available_types.length > 0 ? (
            <div className="sp-pill-bar">
              {overview.available_types.map((t) => (
                <button
                  key={t.code}
                  type="button"
                  className="sp-pill"
                  data-active={examType === t.code ? '1' : '0'}
                  onClick={() => {
                    setChartMetric('__TOTAL__');
                    setVisibleArchiveCount(10);
                    setExamType(t.code);
                  }}
                >
                  <strong>{t.short_label || t.label}</strong>
                  {t.count != null ? ` (${t.count})` : ''}
                </button>
              ))}
              {overview.available_types.length > 1 ? (
                <button
                  type="button"
                  className="sp-pill"
                  data-active={examType === '' ? '1' : '0'}
                  onClick={() => {
                    setChartMetric('__TOTAL__');
                    setVisibleArchiveCount(12);
                    setExamType('');
                  }}
                >
                  Tüm Arşiv ({totalExamCountAcrossAllTypes})
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

        {overview?.kpi ? (
          <div className="sp-kpi-grid">
            <div className="sp-kpi-box">
              <span>
                Son {overview.kpi.kpi_type_label || 'Sınav'} Netin
              </span>
              <strong>{overview.kpi.latest_net}</strong>
              <small
                style={{
                  color:
                    overview.kpi.latest_net_delta != null
                      ? overview.kpi.latest_net_delta >= 0
                        ? 'var(--sp-emerald)'
                        : 'var(--sp-warm)'
                      : 'var(--sp-muted)',
                  fontWeight: overview.kpi.latest_net_delta != null ? 600 : 400,
                }}
              >
                {overview.kpi.latest_net_delta != null
                  ? `Önceki ${overview.kpi.kpi_type_label || 'sınava'} göre ${overview.kpi.latest_net_delta >= 0 ? '+' : ''}${overview.kpi.latest_net_delta} net`
                  : overview.kpi.latest_exam_name}
              </small>
            </div>
            <div className="sp-kpi-box">
              <span>
                {overview.kpi.kpi_type_label || 'Sınav'} Net Rekoru
              </span>
              <strong style={{ color: 'var(--sp-emerald)' }}>
                {overview.kpi.personal_best_net}
              </strong>
              <small>
                {overview.kpi.kpi_type_label || 'Dönem'} Ortalaması: {overview.kpi.average_net} net
              </small>
            </div>
            <div className="sp-kpi-box">
              <span>Son Puanın</span>
              <strong>{overview.kpi.latest_score || '—'}</strong>
              <small>En yüksek: {overview.kpi.personal_best_score || '—'}</small>
            </div>
            <div className="sp-kpi-box">
              <span>Kurum Sıralaması</span>
              <strong>
                {overview.kpi.latest_kurum_rank
                  ? `#${overview.kpi.latest_kurum_rank}`
                  : '—'}
              </strong>
              <small>
                {overview.kpi.latest_kurum_total
                  ? `${overview.kpi.latest_kurum_total} katılımcı içinde`
                  : `${overview.kpi.exam_count} sınav kaydı`}
              </small>
            </div>
          </div>
        ) : null}
      </div>

      {/* 2. Yaklaşan Sınav Biniş Kartı */}
      {bp ? (
        <section className="sp-boarding-pass">
          <div className="sp-boarding-main">
            <span
              className="sp-chip"
              style={{
                background: 'rgba(251, 146, 60, 0.22)',
                color: '#fdba74',
                borderColor: 'transparent',
              }}
            >
              <Ticket size={13} />
              Yaklaşan Deneme · {bp.is_today ? 'BUGÜN' : `${bp.days_left} Gün Kaldı`}
            </span>
            <h3>{bp.exam_name}</h3>
            <div className="sp-boarding-meta">
              <span>
                {bp.exam_date} · Saat {bp.start_time}
                {bp.end_time ? `–${bp.end_time}` : ''}
              </span>
              {bp.session_name ? <span>{bp.session_name}</span> : null}
              <span>{bp.duration_minutes} dk</span>
            </div>
          </div>
          <div className="sp-boarding-divider" />
          <div className="sp-boarding-stub">
            <div>
              <span>Salon</span>
              <strong>{bp.room_name}</strong>
            </div>
            <div>
              <span>Sıra No</span>
              <strong>{bp.seat_no ? `#${bp.seat_no}` : bp.desk_no || '—'}</strong>
            </div>
          </div>
        </section>
      ) : null}

      {loading ? (
        <div className="sp-skeleton" style={{ height: 360 }} />
      ) : !overview || overview.exams.length === 0 ? (
        <div className="sp-card">
          <div className="sp-empty-box">
            <Award size={34} />
            <p>Seçili kategoride henüz açıklanmış bir sınav sonucun bulunmuyor.</p>
          </div>
        </div>
      ) : (
        <>
          {/* 3. Yeniden Tasarlanan Ölçeklenebilir Gelişim Grafiği */}
          <section className="sp-card">
            <div
              className="sp-card-header"
              style={{ flexWrap: 'wrap', gap: 12, alignItems: 'flex-start' }}
            >
              <div>
                <span className="sp-eyebrow">
                  {isMixedAllView
                    ? 'TYT ve AYT Ayrı Eğrilerle Gösteriliyor'
                    : 'Zaman Pencereli & Branş Odaklı Trend'}
                </span>
                <h2>
                  <TrendingUp size={17} style={{ verticalAlign: -3, marginRight: 6 }} />
                  Net & Puan Gelişim Grafiği
                </h2>
              </div>

              {/* Sağ Üst: Zaman Penceresi + Metrik Seçici (100+ sınavda bile tek satır kompakt kontrol) */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Filter size={14} style={{ color: 'var(--sp-muted)' }} />
                  <select
                    aria-label="Branş veya metrik seç"
                    value={chartMetric}
                    onChange={(e) => setChartMetric(e.target.value)}
                    style={{
                      padding: '7px 11px',
                      borderRadius: 10,
                      border: '1px solid var(--sp-border-strong)',
                      background: 'var(--sp-surface-2)',
                      color: 'var(--sp-ink)',
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    <option value="__TOTAL__">📈 Toplam Net</option>
                    <option value="__SCORE__">🎯 Sınav Puanı</option>
                    {metricOptions.some((m) => !m.isGroup) ? (
                      <optgroup label="Ders / Branş Neti">
                        {metricOptions
                          .filter((m) => !m.isGroup)
                          .map((m) => (
                            <option key={m.key} value={m.key}>
                              {m.label}
                            </option>
                          ))}
                      </optgroup>
                    ) : null}
                    {metricOptions.some((m) => m.isGroup) ? (
                      <optgroup label="Bölüm Toplam Neti">
                        {metricOptions
                          .filter((m) => m.isGroup)
                          .map((m) => (
                            <option key={m.key} value={m.key}>
                              {m.label}
                            </option>
                          ))}
                      </optgroup>
                    ) : null}
                  </select>
                </div>

                {overview.trend.length > 10 ? (
                  <div className="sp-pill-bar">
                    <button
                      type="button"
                      className="sp-pill"
                      data-active={rangeWindow === '10' ? '1' : '0'}
                      onClick={() => setRangeWindow('10')}
                    >
                      Son 10
                    </button>
                    {overview.trend.length > 20 ? (
                      <button
                        type="button"
                        className="sp-pill"
                        data-active={rangeWindow === '20' ? '1' : '0'}
                        onClick={() => setRangeWindow('20')}
                      >
                        Son 20
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="sp-pill"
                      data-active={rangeWindow === 'ALL' ? '1' : '0'}
                      onClick={() => setRangeWindow('ALL')}
                    >
                      Tüm Sezon ({overview.trend.length})
                    </button>
                  </div>
                ) : null}
              </div>
            </div>

            {/* Hızlı Tek-Tık Branş Çipleri (Sadece öğrencinin kendi alanındaki temel dersler — kalabalık yok) */}
            {metricOptions.length > 0 && !isMixedAllView ? (
              <div
                className="sp-pill-bar"
                style={{
                  marginBottom: 12,
                  overflowX: 'auto',
                  flexWrap: 'nowrap',
                  paddingBottom: 4,
                }}
              >
                <button
                  type="button"
                  className="sp-pill"
                  style={{ flexShrink: 0 }}
                  data-active={chartMetric === '__TOTAL__' ? '1' : '0'}
                  onClick={() => setChartMetric('__TOTAL__')}
                >
                  Toplam Net
                </button>
                {metricOptions
                  .filter((m) => !m.isGroup)
                  .map((m) => (
                    <button
                      key={m.key}
                      type="button"
                      className="sp-pill"
                      style={{ flexShrink: 0 }}
                      data-active={chartMetric === m.key ? '1' : '0'}
                      onClick={() => setChartMetric(m.key)}
                    >
                      <span
                        className="sp-dot"
                        style={{
                          backgroundColor: m.color,
                          marginRight: 6,
                          verticalAlign: -1,
                        }}
                      />
                      {m.label}
                    </button>
                  ))}
              </div>
            ) : null}

            <PrecisionExamChart
              items={windowedTrend}
              selectedMetric={chartMetric}
              metricLabel={activeMetricMeta.label}
              metricColor={activeMetricMeta.color}
              selectedExamId={selectedExamId}
              isMixedTypes={isMixedAllView}
              onSelectExam={(id) => setSelectedExamId(id)}
            />
          </section>

          {/* 4. Master-Detail Sınav Gezgini: Sol = Aranabilir Kompakt Sınav Arşivi, Sağ = Seçili Sınav Karnesi */}
          <div className="sp-bento-grid">
            {/* SOL SÜTUN: Ölçeklenebilir Sınav Arşivi (100+ sınavda bile düzenli, aranabilir, sıralanabilir) */}
            <section className="sp-card sp-col-5" style={{ alignSelf: 'start' }}>
              <div className="sp-card-header" style={{ flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <span className="sp-eyebrow">Sınav Seç & Karşılaştır</span>
                  <h2>
                    <Layers size={16} style={{ verticalAlign: -2, marginRight: 6 }} />
                    Sınav Arşivi ({filteredArchive.length})
                  </h2>
                </div>

                <select
                  aria-label="Sınav listesi sıralaması"
                  value={archiveSort}
                  onChange={(e) => setArchiveSort(e.target.value as ArchiveSort)}
                  style={{
                    padding: '5px 9px',
                    borderRadius: 9,
                    border: '1px solid var(--sp-border-strong)',
                    background: 'var(--sp-surface-2)',
                    color: 'var(--sp-ink)',
                    fontSize: 12,
                  }}
                >
                  <option value="newest">En Yeni</option>
                  <option value="best_net">En Yüksek Net</option>
                  <option value="best_rank">En İyi Sıralama</option>
                </select>
              </div>

              {/* Arama Kutusu */}
              <div style={{ position: 'relative', marginBottom: 12 }}>
                <Search
                  size={15}
                  style={{
                    position: 'absolute',
                    left: 11,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--sp-muted)',
                    pointerEvents: 'none',
                  }}
                />
                <input
                  type="text"
                  value={archiveSearch}
                  onChange={(e) => {
                    setArchiveSearch(e.target.value);
                    setVisibleArchiveCount(12);
                  }}
                  placeholder="Yayın veya sınav adı ara (345, Apotemi, Özdebir…)"
                  style={{
                    width: '100%',
                    padding: '8px 12px 8px 34px',
                    borderRadius: 11,
                    border: '1px solid var(--sp-border-strong)',
                    background: 'var(--sp-surface-2)',
                    color: 'var(--sp-ink)',
                    fontSize: 13,
                    outline: 'none',
                  }}
                />
              </div>

              {filteredArchive.length === 0 ? (
                <div className="sp-empty-box" style={{ padding: '24px 12px' }}>
                  <p>Aramana uygun sınav bulunamadı.</p>
                </div>
              ) : (
                <>
                  <div
                    className="sp-stack"
                    style={{
                      gap: 8,
                      maxHeight: 560,
                      overflowY: 'auto',
                      paddingRight: 2,
                    }}
                  >
                    {filteredArchive.slice(0, visibleArchiveCount).map((ex) => {
                      const active = ex.exam_id === selectedExamId;
                      const hasRecord = ex.badges.some((b) => b.code === 'PERSONAL_BEST');
                      return (
                        <button
                          key={ex.exam_id}
                          type="button"
                          onClick={() => setSelectedExamId(ex.exam_id)}
                          style={{
                            width: '100%',
                            textAlign: 'left',
                            padding: '11px 13px',
                            borderRadius: 13,
                            border: active
                              ? '1.5px solid var(--sp-accent)'
                              : '1px solid var(--sp-border)',
                            background: active ? 'var(--sp-accent-soft)' : 'var(--sp-surface-2)',
                            color: 'var(--sp-ink)',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 10,
                            transition: 'all 0.15s ease',
                          }}
                        >
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                                marginBottom: 3,
                                flexWrap: 'wrap',
                              }}
                            >
                              <span
                                style={{
                                  fontSize: 11,
                                  fontWeight: 700,
                                  padding: '1px 6px',
                                  borderRadius: 6,
                                  background: 'var(--sp-surface)',
                                  color: 'var(--sp-accent)',
                                  border: '1px solid var(--sp-border)',
                                }}
                              >
                                {ex.exam_type_short || ex.exam_type_label}
                              </span>
                              <span style={{ fontSize: 11.5, color: 'var(--sp-muted)' }}>
                                {formatShortDateTR(ex.exam_date)}
                              </span>
                              {hasRecord ? (
                                <span
                                  style={{
                                    fontSize: 11,
                                    fontWeight: 700,
                                    color: '#ca8a04',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 3,
                                  }}
                                >
                                  <Trophy size={11} /> Rekor
                                </span>
                              ) : null}
                            </div>

                            <strong
                              style={{
                                display: 'block',
                                fontSize: 13.5,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {ex.exam_name}
                            </strong>
                            <span style={{ fontSize: 11.5, color: 'var(--sp-muted)' }}>
                              {ex.total_correct}D · {ex.total_wrong}Y · {ex.total_empty}B
                              {ex.kurum_rank ? ` · Kurum #${ex.kurum_rank}` : ''}
                            </span>
                          </div>

                          <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            <strong
                              style={{
                                display: 'block',
                                fontSize: 15.5,
                                color: active ? 'var(--sp-accent)' : 'var(--sp-ink)',
                              }}
                            >
                              {ex.total_net}
                              <small style={{ fontSize: 11, fontWeight: 500 }}> net</small>
                            </strong>
                            {ex.net_delta != null ? (
                              <span
                                style={{
                                  fontSize: 11,
                                  fontWeight: 700,
                                  color:
                                    ex.net_delta >= 0 ? 'var(--sp-emerald)' : 'var(--sp-warm)',
                                }}
                              >
                                {ex.net_delta >= 0 ? '+' : ''}
                                {ex.net_delta}
                              </span>
                            ) : (
                              <span style={{ fontSize: 11, color: 'var(--sp-muted)' }}>İlk kayıt</span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {filteredArchive.length > visibleArchiveCount ? (
                    <button
                      type="button"
                      className="sp-btn sp-btn-secondary sp-btn-sm"
                      style={{ width: '100%', marginTop: 10, justifyContent: 'center' }}
                      onClick={() => setVisibleArchiveCount((c) => c + 15)}
                    >
                      <ChevronDown size={15} />
                      <span>
                        Daha Fazla Göster ({filteredArchive.length - visibleArchiveCount} sınav kaldı)
                      </span>
                    </button>
                  ) : null}
                </>
              )}
            </section>

            {/* SAĞ SÜTUN: Seçili Sınavın Derin Karnesi + En Kolay Net Artışı Radarı */}
            <div className="sp-col-7" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {detailLoading ? (
                <div className="sp-skeleton" style={{ height: 420 }} />
              ) : detail ? (
                <>
                  <section className="sp-card">
                    <div className="sp-card-header" style={{ flexWrap: 'wrap', gap: 10 }}>
                      <div>
                        <span className="sp-eyebrow">
                          {detail.exam_type_label} · {formatFullDateTR(detail.exam_date)}
                        </span>
                        <h2 style={{ marginTop: 3 }}>{detail.exam_name}</h2>
                      </div>

                      <a
                        href={studentPortalApi.examKarnePdfUrl(detail.exam_id)}
                        className="sp-btn sp-btn-primary sp-btn-sm"
                      >
                        <Download size={14} />
                        <span>Resmi Karne PDF İndir</span>
                      </a>
                    </div>

                    <div
                      className="sp-kpi-grid"
                      style={{ marginBottom: 16 }}
                    >
                      <div className="sp-kpi-box">
                        <span>{detail.net_label || 'Toplam Net'}</span>
                        <strong>{detail.total_net}</strong>
                        <small>
                          {detail.total_correct}D · {detail.total_wrong}Y · {detail.total_empty}B
                        </small>
                      </div>
                      <div className="sp-kpi-box">
                        <span>Puan</span>
                        <strong>{detail.score || '—'}</strong>
                        <small>Doğruluk: %{detail.accuracy_percent}</small>
                      </div>
                      <div className="sp-kpi-box">
                        <span>Sınıf Sırası</span>
                        <strong>
                          {detail.sinif_rank
                            ? `${detail.sinif_rank}/${detail.sinif_total}`
                            : '—'}
                        </strong>
                        <small>Sınıf Ort: {detail.sinif_avg_net ?? '—'}</small>
                      </div>
                      <div className="sp-kpi-box">
                        <span>Kurum Sırası</span>
                        <strong>
                          {detail.kurum_rank
                            ? `${detail.kurum_rank}/${detail.kurum_total}`
                            : '—'}
                        </strong>
                        <small>Kurum Ort: {detail.kurum_avg_net ?? '—'}</small>
                      </div>
                    </div>

                    {/* Ders Bazlı Karşılaştırma (Öğrencinin Alanına Göre Filtrelenmiş + Hiyerarşik) */}
                    <div className="sp-stack" style={{ gap: 8 }}>
                      {[
                        ...partitionedDetailSections.primary,
                        ...(showOutOfTrackSections ? partitionedDetailSections.outOfTrack : []),
                      ].map((sec, idx) => {
                        const pct =
                          sec.question_count > 0
                            ? Math.max(0, Math.min(100, (sec.net / sec.question_count) * 100))
                            : 0;
                        const isSub = Boolean(sec.is_sub_section);
                        const isGroup = Boolean(sec.is_parent_group);

                        return (
                          <div
                            key={`${sec.section_id || sec.section_name}-${idx}`}
                            className="sp-row-card"
                            style={{
                              display: 'block',
                              marginLeft: isSub ? 14 : 0,
                              padding: isSub ? '10px 13px' : '12px 15px',
                              background: isGroup ? 'var(--sp-surface)' : 'var(--sp-surface-2)',
                              borderLeft: isSub ? `3px solid ${sec.color}` : undefined,
                            }}
                          >
                            <div
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                gap: 8,
                                marginBottom: 6,
                              }}
                            >
                              <strong style={{ fontSize: isSub ? 13 : 14 }}>
                                {!isSub ? (
                                  <span
                                    className="sp-dot"
                                    style={{
                                      backgroundColor: sec.color,
                                      marginRight: 7,
                                      verticalAlign: -1,
                                    }}
                                  />
                                ) : null}
                                {sec.section_name}
                                {isGroup ? (
                                  <small
                                    style={{
                                      marginLeft: 6,
                                      fontWeight: 500,
                                      color: 'var(--sp-muted)',
                                    }}
                                  >
                                    (Bölüm Toplamı · {sec.question_count} Soru)
                                  </small>
                                ) : null}
                              </strong>
                              <span style={{ fontSize: 13, fontWeight: 700 }}>
                                {sec.net} Net{' '}
                                <small style={{ fontWeight: 500, color: 'var(--sp-muted)' }}>
                                  ({sec.correct}D / {sec.wrong}Y / {sec.empty}B)
                                </small>
                              </span>
                            </div>

                            <div
                              style={{
                                height: isSub ? 6 : 8,
                                borderRadius: 99,
                                background: 'var(--sp-border)',
                                overflow: 'hidden',
                              }}
                            >
                              <div
                                style={{
                                  width: `${pct}%`,
                                  height: '100%',
                                  backgroundColor: sec.color,
                                }}
                              />
                            </div>

                            <div
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                gap: 12,
                                marginTop: 5,
                                fontSize: 11.5,
                                color: 'var(--sp-muted)',
                              }}
                            >
                              <div style={{ display: 'flex', gap: 12 }}>
                                {sec.sinif_avg_net != null ? (
                                  <span>Sınıf Ort: {sec.sinif_avg_net}</span>
                                ) : null}
                                {sec.kurum_avg_net != null ? (
                                  <span>Kurum Ort: {sec.kurum_avg_net}</span>
                                ) : null}
                              </div>
                              <span>Başarı: %{Math.round(pct)}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {partitionedDetailSections.outOfTrack.length > 0 ? (
                      <button
                        type="button"
                        className="sp-btn sp-btn-secondary sp-btn-sm"
                        style={{ marginTop: 10 }}
                        onClick={() => setShowOutOfTrackSections((v) => !v)}
                      >
                        {showOutOfTrackSections ? <EyeOff size={14} /> : <Eye size={14} />}
                        <span>
                          {showOutOfTrackSections
                            ? 'Alan dışı boş testleri gizle'
                            : `Alan dışı çözülmemiş testleri göster (${partitionedDetailSections.outOfTrack.length})`}
                        </span>
                      </button>
                    ) : null}
                  </section>

                  {/* En Kolay Net Artışı Radarı */}
                  <section className="sp-card">
                    <div className="sp-card-header">
                      <div>
                        <span className="sp-eyebrow">Bu Sınavdaki Öncelikli Kazanım Fırsatların</span>
                        <h2>
                          <Radar size={17} style={{ verticalAlign: -3, marginRight: 6 }} />
                          En Kolay Net Artışı Radarı
                        </h2>
                      </div>
                    </div>

                    {detail.quick_gain_radar.length === 0 ? (
                      <div className="sp-empty-box">
                        <Sparkles size={28} />
                        <p>
                          Bu sınavda kendi alanındaki konu bazlı kaçan soru detayı bulunmuyor
                          veya tüm kazanımları tamamladın!
                        </p>
                      </div>
                    ) : (
                      <div className="sp-stack" style={{ gap: 8 }}>
                        {detail.quick_gain_radar.map((opp, idx) => (
                          <div
                            key={`${opp.section_name}-${opp.topic_name}-${idx}`}
                            className="sp-row-card"
                          >
                            <div className="sp-row-copy">
                              <strong>
                                <span
                                  className="sp-dot"
                                  style={{
                                    backgroundColor: opp.color,
                                    marginRight: 7,
                                    verticalAlign: -1,
                                  }}
                                />
                                {opp.topic_name}
                              </strong>
                              <span>
                                {opp.section_name} · {opp.hint}
                              </span>
                            </div>
                            <span className="sp-chip sp-chip-emerald" style={{ fontWeight: 700 }}>
                              +{opp.potential_net_gain} Net
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                </>
              ) : null}
            </div>
          </div>

          {/* 5. Dönemlik Konu Hakimiyet Isı Haritası (Kompakt Akordeon / Filtreli Görünüm) */}
          {overview.mastery_heatmap.length > 0 ? (
            <section className="sp-card">
              <div className="sp-card-header" style={{ flexWrap: 'wrap', gap: 10 }}>
                <div>
                  <span className="sp-eyebrow">Son Sınavların Birleşik Kazanım Matrisi</span>
                  <h2>
                    <Target size={17} style={{ verticalAlign: -3, marginRight: 6 }} />
                    Konu Hakimiyet Isı Haritası
                  </h2>
                </div>
                <div className="sp-pill-bar">
                  <span className="sp-chip sp-chip-emerald">≥%75 Güçlü</span>
                  <span className="sp-chip sp-chip-accent">%55–74 İyi</span>
                  <span className="sp-chip sp-chip-warm">%35–54 Gelişmeli</span>
                  <span className="sp-chip sp-chip-danger">&lt;%35 Öncelikli</span>
                </div>
              </div>

              <div className="sp-stack" style={{ gap: 10 }}>
                {overview.mastery_heatmap.map((sec, idx) => {
                  const isOpen =
                    expandedHeatmapSec === null ? idx < 2 : expandedHeatmapSec === sec.section_name;
                  return (
                    <div
                      key={sec.section_name}
                      style={{
                        borderRadius: 14,
                        border: '1px solid var(--sp-border)',
                        background: 'var(--sp-surface-2)',
                        padding: '12px 14px',
                      }}
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedHeatmapSec(isOpen ? '__NONE__' : sec.section_name)
                        }
                        style={{
                          width: '100%',
                          background: 'transparent',
                          border: 'none',
                          padding: 0,
                          color: 'var(--sp-ink)',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 10,
                        }}
                      >
                        <strong style={{ fontSize: 14.5 }}>
                          <span
                            className="sp-dot"
                            style={{
                              backgroundColor: sec.color,
                              marginRight: 8,
                              verticalAlign: -1,
                            }}
                          />
                          {sec.section_name}{' '}
                          <small style={{ fontWeight: 500, color: 'var(--sp-muted)' }}>
                            ({sec.topics.length} konu)
                          </small>
                        </strong>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ fontSize: 12.5, color: 'var(--sp-muted)' }}>
                            Ortalama Hakimiyet: <strong>%{sec.average_mastery_percent}</strong>
                          </span>
                          {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </div>
                      </button>

                      {isOpen ? (
                        <div className="sp-heatmap-grid" style={{ marginTop: 12 }}>
                          {sec.topics.map((topic) => (
                            <div
                              key={topic.topic_name}
                              className="sp-heat-cell"
                              data-level={topic.level}
                            >
                              <strong>{topic.topic_name}</strong>
                              <span>
                                %{topic.mastery_percent} başarı · {topic.correct}D/{topic.wrong}Y/
                                {topic.empty}B
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}
        </>
      )}
    </>
  );
}

export default function StudentExamsAndHeatmapPage() {
  return (
    <Suspense fallback={<div className="sp-skeleton" style={{ height: 360 }} />}>
      <StudentExamsAndHeatmapInner />
    </Suspense>
  );
}
