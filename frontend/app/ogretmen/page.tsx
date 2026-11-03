"use client";

import Link from "next/link";
import { ArrowDown, ArrowRight, ArrowUpRight, CalendarDays, Clock3, Files, MapPin, Plus, Sparkles, Users, Bell } from "lucide-react";
import { clock, useTeacher, useTeacherData } from "@/lib/teacher-web";
import { EmptyState, LoadingState, SectionHeading } from "@/components/teacher/PortalUI";

type Cell = {
  id: number; kind: string; class_lesson_plan_id: number | null;
  lesson: { name: string | null } | null; classroom: { name: string } | null;
  student: { id: number; name: string } | null; room: { name: string } | null;
  start: string | null; end: string | null; session?: { status_label?: string } | null;
};
type Home = { date: string; weekday: number; next: Cell | null; today: Cell[]; counts: { classes: number; lessons: number; private: number } };
type ClassRow = { id: number; sinif: { ad: string }; ders: { ad: string }; weekly_hours: number; rol: string };
type Notice = { id: string; title: string; body: string; occurred_at: string };
const title = (cell: Cell) => cell.kind === "private" ? cell.student?.name || "Özel ders" : cell.classroom?.name || "Sınıf dersi";
const href = (cell: Cell) => cell.kind === "private" && cell.student ? `/ogretmen/ogrenci/${cell.student.id}` : cell.class_lesson_plan_id ? `/ogretmen/siniflar/${cell.class_lesson_plan_id}` : "/ogretmen/program";

