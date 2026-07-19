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
