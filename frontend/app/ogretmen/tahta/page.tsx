"use client";

import { useState } from "react";

import { teacherRequest, useTeacher, useTeacherData } from "@/lib/teacher-web";

type Board = { id: string; state: string; mine: boolean; lesson: string };
type ClassRow = { id: number; sinif: { ad: string }; ders: { ad: string } };

export default function BoardPage() {
  const { termId, scope } = useTeacher();
  const boards = useTeacherData<{ results: Board[] }>("/api/teacher/boards/");
  const classes = useTeacherData<{ results: ClassRow[] }>(
    termId ? `/api/teacher/classes/?term_id=${termId}` : null,
  );
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const mine = boards.data?.results.find((row) => row.mine && row.state === "busy");

  async function run(task: () => Promise<unknown>, ok: string) {
    setPending(true);
    setMessage("");
    try {
      await task();
      setMessage(ok);
      boards.reload();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "İşlem tamamlanamadı.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <h1>Akıllı tahta</h1>
      <p className="tp-sub">Tahtadaki 8 haneli kodu girin. Bu ekran ders adını tahtaya gönderir.</p>
      {boards.error ? <p className="tp-error">{boards.error}</p> : null}
      {mine ? (
        <section className="tp-panel">
          <strong>{mine.lesson || "Ders seçin"}</strong>
          {(classes.data?.results || []).map((row) => (
            <button
              key={row.id}
              className="tp-card"
              type="button"
              disabled={pending || !scope || termId == null}
              onClick={() =>
                run(
                  () =>
                    teacherRequest(`/api/teacher/boards/${mine.id}/show/`, {
                      method: "POST",
                      scope,
                      body: JSON.stringify({ term_id: termId, plan_id: row.id }),
                    }),
                  "Ders tahtada açıldı.",
                )
              }
            >
              {row.sinif.ad} · {row.ders.ad}
            </button>
          ))}
          <button
            className="tp-button danger"
            type="button"
            disabled={pending}
            onClick={() =>
              run(
                () => teacherRequest(`/api/teacher/boards/${mine.id}/end/`, { method: "POST", scope, body: "{}" }),
                "Bağlantı sonlandı.",
              )
            }
          >
            Bağlantıyı bitir
          </button>
        </section>
      ) : (
        <form
          className="tp-panel"
          onSubmit={(event) => {
            event.preventDefault();
            run(
              () =>
                teacherRequest("/api/teacher/boards/", {
                  method: "POST",
                  scope,
                  body: JSON.stringify({ code: code.trim().toUpperCase() }),
                }),
              "Tahtaya bağlandı.",
            ).then(() => setCode(""));
          }}
        >
          <input
            className="tp-field"
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            maxLength={8}
            placeholder="Eşleştirme kodu"
            aria-label="Eşleştirme kodu"
          />
          <button className="tp-button" type="submit" disabled={pending || code.trim().length !== 8}>
            Tahtaya bağlan
          </button>
        </form>
      )}
      {message ? <p>{message}</p> : null}
    </>
  );
}
