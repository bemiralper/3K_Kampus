'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { analysisApi, puanAyarlariApi } from '../../../../components/olcme/api';
import type { ExamDetail, StudentAnalysis } from '../../../../components/olcme/types';
import StudentDetailModal from '../../../../components/olcme/analysis/StudentDetailModal';
import AnalysisOverview from './AnalysisOverview';
import AnalysisStudents from './AnalysisStudents';
import AnalysisClasses from './AnalysisClasses';
import AnalysisQuestions from './AnalysisQuestions';
import { RANKED_EXAM_TYPES } from './analysis-utils';
import a from './analysis.module.css';

type View = 'ozet' | 'ogrenciler' | 'siniflar' | 'sorular';

const VIEWS: { key: View; label: string }[] = [
  { key: 'ozet', label: 'Özet' },
  { key: 'ogrenciler', label: 'Öğrenciler' },
  { key: 'siniflar', label: 'Sınıflar' },
  { key: 'sorular', label: 'Sorular' },
];

export interface Resource<T> {
  data: T | null;
  loading: boolean;
  error: string;
  reload: () => void;
}

function useResource<T>(enabled: boolean, key: string, fetcher: () => Promise<T>): Resource<T> {
  const [state, setState] = useState<{ data: T | null; loading: boolean; error: string }>({ data: null, loading: false, error: '' });
  const [nonce, setNonce] = useState(0);
  const loadedKey = useRef<string | null>(null);
  const reqId = useRef(0);
  const fetchRef = useRef(fetcher);
  fetchRef.current = fetcher;

  useEffect(() => {
    const k = `${key}#${nonce}`;
    if (!enabled || loadedKey.current === k) return;
    loadedKey.current = k;
    const id = ++reqId.current;
    setState(s => ({ ...s, loading: true, error: '' }));
    fetchRef.current()
      .then(data => {
        if (id === reqId.current) setState({ data, loading: false, error: '' });
      })
      .catch((err: unknown) => {
        if (id !== reqId.current) return;
        loadedKey.current = null;
        setState(s => ({ ...s, loading: false, error: err instanceof Error ? err.message : 'Veri yüklenemedi.' }));
      });
  }, [enabled, key, nonce]);

  const reload = useCallback(() => setNonce(n => n + 1), []);
  return { ...state, reload };
}

export default function AnalysisTab({ exam }: { exam: ExamDetail }) {
  const [view, setView] = useState<View>('ozet');
  const [sessionId, setSessionId] = useState<number | undefined>(undefined);
  const [rankingYear, setRankingYear] = useState<number>(exam.puan_yili ?? new Date().getFullYear());
  const [years, setYears] = useState<number[]>([]);
  const [defaultYear, setDefaultYear] = useState<number | null>(exam.puan_yili ?? null);
  const [classFilter, setClassFilter] = useState('');
  const [selected, setSelected] = useState<StudentAnalysis | null>(null);
  const showYear = RANKED_EXAM_TYPES.includes(exam.exam_type);

  useEffect(() => {
    puanAyarlariApi.get().then(d => {
      setYears(d.managed_years);
      if (!exam.puan_yili) {
        setRankingYear(d.default_puan_yili);
        setDefaultYear(d.default_puan_yili);
      }
    }).catch(() => {});
  }, [exam.puan_yili]);

  const scope = `${exam.id}|${sessionId ?? ''}`;
  const yearScope = `${scope}|${rankingYear}`;

  const summary = useResource(true, yearScope, () => analysisApi.summary(exam.id, sessionId, rankingYear));
  const sections = useResource(view === 'ozet', scope, () => analysisApi.sections(exam.id, sessionId).then(r => r.sections));
  const comparison = useResource(view === 'ozet', String(exam.id), () => analysisApi.comparison(exam.id).then(r => r.comparisons));
  const students = useResource(
    view === 'ogrenciler' || view === 'siniflar',
    yearScope,
    () => analysisApi.students(exam.id, sessionId, undefined, rankingYear).then(r => r.students),
  );
  const questions = useResource(view === 'sorular', scope, () => analysisApi.questions(exam.id, sessionId).then(r => r.questions));

  const sessions = summary.data?.sessions ?? [];
  const yearOptions = years.length ? years : [rankingYear];

  const openClass = (name: string) => {
    setClassFilter(name);
    setView('ogrenciler');
  };

  if (summary.data && summary.data.katilim === 0 && !sessionId) {
    return (
      <div className={a.page}>
        <div className={a.empty}>
          <b>Henüz analiz edilecek sonuç yok.</b>
          <span>&quot;Sonuç Yükle&quot; sekmesinden optik okuyucu dosyasını yükleyip okuyun.</span>
        </div>
      </div>
    );
  }

  return (
    <div className={a.page}>
      <div className={a.topBar}>
        <div className={a.seg} role="tablist" aria-label="Analiz görünümü">
          {VIEWS.map(v => (
            <button
              key={v.key}
              type="button"
              role="tab"
              aria-selected={view === v.key}
              className={view === v.key ? a.segOn : a.segBtn}
              onClick={() => setView(v.key)}
            >
              {v.label}
            </button>
          ))}
        </div>
        <div className={a.scope}>
          {sessions.length > 1 && (
            <label className={a.inline}>
              Yükleme
              <select value={sessionId ?? ''} onChange={e => setSessionId(e.target.value ? Number(e.target.value) : undefined)}>
                <option value="">Tümü</option>
                {sessions.map(ses => (
                  <option key={ses.id} value={ses.id}>{ses.original_filename} · {ses.total_rows} kayıt</option>
                ))}
              </select>
            </label>
          )}
          {showYear && (
            <label className={a.inline} title="Tahmini Türkiye sırası ve yüzdelik bu yılın ÖSYM verisine göre hesaplanır.">
              Puan yılı
              <select value={rankingYear} onChange={e => setRankingYear(Number(e.target.value))}>
                {yearOptions.map(y => (
                  <option key={y} value={y}>{y}{y === defaultYear ? ' (varsayılan)' : ''}</option>
                ))}
              </select>
            </label>
          )}
        </div>
      </div>

      {view === 'ozet' && (
        <AnalysisOverview
          exam={exam}
          summary={summary}
          sections={sections}
          comparison={comparison}
        />
      )}
      {view === 'ogrenciler' && (
        <AnalysisStudents
          exam={exam}
          students={students}
          sessionId={sessionId}
          rankingYear={rankingYear}
          classFilter={classFilter}
          onClassFilter={setClassFilter}
          onSelect={setSelected}
        />
      )}
      {view === 'siniflar' && (
        <AnalysisClasses
          exam={exam}
          students={students}
          successThreshold={summary.data?.basari_esik ?? null}
          onOpenClass={openClass}
        />
      )}
      {view === 'sorular' && <AnalysisQuestions exam={exam} questions={questions} />}

      {selected && typeof document !== 'undefined' && createPortal(
        <StudentDetailModal
          student={selected}
          examId={exam.id}
          examType={exam.exam_type}
          rankingYear={rankingYear}
          onClose={() => setSelected(null)}
        />,
        document.body,
      )}
    </div>
  );
}
