"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { useAuth } from "@/lib/contexts/AuthContext";
import { fetchAssignments, fetchKontrolBadge, type ManualAssignment } from "@/lib/resources-api";
import { fetchGorevDashboardOzet, type GorevDashboardOzet } from "@/lib/gorev-api";
import { fetchCoachBirthdays, fetchCoachStudents, type CoachBirthdayItem, type CoachPortalStudent } from "@/lib/coach-api";
import { fetchCoachMeStats, type CoachSelfStats } from "@/lib/coach-profile-api";
import { COACH_BIRTHDAY_PATH } from "@/lib/coach-birthdays";
import { pruneCoachPrefsToStudentIds, type CoachRecentVisit } from "@/lib/coach-students-prefs";
import "./dashboard.css";

function greetingFor(name?: string | null): string {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Günaydın" : hour < 18 ? "İyi günler" : "İyi akşamlar";
  return name ? `${greeting}, ${name}` : greeting;
}

function initials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  return parts.length > 1 ? `${parts[0][0]}${parts.at(-1)?.[0] ?? ""}` : (parts[0] ?? "?").slice(0, 2);
}

function riskLabel(student: CoachPortalStudent): "Yüksek" | "Orta" | null {
  if (student.risk_seviyesi === "high") return "Yüksek";
  if (student.risk_seviyesi === "medium") return "Orta";
  return null;
}

function StudentRow({ student, detail }: { student: CoachPortalStudent; detail?: string }) {
  const risk = riskLabel(student);
  return (
    <Link href={`/coach/ogrenciler/${student.id}`} className="coach-home-student">
      <span className="coach-home-avatar">
        {student.profil_foto ? <img src={student.profil_foto} alt="" /> : initials(student.tam_ad)}
      </span>
      <span className="coach-home-person">
        <strong>{student.tam_ad}</strong>
        <span>{detail || student.sinif || "Sınıf bilgisi yok"}</span>
      </span>
      {risk && <span className={`coach-home-badge is-${student.risk_seviyesi}`}>{risk}</span>}
    </Link>
  );
}

function Icon({ name }: { name: "users" | "check" | "calendar" | "tasks" | "warning" | "book" }) {
  const paths = {
    users: <><circle cx="9" cy="8" r="3" /><path d="M3.5 20v-1.5a4.5 4.5 0 0 1 9 0V20M16 4a3 3 0 0 1 0 6M20.5 20v-1.5a4.5 4.5 0 0 0-3.2-4.3" /></>,
    check: <><path d="m5 12 4 4L19 6" /><circle cx="12" cy="12" r="9" /></>,
    calendar: <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4M16 3v4M4 10h16" /></>,
    tasks: <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="m8 10 1.5 1.5L12 8.5M8 16h7" /></>,
    warning: <><path d="M12 4 3.5 19h17L12 4Z" /><path d="M12 9v4M12 16h.01" /></>,
    book: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H12v17H6.5A2.5 2.5 0 0 0 4 22V5.5ZM20 5.5A2.5 2.5 0 0 0 17.5 3H12v17h5.5A2.5 2.5 0 0 1 20 22V5.5Z" /></>,
  };
  return <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{paths[name]}</svg>;
}

