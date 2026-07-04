"use client";

import { Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import OdevKontrolReportClient from "@/components/odev/OdevKontrolReportClient";
import { OdevKontrolPathsProvider, ADMIN_ODEV_PATHS } from "@/components/odev/OdevKontrolPaths";

function PrintOdevRaporContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const assignmentId = params.id as string;
  const token = searchParams.get("token") || "";
  const orientation = searchParams.get("orientation") === "landscape" ? "landscape" : "portrait";

  if (!token) {
    return (
      <div style={{ padding: 40, fontFamily: "Poppins, sans-serif", color: "#dc2626" }}>
        Geçersiz veya eksik print token.
      </div>
    );
  }

  return (
    <OdevKontrolPathsProvider paths={ADMIN_ODEV_PATHS}>
      <OdevKontrolReportClient
        printMode
        printToken={token}
        assignmentIdOverride={assignmentId}
        initialOrientation={orientation}
      />
    </OdevKontrolPathsProvider>
  );
}

export default function PrintOdevRaporPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40 }}>Rapor yükleniyor…</div>}>
      <PrintOdevRaporContent />
    </Suspense>
  );
}
