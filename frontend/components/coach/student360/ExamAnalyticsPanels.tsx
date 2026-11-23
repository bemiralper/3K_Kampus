'use client';

import { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  Activity,
  ArrowDownRight,
  ArrowLeftRight,
  ArrowUpRight,
  ChevronDown,
  Download,
  FileText,
  Flame,
  Repeat,
  Search,
  Sparkles,
  TrendingDown,
} from 'lucide-react';
import { analysisApi } from '@/components/olcme/api';
import type {
  DevelopmentResponse,
  DevelopmentSubject,
  StudentDetailResponse,
  StudentExamResult,
} from '@/components/olcme/types';
import {
  buildSectionTree,
  coverage,
  dateLabel,
  examRank,
  examTypeLabel,
  fixedLabel,
  foldTr,
  lossRate,
  numberLabel as n,
  periodComparison,
  sectionComparisonRows,
  sectionKey,
  signedLabel,
  type EvidencePoint,
  type LossTopic,
} from './examAnalyticsModel';
import s from './ExamAnalyticsWorkspace.module.css';

export function DecisionSummary({
  topics,
  subjects,
  summary,
  onSelect,
}: {
  topics: LossTopic[];
  subjects: DevelopmentSubject[];
  summary?: DevelopmentResponse['summary'];
  onSelect: (subject: string, topic: string) => void;
}) {
  const biggest = topics
    .filter(t => t.loss > 0)
    .slice()
    .sort((a, b) => b.loss - a.loss)[0];
  const declining = topics
    .filter(t => (t.evidence.comparison.delta ?? 0) >= 10)
    .slice()
    .sort((a, b) => (b.evidence.comparison.delta ?? 0) - (a.evidence.comparison.delta ?? 0))[0];
  const recurringList = topics
    .filter(t => t.evidence.affected >= 2 && t.evidence.recentLoss)
    .slice()
    .sort((a, b) => b.evidence.affected - a.evidence.affected || b.loss - a.loss);
  const recurring = recurringList.find(t => t.key !== biggest?.key) || recurringList[0];

  const strongAreas = subjects
    .flatMap(sub =>
      (sub.strong_areas || []).map(area => ({
        subject: sub.name,
        name: area.name,
        mastery: area.mastery_rate,
      }))
    )
    .sort((a, b) => b.mastery - a.mastery);
  const topStrong = strongAreas[0];
  const volatileSubject = subjects.find(sub => sub.is_volatile)?.name || summary?.most_volatile || null;
  const improvingSubject = summary?.top_improving || null;

  return (
    <section className={s.decisions} aria-label="Koç karar özeti">
      <div className={s.decisionCard} data-tone="danger">
        <div className={s.decisionHead}>
          <span>En büyük kayıp</span>
          <Flame size={15} />
        </div>
        {biggest ? (
          <button type="button" onClick={() => onSelect(biggest.subject, biggest.name)}>
            {biggest.subject} · {biggest.name} <ArrowUpRight size={14} />
          </button>
        ) : (
          <b>—</b>
        )}
        <small>
          {biggest
            ? `${biggest.loss} soru kaybı (%${n(biggest.rate, 0)} hata) · sınav başına ≈ +${n(biggest.netPotentialPerExam, 2)} net potansiyeli`
            : topics.length
              ? 'Kazanımı girilmiş konularda hata görünmüyor.'
              : 'Henüz kazanım eşleşmesi olan soru bulunmuyor.'}
        </small>
      </div>

      <div className={s.decisionCard} data-tone="warn">
        <div className={s.decisionHead}>
          <span>Tekrarlayan eksiklik</span>
          <Repeat size={15} />
        </div>
        {recurring ? (
          <button type="button" onClick={() => onSelect(recurring.subject, recurring.name)}>
            {recurring.subject} · {recurring.name} <ArrowUpRight size={14} />
          </button>
        ) : (
          <b>—</b>
        )}
        <small>
          {recurring
            ? `Sorulduğu ${recurring.evidence.measured} sınavın ${recurring.evidence.affected} tanesinde hata yapıldı.`
            : 'Birden fazla sınavda tekrarlayan bir konu bulunmuyor.'}
        </small>
      </div>

      <div className={s.decisionCard} data-tone="accent">
        <div className={s.decisionHead}>
          <span>Son dönemde gerileyen</span>
          <TrendingDown size={15} />
        </div>
        {declining ? (
          <button type="button" onClick={() => onSelect(declining.subject, declining.name)}>
            {declining.subject} · {declining.name} <ArrowUpRight size={14} />
          </button>
        ) : (
          <b>—</b>
        )}
        <small>
          {declining
            ? `Son sınavlarda hata oranı +${n(declining.evidence.comparison.delta)} puan arttı.`
            : 'Son sınavlarda belirgin bir gerileme görünmüyor.'}
        </small>
      </div>

      <div className={s.decisionCard} data-tone="good">
        <div className={s.decisionHead}>
          <span>Güçlü yön & istikrar</span>
          {volatileSubject ? <Activity size={15} /> : <Sparkles size={15} />}
        </div>
        {improvingSubject ? (
          <b>{improvingSubject} yükseliyor</b>
        ) : topStrong ? (
          <b>
            {topStrong.subject} · {topStrong.name}
          </b>
        ) : (
          <b>—</b>
        )}
        <small>
          {volatileSubject
            ? `${volatileSubject} netleri sınavdan sınava dalgalanıyor; istikrar takibi önerilir.`
            : topStrong
              ? `%${n(topStrong.mastery, 0)} başarı oranı ile güçlü seyrini koruyor.`
              : summary?.narratives?.[0] || 'Sınav sayısı arttıkça güçlü dersler burada özetlenir.'}
        </small>
      </div>
    </section>
  );
}

