'use client';

import { useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { analysisApi } from '@/components/olcme/api';
import type { DevelopmentSubject, StudentDetailResponse, StudentExamResult } from '@/components/olcme/types';
import { coverage, lossRate, numberLabel as n, periodComparison, type EvidencePoint, type LossTopic } from './examAnalyticsModel';
import s from './ExamAnalyticsWorkspace.module.css';

export function DecisionSummary({topics,onSelect}:{topics:LossTopic[];onSelect:(subject:string,topic:string)=>void}) {
  const biggest=topics.filter(t=>t.loss>0).slice().sort((a,b)=>b.loss-a.loss)[0];
  const declining=topics.filter(t=>(t.evidence.comparison.delta??0)>=10).slice().sort((a,b)=>(b.evidence.comparison.delta??0)-(a.evidence.comparison.delta??0))[0];
  const recurring=topics.filter(t=>t.evidence.affected>=2 && t.evidence.recentLoss).slice().sort((a,b)=>b.evidence.affected-a.evidence.affected||b.loss-a.loss)[0];
  return <section className={s.decisions} aria-label="Koç karar özeti">{[
    {title:'En büyük kayıp',item:biggest,detail:biggest?`${biggest.loss} yanlış + boş · %${n(biggest.rate)} kayıp oranı`:topics.length?'Eşlenmiş konularda kayıp gözlenmedi.':'Konu verisi yok; kayıp değerlendirilmedi.'},
    {title:'Son dönemde kötüleşen',item:declining,detail:declining?`Kayıp oranı +${n(declining.evidence.comparison.delta)} yüzde puan`:'Yeterli dönem verisiyle doğrulanan belirgin kötüleşme yok.'},
    {title:'Tekrarlayan eksiklik',item:recurring,detail:recurring?`${recurring.evidence.measured} ölçümün ${recurring.evidence.affected} tanesinde kayıp`:'Tekrar eden kaybı gösterecek yeterli gözlem yok.'},
  ].map(card=><div key={card.title}><span>{card.title}</span>{card.item?<button type="button" onClick={()=>onSelect(card.item!.subject,card.item!.name)}>{card.item.subject} · {card.item.name} →</button>:<b>—</b>}<small>{card.detail}</small></div>)}</section>;
}

export function CoveragePanel({subjects,onSelect}:{subjects:DevelopmentSubject[];onSelect:(subject:string)=>void}) {
  if (!subjects.length) return <div className={s.coverage}>Veri kapsamı: ders ve konu verisi bulunmuyor; kapsam hesaplanamadı. Bu durum sıfır kayıp anlamına gelmez.</div>;
  const rows=subjects.map(subject=>({subject,...coverage(subject)}));
  const mapped=rows.reduce((sum,row)=>sum+row.mapped,0), total=rows.reduce((sum,row)=>sum+row.total,0);
  const inconsistent=rows.some(row=>row.inconsistent);
  const overlapping=subjects.some(subject=>subject.incomplete_breakdown);
  return <details className={s.coverage} open><summary>{overlapping?'Üst/alt ders ayrımı eksik: toplu veri kapsamı hesaplanmadı':<>Veri kapsamı: {mapped} / {total} cevap konuya eşlenmiş {total>0?`(%${n(100*mapped/total)})`:''}{inconsistent?' · Eşleme tutarlılığı kontrol edilmeli':mapped<total?' · Eksik eşleme var':''}</>}</summary><p>Analiz yalnızca eşlenmiş cevapları kapsar.</p><div className={s.heatScroll}><table className={s.historyTable}><thead><tr><th>Ders</th><th>Eşlenen / toplam</th><th>Kapsam</th><th>Eşlenmeyen</th></tr></thead><tbody>{rows.map(row=><tr key={row.subject.name}><th scope="row"><button type="button" onClick={()=>onSelect(row.subject.name)}>{row.subject.name}</button></th><td>{row.mapped} / {row.total}</td><td>{row.inconsistent?'Tutarsız':`%${n(row.percent)}`}</td><td>{row.inconsistent?'Kontrol gerekli':row.total-row.mapped}</td></tr>)}</tbody></table></div></details>;
}

export function PeriodPanel({points,exams,label}:{points:EvidencePoint[];exams:StudentExamResult[];label:string}) {
  const result=periodComparison(points,exams.map(exam=>exam.exam_id));
  const names=(ids:number[])=>ids.map(id=>exams.find(exam=>exam.exam_id===id)?.exam_name).join(' · ');
  return <section className={s.periodPanel} aria-label="Dönem karşılaştırması"><h3>{label} · dönem karşılaştırması</h3>{result.size<2?<p>Karşılaştırma için seçili kapsamda en az 4 sınav gerekli. Son 3 ile önceki 3 karşılaştırması için en az 6 sınav seçin.</p>:<><div className={s.periodColumns}>{[{label:`Önceki ${result.size} sınav`,counts:result.before,ids:result.previousIds,observations:result.previousObservations},{label:`Son ${result.size} sınav`,counts:result.after,ids:result.recentIds,observations:result.recentObservations}].map(period=><div key={period.label}><span>{period.label}</span><strong>{period.counts.question_count?`%${n(lossRate(period.counts))}`:'—'}</strong><small>{period.counts.wrong} yanlış · {period.counts.empty} boş · {period.counts.question_count} gözlem · {period.observations} sınavda ölçüldü</small><small>{names(period.ids)}</small></div>)}</div><p>{result.delta==null?'Her iki dönemde en az 2 ölçüm ve 5 gözlem yok; güvenilir dönem değişimi hesaplanmadı.':`Kayıp oranı ${result.delta>0?'+':''}${n(result.delta)} yüzde puan ${result.delta>0?'arttı':result.delta<0?'azaldı':'değişti'}.`} Eksik gözlem sıfır kabul edilmez. Sınavların kapsam ve zorlukları farklı olabilir.</p></>}</section>;
}

export function ExamCompare({exams,onOpen,requestScores}:{exams:StudentExamResult[];onOpen:(exam:StudentExamResult)=>void;requestScores:()=>void}) {
  const [a,setA]=useState(exams.at(-2)?.exam_id || exams[0]?.exam_id);
  const [b,setB]=useState(exams.at(-1)?.exam_id);
  const left=exams.find(exam=>exam.exam_id===a) || exams.at(-2);
  const right=exams.find(exam=>exam.exam_id===b) || exams.at(-1);
  const [showScores,setShowScores]=useState(false);
  if(exams.length<2) return <p className={s.footnote}>Yan yana karşılaştırma için en az iki sınav seçin.</p>;
  const value=(exam:StudentExamResult,key:string)=>key==='rank'?exam.kurum_ici_sira>0?`${exam.kurum_ici_sira} / ${exam.toplam_ogrenci}`:'—':key==='puan'?n(exam.puan):key==='percentile'?n(exam.yuzdelik_dilim):n(exam[key as 'total_net']);
  return <details className={s.compare} open><summary>İki sınavı yan yana karşılaştır</summary><div className={s.comparePick}>{[{label:'Birinci sınav',exam:left,set:setA,other:right},{label:'İkinci sınav',exam:right,set:setB,other:left}].map(item=><label key={item.label}>{item.label}<select aria-label={item.label} value={item.exam?.exam_id||''} onChange={event=>item.set(Number(event.target.value))}>{exams.map(exam=><option key={exam.exam_id} value={exam.exam_id} disabled={exam.exam_id===item.other?.exam_id}>{exam.exam_name}</option>)}</select></label>)}</div><button type="button" aria-pressed={showScores} onClick={()=>{setShowScores(value=>!value);if(!showScores)requestScores();}}>Puan ve sıralamaları {showScores?'gizle':'yükle / göster'}</button>{left&&right&&left.exam_id!==right.exam_id?<><div className={s.heatScroll}><table className={s.historyTable}><thead><tr><th>Ölçüt</th><th>{left.exam_name}</th><th>{right.exam_name}</th><th>Fark (2 − 1)</th></tr></thead><tbody>{[{key:'total_net',label:'Net'},{key:'total_wrong',label:'Yanlış'},{key:'total_empty',label:'Boş'},...(showScores?[{key:'puan',label:'Puan'},{key:'rank',label:'Kurum sırası / katılımcı'},{key:'percentile',label:'Tahmini yüzdelik'}]:[])].map(row=>{const av=left[row.key as keyof StudentExamResult],bv=right[row.key as keyof StudentExamResult];return <tr key={row.key}><th scope="row">{row.label}</th><td>{value(left,row.key)}</td><td>{value(right,row.key)}</td><td>{row.key==='rank'||typeof av!=='number'||typeof bv!=='number'?'—':n(bv-av)}</td></tr>;})}</tbody></table></div><div className={s.comparePick}><button type="button" onClick={()=>onOpen(left)}>Birinci karneyi aç</button><button type="button" onClick={()=>onOpen(right)}>İkinci karneyi aç</button></div><details className={s.evidence}><summary>Karşılaştırma notu</summary><p>Sıralamalar katılımcı grubuna bağlıdır. Net ve puan farkı sınav zorluğundan arındırılmamıştır. —: veri yok.</p></details></>:<p>İki farklı sınav seçin.</p>}</details>;
}

/** Fetches only the focused report, never a report per point in the trend. */
export function ExamContext({exam,rankingYear,onOpen}:{exam:StudentExamResult;rankingYear?:number;onOpen:(exam:StudentExamResult)=>void}) {
  const [data,setData]=useState<StudentDetailResponse|null>(null);
  const [loading,setLoading]=useState(true), [error,setError]=useState(''),[retry,setRetry]=useState(0);
  useEffect(()=>{
    let live=true;const controller=new AbortController();setData(null);setLoading(true);setError('');
    if(!exam.answer_id){setLoading(false);return()=>controller.abort();}
    const timeout=setTimeout(()=>{if(live){controller.abort();setError('Karne bağlamı zamanında yüklenemedi.');setLoading(false);}},30_000);
    analysisApi.studentDetail(exam.exam_id,exam.answer_id,rankingYear,controller.signal)
      .then(result=>{if(live&&!controller.signal.aborted)setData(result);})
      .catch(()=>{if(live&&!controller.signal.aborted)setError('Karne karşılaştırması alınamadı.');})
      .finally(()=>{clearTimeout(timeout);if(live&&!controller.signal.aborted)setLoading(false);});
    return()=>{live=false;controller.abort();clearTimeout(timeout);};
  },[exam.exam_id,exam.answer_id,rankingYear,retry]);
  return <section className={s.reportContext}><h3>{exam.exam_name} · karne bağlamı</h3>{loading?<p role="status">Karne karşılaştırmaları yükleniyor…</p>:error?<div role="alert">{error}<button type="button" onClick={()=>setRetry(v=>v+1)}>Karne bağlamını yeniden dene</button></div>:!data?<p>Bu sınavın karne bağlantısı bulunmuyor.</p>:<>
    <div className={s.contextNumbers}><span>Kurum sırası <b>{data.kurum_ici_sira>0?`${data.kurum_ici_sira} / ${data.toplam_ogrenci}`:'—'}</b></span><span>Sınıf sırası <b>{data.sinif_rank>0?`${data.sinif_rank} / ${data.sinif_student_count}`:'—'}</b></span><span>Puan <b>{n(data.puan)}</b></span><span>Net kapsamı <b>{data.net_etiket||'Sınav toplamı'}</b></span></div>
    <div className={s.miniChart}><ResponsiveContainer width="100%" height="100%"><BarChart data={[{name:'Öğrenci',net:data.alan_net??data.toplam_net},{name:'Kurum ort.',net:data.kurum_avg_net},{name:'Sınıf ort.',net:data.sinif_student_count>0?data.sinif_avg_net:null}]}><CartesianGrid vertical={false} stroke="#edf0f6"/><XAxis dataKey="name" tick={{fontSize:12}}/><YAxis tick={{fontSize:12}}/><Tooltip/><Bar dataKey="net" name="Net" fill="#8474e8" radius={[5,5,0,0]}/></BarChart></ResponsiveContainer></div>
    <p className={s.footnote}>Öğrenci {n(data.alan_net??data.toplam_net)} · Kurum {n(data.kurum_avg_net)} · Sınıf {n(data.sinif_student_count>0?data.sinif_avg_net:null)}</p>
    {data.difficulty?.bands.some(band=>band.yanlis+band.bos>0)?<><h4>Zorluk gruplarında kayıp</h4><div className={s.heatScroll}><table className={s.historyTable}><thead><tr><th>Grup</th><th>Gözlem</th><th>Doğru</th><th>Yanlış</th><th>Boş</th></tr></thead><tbody>{data.difficulty.bands.filter(band=>band.yanlis+band.bos>0).map(band=><tr key={band.key}><th>{band.label}</th><td>{band.soru}</td><td>{band.dogru}</td><td>{band.yanlis}</td><td>{band.bos}</td></tr>)}</tbody></table></div></>:null}
    <button type="button" onClick={()=>onOpen(exam)}>Tam karneyi aç</button>
  </>}
  </section>;
}
