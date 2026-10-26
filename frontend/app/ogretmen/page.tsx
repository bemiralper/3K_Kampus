"use client";

import Link from "next/link";

import { clock, useTeacher, useTeacherData, WEEKDAYS } from "@/lib/teacher-web";

type Cell = {
  id: number;
  kind: string;
  class_lesson_plan_id: number | null;
  lesson: { name: string | null } | null;
  classroom: { name: string } | null;
  student: { id: number; name: string } | null;
  room: { name: string } | null;
  start: string | null;
  end: string | null;
  session?: { status_label?: string } | null;
};

type HomePayload = {
  date: string;
  weekday: number;
  next: Cell | null;
  today: Cell[];
  counts: { classes: number; lessons: number; private: number };
};

function title(cell: Cell) {
  if (cell.kind === "private") return cell.student?.name || "Özel ders";
  return cell.classroom?.name || "Sınıf";
}

function Lesson({ cell }: { cell: Cell }) {
  const href =
    cell.kind === "private" && cell.student
      ? `/ogretmen/ogrenci/${cell.student.id}`
      : cell.class_lesson_plan_id
        ? `/ogretmen/siniflar/${cell.class_lesson_plan_id}`
        : "/ogretmen/program";
  return (
    <Link className={`tp-card tp-agenda${cell.kind === "private" ? " is-private" : ""}`} href={href}>
      <div className="tp-agenda-time">
        <strong>{clock(cell.start)}</strong>
        <span>{clock(cell.end)}</span>
      </div>
      <div className="tp-agenda-body">
        <strong>{title(cell)}</strong>
        <span>{[cell.lesson?.name, cell.room?.name, cell.session?.status_label].filter(Boolean).join(" · ")}</span>
      </div>
    </Link>
  );
}

export default function TeacherHomePage() {
  const { profileName, termId, termName } = useTeacher();
  const home = useTeacherData<HomePayload>(termId ? `/api/teacher/home/?term_id=${termId}` : null);
  const hour = new Date().getHours();
  const hello = hour < 12 ? "Günaydın" : hour < 18 ? "İyi günler" : "İyi akşamlar";
  const data = home.data;

  return (
    <>
      <h1>
        {hello}
        {profileName ? `, ${profileName.split(" ")[0]}` : ""}
      </h1>
      <p className="tp-sub">
        {data ? `${data.date} · ${WEEKDAYS[data.weekday] || ""}` : "Bugünkü dersler"}
        {termName ? ` · ${termName}` : ""}
      </p>
      {home.loading ? <p className="tp-state">Yükleniyor…</p> : null}
      {home.error ? <p className="tp-error">{home.error}</p> : null}
      {data ? (
        <>
          <div className="tp-counts">
            <span>{data.counts.classes} sınıf</span>
            <span>{data.counts.lessons} ders</span>
            <span>{data.counts.private} özel</span>
          </div>
          {data.next ? (
            <section className="tp-panel">
              <p className="tp-muted">Sıradaki</p>
              <Lesson cell={data.next} />
            </section>
          ) : null}
          <div className="tp-grid">
            {(data.today || []).map((cell) => (
              <Lesson key={`${cell.kind}-${cell.id}`} cell={cell} />
            ))}
          </div>
          {data.today?.length === 0 ? <p className="tp-state">Bugün ders yok.</p> : null}
        </>
      ) : null}
    </>
  );
}
