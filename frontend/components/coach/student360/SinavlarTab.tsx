'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useKurum } from '@/lib/contexts/KurumContext';
import cx from './ExamCoachWorkspace.module.css';
import ExamAnalyticsWorkspace from './ExamAnalyticsWorkspace';
import analyticsStyles from './ExamAnalyticsWorkspace.module.css';
import StudentDetailModal from '@/components/olcme/analysis/StudentDetailModal';
import { analysisApi, puanAyarlariApi, studentExamApi } from '@/components/olcme/api';
import type {
  DevelopmentResponse,
  DevelopmentSubject,
  DevelopmentTypeGroup,
  StudentAnalysis,
  StudyRecommendation,
  StudentExamResponse,
  StudentExamResult,
  StudentExamSectionDetail,
} from '@/components/olcme/types';

type ExamView = 'overview' | 'mine' | 'growth';

const VIEWS: { id: ExamView; label: string }[] = [
  { id: 'overview', label: 'Genel Bakış' },
  { id: 'mine', label: 'Sınavlarım' },
  { id: 'growth', label: 'Derin Analiz' },
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
  return Number(n).toLocaleString('tr-TR', {minimumFractionDigits:d,maximumFractionDigits:d});
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
  if (t === 'TYT_11') return '11 TYT';
  if (t === 'YKS_AYT') return 'AYT';
  if (t === 'AYT_11') return '11 AYT';
  if (t === 'DENEME') return 'Deneme';
  if (t === 'LGS') return 'LGS';
  if (t === 'LGS_7') return 'LGS 7';
  return display || t;
}

function examGroup(type: string): DevelopmentTypeGroup {
  if (type === 'YKS_TYT') return 'TYT';
  if (type === 'TYT_11') return 'TYT_11';
  if (type === 'YKS_AYT') return 'AYT';
  if (type === 'AYT_11') return 'AYT_11';
  if (type === 'LGS') return 'LGS';
  if (type === 'LGS_7') return 'LGS_7';
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
      turkdili: 'edebiyat',
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
      matematik2: 'matematik',
      mat2: 'matematik',
      yabancidil: 'ingilizce',
      inkilaptarihi: 'inkilap',
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
  alan = exam.alan ?? alan;
  if (exam.exam_type !== 'YKS_AYT') {
    return mainSections(exam).filter((s) => trackAllowed(s.section_name, alan));
  }
  const all = [...mainSections(exam), ...subSections(exam)];
  const leaves = all.filter(row=>{
    const kids=all.filter(s=>s.parent_section_id===row.section_id);
    return !kids.length || kids.reduce((sum,s)=>sum+s.question_count,0)<row.question_count;
  });
  return leaves.filter(s=>(s.alana_dahil ?? aytSectionAllowed(s.section_name,alan)) && (trackAllowed(s.section_name,alan)||s.correct+s.wrong>0));
}

const FEN_CHILDREN = new Set(['fizik', 'kimya', 'biyoloji']);
const SOS_CHILDREN = new Set(['tarih', 'cografya', 'felsefe', 'dkab', 'felsefesecmeli']);
const MAT_CHILDREN = new Set(['matematik', 'geometri']);

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
  alan = exam.alan ?? alan;
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
  alan = exam.alan ?? alan;
  if (['YKS_AYT','AYT_11'].includes(exam.exam_type) && exam.puan_turleri) {
    const key = exam.alan_puan_turu || (normalizeAlan(alan) === 'ESIT_AGIRLIK' ? 'EA' : normalizeAlan(alan) === 'SOZEL' ? 'SOZ' : 'SAY');
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
    puan: exam.puan ?? 0,
    kind: null as string | null,
  };
}

