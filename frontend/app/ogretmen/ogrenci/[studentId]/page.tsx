"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, BookOpen, TrendingUp } from "lucide-react";
import { EmptyState, Initials, LoadingState, PageHeading, SectionHeading } from "@/components/teacher/PortalUI";
import { useTeacher, useTeacherData } from "@/lib/teacher-web";

type Card = { ad: string; soyad: string; okul_no: string; sinif: string; grup: string; dersler: { ders: string; sinif: string }[] };
type PrivateRow = { student_id: number; ad: string; soyad: string; okul_no: string; dersler: string[] };
type Exam = { id?: number; name: string; net: number; date: string | null };
type Group = { label: string; last_net: number; average_net: number; delta?: number | null; exams: Exam[]; topics?: { name: string; mastery: number; correct: number; question_count: number }[] };
type Exams = { ders: string; groups: Group[] };
const number = (value: number) => Number(value).toLocaleString("tr-TR", { maximumFractionDigits: 2 });

function Trend({ exams }: { exams: Exam[] }) {
  const min = Math.min(0, ...exams.map(exam => exam.net));
  const max = Math.max(1, ...exams.map(exam => exam.net));
  const points = exams.map((exam, index) => ({ x: 12 + index / Math.max(1, exams.length - 1) * 476, y: 105 - (exam.net - min) / (max - min) * 90 }));
  return <div className="tp-trend"><div className="tp-trend-caption"><span>Net gelişimi</span><span>{exams.length} sınav</span></div><svg viewBox="0 0 500 125" role="img" aria-label="Sınav sırasına göre net gelişimi"><path d="M12 15H488 M12 60H488 M12 105H488" fill="none" stroke="#e8eff6" strokeDasharray="4 5" /><polyline points={points.map(point => `${point.x},${point.y}`).join(" ")} fill="none" stroke="#0066b3" strokeWidth="2.5" strokeLinejoin="round" />{points.map((point, index) => <circle key={index} cx={point.x} cy={point.y} r="4" fill="white" stroke="#0066b3" strokeWidth="2"><title>{exams[index].name}: {number(exams[index].net)} net</title></circle>)}</svg><div className="tp-trend-caption"><span>İlk sınav</span><span>Son sınav</span></div></div>;
}
export default function StudentPage({ params }: { params: { studentId: string } }) {
  const studentId = Number(params.studentId);
  const search = useSearchParams();
  const planId = search.get("planId");
  const { termId } = useTeacher();
  const card = useTeacherData<Card>(termId && planId ? `/api/teacher/students/${studentId}/?term_id=${termId}&plan_id=${encodeURIComponent(planId)}` : null);
  const privates = useTeacherData<{ results: PrivateRow[] }>(termId && !planId ? `/api/teacher/private-students/?term_id=${termId}` : null);
  const exams = useTeacherData<Exams>(termId ? `/api/teacher/students/${studentId}/exams/?term_id=${termId}` : null);
  const privateRow = privates.data?.results.find(row => row.student_id === studentId);
  const person = card.data || privateRow;
  const name = person ? `${person.ad} ${person.soyad}` : "Öğrenci detayları";
  const back = planId ? `/ogretmen/siniflar/${encodeURIComponent(planId)}` : "/ogretmen/siniflar";
  const lessons = card.data?.dersler.map(row => row.ders) || privateRow?.dersler || [];
  return <><Link className="tp-text-link" style={{ margin: "0 0 20px" }} href={back}><ArrowLeft size={15} />{planId ? "Sınıfa dön" : "Öğrencilerime dön"}</Link>
    <div className="tp-student-heading"><Initials name={name} /><PageHeading eyebrow="HER ADIM BİR GELİŞİM" title={name} description={person ? [card.data?.sinif || "Birebir öğrenci", person.okul_no ? `No. ${person.okul_no}` : "", card.data?.grup].filter(Boolean).join(" · ") : "Öğrencinin branş gelişimi"} /></div>
    {card.loading || privates.loading ? <LoadingState /> : null}
    {card.error || privates.error ? <p className="tp-error">{card.error || privates.error}</p> : null}
    {person && <div className="tp-student-subjects">{lessons.map(lesson => <span key={lesson}><BookOpen size={15} />{lesson}</span>)}</div>}
    <SectionHeading number="01" title="Branş gelişimi" />
    <p className="tp-sub">{exams.data?.ders ? `${exams.data.ders} · ` : ""}Kendi dersine ait sınav sonuçları ve tekrar gerektiren konular.</p>
    {exams.loading ? <LoadingState /> : exams.error ? <p className="tp-error" role="alert">{exams.error}</p> : exams.data?.groups.length ? exams.data.groups.map(group => <section className="tp-analysis" key={group.label}><div className="tp-analysis-head"><h2>{group.label}</h2><span className="tp-pill"><TrendingUp size={13} />{group.exams.length} sınav</span></div><div className="tp-analysis-grid"><div><div className="tp-net-stats"><div><span>Son sınav neti</span><strong>{number(group.last_net)}<small>net</small></strong></div><div><span>Sınav ortalaması</span><strong>{number(group.average_net)}<small>net</small></strong></div></div><Trend exams={group.exams} /><div className="tp-exam-list">{group.exams.slice().reverse().map((exam, index) => <div key={exam.id || `${exam.name}-${index}`}><div><strong>{exam.name}</strong><span>{exam.date ? new Date(`${exam.date}T12:00:00`).toLocaleDateString("tr-TR", { day: "numeric", month: "long" }) : "Tarih belirtilmedi"}</span></div><b>{number(exam.net)}<small>net</small></b></div>)}</div></div><div className="tp-topics-panel"><span className="tp-eyebrow">BİR SONRAKİ ADIM</span><h3>Tekrar için konu rehberi</h3><p>Son sınavdaki doğruluk oranına göre çalışılabilecek konular.</p>{group.topics?.length ? group.topics.map(topic => <div className="tp-topic-mastery" key={topic.name}><div><strong>{topic.name}</strong><span>{topic.correct}/{topic.question_count} doğru</span></div><div className="tp-mastery-track"><span style={{ width: `${Math.max(0, Math.min(100, topic.mastery))}%` }} /></div></div>) : <p>Bu sınavda konu ayrıntısı bulunmuyor.</p>}</div></div></section>) : <EmptyState title="Gelişim hikâyesi burada başlayacak" description="Branşına ait sınav sonuçları yayımlandığında netler ve konu bilgileri burada görünecek." />}
  </>;
}
