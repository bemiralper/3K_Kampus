"use client";

import Link from "next/link";
import { useState } from "react";

import { localIso, roleLabel, teacherRequest, useTeacher, useTeacherData } from "@/lib/teacher-web";

type ClassRow = {
  id: number;
  sinif: { ad: string };
  ders: { ad: string };
  weekly_hours: number;
  rol: string;
};

type StudentRow = {
  student_id: number;
  ad: string;
  soyad: string;
  okul_no: string;
  sinif_ad: string;
};

type Note = {
  id: number;
  session_date: string;
  file_name: string;
};

export default function ClassPage({ params }: { params: { planId: string } }) {
  const planId = Number(params.planId);
  const { termId, scope } = useTeacher();
  const classes = useTeacherData<{ results: ClassRow[] }>(
    termId ? `/api/teacher/classes/?term_id=${termId}` : null,
  );
  const students = useTeacherData<{ results: StudentRow[] }>(
    termId ? `/api/teacher/students/?term_id=${termId}&plan_id=${planId}` : null,
  );
  const notes = useTeacherData<{ results: Note[] }>(
    termId ? `/api/teacher/classes/${planId}/notes/?term_id=${termId}` : null,
  );
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const plan = classes.data?.results.find((row) => row.id === planId);
  const canWrite = plan?.rol === "PRIMARY";

  async function upload(file: File, sessionDate: string) {
    if (!scope || !termId) return;
    setPending(true);
    setMessage("");
    const body = new FormData();
    body.append("term_id", String(termId));
    body.append("session_date", sessionDate);
    body.append("file", file);
    try {
      await teacherRequest(`/api/teacher/classes/${planId}/notes/`, {
        method: "POST",
        body,
        scope,
        headers: { "Idempotency-Key": crypto.randomUUID() },
      });
      setMessage("Ders notu yüklendi.");
      notes.reload();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Not yüklenemedi.");
    } finally {
      setPending(false);
    }
  }

  async function openNote(noteId: number) {
    if (!scope) return;
    const body = await teacherRequest<{ view: string }>(`/api/teacher/notes/${noteId}/link/`, {
      method: "POST",
      body: "{}",
      scope,
    });
    window.open(`/api/teacher/notes/${noteId}/file/?view=${encodeURIComponent(body.view)}`, "_blank", "noopener");
  }

  async function removeNote(noteId: number) {
    if (!scope || !window.confirm("Bu not silinsin mi?")) return;
    setPending(true);
    try {
      await teacherRequest(`/api/teacher/notes/${noteId}/`, { method: "DELETE", scope });
      notes.reload();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Not silinemedi.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <p className="tp-muted">
        <Link href="/ogretmen/siniflar">Sınıflara dön</Link>
      </p>
      <h1>{plan?.sinif.ad || "Sınıf"}</h1>
      <p className="tp-sub">
        {[plan?.ders.ad, plan ? `${plan.weekly_hours} saat` : "", plan ? roleLabel(plan.rol) : ""].filter(Boolean).join(" · ")}
      </p>
      {students.error ? <p className="tp-error">{students.error}</p> : null}
      <section className="tp-panel">
        <div className="tp-actions">
          <strong>Ders notları</strong>
          <span className="tp-pill">{notes.data?.results.length || 0}</span>
        </div>
        {(notes.data?.results || []).map((note) => (
          <div key={note.id} className="tp-row">
            <div>
              <strong>{note.file_name}</strong>
              <div className="tp-muted">{note.session_date}</div>
            </div>
            <div className="tp-actions">
              <button className="tp-button" type="button" onClick={() => openNote(note.id)}>
                Aç
              </button>
              {canWrite ? (
                <button className="tp-button danger" type="button" disabled={pending} onClick={() => removeNote(note.id)}>
                  Sil
                </button>
              ) : null}
            </div>
          </div>
        ))}
        {canWrite ? (
          <form
            className="tp-actions"
            onSubmit={(event) => {
              event.preventDefault();
              const form = event.currentTarget;
              const file = (form.elements.namedItem("file") as HTMLInputElement).files?.[0];
              const sessionDate = (form.elements.namedItem("session_date") as HTMLInputElement).value;
              if (file && sessionDate) upload(file, sessionDate);
            }}
          >
            <input className="tp-field" name="session_date" type="date" required defaultValue={localIso(new Date())} />
            <input className="tp-field" name="file" type="file" accept="application/pdf,image/png,image/jpeg,image/webp" required />
            <button className="tp-button" type="submit" disabled={pending}>
              Yükle
            </button>
          </form>
        ) : null}
        {message ? <p>{message}</p> : null}
      </section>
      <div className="tp-grid">
        {(students.data?.results || []).map((student) => (
          <Link
            key={student.student_id}
            className="tp-card"
            href={`/ogretmen/ogrenci/${student.student_id}?planId=${planId}`}
          >
            <strong>
              {student.ad} {student.soyad}
            </strong>
            <em>{[student.okul_no, student.sinif_ad].filter(Boolean).join(" · ")}</em>
          </Link>
        ))}
      </div>
    </>
  );
}
