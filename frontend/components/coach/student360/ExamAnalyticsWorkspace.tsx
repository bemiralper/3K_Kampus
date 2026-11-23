'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Brush,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertCircle,
  ArrowDownRight,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  ChartNoAxesCombined,
  ChevronRight,
  Filter,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { studentExamApi } from '@/components/olcme/api';
import type {
  DevelopmentOutcome,
  DevelopmentResponse,
  StudentExamResult,
  StudyRecommendation,
} from '@/components/olcme/types';
import {
  buildLossTopics,
  chronologicalExams,
  coverage,
  dateLabel,
  estimatePenaltyCost,
  evidenceSummary,
  examTypeGroup,
  examTypeLabel,
  fixedLabel,
  groupOutcomes,
  lossDominance,
  lossStateLabels,
  matchAgendaForOutcome,
  numberLabel as n,
  signedLabel,
  sortTopics,
  type TopicSort,
} from './examAnalyticsModel';
import {
  CoveragePanel,
  DecisionSummary,
  ExamCompare,
  ExamContext,
  ExamListPanel,
  PeriodPanel,
} from './ExamAnalyticsPanels';
import {
  OutcomeCoachActionBar,
  StudyRecommendationsPanel,
  type CoachActionHandler,
} from './StudyRecommendationsPanel';
import s from './ExamAnalyticsWorkspace.module.css';

export type ExamWorkspaceView = 'overview' | 'mine' | 'growth' | 'plan';

type Props = {
  scopeKey: string;
  rankingYear?: number;
  scoresLoading?: boolean;
  onRequestScores: () => void;
  studentId: number;
  exams: StudentExamResult[];
  view: ExamWorkspaceView;
  refreshKey: number;
  pdfBusy: number | null;
  onViewChange: (view: ExamWorkspaceView) => void;
  onOpen: (exam: StudentExamResult) => void;
  onDownload: (exam: StudentExamResult) => void;
};

const PALETTE = ['#4f46e5', '#0d9488', '#e11d48', '#d97706', '#7c3aed', '#0284c7'];

const METRIC_NAMES: Record<string, string> = {
  net: 'Net',
  rate: 'Hata %',
  puan: 'Puan',
  rank: 'Kurum sırası',
  percentile: 'Yüzdelik',
};

const DEV_STATUS_BADGE: Record<string, { label: string; tone: 'up' | 'down' | 'warn' | 'flat' }> = {
  improving: { label: 'Yükseliyor', tone: 'up' },
  declining: { label: 'Geriliyor', tone: 'down' },
  fluctuating: { label: 'Dalgalı', tone: 'warn' },
  stable: { label: 'Dengeli', tone: 'flat' },
};

const STATE_CHIPS: { id: string; label: string }[] = [
  { id: 'all', label: 'Tümü' },
  { id: 'recurring', label: 'Tekrarlayan hata' },
  { id: 'new_drop', label: 'Hata arttı' },
  { id: 'improving_loss', label: 'Hata azalıyor' },
  { id: 'unmeasured', label: 'Son sınavlarda çıkmadı' },
];

