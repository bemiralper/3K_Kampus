'use client';

import { useEffect, useRef, useState } from 'react';
import { FileBarChart2, RefreshCw } from 'lucide-react';
import { useKurum } from '@/lib/contexts/KurumContext';
import ExamAnalyticsWorkspace, { type ExamWorkspaceView } from './ExamAnalyticsWorkspace';
import ParentExamReportStudio from './ParentExamReportStudio';
import s from './ExamAnalyticsWorkspace.module.css';
import StudentDetailModal from '@/components/olcme/analysis/StudentDetailModal';
import { analysisApi, puanAyarlariApi, studentExamApi } from '@/components/olcme/api';
import type { StudentAnalysis, StudentExamResponse, StudentExamResult } from '@/components/olcme/types';

const VIEWS: { id: ExamWorkspaceView; label: string }[] = [
  { id: 'overview', label: 'Genel Bakış' },
  { id: 'mine', label: 'Sınavlarım' },
  { id: 'growth', label: 'Derin Analiz' },
  { id: 'plan', label: 'Çalışma Önerileri' },
];

function toKarneStudent(
  exam: StudentExamResult,
  studentId: number,
  studentName: string,
  answerId: number
): StudentAnalysis {
  return {
    answer_id: answerId,
    student_id: studentId,
    student_name: studentName,
    raw_student_id: '',
    sinif: '',
    toplam_net: exam.total_net,
    total_correct: exam.total_correct,
    total_wrong: exam.total_wrong,
    total_empty: exam.total_empty,
    puan: exam.puan ?? 0,
    ham_puan: exam.ham_puan ?? 0,
    puan_turleri: exam.puan_turleri ?? null,
    tahmini_siralama: exam.tahmini_siralama,
    yuzdelik_dilim: exam.yuzdelik_dilim,
    kurum_ici_yuzdelik: 0,
    kurum_ici_sira: exam.kurum_ici_sira,
    toplam_ogrenci: exam.toplam_ogrenci,
    section_details: [],
    strong_areas: [],
    weak_areas: [],
  };
}

interface SinavlarTabProps {
  studentId: number;
  refreshKey?: number;
}

