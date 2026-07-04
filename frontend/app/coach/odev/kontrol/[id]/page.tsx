"use client";

import { OdevKontrolPathsProvider, COACH_ODEV_PATHS } from "@/components/odev/OdevKontrolPaths";
import OdevKontrolDetailClient from "@/components/odev/OdevKontrolDetailClient";

export default function CoachOdevDetayPage() {
  return (
    <OdevKontrolPathsProvider paths={COACH_ODEV_PATHS}>
      <OdevKontrolDetailClient />
    </OdevKontrolPathsProvider>
  );
}
