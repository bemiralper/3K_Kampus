"use client";

import { useMemo, useState } from "react";

import {
  clock,
  dateForWeekday,
  teacherRequest,
  useTeacher,
  useTeacherData,
} from "@/lib/teacher-web";

type ClassRow = { id: number; sinif: { ad: string }; ders: { ad: string }; rol: string };
type Cell = {
  id: number;
  day_id: number;
  kind: string;
  class_lesson_plan_id: number | null;
  start: string | null;
  lesson: { name: string | null } | null;
};
type Topic = { id: number; topic: { name: string } | null; note: string };
type Catalog = { id: number; name: string; code: string };

export default function TopicsPage() {
  const { termId, scope } = useTeacher();
  const classes = useTeacherData<{ results: ClassRow[] }>(
    termId ? `/api/teacher/classes/?term_id=${termId}` : null,
  );
  const schedule = useTeacherData<{ cells: Cell[] }>(
    termId ? `/api/teacher/schedule/?term_id=${termId}` : null,
  );
  const [planId, setPlanId] = useState<number | null>(null);
  const [cellId, setCellId] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const plan = classes.data?.results.find((row) => row.id === planId) || classes.data?.results[0];
  const activePlan = planId ?? plan?.id ?? null;
  const cells = useMemo(
    () =>
      (schedule.data?.cells || []).filter(
        (cell) => cell.kind === "class" && cell.class_lesson_plan_id === activePlan && cell.id > 0,
      ),
    [schedule.data, activePlan],
  );
  const cell = cells.find((item) => item.id === cellId) || cells[0];
  const sessionDate = cell ? dateForWeekday(cell.day_id) : "";
  const topics = useTeacherData<{ results: Topic[] }>(
    termId && activePlan && cell
      ? `/api/teacher/classes/${activePlan}/topics/?term_id=${termId}&program_grid_cell_id=${cell.id}&session_date=${sessionDate}`
      : null,
  );
  const catalog = useTeacherData<{ results: Catalog[] }>(
    termId && activePlan ? `/api/teacher/classes/${activePlan}/topic-catalog/?term_id=${termId}` : null,
  );

  async function save(form: HTMLFormElement) {
    if (!scope || !termId || !activePlan || !cell) return;
    const topicRaw = (form.elements.namedItem("topic_id") as HTMLSelectElement).value;
    const note = (form.elements.namedItem("note") as HTMLTextAreaElement).value.trim();
    setPending(true);
    setMessage("");
    try {
      await teacherRequest(`/api/teacher/classes/${activePlan}/topics/`, {
        method: "POST",
        scope,
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({
          term_id: termId,
          session_date: dateForWeekday(cell.day_id),
          program_grid_cell_id: cell.id,
          topic_id: topicRaw ? Number(topicRaw) : null,
          outcome_ids: [],
          note,
        }),
      });
      setMessage("Konu kaydedildi.");
      topics.reload();
      form.reset();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Konu kaydedilemedi.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <h1>Konular</h1>
      <p className="tp-sub">Bu haftanın dersine işlenen konuyu yazın.</p>
      {classes.loading ? <p className="tp-state">Yükleniyor…</p> : null}
      <label>
        Sınıf
        <select
          className="tp-select"
          value={activePlan ?? ""}
          onChange={(event) => {
            setPlanId(Number(event.target.value));
            setCellId(null);
          }}
        >
          {(classes.data?.results || []).map((row) => (
            <option key={row.id} value={row.id}>
              {row.sinif.ad} · {row.ders.ad}
            </option>
          ))}
        </select>
      </label>
      <label>
        Ders
        <select
          className="tp-select"
          value={cell?.id ?? ""}
          onChange={(event) => {
            const next = cells.find((item) => item.id === Number(event.target.value));
            setCellId(next?.id ?? null);
          }}
        >
          {cells.map((item) => (
            <option key={`${item.day_id}-${item.id}`} value={item.id}>
              {clock(item.start)} · {item.lesson?.name || "Ders"}
            </option>
          ))}
        </select>
      </label>
      {topics.error ? <p className="tp-error">{topics.error}</p> : null}
      <section className="tp-panel">
        {(topics.data?.results || []).map((row) => (
          <div key={row.id} className="tp-row">
            <div>
              <strong>{row.topic?.name || "Not"}</strong>
              <div className="tp-muted">{row.note}</div>
            </div>
          </div>
        ))}
        {topics.data && topics.data.results.length === 0 ? <p className="tp-muted">Bu ders için kayıt yok.</p> : null}
        {plan?.rol === "PRIMARY" && cell ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              save(event.currentTarget);
            }}
          >
            <select className="tp-select" name="topic_id" defaultValue="">
              <option value="">Konu seçin</option>
              {(catalog.data?.results || []).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.code ? `${item.code} · ` : ""}
                  {item.name}
                </option>
              ))}
            </select>
            <textarea className="tp-field" name="note" rows={3} placeholder="Kısa not" />
            <button className="tp-button" type="submit" disabled={pending}>
              Kaydet
            </button>
          </form>
        ) : null}
        {message ? <p>{message}</p> : null}
      </section>
    </>
  );
}
