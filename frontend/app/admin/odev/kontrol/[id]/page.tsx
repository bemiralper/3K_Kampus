"use client";

import { OdevKontrolPathsProvider, ADMIN_ODEV_PATHS } from "@/components/odev/OdevKontrolPaths";
import OdevKontrolDetailClient from "@/components/odev/OdevKontrolDetailClient";

export default function OdevDetayPage() {
  return (
    <OdevKontrolPathsProvider paths={ADMIN_ODEV_PATHS}>
      <OdevKontrolDetailClient />
    </OdevKontrolPathsProvider>
  );
}