function signed(n: number | null | undefined) {
  if (n == null) return '—';
  const abs = fmt(Math.abs(n),2);
  return n > 0 ? `+${abs}` : n < 0 ? `−${abs}` : '0.0';
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

interface SinavlarTabProps { studentId: number; refreshKey?: number }

export default function SinavlarTab({ studentId, refreshKey = 0 }: SinavlarTabProps) {
  const { activeKurum, activeSube, activeEgitimYili } = useKurum();
  const scopeKey = `${studentId}:${activeKurum?.id}:${activeSube?.id}:${activeEgitimYili?.id}`;
  const [data, setData] = useState<StudentExamResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [view, setView] = useState<ExamView>('overview');
  const [analysisExam, setAnalysisExam] = useState<StudentExamResult | null>(null);
  const [rankingYear, setRankingYear] = useState<number>();
  const [rankingYears, setRankingYears] = useState<number[]>([]);
  const [reload, setReload] = useState(0);
  const [updated, setUpdated] = useState('');
  const [loadedScope,setLoadedScope]=useState('');
  const [loadedYear,setLoadedYear]=useState<number>();
  const [needScores,setNeedScores]=useState(false);
  const wantScores=view==='mine'||needScores;
  const loadedRequest=useRef({key:'',full:false});
  const [scoresLoading,setScoresLoading]=useState(false);
  const [pdfBusy, setPdfBusy] = useState<number | null>(null);
  const [karne, setKarne] = useState<{exam: StudentExamResult; student: StudentAnalysis} | null>(null);
  useEffect(() => {
    let live = true;
    setRankingYear(undefined); setData(null); setKarne(null); setAnalysisExam(null); setNeedScores(false); setLoading(true);
    puanAyarlariApi.get().then(p => { if (live) { setRankingYears(p.managed_years); setRankingYear(p.default_puan_yili); } })
      .catch(() => { if (live) { setRankingYears([2024, 2025, 2026]); setRankingYear(2026); } });
    try { const saved = sessionStorage.getItem(`exam-view:${scopeKey}`); if (VIEWS.some(v => v.id === saved)) setView(saved as ExamView); } catch { /* storage unavailable */ }
    return () => { live = false; };
  }, [scopeKey]);
  useEffect(() => {
    let live = true;
    if (!rankingYear) return;
    const requestKey=`${scopeKey}:${rankingYear}:${reload}:${refreshKey}`;
    if(loadedRequest.current.key===requestKey && loadedRequest.current.full && !wantScores)return;
    const controller = new AbortController();
    const enriching=loadedRequest.current.key===requestKey;
    if(!enriching){setLoading(true);if(!loadedRequest.current.key.startsWith(`${scopeKey}:${rankingYear}:`))setData(null);setKarne(null);}
    setScoresLoading(wantScores);setError('');
    studentExamApi.results(studentId, undefined, rankingYear, controller.signal, !wantScores).then(p => { if (live) { loadedRequest.current={key:requestKey,full:wantScores};setData(p); setLoadedScope(scopeKey); setLoadedYear(rankingYear); setUpdated(new Date().toLocaleTimeString('tr-TR', {hour:'2-digit', minute:'2-digit'})); } })
      .catch(e => { if (live) setError(e instanceof Error ? e.message : 'Sınav verileri yüklenemedi.'); })
      .finally(() => { if (live) {setLoading(false);setScoresLoading(false);} });
    return () => { live = false; controller.abort(); };
  }, [scopeKey, studentId, rankingYear, reload, refreshKey, wantScores]);
  const openKarne = (exam: StudentExamResult) => {
    if (!exam.answer_id || !data) return;
    setKarne({exam, student: toKarneStudent(exam, studentId, data.student_name, exam.answer_id)});
  };
  const download = async (exam: StudentExamResult) => {
    if (!exam.answer_id) return;
    setPdfBusy(exam.exam_id);
    try { await analysisApi.downloadKarnePdf(exam.exam_id, exam.answer_id, rankingYear); }
    catch (e) { setError(e instanceof Error ? e.message : 'PDF indirilemedi.'); }
    finally { setPdfBusy(null); }
  };
  const selectView=(next:ExamView)=>{setView(next);try{sessionStorage.setItem(`exam-view:${scopeKey}`,next);}catch{/* storage unavailable */}};
  return <div className={`s360x ${view==='mine'?cx.workspace:analyticsStyles.shell}`}>
    <header className={cx.header}>
      <div><span className={cx.eyebrow}>SINAV ANALİZ MERKEZİ</span><h2>{view==='mine'?'Sınavlarım':'Sınav analizi'}</h2><p>{activeEgitimYili ? `${activeEgitimYili.baslangic_yil}–${activeEgitimYili.bitis_yil} eğitim yılı` : 'Seçili eğitim yılı'} · {updated ? `${updated} güncellendi` : 'Sonuç ve kazanım takibi'}</p></div>
      <div className={cx.headerActions}>{(view==='mine'||needScores)&&<label>Puan referansı<select aria-label="Puan referans yılı" value={rankingYear ?? ''} onChange={e => setRankingYear(Number(e.target.value))}>{rankingYears.map(y => <option key={y} value={y}>{y}</option>)}</select></label>}<button type="button" aria-label="Sınav sonuçlarını yenile" onClick={() => setReload(n => n+1)} disabled={loading}>Yenile</button></div>
    </header>
    <nav className={cx.tabs} aria-label="Sınav görünümleri">{VIEWS.map(v => <button type="button" key={v.id} aria-pressed={view===v.id} onClick={() => selectView(v.id)}>{v.label}</button>)}</nav>
    {loading&&data&&<p className={cx.hint} role="status">Güncel sınav sonuçları alınıyor; mevcut kapsam korunuyor.</p>}
    {scoresLoading&&!loading&&<p className={cx.hint} role="status">Puan ve sıralamalar yükleniyor; çalışma gündemi hazır.</p>}
    {error && <div role="alert" className={cx.error}>{error} <button type="button" onClick={() => setReload(n=>n+1)}>Tekrar dene</button></div>}
    {(loading && !data) || (!!data && (loadedScope!==scopeKey || loadedYear!==rankingYear)) ? <div className={cx.loading} role="status">Sınavlar ve çalışma kapsamı hazırlanıyor…</div> : data?.exams.length ? (view !== 'mine' ? <ExamAnalyticsWorkspace rankingYear={rankingYear} onRequestScores={()=>setNeedScores(true)} initialExam={analysisExam} key={`${scopeKey}:${analysisExam?.exam_id || 0}`} studentId={studentId} exams={data.exams} view={view} refreshKey={reload+refreshKey} onViewChange={selectView} onOpen={openKarne}/> : <CoachExamWorkspace onRequestScores={()=>setNeedScores(true)} onShowAgenda={exam=>{setAnalysisExam(exam || null);selectView('growth');}} key={scopeKey} studentId={studentId} exams={data.exams} view={view} scopeKey={scopeKey} refreshKey={reload+refreshKey} onOpen={openKarne} onDownload={download} pdfBusy={pdfBusy} />) : !error && <div className={cx.empty}>Seçili eğitim yılında tamamlanmış sınav sonucu bulunmuyor.</div>}
    {karne && loadedScope===scopeKey && loadedYear===rankingYear && <StudentDetailModal student={karne.student} examId={karne.exam.exam_id} examType={karne.exam.exam_type} rankingYear={rankingYear} onClose={() => setKarne(null)} />}
  </div>;
}

const STUDY_STATUS: Record<string,string> = {new:'Yeni', reviewed:'İncelendi', planned:'Plana alındı', assigned:'Ödev oluşturuldu', waiting_measurement:'Tekrar ölçüm bekleniyor', deferred:'Ertelendi', dismissed:'Uygun bulunmadı'};
const STUDY_CONF: Record<string,string> = {insufficient:'İlk kontrol · az veri', low:'Sınırlı kanıt', medium:'Orta düzey kanıt', high:'Daha fazla soru kanıtı'};

function CoachExamWorkspace({studentId, exams, view, scopeKey, refreshKey, onOpen, onDownload, pdfBusy, onShowAgenda, onRequestScores}: {
  onRequestScores:()=>void; onShowAgenda:(exam?:StudentExamResult)=>void; studentId:number; exams:StudentExamResult[]; view:ExamView; scopeKey:string; refreshKey:number;
  onOpen:(e:StudentExamResult)=>void; onDownload:(e:StudentExamResult)=>Promise<void>; pdfBusy:number|null;
}) {
  const router = useRouter();
  const types = Array.from(new Set(exams.map(e=>e.exam_type)));
  const [type, setType] = useState(exams[exams.length-1].exam_type);
  const [windowPick,setWindowPick] = useState('5');
  const [custom,setCustom] = useState<number[]>([]);
  const [ready,setReady] = useState(false);
  const [mineSort,setMineSort]=useState('date-desc');
  const [search,setSearch] = useState('');
  const [subjectPick,setSubjectPick] = useState('all');
  const [kind,setKind] = useState('all');
  const [showHandled,setShowHandled] = useState(false);
  const [data,setData] = useState<DevelopmentResponse|null>(null);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState('');
  const [generation,setGeneration] = useState(0);
  const [busy,setBusy] = useState<string|null>(null);
  const [expanded,setExpanded] = useState<number|null>(null);
  const [openSubject,setOpenSubject] = useState<string|null>(null);
  const [notes,setNotes] = useState<Record<string,string>>({});
  useEffect(() => {
    try { const saved = JSON.parse(sessionStorage.getItem(`exam-filter:${scopeKey}`) || 'null'); if (saved) { if(types.includes(saved.type)) setType(saved.type); if(['1','3','5','10','all','custom'].includes(saved.window)) setWindowPick(saved.window); if(['date-desc','date-asc','net-desc','net-asc'].includes(saved.sort)) setMineSort(saved.sort); if(Array.isArray(saved.custom)) setCustom(saved.custom.filter((id:unknown)=> typeof id==='number')); } } catch { /* storage unavailable */ }
    setReady(true);
  // Filter is restored once for this mounted student/context.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey]);
  useEffect(() => { if(ready) try { sessionStorage.setItem(`exam-filter:${scopeKey}`,JSON.stringify({type,window:windowPick,custom,sort:mineSort})); } catch { /* storage unavailable */ } }, [ready,scopeKey,type,windowPick,custom,mineSort]);
  const typed = useMemo(()=>exams.filter(e=>e.exam_type===type),[exams,type]);
  const selected = useMemo(()=> windowPick==='custom' ? typed.filter(e=>custom.includes(e.exam_id)) : windowPick==='all' ? typed : typed.slice(-Number(windowPick)),[typed,windowPick,custom]);
  const sortedSelected=[...selected].sort((a,b)=>mineSort==='net-desc'?b.total_net-a.total_net:mineSort==='net-asc'?a.total_net-b.total_net:mineSort==='date-asc'?selected.indexOf(a)-selected.indexOf(b):selected.indexOf(b)-selected.indexOf(a));
  const selectionKey = selected.map(e=>e.exam_id).join(',');
  useEffect(()=>{
    let live=true;
    if(!ready) return;
    setError('');setData(null);
    if(!selected.length) { setLoading(false); return; }
    setLoading(true);
    const controller=new AbortController();
    studentExamApi.development(studentId,{examType:examGroup(type),window:'custom',examIds:selected.map(e=>e.exam_id)},controller.signal)
      .then(p=>{if(live)setData(p);}).catch(e=>{if(live)setError(e instanceof Error?e.message:'Analiz yüklenemedi.');})
      .finally(()=>{if(live)setLoading(false);});
    return ()=>{live=false;controller.abort();};
  // selectionKey contains the complete requested exam identity list.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[ready,studentId,type,selectionKey,generation,refreshKey]);
  const items=data?.agenda?.items ?? [];
  const subjectNames=Array.from(new Set(items.map(r=>r.subject))).sort((a,b)=>a.localeCompare(b,'tr'));
  const filtered=items.filter(r=>(showHandled || !['deferred','dismissed'].includes(r.status)) && (subjectPick==='all'||r.subject===subjectPick) && (kind==='all'||r.kind===kind) && foldTr(`${r.subject} ${r.topic} ${r.name}`).includes(foldTr(search)));
  const subjects=data?.subjects ?? [];
  const orderedSubjects=[...subjects].sort((a,b)=>(items.filter(i=>i.subject===b.name).length-items.filter(i=>i.subject===a.name).length) || (a.average_performance_rate??100)-(b.average_performance_rate??100));
  const first=selected[0],last=selected[selected.length-1];
  const source = exams.find(e=>e.exam_id===data?.agenda?.source_exam_id);
  const active=items.filter(r=>!['deferred','dismissed'].includes(r.status));
  const action=async(row:StudyRecommendation,status:string,toAssignment=false)=>{
    if(!data)return;setBusy(row.key);setError('');
    try {
      const result=await studentExamApi.studyAction(studentId,{key:row.key,revision:row.revision,status,note:notes[row.key]??row.note,filters:data.filters});
      if(toAssignment){
        if(result.assignment_id){router.push(`/coach/odev/kontrol/${result.assignment_id}`);return;}
        const back=`/coach/ogrenciler/${studentId}?tab=sinavlar`;
        router.push(`/coach/odev/ver?student=${studentId}&locked=1&exam_action=${result.id}&return=${encodeURIComponent(back)}`);
      } else setGeneration(n=>n+1);
    } catch(e){setError(e instanceof Error?e.message:'Karar kaydedilemedi.');}
    finally{setBusy(null);}
  };
  return <>
    <div className={cx.filters}>
      <label>Sınav türü<select value={type} onChange={e=>{setType(e.target.value);setCustom([]);setSubjectPick('all');setOpenSubject(null);}}>{types.map(t=><option key={t} value={t}>{typeShort(t)}</option>)}</select></label>
      <label>İnceleme aralığı<select value={windowPick} onChange={e=>setWindowPick(e.target.value)}><option value="1">Son sınav</option><option value="3">Son 3 sınav</option><option value="5">Son 5 sınav</option><option value="10">Son 10 sınav</option><option value="all">Bu dönemin tamamı</option><option value="custom">Sınavları kendim seçeyim</option></select></label>
      {view==='mine'&&<label>Sıralama<select value={mineSort} onChange={e=>setMineSort(e.target.value)}><option value="date-desc">Tarih · yeni önce</option><option value="date-asc">Tarih · eski önce</option><option value="net-asc">Net · düşük önce</option><option value="net-desc">Net · yüksek önce</option></select></label>}
      <p>{selected.length} sınav · {fmtDate(first?.exam_date)} – {fmtDate(last?.exam_date)}{type==='YKS_AYT'?' · alan neti':type==='AYT_11'?' · toplam net; çalışma önerileri seçili puan alanında':''}</p>
    </div>
    {windowPick==='custom'&&<fieldset className={cx.picks}><legend>Analize katılacak sınavlar</legend>{typed.map(e=><label key={e.exam_id}><input type="checkbox" checked={custom.includes(e.exam_id)} onChange={()=>setCustom(c=>c.includes(e.exam_id)?c.filter(x=>x!==e.exam_id):[...c,e.exam_id])}/>{e.exam_name} <small>{fmtDate(e.exam_date)}</small></label>)}</fieldset>}
    {error&&<div role="alert" className={cx.error}>{error} <button type="button" onClick={()=>setGeneration(n=>n+1)}>Tekrar dene</button></div>}
    {loading?<div role="status" className={cx.loading}>Kazanımlar ve öncelikler inceleniyor…</div>:!selected.length?<div className={cx.empty}>Analiz için en az bir sınav seçin.</div>:<>
      {view==='mine'?<><p className={cx.hint}>Bir sınavın çalışma önerilerini görmek için kartın altındaki “Önerileri incele” düğmesini kullanın.</p><ExamList exams={sortedSelected} alan={undefined} expanded={expanded} pdfBusy={pdfBusy} onToggle={id=>setExpanded(c=>c===id?null:id)} onAnalyze={e=>{setCustom([e.exam_id]);setWindowPick('custom');onShowAgenda(e);}} onOpenKarne={onOpen} onDownloadKarne={e=>void onDownload(e)}/></>:<>
        <div className={cx.stats}>
          <div><span>Çalışma başlığı</span><b>{active.length}</b><small>{new Set(active.map(r=>r.subject)).size} derste</small></div>
          <div data-tone="danger"><span>Tekrarlayan kayıp</span><b>{active.filter(r=>r.kind==='recurring').length}</b><small>En az iki ölçümde</small></div>
          <div><span>Yeniden kontrol</span><b>{active.filter(r=>r.kind==='recheck').length}</b><small>Son sınavda ölçülmedi</small></div>
          <div data-tone="good"><span>Ödeve bağlanan</span><b>{items.filter(r=>r.assignment_id).length}</b><small>Tamamlanması öğrenme kanıtı değildir</small></div>
        </div>
        <section className={cx.agenda}>
          <header><div><span className={cx.eyebrow}>KOÇUN ÇALIŞMA GÜNDEMİ</span><h3>{view==='overview'?'Önce bu konulara bakın':'Tüm çalışma öncelikleri'}</h3><p>{source?.exam_name} · {fmtDate(source?.exam_date)}{source?` · ${fmt(source.total_net,2)} ${source.exam_type==='YKS_AYT'?'alan neti':'net'}${source.puan==null?'':` · ${fmtPuan(source.puan)} puan`}`:''}{data?.agenda?` · ${data.agenda.mapped_questions}/${data.agenda.total_questions} soru kazanımla eşleşmiş`:''}</p></div>{source&&<button type="button" onClick={()=>onOpen(source)}>Kaynak karne</button>}</header>
          <div className={cx.search}><input aria-label="Konu veya kazanım ara" placeholder="Ders, konu veya kazanım ara…" value={search} onChange={e=>setSearch(e.target.value)}/><select aria-label="Ders filtresi" value={subjectPick} onChange={e=>setSubjectPick(e.target.value)}><option value="all">Bütün dersler</option>{subjectNames.map(s=><option key={s}>{s}</option>)}</select><select aria-label="Öneri türü" value={kind} onChange={e=>setKind(e.target.value)}><option value="all">Bütün eksikler</option><option value="recurring">Tekrarlayan kayıplar</option><option value="current">Son sınav kayıpları</option><option value="recheck">Yeniden ölçülecekler</option><option value="academic">Genel akademik takip</option></select><label><input type="checkbox" checked={showHandled} onChange={e=>setShowHandled(e.target.checked)}/>Ertelenen / uygun bulunmayan</label></div>
          {!filtered.length?<div className={cx.empty}>{items.length?'Bu filtreye uyan çalışma başlığı yok.':data?.agenda?.mapped_questions?'Bu ölçümlerde öncelikli kayıp bulunmadı. Güçlü kazanımları korumaya devam edin.':'Kazanım eşlemesi bulunmuyor. Ders sonuçları üzerinden kontrol yapın; eksik eşleme öğrenme eksikliği değildir.'}</div>:<div className={cx.agendaGrid}>{(view==='overview'&&!search&&subjectPick==='all'&&kind==='all'?filtered.slice(0,3):filtered).map(row=><article className={cx.recommendation} key={row.key} data-kind={row.kind}>
            <div className={cx.cardTop}><span>{row.subject}</span><em>{row.kind==='recurring'?'Tekrarlayan kayıp':row.kind==='recheck'?'Yeniden kontrol':row.kind==='academic'?'Genel akademik takip':'Son sınav kaybı'}</em></div>
            <h4>{row.name}</h4><p>{row.topic!==row.name?row.topic:''}</p>
            <div className={cx.evidence}><b>{row.wrong} yanlış · {row.empty} boş</b><span>{row.correct}/{row.question_count} doğru · {row.exam_count} ölçüm</span>{row.gain!=null&&<strong>≈ +{fmt(row.gain,2)} net potansiyeli</strong>}</div>
            <p>{row.reason}</p><small>{STUDY_CONF[row.confidence]||row.confidence} · {row.missed_exam_count} ölçümde kayıp</small>
            <div className={cx.state}>{row.stale?'Veri güncellendi · yeniden inceleyin':STUDY_STATUS[row.status]||row.status}{row.assignment_active===false?' · bağlı ödev pasif':''}</div>
            <details><summary>Kanıtı ve koç notunu aç</summary><ul>{row.evidence.map((point,i)=><li key={`${point.exam_id}:${i}`}>{point.exam_name} · {fmtDate(point.exam_date)}: {point.correct}/{point.question_count} doğru, {point.wrong} yanlış, {point.empty} boş</li>)}</ul>{row.questions.length>0&&<p>Kitapçık soru numaraları: {row.questions.filter(q=>q.result==='wrong'||q.result==='empty').map(q=>q.n).join(', ')}</p>}<label>Koç notu<textarea maxLength={3000} value={notes[row.key]??row.note} onChange={e=>setNotes(n=>({...n,[row.key]:e.target.value}))} placeholder="Öğrenciyle birlikte nedenini değerlendirin; sonucu tek başına dikkatsizlik saymayın."/></label></details>
            <div className={cx.actions}>{row.assignment_id?<a href={`/coach/odev/kontrol/${row.assignment_id}`}>Bağlı ödevi aç</a>:<><button type="button" disabled={busy!==null} onClick={()=>void action(row,'planned',true)}>Ödeve dönüştür</button><button type="button" disabled={busy!==null} onClick={()=>void action(row,'planned')}>Plana al</button></>}<button type="button" disabled={busy!==null} onClick={()=>void action(row,'reviewed')}>İncelendi / notu kaydet</button>{!row.assignment_id&&<><button type="button" disabled={busy!==null} onClick={()=>void action(row,'deferred')}>Ertele</button><button type="button" disabled={busy!==null} onClick={()=>void action(row,'dismissed')}>Uygun değil</button></>}</div>
          </article>)}</div>}
          {view==='overview'&&filtered.length>3&&!search&&subjectPick==='all'&&kind==='all'&&<p className={cx.hint}>İlk 3 başlık gösteriliyor. Bütün {filtered.length} başlığı görmek için Gelişim görünümüne geçin veya arama yapın.</p>}
          <p className={cx.hint}>Net potansiyeli son sınavın yanlış düzeltmesine göre hesaplanır; kazanım garantisi değildir. Tek ölçüm tekrarlayan eksik kanıtı sayılmaz.</p>
        </section>
        {!!data?.agenda?.followups?.length&&<section className={cx.followups}><h3>Önceki çalışma kararlarının takibi</h3>{data.agenda.followups.map(f=><div key={f.id}><b>{f.subject} · {f.name}</b><span>{f.before} → {f.after??'Henüz yeniden ölçülmedi'}</span><small>{f.status}</small>{f.assignment_id&&<a href={`/coach/odev/kontrol/${f.assignment_id}`}>Ödev</a>}</div>)}</section>}
        <section><h3 className={cx.sectionTitle}>Ders ders kanıt <small>{subjects.length} ders · farklar yüzde puan</small></h3>{selected.length<2&&<p className={cx.hint}>Tek sınav var. Gelişim yönü yerine mevcut sonuç ve kontrol ihtiyacı gösterilir.</p>}<div className="s360x-dev-grid">{orderedSubjects.map(s=><DevelopmentCard key={s.name} subject={s} open={openSubject===s.name} onToggle={()=>setOpenSubject(c=>c===s.name?null:s.name)}/>)}</div></section>
        {view==='overview'&&<details className={cx.history} onToggle={e=>{if(e.currentTarget.open)onRequestScores();}}><summary>Net / puan geçmişini ve sınav tablosunu aç</summary><MultiTrendCard exams={selected} alan={last?.alan}/></details>}
      </>}
    </>}
  </>;
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
              aria-label={metric==='net'?'Net trendi':'Puan trendi'}
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
  onAnalyze,
}: {
  exams: StudentExamResult[];
  alan?: string | null;
  expanded: number | null;
  pdfBusy: number | null;
  onToggle: (id: number) => void;
  onOpenKarne: (exam: StudentExamResult) => void;
  onDownloadKarne: (exam: StudentExamResult) => void;
  onAnalyze?: (exam: StudentExamResult) => void;
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
          onAnalyze={onAnalyze}
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
  onAnalyze,
}: {
  exam: StudentExamResult;
  alan?: string | null;
  open: boolean;
  pdfBusy: boolean;
  onToggle: (id: number) => void;
  onOpenKarne: (exam: StudentExamResult) => void;
  onDownloadKarne: (exam: StudentExamResult) => void;
  onAnalyze?: (exam: StudentExamResult) => void;
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
          <span><small>{exam.exam_type==='YKS_AYT'?'Alan neti':'Toplam net'}</small><strong>{fmt(exam.total_net,2)}</strong></span>
          <span><small>Puan</small><strong>{fmtPuan(exam.puan)}</strong></span>
          <span><small>Tahmini sıra</small><strong>{fmtRank(rank.rank)}</strong></span>
        </div>
      </button>
      <div className="s360x-exam-foot">
        <div className="s360x-exam-rankline">
          <span>Kurum {exam.kurum_ici_sira > 0 ? `${exam.kurum_ici_sira}/${exam.toplam_ogrenci}` : '—'}</span>
          <span>{rank.pct == null ? 'Ulusal tahmin bu türde yok' : `Adayların %${fmt(rank.pct)} önünde`}</span>
          {rank.kind ? <span>{rank.kind}</span> : null}
        </div>
        <div className="s360x-karne-btns">
          {onAnalyze && <button type="button" onClick={()=>onAnalyze(exam)}>Önerileri incele</button>}
          <button type="button" onClick={()=>onOpenKarne(exam)}>Karne</button>
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

function statusTone(status?: string | null): 'up' | 'down' | 'flat' | undefined {
  if (!status) return undefined;
  if (status.includes('improving') || status === 'yeni_olculdu') return 'up';
  if (status.includes('declining')) return 'down';
  if (status === 'insufficient_data') return undefined;
  return 'flat';
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
  const min = Math.min(0, ...nums);
  const max = Math.max(100, ...nums);
  const span = max - min || 1;
  const pts = values.map((v,i)=>{
    if(v==null)return null;
    return [(i/(values.length-1))*width, height-3-((v-min)/span)*(height-6)];
  });
  let path='';
  pts.forEach((p,i)=>{if(p) path+=`${!pts[i-1]?'M':'L'}${p[0]},${p[1]} `;});
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="s360x-spark" aria-hidden>
      <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
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
      const maxHeight = Math.max(80, Math.min(window.innerHeight - pad*2, (placeBelow ? spaceBelow : spaceAbove) - gap));
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
      role="dialog" aria-label="Kazanım detayı" tabIndex={0}
      onKeyDown={e=>{if(e.key==='Escape'){anchor.focus();onLeave();}}}
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
      <button type="button" onClick={()=>{anchor.focus();onLeave();}} aria-label="Kazanım detayını kapat">Kapat</button>
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
        <Sparkline values={subject.series.map((p) => p.performance_rate)} />
        <div className="s360x-dev-nets">
          <b>{subject.last_net == null ? '—' : fmt(subject.last_net,2)} net</b>
          <span data-tone={toneOf(subject.rates.first_last_change)}>{signed(subject.rates.first_last_change)} yp</span>
        </div>
      </button>
      <div className="s360x-dev-metrics">
        <span>Ort. net {subject.average_net == null ? '—' : fmt(subject.average_net)}</span>
        <span>Ort. başarı: {subject.performance_level ? DEV_LEVEL[subject.performance_level] : '—'}</span>
        <span>{subject.exam_count} ölçüm · ilk sınava göre yüzde puan</span>
      </div>
      {subject.score_included===false && <p className="s360x-dev-narr">Seçili puana girmez · genel ders takibi.</p>}
      {subject.incomplete_breakdown && <p className="s360x-dev-narr">Üst toplam · bazı alt derslerin kırılımı eksik.</p>}
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
                  role="button" tabIndex={0} aria-label={`${row.name} kazanımlarını aç`}
                  onClick={(e) => openTip(row.name, e.currentTarget)}
                  onKeyDown={(e) => { if(e.key==='Enter'||e.key===' ') {e.preventDefault();openTip(row.name,e.currentTarget);requestAnimationFrame(()=>document.querySelector<HTMLElement>('.s360x-topic-tip')?.focus({preventScroll:true}));} if(e.key==='Escape'){setHoverTopic(null);setHoverEl(null);} }}
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

function toneOf(n: number | null | undefined): 'up' | 'down' | 'flat' | undefined {
  if (n == null) return undefined;
  if (n > 0) return 'up';
  if (n < 0) return 'down';
  return 'flat';
}