export default function CoachDashboardPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [gorevOzet, setGorevOzet] = useState<GorevDashboardOzet | null>(null);
  const [coachStats, setCoachStats] = useState<CoachSelfStats | null>(null);
  const [students, setStudents] = useState<CoachPortalStudent[]>([]);
  const [birthdays, setBirthdays] = useState<CoachBirthdayItem[]>([]);
  const [overdueItems, setOverdueItems] = useState<ManualAssignment[]>([]);
  const [recentVisits, setRecentVisits] = useState<CoachRecentVisit[]>([]);
  const [dueTodayCount, setDueTodayCount] = useState(0);
  const [overdueCount, setOverdueCount] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    const [badge, gorev, studentList, overdue, birthdayList, stats] = await Promise.all([
      fetchKontrolBadge(), fetchGorevDashboardOzet(), fetchCoachStudents(),
      fetchAssignments({ status: "OVERDUE" }), fetchCoachBirthdays(), fetchCoachMeStats(),
    ]);
    if (badge.success && badge.data) {
      setDueTodayCount(badge.data.due_today ?? badge.data.count ?? 0);
      setOverdueCount(badge.data.overdue ?? 0);
    }
    if (gorev.success && gorev.data) setGorevOzet(gorev.data);
    if (stats.success && stats.data) setCoachStats(stats.data);
    const nextStudents = studentList.success && studentList.data ? studentList.data : [];
    setStudents(nextStudents);
    setBirthdays(birthdayList.success && birthdayList.data ? birthdayList.data : []);
    const raw = overdue.success && overdue.data ? overdue.data as unknown : [];
    const list = Array.isArray(raw) ? raw : Array.isArray((raw as { results?: ManualAssignment[] }).results) ? (raw as { results: ManualAssignment[] }).results : [];
    setOverdueItems(list.slice(0, 4));
    if (list.length) setOverdueCount((count) => Math.max(count, list.length));
    if (user?.id) {
      const { recent } = pruneCoachPrefsToStudentIds(user.id, nextStudents.map((student) => student.id));
      setRecentVisits(recent);
    }
    setLoading(false);
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  const riskStudents = useMemo(() => students
    .filter((student) => student.risk_seviyesi === "high" || student.risk_seviyesi === "medium")
    .sort((a, b) => (b.risk_score ?? 0) - (a.risk_score ?? 0)).slice(0, 4), [students]);
  const followUpStudents = useMemo(() => students.filter((student) => student.needs_meeting).slice(0, 3), [students]);
  const meetings = useMemo(() => students.filter((student) => (student.meeting_today_count ?? 0) > 0).slice(0, 3), [students]);
  const meetingCount = useMemo(() => students.reduce((total, student) => total + (student.meeting_today_count ?? 0), 0)
    || coachStats?.gorusmeler.bugun_planli
    || (gorevOzet?.tip_sayaclari?.OGRENCI_GORUSME ?? 0) + (gorevOzet?.tip_sayaclari?.HAFTALIK_GORUSME ?? 0), [students, coachStats, gorevOzet]);
  const todayBirthdays = birthdays.filter((birthday) => birthday.kalan_gun === 0).slice(0, 3);
  const nextBirthday = birthdays.find((birthday) => birthday.kalan_gun > 0);
  const needsFollowUp = followUpStudents.length;
  const activeStudentCount = coachStats?.ogrenciler.aktif_ogrenci ?? students.length;
  const openWork = dueTodayCount + (gorevOzet?.bugun ?? 0) + meetingCount;

  return (
    <div className="coach-home">
      <section className="coach-home-hero">
        <div className="coach-home-hero-copy">
          <p className="coach-home-eyebrow">Koç çalışma alanı</p>
          <h2>{greetingFor(user?.first_name)}</h2>
          <p>{openWork > 0 ? `Bugün odaklanmanız gereken ${openWork} takip alanı var.` : "Gününüz sakin görünüyor. Öğrencilerinizin durumunu gözden geçirebilirsiniz."}</p>
        </div>
        <div className="coach-home-metrics">
          <Link href="/coach/gorevler" className="coach-home-metric"><strong>{gorevOzet?.bugun ?? 0}</strong><span>Bugün görev</span></Link>
          <Link href="/coach/gorevler?tab=geciken" className="coach-home-metric"><strong>{gorevOzet?.geciken ?? 0}</strong><span>Geciken görev</span></Link>
          <Link href="/coach/gorusmeler" className="coach-home-metric"><strong>{meetingCount}</strong><span>Planlı görüşme</span></Link>
        </div>
      </section>

      <section>
        <div className="coach-home-section-head"><div><h2>Hızlı işlemler</h2><p>Bugünkü akışınızı tek dokunuşla başlatın</p></div></div>
        <div className="coach-home-actions">
          <QuickAction href="/coach/ogrenciler" icon="users" title="Öğrencilerim" detail={`${activeStudentCount} aktif öğrenci`} color="#e0f2fe" ink="#0369a1" />
          <QuickAction href="/coach/yoklama" icon="calendar" title="Yoklama al" detail="Sınıf katılımı" color="#dcfce7" ink="#15803d" />
          <QuickAction href="/coach/gorusmeler" icon="check" title="Görüşmeler" detail={`${meetingCount} planlı görüşme`} color="#f3e8ff" ink="#7e22ce" />
          <QuickAction href="/coach/odev/kontrol" icon="book" title="Ödev kontrol" detail={`${dueTodayCount} bugün kontrol`} color="#fff7ed" ink="#c2410c" />
        </div>
      </section>

      {loading ? <div className="coach-home-loading"><div className="coach-home-skeleton" /><div className="coach-home-skeleton" /><div className="coach-home-skeleton" /><div className="coach-home-skeleton" /></div> : (
        <div className="coach-home-layout">
          <div className="coach-home-main">
            {(riskStudents.length > 0 || needsFollowUp > 0) && (
              <section className="coach-home-card is-alert">
                <SectionHead title="Öncelikli takip" detail={riskStudents.length ? `${riskStudents.length} risk öğrencisi` : `${needsFollowUp} takip hatırlatması`} href="/coach/ogrenciler?filter=risk" />
                {needsFollowUp > 0 && <div className="coach-home-reminder"><span className="coach-home-reminder-icon">!</span><div><strong>Görüşme veya ödev takibi bekleyen öğrenciler</strong><p>{needsFollowUp} öğrencinin yeni bir temas veya ödev kontrolüne ihtiyacı var.</p></div></div>}
                {riskStudents.length > 0 && <div className="coach-home-student-list">{riskStudents.map((student) => <StudentRow key={student.id} student={student} detail={`${student.sinif ?? "Sınıf bilgisi yok"} · ${student.overdue_homework_count ?? 0} geciken ödev`} />)}</div>}
              </section>
            )}

            <section className="coach-home-card">
              <SectionHead title="Bugünün planı" detail={`${openWork} takip alanı`} href="/coach/gorevler" />
              <ul className="coach-home-task-list">
                <TaskRow href="/coach/odev/kontrol" icon="book" title={`${dueTodayCount} ödev kontrolü`} detail={dueTodayCount ? "Kontrol günü bugün olan ödevler" : "Bugün kontrol günü gelen ödev yok"} />
                <TaskRow href="/coach/gorevler" icon="tasks" title={`${gorevOzet?.bugun ?? 0} atanmış görev`} detail={(gorevOzet?.tip_sayaclari?.VELI_GORUSME ?? 0) ? `${gorevOzet?.tip_sayaclari?.VELI_GORUSME} veli araması da planlı` : "Günlük görevlerinizi kontrol edin"} />
                <TaskRow href="/coach/gorusmeler" icon="check" title={`${meetingCount} görüşme`} detail={meetingCount ? "Öğrenci görüşmelerini kayda alın" : "Bugün planlanmış görüşme yok"} />
              </ul>
            </section>

            <section className="coach-home-card">
              <SectionHead title="Geciken ödevler" detail={overdueCount ? `${overdueCount} kontrol bekliyor` : "Takip altında"} href="/coach/odev/kontrol?status=OVERDUE" />
              {overdueItems.length ? <ul className="coach-home-task-list">{overdueItems.map((assignment) => <TaskRow key={assignment.id} href={`/coach/odev/kontrol/${assignment.id}`} icon="warning" title={assignment.student_name || `Öğrenci #${assignment.student}`} detail={assignment.title || "Geciken ödev"} />)}</ul> : <p className="coach-home-empty">Kontrol bekleyen geciken ödev yok.</p>}
            </section>
          </div>

          <aside className="coach-home-side">
            <section className="coach-home-card is-birthday">
              <SectionHead title="Kutlamalar" detail={todayBirthdays.length ? "Bugün doğum günü" : nextBirthday ? nextBirthday.etiket : "Yaklaşan doğum günü yok"} href={COACH_BIRTHDAY_PATH} />
              {todayBirthdays.length ? <div className="coach-home-student-list">{todayBirthdays.map((birthday) => birthday.can_open ? <Link key={birthday.ogrenci_id} href={`/coach/ogrenciler/${birthday.ogrenci_id}`} className="coach-home-student"><span className="coach-home-avatar">🎂</span><span className="coach-home-person"><strong>{birthday.ad_soyad}</strong><span>{birthday.sinif || "Sınıf bilgisi yok"}</span></span><span className="coach-home-badge is-good">{birthday.yas} yaş</span></Link> : <div key={birthday.ogrenci_id} className="coach-home-student"><span className="coach-home-avatar">🎂</span><span className="coach-home-person"><strong>{birthday.ad_soyad}</strong><span>{birthday.sinif || "Sınıf bilgisi yok"}</span></span></div>)}</div> : <p className="coach-home-empty">{nextBirthday ? `${nextBirthday.ad_soyad} ${nextBirthday.etiket.toLocaleLowerCase("tr")}.` : "Bugün doğum günü olan öğrenci yok."}</p>}
            </section>

            <section className="coach-home-card">
              <SectionHead title="Bugünkü görüşmeler" detail={`${meetingCount} planlı`} href="/coach/gorusmeler" />
              {meetings.length ? <div className="coach-home-student-list">{meetings.map((student) => <StudentRow key={student.id} student={student} detail={`${student.meeting_today_count} görüşme · ${student.sinif ?? "Sınıf bilgisi yok"}`} />)}</div> : <p className="coach-home-empty">Bugün planlanmış görüşme bulunmuyor.</p>}
            </section>

            <section className="coach-home-card">
              <SectionHead title="Son ziyaret edilenler" detail="Hızlı erişim" />
              {recentVisits.length ? <div className="coach-home-student-list">{recentVisits.map((visit) => <Link key={visit.id} href={`/coach/ogrenciler/${visit.id}`} className="coach-home-student"><span className="coach-home-avatar">{visit.profil_foto ? <img src={visit.profil_foto} alt="" /> : initials(visit.tam_ad)}</span><span className="coach-home-person"><strong>{visit.tam_ad}</strong><span>{visit.sinif || "Sınıf bilgisi yok"}</span></span></Link>)}</div> : <p className="coach-home-empty">Henüz ziyaret geçmişi yok.</p>}
            </section>
          </aside>
        </div>
      )}
    </div>
  );
}

function SectionHead({ title, detail, href }: { title: string; detail: string; href?: string }) {
  return <div className="coach-home-section-head"><div><h3>{title}</h3><span>{detail}</span></div>{href && <Link href={href} className="coach-home-link">Tümü →</Link>}</div>;
}

function QuickAction({ href, icon, title, detail, color, ink }: { href: string; icon: Parameters<typeof Icon>[0]["name"]; title: string; detail: string; color: string; ink: string }) {
  return <Link href={href} className="coach-home-action"><span className="coach-home-action-icon" style={{ "--action-bg": color, "--action-color": ink } as CSSProperties}><Icon name={icon} /></span><span>{title}<small>{detail}</small></span></Link>;
}

function TaskRow({ href, icon, title, detail }: { href: string; icon: Parameters<typeof Icon>[0]["name"]; title: string; detail: string }) {
  return <li><Link href={href} className="coach-home-task"><span className="coach-home-task-icon"><Icon name={icon} /></span><span><strong>{title}</strong><span>{detail}</span></span></Link></li>;
}
