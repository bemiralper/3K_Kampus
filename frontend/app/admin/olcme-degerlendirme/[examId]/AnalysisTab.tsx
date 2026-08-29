'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { analysisApi, puanAyarlariApi } from '../../../../components/olcme/api';
import type {
  ExamDetail,
  AnalysisSummary,
  AnalysisSectionItem,
  StudentAnalysis,
  ClassAnalysis,
  RankingItem,
  RankingSectionInfo,
  QuestionAnalysis,
  StrategyItem,
  ComparisonItem,
} from '../../../../components/olcme/types';

/* ── Panel Bileşenleri ─────────────────────────────────────────────────── */
import SummaryPanel from '../../../../components/olcme/analysis/SummaryPanel';
import SectionsPanel from '../../../../components/olcme/analysis/SectionsPanel';
import StudentsPanel from '../../../../components/olcme/analysis/StudentsPanel';
import StudentDetailModal from '../../../../components/olcme/analysis/StudentDetailModal';
import ClassesPanel from '../../../../components/olcme/analysis/ClassesPanel';
import RankingsPanel from '../../../../components/olcme/analysis/RankingsPanel';
import QuestionsPanel from '../../../../components/olcme/analysis/QuestionsPanel';
import StrategyPanel from '../../../../components/olcme/analysis/StrategyPanel';
import ComparisonPanel from '../../../../components/olcme/analysis/ComparisonPanel';
import Icon from '../../../../components/olcme/ui/Icon';

import s from '../olcme.module.css';

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  PROPS                                                                     */
/* ═══════════════════════════════════════════════════════════════════════════ */

interface Props {
  exam: ExamDetail;
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  SUB-PANEL KEYS                                                            */
/* ═══════════════════════════════════════════════════════════════════════════ */

const PANELS = [
  { key: 'ozet',          label: 'Genel Özet',    icon: 'chart'     },
  { key: 'dersler',       label: 'Ders Analizi',  icon: 'layers'    },
  { key: 'ogrenciler',    label: 'Öğrenci Detay', icon: 'users'     },
  { key: 'siniflar',      label: 'Sınıf/Şube',    icon: 'building'  },
  { key: 'siralama',      label: 'Sıralama',      icon: 'outcome'   },
  { key: 'sorular',       label: 'Madde Analizi', icon: 'search'    },
  { key: 'strateji',      label: 'Strateji',      icon: 'info'      },
  { key: 'karsilastirma', label: 'Karşılaştırma', icon: 'chart'     },
] as const;
type PanelKey = typeof PANELS[number]['key'];

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  MAIN COMPONENT                                                            */
/* ═══════════════════════════════════════════════════════════════════════════ */

export default function AnalysisTab({ exam }: Props) {
  const [activePanel, setActivePanel] = useState<PanelKey>('ozet');
  const [sessionFilter, setSessionFilter] = useState<number | undefined>(undefined);

  // Data states
  const [summary, setSummary] = useState<AnalysisSummary | null>(null);
  const [sections, setSections] = useState<AnalysisSectionItem[]>([]);
  const [students, setStudents] = useState<StudentAnalysis[]>([]);
  const [classes, setClasses] = useState<ClassAnalysis[]>([]);
  const [rankings, setRankings] = useState<RankingItem[]>([]);
  const [rankingMeta, setRankingMeta] = useState<{
    top_10_count: number; bottom_10_count: number; avg_score: number;
    referans_yil: number; kurum_ad?: string; sube_ad?: string;
  }>({ top_10_count: 0, bottom_10_count: 0, avg_score: 0, referans_yil: 2025 });
  const [rankingSections, setRankingSections] = useState<RankingSectionInfo[]>([]);
  const [rankingSectionAvgs, setRankingSectionAvgs] = useState<Record<string, { avg_correct: number; avg_wrong: number; avg_net: number }>>({});
  const [rankingAvgNet, setRankingAvgNet] = useState<number>(0);
  const [rankingPuanTurleriAvgs, setRankingPuanTurleriAvgs] = useState<Record<string, number>>({});
  const [rankingSinifAvgs, setRankingSinifAvgs] = useState<Record<string, any>>({});
  const [questions, setQuestions] = useState<QuestionAnalysis[]>([]);
  const [strategies, setStrategies] = useState<StrategyItem[]>([]);
  const [comparisons, setComparisons] = useState<ComparisonItem[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Sıralama yılı — sınav yılı veya kurum varsayılanı
  const [rankingYear, setRankingYear] = useState<number>(exam.puan_yili ?? 2025);
  const [managedYears, setManagedYears] = useState<number[]>([2024, 2025, 2026]);
  const [kurumDefaultYear, setKurumDefaultYear] = useState<number>(2025);

  // Student detail modal
  const [selectedStudent, setSelectedStudent] = useState<StudentAnalysis | null>(null);
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);

  // Question filter
  const [questionSectionFilter, setQuestionSectionFilter] = useState<number | undefined>(undefined);

  // Student search
  const [studentSearch, setStudentSearch] = useState('');

  /* ── PORTAL ROOT (TypeError fix) ──────────────────────────────────────── */
  useEffect(() => {
    setPortalRoot(document.body);
  }, []);

  useEffect(() => {
    puanAyarlariApi.get().then(d => {
      setManagedYears(d.managed_years);
      setKurumDefaultYear(d.default_puan_yili);
      if (!exam.puan_yili) {
        setRankingYear(d.default_puan_yili);
      }
    }).catch(() => {});
  }, [exam.puan_yili]);

  /* ── LOADERS ─────────────────────────────────────────────────────────────── */

  const loadSummary = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await analysisApi.summary(exam.id, sessionFilter, rankingYear);
      setSummary(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [exam.id, sessionFilter, rankingYear]);

  const loadSections = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await analysisApi.sections(exam.id, sessionFilter);
      setSections(data.sections);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [exam.id, sessionFilter]);