export default function SinavlarTab({ studentId, refreshKey = 0 }: SinavlarTabProps) {
  const { activeKurum, activeSube, activeEgitimYili } = useKurum();
  const scopeKey = `${studentId}:${activeKurum?.id}:${activeSube?.id}:${activeEgitimYili?.id}`;
  const [data, setData] = useState<StudentExamResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [view, setView] = useState<ExamWorkspaceView>('overview');
  const [rankingYear, setRankingYear] = useState<number>();
  const [rankingYears, setRankingYears] = useState<number[]>([]);
  const [reload, setReload] = useState(0);
  const [updated, setUpdated] = useState('');
  const [loadedScope, setLoadedScope] = useState('');
  const [loadedYear, setLoadedYear] = useState<number>();
  const [needScores, setNeedScores] = useState(false);
  const wantScores = view === 'mine' || needScores;
  const loadedRequest = useRef({ key: '', full: false });
  const [scoresLoading, setScoresLoading] = useState(false);
  const [pdfBusy, setPdfBusy] = useState<number | null>(null);
  const [karne, setKarne] = useState<{ exam: StudentExamResult; student: StudentAnalysis } | null>(null);
  const [reportStudioOpen, setReportStudioOpen] = useState(false);

  useEffect(() => {
    let live = true;
    setRankingYear(undefined);
    setData(null);
    setKarne(null);
    setNeedScores(false);
    setLoading(true);
    puanAyarlariApi
      .get()
      .then(p => {
        if (live) {
          setRankingYears(p.managed_years);
          setRankingYear(p.default_puan_yili);
        }
      })
      .catch(() => {
        if (live) {
          setRankingYears([2024, 2025, 2026]);
          setRankingYear(2026);
        }
      });
    try {
      const saved = sessionStorage.getItem(`exam-view:${scopeKey}`);
      if (VIEWS.some(v => v.id === saved)) setView(saved as ExamWorkspaceView);
    } catch {
      /* storage unavailable */
    }
    return () => {
      live = false;
    };
  }, [scopeKey]);

  useEffect(() => {
    let live = true;
    if (!rankingYear) return;
    const requestKey = `${scopeKey}:${rankingYear}:${reload}:${refreshKey}`;
    if (loadedRequest.current.key === requestKey && loadedRequest.current.full && !wantScores) return;
    const controller = new AbortController();
    const enriching = loadedRequest.current.key === requestKey;
    if (!enriching) {
      setLoading(true);
      if (!loadedRequest.current.key.startsWith(`${scopeKey}:${rankingYear}:`)) setData(null);
      setKarne(null);
    }
    setScoresLoading(wantScores);
    setError('');
    studentExamApi
      .results(studentId, undefined, rankingYear, controller.signal, !wantScores)
      .then(p => {
        if (live) {
          loadedRequest.current = { key: requestKey, full: wantScores };
          setData(p);
          setLoadedScope(scopeKey);
          setLoadedYear(rankingYear);
          setUpdated(new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }));
        }
      })
      .catch(e => {
        if (live) setError(e instanceof Error ? e.message : 'Sınav verileri yüklenemedi.');
      })
      .finally(() => {
        if (live) {
          setLoading(false);
          setScoresLoading(false);
        }
      });
    return () => {
      live = false;
      controller.abort();
    };
  }, [scopeKey, studentId, rankingYear, reload, refreshKey, wantScores]);

  const openKarne = (exam: StudentExamResult) => {
    if (!exam.answer_id || !data) return;
    setKarne({ exam, student: toKarneStudent(exam, studentId, data.student_name, exam.answer_id) });
  };

  const download = async (exam: StudentExamResult) => {
    if (!exam.answer_id) return;
    setPdfBusy(exam.exam_id);
    try {
      await analysisApi.downloadKarnePdf(exam.exam_id, exam.answer_id, rankingYear);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'PDF indirilemedi.');
    } finally {
      setPdfBusy(null);
    }
  };

  const selectView = (next: ExamWorkspaceView) => {
    setView(next);
    try {
      sessionStorage.setItem(`exam-view:${scopeKey}`, next);
    } catch {
      /* storage unavailable */
    }
  };

  const heading =
    view === 'mine'
      ? 'Sınavlarım'
      : view === 'growth'
        ? 'Derin analiz'
        : view === 'plan'
          ? 'Çalışma önerileri'
          : 'Sınav analizi';

  return (
    <div className={`s360x ${s.shell}`}>
      <header className={s.pageHeader}>
        <div>
          <span className={s.pageEyebrow}>SINAV ANALİZ MERKEZİ</span>
          <h2>{heading}</h2>
          <p>
            {activeEgitimYili
              ? `${activeEgitimYili.baslangic_yil}–${activeEgitimYili.bitis_yil} eğitim yılı`
              : 'Seçili eğitim yılı'}{' '}
            · {updated ? `${updated} güncellendi` : 'Sonuç ve kazanım takibi'}
          </p>
        </div>
        <div className={s.headerActions}>
          {(view === 'mine' || needScores) && (
            <label className={s.yearPick}>
              <span>Puan referansı</span>
              <select
                aria-label="Puan referans yılı"
                value={rankingYear ?? ''}
                onChange={e => setRankingYear(Number(e.target.value))}
              >
                {rankingYears.map(y => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button
            type="button"
            className={s.parentReportBtn}
            onClick={() => setReportStudioOpen(true)}
            disabled={!data?.exams.length}
          >
            <FileBarChart2 size={14} />
            <span>Veli Raporu</span>
          </button>
          <button
            type="button"
            className={s.refreshBtn}
            aria-label="Sınav sonuçlarını yenile"
            onClick={() => setReload(n => n + 1)}
            disabled={loading}
          >
            <RefreshCw size={14} className={loading ? s.spin : undefined} />
            <span>Yenile</span>
          </button>
        </div>
      </header>

      <nav className={s.viewTabs} aria-label="Sınav görünümleri">
        {VIEWS.map(v => (
          <button type="button" key={v.id} aria-pressed={view === v.id} onClick={() => selectView(v.id)}>
            {v.label}
          </button>
        ))}
      </nav>

      {loading && data && (
        <p className={s.statusBanner} role="status">
          Güncel sınav sonuçları alınıyor; seçili filtreler korunuyor.
        </p>
      )}
      {scoresLoading && !loading && (
        <p className={s.statusBanner} role="status">
          Puan ve sıralamalar yükleniyor…
        </p>
      )}
      {error && (
        <div role="alert" className={s.error}>
          <span>{error}</span>
          <button type="button" onClick={() => setReload(n => n + 1)}>
            Tekrar dene
          </button>
        </div>
      )}

      {(loading && !data) || (!!data && (loadedScope !== scopeKey || loadedYear !== rankingYear)) ? (
        <div className={s.loading} role="status">
          <span />
          Sınavlar ve analiz kapsamı hazırlanıyor…
        </div>
      ) : data?.exams.length ? (
        <ExamAnalyticsWorkspace
          key={scopeKey}
          scopeKey={scopeKey}
          rankingYear={rankingYear}
          scoresLoading={scoresLoading}
          onRequestScores={() => setNeedScores(true)}
          studentId={studentId}
          exams={data.exams}
          view={view}
          refreshKey={reload + refreshKey}
          pdfBusy={pdfBusy}
          onViewChange={selectView}
          onOpen={openKarne}
          onDownload={download}
        />
      ) : (
        !error && <div className={s.empty}>Seçili eğitim yılında tamamlanmış sınav sonucu bulunmuyor.</div>
      )}

      {karne && loadedScope === scopeKey && loadedYear === rankingYear && (
        <StudentDetailModal
          student={karne.student}
          examId={karne.exam.exam_id}
          examType={karne.exam.exam_type}
          rankingYear={rankingYear}
          onClose={() => setKarne(null)}
        />
      )}

      {reportStudioOpen && (
        <ParentExamReportStudio
          studentId={studentId}
          studentName={data?.student_name}
          onClose={() => setReportStudioOpen(false)}
        />
      )}
    </div>
  );
}
