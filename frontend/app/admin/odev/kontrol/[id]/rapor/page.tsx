"use client";

import { OdevKontrolPathsProvider, ADMIN_ODEV_PATHS } from "@/components/odev/OdevKontrolPaths";
import OdevKontrolReportClient from "@/components/odev/OdevKontrolReportClient";

export default function OdevSonucRaporuPage() {
  return (
    <OdevKontrolPathsProvider paths={ADMIN_ODEV_PATHS}>
      <OdevKontrolReportClient />
    </OdevKontrolPathsProvider>
  );
}
