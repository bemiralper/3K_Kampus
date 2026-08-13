"use client";

import { Suspense } from "react";
import { OdevKontrolPathsProvider, COACH_ODEV_PATHS } from "@/components/odev/OdevKontrolPaths";
import OdevKontrolDetailClient from "@/components/odev/OdevKontrolDetailClient";

export default function CoachOdevDetayPage() {
  return (
    <OdevKontrolPathsProvider paths={COACH_ODEV_PATHS}>
      <Suspense fallback={<div className="coach-empty-state"><p>Yükleniyor…</p></div>}>
        <OdevKontrolDetailClient variant="coach" />
      </Suspense>
    </OdevKontrolPathsProvider>
  );
}
