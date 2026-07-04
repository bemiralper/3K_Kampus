'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { analysisApi } from '../../../../components/olcme/api';
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
  { key: 'ozet',       label: 'Genel Özet',      icon: '📊' },
  { key: 'dersler',    label: 'Ders Analizi',     icon: '📚' },
  { key: 'ogrenciler', label: 'Öğrenci Detay',    icon: '👤' },
  { key: 'siniflar',   label: 'Sınıf/Şube',      icon: '🏫' },
  { key: 'siralama',   label: 'Sıralama',         icon: '🏆' },
  { key: 'sorular',    label: 'Madde Analizi',    icon: '🔬' },
  { key: 'strateji',   label: 'Strateji',         icon: '💡' },
  { key: 'karsilastirma', label: 'Karşılaştırma', icon: '📈' },
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
  const [rankingMeta, setRankingMeta] = useState<{ top_10_count: number; bottom_10_count: number; avg_score: number; referans_yil: number }>({ top_10_count: 0, bottom_10_count: 0, avg_score: 0, referans_yil: 2025 });
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

  // Sıralama yılı
  const [rankingYear, setRankingYear] = useState<number>(2025);

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

  /* ── LOADERS ─────────────────────────────────────────────────────────────── */

  const loadSummary = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await analysisApi.summary(exam.id, sessionFilter);
      setSummary(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [exam.id, sessionFilter]);

  const loadSections = useCallback(async () => {
    setLoading(true);
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
    try {
      const data = await analysisApi.rankings(exam.id, sessionFilter, rankingYear);
      setRankings(data.rankings);
      setRankingMeta({ top_10_count: data.top_10_count, bottom_10_count: data.bottom_10_count, avg_score: data.avg_score, referans_yil: data.referans_yil });
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

  useEffect(() => {
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
          >
            <span>{p.icon}</span> {p.label}
          </button>
        ))}
      </div>

      {/* Oturum filtresi */}
      {summary && summary.sessions && summary.sessions.length > 1 && (
        <div className={s.analysisSessionFilter}>
          <label>Oturum:</label>
          <select
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

      {error && <div className={s.analysisError}>⚠️ {error}</div>}
      {loading && <div className={s.analysisLoading}>Yükleniyor…</div>}

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
          examName={exam.name}
          examType={exam.exam_type}
          sectionAvgs={rankingSectionAvgs}
          avgNet={rankingAvgNet}
          puanTurleriAvgs={rankingPuanTurleriAvgs}
          sinifAvgs={rankingSinifAvgs}
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
          onClose={() => setSelectedStudent(null)}
        />,
        portalRoot,
      )}
    </div>
  );
}

