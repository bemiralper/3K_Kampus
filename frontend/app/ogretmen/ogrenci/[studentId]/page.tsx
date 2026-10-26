"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { useTeacher, useTeacherData } from "@/lib/teacher-web";

type Card = {
  ad: string;
  soyad: string;
  okul_no: string;
  sinif: string;
  grup: string;
  dersler: { ders: string; sinif: string }[];
};

type PrivateRow = {
  student_id: number;
  ad: string;
  soyad: string;
  okul_no: string;
  dersler: string[];
};

type Exams = {
  ders: string;
  groups: { label: string; last_net: number; average_net: number; exams: { name: string; net: number; date: string | null }[] }[];
};

export default function StudentPage({ params }: { params: { studentId: string } }) {
  const studentId = Number(params.studentId);
  const search = useSearchParams();
  const planId = search.get("planId");
  const { termId } = useTeacher();
  const card = useTeacherData<Card>(
    termId && planId
      ? `/api/teacher/students/${studentId}/?term_id=${termId}&plan_id=${planId}`
      : null,
  );
  const exams = useTeacherData<Exams>(
    termId && planId ? `/api/teacher/students/${studentId}/exams/?term_id=${termId}` : null,
  );
  const privates = useTeacherData<{ results: PrivateRow[] }>(
    termId && !planId ? `/api/teacher/private-students/?term_id=${termId}` : null,
  );
  const privateRow = privates.data?.results.find((row) => row.student_id === studentId);

  return (
    <>
      <p className="tp-muted">
        <Link href="/ogretmen/siniflar">Sınıflara dön</Link>
      </p>
      {card.loading || privates.loading ? <p className="tp-state">Yükleniyor…</p> : null}
      {card.error ? <p className="tp-error">{card.error}</p> : null}
      {card.data ? (
        <>
          <h1>
            {card.data.ad} {card.data.soyad}
          </h1>
          <p className="tp-sub">{[card.data.okul_no, card.data.sinif, card.data.grup].filter(Boolean).join(" · ")}</p>
          <div className="tp-grid">
            {card.data.dersler.map((lesson) => (
              <div key={`${lesson.ders}-${lesson.sinif}`} className="tp-card">
                <strong>{lesson.ders}</strong>
                <em>{lesson.sinif}</em>
              </div>
            ))}
          </div>
        </>
      ) : null}
      {privateRow ? (
        <>
          <h1>
            {privateRow.ad} {privateRow.soyad}
          </h1>
          <p className="tp-sub">{[privateRow.okul_no, "Özel ders"].filter(Boolean).join(" · ")}</p>
          <div className="tp-grid">
            {privateRow.dersler.map((lesson) => (
              <div key={lesson} className="tp-card tp-teal">
                <strong>{lesson}</strong>
              </div>
            ))}
          </div>
        </>
      ) : null}
      {(exams.data?.groups || []).map((group) => (
        <section key={group.label} className="tp-panel">
          <strong>
            {group.label} · son net {group.last_net}
          </strong>
          <p className="tp-muted">Ortalama {group.average_net}</p>
          {group.exams.map((exam) => (
            <div key={`${exam.name}-${exam.date}`} className="tp-row">
              <span>{exam.name}</span>
              <strong>{exam.net}</strong>
            </div>
          ))}
        </section>
      ))}
    </>
  );
}