export function CoveragePanel({
  subjects,
  onSelect,
}: {
  subjects: DevelopmentSubject[];
  onSelect: (subject: string) => void;
}) {
  if (!subjects.length) {
    return (
      <div className={s.coverage}>
        Bu sınavlarda henüz kazanım eşleşmesi yapılmış soru bulunmuyor.
      </div>
    );
  }
  const rows = subjects.map(subject => ({ subject, ...coverage(subject) }));
  const mapped = rows.reduce((sum, row) => sum + row.mapped, 0);
  const total = rows.reduce((sum, row) => sum + row.total, 0);
  const inconsistent = rows.some(row => row.inconsistent);
  const overlapping = subjects.some(subject => subject.incomplete_breakdown);
  return (
    <details className={s.coverage} open>
      <summary>
        {overlapping ? (
          'Bazı derslerde alt ders kırılımı eksik olduğu için genel eşleşme oranı hesaplanamadı'
        ) : (
          <>
            Kazanım eşleşmesi: {mapped} / {total} soru eşleştirilmiş {total > 0 ? `(%${n((100 * mapped) / total)})` : ''}
            {inconsistent ? ' · Eşleşme tutarlılığı kontrol edilmeli' : mapped < total ? ' · Eşleştirilmemiş sorular var' : ''}
          </>
        )}
      </summary>
      <p>Konu ve kazanım analizi yalnızca kazanımı girilmiş sorular üzerinden yapılır; kazanımı girilmemiş sorular bu listeye dahil edilmez.</p>
      <div className={s.heatScroll}>
        <table className={s.historyTable}>
          <thead>
            <tr>
              <th>Ders</th>
              <th>Eşleşen / toplam soru</th>
              <th>Oran</th>
              <th>Eşleşmeyen soru</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.subject.name}>
                <th scope="row">
                  <button type="button" onClick={() => onSelect(row.subject.name)}>
                    {row.subject.name}
                  </button>
                </th>
                <td>
                  {row.mapped} / {row.total}
                </td>
                <td>{row.inconsistent ? 'Tutarsız' : `%${n(row.percent)}`}</td>
                <td>{row.inconsistent ? 'Kontrol gerekli' : row.total - row.mapped}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export function PeriodPanel({
  points,
  exams,
  label,
}: {
  points: EvidencePoint[];
  exams: StudentExamResult[];
  label: string;
}) {
  const result = periodComparison(
    points,
    exams.map(exam => exam.exam_id)
  );
  const names = (ids: number[]) => ids.map(id => exams.find(exam => exam.exam_id === id)?.exam_name).join(' · ');
  return (
    <section className={s.periodPanel} aria-label="Dönem karşılaştırması">
      <h3>{label} · dönem karşılaştırması</h3>
      {result.size < 2 ? (
        <p>
          Dönem karşılaştırması yapabilmek için seçili aralıkta en az 4 sınav olmalı. (Son 3 / önceki 3 sınav
          karşılaştırması için en az 6 sınav gerekir.)
        </p>
      ) : (
        <>
          <div className={s.periodColumns}>
            {[
              {
                label: `Önceki ${result.size} sınav`,
                counts: result.before,
                ids: result.previousIds,
                observations: result.previousObservations,
              },
              {
                label: `Son ${result.size} sınav`,
                counts: result.after,
                ids: result.recentIds,
                observations: result.recentObservations,
              },
            ].map(period => (
              <div key={period.label}>
                <span>{period.label}</span>
                <strong>{period.counts.question_count ? `%${n(lossRate(period.counts))} hata` : '—'}</strong>
                <small>
                  {period.counts.wrong} yanlış · {period.counts.empty} boş · toplam {period.counts.question_count} soru (
                  {period.observations} sınavda çıktı)
                </small>
                <small>{names(period.ids)}</small>
              </div>
            ))}
          </div>
          <p>
            {result.delta == null
              ? 'Sağlıklı bir karşılaştırma için her iki dönemde de en az 2 sınavda toplam 5 soru sorulmuş olmalı.'
              : `Önceki döneme göre hata oranı ${
                  result.delta > 0
                    ? `+${n(result.delta)} puan arttı.`
                    : result.delta < 0
                      ? `${n(Math.abs(result.delta))} puan azaldı.`
                      : 'değişmedi.'
                }`}{' '}
            Soru çıkmayan sınavlar ortalamaya dahil edilmez; deneme zorlukları farklılık gösterebilir.
          </p>
        </>
      )}
    </section>
  );
}

export function ExamCompare({
  exams,
  initialLeftId,
  initialRightId,
  onOpen,
  requestScores,
}: {
  exams: StudentExamResult[];
  initialLeftId?: number;
  initialRightId?: number;
  onOpen: (exam: StudentExamResult) => void;
  requestScores: () => void;
}) {
  const [a, setA] = useState(initialLeftId || exams.at(-2)?.exam_id || exams[0]?.exam_id);
  const [b, setB] = useState(initialRightId || exams.at(-1)?.exam_id);
  useEffect(() => {
    if (initialLeftId) setA(initialLeftId);
    if (initialRightId) setB(initialRightId);
  }, [initialLeftId, initialRightId]);
  const left = exams.find(exam => exam.exam_id === a) || exams.at(-2);
  const right = exams.find(exam => exam.exam_id === b) || exams.at(-1);
  const [showScores, setShowScores] = useState(false);

  const subjectRows = useMemo(
    () => (left && right && left.exam_id !== right.exam_id ? sectionComparisonRows(left, right) : []),
    [left, right]
  );

  if (exams.length < 2) {
    return <p className={s.footnote}>Yan yana karşılaştırma için en az iki sınav seçin.</p>;
  }

  const value = (exam: StudentExamResult, key: string) =>
    key === 'rank'
      ? exam.kurum_ici_sira > 0
        ? `${exam.kurum_ici_sira} / ${exam.toplam_ogrenci}`
        : '—'
      : key === 'puan'
        ? n(exam.puan)
        : key === 'percentile'
          ? n(exam.yuzdelik_dilim)
          : n(exam[key as 'total_net']);

  return (
    <details className={s.compare} open>
      <summary>İki sınavı yan yana karşılaştır</summary>
      <div className={s.comparePick}>
        {[
          { label: 'Birinci sınav', exam: left, set: setA, other: right },
          { label: 'İkinci sınav', exam: right, set: setB, other: left },
        ].map(item => (
          <label key={item.label}>
            {item.label}
            <select
              aria-label={item.label}
              value={item.exam?.exam_id || ''}
              onChange={event => item.set(Number(event.target.value))}
            >
              {exams.map(exam => (
                <option key={exam.exam_id} value={exam.exam_id} disabled={exam.exam_id === item.other?.exam_id}>
                  {exam.exam_name}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <button
        type="button"
        aria-pressed={showScores}
        onClick={() => {
          setShowScores(v => !v);
          if (!showScores) requestScores();
        }}
      >
        Puan ve sıralamaları {showScores ? 'gizle' : 'yükle / göster'}
      </button>

      {left && right && left.exam_id !== right.exam_id ? (
        <>
          <div className={s.heatScroll}>
            <table className={s.historyTable}>
              <thead>
                <tr>
                  <th>Ölçüt</th>
                  <th>{left.exam_name}</th>
                  <th>{right.exam_name}</th>
                  <th>Fark (2 − 1)</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { key: 'total_net', label: 'Net', invert: false },
                  { key: 'total_wrong', label: 'Yanlış', invert: true },
                  { key: 'total_empty', label: 'Boş', invert: true },
                  ...(showScores
                    ? [
                        { key: 'puan', label: 'Puan', invert: false },
                        { key: 'rank', label: 'Kurum sırası / katılımcı', invert: false },
                        { key: 'percentile', label: 'Tahmini yüzdelik', invert: false },
                      ]
                    : []),
                ].map(row => {
                  const av = left[row.key as keyof StudentExamResult];
                  const bv = right[row.key as keyof StudentExamResult];
                  const diff =
                    row.key === 'rank' || typeof av !== 'number' || typeof bv !== 'number' ? null : bv - av;
                  const tone =
                    diff == null || Math.abs(diff) < 0.005
                      ? undefined
                      : (row.invert ? diff < 0 : diff > 0)
                        ? 'up'
                        : 'down';
                  return (
                    <tr key={row.key}>
                      <th scope="row">{row.label}</th>
                      <td>{value(left, row.key)}</td>
                      <td>{value(right, row.key)}</td>
                      <td>
                        <span className={s.deltaCell} data-tone={tone}>
                          {diff == null ? '—' : n(diff)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {subjectRows.length > 0 && (
            <div className={s.compareSectionBlock}>
              <h4>Ders bazlı net değişimi</h4>
              <div className={s.heatScroll}>
                <table className={s.historyTable}>
                  <thead>
                    <tr>
                      <th>Ders</th>
                      <th>1. Sınav</th>
                      <th>2. Sınav</th>
                      <th>Fark</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subjectRows.map(row => (
                      <tr key={row.name}>
                        <th scope="row">{row.name}</th>
                        <td>{n(row.leftNet)}</td>
                        <td>{n(row.rightNet)}</td>
                        <td>
                          <span
                            className={s.deltaCell}
                            data-tone={
                              row.diff == null || Math.abs(row.diff) < 0.005
                                ? undefined
                                : row.diff > 0
                                  ? 'up'
                                  : 'down'
                            }
                          >
                            {signedLabel(row.diff, 2)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className={s.comparePick}>
            <button type="button" onClick={() => onOpen(left)}>
              Birinci karneyi aç
            </button>
            <button type="button" onClick={() => onOpen(right)}>
              İkinci karneyi aç
            </button>
          </div>
          <details className={s.evidence}>
            <summary>Karşılaştırma notu</summary>
            <p>
              Sıralamalar sınava giren öğrenci grubuna göre değişir. Net ve puan farkları sınav zorluk düzeyinden
              bağımsız hesaplanır.
            </p>
          </details>
        </>
      ) : (
        <p>İki farklı sınav seçin.</p>
      )}
    </details>
  );
}

/** Fetches only the focused report, never a report per point in the trend. */
export function ExamContext({
  exam,
  rankingYear,
  onOpen,
}: {
  exam: StudentExamResult;
  rankingYear?: number;
  onOpen: (exam: StudentExamResult) => void;
}) {
  const [data, setData] = useState<StudentDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let live = true;
    const controller = new AbortController();
    setData(null);
    setLoading(true);
    setError('');
    if (!exam.answer_id) {
      setLoading(false);
      return () => controller.abort();
    }
    const timeout = setTimeout(() => {
      if (live) {
        controller.abort();
        setError('Karne özeti zamanında yüklenemedi.');
        setLoading(false);
      }
    }, 30_000);
    analysisApi
      .studentDetail(exam.exam_id, exam.answer_id, rankingYear, controller.signal)
      .then(result => {
        if (live && !controller.signal.aborted) setData(result);
      })
      .catch(() => {
        if (live && !controller.signal.aborted) setError('Karne özeti alınamadı.');
      })
      .finally(() => {
        clearTimeout(timeout);
        if (live && !controller.signal.aborted) setLoading(false);
      });
    return () => {
      live = false;
      controller.abort();
      clearTimeout(timeout);
    };
  }, [exam.exam_id, exam.answer_id, rankingYear, retry]);

  return (
    <section className={s.reportContext}>
      <h3>{exam.exam_name} · karne özeti</h3>
      {loading ? (
        <p role="status">Karne özeti yükleniyor…</p>
      ) : error ? (
        <div role="alert" className={s.error}>
          <span>{error}</span>
          <button type="button" onClick={() => setRetry(v => v + 1)}>
            Karne özetini yeniden dene
          </button>
        </div>
      ) : !data ? (
        <p>Bu sınavın karne bağlantısı bulunmuyor.</p>
      ) : (
        <>
          <div className={s.contextNumbers}>
            <span>
              Kurum sırası{' '}
              <b>{data.kurum_ici_sira > 0 ? `${data.kurum_ici_sira} / ${data.toplam_ogrenci}` : '—'}</b>
            </span>
            <span>
              Sınıf sırası{' '}
              <b>{data.sinif_rank > 0 ? `${data.sinif_rank} / ${data.sinif_student_count}` : '—'}</b>
            </span>
            <span>
              Puan <b>{n(data.puan, 2)}</b>
            </span>
            <span>
              Puan / net türü <b>{data.net_etiket || 'Sınav toplamı'}</b>
            </span>
          </div>
          <div className={s.miniChart}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={[
                  { name: 'Öğrenci', net: data.alan_net ?? data.toplam_net },
                  { name: 'Kurum ort.', net: data.kurum_avg_net },
                  { name: 'Sınıf ort.', net: data.sinif_student_count > 0 ? data.sinif_avg_net : null },
                ]}
              >
                <CartesianGrid vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#475569' }} />
                <YAxis tick={{ fontSize: 12, fill: '#64748b' }} />
                <Tooltip />
                <Bar dataKey="net" name="Net" fill="#4f46e5" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className={s.footnote}>
            Öğrenci {n(data.alan_net ?? data.toplam_net)} · Kurum {n(data.kurum_avg_net)} · Sınıf{' '}
            {n(data.sinif_student_count > 0 ? data.sinif_avg_net : null)}
          </p>
          {data.difficulty?.bands.some(band => band.yanlis + band.bos > 0) ? (
            <>
              <h4>Zorluk düzeyine göre hatalar</h4>
              <div className={s.heatScroll}>
                <table className={s.historyTable}>
                  <thead>
                    <tr>
                      <th>Zorluk</th>
                      <th>Soru</th>
                      <th>Doğru</th>
                      <th>Yanlış</th>
                      <th>Boş</th>
                      <th>Hata %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.difficulty.bands
                      .filter(band => band.yanlis + band.bos > 0)
                      .map(band => (
                        <tr key={band.key}>
                          <th>{band.label}</th>
                          <td>{band.soru}</td>
                          <td>{band.dogru}</td>
                          <td>{band.yanlis}</td>
                          <td>{band.bos}</td>
                          <td>{band.soru > 0 ? `%${n((100 * (band.yanlis + band.bos)) / band.soru, 0)}` : '—'}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}
          <button type="button" className={s.secondaryButton} onClick={() => onOpen(exam)}>
            Tam karneyi aç
          </button>
        </>
      )}
    </section>
  );
}

// ── Unified Modern Sınavlarım View ───────────────────────────────────────────

type MineSort = 'date-desc' | 'date-asc' | 'net-desc' | 'net-asc';

export function ExamListPanel({
  exams,
  allTypeExams,
  scoresLoading,
  pdfBusy,
  onAnalyze,
  onCompare,
  onOpenKarne,
  onDownloadKarne,
}: {
  exams: StudentExamResult[];
  allTypeExams: StudentExamResult[];
  scoresLoading: boolean;
  pdfBusy: number | null;
  onAnalyze: (exam: StudentExamResult) => void;
  onCompare: (leftId: number, rightId: number) => void;
  onOpenKarne: (exam: StudentExamResult) => void;
  onDownloadKarne: (exam: StudentExamResult) => void;
}) {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<MineSort>('date-desc');
  const [expanded, setExpanded] = useState<number | null>(null);

  const prevExamById = useMemo(() => {
    const map = new Map<number, StudentExamResult>();
    const chrono = allTypeExams
      .slice()
      .sort((a, b) => (a.exam_date || '').localeCompare(b.exam_date || '') || a.exam_id - b.exam_id);
    chrono.forEach((exam, idx) => {
      if (idx > 0) map.set(exam.exam_id, chrono[idx - 1]);
    });
    return map;
  }, [allTypeExams]);

  const filtered = useMemo(() => {
    const q = foldTr(search.trim());
    const base = q ? exams.filter(e => foldTr(e.exam_name).includes(q)) : exams;
    return base.slice().sort((a, b) => {
      if (sort === 'net-desc') return b.total_net - a.total_net;
      if (sort === 'net-asc') return a.total_net - b.total_net;
      const cmp = (a.exam_date || '').localeCompare(b.exam_date || '') || a.exam_id - b.exam_id;
      return sort === 'date-asc' ? cmp : -cmp;
    });
  }, [exams, search, sort]);

  const stats = useMemo(() => {
    if (!exams.length) return null;
    const nets = exams.map(e => e.total_net);
    const scores = exams.map(e => e.puan).filter((p): p is number => p != null && Number.isFinite(p));
    return {
      count: exams.length,
      avgNet: nets.reduce((a, b) => a + b, 0) / nets.length,
      maxNet: Math.max(...nets),
      avgScore: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null,
    };
  }, [exams]);

  return (
    <section className={s.examListSection} aria-label="Sınav listesi">
      {stats && (
        <div className={s.mineSummary}>
          <div>
            <span>Sınav sayısı</span>
            <b>{stats.count}</b>
          </div>
          <div>
            <span>Ortalama net</span>
            <b>{fixedLabel(stats.avgNet, 2)}</b>
          </div>
          <div>
            <span>En yüksek net</span>
            <b>{fixedLabel(stats.maxNet, 2)}</b>
          </div>
          <div>
            <span>Ortalama puan</span>
            <b>{scoresLoading && stats.avgScore == null ? '…' : fixedLabel(stats.avgScore, 2)}</b>
          </div>
        </div>
      )}

      <div className={s.mineToolbar}>
        <label className={s.mineSearch}>
          <Search size={15} />
          <input
            aria-label="Sınav ara"
            placeholder="Sınav adı ara…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </label>
        <label className={s.mineSort}>
          <span>Sıralama</span>
          <select aria-label="Sınav sıralaması" value={sort} onChange={e => setSort(e.target.value as MineSort)}>
            <option value="date-desc">Tarih · yeni önce</option>
            <option value="date-asc">Tarih · eski önce</option>
            <option value="net-desc">Net · yüksek önce</option>
            <option value="net-asc">Net · düşük önce</option>
          </select>
        </label>
      </div>

      {!filtered.length ? (
        <div className={s.empty}>Aramanızla eşleşen sınav bulunamadı.</div>
      ) : (
        <div className={s.examCards}>
          {filtered.map(exam => {
            const prev = prevExamById.get(exam.exam_id);
            const netDelta = prev ? exam.total_net - prev.total_net : null;
            const rank = examRank(exam);
            const tree = buildSectionTree(exam);
            const isOpen = expanded === exam.exam_id;

            const prevSecNet = new Map<string, number>();
            if (prev) {
              (prev.section_details || []).forEach(sec => prevSecNet.set(sectionKey(sec.section_name), sec.net));
            }

            return (
              <article key={exam.exam_id} className={`${s.examCard} ${isOpen ? s.examCardOpen : ''}`}>
                <button
                  type="button"
                  className={s.examCardHead}
                  aria-expanded={isOpen}
                  onClick={() => tree.length && setExpanded(isOpen ? null : exam.exam_id)}
                >
                  <div className={s.examCardTitle}>
                    <div className={s.examBadges}>
                      <span className={s.typePill}>{examTypeLabel(exam.exam_type)}</span>
                      {rank.kind && <span className={s.kindPill}>{rank.kind}</span>}
                      <span className={s.examDateText}>{dateLabel(exam.exam_date, true)}</span>
                    </div>
                    <h3>{exam.exam_name}</h3>
                  </div>

                  <div className={s.examMetrics}>
                    <div className={s.metricBox}>
                      <small>D / Y / B</small>
                      <b>
                        <i className={s.cOk}>{exam.total_correct}</i> / <i className={s.cBad}>{exam.total_wrong}</i> /{' '}
                        <i>{exam.total_empty}</i>
                      </b>
                    </div>
                    <div className={s.metricBox}>
                      <small>{exam.exam_type === 'YKS_AYT' ? 'Alan neti' : 'Toplam net'}</small>
                      <div className={s.netWithDelta}>
                        <strong>{fixedLabel(exam.total_net, 2)}</strong>
                        {netDelta != null && Math.abs(netDelta) >= 0.01 && (
                          <span className={netDelta > 0 ? s.positive : s.negative}>
                            {netDelta > 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
                            {signedLabel(netDelta, 1)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className={s.metricBox}>
                      <small>Puan</small>
                      <strong>{scoresLoading && exam.puan == null ? '…' : fixedLabel(exam.puan, 2)}</strong>
                    </div>
                    <div className={s.metricBox}>
                      <small>Tahmini sıra</small>
                      <strong>
                        {rank.rank != null ? Math.round(rank.rank).toLocaleString('tr-TR') : scoresLoading ? '…' : '—'}
                      </strong>
                    </div>
                  </div>
                  <ChevronDown size={16} className={`${s.expandChevron} ${isOpen ? s.expandChevronOpen : ''}`} />
                </button>

                <div className={s.examCardFoot}>
                  <div className={s.examRankMeta}>
                    <span>
                      Kurum:{' '}
                      <b>{exam.kurum_ici_sira > 0 ? `${exam.kurum_ici_sira} / ${exam.toplam_ogrenci}` : '—'}</b>
                    </span>
                    <span>
                      {rank.pct == null
                        ? 'Ulusal yüzdelik bu türde yok'
                        : `Adayların %${n(rank.pct, 1)} önünde`}
                    </span>
                  </div>
                  <div className={s.examCardActions}>
                    <button type="button" className={s.actionPrimary} onClick={() => onAnalyze(exam)}>
                      Önerileri incele
                    </button>
                    {prev && (
                      <button
                        type="button"
                        className={s.actionGhost}
                        onClick={() => onCompare(prev.exam_id, exam.exam_id)}
                      >
                        <ArrowLeftRight size={13} /> Öncekiyle kıyasla
                      </button>
                    )}
                    <button type="button" className={s.actionGhost} onClick={() => onOpenKarne(exam)}>
                      <FileText size={13} /> Karne
                    </button>
                    <button
                      type="button"
                      className={s.actionGhost}
                      disabled={pdfBusy === exam.exam_id}
                      onClick={() => onDownloadKarne(exam)}
                    >
                      <Download size={13} /> {pdfBusy === exam.exam_id ? '…' : 'PDF'}
                    </button>
                  </div>
                </div>

                {isOpen && tree.length > 0 && (
                  <div className={s.secTableWrap}>
                    <table className={s.secTable}>
                      <thead>
                        <tr>
                          <th>Ders</th>
                          <th>D</th>
                          <th>Y</th>
                          <th>B</th>
                          <th>Net</th>
                          {prev && <th>Öncekiye göre</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {tree.map(sec => {
                          const prevNet = prevSecNet.get(sectionKey(sec.section_name));
                          const diff = prevNet != null ? sec.net - prevNet : null;
                          return [
                            <tr key={sec.section_id} className={sec.children.length ? s.secParentRow : undefined}>
                              <th>{sec.section_name}</th>
                              <td className={s.cOk}>{sec.correct}</td>
                              <td className={s.cBad}>{sec.wrong}</td>
                              <td>{sec.empty}</td>
                              <td>
                                <b>{n(sec.net, 2)}</b>
                                <small> / {sec.question_count}</small>
                              </td>
                              {prev && (
                                <td>
                                  <span
                                    className={s.deltaCell}
                                    data-tone={
                                      diff == null || Math.abs(diff) < 0.01 ? undefined : diff > 0 ? 'up' : 'down'
                                    }
                                  >
                                    {signedLabel(diff, 2)}
                                  </span>
                                </td>
                              )}
                            </tr>,
                            ...sec.children.map(child => {
                              const cPrevNet = prevSecNet.get(sectionKey(child.section_name));
                              const cDiff = cPrevNet != null ? child.net - cPrevNet : null;
                              return (
                                <tr key={child.section_id} className={s.secChildRow}>
                                  <th>{child.section_name}</th>
                                  <td className={s.cOk}>{child.correct}</td>
                                  <td className={s.cBad}>{child.wrong}</td>
                                  <td>{child.empty}</td>
                                  <td>
                                    <b>{n(child.net, 2)}</b>
                                    <small> / {child.question_count}</small>
                                  </td>
                                  {prev && (
                                    <td>
                                      <span
                                        className={s.deltaCell}
                                        data-tone={
                                          cDiff == null || Math.abs(cDiff) < 0.01
                                            ? undefined
                                            : cDiff > 0
                                              ? 'up'
                                              : 'down'
                                        }
                                      >
                                        {signedLabel(cDiff, 2)}
                                      </span>
                                    </td>
                                  )}
                                </tr>
                              );
                            }),
                          ];
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
