"use client";

import { createContext, useContext, type ReactNode } from "react";

export type OdevKontrolPaths = {
  list: string;
  newAssignment: string | null;
  detail: (id: number | string) => string;
  report: (id: number | string) => string;
  studentProfile: (id: number | string) => string;
};

export const ADMIN_ODEV_PATHS: OdevKontrolPaths = {
  list: "/admin/odev/kontrol",
  newAssignment: "/admin/odev/ver",
  detail: (id) => `/admin/odev/kontrol/${id}`,
  report: (id) => `/admin/odev/kontrol/${id}/rapor`,
  studentProfile: (id) => `/ogrenciler/${id}`,
};

export const COACH_ODEV_PATHS: OdevKontrolPaths = {
  list: "/coach/odev/kontrol",
  newAssignment: "/coach/odev/ver",
  detail: (id) => `/coach/odev/kontrol/${id}`,
  report: (id) => `/coach/odev/kontrol/${id}/rapor`,
  studentProfile: (id) => `/coach/ogrenciler/${id}`,
};

const OdevKontrolPathsContext = createContext<OdevKontrolPaths | null>(null);

export function OdevKontrolPathsProvider({
  paths,
  children,
}: {
  paths: OdevKontrolPaths;
  children: ReactNode;
}) {
  return (
    <OdevKontrolPathsContext.Provider value={paths}>
      {children}
    </OdevKontrolPathsContext.Provider>
  );
}

export function useOdevKontrolPaths(): OdevKontrolPaths {
  const ctx = useContext(OdevKontrolPathsContext);
  if (!ctx) {
    throw new Error("useOdevKontrolPaths must be used within OdevKontrolPathsProvider");
  }
  return ctx;
}

/** Kontrolden Ödev Ver'e: öğrenci kilitli, isteğe bağlı ders/kitap ön seçimi (tek başlık, çoklu ders). */
export function buildNewAssignmentFromKontrolHref(
  basePath: string,
  opts: {
    studentId: number;
    returnPath: string;
    lessonId?: number | null;
    bookId?: number | null;
    /** Kaynak kontrol ödevi — kayıt sonrası rapor WhatsApp için */
    kontrolAssignmentId?: number | null;
    /** Kontrol tamamen bittiyse kayıt sonrası rapor mesajı açılır */
    kontrolDone?: boolean;
  },
): string {
  const params = new URLSearchParams();
  params.set("student", String(opts.studentId));
  params.set("locked", "1");
  // `return` bazı ortamlarda yutulabiliyor; return_to birincil
  params.set("return_to", opts.returnPath);
  params.set("return", opts.returnPath);
  params.set("from", "kontrol");
  if (opts.lessonId != null && opts.lessonId > 0) {
    params.set("lesson", String(opts.lessonId));
  }
  if (opts.bookId != null && opts.bookId > 0) {
    params.set("book", String(opts.bookId));
  }
  if (opts.kontrolAssignmentId != null && opts.kontrolAssignmentId > 0) {
    params.set("kontrol_id", String(opts.kontrolAssignmentId));
  }
  if (opts.kontrolDone) {
    params.set("kontrol_done", "1");
  }
  return `${basePath}?${params.toString()}`;
}
