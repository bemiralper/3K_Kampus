'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Area, AreaChart, Bar, BarChart, Brush, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowDownRight, ArrowLeft, ArrowRight, ArrowUpRight, ChartNoAxesCombined, ChevronRight, Filter, Search, SlidersHorizontal, X } from 'lucide-react';
import { studentExamApi } from '@/components/olcme/api';
import type { DevelopmentOutcome, DevelopmentResponse, StudentExamResult } from '@/components/olcme/types';
import { buildLossTopics, chronologicalExams, coverage, evidenceSummary, examTypeGroup, examTypeLabel, groupOutcomes, lossStateLabels, numberLabel as n, sortTopics, type TopicSort } from './examAnalyticsModel';
import { CoveragePanel, ExamCompare, ExamContext, PeriodPanel } from './ExamAnalyticsPanels';
import s from './ExamAnalyticsWorkspace.module.css';

type Props = {
  rankingYear?: number;
  onRequestScores: () => void;
  initialExam?: StudentExamResult | null;
  studentId: number;
  exams: StudentExamResult[];
  view: 'overview' | 'growth';
  refreshKey: number;
  onViewChange: (view: 'overview' | 'growth') => void;
  onOpen: (exam: StudentExamResult) => void;
};
const palette = ['#6258e8', '#16a394', '#ea8593', '#ce9e4b'];
const dateLabel = (date?: string | null) => date ? new Date(`${date}T12:00:00`).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }) : 'Tarihsiz';
const metricNames: Record<string, string> = { net: 'Net', rate: 'Kayıp %', puan: 'Puan', rank: 'Kurum sırası', percentile: 'Yüzdelik' };

