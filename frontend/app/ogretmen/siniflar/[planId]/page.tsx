"use client";
import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, ArrowUpRight, Search } from "lucide-react";
import { EmptyState, Initials, LoadingState, PageHeading } from "@/components/teacher/PortalUI";
import NotesLibrary from "@/components/teacher/NotesLibrary";
import { roleLabel, useTeacher, useTeacherData } from "@/lib/teacher-web";
type ClassRow = { id: number; sinif: { ad: string }; ders: { ad: string }; weekly_hours: number; rol: string };
type StudentRow = { student_id: number; ad: string; soyad: string; okul_no: string; sinif_ad: string };
export default function ClassPage({ params }: { params: { planId: string } }) {
  const planId = Number(params.planId);
  const { termId } = useTeacher();
  const classes = useTeacherData<{ results: ClassRow[] }>(termId ? `/api/teacher/classes/?term_id=${termId}` : null);
  const students = useTeacherData<{ results: StudentRow[] }>(termId ? `/api/teacher/students/?term_id=${termId}&plan_id=${planId}` : null);
  const [tab, setTab] = useState("students");
  const [query, setQuery] = useState("");
  const plan = classes.data?.results.find(row => row.id === planId);
  const results = (students.data?.results || []).filter(row => `${row.ad} ${row.soyad} ${row.okul_no}`.toLocaleLowerCase("tr-TR").includes(query.toLocaleLowerCase("tr-TR")));
  return <><Link href="/ogretmen/siniflar" className="tp-text-link" style={{ margin: "0 0 20px" }}><ArrowLeft size={15} />Öğrencilerime dön</Link><PageHeading eyebrow="BİRLİKTE ÖĞRENİYORUZ" title={plan?.sinif.ad || "Sınıf detayları"} description={[plan?.ders.ad, plan ? `${plan.weekly_hours} saat / hafta` : "", plan ? `${roleLabel(plan.rol)} öğretmen` : ""].filter(Boolean).join(" · ")} />
    <div className="tp-toolbar"><div className="tp-tabs" role="group" aria-label="Sınıf içeriği"><button type="button" aria-pressed={tab === "students"} onClick={() => setTab("students")}>Öğrenciler · {students.data?.results.length ?? "—"}</button><button type="button" aria-pressed={tab === "notes"} onClick={() => setTab("notes")}>Ders notları</button></div>{tab === "students" && <div className="tp-search"><Search size={17} /><input aria-label="Sınıfta öğrenci ara" value={query} placeholder="Öğrenci adı veya numarası…" onChange={event => setQuery(event.target.value)} /></div>}</div>
    {classes.error && <p className="tp-error">{classes.error}</p>}{students.error && <p className="tp-error">{students.error}</p>}
    {tab === "notes" ? <NotesLibrary planId={planId} compact /> : students.loading ? <LoadingState /> : results.length ? <div className="tp-grid">{results.map(student => <Link key={student.student_id} className="tp-card tp-class-card" href={`/ogretmen/ogrenci/${student.student_id}?planId=${planId}`}><Initials name={`${student.ad} ${student.soyad}`} /><strong>{student.ad} {student.soyad}</strong><em>{[student.okul_no ? `No. ${student.okul_no}` : "", student.sinif_ad].filter(Boolean).join(" · ")}</em><div className="tp-class-card-bottom"><span>Branş gelişimini incele</span><ArrowUpRight size={19} /></div></Link>)}</div> : <EmptyState title={query ? "Öğrenci bulunamadı" : "Henüz öğrenci yok"} description={query ? "Farklı bir isim veya numara ile tekrar dene." : "Bu sınıfın öğrencileri atandığında burada görünecek."} />}
  </>;
}
