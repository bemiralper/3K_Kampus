"use client";

import { useState } from "react";
import Link from "next/link";

import { clock, useTeacher, useTeacherData } from "@/lib/teacher-web";

type Cell = {
  id: number;
  day_id: number;
  kind: string;
  class_lesson_plan_id: number | null;
  lesson: { name: string | null } | null;
  classroom: { name: string } | null;
  room: { name: string } | null;
  student: { id: number; name: string } | null;
  start: string | null;
  end: string | null;
};

type Schedule = {
  days: { id: number; short_name: string; name: string }[];
  slots: { id: number | string; start: string | null; end: string | null }[];
  cells: Cell[];
};

const TODAY = ["pzt", "sal", "çar", "per", "cum", "cts", "paz"];

function isToday(day: { short_name: string; name: string }) {
  const key = (day.short_name || day.name || "").toLocaleLowerCase("tr-TR").slice(0, 3);
  return key === TODAY[(new Date().getDay() + 6) % 7];
}

function lessonHref(cell: Cell) {
  if (cell.kind === "private" && cell.student) return `/ogretmen/ogrenci/${cell.student.id}`;
  if (cell.class_lesson_plan_id) return `/ogretmen/siniflar/${cell.class_lesson_plan_id}`;
  return "/ogretmen/program";
}

function lessonTitle(cell: Cell) {
  if (cell.kind === "private") return cell.student?.name || "Özel ders";
  return cell.classroom?.name || "Sınıf";
}

export default function ProgramPage() {
  const { termId, termName } = useTeacher();
  const schedule = useTeacherData<Schedule>(termId ? `/api/teacher/schedule/?term_id=${termId}` : null);
  const data = schedule.data;
  const columns = data?.days.length ?? 0;
  const [dayId, setDayId] = useState<number | null>(null);
  const selected = data?.days.find((day) => day.id === dayId) || data?.days.find(isToday) || data?.days[0];
  const lessons = (data?.cells || [])
    .filter((cell) => selected && cell.day_id === selected.id)
    .sort((a, b) => clock(a.start).localeCompare(clock(b.start)));

  return (
    <>
      <h1>Program</h1>
      <p className="tp-sub">{termName || "Haftalık dersler"}</p>
      {schedule.loading ? <p className="tp-state">Yükleniyor…</p> : null}
      {schedule.error ? <p className="tp-error">{schedule.error}</p> : null}
      {data && columns === 0 ? <p className="tp-state">Bu dönemde program yok.</p> : null}
      {data && columns > 0 && selected ? (
        <>
          <div className="tp-agenda-view">
            <div className="tp-day-scroll" role="group" aria-label="Günler">
              {data.days.map((day) => (
                <button
                  key={day.id}
                  type="button"
                  aria-pressed={day.id === selected.id}
                  onClick={() => setDayId(day.id)}
                >
                  {day.name || day.short_name}
                </button>
              ))}
            </div>
            {lessons.length === 0 ? <p className="tp-state">Bu gün ders yok.</p> : null}
            <div className="tp-grid">
              {lessons.map((cell) => (
                <Link
                  key={cell.id}
                  href={lessonHref(cell)}
                  className={`tp-card tp-agenda${cell.kind === "private" ? " is-private" : ""}`}
                >
                  <div className="tp-agenda-time">
                    <strong>{clock(cell.start)}</strong>
                    <span>{clock(cell.end)}</span>
                  </div>
                  <div className="tp-agenda-body">
                    <strong>{lessonTitle(cell)}</strong>
                    <span>{[cell.lesson?.name, cell.room?.name].filter(Boolean).join(" · ")}</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
          <div className="tp-week-view">
            <div className="tp-cal-scroll">
              <div className="tp-cal" style={{ gridTemplateColumns: `76px repeat(${columns}, minmax(0, 1fr))` }}>
                <div className="tp-cal-corner" />
                {data.days.map((day) => (
                  <div key={day.id} className={`tp-cal-day${isToday(day) ? " is-today" : ""}`}>
                    {day.name || day.short_name}
                  </div>
                ))}
                {data.slots.map((slot) => (
                  <div key={slot.id} className="tp-cal-row">
                    <div className="tp-cal-time">
                      <strong>{clock(slot.start)}</strong>
                      <span>{clock(slot.end)}</span>
                    </div>
                    {data.days.map((day) => {
                      const items = data.cells.filter(
                        (item) => item.day_id === day.id && clock(item.start) === clock(slot.start),
                      );
                      return (
                        <div key={`${slot.id}-${day.id}`} className={`tp-cal-slot${isToday(day) ? " is-today" : ""}`}>
                          {items.map((cell) => (
                            <Link
                              key={cell.id}
                              href={lessonHref(cell)}
                              className={`tp-cal-card${cell.kind === "private" ? " is-private" : ""}`}
                            >
                              <strong>{lessonTitle(cell)}</strong>
                              <span>{[cell.lesson?.name, cell.room?.name].filter(Boolean).join(" · ")}</span>
                              {cell.kind === "private" ? <em>Özel</em> : null}
                            </Link>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}