export default function ExamAnalyticsWorkspace({ rankingYear, onRequestScores, initialExam, studentId, exams, view, refreshKey, onViewChange, onOpen }: Props) {
  const types = useMemo(() => Array.from(new Set(exams.map(exam => exam.exam_type))), [exams]);
  const [type, setType] = useState(() => initialExam?.exam_type || exams.slice().sort((a,b) => (a.exam_date || '').localeCompare(b.exam_date || '')).at(-1)?.exam_type || types[0]);
  const [window, setWindow] = useState(initialExam ? 'custom' : '5');
  const [customIds, setCustomIds] = useState<number[]>(initialExam ? [initialExam.exam_id] : []);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [topicKey, setTopicKey] = useState('');
  const [topicFocused,setTopicFocused]=useState(false);
  const [topicLimit,setTopicLimit]=useState(6);
  const detailRef=useRef<HTMLDivElement>(null);
  const listRef=useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<TopicSort>('loss');
  const [stateFilter, setStateFilter] = useState('all');
  const [metric, setMetric] = useState('net');
  const [compareSubjects, setCompareSubjects] = useState<string[]>([]);
  const [rangeIds, setRangeIds] = useState<number[]>([]);
  const [focusExam, setFocusExam] = useState<number | null>(null);
  const [dialog, setDialog] = useState<'exam' | 'compare' | 'coverage' | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [chartOptions, setChartOptions] = useState(false);
  const [zoom, setZoom] = useState(false);
  const [data, setData] = useState<DevelopmentResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const selected = useMemo(() => chronologicalExams(exams, type, window === 'custom' ? 'all' : window, from, to).filter(exam => window !== 'custom' || customIds.includes(exam.exam_id)), [exams, type, window, from, to, customIds]);
  const ids = selected.map(exam => exam.exam_id).join(',');
  useEffect(()=>{if(topicFocused&&globalThis.matchMedia('(max-width: 650px)').matches)detailRef.current?.focus({preventScroll:true});},[topicFocused,topicKey]);
  const requestKey = `${studentId}:${type}:${ids}:${refreshKey}:${retry}`;
  const [loadedKey, setLoadedKey] = useState('');
  const visible = loadedKey === requestKey ? data : null;

  useEffect(() => { setRangeIds([]); setFocusExam(null); setDialog(null); setTopicFocused(false); }, [ids]);
  useEffect(()=>{setTopicLimit(6);setTopicFocused(false);},[subject,query,stateFilter]);
  useEffect(() => { setSubject(''); setTopicKey(''); setCompareSubjects([]); }, [type]);
  useEffect(() => {
    const controller = new AbortController(); let live = true;
    setLoading(true); setError('');
    if (!ids) { setData(null); setLoadedKey(requestKey); setLoading(false); return () => controller.abort(); }
    const timeout = setTimeout(() => {
      if (live) { controller.abort(); setError('Analiz zamanında tamamlanamadı.'); setLoading(false); }
    }, 30_000);
    studentExamApi.development(studentId, { examType: examTypeGroup(type), window: 'custom', examIds: ids.split(',').map(Number) }, controller.signal)
      .then(result => { if (live && !controller.signal.aborted) { setData(result); setLoadedKey(requestKey); } })
      .catch(() => { if (live && !controller.signal.aborted) setError('Analiz yüklenemedi.'); })
      .finally(() => { clearTimeout(timeout); if (live && !controller.signal.aborted) setLoading(false); });
    return () => { live = false; clearTimeout(timeout); controller.abort(); };
  }, [studentId, type, ids, requestKey]);

  const subjects = visible?.subjects.filter(item => item.score_included !== false) || [];
  const topics = useMemo(() => buildLossTopics(visible?.subjects || [], selected.map(exam => exam.exam_id)).filter(item => item.loss > 0), [visible, selected]);
  const lossSubjects = subjects.filter(item => item.series.some(point => point.wrong + point.empty > 0));
  const activeSubject = subjects.find(item => item.name === subject);
  const ranked = sortTopics(topics.filter(item => (!subject || item.subject === subject) && (stateFilter === 'all' || item.evidence.state === stateFilter) && `${item.subject} ${item.name}`.toLocaleLowerCase('tr-TR').includes(query.toLocaleLowerCase('tr-TR'))), sort);
  const activeTopic = ranked.find(item => item.key === topicKey) || ranked[0];
  const activeTopicSubject = subjects.find(item => item.name === activeTopic?.subject);
  const outcomes = (activeTopicSubject?.outcomes || []).filter(item => item.topic === activeTopic?.name && item.wrong + item.empty > 0).sort((a,b) => b.wrong + b.empty - a.wrong - a.empty);
  const selectedExam = selected.find(exam => exam.exam_id === focusExam);
  const scoreMetric = ['puan', 'rank', 'percentile'].includes(metric);
  const chart = selected.map(exam => {
    const point = activeSubject?.series.find(item => item.exam_id === exam.exam_id);
    const wrong = subject ? point?.wrong ?? null : exam.total_wrong;
    const empty = subject ? point?.empty ?? null : exam.total_empty;
    const q = subject ? point?.question_count : exam.total_correct + exam.total_wrong + exam.total_empty;
    const net = subject ? point?.net ?? null : exam.total_net;
    return {
      id: exam.exam_id, date: dateLabel(exam.exam_date), name: exam.exam_name, net, wrong, empty,
      value: metric === 'puan' ? exam.puan : metric === 'rank' ? exam.kurum_ici_sira > 0 ? exam.kurum_ici_sira : null : metric === 'percentile' ? exam.yuzdelik_dilim : metric === 'rate' ? q && wrong != null && empty != null ? 100 * (wrong + empty) / q : null : net,
      ...Object.fromEntries(compareSubjects.map((name,index) => {
        const p = subjects.find(item => item.name === name)?.series.find(item => item.exam_id === exam.exam_id);
        return [`compare${index}`, metric === 'rate' ? p?.question_count ? 100 * (p.wrong + p.empty) / p.question_count : null : p?.net ?? null];
      })),
    };
  });
  const nets = chart.flatMap(point => point.net == null ? [] : [point.net]);
  const latestNet = nets.at(-1);
  const average = nets.length ? nets.reduce((sum,net) => sum + net,0) / nets.length : null;
  const change = nets.length > 1 ? nets[nets.length - 1] - nets[nets.length - 2] : null;
  const lossTotal = selected.reduce((sum,exam) => sum + exam.total_wrong + exam.total_empty,0);
  const needsMapping = subjects.some(item => { const scope = coverage(item); return scope.inconsistent || scope.mapped < scope.total || item.incomplete_breakdown; });
  const drill = (name: string) => { setSubject(name); setTopicKey(''); onViewChange('growth'); };
  const selectExam = (id: number) => { setFocusExam(id); setDialog('exam'); };
  const chartClick = (event: { activeTooltipIndex?: number | string | null }) => {
    const index = Number(event?.activeTooltipIndex);
    if (event?.activeTooltipIndex != null && chart[index]) selectExam(chart[index].id);
  };

  return <div className={s.root}>
    <div className={s.toolbar}>
      <div className={s.typeTabs} aria-label="Sınav türü">{types.map(item => <button type="button" key={item} aria-pressed={type === item} onClick={() => { setType(item); if (window === 'custom') setWindow('5'); }}>{examTypeLabel(item)}</button>)}</div>
      <div className={s.tools}>
        <select aria-label="Sınav kapsamı" value={window} onChange={event => setWindow(event.target.value)}>
          {customIds.length > 0 && <option value="custom">Seçili sınavlar</option>}
          <option value="1">Son sınav</option><option value="3">Son 3 sınav</option><option value="5">Son 5 sınav</option><option value="10">Son 10 sınav</option><option value="all">Tüm sınavlar</option>
        </select>
        <button type="button" className={`${s.toolButton} ${from || to || filtersOpen ? s.toolActive : ''}`} aria-label="Analiz filtreleri" aria-expanded={filtersOpen} onClick={() => setFiltersOpen(value => !value)}><Filter size={15}/><span>Filtrele</span></button>
        <button type="button" className={s.toolButton} onClick={() => setDialog('compare')}>Karşılaştır <ArrowUpRight size={14}/></button>
      </div>
    </div>
    {filtersOpen && <div className={s.filterPanel}>
      <label>Başlangıç<input type="date" value={from} max={to || undefined} onChange={event => setFrom(event.target.value)}/></label>
      <label>Bitiş<input type="date" value={to} min={from || undefined} onChange={event => setTo(event.target.value)}/></label>
      {view === 'growth' && <><label>Sıralama<select aria-label="Konu sıralaması" value={sort} onChange={event => setSort(event.target.value as TopicSort)}><option value="loss">En çok kayıp</option><option value="priority">Öncelik</option><option value="rate">Kayıp oranı</option><option value="decline">Kötüleşme</option></select></label><label>Durum<select aria-label="Kayıp durumu" value={stateFilter} onChange={event => setStateFilter(event.target.value)}><option value="all">Tüm kayıplar</option>{Object.entries(lossStateLabels).filter(([key]) => key !== 'no_loss').map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label></>}
      {(from || to) && <button type="button" className={s.textButton} onClick={() => { setFrom(''); setTo(''); }}>Tarihleri temizle</button>}
    </div>}
    {from && to && from > to ? <div className={s.error} role="alert">Tarih aralığını kontrol edin.</div> : !selected.length ? <div className={s.empty}>Bu aralıkta sınav yok.</div> : <>
      {error && <div className={s.error} role="alert">{error}<button type="button" onClick={() => setRetry(value => value + 1)}>Yeniden dene</button></div>}
      {view === 'overview' ? <>
        <section className={s.trendPanel} aria-label="Sınav performansı">
          <div className={s.trendHead}>
            <div><span className={s.eyebrow}>{examTypeLabel(type)} PERFORMANSI</span><div className={s.heroValue}>{n(latestNet)}<span>son net</span>{change != null && change !== 0 && <small className={change < 0 ? s.negative : s.positive}>{change < 0 ? <ArrowDownRight size={15}/> : <ArrowUpRight size={15}/>} {change > 0 ? '+' : ''}{n(change)}</small>}</div></div>
            <div className={s.trendControls}><div className={s.metricSwitch} aria-label="Grafik ölçütü">{['net','rate','puan','rank','percentile'].map(value => <button type="button" key={value} aria-pressed={metric === value} onClick={() => { setMetric(value); if (['puan','rank','percentile'].includes(value)) { setSubject(''); setCompareSubjects([]); onRequestScores(); } }}>{metricNames[value]}</button>)}</div><button type="button" className={s.iconButton} aria-label="Grafik seçenekleri" aria-expanded={chartOptions} onClick={() => setChartOptions(value => !value)}><SlidersHorizontal size={17}/></button></div>
          </div>
          {chartOptions && <div className={s.chartOptions}><label><input type="checkbox" checked={zoom} onChange={event => setZoom(event.target.checked)}/>Yakın ölçek</label>{subjects.map(item => <label key={item.name}><input type="checkbox" checked={compareSubjects.includes(item.name)} disabled={scoreMetric} onChange={event => setCompareSubjects(names => event.target.checked ? [...names,item.name] : names.filter(name => name !== item.name))}/>{item.name}</label>)}</div>}
          <div className={s.mainChart}><ResponsiveContainer width="100%" height="100%"><ComposedChart data={chart} onClick={chartClick} margin={{top:15,right:8,bottom:0,left:-18}}><defs><linearGradient id={`trend-${studentId}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#7770ed" stopOpacity={0.22}/><stop offset="100%" stopColor="#7770ed" stopOpacity={0}/></linearGradient></defs><CartesianGrid vertical={false} stroke="#f0f1f6"/><XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fill:'#9a9eb2',fontSize:11}} minTickGap={24}/><YAxis axisLine={false} tickLine={false} tick={{fill:'#9a9eb2',fontSize:11}} reversed={metric === 'rank'} domain={metric === 'rate' || metric === 'percentile' ? [0,100] : metric === 'rank' ? [1,'auto'] : zoom ? ['auto','auto'] : [(minimum:number) => Math.min(0,minimum),'auto']}/><Tooltip contentStyle={{border:0,borderRadius:14,boxShadow:'0 10px 40px #1e25451a',fontSize:12}} labelFormatter={(_,payload) => payload?.[0]?.payload?.name || ''} formatter={(value,name) => [n(Number(value)),name]}/><Area type="linear" dataKey="value" name={metricNames[metric]} stroke="#6c63e8" strokeWidth={3} fill={`url(#trend-${studentId})`} dot={{r:3,fill:'#fff',strokeWidth:2}} activeDot={{r:6}} connectNulls={false}/>{compareSubjects.map((name,index) => <Line key={name} type="linear" dataKey={`compare${index}`} name={name} stroke={palette[(index + 1) % palette.length]} strokeWidth={2} dot={false} connectNulls={false}/>)}<Brush ariaLabel="Sınav aralığı; ok tuşlarıyla değiştirin" dataKey="date" height={18} stroke="#dedaf7" onChange={range => { if (range.startIndex != null && range.endIndex != null) setRangeIds(selected.slice(range.startIndex,range.endIndex + 1).map(exam => exam.exam_id)); }}/></ComposedChart></ResponsiveContainer></div>
          <div className={s.trendFoot}><span>{selected.length} sınav <i/> Ortalama <b>{n(average)}</b></span>{rangeIds.length > 0 && rangeIds.length < selected.length ? <button type="button" className={s.textButton} onClick={() => { setCustomIds(rangeIds); setWindow('custom'); setRangeIds([]); onViewChange('growth'); }}>{rangeIds.length} sınavı incele <ArrowRight size={14}/></button> : <span>{dateLabel(selected[0]?.exam_date)} — {dateLabel(selected.at(-1)?.exam_date)}</span>}</div>
          {chart.every(point => point.value == null) && <p className={s.shortNote}>Bu ölçüt için veri yok veya yükleniyor.</p>}
        </section>
        <div className={s.overviewBottom}>
          <section className={s.subjectPanel}><div className={s.sectionHead}><h3>Derslerin görünümü</h3><span>Son sınav</span></div>{loading && !visible ? <Loading/> : subjects.length ? <div className={s.courseGrid}>{subjects.map((item,index) => { const point = item.series.find(row => row.exam_id === selected.at(-1)?.exam_id); return <button type="button" className={s.courseCard} key={item.name} onClick={() => { setSubject(subject === item.name ? '' : item.name); if (scoreMetric) setMetric('net'); }} aria-pressed={subject === item.name}><div><span>{item.name}</span><b>{n(point?.net)}<small>net</small></b></div><div className={s.spark}><ResponsiveContainer width="100%" height="100%"><AreaChart data={item.series}><Area type="linear" dataKey="net" stroke={palette[index % palette.length]} fill={palette[index % palette.length]} fillOpacity={0.07} strokeWidth={2} isAnimationActive={false}/></AreaChart></ResponsiveContainer></div></button>; })}</div> : <div className={s.shortNote}>{error ? 'Ders verisi alınamadı.' : 'Ders verisi yok.'}</div>}</section>
          <section className={s.lossPreview}><div className={s.sectionHead}><h3>Yanlış / boş</h3><span>{n(subject&&!visible?null:chart.reduce((sum,point)=>sum+(point.wrong||0)+(point.empty||0),0),0)} toplam</span></div><div className={s.smallChart}><ResponsiveContainer width="100%" height="100%"><BarChart data={chart} margin={{top:5,right:0,left:-30,bottom:0}}><XAxis dataKey="date" tickLine={false} axisLine={false} tick={{fontSize:10,fill:'#a0a4b5'}} minTickGap={25}/><YAxis tickLine={false} axisLine={false} tick={{fontSize:10,fill:'#a0a4b5'}} allowDecimals={false}/><Tooltip labelFormatter={(_,payload) => payload?.[0]?.payload?.name || ''}/><Bar dataKey="wrong" name="Yanlış" fill="#ed8494" stackId="loss"/><Bar dataKey="empty" name="Boş" fill="#e9c477" stackId="loss" radius={[4,4,0,0]}/></BarChart></ResponsiveContainer></div><button type="button" className={s.deepLink} onClick={() => { setSubject(''); setTopicKey(''); onViewChange('growth'); }}>Kayıpların kaynağına in <ArrowRight size={16}/></button></section>
        </div>
        <div className={s.examStrip} aria-label="Sınav seçimi">{selected.map(exam => <button type="button" key={exam.exam_id} onClick={() => selectExam(exam.exam_id)}><span>{dateLabel(exam.exam_date)}</span>{exam.exam_name}<ArrowUpRight size={12}/></button>)}</div>
      </> : <section className={s.analysisBoard} aria-label="Kayıp analizi">
        <aside className={s.courseRail}><div className={s.railTitle}>DERSLER</div><button type="button" aria-pressed={!subject} onClick={() => { setSubject(''); setTopicKey(''); }}><ChartNoAxesCombined size={16}/><span>Tümü</span><b>{n(lossTotal,0)}</b></button>{lossSubjects.map(item => { const loss = item.series.reduce((sum,point) => sum + point.wrong + point.empty,0); return <button type="button" key={item.name} aria-pressed={subject === item.name} onClick={() => { setSubject(item.name); setTopicKey(''); }}><span className={s.courseDot}/><span>{item.name}</span><b>{loss}</b></button>; })}</aside>
        <div className={s.lossWorkspace}>
          <div className={s.analysisHead}><div><h2>{subject || 'En çok kaybettiren konular'}</h2><span>{ranked.length} konu · yalnızca yanlış ve boşlar</span></div><label className={s.search}><Search size={15}/><input aria-label="Konu ara" placeholder="Konu ara" value={query} onChange={event => setQuery(event.target.value)}/></label></div>
          {error ? <div className={s.empty}>Kayıp verisi alınamadı.</div> : loading && !visible ? <Loading/> : !ranked.length ? <div className={s.empty}>{topics.length ? 'Bu filtrede kayıp yok.' : subjects.length ? 'Eşlenmiş konularda kayıp yok.' : 'Konu eşlemesi bulunmuyor.'}</div> : <div className={s.analysisSplit} data-focused={topicFocused}>
            <div ref={listRef} tabIndex={-1} className={s.topicList} aria-label="Kayıplı konular"><div className={s.listLabels}><span>KONU</span><span>KAYIP</span></div>{ranked.slice(0,topicLimit).map((item,index) => <button type="button" key={item.key} className={s.topicRow} aria-pressed={activeTopic?.key === item.key} onClick={() => {setTopicKey(item.key);setTopicFocused(true);}}><span className={s.rankIndex}>{String(index + 1).padStart(2,'0')}</span><span className={s.topicName}><b>{item.name}</b><small>{item.subject}</small><span className={s.lossBar}><i style={{width:`${item.question_count ? 100 * item.wrong / item.question_count : 0}%`}}/><i style={{width:`${item.question_count ? 100 * item.empty / item.question_count : 0}%`}}/></span></span><span className={s.rowLoss}><b>{item.loss}</b><small>%{n(item.rate,0)}</small></span><ChevronRight size={14}/></button>)}{ranked.length>topicLimit&&<button type="button" className={s.showMore} onClick={()=>setTopicLimit(limit=>limit+6)}>+{ranked.length-topicLimit} konu daha</button>}</div>
            {activeTopic && <div ref={detailRef} tabIndex={-1} className={s.topicDetail} key={activeTopic.key}><button type="button" className={s.backButton} onClick={()=>{setTopicFocused(false);requestAnimationFrame(()=>listRef.current?.focus({preventScroll:true}));}}><ArrowLeft size={13}/>Konulara dön</button><div className={s.topicDetailHead}><span>{activeTopic.subject} <ChevronRight size={11}/> {activeTopic.name}</span><h3>{activeTopic.name}</h3><div className={s.lossStats}><b>{activeTopic.loss}<small>kayıp</small></b>{activeTopic.wrong > 0 && <span><i className={s.wrongDot}/>{activeTopic.wrong} yanlış</span>}{activeTopic.empty > 0 && <span><i className={s.emptyDot}/>{activeTopic.empty} boş</span>}</div></div>
              <div className={s.outcomeRows}>{groupOutcomes(outcomes).map((group,index) => <div key={`${group.name}:${index}`} className={s.outcomeGroup}>{group.items.length > 1 && <h4>{group.name}</h4>}{group.items.map((item,i) => <LossOutcome key={`${item.outcome_id}:${item.sub_outcome_id}:${i}`} item={item} exams={selected}/>)}</div>)}</div>
              {!outcomes.length && <p className={s.shortNote}>Kayıplı kazanım eşlemesi yok.</p>}
              <details className={s.evidence}><summary>Kanıt ve dönem kıyası <ArrowUpRight size={12}/></summary><p>{activeTopic.evidence.reason}</p><PeriodPanel points={activeTopic.series} exams={selected} label={activeTopic.name}/></details>
            </div>}
          </div>}
          <div className={s.boardFoot}><span><i className={s.wrongDot}/>Yanlış <i className={s.emptyDot}/>Boş</span><button type="button" className={s.textButton} onClick={() => setDialog('coverage')}>{needsMapping ? 'Eksik eşleme var' : 'Veri kapsamı'}<ArrowUpRight size={12}/></button></div>
        </div>
      </section>}
    </>}
    {dialog && <SidePanel title={dialog === 'compare' ? 'Sınav karşılaştırması' : dialog === 'coverage' ? 'Veri kapsamı' : selectedExam?.exam_name || 'Sınav'} onClose={() => setDialog(null)}>
      {dialog === 'compare' && <ExamCompare exams={selected} onOpen={onOpen} requestScores={onRequestScores}/>}
      {dialog === 'coverage' && <CoveragePanel subjects={subjects} onSelect={name => { drill(name); setDialog(null); }}/>}
      {dialog === 'exam' && selectedExam && <><div className={s.examDialogStats}><b>{n(selectedExam.total_net)}<small>net</small></b><span>{dateLabel(selectedExam.exam_date)}</span></div><button type="button" className={s.primaryButton} onClick={() => { setCustomIds([selectedExam.exam_id]); setWindow('custom'); setDialog(null); onViewChange('growth'); }}>Bu sınavın kayıplarını incele <ArrowRight size={15}/></button><ExamContext key={`${selectedExam.exam_id}:${rankingYear}`} exam={selectedExam} rankingYear={rankingYear} onOpen={onOpen}/></>}
    </SidePanel>}
  </div>;
}

function Loading() { return <div className={s.loading} role="status"><span/>Analiz yükleniyor</div>; }

function LossOutcome({ item, exams }: { item: DevelopmentOutcome; exams: StudentExamResult[] }) {
  const [open,setOpen] = useState(false);
  const evidence = evidenceSummary(item.series, exams.map(exam => exam.exam_id));
  const state = ['new_drop','recurring','unmeasured'].includes(evidence.state) ? lossStateLabels[evidence.state] : null;
  const history = exams.map(exam => { const point = item.series.find(row => row.exam_id === exam.exam_id); return { name: exam.exam_name, date: dateLabel(exam.exam_date), rate: point ? 100 - point.mastery_rate : null }; });
  return <article className={s.outcome}><button type="button" className={s.outcomeToggle} aria-expanded={open} onClick={() => setOpen(value => !value)}><span><b>{item.name}</b>{state && <small>{state}</small>}</span><strong>{item.wrong + item.empty}</strong><ChevronRight size={14} className={open ? s.rotated : ''}/></button>{open && <div className={s.outcomeExpanded}><div className={s.inlineStats}>{item.wrong > 0 && <span>{item.wrong} yanlış</span>}{item.empty > 0 && <span>{item.empty} boş</span>}<span>{item.question_count} gözlem</span></div><div className={s.outcomeChart}><ResponsiveContainer width="100%" height="100%"><AreaChart data={history} margin={{top:8,right:0,left:-25,bottom:0}}><XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fontSize:10}} minTickGap={25}/><YAxis domain={[0,100]} axisLine={false} tickLine={false} tick={{fontSize:10}} unit="%"/><Tooltip labelFormatter={(_,payload) => payload?.[0]?.payload?.name || ''} formatter={value => [`%${n(Number(value))}`,'Kayıp']}/><Area type="linear" dataKey="rate" stroke="#e78a9a" fill="#fff1f4" strokeWidth={2} connectNulls={false}/></AreaChart></ResponsiveContainer></div><details className={s.evidence}><summary>Sınav geçmişi</summary><div className={s.heatScroll}><table className={s.historyTable}><thead><tr><th>Sınav</th><th>Yanlış</th><th>Boş</th></tr></thead><tbody>{exams.map(exam => { const point = item.series.find(row => row.exam_id === exam.exam_id); return <tr key={exam.exam_id}><th>{exam.exam_name}</th><td>{point?.wrong ?? '—'}</td><td>{point?.empty ?? '—'}</td></tr>; })}</tbody></table></div></details></div>}</article>;
}

function SidePanel({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener=useRef(typeof document==='undefined'?null:document.activeElement as HTMLElement|null);
  useEffect(() => { const dialog = ref.current;const target=opener.current; dialog?.showModal(); return () => { if (dialog?.open) dialog.close();queueMicrotask(()=>{if(target?.isConnected)target.focus({preventScroll:true});}); }; }, []);
  return <dialog ref={ref} className={s.dialog} aria-label={title} onCancel={onClose} onClick={event => { if (event.target === event.currentTarget) onClose(); }}><div className={s.dialogInner}><header><h2>{title}</h2><button type="button" className={s.iconButton} aria-label="Paneli kapat" onClick={onClose} autoFocus><X size={19}/></button></header>{children}</div></dialog>;
}