export default function ExamAnalyticsWorkspace({
  scopeKey,
  rankingYear,
  scoresLoading = false,
  onRequestScores,
  studentId,
  exams,
  view,
  refreshKey,
  pdfBusy,
  onViewChange,
  onOpen,
  onDownload,
}: Props) {
  const types = useMemo(() => Array.from(new Set(exams.map(exam => exam.exam_type))), [exams]);
  const defaultType = useMemo(
    () =>
      exams
        .slice()
        .sort((a, b) => (a.exam_date || '').localeCompare(b.exam_date || '') || a.exam_id - b.exam_id)
        .at(-1)?.exam_type || types[0],
    [exams, types]
  );

  const [type, setType] = useState<string>(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(`exam-ws-filter:${scopeKey}`) || 'null');
      if (saved && types.includes(saved.type)) return saved.type;
    } catch {
      /* storage unavailable */
    }
    return defaultType;
  });

  const [windowPick, setWindowPick] = useState<string>(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(`exam-ws-filter:${scopeKey}`) || 'null');
      if (saved && ['1', '3', '5', '10', 'all', 'custom'].includes(saved.window)) return saved.window;
    } catch {
      /* storage unavailable */
    }
    return '5';
  });

  const [customIds, setCustomIds] = useState<number[]>(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(`exam-ws-filter:${scopeKey}`) || 'null');
      if (saved && Array.isArray(saved.customIds)) {
        return saved.customIds.filter((id: unknown): id is number => typeof id === 'number');
      }
    } catch {
      /* storage unavailable */
    }
    return [];
  });

  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [topicKey, setTopicKey] = useState('');
  const [topicFocused, setTopicFocused] = useState(false);
  const [topicLimit, setTopicLimit] = useState(10);
  const detailRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<TopicSort>('loss');
  const [stateFilter, setStateFilter] = useState('all');
  const [metric, setMetric] = useState('net');
  const [compareSubjects, setCompareSubjects] = useState<string[]>([]);
  const [rangeIds, setRangeIds] = useState<number[]>([]);
  const [focusExam, setFocusExam] = useState<number | null>(null);
  const [comparePreset, setComparePreset] = useState<{ leftId?: number; rightId?: number }>({});
  const [dialog, setDialog] = useState<'exam' | 'compare' | 'coverage' | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [customPickerOpen, setCustomPickerOpen] = useState(false);
  const [chartOptions, setChartOptions] = useState(false);
  const [zoom, setZoom] = useState(false);

  const [data, setData] = useState<DevelopmentResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [actionBusyKey, setActionBusyKey] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');

  useEffect(() => {
    try {
      sessionStorage.setItem(`exam-ws-filter:${scopeKey}`, JSON.stringify({ type, window: windowPick, customIds }));
    } catch {
      /* storage unavailable */
    }
  }, [scopeKey, type, windowPick, customIds]);

  const allTypeExams = useMemo(() => chronologicalExams(exams, type, 'all', '', ''), [exams, type]);

  const selected = useMemo(
    () =>
      chronologicalExams(exams, type, windowPick === 'custom' ? 'all' : windowPick, from, to).filter(
        exam => windowPick !== 'custom' || customIds.includes(exam.exam_id)
      ),
    [exams, type, windowPick, from, to, customIds]
  );

  const ids = selected.map(exam => exam.exam_id).join(',');

  useEffect(() => {
    if (topicFocused && globalThis.matchMedia('(max-width: 680px)').matches) {
      detailRef.current?.focus({ preventScroll: true });
    }
  }, [topicFocused, topicKey]);

  const requestKey = `${studentId}:${type}:${ids}:${refreshKey}:${retry}`;
  const [loadedKey, setLoadedKey] = useState('');
  const visible = loadedKey === requestKey ? data : null;

  useEffect(() => {
    setRangeIds([]);
    setFocusExam(null);
    setDialog(null);
    setTopicFocused(false);
  }, [ids]);

  useEffect(() => {
    setTopicLimit(10);
    setTopicFocused(false);
  }, [subject, query, stateFilter]);

  useEffect(() => {
    setSubject('');
    setTopicKey('');
    setCompareSubjects([]);
  }, [type]);

  // Only fetch development analytics when in overview or growth (skip in Sınavlarım!).
  useEffect(() => {
    if (view === 'mine') return;
    if (loadedKey === requestKey) return;
    const controller = new AbortController();
    let live = true;
    setLoading(true);
    setError('');
    if (!ids) {
      setData(null);
      setLoadedKey(requestKey);
      setLoading(false);
      return () => controller.abort();
    }
    const timeout = setTimeout(() => {
      if (live) {
        controller.abort();
        setError('Analiz zamanında tamamlanamadı.');
        setLoading(false);
      }
    }, 30_000);
    studentExamApi
      .development(studentId, { examType: examTypeGroup(type), window: 'custom', examIds: ids.split(',').map(Number) }, controller.signal)
      .then(result => {
        if (live && !controller.signal.aborted) {
          setData(result);
          setLoadedKey(requestKey);
        }
      })
      .catch(() => {
        if (live && !controller.signal.aborted) setError('Analiz yüklenemedi.');
      })
      .finally(() => {
        clearTimeout(timeout);
        if (live && !controller.signal.aborted) setLoading(false);
      });
    return () => {
      live = false;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [view, studentId, type, ids, requestKey, loadedKey]);

  const subjects = visible?.subjects.filter(item => item.score_included !== false) || [];
  const agendaItems = visible?.agenda?.items || [];

  const topics = useMemo(
    () =>
      buildLossTopics(
        visible?.subjects || [],
        selected.map(exam => exam.exam_id),
        type
      ).filter(item => item.loss > 0),
    [visible, selected, type]
  );

  const lossSubjects = subjects.filter(item => item.series.some(point => point.wrong + point.empty > 0));
  const activeSubject = subjects.find(item => item.name === subject);

  const subjectScopedTopics = useMemo(
    () => topics.filter(item => !subject || item.subject === subject),
    [topics, subject]
  );

  const stateCounts = useMemo(() => {
    const counts: Record<string, number> = { all: subjectScopedTopics.length };
    subjectScopedTopics.forEach(t => {
      counts[t.evidence.state] = (counts[t.evidence.state] || 0) + 1;
    });
    return counts;
  }, [subjectScopedTopics]);

  const ranked = useMemo(
    () =>
      sortTopics(
        subjectScopedTopics.filter(
          item =>
            (stateFilter === 'all' || item.evidence.state === stateFilter) &&
            `${item.subject} ${item.name}`.toLocaleLowerCase('tr-TR').includes(query.toLocaleLowerCase('tr-TR'))
        ),
        sort
      ),
    [subjectScopedTopics, stateFilter, query, sort]
  );

  const activeTopic = ranked.find(item => item.key === topicKey) || ranked[0];
  const activeTopicSubject = subjects.find(item => item.name === activeTopic?.subject);
  const outcomes = (activeTopicSubject?.outcomes || [])
    .filter(item => item.topic === activeTopic?.name && item.wrong + item.empty > 0)
    .sort((a, b) => b.wrong + b.empty - a.wrong - a.empty);

  const selectedExam = selected.find(exam => exam.exam_id === focusExam);
  const scoreMetric = ['puan', 'rank', 'percentile'].includes(metric);

  const chart = selected.map(exam => {
    const point = activeSubject?.series.find(item => item.exam_id === exam.exam_id);
    const wrong = subject ? point?.wrong ?? null : exam.total_wrong;
    const empty = subject ? point?.empty ?? null : exam.total_empty;
    const q = subject ? point?.question_count : exam.total_correct + exam.total_wrong + exam.total_empty;
    const net = subject ? point?.net ?? null : exam.total_net;
    return {
      id: exam.exam_id,
      date: dateLabel(exam.exam_date),
      name: exam.exam_name,
      net,
      wrong,
      empty,
      value:
        metric === 'puan'
          ? exam.puan
          : metric === 'rank'
            ? exam.kurum_ici_sira > 0
              ? exam.kurum_ici_sira
              : null
            : metric === 'percentile'
              ? exam.yuzdelik_dilim
              : metric === 'rate'
                ? q && wrong != null && empty != null
                  ? (100 * (wrong + empty)) / q
                  : null
                : net,
      ...Object.fromEntries(
        compareSubjects.map((name, index) => {
          const p = subjects.find(item => item.name === name)?.series.find(item => item.exam_id === exam.exam_id);
          return [
            `compare${index}`,
            metric === 'rate'
              ? p?.question_count
                ? (100 * (p.wrong + p.empty)) / p.question_count
                : null
              : p?.net ?? null,
          ];
        })
      ),
    };
  });

  const nets = chart.flatMap(point => (point.net == null ? [] : [point.net]));
  const latestNet = nets.at(-1);
  const maxNet = nets.length ? Math.max(...nets) : null;
  const average = nets.length ? nets.reduce((sum, net) => sum + net, 0) / nets.length : null;
  const change = nets.length > 1 ? nets[nets.length - 1] - nets[nets.length - 2] : null;
  const latestWrong = chart.at(-1)?.wrong ?? 0;
  const latestPenalty = estimatePenaltyCost(latestWrong, type);

  const totalWrongChart = chart.reduce((sum, point) => sum + (point.wrong || 0), 0);
  const totalEmptyChart = chart.reduce((sum, point) => sum + (point.empty || 0), 0);
  const overviewDominance = lossDominance(totalWrongChart, totalEmptyChart);

  const lossTotal = selected.reduce((sum, exam) => sum + exam.total_wrong + exam.total_empty, 0);
  const needsMapping = subjects.some(item => {
    const scope = coverage(item);
    return scope.inconsistent || scope.mapped < scope.total || item.incomplete_breakdown;
  });

  const drill = (name: string, topicName?: string) => {
    setSubject(name);
    setTopicKey(topicName ? `${name}::${topicName}` : '');
    setStateFilter('all');
    setQuery('');
    onViewChange('growth');
  };

  const selectExam = (id: number) => {
    setFocusExam(id);
    setDialog('exam');
  };

  const openCompare = (leftId?: number, rightId?: number) => {
    setComparePreset({ leftId, rightId });
    setDialog('compare');
  };

  const analyzeSingleExam = (exam: StudentExamResult) => {
    setType(exam.exam_type);
    setCustomIds([exam.exam_id]);
    setWindowPick('custom');
    setSubject('');
    setTopicKey('');
    setStateFilter('all');
    setQuery('');
    onViewChange('growth');
  };

  const handleWindowChange = (next: string) => {
    setWindowPick(next);
    if (next === 'custom') {
      if (!customIds.length) {
        setCustomIds(allTypeExams.slice(-3).map(e => e.exam_id));
      }
      setCustomPickerOpen(true);
    } else {
      setCustomPickerOpen(false);
    }
  };

  const toggleCustomExam = (id: number) => {
    setCustomIds(prev => (prev.includes(id) ? (prev.length > 1 ? prev.filter(x => x !== id) : prev) : [...prev, id]));
  };

  const handleStudyAction: CoachActionHandler = async (item, status, note) => {
    if (!visible) return;
    setActionBusyKey(item.key);
    setActionError('');
    try {
      await studentExamApi.studyAction(studentId, {
        key: item.key,
        revision: item.revision,
        status,
        note,
        filters: visible.filters,
      });
      setData(prev => {
        if (!prev?.agenda) return prev;
        return {
          ...prev,
          agenda: {
            ...prev.agenda,
            items: prev.agenda.items.map(row =>
              row.key === item.key ? { ...row, status, note } : row
            ),
          },
        };
      });
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Koç kararı kaydedilemedi.');
    } finally {
      setActionBusyKey(null);
    }
  };

  const chartClick = (event: { activeTooltipIndex?: number | string | null }) => {
    const index = Number(event?.activeTooltipIndex);
    if (event?.activeTooltipIndex != null && chart[index]) selectExam(chart[index].id);
  };

  const hasActiveFilter = Boolean(from || to);

  return (
    <div className={s.root}>
      {/* Shared Unified Toolbar */}
      <div className={s.toolbar}>
        <div className={s.typeTabs} aria-label="Sınav türü">
          {types.map(item => (
            <button
              type="button"
              key={item}
              aria-pressed={type === item}
              onClick={() => {
                setType(item);
                if (windowPick === 'custom') {
                  setWindowPick('5');
                  setCustomPickerOpen(false);
                }
              }}
            >
              {examTypeLabel(item)}
            </button>
          ))}
        </div>
        <div className={s.tools}>
          <select
            aria-label="Sınav kapsamı"
            value={windowPick}
            onChange={event => handleWindowChange(event.target.value)}
          >
            <option value="1">Son sınav</option>
            <option value="3">Son 3 sınav</option>
            <option value="5">Son 5 sınav</option>
            <option value="10">Son 10 sınav</option>
            <option value="all">Tüm sınavlar</option>
            <option value="custom">
              Seçili sınavlar{customIds.length > 0 ? ` (${selected.length})` : ''}
            </option>
          </select>
          <button
            type="button"
            className={`${s.toolButton} ${hasActiveFilter || filtersOpen ? s.toolActive : ''}`}
            aria-label="Analiz filtreleri"
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen(value => !value)}
          >
            <Filter size={14} />
            <span>Filtrele</span>
            {hasActiveFilter && <i className={s.activeDot} />}
          </button>
          <button type="button" className={s.toolButton} onClick={() => openCompare()}>
            Karşılaştır <ArrowUpRight size={14} />
          </button>
        </div>
      </div>

      {/* Custom Exam Selection Banner / Picker */}
      {windowPick === 'custom' && (
        <div className={s.customBanner}>
          <div className={s.customBannerHead}>
            <span>
              Özel sınav seçimi aktif: <b>{selected.length} sınav</b>
              {selected.length === 1 && ` · ${selected[0].exam_name}`}
            </span>
            <div className={s.customBannerActions}>
              <button
                type="button"
                className={s.textButton}
                onClick={() => setCustomPickerOpen(v => !v)}
              >
                {customPickerOpen ? 'Listeyi gizle' : 'Sınavları düzenle'}
              </button>
              <button
                type="button"
                className={s.textButton}
                onClick={() => {
                  setWindowPick('5');
                  setCustomPickerOpen(false);
                }}
              >
                Son 5 sınava dön
              </button>
            </div>
          </div>
          {customPickerOpen && (
            <div className={s.customPickerList}>
              {allTypeExams
                .slice()
                .reverse()
                .map(exam => {
                  const checked = customIds.includes(exam.exam_id);
                  return (
                    <label key={exam.exam_id} className={checked ? s.customPickOn : undefined}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleCustomExam(exam.exam_id)}
                      />
                      <span>{exam.exam_name}</span>
                      <small>{dateLabel(exam.exam_date)}</small>
                    </label>
                  );
                })}
            </div>
          )}
        </div>
      )}

      {/* Expandable Date Filter Panel (Başlangıç/Bitiş stay hidden until Analiz filtreleri is clicked) */}
      {filtersOpen && (
        <div className={s.filterPanel}>
          <label>
            Başlangıç
            <input type="date" value={from} max={to || undefined} onChange={event => setFrom(event.target.value)} />
          </label>
          <label>
            Bitiş
            <input type="date" value={to} min={from || undefined} onChange={event => setTo(event.target.value)} />
          </label>
          {view === 'growth' && (
            <label>
              Durum
              <select
                aria-label="Kayıp durumu"
                value={stateFilter}
                onChange={event => setStateFilter(event.target.value)}
              >
                <option value="all">Tüm kayıplar</option>
                {Object.entries(lossStateLabels)
                  .filter(([key]) => key !== 'no_loss')
                  .map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
              </select>
            </label>
          )}
          {(from || to) && (
            <button
              type="button"
              className={s.textButton}
              onClick={() => {
                setFrom('');
                setTo('');
              }}
            >
              Tarihleri temizle
            </button>
          )}
        </div>
      )}

      {/* Content */}
      {from && to && from > to ? (
        <div className={s.error} role="alert">
          <AlertCircle size={16} />
          <span>Tarih aralığını kontrol edin.</span>
        </div>
      ) : !selected.length ? (
        <div className={s.empty}>Bu aralıkta sınav yok.</div>
      ) : view === 'mine' ? (
        <ExamListPanel
          exams={selected}
          allTypeExams={allTypeExams}
          scoresLoading={scoresLoading}
          pdfBusy={pdfBusy}
          onAnalyze={analyzeSingleExam}
          onCompare={(leftId, rightId) => openCompare(leftId, rightId)}
          onOpenKarne={onOpen}
          onDownloadKarne={onDownload}
        />
      ) : view === 'plan' ? (
        <StudyRecommendationsPanel
          data={visible}
          exams={selected}
          examType={type}
          loading={loading}
          error={error}
          actionError={actionError}
          busyKey={actionBusyKey}
          onAction={handleStudyAction}
          onOpenInDeep={(subName, topName) => drill(subName, topName)}
          onRetry={() => setRetry(value => value + 1)}
        />
      ) : (
        <>
          {error && (
            <div className={s.error} role="alert">
              <AlertCircle size={16} />
              <span>{error}</span>
              <button type="button" onClick={() => setRetry(value => value + 1)}>
                Yeniden dene
              </button>
            </div>
          )}

          {view === 'overview' ? (
            <>
              {/* Hero Trend Card */}
              <section className={s.trendPanel} aria-label="Sınav performansı">
                <div className={s.trendHead}>
                  <div className={s.heroBlock}>
                    <div className={s.eyebrowRow}>
                      <span className={s.eyebrow}>
                        {subject ? `${subject} · ${examTypeLabel(type)}` : `${examTypeLabel(type)} PERFORMANSI`}
                      </span>
                      {subject && (
                        <button
                          type="button"
                          className={s.clearSubjectChip}
                          onClick={() => setSubject('')}
                        >
                          Tüm derslere dön <X size={12} />
                        </button>
                      )}
                    </div>
                    <div className={s.heroValue}>
                      <strong>{n(latestNet)}</strong>
                      <span>son net</span>
                      {change != null && Math.abs(change) >= 0.01 && (
                        <small className={change < 0 ? s.negative : s.positive}>
                          {change < 0 ? <ArrowDownRight size={14} /> : <ArrowUpRight size={14} />}
                          {signedLabel(change, 1)}
                        </small>
                      )}
                    </div>
                    <div className={s.heroMeta}>
                      <span>
                        Ortalama <b>{n(average)}</b>
                      </span>
                      <span>
                        En yüksek <b>{n(maxNet)}</b>
                      </span>
                      {latestPenalty > 0 && (
                        <span className={s.penaltyNote}>
                          Son yanlış cezası <b>−{fixedLabel(latestPenalty, 2)} net</b>
                        </span>
                      )}
                    </div>
                  </div>
                  <div className={s.trendControls}>
                    <div className={s.metricSwitch} aria-label="Grafik ölçütü">
                      {['net', 'rate', 'puan', 'rank', 'percentile'].map(value => (
                        <button
                          type="button"
                          key={value}
                          aria-pressed={metric === value}
                          onClick={() => {
                            setMetric(value);
                            if (['puan', 'rank', 'percentile'].includes(value)) {
                              setSubject('');
                              setCompareSubjects([]);
                              onRequestScores();
                            }
                          }}
                        >
                          {METRIC_NAMES[value]}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      className={`${s.iconButton} ${chartOptions ? s.toolActive : ''}`}
                      aria-label="Grafik seçenekleri"
                      aria-expanded={chartOptions}
                      onClick={() => setChartOptions(value => !value)}
                    >
                      <SlidersHorizontal size={16} />
                    </button>
                  </div>
                </div>

                {chartOptions && (
                  <div className={s.chartOptions}>
                    <label>
                      <input type="checkbox" checked={zoom} onChange={event => setZoom(event.target.checked)} />
                      Yakın ölçek
                    </label>
                    {subjects.map(item => (
                      <label key={item.name}>
                        <input
                          type="checkbox"
                          checked={compareSubjects.includes(item.name)}
                          disabled={scoreMetric}
                          onChange={event =>
                            setCompareSubjects(names =>
                              event.target.checked ? [...names, item.name] : names.filter(name => name !== item.name)
                            )
                          }
                        />
                        {item.name}
                      </label>
                    ))}
                  </div>
                )}

                <div className={s.mainChart}>
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={chart} onClick={chartClick} margin={{ top: 14, right: 12, bottom: 0, left: -14 }}>
                      <defs>
                        <linearGradient id={`trend-${studentId}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#4f46e5" stopOpacity={0.22} />
                          <stop offset="100%" stopColor="#4f46e5" stopOpacity={0.01} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid vertical={false} stroke="#e2e8f0" strokeDasharray="3 3" />
                      <XAxis
                        dataKey="date"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: '#64748b', fontSize: 12 }}
                        minTickGap={24}
                      />
                      <YAxis
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: '#64748b', fontSize: 12 }}
                        reversed={metric === 'rank'}
                        domain={
                          metric === 'rate' || metric === 'percentile'
                            ? [0, 100]
                            : metric === 'rank'
                              ? [1, 'auto']
                              : zoom
                                ? ['auto', 'auto']
                                : [(minimum: number) => Math.min(0, minimum), 'auto']
                        }
                      />
                      <Tooltip
                        contentStyle={{
                          border: '1px solid #e2e8f0',
                          borderRadius: 12,
                          boxShadow: '0 10px 30px rgba(15, 23, 42, 0.12)',
                          fontSize: 12,
                          color: '#0f172a',
                        }}
                        labelFormatter={(_, payload) => payload?.[0]?.payload?.name || ''}
                        formatter={(value, name) => [n(Number(value)), name]}
                      />
                      <Area
                        type="monotone"
                        dataKey="value"
                        name={METRIC_NAMES[metric]}
                        stroke="#4f46e5"
                        strokeWidth={2.5}
                        fill={`url(#trend-${studentId})`}
                        dot={{ r: 3.5, fill: '#fff', stroke: '#4f46e5', strokeWidth: 2 }}
                        activeDot={{ r: 6, fill: '#4f46e5', stroke: '#fff', strokeWidth: 2 }}
                        connectNulls={false}
                      />
                      {compareSubjects.map((name, index) => (
                        <Line
                          key={name}
                          type="monotone"
                          dataKey={`compare${index}`}
                          name={name}
                          stroke={PALETTE[(index + 1) % PALETTE.length]}
                          strokeWidth={2}
                          dot={{ r: 2.5 }}
                          connectNulls={false}
                        />
                      ))}
                      <Brush
                        ariaLabel="Sınav aralığı; ok tuşlarıyla değiştirin"
                        dataKey="date"
                        height={20}
                        stroke="#cbd5e1"
                        fill="#f8fafc"
                        onChange={range => {
                          if (range.startIndex != null && range.endIndex != null) {
                            setRangeIds(
                              selected.slice(range.startIndex, range.endIndex + 1).map(exam => exam.exam_id)
                            );
                          }
                        }}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>

                <div className={s.trendFoot}>
                  <span>
                    {selected.length} sınav · Ortalama <b>{n(average)}</b>
                  </span>
                  {rangeIds.length > 0 && rangeIds.length < selected.length ? (
                    <button
                      type="button"
                      className={s.textButton}
                      onClick={() => {
                        setCustomIds(rangeIds);
                        setWindowPick('custom');
                        setRangeIds([]);
                        onViewChange('growth');
                      }}
                    >
                      {rangeIds.length} sınavı incele <ArrowRight size={14} />
                    </button>
                  ) : (
                    <span>
                      {dateLabel(selected[0]?.exam_date)} — {dateLabel(selected.at(-1)?.exam_date)}
                    </span>
                  )}
                </div>

                {chart.every(point => point.value == null) && (
                  <p className={s.shortNote}>
                    {scoreMetric && scoresLoading
                      ? 'Puan ve sıralamalar yükleniyor…'
                      : 'Bu ölçüt için veri bulunmuyor.'}
                  </p>
                )}
              </section>

              {/* Coach Decision Summary Strip (4 cards) */}
              {visible && (
                <DecisionSummary
                  topics={topics}
                  subjects={subjects}
                  summary={visible.summary}
                  onSelect={(subName, topName) => drill(subName, topName)}
                />
              )}

              {/* Bottom 2-column Grid: Subjects + Wrong/Empty Breakdown */}
              <div className={s.overviewBottom}>
                <section className={s.subjectPanel}>
                  <div className={s.sectionHead}>
                    <h3>Derslerin görünümü</h3>
                    <span>Son sınav · ders seçip grafiği filtreleyin</span>
                  </div>
                  {loading && !visible ? (
                    <Loading />
                  ) : subjects.length ? (
                    <div className={s.courseGrid}>
                      {subjects.map((item, index) => {
                        const latestExamId = selected.at(-1)?.exam_id;
                        const prevExamId = selected.at(-2)?.exam_id;
                        const point = item.series.find(row => row.exam_id === latestExamId);
                        const prevPoint = prevExamId ? item.series.find(row => row.exam_id === prevExamId) : undefined;
                        const diff = point && prevPoint ? point.net - prevPoint.net : null;
                        const statusInfo = item.is_volatile
                          ? DEV_STATUS_BADGE.fluctuating
                          : DEV_STATUS_BADGE[item.development_status];
                        const color = PALETTE[index % PALETTE.length];
                        return (
                          <button
                            type="button"
                            className={s.courseCard}
                            key={item.name}
                            onClick={() => {
                              setSubject(subject === item.name ? '' : item.name);
                              if (scoreMetric) setMetric('net');
                            }}
                            aria-pressed={subject === item.name}
                          >
                            <div className={s.courseCardBody}>
                              <div className={s.courseCardTop}>
                                <span className={s.courseTitle}>{item.name}</span>
                                {statusInfo && (
                                  <em className={s.statusTag} data-tone={statusInfo.tone}>
                                    {statusInfo.label}
                                  </em>
                                )}
                              </div>
                              <div className={s.courseNetRow}>
                                <b>
                                  {n(point?.net)}
                                  <small>net</small>
                                </b>
                                {diff != null && Math.abs(diff) >= 0.05 && (
                                  <span className={diff > 0 ? s.positive : s.negative}>
                                    {signedLabel(diff, 1)}
                                  </span>
                                )}
                              </div>
                              <span className={s.courseAvg}>Ort. {n(item.average_net)} net</span>
                            </div>
                            <div className={s.spark}>
                              <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={item.series}>
                                  <Area
                                    type="monotone"
                                    dataKey="net"
                                    stroke={color}
                                    fill={color}
                                    fillOpacity={0.12}
                                    strokeWidth={2}
                                    isAnimationActive={false}
                                  />
                                </AreaChart>
                              </ResponsiveContainer>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className={s.shortNote}>{error ? 'Ders verisi alınamadı.' : 'Ders verisi yok.'}</div>
                  )}
                </section>

                <section className={s.lossPreview}>
                  <div className={s.sectionHead}>
                    <h3>Yanlış / boş</h3>
                    <span>
                      {n(subject && !visible ? null : totalWrongChart + totalEmptyChart, 0)} toplam
                    </span>
                  </div>
                  <div className={s.lossLegendRow}>
                    <span>
                      <i className={s.wrongDot} /> {totalWrongChart} yanlış
                    </span>
                    <span>
                      <i className={s.emptyDot} /> {totalEmptyChart} boş
                    </span>
                    <em className={s.dominancePill} data-kind={overviewDominance.kind}>
                      {overviewDominance.shortLabel}
                    </em>
                  </div>
                  <div className={s.smallChart}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chart} margin={{ top: 6, right: 4, left: -24, bottom: 0 }}>
                        <CartesianGrid vertical={false} stroke="#f1f5f9" />
                        <XAxis
                          dataKey="date"
                          tickLine={false}
                          axisLine={false}
                          tick={{ fontSize: 11, fill: '#64748b' }}
                          minTickGap={22}
                        />
                        <YAxis
                          tickLine={false}
                          axisLine={false}
                          tick={{ fontSize: 11, fill: '#64748b' }}
                          allowDecimals={false}
                        />
                        <Tooltip
                          contentStyle={{
                            border: '1px solid #e2e8f0',
                            borderRadius: 10,
                            fontSize: 12,
                          }}
                          labelFormatter={(_, payload) => payload?.[0]?.payload?.name || ''}
                        />
                        <Bar dataKey="wrong" name="Yanlış" fill="#f43f5e" stackId="loss" />
                        <Bar dataKey="empty" name="Boş" fill="#f59e0b" stackId="loss" radius={[5, 5, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <button
                    type="button"
                    className={s.deepLink}
                    onClick={() => {
                      setSubject('');
                      setTopicKey('');
                      onViewChange('growth');
                    }}
                  >
                    Kayıpların kaynağına in <ArrowRight size={15} />
                  </button>
                </section>
              </div>

              {/* Exam Quick Access Strip */}
              <div className={s.examStrip} aria-label="Sınav seçimi">
                {selected.map(exam => (
                  <button type="button" key={exam.exam_id} onClick={() => selectExam(exam.exam_id)}>
                    <span>{dateLabel(exam.exam_date)}</span>
                    <b>{exam.exam_name}</b>
                    <em>{n(exam.total_net)} net</em>
                    <ArrowUpRight size={13} />
                  </button>
                ))}
              </div>
            </>
          ) : (
            /* Deep Analysis (Derin Analiz) — Action/Plan/Note intentionally deferred to final phase */
            <section className={s.analysisBoard} aria-label="Kayıp analizi">
              <aside className={s.courseRail}>
                <div className={s.railTitle}>DERSLER</div>
                <button
                  type="button"
                  aria-pressed={!subject}
                  onClick={() => {
                    setSubject('');
                    setTopicKey('');
                  }}
                >
                  <ChartNoAxesCombined size={15} />
                  <span>Tümü</span>
                  <b>{n(lossTotal, 0)}</b>
                </button>
                {lossSubjects.map(item => {
                  const loss = item.series.reduce((sum, point) => sum + point.wrong + point.empty, 0);
                  return (
                    <button
                      type="button"
                      key={item.name}
                      title={item.name}
                      aria-pressed={subject === item.name}
                      onClick={() => {
                        setSubject(item.name);
                        setTopicKey('');
                      }}
                    >
                      <span className={s.courseDot} />
                      <span>{item.name}</span>
                      <b>{loss}</b>
                    </button>
                  );
                })}
              </aside>

              <div className={s.lossWorkspace}>
                <div className={s.analysisHead}>
                  <div>
                    <h2>{subject || 'En çok kaybettiren konular'}</h2>
                    <span>{ranked.length} konu · yanlış ve boş bırakılan sorular</span>
                  </div>
                  <div className={s.analysisControls}>
                    <label className={s.search}>
                      <Search size={14} />
                      <input
                        aria-label="Konu ara"
                        placeholder="Konu ara…"
                        value={query}
                        onChange={event => setQuery(event.target.value)}
                      />
                    </label>
                    <select
                      aria-label="Konu sıralaması"
                      className={s.inlineSelect}
                      value={sort}
                      onChange={event => setSort(event.target.value as TopicSort)}
                    >
                      <option value="loss">En çok hata yapılan</option>
                      <option value="priority">Öncelik sırası</option>
                      <option value="rate">Hata oranı yüksek</option>
                      <option value="decline">Son sınavlarda artan</option>
                    </select>
                  </div>
                </div>

                {/* Quick Status Filter Chips */}
                <div className={s.stateChips} role="group" aria-label="Hızlı durum filtresi">
                  {STATE_CHIPS.map(chip => {
                    const count = stateCounts[chip.id] || 0;
                    if (chip.id !== 'all' && count === 0 && stateFilter !== chip.id) return null;
                    return (
                      <button
                        type="button"
                        key={chip.id}
                        aria-pressed={stateFilter === chip.id}
                        onClick={() => setStateFilter(chip.id)}
                      >
                        {chip.label}
                        <span>{count}</span>
                      </button>
                    );
                  })}
                </div>

                {error ? (
                  <div className={s.empty}>Kayıp verisi alınamadı.</div>
                ) : loading && !visible ? (
                  <Loading />
                ) : !ranked.length ? (
                  <div className={s.empty}>
                    {topics.length
                      ? 'Bu filtrede sonuç bulunamadı.'
                      : subjects.length
                        ? 'Kazanımı girilmiş konularda hata bulunmuyor.'
                        : 'Bu sınavlarda kazanım eşleşmesi bulunmuyor.'}
                  </div>
                ) : (
                  <div className={s.analysisSplit} data-focused={topicFocused}>
                    <div ref={listRef} tabIndex={-1} className={s.topicList} aria-label="Kayıplı konular">
                      <div className={s.listLabels}>
                        <span>KONU</span>
                        <span>KAYIP</span>
                      </div>
                      {ranked.slice(0, topicLimit).map((item, index) => {
                        const stateLabel =
                          item.evidence.state !== 'isolated' && item.evidence.state !== 'no_loss'
                            ? lossStateLabels[item.evidence.state]
                            : null;
                        return (
                          <button
                            type="button"
                            key={item.key}
                            className={s.topicRow}
                            aria-pressed={activeTopic?.key === item.key}
                            onClick={() => {
                              setTopicKey(item.key);
                              setTopicFocused(true);
                            }}
                          >
                            <span className={s.rankIndex}>{String(index + 1).padStart(2, '0')}</span>
                            <span className={s.topicName}>
                              <b>{item.name}</b>
                              <small className={s.topicSubRow}>
                                <span>{item.subject}</span>
                                {stateLabel && (
                                  <em className={s.topicStatePill} data-state={item.evidence.state}>
                                    {stateLabel}
                                  </em>
                                )}
                                {item.netPotentialPerExam >= 0.15 && (
                                  <i className={s.netGainTag}>+{n(item.netPotentialPerExam, 1)} net/s</i>
                                )}
                              </small>
                              <span className={s.lossBar}>
                                <i
                                  style={{
                                    width: `${item.question_count ? (100 * item.wrong) / item.question_count : 0}%`,
                                  }}
                                />
                                <i
                                  style={{
                                    width: `${item.question_count ? (100 * item.empty) / item.question_count : 0}%`,
                                  }}
                                />
                              </span>
                            </span>
                            <span className={s.rowLoss}>
                              <b>{item.loss}</b>
                              <small>%{n(item.rate, 0)}</small>
                            </span>
                            <ChevronRight size={14} />
                          </button>
                        );
                      })}
                      {ranked.length > topicLimit && (
                        <button
                          type="button"
                          className={s.showMore}
                          onClick={() => setTopicLimit(limit => limit + 10)}
                        >
                          +{ranked.length - topicLimit} konu daha göster
                        </button>
                      )}
                    </div>

                    {activeTopic && (
                      <div ref={detailRef} tabIndex={-1} className={s.topicDetail} key={activeTopic.key}>
                        <button
                          type="button"
                          className={s.backButton}
                          onClick={() => {
                            setTopicFocused(false);
                            requestAnimationFrame(() => listRef.current?.focus({ preventScroll: true }));
                          }}
                        >
                          <ArrowLeft size={13} />
                          Konulara dön
                        </button>

                        <div className={s.topicDetailHead}>
                          <span className={s.detailCrumb}>
                            {activeTopic.subject} <ChevronRight size={11} /> {activeTopic.name}
                          </span>
                          <h3>{activeTopic.name}</h3>
                          <div className={s.lossStats}>
                            <b>
                              {activeTopic.loss}
                              <small>kayıp</small>
                            </b>
                            {activeTopic.wrong > 0 && (
                              <span>
                                <i className={s.wrongDot} />
                                {activeTopic.wrong} yanlış
                              </span>
                            )}
                            {activeTopic.empty > 0 && (
                              <span>
                                <i className={s.emptyDot} />
                                {activeTopic.empty} boş
                              </span>
                            )}
                            <span className={s.gainBadge}>
                              ≈ +{n(activeTopic.netPotentialPerExam, 2)} net/sınav
                            </span>
                          </div>
                          <div className={s.coachDiagnosis} data-kind={activeTopic.dominance.kind}>
                            <b>{activeTopic.dominance.shortLabel}:</b> {activeTopic.dominance.coachHint}
                          </div>
                        </div>

                        {actionError && (
                          <div className={s.error} role="alert">
                            <span>{actionError}</span>
                          </div>
                        )}

                        <div className={s.outcomeRows}>
                          {groupOutcomes(outcomes).map((group, index) => (
                            <div key={`${group.name}:${index}`} className={s.outcomeGroup}>
                              {group.items.length > 1 && <h4>{group.name}</h4>}
                              {group.items.map((item, i) => (
                                <LossOutcome
                                  key={`${item.outcome_id}:${item.sub_outcome_id}:${i}`}
                                  item={item}
                                  exams={selected}
                                  agendaItems={agendaItems}
                                  busyKey={actionBusyKey}
                                  onAction={handleStudyAction}
                                />
                              ))}
                            </div>
                          ))}
                        </div>
                        {!outcomes.length && <p className={s.shortNote}>Bu konu için kazanım detayı girilmemiş.</p>}

                        <details className={s.evidence}>
                          <summary>
                            Sınav özeti ve dönem karşılaştırması <ArrowUpRight size={12} />
                          </summary>
                          <p>{activeTopic.evidence.reason}</p>
                          <PeriodPanel points={activeTopic.series} exams={selected} label={activeTopic.name} />
                        </details>
                      </div>
                    )}
                  </div>
                )}

                <div className={s.boardFoot}>
                  <span>
                    <i className={s.wrongDot} />
                    Yanlış <i className={s.emptyDot} />
                    Boş
                  </span>
                  <button type="button" className={s.textButton} onClick={() => setDialog('coverage')}>
                    {needsMapping ? 'Eksik kazanım eşleşmesi' : 'Kazanım eşleşmesi'}
                    <ArrowUpRight size={12} />
                  </button>
                </div>
              </div>
            </section>
          )}
        </>
      )}

      {/* Side Dialogs (Compare / Coverage / Single Exam Context) */}
      {dialog && (
        <SidePanel
          title={
            dialog === 'compare'
              ? 'Sınav karşılaştırması'
              : dialog === 'coverage'
                ? 'Kazanım eşleşmesi'
                : selectedExam?.exam_name || 'Sınav'
          }
          onClose={() => setDialog(null)}
        >
          {dialog === 'compare' && (
            <ExamCompare
              exams={selected.length >= 2 ? selected : allTypeExams}
              initialLeftId={comparePreset.leftId}
              initialRightId={comparePreset.rightId}
              onOpen={onOpen}
              requestScores={onRequestScores}
            />
          )}
          {dialog === 'coverage' && (
            <CoveragePanel
              subjects={subjects}
              onSelect={name => {
                drill(name);
                setDialog(null);
              }}
            />
          )}
          {dialog === 'exam' && selectedExam && (
            <>
              <div className={s.examDialogStats}>
                <b>
                  {n(selectedExam.total_net)}
                  <small>net</small>
                </b>
                <span>{dateLabel(selectedExam.exam_date, true)}</span>
              </div>
              <button
                type="button"
                className={s.primaryButton}
                onClick={() => {
                  setCustomIds([selectedExam.exam_id]);
                  setWindowPick('custom');
                  setDialog(null);
                  onViewChange('growth');
                }}
              >
                Bu sınavın kayıplarını incele <ArrowRight size={15} />
              </button>
              <ExamContext
                key={`${selectedExam.exam_id}:${rankingYear}`}
                exam={selectedExam}
                rankingYear={rankingYear}
                onOpen={onOpen}
              />
            </>
          )}
        </SidePanel>
      )}
    </div>
  );
}

function Loading() {
  return (
    <div className={s.loading} role="status">
      <span />
      Analiz yükleniyor…
    </div>
  );
}

function LossOutcome({
  item,
  exams,
  agendaItems,
  busyKey,
  onAction,
}: {
  item: DevelopmentOutcome;
  exams: StudentExamResult[];
  agendaItems: StudyRecommendation[];
  busyKey: string | null;
  onAction: CoachActionHandler;
}) {
  const [open, setOpen] = useState(false);
  const evidence = evidenceSummary(
    item.series,
    exams.map(exam => exam.exam_id)
  );
  const state = ['new_drop', 'recurring', 'unmeasured'].includes(evidence.state)
    ? lossStateLabels[evidence.state]
    : null;
  const matchedAgenda = matchAgendaForOutcome(agendaItems, item);
  const history = exams.map(exam => {
    const point = item.series.find(row => row.exam_id === exam.exam_id);
    return {
      name: exam.exam_name,
      date: dateLabel(exam.exam_date),
      rate: point ? 100 - point.mastery_rate : null,
    };
  });

  return (
    <article className={s.outcome}>
      <button type="button" className={s.outcomeToggle} aria-expanded={open} onClick={() => setOpen(value => !value)}>
        <span>
          <b>{item.name}</b>
          <span className={s.outcomeTags}>
            {state && (
              <small className={s.outcomeState} data-state={evidence.state}>
                {state}
              </small>
            )}
            {matchedAgenda?.status === 'planned' && (
              <small className={s.outcomePlannedTag}>Planda</small>
            )}
          </span>
        </span>
        <strong>{item.wrong + item.empty}</strong>
        <ChevronRight size={14} className={open ? s.rotated : ''} />
      </button>
      {open && (
        <div className={s.outcomeExpanded}>
          <div className={s.inlineStats}>
            {item.wrong > 0 && (
              <span>
                <i className={s.wrongDot} /> {item.wrong} yanlış
              </span>
            )}
            {item.empty > 0 && (
              <span>
                <i className={s.emptyDot} /> {item.empty} boş
              </span>
            )}
            <span>Toplam {item.question_count} soru</span>
          </div>

          {matchedAgenda && matchedAgenda.questions.length > 0 && (
            <div className={s.questionChips}>
              <span>Son sınav soruları:</span>
              {matchedAgenda.questions.map(q => (
                <em key={`${q.item_id}:${q.n}`} data-result={q.result}>
                  #{q.n} {q.result === 'Y' ? 'Y' : 'B'}
                </em>
              ))}
            </div>
          )}

          <div className={s.outcomeChart}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={history} margin={{ top: 8, right: 4, left: -24, bottom: 0 }}>
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b' }} minTickGap={22} />
                <YAxis domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b' }} unit="%" />
                <Tooltip
                  contentStyle={{ border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 12 }}
                  labelFormatter={(_, payload) => payload?.[0]?.payload?.name || ''}
                  formatter={value => [`%${n(Number(value))}`, 'Hata oranı']}
                />
                <Area
                  type="monotone"
                  dataKey="rate"
                  stroke="#e11d48"
                  fill="#ffe4e6"
                  strokeWidth={2}
                  connectNulls={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {matchedAgenda && (
            <OutcomeCoachActionBar
              item={matchedAgenda}
              busy={busyKey === matchedAgenda.key}
              onAction={onAction}
            />
          )}

          <details className={s.evidence}>
            <summary>Sınav geçmişi</summary>
            <div className={s.heatScroll}>
              <table className={s.historyTable}>
                <thead>
                  <tr>
                    <th>Sınav</th>
                    <th>Yanlış</th>
                    <th>Boş</th>
                  </tr>
                </thead>
                <tbody>
                  {exams.map(exam => {
                    const point = item.series.find(row => row.exam_id === exam.exam_id);
                    return (
                      <tr key={exam.exam_id}>
                        <th>{exam.exam_name}</th>
                        <td>{point?.wrong ?? '—'}</td>
                        <td>{point?.empty ?? '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </details>
        </div>
      )}
    </article>
  );
}

function SidePanel({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef(typeof document === 'undefined' ? null : (document.activeElement as HTMLElement | null));
  useEffect(() => {
    const dialog = ref.current;
    const target = opener.current;
    dialog?.showModal();
    return () => {
      if (dialog?.open) dialog.close();
      queueMicrotask(() => {
        if (target?.isConnected) target.focus({ preventScroll: true });
      });
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={s.dialog}
      aria-label={title}
      onCancel={onClose}
      onClick={event => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className={s.dialogInner}>
        <header>
          <h2>{title}</h2>
          <button type="button" className={s.iconButton} aria-label="Paneli kapat" onClick={onClose} autoFocus>
            <X size={18} />
          </button>
        </header>
        {children}
      </div>
    </dialog>
  );
}