  const loadStudents = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await analysisApi.students(exam.id, sessionFilter, undefined, rankingYear);
      setStudents(data.students);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [exam.id, sessionFilter, rankingYear]);

  const loadClasses = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await analysisApi.classes(exam.id, sessionFilter);
      setClasses(data.classes);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [exam.id, sessionFilter]);

  const loadRankings = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await analysisApi.rankings(exam.id, sessionFilter, rankingYear);
      setRankings(data.rankings);
      setRankingMeta({
        top_10_count: data.top_10_count,
        bottom_10_count: data.bottom_10_count,
        avg_score: data.avg_score,
        referans_yil: data.referans_yil,
        kurum_ad: data.kurum_ad,
        sube_ad: data.sube_ad,
      });
      setRankingSections(data.sections || []);
      setRankingSectionAvgs(data.section_avgs || {});
      setRankingAvgNet(data.avg_net || 0);
      setRankingPuanTurleriAvgs(data.puan_turleri_avgs || {});
      setRankingSinifAvgs(data.sinif_avgs || {});
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [exam.id, sessionFilter, rankingYear]);

  const loadQuestions = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await analysisApi.questions(exam.id, sessionFilter, questionSectionFilter);
      setQuestions(data.questions);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [exam.id, sessionFilter, questionSectionFilter]);

  const loadStrategies = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await analysisApi.strategy(exam.id, sessionFilter);
      setStrategies(data.strategies);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [exam.id, sessionFilter]);

  const loadComparisons = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await analysisApi.comparison(exam.id);
      setComparisons(data.comparisons);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [exam.id]);

  /* ── PANEL DEĞİŞİMİNDE VERİ YÜKLE ────────────────────────────────────── */

  /** Aktif panelin yükleyicisi — hem sekme değişiminde hem "yeniden dene"de. */
  const reloadActive = useCallback(() => {
    switch (activePanel) {
      case 'ozet': loadSummary(); break;
      case 'dersler': loadSections(); break;
      case 'ogrenciler': loadStudents(); break;
      case 'siniflar': loadClasses(); break;
      case 'siralama': loadRankings(); break;
      case 'sorular': loadQuestions(); break;
      case 'strateji': loadStrategies(); break;
      case 'karsilastirma': loadComparisons(); break;
    }
  }, [activePanel, loadSummary, loadSections, loadStudents, loadClasses, loadRankings, loadQuestions, loadStrategies, loadComparisons]);

  useEffect(() => { reloadActive(); }, [reloadActive]);

  /* ── Filtered students ────────────────────────────────────────────────── */
  const filteredStudents = useMemo(() => {
    if (!studentSearch.trim()) return students;
    const q = studentSearch.toLowerCase();
    return students.filter(st =>
      st.student_name.toLowerCase().includes(q) ||
      st.raw_student_id.toLowerCase().includes(q) ||
      st.sinif.toLowerCase().includes(q)
    );
  }, [students, studentSearch]);

  /* ═══════════════════════════════════════════════════════════════════════════ */
  /*  RENDER                                                                    */
  /* ═══════════════════════════════════════════════════════════════════════════ */

  return (
    <div>
      {/* ── Panel Navigasyon ─────────────────────────────────────────────── */}
      <div className={s.analysisPanelNav}>
        {PANELS.map(p => (
          <button
            key={p.key}
            className={`${s.analysisPanelBtn} ${activePanel === p.key ? s.analysisPanelBtnActive : ''}`}
            onClick={() => setActivePanel(p.key)}
            aria-pressed={activePanel === p.key}
          >
            <Icon name={p.icon} size={15} />
            {p.label}
          </button>
        ))}
      </div>

      {/* Oturum filtresi — yalnızca birden çok oturum varsa anlamlı */}
      {summary && summary.sessions && summary.sessions.length > 1 && (
        <div className={s.analysisSessionFilter}>
          <label htmlFor="analiz-oturum">
            <Icon name="filter" size={13} />
            Oturum
          </label>
          <select
            id="analiz-oturum"
            value={sessionFilter || ''}
            onChange={e => setSessionFilter(e.target.value ? Number(e.target.value) : undefined)}
          >
            <option value="">Tüm Oturumlar</option>
            {summary.sessions.map(sess => (
              <option key={sess.id} value={sess.id}>{sess.original_filename} ({sess.total_rows} satır)</option>
            ))}
          </select>
        </div>
      )}

      {error && (
        <div className={s.analysisError}>
          <Icon name="error" size={17} />
          <span style={{ flex: 1 }}>{error}</span>
          <button
            type="button"
            onClick={() => reloadActive()}
            className={s.analysisRetryBtn}
          >
            <Icon name="refresh" size={13} />
            Yeniden dene
          </button>
        </div>
      )}

      {loading && (
        <div className={s.analysisLoading}>
          <Icon name="refresh" size={16} className={s.olcmeSpinning} />
          Analiz hesaplanıyor…
        </div>
      )}

      {/* ── Paneller ─────────────────────────────────────────────────────── */}
      {!loading && activePanel === 'ozet' && summary && <SummaryPanel data={summary} examType={exam.exam_type} />}
      {!loading && activePanel === 'dersler' && <SectionsPanel sections={sections} />}
      {!loading && activePanel === 'ogrenciler' && (
        <StudentsPanel
          students={filteredStudents}
          search={studentSearch}
          onSearch={setStudentSearch}
          onSelect={setSelectedStudent}
          examName={exam.name}
          examType={exam.exam_type}
          examId={exam.id}
          rankingYear={rankingYear}
        />
      )}
      {!loading && activePanel === 'siniflar' && <ClassesPanel classes={classes} />}
      {!loading && activePanel === 'siralama' && (
        <RankingsPanel
          rankings={rankings}
          meta={rankingMeta}
          rankingYear={rankingYear}
          onRankingYearChange={(y: number) => { setRankingYear(y); }}
          sections={rankingSections}
          examId={exam.id}
          sessionId={sessionFilter}
          examName={exam.name}
          examType={exam.exam_type}
          sectionAvgs={rankingSectionAvgs}
          avgNet={rankingAvgNet}
          puanTurleriAvgs={rankingPuanTurleriAvgs}
          sinifAvgs={rankingSinifAvgs}
          years={managedYears}
          defaultYear={exam.puan_yili ?? kurumDefaultYear}
        />
      )}
      {!loading && activePanel === 'sorular' && (
        <QuestionsPanel
          questions={questions}
          sections={exam.sections}
          sectionFilter={questionSectionFilter}
          onSectionFilter={setQuestionSectionFilter}
        />
      )}
      {!loading && activePanel === 'strateji' && <StrategyPanel strategies={strategies} />}
      {!loading && activePanel === 'karsilastirma' && <ComparisonPanel comparisons={comparisons} />}

      {/* ── Öğrenci Detay Modal (Portal — TypeError fix) ──────────────── */}
      {selectedStudent && portalRoot && createPortal(
        <StudentDetailModal
          student={selectedStudent}
          examId={exam.id}
          examType={exam.exam_type}
          rankingYear={rankingYear}
          onClose={() => setSelectedStudent(null)}
        />,
        portalRoot,
      )}
    </div>
  );
}

