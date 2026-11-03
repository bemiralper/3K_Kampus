"use client";
import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight, BookOpen, Search, Users } from "lucide-react";
import { EmptyState, Initials, LoadingState, PageHeading } from "@/components/teacher/PortalUI";
import { roleLabel, useTeacher, useTeacherData } from "@/lib/teacher-web";
type ClassRow = { id: number; sinif: { ad: string }; ders: { ad: string }; weekly_hours: number; rol: string; groups: { name: string }[] };
type PrivateRow = { student_id: number; ad: string; soyad: string; dersler: string[] };
export default function ClassesPage() {
  const { termId } = useTeacher();
  const classes = useTeacherData<{ results: ClassRow[] }>(termId ? `/api/teacher/classes/?term_id=${termId}` : null);
  const privates = useTeacherData<{ results: PrivateRow[] }>(termId ? `/api/teacher/private-students/?term_id=${termId}` : null);
  const [tab, setTab] = useState("classes");
  const [query, setQuery] = useState("");
  const match = (text: string) => text.toLocaleLowerCase("tr-TR").includes(query.toLocaleLowerCase("tr-TR"));
  const classRows = (classes.data?.results || []).filter(row => match(`${row.sinif.ad} ${row.ders.ad}`));
  const privateRows = (privates.data?.results || []).filter(row => match(`${row.ad} ${row.soyad} ${row.dersler.join(" ")}`));
  return <><PageHeading eyebrow="HER ÖĞRENCİ, YENİ BİR HİKÂYE" title="Öğrencilerim" description="Sınıfların, birebir çalıştığın öğrenciler ve dersine ait gelişim bilgileri." />
    <div className="tp-toolbar"><div className="tp-tabs" role="group" aria-label="Öğrenci grubu"><button type="button" aria-pressed={tab === "classes"} onClick={() => setTab("classes")}>Sınıflarım · {classes.data?.results.length ?? "—"}</button><button type="button" aria-pressed={tab === "private"} onClick={() => setTab("private")}>Özel ders · {privates.data?.results.length ?? "—"}</button></div><div className="tp-search"><Search size={17} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder={tab === "classes" ? "Sınıf veya ders ara…" : "Öğrenci ara…"} aria-label="Sınıf veya öğrenci ara" /></div></div>
    {classes.error || privates.error ? <p className="tp-error" role="alert">{classes.error || privates.error}</p> : null}
    {classes.loading || privates.loading ? <LoadingState /> : tab === "classes" ? classRows.length ? <div className="tp-grid">{classRows.map((row, index) => <Link key={row.id} href={`/ogretmen/siniflar/${row.id}`} className="tp-card tp-class-card"><div className="tp-class-card-top"><span className={`tp-class-monogram tone-${index % 3}`}><Users size={21} strokeWidth={1.5} /></span><span className="tp-pill">{roleLabel(row.rol)} öğretmen</span></div><h2>{row.sinif.ad}</h2><p>{row.ders.ad}{row.groups?.length ? ` · ${row.groups.map(group => group.name).join(", ")}` : ""}</p><div className="tp-class-card-bottom"><span>{row.weekly_hours} saat / hafta</span><ArrowUpRight size={20} /></div></Link>)}</div> : <EmptyState title={query ? "Eşleşen sınıf bulunamadı" : "Sınıfların burada buluşacak"} description={query ? "Başka bir sınıf adı veya ders ile tekrar dene." : "Bu dönemde atandığın sınıflar tanımlandığında burada görünecek."} /> : privateRows.length ? <div className="tp-grid">{privateRows.map(row => <Link key={row.student_id} href={`/ogretmen/ogrenci/${row.student_id}`} className="tp-card tp-class-card"><div className="tp-class-card-top"><Initials name={`${row.ad} ${row.soyad}`} /><span className="tp-pill">Birebir</span></div><h2 style={{ fontSize: 20 }}>{row.ad} {row.soyad}</h2><p>{row.dersler.join(" · ")}</p><div className="tp-class-card-bottom"><span><BookOpen size={14} /> Öğrenciyi incele</span><ArrowUpRight size={20} /></div></Link>)}</div> : <EmptyState title={query ? "Öğrenci bulunamadı" : "Birebir öğrencilerin burada"} description={query ? "Farklı bir isimle tekrar arayabilirsin." : "Bu dönemde sana atanmış özel ders öğrencisi bulunmuyor."} />}
  </>;
}
