"use client";

import { Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import SozlesmeBelgesi from "@/app/odeme-takip/components/SozlesmeBelgesi";

function PrintSozlesmeContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const sozlesmeId = Number(params.id);
  const token = searchParams.get("token") || "";

  if (!token || !sozlesmeId) {
    return (
      <div style={{ padding: 40, fontFamily: "Poppins, sans-serif", color: "#dc2626" }}>
        Geçersiz veya eksik print token.
      </div>
    );
  }

  return (
    <SozlesmeBelgesi
      sozlesmeId={sozlesmeId}
      printMode
      printToken={token}
    />
  );
}

export default function PrintSozlesmePage() {
  return (
    <Suspense fallback={<div style={{ padding: 40 }}>Sözleşme yükleniyor…</div>}>
      <PrintSozlesmeContent />
    </Suspense>
  );
}
