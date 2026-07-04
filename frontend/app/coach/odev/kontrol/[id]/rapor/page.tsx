"use client";

import { OdevKontrolPathsProvider, COACH_ODEV_PATHS } from "@/components/odev/OdevKontrolPaths";
import OdevKontrolReportClient from "@/components/odev/OdevKontrolReportClient";

export default function CoachOdevSonucRaporuPage() {
  return (
    <OdevKontrolPathsProvider paths={COACH_ODEV_PATHS}>
      <OdevKontrolReportClient />
    </OdevKontrolPathsProvider>
  );
}
