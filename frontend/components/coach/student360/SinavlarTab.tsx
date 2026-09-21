'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import StudentDetailModal from '@/components/olcme/analysis/StudentDetailModal';
import { analysisApi, puanAyarlariApi, studentExamApi } from '@/components/olcme/api';
import { EXAM_TYPES } from '@/components/olcme/types';
import type {
  DevelopmentPriority,
  DevelopmentResponse,
  DevelopmentSubject,
  DevelopmentTypeGroup,
  DevelopmentWindow,
  StudentAnalysis,
  StudentExamResponse,
  StudentExamResult,
  StudentExamSectionDetail,
} from '@/components/olcme/types';

type ExamView = 'overview' | 'mine' | 'growth';

type RangeKey = '5' | '10' | 'all';
type SortKey = 'date-desc' | 'date-asc' | 'net-desc' | 'net-asc';

const VIEWS: { id: ExamView; label: string }[] = [
  { id: 'overview', label: 'Genel Bakış' },
  { id: 'mine', label: 'Sınavlarım' },
  { id: 'growth', label: 'Gelişim' },
];

const PRIORITY_LIMIT = 8;
const PRIORITY_MASTERED = 80;

const DERS_ORDER = [
  'turkce', 'edebiyat', 'tarih', 'tarih1', 'cografya', 'cografya1', 'felsefe', 'dkab', 'felsefesecmeli',
  'sosyal', 'temelmatematik', 'matematik', 'geometri',
  'fizik', 'kimya', 'biyoloji', 'fen',
  'tarih2', 'cografya2', 'felsefegrubu', 'inkilap', 'ingilizce',
];

