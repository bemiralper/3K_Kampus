"use client";

import Link from "next/link";

import { roleLabel, useTeacher, useTeacherData } from "@/lib/teacher-web";

type ClassRow = {
  id: number;
  sinif: { ad: string };
  ders: { ad: string };
  weekly_hours: number;
  rol: string;
  groups: { name: string }[];
};

type PrivateRow = {
  student_id: number;
  ad: string;
  soyad: string;
  dersler: string[];
};

export default function ClassesPage() {
  const { termId } = useTeacher();
  const classes = useTeacherData<{ results: ClassRow[] }>(
    termId ? `/api/teacher/classes/?term_id=${termId}` : null,
  );
  const privates = useTeacherData<{ results: PrivateRow[] }>(
    termId ? `/api/teacher/private-students/?term_id=${termId}` : null,
  );
  const classRows = classes.data?.results || [];
  const privateRows = privates.data?.results || [];

  return (
    <>
      <h1>Sınıflarım</h1>
      <p className="tp-sub">Sınıflar ve özel ders öğrencileri</p>
      <div className="tp-counts">
        <span>{classRows.length} sınıf</span>
        <span>{privateRows.length} özel</span>
      </div>
      {classes.loading || privates.loading ? <p className="tp-state">Yükleniyor…</p> : null}
      {classes.error ? <p className="tp-error">{classes.error}</p> : null}
      <div className="tp-grid">
        {classRows.map((row) => (
          <Link key={row.id} href={`/ogretmen/siniflar/${row.id}`} className="tp-card">
            <strong>{row.sinif.ad}</strong>
            <span className="tp-card-lesson">{row.ders.ad}</span>
            <span className="tp-card-foot">
              <span className="tp-pill">{roleLabel(row.rol)}</span>
              <em>{row.weekly_hours} saat</em>
              {row.groups.length ? <em>{row.groups.map((group) => group.name).join(", ")}</em> : null}
            </span>
          </Link>
        ))}
      </div>
      {privateRows.length > 0 ? (
        <>
          <h2>Özel ders</h2>
          <div className="tp-grid">
            {privateRows.map((row) => (
              <Link key={row.student_id} href={`/ogretmen/ogrenci/${row.student_id}`} className="tp-card tp-teal">
                <span className="tp-pill">Özel ders</span>
                <strong>
                  {row.ad} {row.soyad}
                </strong>
                <em>{row.dersler.join(", ")}</em>
              </Link>
            ))}
          </div>
        </>
      ) : null}
    </>
  );
}
