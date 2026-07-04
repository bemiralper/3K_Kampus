"use client";

import { Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import TahsilatMakbuzu from "@/app/odeme-takip/components/TahsilatMakbuzu";

function PrintMakbuzContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const tahsilatId = Number(params.id);
  const token = searchParams.get("token") || "";

  if (!token || !tahsilatId) {
    return (
      <div style={{ padding: 40, fontFamily: "Poppins, sans-serif", color: "#dc2626" }}>
        Geçersiz veya eksik print token.
      </div>
    );
  }

  return (
    <TahsilatMakbuzu
      tahsilatId={tahsilatId}
      printMode
      printToken={token}
    />
  );
}

export default function PrintMakbuzPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40 }}>Makbuz yükleniyor…</div>}>
      <PrintMakbuzContent />
    </Suspense>
  );
}
