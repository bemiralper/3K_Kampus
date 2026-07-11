"use client";

import { Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import PersonelSozlesmeBelgesi from "@/app/admin/personel/sozlesmeler/components/PersonelSozlesmeBelgesi";

function PrintContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const sozlesmeId = Number(params.id);
  const token = searchParams.get("token") || "";

  if (!token || !sozlesmeId) {
    return (
      <div style={{ padding: 40, fontFamily: "system-ui", color: "#dc2626" }}>
        Geçersiz veya eksik print token.
      </div>
    );
  }

  return <PersonelSozlesmeBelgesi sozlesmeId={sozlesmeId} printToken={token} />;
}

export default function PrintPersonelSozlesmePage() {
  return (
    <Suspense fallback={<div style={{ padding: 40 }}>Sözleşme yükleniyor…</div>}>
      <div data-pdf-ready="true">
        <PrintContent />
      </div>
    </Suspense>
  );
}
