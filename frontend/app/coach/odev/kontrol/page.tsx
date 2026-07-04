"use client";

import { Suspense } from "react";
import { OdevKontrolPathsProvider, COACH_ODEV_PATHS } from "@/components/odev/OdevKontrolPaths";
import OdevKontrolListClient from "@/components/odev/OdevKontrolListClient";

function CoachOdevKontrolPageInner() {
  return (
    <OdevKontrolPathsProvider paths={COACH_ODEV_PATHS}>
      <OdevKontrolListClient variant="coach" />
    </OdevKontrolPathsProvider>
  );
}

export default function CoachOdevKontrolPage() {
  return (
    <Suspense fallback={<div className="coach-empty-state"><p>Yükleniyor...</p></div>}>
      <CoachOdevKontrolPageInner />
    </Suspense>
  );
}
