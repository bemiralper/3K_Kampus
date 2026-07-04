"use client";

import { Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import OdemePlani from "@/app/odeme-takip/components/OdemePlani";

function PrintOdemePlanContent() {
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
    <OdemePlani
      sozlesmeId={sozlesmeId}
      printMode
      printToken={token}
    />
  );
}

export default function PrintOdemePlanPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40 }}>Ödeme planı yükleniyor…</div>}>
      <PrintOdemePlanContent />
    </Suspense>
  );
}
