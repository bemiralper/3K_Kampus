"use client";

import { useCallback, useEffect, useState } from "react";
import {
  downloadHaftalikProgramPdf,
  fetchHaftalikProgram,
  type HaftalikProgram,
} from "@/lib/coaching-api";
import "./haftalik-program.css";

function addDays(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${mm}-${dd}`;
}

function todayIso(): string {
  const date = new Date();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${mm}-${dd}`;
}

export default function CoachHaftalikProgramPage() {
  const [week, setWeek] = useState("");
  const [coachId, setCoachId] = useState<number | null>(null);
  const [program, setProgram] = useState<HaftalikProgram | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");
  const today = todayIso();

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const response = await fetchHaftalikProgram({
      week: week || undefined,
      coachId,
    });
    if (!response.success || !response.data) {
      setProgram(null);
      setError(response.error || "Haftalık program yüklenemedi.");
      setLoading(false);
      return;
    }
    setProgram(response.data);
    setLoading(false);
  }, [week, coachId]);

  useEffect(() => {
    void load();
  }, [load]);

  const shiftWeek = (days: number) => {
    const start = program?.week_start;
    if (!start) return;
    setWeek(addDays(start, days));
  };

  const download = async () => {
    if (!program?.week_start || downloading) return;
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
    <div className="chp-page">
      <header className="coach-page-header">
        <div className="coach-page-header-text">
          <h2>Haftalık Program</h2>
          <p>Ödev kontrol günleri ve görüşme randevuları</p>
        </div>
      </header>

      <div className="chp-toolbar">
        <div className="chp-week">
          <button type="button" className="chp-icon" aria-label="Önceki hafta" onClick={() => shiftWeek(-7)} disabled={!program}>
            ‹
          </button>
          <strong>{program?.week_label || "Bu hafta"}</strong>
          <button type="button" className="chp-icon" aria-label="Sonraki hafta" onClick={() => shiftWeek(7)} disabled={!program}>
            ›
          </button>
          <button type="button" className="chp-today" onClick={() => setWeek("")}>
            Bu hafta
          </button>
        </div>

        {program?.can_pick_coach ? (
          <select
            className="chp-select"
            aria-label="Koç"
            value={program.coach_id ?? ""}
            onChange={(event) => setCoachId(Number(event.target.value) || null)}
          >
            {program.coaches.map((coach) => (
              <option key={coach.id} value={coach.id}>
                {coach.name}
              </option>
            ))}
          </select>
        ) : null}

        <span className="chp-meta">
          {program ? `${program.counts.odev} ödev kontrol · ${program.counts.gorusme} görüşme` : ""}
        </span>
        <button type="button" className="chp-pdf" onClick={() => void download()} disabled={!program?.coach_id || downloading}>
          {downloading ? "Hazırlanıyor…" : "PDF indir"}
        </button>
      </div>

      <div className="chp-legend">
        <span><i className="odev" /> Ödev kontrol</span>
        <span><i /> Görüşme</span>
      </div>

      {error ? <p className="chp-state">{error}</p> : null}
      {loading && !program ? <p className="chp-state">Yükleniyor…</p> : null}

      {program ? (
        <div className="chp-board" aria-label="Haftalık program">
          {program.days.map((day) => (
            <section key={day.date} className={day.date === today ? "chp-day is-today" : "chp-day"}>
              <header>
                <b>{day.short_name}</b>
                <span>{day.day} {day.name}</span>
              </header>
              {day.items.length === 0 ? <p className="chp-empty">Kayıt yok</p> : null}
              {day.items.map((item, index) => (
                <article key={`${day.date}-${index}`} className={`chp-card ${item.kind}`}>
                  <div className="meta">
                    <span>{item.time || "Gün içi"}</span>
                    <span>{item.kind_label}</span>
                  </div>
                  <strong>{item.student}</strong>
                  <p>{item.title}</p>
                  {item.detail ? <small>{item.detail}</small> : null}
                  {item.status_label ? <em>{item.status_label}</em> : null}
                </article>
              ))}
            </section>
          ))}
        </div>
      ) : null}
    </div>
  );
}
