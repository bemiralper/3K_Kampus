"use client";

import { useState } from "react";

import { useTeacherData } from "@/lib/teacher-web";

type Item = { id: string; category: string; title: string; body: string; occurred_at: string };
type Page = {
  results: Item[];
  categories: { code: string; label: string }[];
};

export default function NotificationsPage() {
  const [category, setCategory] = useState("");
  const notes = useTeacherData<Page>(
    `/api/teacher/notifications/${category ? `?category=${encodeURIComponent(category)}` : ""}`,
  );

  return (
    <>
      <h1>Bildirimler</h1>
      <p className="tp-sub">Kurum duyurusu, program ve özel ders. Salt okunur.</p>
      <div className="tp-actions">
        <button className="tp-button" type="button" aria-pressed={category === ""} onClick={() => setCategory("")}>
          Tümü
        </button>
        {(notes.data?.categories || []).map((item) => (
          <button
            key={item.code}
            className="tp-button"
            type="button"
            aria-pressed={category === item.code}
            onClick={() => setCategory(item.code)}
          >
            {item.label}
          </button>
        ))}
      </div>
      {notes.loading ? <p className="tp-state">Yükleniyor…</p> : null}
      {notes.error ? <p className="tp-error">{notes.error}</p> : null}
      <section className="tp-panel">
        {(notes.data?.results || []).map((item) => (
          <article key={item.id} className="tp-row">
            <div>
              <strong>{item.title}</strong>
              <div>{item.body}</div>
              <div className="tp-muted">{item.occurred_at}</div>
            </div>
          </article>
        ))}
        {notes.data && notes.data.results.length === 0 ? <p className="tp-muted">Bildirim yok.</p> : null}
      </section>
    </>
  );
}
