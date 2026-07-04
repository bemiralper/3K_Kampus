"use client";

import { Suspense } from "react";
import { OdevKontrolPathsProvider, ADMIN_ODEV_PATHS } from "@/components/odev/OdevKontrolPaths";
import OdevKontrolListClient from "@/components/odev/OdevKontrolListClient";

function OdevKontrolPageInner() {
  return (
    <OdevKontrolPathsProvider paths={ADMIN_ODEV_PATHS}>
      <OdevKontrolListClient variant="admin" />
    </OdevKontrolPathsProvider>
  );
}

export default function OdevKontrolPage() {
  return (
    <Suspense fallback={<div style={{ padding: 60, textAlign: "center" }}>Yükleniyor...</div>}>
      <OdevKontrolPageInner />
    </Suspense>
  );
}