export default function TeacherHomePage() {
  const { profileName, termId, termName } = useTeacher();
  const home = useTeacherData<Home>(termId ? `/api/teacher/home/?term_id=${termId}` : null);
  const classes = useTeacherData<{ results: ClassRow[] }>(termId ? `/api/teacher/classes/?term_id=${termId}` : null);
  const notices = useTeacherData<{ results: Notice[] }>("/api/teacher/notifications/");
  const data = home.data;
  const next = data?.next;
  const hour = Number(new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", hour: "numeric", hourCycle: "h23" }).format(new Date()));
  const hello = hour < 12 ? "Günaydın" : hour < 18 ? "Merhaba" : "İyi akşamlar";
  const date = new Date(`${data?.date || new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Istanbul" })}T12:00:00`);
  const dateLabel = Number.isNaN(date.getTime()) ? "Bugün" : date.toLocaleDateString("tr-TR", { day: "numeric", month: "long", weekday: "long" });
  return <>
    <div className="tp-home-heading"><div><span className="tp-eyebrow"><span className="tp-live-dot" /> YENİ BİR GÜN, YENİ BİR İZ</span><h1>{hello}, <span>{profileName.split(" ")[0] || "öğretmenim"}.</span></h1><p>Bugünün ritmi burada. İlham vermeye devam.</p></div><span className="tp-date"><CalendarDays size={17} />{dateLabel}</span></div>
    {home.error && <p className="tp-error" role="alert">{home.error}<button type="button" onClick={home.reload}>Yeniden dene</button></p>}
    <div className="tp-hero-grid">
      <section className="tp-focus">
        <div className="tp-orbit-art" aria-hidden="true"><i /><i /><i /><span>3K</span><b>+</b></div>
        <div className="tp-focus-top"><span className="tp-focus-label"><span className="tp-live-dot" /> {next ? "SIRADAKİ DERSİN" : "BUGÜNÜN ODAĞI"}</span><span className="tp-focus-tag">{next?.kind === "private" ? "Birebir" : termName || "Öğretmen alanı"}</span></div>
        <div className="tp-focus-body"><span className="tp-focus-course">{next?.lesson?.name || "Öğrenmeye alan aç."}</span><h2>{next ? title(next) : home.loading ? "Programın hazırlanıyor…" : "Bir sonraki derse hazır."}</h2><p>{next ? "Dersin detayları ve öğrencilerin bir adım uzağında." : "Ders notlarını düzenle, öğrencilerinle bilgiyi paylaş."}</p></div>
        <div className="tp-focus-bottom"><div><span><Clock3 size={16} />{next ? `${clock(next.start)} – ${clock(next.end)}` : "Kendi ritminde"}</span>{next?.room?.name && <span><MapPin size={16} />{next.room.name}</span>}</div><Link href={next ? href(next) : "/ogretmen/notlar"}>{next ? "Derse göz at" : "Notlarıma git"}<ArrowUpRight size={19} /></Link></div>
      </section>
      <Link href="/ogretmen/notlar?yukle=1" className="tp-create-card"><div className="tp-create-top"><span className="tp-icon-tile"><Files size={25} strokeWidth={1.5} /></span><span className="tp-round-plus"><Plus size={22} /></span></div><div><span className="tp-eyebrow">BİLGİYE BİR KAPI AÇ</span><h2>Bir not paylaş.<br /> Bir fark yarat.</h2><p>Ders notların ve materyallerin,<br />öğrencilerin için hep el altında.</p></div><span className="tp-create-link">Ders notu yükle <ArrowRight size={18} /></span><span className="tp-paper-art" aria-hidden="true"><i /><i /><i /></span></Link>
    </div>
    <div className="tp-stats-strip"><div><span className="tp-stat-icon"><Users size={20} /></span><strong>{classes.data?.results.length ?? "—"}</strong><span>Atandığın sınıf</span></div><div><span className="tp-stat-icon"><CalendarDays size={20} /></span><strong>{data?.today.length ?? "—"}</strong><span>Bugünkü ders</span></div><div><span className="tp-stat-icon tp-mint"><Sparkles size={20} /></span><strong>{data?.counts.private ?? "—"}</strong><span>Bugünkü özel ders</span></div><Link href="/ogretmen/program">Haftayı keşfet <ArrowUpRight size={18} /></Link></div>
    <div className="tp-dashboard-columns"><section><SectionHeading number="01" title="Günün akışı" href="/ogretmen/program" label="Programı aç" />
      {home.loading ? <LoadingState /> : !termId ? <EmptyState title="Henüz bir dönem yok" description="Aktif ders dönemin tanımlandığında programın burada görünecek." /> : data?.today.length ? <div className="tp-timeline">{data.today.map((cell, index) => <Link className={`tp-timeline-row ${next?.id === cell.id && next?.kind === cell.kind ? "is-next" : ""}`} key={`${cell.kind}-${cell.id}`} href={href(cell)}><div className="tp-timeline-clock"><strong>{clock(cell.start)}</strong><span>{clock(cell.end)}</span></div><span className="tp-timeline-node" /><div className="tp-timeline-content"><span className={`tp-type-label ${cell.kind === "private" ? "is-private" : ""}`}>{cell.kind === "private" ? "BİREBİR" : "SINIF DERSİ"}</span><h3>{title(cell)} <span>· {cell.lesson?.name || "Ders"}</span></h3><p>{[cell.room?.name, cell.session?.status_label].filter(Boolean).join(" · ") || `${index + 1}. ders`}</p></div><ArrowUpRight className="tp-row-arrow" size={19} /></Link>)}</div> : <EmptyState title="Bugün takvimin ferah" description="Bugün için planlanmış dersin bulunmuyor. Haftanın diğer günlerine göz atabilirsin."><Link className="tp-text-link" href="/ogretmen/program">Haftalık program <ArrowRight size={16} /></Link></EmptyState>}
    </section><aside><SectionHeading number="02" title="Sınıflarına kısa yol" href="/ogretmen/siniflar" />{classes.loading ? <LoadingState /> : <div className="tp-class-shortcuts">{classes.data?.results.slice(0, 3).map((row, index) => <Link key={row.id} href={`/ogretmen/siniflar/${row.id}`}><span className={`tp-class-monogram tone-${index}`}>{row.sinif.ad.slice(0, 2)}</span><div><strong>{row.sinif.ad}</strong><span>{row.ders.ad} · {row.weekly_hours} saat / hafta</span></div><ArrowUpRight size={17} /></Link>)}{!classes.data?.results.length && <p className="tp-muted">Atandığın sınıflar burada listelenecek.</p>}</div>}
    <div className="tp-notice-preview"><div><span className="tp-icon-tile"><Bell size={20} /></span><span className="tp-eyebrow">KAMPÜSTEN HABERLER</span></div>{notices.loading ? <LoadingState /> : notices.error ? <p className="tp-muted">Duyurular şu an alınamadı.</p> : notices.data?.results[0] ? <><h3>{notices.data.results[0].title}</h3><p>{notices.data.results[0].body}</p></> : <><h3>Her şey güncel.</h3><p>Yeni kurum duyuruları ve program bildirimleri burada görünecek.</p></>}<Link href="/ogretmen/bildirimler">Duyurulara git <ArrowUpRight size={16} /></Link></div></aside></div>
    <div className="tp-bottom-note"><span>Öğretmek, geleceğe dokunmaktır.</span><ArrowDown size={14} /><span>3K Kampüs</span></div>
  </>;
}
