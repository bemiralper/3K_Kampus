"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  downloadHaftalikProgramPdf,
  fetchHaftalikProgram,
  type HaftalikProgram,
  type HaftalikProgramItem,
} from "@/lib/coaching-api";

function todayIso(): string {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function itemLine(item: HaftalikProgramItem): string {
  const when = item.time || "Gün içi";
  return `${when} · ${item.student}`;
}

export default function CoachDashboardProgram() {
  const [coachId, setCoachId] = useState<number | null>(null);
  const [program, setProgram] = useState<HaftalikProgram | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");
  const today = todayIso();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    void fetchHaftalikProgram({ coachId }).then((response) => {
      if (cancelled) return;
      if (!response.success || !response.data) {
        setProgram(null);
        setError(response.error || "Program yüklenemedi.");
      } else {
        setProgram(response.data);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [coachId]);

  const todayDay = program?.days.find((day) => day.date === today);
  const todayItems = todayDay?.items ?? [];

  const download = async () => {
    if (!program?.week_start || !program.coach_id || downloading) return;
    setDownloading(true);
    setError("");
    try {
      await downloadHaftalikProgramPdf({
        week: program.week_start,
        coachId: program.coach_id,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "PDF indirilemedi.");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <section className="coach-home-card coach-dash-program">
      <div className="coach-home-section-head">
        <div>
          <h2>Programım</h2>
          <span>
            {program
              ? (program.can_pick_coach ? program.week_label : `${program.week_label} · ${program.coach_name}`)
              : "Bu hafta"}
          </span>
        </div>
        <div className="coach-dash-program-actions">
          {program?.can_pick_coach && program.coaches.length > 0 ? (
            <select
              className="coach-dash-coach"
              aria-label="Koç"
              value={program.coach_id ?? ""}
              onChange={(event) => setCoachId(Number(event.target.value) || null)}
            >
              {program.coaches.map((coach) => (
                <option key={coach.id} value={coach.id}>{coach.name}</option>
              ))}
            </select>
          ) : null}
          <button type="button" className="coach-dash-pdf" onClick={() => void download()} disabled={!program?.coach_id || downloading}>
            {downloading ? "Hazırlanıyor…" : "PDF"}
          </button>
          <Link href="/coach/haftalik-program" className="coach-home-link">Tüm hafta →</Link>
        </div>
      </div>

      {error ? <p className="coach-dash-note">{error}</p> : null}
      {loading && !program ? <p className="coach-home-empty">Program yükleniyor…</p> : null}

      {program ? (
        <>
          <div className="coach-dash-today">
            <div className="coach-dash-today-head">
              <strong>Bugün</strong>
              <span>{todayDay ? `${todayDay.day} ${todayDay.name}` : ""} · {todayItems.length} kayıt</span>
            </div>
            {todayItems.length === 0 ? (
              <p className="coach-home-empty">Bugün ödev kontrolü veya görüşme yok.</p>
            ) : (
              <ul className="coach-dash-today-list">
                {todayItems.map((item, index) => (
                  <li key={`${item.kind}-${index}`}>
                    <Link href={item.kind === "odev" ? "/coach/odev/kontrol" : "/coach/gorusmeler"} className={`coach-dash-item ${item.kind}`}>
                      <span className="coach-dash-when">{item.time || "Gün içi"}</span>
                      <span>
                        <strong>{item.student}</strong>
                        <span>{item.kind_label}{item.title ? ` · ${item.title}` : ""}</span>
                      </span>
                      {item.status_label ? <em>{item.status_label}</em> : null}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="coach-dash-week" aria-label="Haftalık program">
            {program.days.map((day) => (
              <article key={day.date} className={day.date === today ? "coach-dash-day is-today" : "coach-dash-day"}>
                <header>
                  <b>{day.short_name}</b>
                  <span>{day.day}</span>
                </header>
                {day.items.length === 0 ? <p>Boş</p> : null}
                {day.items.slice(0, 3).map((item, index) => (
                  <p key={`${day.date}-${index}`} className={item.kind} title={itemLine(item)}>
                    {item.student}
                  </p>
                ))}
                {day.items.length > 3 ? <p className="more">+{day.items.length - 3}</p> : null}
              </article>
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}