function fmtDate(d?: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function fmt(n: number, d = 1) {
  return Number(n).toFixed(d);
}

function fmtPuan(n: number | null | undefined) {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return Number(n).toLocaleString('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function typeShort(t: string, display?: string) {
  if (t === 'YKS_TYT') return 'TYT';
  if (t === 'YKS_AYT') return 'AYT';
  if (t === 'DENEME') return 'Deneme';
  if (t === 'LGS') return 'LGS';
  if (t === 'LGS_7') return 'LGS 7';
  return display || t;
}

function examGroup(type: string): DevelopmentTypeGroup {
  if (type === 'YKS_TYT') return 'TYT';
  if (type === 'YKS_AYT') return 'AYT';
  if (type === 'LGS' || type === 'LGS_7') return 'LGS';
  return 'manuel';
}

const AYT_ALAN_KEYS: Record<string, Set<string>> = {
  SAYISAL: new Set(['matematik', 'geometri', 'fizik', 'kimya', 'biyoloji']),
  ESIT_AGIRLIK: new Set(['edebiyat', 'tarih1', 'cografya1', 'matematik', 'geometri']),
  SOZEL: new Set([
    'edebiyat', 'tarih1', 'cografya1', 'tarih2', 'cografya2', 'felsefegrubu', 'dkab', 'felsefesecmeli',
  ]),
};

function foldTr(value: string) {
  return value
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c');
}

function sectionKey(name: string) {
  const compact = foldTr(name).replace(/[\s_\-()]/g, '');
  return (
    {
      turkce: 'turkce',
      turkdiliveedebiyati: 'edebiyat',
      tde: 'edebiyat',
      edebiyat: 'edebiyat',
      tarih: 'tarih',
      tarih1: 'tarih1',
      cografya: 'cografya',
      cografya1: 'cografya1',
      tarih2: 'tarih2',
      cografya2: 'cografya2',
      felsefe: 'felsefe',
      felsefegrubu: 'felsefegrubu',
      dinkulturuveahlakbilgisi: 'dkab',
      dinkulturu: 'dkab',
      dkab: 'dkab',
      sosyalbilimler: 'sosyal',
      temelmatematik: 'temelmatematik',
      matematik: 'matematik',
      geometri: 'geometri',
      fenbilimleri: 'fen',
      fizik: 'fizik',
      kimya: 'kimya',
      biyoloji: 'biyoloji',
      felsefesecmeli: 'felsefesecmeli',
      inkilap: 'inkilap',
      tcinkilap: 'inkilap',
      inkilaptarihiveataturkculuk: 'inkilap',
      ingilizce: 'ingilizce',
    }[compact] || compact
  );
}

function normalizeAlan(alan?: string | null) {
  if (!alan) return null;
  const compact = foldTr(alan).replace(/[\s_\-]/g, '');
  if (['sayisal', 'say', 'sys'].includes(compact)) return 'SAYISAL';
  if (['esitagirlik', 'ea'].includes(compact)) return 'ESIT_AGIRLIK';
  if (['sozel', 'soz'].includes(compact)) return 'SOZEL';
  return ['SAYISAL', 'ESIT_AGIRLIK', 'SOZEL'].includes(alan) ? alan : null;
}

function aytSectionAllowed(name: string, alan?: string | null) {
  const allowed = AYT_ALAN_KEYS[normalizeAlan(alan) || ''];
  if (!allowed) return true;
  return allowed.has(sectionKey(name));
}

function isLiseStudent(alan?: string | null, exams: StudentExamResult[] = []) {
  if (normalizeAlan(alan)) return true;
  return exams.some((exam) => exam.exam_type === 'YKS_TYT' || exam.exam_type === 'YKS_AYT');
}

function trackAllowed(name: string, alan?: string | null) {
  if (sectionKey(name) === 'felsefesecmeli' && normalizeAlan(alan) !== 'SOZEL') return false;
  return true;
}

function mainSections(exam: StudentExamResult) {
  return (exam.section_details || []).filter((s) => !s.is_sub_section);
}

function subSections(exam: StudentExamResult) {
  return (exam.section_details || []).filter((s) => s.is_sub_section);
}

function relevantSections(exam: StudentExamResult, alan?: string | null) {
  if (exam.exam_type !== 'YKS_AYT') {
    return mainSections(exam).filter((s) => trackAllowed(s.section_name, alan));
  }
  const mains = mainSections(exam);
  const mainNames = new Set(mains.map((s) => s.section_name));
  const leaves = [
    ...mains,
    ...subSections(exam).filter((s) => !mainNames.has(s.section_name)),
  ];
  return leaves.filter((s) => aytSectionAllowed(s.section_name, alan) && trackAllowed(s.section_name, alan));
}

const FEN_CHILDREN = new Set(['fizik', 'kimya', 'biyoloji']);
const SOS_CHILDREN = new Set(['tarih', 'cografya', 'felsefe', 'dkab', 'felsefesecmeli']);
const MAT_CHILDREN = new Set(['matematik', 'geometri']);

function dersArea(name: string) {
  const key = sectionKey(name);
  if (key === 'turkce' || key === 'edebiyat' || key === 'ingilizce') return 'Dil';
  if (SOS_CHILDREN.has(key) || key === 'sosyal' || key === 'tarih1' || key === 'tarih2' || key === 'cografya1' || key === 'cografya2' || key === 'felsefegrubu' || key === 'inkilap') {
    return 'Sosyal';
  }
  if (MAT_CHILDREN.has(key) || key === 'temelmatematik') return 'Matematik';
  if (FEN_CHILDREN.has(key) || key === 'fen') return 'Fen';
  return 'Diğer';
}

function successTone(n: number) {
  if (n >= 70) return 'ok';
  if (n >= 40) return 'mid';
  return 'low';
}

type SectionNode = StudentExamSectionDetail & { children: StudentExamSectionDetail[] };

function inferParentId(exam: StudentExamResult, sub: StudentExamSectionDetail, mains: StudentExamSectionDetail[]) {
  if (sub.parent_section_id) return sub.parent_section_id;
  if (exam.exam_type === 'YKS_AYT') return null;
  const key = sectionKey(sub.section_name);
  const needle = FEN_CHILDREN.has(key)
    ? 'fen'
    : SOS_CHILDREN.has(key)
      ? 'sosyal'
      : MAT_CHILDREN.has(key)
        ? 'matematik'
        : null;
  if (!needle) return null;
  const parent = mains.find((main) => {
    const compact = foldTr(main.section_name).replace(/[\s_\-()]/g, '');
    return compact.includes(needle);
  });
  return parent?.section_id ?? null;
}

function buildSectionTree(exam: StudentExamResult, alan?: string | null): SectionNode[] {
  const mains = mainSections(exam).filter((sec) => trackAllowed(sec.section_name, alan));
  const subs = subSections(exam).filter((sec) => trackAllowed(sec.section_name, alan));
  if (exam.exam_type === 'YKS_AYT') {
    return relevantSections(exam, alan).map((sec) => ({ ...sec, children: [] }));
  }
  const used = new Set<number>();
  const tree = mains.map((main) => {
    const children = subs.filter((sub) => inferParentId(exam, sub, mains) === main.section_id);
    children.forEach((child) => used.add(child.section_id));
    return { ...main, children };
  });
  subs.filter((sub) => !used.has(sub.section_id)).forEach((sub) => {
    tree.push({ ...sub, children: [] });
  });
  return tree;
}

function shortSubject(name: string) {
  return (
    {
      turkce: 'TUR',
      edebiyat: 'TDE',
      sosyal: 'SOS',
      temelmatematik: 'MAT',
      matematik: 'MAT',
      geometri: 'GEO',
      fen: 'FEN',
      fizik: 'FIZ',
      kimya: 'KIM',
      biyoloji: 'BIO',
      tarih: 'TAR',
      tarih1: 'TAR1',
      tarih2: 'TAR2',
      cografya: 'COG',
      cografya1: 'COG1',
      cografya2: 'COG2',
      felsefe: 'FEL',
      felsefegrubu: 'FEL',
      dkab: 'DIN',
      inkilap: 'INK',
      ingilizce: 'ING',
    }[sectionKey(name)] || name.slice(0, 3).toUpperCase()
  );
}

function fmtRank(n: number | null | undefined) {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return Math.round(Number(n)).toLocaleString('tr-TR');
}

function examRank(exam: StudentExamResult, alan?: string | null) {
  if (exam.exam_type === 'YKS_AYT' && exam.puan_turleri) {
    const key = normalizeAlan(alan) === 'ESIT_AGIRLIK' ? 'EA' : normalizeAlan(alan) === 'SOZEL' ? 'SOZ' : 'SAY';
    const pt = exam.puan_turleri[key as keyof NonNullable<StudentExamResult['puan_turleri']>];
    if (pt) {
      return {
        rank: pt.tahmini_siralama ?? exam.tahmini_siralama,
        pct: pt.yuzdelik_dilim ?? exam.yuzdelik_dilim,
        puan: pt.puan ?? exam.puan,
        kind: key,
      };
    }
  }
  return {
    rank: exam.tahmini_siralama,
    pct: exam.yuzdelik_dilim,
    puan: exam.puan,
    kind: null as string | null,
  };
}

function signed(n: number | null | undefined) {
  if (n == null) return '—';
  const abs = Math.abs(n).toFixed(1);
  return n > 0 ? `+${abs}` : n < 0 ? `−${abs}` : '0.0';
}

function signedRank(n: number | null | undefined) {
  if (n == null) return '—';
  const abs = Math.round(Math.abs(n)).toLocaleString('tr-TR');
  if (n > 0) return `+${abs}`;
  if (n < 0) return `−${abs}`;
  return 'aynı sıra';
}

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
    puan: exam.puan,
    ham_puan: exam.ham_puan,
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
}

export default function SinavlarTab({ studentId }: SinavlarTabProps) {
  const [data, setData] = useState<StudentExamResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<ExamView>('overview');
  const [examPick, setExamPick] = useState<'all' | number>('all');
  const [typePick, setTypePick] = useState('all');
  const [rangePick, setRangePick] = useState<RangeKey>('5');
  const [sortPick, setSortPick] = useState<SortKey>('date-desc');
  const [expanded, setExpanded] = useState<number | null>(null);
  const [karne, setKarne] = useState<{ exam: StudentExamResult; student: StudentAnalysis } | null>(null);
  const [pdfBusy, setPdfBusy] = useState<number | null>(null);
  const [rankingYear, setRankingYear] = useState<number | undefined>();
  const [rankingYears, setRankingYears] = useState<number[]>([2024, 2025, 2026]);
  const [defaultYear, setDefaultYear] = useState<number | null>(null);
  const [overviewGroup, setOverviewGroup] = useState<DevelopmentTypeGroup | null>(null);
  const hasDataRef = useRef(false);

  useEffect(() => {
    puanAyarlariApi
      .get()
      .then((payload) => {
        setRankingYears(payload.managed_years?.length ? payload.managed_years : [2024, 2025, 2026]);
        setDefaultYear(payload.default_puan_yili);
        setRankingYear((cur) => cur ?? payload.default_puan_yili);
      })
      .catch(() => {
        setRankingYear((cur) => cur ?? 2025);
      });
  }, []);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    setError(null);
    try {
      const result = await studentExamApi.results(studentId, undefined, rankingYear);
      hasDataRef.current = result.exams.length > 0;
      setData(result);
    } catch {
      setError('Sınav verileri yüklenemedi');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [studentId, rankingYear]);

  useEffect(() => {
    void load({ silent: hasDataRef.current });
  }, [load]);

  const allExams = useMemo(() => data?.exams ?? [], [data]);

  const lise = isLiseStudent(data?.alan, allExams);

  useEffect(() => {
    if (lise && (typePick === 'LGS' || typePick === 'LGS_7')) setTypePick('all');
  }, [lise, typePick]);

  const typeOptions = useMemo(() => {
    const present = Array.from(new Set(allExams.map((e) => e.exam_type)))
      .filter((value) => !(lise && (value === 'LGS' || value === 'LGS_7')));
    return present.map((value) => {
      const known = EXAM_TYPES.find((t) => t.value === value);
      return { value, label: known ? typeShort(value, known.label) : typeShort(value) };
    });
  }, [allExams, lise]);

  const filtered = useMemo(() => {
    let rows = allExams.slice();
    if (typePick !== 'all') rows = rows.filter((e) => e.exam_type === typePick);
    rows.sort((a, b) => (b.exam_date || '').localeCompare(a.exam_date || ''));
    if (rangePick !== 'all') rows = rows.slice(0, Number(rangePick));
    if (examPick !== 'all') {
      const one = allExams.find((e) => e.exam_id === examPick);
      rows = one ? [one] : [];
    }
    const sorted = rows.slice();
    if (sortPick === 'date-asc') sorted.sort((a, b) => (a.exam_date || '').localeCompare(b.exam_date || ''));
    if (sortPick === 'date-desc') sorted.sort((a, b) => (b.exam_date || '').localeCompare(a.exam_date || ''));
    if (sortPick === 'net-asc') sorted.sort((a, b) => a.total_net - b.total_net);
    if (sortPick === 'net-desc') sorted.sort((a, b) => b.total_net - a.total_net);
    return sorted;
  }, [allExams, examPick, typePick, rangePick, sortPick]);

  const resolveAnswerId = useCallback(
    async (exam: StudentExamResult) => {
      if (exam.answer_id) return exam.answer_id;
      const list = await analysisApi.students(exam.exam_id, undefined, studentId);
      return list.students?.[0]?.answer_id ?? null;
    },
    [studentId]
  );

  const openKarne = async (exam: StudentExamResult) => {
    try {
      const answerId = await resolveAnswerId(exam);
      if (!answerId) {
        window.alert('Bu sınav için karne kaydı bulunamadı.');
        return;
      }
      setKarne({
        exam,
        student: toKarneStudent(exam, studentId, data?.student_name || '', answerId),
      });
    } catch {
      window.alert('Karne açılamadı.');
    }
  };

  const downloadKarne = async (exam: StudentExamResult) => {
    setPdfBusy(exam.exam_id);
    try {
      const answerId = await resolveAnswerId(exam);
      if (!answerId) {
        window.alert('Bu sınav için karne kaydı bulunamadı.');
        return;
      }
      await analysisApi.downloadKarnePdf(exam.exam_id, answerId, rankingYear);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Karne PDF indirilemedi');
    } finally {
      setPdfBusy(null);
    }
  };

  if (loading) {
    return (
      <div className="s360x">
        <div className="s360x-skel">
          <div className="coach-skeleton" style={{ height: 44, borderRadius: 8 }} />
          <div className="coach-skeleton" style={{ height: 36, borderRadius: 8 }} />
          <div className="coach-skeleton" style={{ height: 220, borderRadius: 10 }} />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="s360x">
        <div className="s360x-empty">
          <h3>{error || 'Veri yok'}</h3>
          <button type="button" className="s360x-retry" onClick={() => void load()}>
            Tekrar dene
          </button>
        </div>
      </div>
    );
  }

  if (!allExams.length) {
    return (
      <div className="s360x">
        <div className="s360x-empty">
          <h3>Sınav kaydı yok</h3>
          <p>Bu öğrenci için henüz tamamlanmış sınav sonucu bulunmuyor.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="s360x">
      <div className="s360x-toolbar">
        {view !== 'growth' && (
        <>
        <label>
          <span className="sr-only">Sınav</span>
          <select
            value={examPick === 'all' ? 'all' : String(examPick)}
            onChange={(e) => setExamPick(e.target.value === 'all' ? 'all' : Number(e.target.value))}
          >
            <option value="all">Tüm Sınavlar</option>
            {allExams
              .slice()
              .sort((a, b) => (b.exam_date || '').localeCompare(a.exam_date || ''))
              .map((exam) => (
                <option key={exam.exam_id} value={exam.exam_id}>
                  {exam.exam_name}
                </option>
              ))}
          </select>
        </label>
        <label>
          <span className="sr-only">Tür</span>
          <select value={typePick} onChange={(e) => setTypePick(e.target.value)} disabled={examPick !== 'all'}>
            <option value="all">Tüm türler</option>
            {typeOptions.map((t) => (
              <option key={t.value} value={t.value}>
                {typeShort(t.value, t.label)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="sr-only">Aralık</span>
          <select
            value={rangePick}
            onChange={(e) => setRangePick(e.target.value as RangeKey)}
            disabled={examPick !== 'all'}
          >
            <option value="5">Son 5 Sınav</option>
            <option value="10">Son 10 Sınav</option>
            <option value="all">Tüm dönem</option>
          </select>
        </label>
        <label>
          <span className="sr-only">Sıralama</span>
          <select value={sortPick} onChange={(e) => setSortPick(e.target.value as SortKey)}>
            <option value="date-desc">Tarih (yeni)</option>
            <option value="date-asc">Tarih (eski)</option>
            <option value="net-desc">Net (yüksek)</option>
            <option value="net-asc">Net (düşük)</option>
          </select>
        </label>
        </>
        )}
        <label>
          <span className="sr-only">Puan yılı</span>
          <select
            value={rankingYear ?? ''}
            onChange={(e) => setRankingYear(Number(e.target.value))}
          >
            {rankingYears.map((year) => (
              <option key={year} value={year}>
                {year} YKS{year === defaultYear ? ' (varsayılan)' : ''}
              </option>
            ))}
          </select>
        </label>
      </div>

      <nav className="s360x-views" aria-label="Sınav görünümleri">
        {VIEWS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={view === item.id ? 'is-on' : undefined}
            onClick={() => setView(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {view === 'growth' ? (
        <GrowthPanel studentId={studentId} exams={allExams} alan={data.alan} lise={lise} />
      ) : filtered.length === 0 ? (
        <div className="s360x-empty">
          <h3>Filtreye uyan sınav yok</h3>
          <p>Filtreleri genişletin.</p>
        </div>
      ) : (
        <div className="s360x-body">
          {view === 'overview' && (
            <OverviewPanel
              exams={filtered}
              alan={data.alan}
              rankingYear={rankingYear}
              rankingYears={rankingYears}
              defaultYear={defaultYear}
              group={overviewGroup}
              onGroupChange={setOverviewGroup}
              onRankingYearChange={setRankingYear}
            />
          )}
          {view === 'mine' && (
            <ExamList
              exams={filtered}
              alan={data.alan}
              expanded={expanded}
              pdfBusy={pdfBusy}
              onToggle={(id) => setExpanded((cur) => (cur === id ? null : id))}
              onOpenKarne={(exam) => void openKarne(exam)}
              onDownloadKarne={(exam) => void downloadKarne(exam)}
            />
          )}
        </div>
      )}

      {karne && (
        <StudentDetailModal
          student={karne.student}
          examId={karne.exam.exam_id}
          examType={karne.exam.exam_type}
          rankingYear={rankingYear}
          onClose={() => setKarne(null)}
        />
      )}
    </div>
  );
}

function pickOverviewGroup(exams: StudentExamResult[], groups: DevelopmentTypeGroup[]) {
  if (!groups.length) return 'TYT' as DevelopmentTypeGroup;
  const counts = new Map<DevelopmentTypeGroup, number>();
  exams.forEach((exam) => {
    const g = examGroup(exam.exam_type);
    counts.set(g, (counts.get(g) || 0) + 1);
  });
  return groups.find((g) => (counts.get(g) || 0) >= 2) || groups[0];
}

function OverviewPanel({
  exams,
  alan,
  rankingYear,
  rankingYears,
  defaultYear,
  group: groupProp,
  onGroupChange,
  onRankingYearChange,
}: {
  exams: StudentExamResult[];
  alan?: string | null;
  rankingYear?: number;
  rankingYears: number[];
  defaultYear: number | null;
  group: DevelopmentTypeGroup | null;
  onGroupChange: (group: DevelopmentTypeGroup) => void;
  onRankingYearChange: (year: number) => void;
}) {
  const groups = useMemo(() => {
    const present = Array.from(new Set(exams.map((e) => examGroup(e.exam_type))));
    const order: DevelopmentTypeGroup[] = ['TYT', 'AYT', 'LGS', 'manuel'];
    return order.filter((g) => present.includes(g) && !(isLiseStudent(alan, exams) && g === 'LGS'));
  }, [exams]);

  const group = groupProp && groups.includes(groupProp) ? groupProp : pickOverviewGroup(exams, groups);

  useEffect(() => {
    if (!groupProp || !groups.includes(groupProp)) onGroupChange(group);
  }, [group, groupProp, groups, onGroupChange]);

  const scoped = useMemo(
    () => exams.filter((e) => examGroup(e.exam_type) === group).sort((a, b) => (a.exam_date || '').localeCompare(b.exam_date || '')),
    [exams, group]
  );
  const newest = useMemo(() => [...scoped].reverse(), [scoped]);

  const kpis = useMemo(() => {
    if (!scoped.length) return null;
    const nets = scoped.map((e) => e.total_net);
    const puans = scoped.map((e) => e.puan);
    const last = newest[0];
    const prev = newest[1];
    const avgs = new Map<string, number[]>();
    scoped.forEach((exam) => {
      relevantSections(exam, alan).forEach((sec) => {
        (avgs.get(sec.section_name) ?? avgs.set(sec.section_name, []).get(sec.section_name)!).push(sec.net);
      });
    });
    const subjects = Array.from(avgs.entries())
      .map(([name, vals]) => ({ name, avg: vals.reduce((a, b) => a + b, 0) / vals.length }))
      .sort((a, b) => b.avg - a.avg);
    return {
      count: scoped.length,
      avgNet: nets.reduce((a, b) => a + b, 0) / nets.length,
      maxNet: Math.max(...nets),
      avgPuan: puans.reduce((a, b) => a + b, 0) / puans.length,
      lastNet: last.total_net,
      lastPuan: last.puan,
      netDelta: prev ? last.total_net - prev.total_net : null,
      puanDelta: prev ? last.puan - prev.puan : null,
      best: subjects[0] || null,
      weak: subjects.length ? subjects[subjects.length - 1] : null,
      subjects,
    };
  }, [scoped, newest, alan]);

  if (!kpis) {
    return (
      <div className="s360x-empty">
        <h3>Bu türde sınav yok</h3>
      </div>
    );
  }

  const maxAvg = Math.max(...kpis.subjects.map((s) => s.avg), 1);
  return (
    <div className="s360x-overview">
      {groups.length > 1 && (
        <div className="s360x-seg" role="tablist" aria-label="Sınav türü">
          {groups.map((g) => (
            <button
              key={g}
              type="button"
              role="tab"
              aria-selected={group === g}
              className={group === g ? 'is-on' : undefined}
              onClick={() => onGroupChange(g)}
            >
              {g === 'manuel' ? 'Manuel' : g}
            </button>
          ))}
        </div>
      )}

      <div className="s360x-kpis s360x-kpis-rich">
        <Stat label="Sınav" value={String(kpis.count)} />
        <Stat label="Ort. net" value={fmt(kpis.avgNet)} hint={signed(kpis.netDelta)} tone={toneOf(kpis.netDelta)} />
        <Stat label="Ort. puan" value={fmtPuan(kpis.avgPuan)} hint={signed(kpis.puanDelta)} tone={toneOf(kpis.puanDelta)} />
        <Stat label="Son net" value={fmt(kpis.lastNet)} hint={`max ${fmt(kpis.maxNet)}`} />
        <Stat label="Güçlü" value={kpis.best?.name || '—'} hint={kpis.best ? fmt(kpis.best.avg) : undefined} />
        <Stat label="Zayıf" value={kpis.weak?.name || '—'} hint={kpis.weak ? fmt(kpis.weak.avg) : undefined} />
      </div>

      <MultiTrendCard exams={scoped} alan={alan} />

      <div className="s360x-split s360x-split-3">
        <RankCard
          exams={newest}
          alan={alan}
          rankingYear={rankingYear}
          rankingYears={rankingYears}
          defaultYear={defaultYear}
          onRankingYearChange={onRankingYearChange}
        />
        <section className="s360x-panel">
          <h3>Son sınavlar</h3>
          <ol className="s360x-timeline">
            {newest.slice(0, 5).map((exam, i) => {
              const prev = newest[i + 1];
              const delta = prev ? exam.total_net - prev.total_net : null;
              return (
                <li key={exam.exam_id}>
                  <i />
                  <div>
                    <b>{exam.exam_name}</b>
                    <span>{fmtDate(exam.exam_date)} · {typeShort(exam.exam_type, exam.exam_type_display)}</span>
                  </div>
                  <div className="s360x-timeline-score">
                    <strong>{fmt(exam.total_net)}</strong>
                    <em data-tone={toneOf(delta)}>{signed(delta)}</em>
                    <span>{fmtPuan(exam.puan)}</span>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
        <section className="s360x-panel">
          <h3>{group === 'manuel' ? 'Manuel' : group} ders ortalaması</h3>
          <ul className="s360x-avgbars">
            {kpis.subjects.map((s) => (
              <li key={s.name}>
                <div>
                  <span>{s.name}</span>
                  <em>{fmt(s.avg)}</em>
                </div>
                <i>
                  <b style={{ width: `${Math.max(8, (s.avg / maxAvg) * 100)}%` }} />
                </i>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

const SERIES_COLORS = ['#3b82f6', '#f59e0b', '#10b981', '#8b5cf6', '#f43f5e', '#06b6d4', '#84cc16', '#f97316'];

function niceScale(min: number, max: number, count = 5) {
  const pad = (max - min) * 0.08 || 4;
  const lo = min >= 0 ? 0 : min - pad;
  const hi = max + pad;
  const span = hi - lo || 1;
  const raw = span / (count - 1);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((n) => n * mag).find((n) => n >= raw) || raw;
  const start = Math.floor(lo / step) * step;
  const end = Math.ceil(hi / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= end + 1e-6; v += step) ticks.push(Number(v.toFixed(4)));
  return { min: start, max: end, ticks };
}

function clipLabel(name: string, max = 12) {
  const clean = name.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

type TrendSeries = { key: string; label: string; color: string; values: (number | null)[] };

function MultiTrendCard({ exams, alan }: { exams: StudentExamResult[]; alan?: string | null }) {
  const [metric, setMetric] = useState<'net' | 'puan'>('net');
  const [off, setOff] = useState<Set<string>>(new Set());
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const chrono = useMemo(
    () => [...exams].sort((a, b) => (a.exam_date || '').localeCompare(b.exam_date || '')),
    [exams]
  );

  const subjects = useMemo(() => {
    const names = new Set<string>();
    chrono.forEach((exam) => relevantSections(exam, alan).forEach((sec) => names.add(sec.section_name)));
    return Array.from(names);
  }, [chrono, alan]);

  const series = useMemo<TrendSeries[]>(() => {
    const rows: TrendSeries[] = [
      {
        key: 'toplam',
        label: 'Toplam',
        color: '#111827',
        values: chrono.map((exam) => (metric === 'net' ? exam.total_net : exam.puan)),
      },
    ];
    if (metric === 'net') {
      subjects.forEach((name, i) => {
        rows.push({
          key: name,
          label: shortSubject(name),
          color: SERIES_COLORS[i % SERIES_COLORS.length],
          values: chrono.map((exam) => {
            const sec = relevantSections(exam, alan).find((s) => s.section_name === name);
            return sec ? sec.net : null;
          }),
        });
      });
    }
    return rows;
  }, [chrono, subjects, alan, metric]);

  const visible = series.filter((row) => !off.has(row.key));
  const nums = visible.flatMap((row) => row.values.filter((v): v is number => v != null));
  const scale = nums.length ? niceScale(Math.min(...nums), Math.max(...nums)) : niceScale(0, 10);
  const total = series[0];
  const avg = total
    ? total.values.filter((v): v is number => v != null).reduce((a, b) => a + b, 0) / Math.max(total.values.filter((v) => v != null).length, 1)
    : 0;

  const toggle = (key: string) => {
    setOff((cur) => {
      const next = new Set(cur);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const w = 920;
  const h = 320;
  const pad = { l: 44, r: 16, t: 16, b: 52 };
  const innerW = w - pad.l - pad.r;
  const innerH = h - pad.t - pad.b;
  const xAt = (i: number) => pad.l + (chrono.length < 2 ? innerW / 2 : (i / (chrono.length - 1)) * innerW);
  const yAt = (v: number) => pad.t + ((scale.max - v) / (scale.max - scale.min || 1)) * innerH;

  const pickIndex = (clientX: number) => {
    const svg = svgRef.current;
    if (!svg || chrono.length < 2) return 0;
    const rect = svg.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * w;
    return chrono.reduce((best, _, i) => (Math.abs(xAt(i) - x) < Math.abs(xAt(best) - x) ? i : best), 0);
  };

  const hoverExam = hover != null ? chrono[hover] : null;
  const newest = [...chrono].reverse();

  return (
    <section className="s360x-multi-trend">
      <header>
        <div>
          <h3>{metric === 'net' ? 'Net trendi' : 'Puan trendi'}</h3>
          <p>Etiketlere tıklayarak serileri aç/kapat.</p>
        </div>
        <div className="s360x-multi-trend-tools">
          <div className="s360x-seg s360x-seg-mini" role="tablist" aria-label="Trend birimi">
            <button type="button" role="tab" aria-selected={metric === 'net'} className={metric === 'net' ? 'is-on' : undefined} onClick={() => setMetric('net')}>Net</button>
            <button type="button" role="tab" aria-selected={metric === 'puan'} className={metric === 'puan' ? 'is-on' : undefined} onClick={() => setMetric('puan')}>Puan</button>
          </div>
          <span>{metric === 'net' ? 'toplam + ders bazlı' : 'toplam puan'}</span>
        </div>
      </header>
      <div className="s360x-legend" role="group" aria-label="Seriler">
        {series.map((row) => (
          <button
            key={row.key}
            type="button"
            className={off.has(row.key) ? 'is-off' : 'is-on'}
            onClick={() => toggle(row.key)}
          >
            <i style={{ background: off.has(row.key) ? 'transparent' : row.color, borderColor: off.has(row.key) ? '#cbd5e1' : row.color }} />
            {row.label}
          </button>
        ))}
      </div>
      {chrono.length < 2 ? (
        <p className="s360x-trend-empty">Trend için en az iki sınav gerekir</p>
      ) : (
        <>
          <div className="s360x-chart-plot">
            <svg
              ref={svgRef}
              viewBox={`0 0 ${w} ${h}`}
              className="s360x-multi-svg"
              role="img"
              aria-label="Net trendi"
              onMouseMove={(e) => setHover(pickIndex(e.clientX))}
              onMouseLeave={() => setHover(null)}
            >
              <defs>
                <filter id="s360x-glow" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="2.2" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>
              {scale.ticks.map((tick) => (
                <g key={tick}>
                  <line x1={pad.l} x2={w - pad.r} y1={yAt(tick)} y2={yAt(tick)} className="s360x-trend-grid" />
                  <text x={pad.l - 8} y={yAt(tick) + 4} textAnchor="end" className="s360x-multi-tick">{tick}</text>
                </g>
              ))}
              {!off.has('toplam') && Number.isFinite(avg) && (
                <g>
                  <line x1={pad.l} x2={w - pad.r} y1={yAt(avg)} y2={yAt(avg)} className="s360x-trend-avg" />
                  <text x={w - pad.r} y={yAt(avg) - 8} textAnchor="end" className="s360x-multi-avg">
                    ORT: {fmt(avg, 0)}
                  </text>
                </g>
              )}
              {hover != null && (
                <line x1={xAt(hover)} x2={xAt(hover)} y1={pad.t} y2={h - pad.b} className="s360x-trend-guide" />
              )}
              {visible.map((row) => {
                const pts = row.values
                  .map((value, i) => (value == null ? null : `${xAt(i)},${yAt(value)}`))
                  .filter(Boolean)
                  .join(' ');
                return (
                  <polyline
                    key={row.key}
                    points={pts}
                    fill="none"
                    stroke={row.color}
                    strokeWidth={row.key === 'toplam' ? 2.8 : 2}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    className={row.key === 'toplam' ? 's360x-trend-line is-total' : 's360x-trend-line is-subject'}
                    filter={row.key === 'toplam' ? 'url(#s360x-glow)' : undefined}
                  />
                );
              })}
              {visible.map((row) =>
                row.values.map((value, i) =>
                  value == null ? null : (
                    <circle
                      key={`${row.key}-${chrono[i].exam_id}`}
                      cx={xAt(i)}
                      cy={yAt(value)}
                      r={hover === i ? (row.key === 'toplam' ? 6 : 4.5) : row.key === 'toplam' ? 4.4 : 3.2}
                      fill="#fff"
                      stroke={row.color}
                      strokeWidth={hover === i ? 2.4 : 1.8}
                      className="s360x-trend-dot"
                    />
                  )
                )
              )}
              {chrono.map((exam, i) => (
                <text
                  key={exam.exam_id}
                  x={xAt(i)}
                  y={h - 12}
                  textAnchor="middle"
                  className={`s360x-multi-xlabel${hover === i ? ' is-on' : ''}`}
                >
                  {clipLabel(exam.exam_name, 14)}
                </text>
              ))}
            </svg>
            {hoverExam && hover != null && (
              <div
                className="s360x-tip"
                style={{ left: `${Math.min(86, Math.max(14, (xAt(hover) / w) * 100))}%` }}
              >
                <strong>{hoverExam.exam_name}</strong>
                <em>{fmtDate(hoverExam.exam_date)}</em>
                {visible.map((row) => (
                  <div key={row.key}>
                    <i style={{ background: row.color }} />
                    <span>{row.label}</span>
                    <b>{row.values[hover] == null ? '—' : fmt(row.values[hover] as number)}</b>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="s360x-hist">
            <header>
              <h3>Deneme geçmişi</h3>
              <span>{chrono.length} deneme</span>
            </header>
            <div className="s360x-hist-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Tarih</th>
                    <th>Deneme</th>
                    <th>Puan</th>
                    <th>Toplam net</th>
                    {subjects.map((name) => (
                      <th key={name}>{shortSubject(name)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {newest.map((exam) => {
                    const idx = chrono.findIndex((row) => row.exam_id === exam.exam_id);
                    return (
                      <tr
                        key={exam.exam_id}
                        className={hover === idx ? 'is-on' : undefined}
                        onMouseEnter={() => setHover(idx)}
                        onMouseLeave={() => setHover(null)}
                      >
                        <td>{fmtDate(exam.exam_date)}</td>
                        <td>{exam.exam_name}</td>
                        <td>{fmtPuan(exam.puan)}</td>
                        <td><b>{fmt(exam.total_net)}</b></td>
                        {subjects.map((name, i) => {
                          const sec = relevantSections(exam, alan).find((s) => s.section_name === name);
                          return (
                            <td key={name}>
                              <span className="s360x-hist-net" style={{ color: SERIES_COLORS[i % SERIES_COLORS.length] }}>
                                {sec ? fmt(sec.net) : '—'}
                              </span>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function ExamList({
  exams,
  alan,
  expanded,
  pdfBusy,
  onToggle,
  onOpenKarne,
  onDownloadKarne,
}: {
  exams: StudentExamResult[];
  alan?: string | null;
  expanded: number | null;
  pdfBusy: number | null;
  onToggle: (id: number) => void;
  onOpenKarne: (exam: StudentExamResult) => void;
  onDownloadKarne: (exam: StudentExamResult) => void;
}) {
  return (
    <div className="s360x-exam-cards">
      {exams.map((exam) => (
        <ExamBlock
          key={exam.exam_id}
          exam={exam}
          alan={alan}
          open={expanded === exam.exam_id}
          pdfBusy={pdfBusy === exam.exam_id}
          onToggle={onToggle}
          onOpenKarne={onOpenKarne}
          onDownloadKarne={onDownloadKarne}
        />
      ))}
    </div>
  );
}

function ExamBlock({
  exam,
  alan,
  open,
  pdfBusy,
  onToggle,
  onOpenKarne,
  onDownloadKarne,
}: {
  exam: StudentExamResult;
  alan?: string | null;
  open: boolean;
  pdfBusy: boolean;
  onToggle: (id: number) => void;
  onOpenKarne: (exam: StudentExamResult) => void;
  onDownloadKarne: (exam: StudentExamResult) => void;
}) {
  const tree = buildSectionTree(exam, alan);
  const rank = examRank(exam, alan);
  return (
    <article className={`s360x-exam-card${open ? ' is-open' : ''}`}>
      <button type="button" className="s360x-exam-card-head" onClick={() => tree.length && onToggle(exam.exam_id)}>
        <div>
          <em className="s360x-chip">{typeShort(exam.exam_type, exam.exam_type_display)}</em>
          <b>{exam.exam_name}</b>
          <span>{fmtDate(exam.exam_date)}</span>
        </div>
        <div className="s360x-exam-metrics">
          <span><small>D / Y / B</small>{exam.total_correct} / {exam.total_wrong} / {exam.total_empty}</span>
          <span><small>Net</small><strong>{fmt(exam.total_net)}</strong></span>
          <span><small>Puan</small><strong>{fmtPuan(exam.puan)}</strong></span>
          <span><small>Tahmini sıra</small><strong>{fmtRank(rank.rank)}</strong></span>
        </div>
      </button>
      <div className="s360x-exam-foot">
        <div className="s360x-exam-rankline">
          <span>Kurum {exam.kurum_ici_sira > 0 ? `${exam.kurum_ici_sira}/${exam.toplam_ogrenci}` : '—'}</span>
          <span>Yüzdelik {rank.pct == null ? '—' : `%${fmt(rank.pct)}`}</span>
          {rank.kind ? <span>{rank.kind}</span> : null}
        </div>
        <div className="s360x-karne-btns">
          <button type="button" onClick={() => onOpenKarne(exam)}>Karne</button>
          <button type="button" disabled={pdfBusy} onClick={() => onDownloadKarne(exam)}>{pdfBusy ? '…' : 'PDF'}</button>
        </div>
      </div>
      {open && (
        <div className="s360x-exam-secs-wrap">
          <div className="s360x-exam-secs-head">
            <span>Ders</span>
            <span>D</span>
            <span>Y</span>
            <span>B</span>
            <span>Net</span>
          </div>
          <ul className="s360x-exam-secs">
            {tree.map((sec) => (
              <li key={sec.section_id} className={sec.children.length ? 'has-kids' : undefined}>
                <div className="s360x-exam-sec">
                  <b>{sec.section_name}</b>
                  <span className="is-ok">{sec.correct}</span>
                  <span className="is-bad">{sec.wrong}</span>
                  <span>{sec.empty}</span>
                  <em>{fmt(sec.net)} / {sec.question_count}</em>
                </div>
                {sec.children.length > 0 && (
                  <ul>
                    {sec.children.map((child) => (
                      <li key={child.section_id} className="is-sub">
                        <b>{child.section_name}</b>
                        <span className="is-ok">{child.correct}</span>
                        <span className="is-bad">{child.wrong}</span>
                        <span>{child.empty}</span>
                        <em>{fmt(child.net)} / {child.question_count}</em>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}

const DEV_STATUS: Record<string, string> = {
  insufficient_data: 'Yeterli veri yok',
  improving: 'Yükseliyor',
  strongly_improving: 'Güçlü yükseliş',
  declining: 'Geriliyor',
  strongly_declining: 'Güçlü gerileme',
  stable: 'İstikrarlı',
  yeni_olculdu: 'Yeni ölçüldü',
};

const DEV_LEVEL: Record<string, string> = {
  very_high: 'Çok yüksek',
  high: 'Yüksek',
  medium: 'Orta',
  needs_work: 'Geliştirilmeli',
  low: 'Düşük',
};

const DEV_GROUPS: { value: DevelopmentTypeGroup | ''; label: string }[] = [
  { value: '', label: 'Son sınav türü' },
  { value: 'TYT', label: 'TYT' },
  { value: 'AYT', label: 'AYT' },
  { value: 'LGS', label: 'LGS' },
  { value: 'manuel', label: 'Manuel' },
];

function RankCard({
  exams,
  alan,
  rankingYear,
  rankingYears,
  defaultYear,
  onRankingYearChange,
}: {
  exams: StudentExamResult[];
  alan?: string | null;
  rankingYear?: number;
  rankingYears: number[];
  defaultYear: number | null;
  onRankingYearChange: (year: number) => void;
}) {
  const last = exams[0];
  const lastRank = examRank(last, alan);
  const prevRank = exams[1] ? examRank(exams[1], alan) : null;
  const rankDelta =
    lastRank.rank != null && prevRank?.rank != null ? prevRank.rank - lastRank.rank : null;
  const ranks = exams.slice(0, 6).map((exam) => examRank(exam, alan).rank).filter((n): n is number => n != null);
  const pct = lastRank.pct;
  const topShare = pct == null ? null : Math.max(2, 100 - pct);

  return (
    <section className="s360x-rank-card">
      <div className="s360x-rank-top">
        <div>
          <span>Tahmini sıralama</span>
          <strong>{fmtRank(lastRank.rank)}</strong>
          <em data-tone={toneOf(rankDelta)}>
            {rankDelta == null ? 'Önceki deneme yok' : `${signedRank(rankDelta)} sıra`}
          </em>
        </div>
        <Sparkline values={ranks.slice().reverse().map((n) => -n)} />
      </div>
      <p className="s360x-rank-exam">
        {last.exam_name} · {fmtDate(last.exam_date)}
        {lastRank.kind ? ` · ${lastRank.kind}` : ''}
      </p>
      <div className="s360x-rank-pct">
        <div>
          <b>{pct == null ? '—' : `%${fmt(pct)}`}</b>
          <span>yüzdelik dilim</span>
        </div>
        <i>
          <em style={{ width: `${topShare ?? 8}%` }} />
        </i>
      </div>
      <div className="s360x-rank-meta">
        <span>Puan <b>{fmtPuan(lastRank.puan)}</b></span>
        <label>
          <span>Puan yılı</span>
          <select
            value={rankingYear ?? ''}
            onChange={(e) => onRankingYearChange(Number(e.target.value))}
          >
            {rankingYears.map((year) => (
              <option key={year} value={year}>
                {year} YKS{year === defaultYear ? ' (varsayılan)' : ''}
              </option>
            ))}
          </select>
        </label>
      </div>
    </section>
  );
}

function statusTone(status?: string | null): 'up' | 'down' | 'flat' | undefined {
  if (!status) return undefined;
  if (status.includes('improving') || status === 'yeni_olculdu') return 'up';
  if (status.includes('declining')) return 'down';
  if (status === 'insufficient_data') return undefined;
  return 'flat';
}

function GrowthPanel({
  studentId,
  exams,
  alan,
  lise,
}: {
  studentId: number;
  exams: StudentExamResult[];
  alan?: string | null;
  lise?: boolean;
}) {
  const visibleGroups = DEV_GROUPS.filter((g) => !(lise && g.value === 'LGS'));
  const [typeGroup, setTypeGroup] = useState<DevelopmentTypeGroup | ''>(() => {
    const allGroups: DevelopmentTypeGroup[] = ['TYT', 'AYT', 'LGS', 'manuel'];
    const groups = allGroups.filter((g) => !(lise && g === 'LGS'));
    return pickOverviewGroup(exams, groups.filter((g) => exams.some((e) => examGroup(e.exam_type) === g)));
  });
  const [windowPick, setWindowPick] = useState<DevelopmentWindow>('5');

  useEffect(() => {
    if (lise && typeGroup === 'LGS') setTypeGroup('');
  }, [lise, typeGroup]);
  const [customIds, setCustomIds] = useState<number[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [data, setData] = useState<DevelopmentResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const groupExams = useMemo(() => {
    const group = typeGroup || (exams.length ? examGroup(exams[exams.length - 1].exam_type) : '');
    if (!group) return exams;
    return exams.filter((exam) => examGroup(exam.exam_type) === group);
  }, [exams, typeGroup]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const payload = await studentExamApi.development(studentId, {
          examType: typeGroup || undefined,
          window: windowPick === 'custom' ? 'custom' : windowPick,
          examIds: windowPick === 'custom' ? customIds : undefined,
        });
        if (!cancelled) setData(payload);
      } catch {
        if (!cancelled) {
          setData(null);
          setError('Gelişim analizi yüklenemedi');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [studentId, typeGroup, windowPick, customIds]);

  const toggleCustom = (id: number) => {
    setCustomIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  };

  if (loading) {
    return <div className="s360x-skel"><i /><i /><i /></div>;
  }
  if (error) {
    return (
      <div className="s360x-empty">
        <h3>{error}</h3>
      </div>
    );
  }

  const summary = data?.summary;
  const subjects = leafDevelopmentSubjects(data?.subjects ?? [], alan);
  const priorities = (data?.priorities ?? []).filter((row) => {
    if (!trackAllowed(row.subject, alan)) return false;
    if ((row.mastery_rate ?? 0) >= PRIORITY_MASTERED) return false;
    if (row.question_count && (row.correct ?? 0) >= row.question_count) return false;
    return true;
  }).slice(0, PRIORITY_LIMIT);
  const byName = Object.fromEntries(subjects.map((row) => [row.name, row]));

  return (
    <div className="s360x-dev">
      <div className="s360x-toolbar">
        <label>
          <span className="sr-only">Tür</span>
          <select
            value={typeGroup}
            onChange={(e) => {
              setTypeGroup(e.target.value as DevelopmentTypeGroup | '');
              setCustomIds([]);
            }}
          >
            {visibleGroups.map((g) => (
              <option key={g.value || 'auto'} value={g.value}>{g.label}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="sr-only">Pencere</span>
          <select value={windowPick} onChange={(e) => setWindowPick(e.target.value as DevelopmentWindow)}>
            <option value="1">Son 1 sınav</option>
            <option value="3">Son 3 sınav</option>
            <option value="5">Son 5 sınav</option>
            <option value="10">Son 10 sınav</option>
            <option value="all">Tümü</option>
            <option value="custom">Özel seçim</option>
          </select>
        </label>
      </div>

      {windowPick === 'custom' && (
        <div className="s360x-dev-picks">
          {groupExams.length === 0 ? (
            <p>Bu türde sınav yok.</p>
          ) : (
            groupExams.map((exam) => (
              <label key={exam.exam_id}>
                <input
                  type="checkbox"
                  checked={customIds.includes(exam.exam_id)}
                  onChange={() => toggleCustom(exam.exam_id)}
                />
                <span>{exam.exam_name}</span>
                <em>{fmtDate(exam.exam_date)}</em>
              </label>
            ))
          )}
        </div>
      )}

      {!data || data.exam_count === 0 ? (
        <div className="s360x-empty">
          <h3>Yeterli veri yok</h3>
          <p>Seçilen tür ve pencerede tamamlanmış sınav bulunamadı.</p>
        </div>
      ) : (
        <>
          <div className="s360x-kpis">
            <Stat label="Sınav" value={String(data.exam_count)} />
            <Stat label="Yükselen" value={String(summary?.improving ?? 0)} tone="up" />
            <Stat label="İstikrarlı" value={String(summary?.stable ?? 0)} />
            <Stat label="Gerileyen" value={String(summary?.declining ?? 0)} tone="down" />
            <Stat label="Yetersiz" value={String(summary?.insufficient ?? 0)} />
            <Stat label="Öne çıkan" value={summary?.top_improving || summary?.most_stable || '—'} />
          </div>
          {(summary?.top_improving || summary?.top_declining || (summary?.most_volatile && subjects.some((row) => row.is_volatile))) ? (
            <div className="s360x-dev-highlights">
              {summary?.top_improving ? (
                <article data-kind="up">
                  <span>En çok yükselen</span>
                  <strong>{summary.top_improving}</strong>
                  <b>{signed(byName[summary.top_improving]?.net_change)}</b>
                </article>
              ) : null}
              {summary?.top_declining ? (
                <article data-kind="down">
                  <span>En çok gerileyen</span>
                  <strong>{summary.top_declining}</strong>
                  <b>{signed(byName[summary.top_declining]?.net_change)}</b>
                </article>
              ) : null}
              {summary?.most_volatile && subjects.some((row) => row.is_volatile) ? (
                <article data-kind="wave">
                  <span>En dalgalı</span>
                  <strong>{summary.most_volatile}</strong>
                  <b>Dalgalı seyir</b>
                </article>
              ) : null}
            </div>
          ) : summary?.narratives?.length ? (
            <ul className="s360x-dev-notes">
              {summary.narratives.map((text) => (
                <li key={text}>{text}</li>
              ))}
            </ul>
          ) : null}

          <div className="s360x-dev-grid">
            {subjects.map((subject) => (
              <DevelopmentCard
                key={subject.name}
                subject={subject}
                open={openId === subject.name}
                onToggle={() => setOpenId((cur) => (cur === subject.name ? null : subject.name))}
              />
            ))}
          </div>

          <section className="s360x-dev-priority">
            <h3>Öncelikli çalışma</h3>
            {priorities.length === 0 ? (
              <p>Yeterli veri yok</p>
            ) : (
              <div className="s360x-table-wrap">
                <table className="s360x-table s360x-prio-table">
                  <thead>
                    <tr>
                      <th>Ders</th>
                      <th>Konu</th>
                      <th>Kazanım</th>
                      <th>D / S</th>
                      <th>Başarı</th>
                      <th>Risk</th>
                    </tr>
                  </thead>
                  <tbody>
                    {priorities.map((row) => (
                      <PriorityRow key={`${row.subject}-${row.topic}-${row.outcome}`} row={row} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function Sparkline({
  values,
  color = '#0f6cbd',
  width = 88,
  height = 28,
}: {
  values: (number | null)[];
  color?: string;
  width?: number;
  height?: number;
}) {
  const nums = values.filter((v): v is number => v != null);
  if (nums.length < 2) return <span className="s360x-spark is-empty">—</span>;
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const span = max - min || 1;
  const pts = values
    .map((v, i) => {
      if (v == null) return null;
      const x = (i / (values.length - 1)) * width;
      const y = height - 3 - ((v - min) / span) * (height - 6);
      return `${x},${y}`;
    })
    .filter(Boolean)
    .join(' ');
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="s360x-spark" aria-hidden>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function topicRates(subject: DevelopmentSubject, topicName: string) {
  const outs = subject.outcomes.filter((row) => row.topic === topicName);
  return subject.series.map((point) => {
    const hits = outs.flatMap((row) => row.series.filter((s) => s.exam_id === point.exam_id));
    if (!hits.length) return null;
    const q = hits.reduce((sum, s) => sum + s.question_count, 0);
    const c = hits.reduce((sum, s) => sum + s.correct, 0);
    return q ? (c / q) * 100 : null;
  });
}

function topicOutcomeRows(subject: DevelopmentSubject, topicName: string) {
  const topic = subject.topics.find((row) => row.name === topicName);
  const full = subject.outcomes.filter((row) => row.topic === topicName);
  const byName = new Map(full.map((row) => [row.name, row]));
  const names = topic?.outcomes.length ? topic.outcomes.map((row) => row.name) : full.map((row) => row.name);
  return names.map((name) => {
    const nested = topic?.outcomes.find((row) => row.name === name);
    const live = byName.get(name);
    return {
      name,
      question_count: nested?.question_count ?? live?.question_count ?? 0,
      correct: nested?.correct ?? live?.correct ?? 0,
      wrong: nested?.wrong ?? live?.wrong ?? 0,
      empty: nested?.empty ?? live?.empty ?? 0,
      mastery_rate: nested?.mastery_rate ?? live?.mastery_rate ?? null,
      development_status: nested?.development_status ?? live?.development_status ?? '',
      series: live?.series ?? [],
    };
  });
}

function TopicHoverTip({
  anchor,
  topicKey,
  onEnter,
  onLeave,
  children,
}: {
  anchor: HTMLElement;
  topicKey: string;
  onEnter: () => void;
  onLeave: () => void;
  children: ReactNode;
}) {
  const tipRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState(() => {
    const ar = anchor.getBoundingClientRect();
    return {
      top: ar.bottom + 8,
      left: Math.max(12, ar.left),
      width: Math.min(420, window.innerWidth - 24),
      maxHeight: Math.max(240, window.innerHeight - ar.bottom - 20),
      place: 'below' as 'above' | 'below',
      ready: false,
    };
  });

  useLayoutEffect(() => {
    const tip = tipRef.current;
    if (!tip) return;

    const place = () => {
      const pad = 10;
      const gap = 8;
      const ar = anchor.getBoundingClientRect();
      const width = Math.min(420, window.innerWidth - pad * 2);
      tip.style.width = `${width}px`;
      const natural = tip.scrollHeight;
      const spaceAbove = ar.top - pad;
      const spaceBelow = window.innerHeight - ar.bottom - pad;
      const placeBelow = spaceBelow >= spaceAbove;
      const maxHeight = Math.max(220, (placeBelow ? spaceBelow : spaceAbove) - gap);
      const height = Math.min(natural, maxHeight);
      let top = placeBelow ? ar.bottom + gap : ar.top - height - gap;
      let left = ar.left;
      if (left + width > window.innerWidth - pad) left = window.innerWidth - pad - width;
      if (left < pad) left = pad;
      if (top < pad) top = pad;
      if (top + height > window.innerHeight - pad) top = Math.max(pad, window.innerHeight - pad - height);
      setBox({ top, left, width, maxHeight, place: placeBelow ? 'below' : 'above', ready: true });
    };

    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [anchor, topicKey]);

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div
      ref={tipRef}
      className="s360x-topic-tip"
      data-place={box.place}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      style={{
        top: box.top,
        left: box.left,
        width: box.width,
        maxHeight: box.maxHeight,
        opacity: box.ready ? 1 : 0,
      }}
    >
      {children}
    </div>,
    document.body
  );
}

function DevelopmentCard({
  subject,
  open,
  onToggle,
}: {
  subject: DevelopmentSubject;
  open: boolean;
  onToggle: () => void;
}) {
  const [hoverTopic, setHoverTopic] = useState<string | null>(null);
  const [hoverEl, setHoverEl] = useState<HTMLElement | null>(null);
  const hideTimer = useRef<number | null>(null);
  const topic = subject.topics.find((row) => row.name === hoverTopic) || null;
  const topicOutcomes = topic ? topicOutcomeRows(subject, topic.name) : [];
  const openTip = (name: string, el: HTMLElement) => {
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    setHoverTopic(name);
    setHoverEl(el);
  };
  const keepTip = () => {
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
  };
  const hideTip = () => {
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => {
      setHoverTopic(null);
      setHoverEl(null);
    }, 180);
  };
  useEffect(() => () => {
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
  }, []);
  return (
    <article className={`s360x-dev-card${open ? ' is-open' : ''}`}>
      <button type="button" className="s360x-dev-card-head" onClick={onToggle}>
        <div>
          <strong>{subject.name}</strong>
          <em data-tone={statusTone(subject.development_status)}>
            {DEV_STATUS[subject.development_status] || subject.development_status}
            {subject.is_volatile ? ' · Dalgalı' : ''}
          </em>
        </div>
        <Sparkline values={subject.series.map((p) => p.net)} />
        <div className="s360x-dev-nets">
          <b>{subject.last_net == null ? '—' : fmt(subject.last_net)}</b>
          <span data-tone={toneOf(subject.net_change)}>{signed(subject.net_change)}</span>
        </div>
      </button>
      <div className="s360x-dev-metrics">
        <span>Ort. {subject.average_net == null ? '—' : fmt(subject.average_net)}</span>
        <span>{subject.performance_level ? DEV_LEVEL[subject.performance_level] : '—'}</span>
        <span>{subject.exam_count} sınav</span>
      </div>
      {subject.narrative && <p className="s360x-dev-narr">{subject.narrative}</p>}
      <div className="s360x-dev-tags">
        {subject.strong_areas.slice(0, 3).map((area) => (
          <i key={`s-${area.name}`} data-kind="up">{area.name}</i>
        ))}
        {subject.growth_areas.slice(0, 3).map((area) => (
          <i key={`g-${area.name}`} data-kind="down">{area.name}</i>
        ))}
      </div>
      {open && (
        <div className="s360x-dev-detail">
          <div className="s360x-dev-path">
            {subject.series.map((point, i) => {
              const prev = i > 0 ? subject.series[i - 1] : null;
              const delta = prev ? point.net - prev.net : null;
              return (
                <div key={point.exam_id}>
                  <b>{fmt(point.net)}</b>
                  <em data-tone={toneOf(delta)}>{signed(delta)}</em>
                  <span>{clipLabel(point.exam_name, 14)}</span>
                </div>
              );
            })}
          </div>
          {subject.topics.length > 0 && (
            <div className="s360x-dev-topics">
              {subject.topics.map((row) => (
                <div
                  key={row.name}
                  className={topic?.name === row.name ? 'is-on' : undefined}
                  onMouseEnter={(e) => openTip(row.name, e.currentTarget)}
                  onMouseLeave={hideTip}
                >
                  <strong>{row.name}</strong>
                  <b>{row.mastery_rate == null ? '—' : `%${fmt(row.mastery_rate, 0)}`}</b>
                  <span>{row.outcomes.length} kazanım · {row.question_count} soru</span>
                  <i>
                    <em style={{ width: `${Math.max(6, row.mastery_rate ?? 0)}%` }} />
                  </i>
                </div>
              ))}
              {topic && hoverEl && (
                <TopicHoverTip
                  anchor={hoverEl}
                  topicKey={topic.name}
                  onEnter={keepTip}
                  onLeave={hideTip}
                >
                  <header>
                    <strong>{topic.name}</strong>
                    <p>
                      {topic.mastery_rate == null ? '—' : `%${fmt(topic.mastery_rate, 0)}`}
                      {' · '}
                      {topic.outcomes.length} kazanım
                      {' · '}
                      {topic.question_count} soru
                    </p>
                    <div className="s360x-topic-tip-dyb">
                      <span data-k="d">D {topic.correct}</span>
                      <span data-k="y">Y {topic.wrong}</span>
                      <span data-k="b">B {topic.empty}</span>
                    </div>
                    <div className="s360x-topic-tip-chart">
                      <em>Konu trendi</em>
                      <Sparkline values={topicRates(subject, topic.name)} color="#0f6cbd" width={380} height={40} />
                    </div>
                  </header>
                  {topicOutcomes.length === 0 ? (
                    <p className="s360x-topic-tip-empty">Bu konuda kazanım kırılımı yok.</p>
                  ) : (
                    <ul>
                      {topicOutcomes.map((out) => (
                        <li key={out.name}>
                          <div>
                            <b>{out.name}</b>
                            <span>
                              <em data-tone={toneOf((out.mastery_rate ?? 0) - 50)}>
                                {out.mastery_rate == null ? '—' : `%${fmt(out.mastery_rate, 0)}`}
                              </em>
                              {` · ${out.correct}/${out.question_count} soru`}
                              {out.development_status
                                ? ` · ${DEV_STATUS[out.development_status] || out.development_status}`
                                : ''}
                            </span>
                          </div>
                          <Sparkline
                            values={out.series.map((p) => p.mastery_rate)}
                            color="#0f6cbd"
                            width={360}
                            height={24}
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                </TopicHoverTip>
              )}
            </div>
          )}
        </div>
      )}
    </article>
  );
}

function leafDevelopmentSubjects(subjects: DevelopmentSubject[], alan?: string | null) {
  const keys = new Set(subjects.map((row) => sectionKey(row.name)));
  const parents = [
    { parent: 'fen', kids: ['fizik', 'kimya', 'biyoloji'] },
    { parent: 'sosyal', kids: ['tarih', 'cografya', 'felsefe', 'dkab', 'felsefesecmeli'] },
    { parent: 'temelmatematik', kids: ['matematik', 'geometri'] },
  ];
  return subjects
    .filter((row) => {
      if (!trackAllowed(row.name, alan)) return false;
      const rule = parents.find((item) => item.parent === sectionKey(row.name));
      return !rule || !rule.kids.some((kid) => keys.has(kid));
    })
    .sort((a, b) => {
      const ia = DERS_ORDER.indexOf(sectionKey(a.name));
      const ib = DERS_ORDER.indexOf(sectionKey(b.name));
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.name.localeCompare(b.name, 'tr');
    });
}

function riskTone(score: number) {
  if (score >= 75) return 'low';
  if (score >= 50) return 'mid';
  return 'ok';
}

function PriorityRow({ row }: { row: DevelopmentPriority }) {
  const score = row.priority_score;
  const correct = row.correct ?? Math.round(((row.mastery_rate ?? 0) / 100) * row.question_count);
  return (
    <tr>
      <td><b>{shortSubject(row.subject)}</b></td>
      <td>{row.topic || '—'}</td>
      <td className="s360x-prio-outcome">{row.outcome}</td>
      <td>{correct}/{row.question_count}</td>
      <td>
        <span data-tone={successTone(row.mastery_rate ?? 0)}>
          {row.mastery_rate == null ? '—' : `%${fmt(row.mastery_rate, 0)}`}
        </span>
      </td>
      <td>
        <div className="s360x-prio-risk" data-tone={riskTone(score)}>
          <i><em style={{ width: `${Math.max(8, Math.min(100, score))}%` }} /></i>
          <span>{fmt(score, 0)}</span>
        </div>
      </td>
    </tr>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'up' | 'down' | 'flat';
}) {
  return (
    <div className="s360x-stat">
      <span>{label}</span>
      <b>{value}</b>
      {hint && <em data-tone={tone}>{hint}</em>}
    </div>
  );
}

function toneOf(n: number | null | undefined): 'up' | 'down' | 'flat' | undefined {
  if (n == null) return undefined;
  if (n > 0) return 'up';
  if (n < 0) return 'down';
  return 'flat';
}
