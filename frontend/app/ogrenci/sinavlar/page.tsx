'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Award,
  Download,
  Radar,
  Sparkles,
  Ticket,
  TrendingUp,
} from 'lucide-react';
import {
  studentPortalApi,
  type ExamDetailResponse,
  type ExamOverviewItem,
  type ExamsOverviewResponse,
} from '@/lib/student-portal-api';

function InteractiveTrendChart({
  items,
  selectedMetric,
  selectedExamId,
  onSelectExam,
}: {
  items: ExamOverviewItem[];
  selectedMetric: string;
  selectedExamId: number | null;
  onSelectExam: (examId: number) => void;
}) {
  const points = useMemo(() => {
    return items.map((item) => {
      if (selectedMetric === '__TOTAL__') {
        return { examId: item.exam_id, label: item.exam_name, date: item.exam_date, value: item.total_net };
      }
      const sec = item.sections.find((s) => s.name === selectedMetric);
      return {
        examId: item.exam_id,
        label: item.exam_name,
        date: item.exam_date,
        value: sec ? sec.net : 0,
      };
    });
  }, [items, selectedMetric]);

  if (points.length === 0) return null;

  const width = 760;
  const height = 210;
  const padX = 44;
  const padY = 28;
  const vals = points.map((p) => p.value);
  const minVal = Math.min(0, ...vals);
  const maxVal = Math.max(minVal + 5, ...vals);
  const span = maxVal - minVal || 1;

  const coords = points.map((pt, idx) => {
    const x =
      points.length === 1
        ? width / 2
        : padX + (idx / (points.length - 1)) * (width - padX * 2);
    const y = height - padY - ((pt.value - minVal) / span) * (height - padY * 2);
    return { ...pt, x, y };
  });

  const polyline = coords.map((c) => `${c.x},${c.y}`).join(' ');

  return (
    <div style={{ width: '100%', overflowX: 'auto' }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{ width: '100%', minWidth: 460, height: 'auto', display: 'block' }}
      >
        <defs>
          <linearGradient id="spNetFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--sp-accent)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--sp-accent)" stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {[0, 0.5, 1].map((ratio) => {
          const y = height - padY - ratio * (height - padY * 2);
          const labelVal = (minVal + ratio * span).toFixed(1);
          return (
            <g key={ratio}>
              <line
                x1={padX}
                y1={y}
                x2={width - padX}
                y2={y}
                stroke="var(--sp-border-strong)"
                strokeDasharray="4 4"
              />
              <text
                x={8}
                y={y + 4}
                fontSize="11"
                fill="var(--sp-muted)"
              >
                {labelVal}
              </text>
            </g>
          );
        })}

        {coords.length > 1 ? (
          <>
            <polygon
              points={`${coords[0].x},${height - padY} ${polyline} ${coords[coords.length - 1].x},${height - padY}`}
              fill="url(#spNetFill)"
            />
            <polyline
              fill="none"
              stroke="var(--sp-accent)"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              points={polyline}
            />
          </>
        ) : null}

        {coords.map((c) => {
          const active = c.examId === selectedExamId;
          return (
            <g
              key={c.examId}
              style={{ cursor: 'pointer' }}
              onClick={() => onSelectExam(c.examId)}
            >
              <circle
                cx={c.x}
                cy={c.y}
                r={active ? 8 : 5.5}
                fill={active ? 'var(--sp-warm)' : 'var(--sp-accent)'}
                stroke="var(--sp-surface)"
                strokeWidth="2.5"
              />
              <text
                x={c.x}
                y={c.y - 11}
                textAnchor="middle"
                fontSize="11"
                fontWeight="700"
                fill="var(--sp-ink)"
              >
                {c.value}
              </text>
              <text
                x={c.x}
                y={height - 7}
                textAnchor="middle"
                fontSize="10"
                fill="var(--sp-muted)"
              >
                {c.date ? c.date.slice(5) : `#${c.examId}`}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function StudentExamsAndHeatmapInner() {
  const searchParams = useSearchParams();
  const [examType, setExamType] = useState<string>('');
  const [overview, setOverview] = useState<ExamsOverviewResponse | null>(null);
  const [selectedExamId, setSelectedExamId] = useState<number | null>(null);
  const [detail, setDetail] = useState<ExamDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [chartMetric, setChartMetric] = useState<string>('__TOTAL__');

  const loadOverview = useCallback(async () => {
    setLoading(true);
    try {
      const res = await studentPortalApi.exams(examType || undefined);
      setOverview(res);
      const queryExamId = Number(searchParams.get('exam') || 0);
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
  }, [examType, searchParams]);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

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

  const metricSubjects = useMemo(() => {
    if (!overview) return [];
    const names = new Set<string>();
    for (const ex of overview.trend) {
      for (const sec of ex.sections) names.add(sec.name);
    }
    return Array.from(names);
  }, [overview]);

  const bp = overview?.upcoming_boarding_pass;

  return (
    <>
      <div className="sp-card">
        <div className="sp-card-header" style={{ flexWrap: 'wrap' }}>
          <div>
            <span className="sp-eyebrow">Keşfedilebilir Analiz & Karne</span>
            <h1 style={{ margin: '4px 0 0', fontSize: 22 }}>
              Sınav Radarı, En Kolay Net Artışı & Konu Isı Haritası
            </h1>
          </div>

          {overview && overview.available_types.length > 0 ? (
            <div className="sp-pill-bar">
              <button
                type="button"
                className="sp-pill"
                data-active={examType === '' ? '1' : '0'}
                onClick={() => {
                  setChartMetric('__TOTAL__');
                  setExamType('');
                }}
              >
                Tüm Sınavlar
              </button>
              {overview.available_types.map((t) => (
                <button
                  key={t.code}
                  type="button"
                  className="sp-pill"
                  data-active={examType === t.code ? '1' : '0'}
                  onClick={() => {
                    setChartMetric('__TOTAL__');
                    setExamType(t.code);
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {overview?.kpi ? (
          <div className="sp-kpi-grid">
            <div className="sp-kpi-box">
              <span>Son Sınav Netin</span>
              <strong>{overview.kpi.latest_net}</strong>
              <small>
                {overview.kpi.latest_net_delta != null
                  ? `${overview.kpi.latest_net_delta >= 0 ? '+' : ''}${overview.kpi.latest_net_delta} net fark`
                  : overview.kpi.latest_exam_name}
              </small>
            </div>
            <div className="sp-kpi-box">
              <span>Kişisel Net Rekoru</span>
              <strong style={{ color: 'var(--sp-emerald)' }}>
                {overview.kpi.personal_best_net}
              </strong>
              <small>Ortalama: {overview.kpi.average_net} net</small>
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

      {/* Yaklaşan Sınav Biniş Kartı */}
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
              </span>
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
        <div className="sp-skeleton" style={{ height: 340 }} />
      ) : !overview || overview.exams.length === 0 ? (
        <div className="sp-card">
          <div className="sp-empty-box">
            <Award size={34} />
            <p>Seçili kategoride henüz açıklanmış bir sınav sonucun bulunmuyor.</p>
          </div>
        </div>
      ) : (
        <>
          {/* İnteraktif Net Gelişim Grafiği */}
          <section className="sp-card">
            <div className="sp-card-header" style={{ flexWrap: 'wrap' }}>
              <div>
                <span className="sp-eyebrow">Noktaya Tıklayarak Sınav Seç</span>
                <h2>
                  <TrendingUp size={17} style={{ verticalAlign: -3, marginRight: 6 }} />
                  Net Gelişim Eğrisi
                </h2>
              </div>

              <div className="sp-pill-bar">
                <button
                  type="button"
                  className="sp-pill"
                  data-active={chartMetric === '__TOTAL__' ? '1' : '0'}
                  onClick={() => setChartMetric('__TOTAL__')}
                >
                  Toplam Net
                </button>
                {metricSubjects.map((sub) => (
                  <button
                    key={sub}
                    type="button"
                    className="sp-pill"
                    data-active={chartMetric === sub ? '1' : '0'}
                    onClick={() => setChartMetric(sub)}
                  >
                    {sub}
                  </button>
                ))}
              </div>
            </div>

            <InteractiveTrendChart
              items={overview.trend}
              selectedMetric={chartMetric}
              selectedExamId={selectedExamId}
              onSelectExam={(id) => setSelectedExamId(id)}
            />

            {/* Sınav Seçici Şeridi */}
            <div className="sp-pill-bar" style={{ marginTop: 12 }}>
              {overview.exams.map((ex) => (
                <button
                  key={ex.exam_id}
                  type="button"
                  className="sp-pill"
                  data-active={selectedExamId === ex.exam_id ? '1' : '0'}
                  onClick={() => setSelectedExamId(ex.exam_id)}
                >
                  {ex.exam_name} ({ex.total_net} Net)
                </button>
              ))}
            </div>
          </section>

          {/* Seçili Sınavın Derin Analizi + En Kolay Net Artışı Radarı */}
          {detailLoading ? (
            <div className="sp-skeleton" style={{ height: 280 }} />
          ) : detail ? (
            <div className="sp-bento-grid">
              {/* Sol: Ders Bazlı Karşılaştırma & Karne PDF */}
              <section className="sp-card sp-col-7">
                <div className="sp-card-header" style={{ flexWrap: 'wrap' }}>
                  <div>
                    <span className="sp-eyebrow">
                      {detail.exam_type_label} · {detail.exam_date || ''}
                    </span>
                    <h2>{detail.exam_name}</h2>
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
                  style={{ marginBottom: 16, gridTemplateColumns: 'repeat(4, 1fr)' }}
                >
                  <div className="sp-kpi-box">
                    <span>{detail.net_label}</span>
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
                    <small>
                      Sınıf Ort: {detail.sinif_avg_net ?? '—'}
                    </small>
                  </div>
                  <div className="sp-kpi-box">
                    <span>Kurum Sırası</span>
                    <strong>
                      {detail.kurum_rank
                        ? `${detail.kurum_rank}/${detail.kurum_total}`
                        : '—'}
                    </strong>
                    <small>
                      Kurum Ort: {detail.kurum_avg_net ?? '—'}
                    </small>
                  </div>
                </div>

                <div className="sp-stack">
                  {detail.section_details.map((sec) => {
                    const pct =
                      sec.question_count > 0
                        ? Math.max(0, Math.min(100, (sec.net / sec.question_count) * 100))
                        : 0;
                    return (
                      <div key={sec.section_name} className="sp-row-card" style={{ display: 'block' }}>
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: 6,
                          }}
                        >
                          <strong>
                            <span
                              className="sp-dot"
                              style={{
                                backgroundColor: sec.color,
                                marginRight: 7,
                                verticalAlign: -1,
                              }}
                            />
                            {sec.section_name}
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
                            height: 8,
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
                            gap: 14,
                            marginTop: 6,
                            fontSize: 11.5,
                            color: 'var(--sp-muted)',
                          }}
                        >
                          {sec.sinif_avg_net != null ? (
                            <span>Sınıf Ort: {sec.sinif_avg_net}</span>
                          ) : null}
                          {sec.kurum_avg_net != null ? (
                            <span>Kurum Ort: {sec.kurum_avg_net}</span>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* Sağ: En Kolay Net Artışı Radarı */}
              <section className="sp-card sp-col-5">
                <div className="sp-card-header">
                  <div>
                    <span className="sp-eyebrow">Yapay Önceliklendirme</span>
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
                      Bu sınavda konu bazlı kaçan soru detayı yok veya tüm kazanımlar
                      tamamlandı!
                    </p>
                  </div>
                ) : (
                  <div className="sp-stack">
                    {detail.quick_gain_radar.map((opp, idx) => (
                      <div key={`${opp.section_name}-${opp.topic_name}-${idx}`} className="sp-row-card">
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
                        <span className="sp-chip sp-chip-emerald">
                          +{opp.potential_net_gain} Net
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          ) : null}

          {/* Dönemlik Konu Hakimiyet Isı Haritası (Mastery Heatmap) */}
          {overview.mastery_heatmap.length > 0 ? (
            <section className="sp-card">
              <div className="sp-card-header" style={{ flexWrap: 'wrap' }}>
                <div>
                  <span className="sp-eyebrow">Son Sınavların Birleşik Kazanım Matrisi</span>
                  <h2>Konu Hakimiyet Isı Haritası</h2>
                </div>
                <div className="sp-pill-bar">
                  <span className="sp-chip sp-chip-emerald">≥%75 Güçlü</span>
                  <span className="sp-chip sp-chip-accent">%55–74 İyi</span>
                  <span className="sp-chip sp-chip-warm">%35–54 Gelişmeli</span>
                  <span className="sp-chip sp-chip-danger">&lt;%35 Öncelikli</span>
                </div>
              </div>

              <div className="sp-stack" style={{ gap: 18 }}>
                {overview.mastery_heatmap.map((sec) => (
                  <div key={sec.section_name}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: 8,
                      }}
                    >
                      <strong>
                        <span
                          className="sp-dot"
                          style={{
                            backgroundColor: sec.color,
                            marginRight: 7,
                            verticalAlign: -1,
                          }}
                        />
                        {sec.section_name}
                      </strong>
                      <span style={{ fontSize: 12.5, color: 'var(--sp-muted)' }}>
                        Ortalama Hakimiyet: %{sec.average_mastery_percent}
                      </span>
                    </div>

                    <div className="sp-heatmap-grid">
                      {sec.topics.map((topic) => (
                        <div
                          key={topic.topic_name}
                          className="sp-heat-cell"
                          data-level={topic.level}
                        >
                          <strong>{topic.topic_name}</strong>
                          <span>
                            %{topic.mastery_percent} başarı · {topic.correct}D/{topic.wrong}Y/{topic.empty}B
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
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
    <Suspense fallback={<div className="sp-skeleton" style={{ height: 340 }} />}>
      <StudentExamsAndHeatmapInner />
    </Suspense>
  );
}
